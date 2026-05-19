import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler, securityHeaders } from './middleware/error';
import { loggerMiddleware } from './middleware/logger';
import { workspaceIdSchema, createNoteSchema, createWorkspaceSchema, authRequestSchema, presignRequestSchema, completeUploadSchema, initiateMultipartSchema, signPartSchema, completeMultipartSchema, allowedMimeTypes, sanitizeFilename } from './utils/validation';
import { cleanupExpiredWorkspaces } from './services/cleanup';
import { trackEvent, AnalyticsEvent } from './services/analytics';
import { HTTPException } from 'hono/http-exception';
import { sign, verify } from 'hono/jwt';
import { AwsClient } from 'aws4fetch';
import { XMLParser } from 'fast-xml-parser';
// Lightweight In-Memory Rate Limiter
class RateLimiter {
    static attempts = new Map();
    static check(key, limit, windowMs) {
        const now = Date.now();
        const record = this.attempts.get(key);
        if (!record || now > record.resetAt) {
            this.attempts.set(key, { count: 1, resetAt: now + windowMs });
            return true;
        }
        if (record.count >= limit)
            return false;
        record.count++;
        return true;
    }
}
// Crypto Helpers
async function hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
function getAwsClient(env) {
    if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_ACCOUNT_ID) {
        throw new Error('R2 S3 credentials are not configured');
    }
    return new AwsClient({
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        region: 'auto',
        service: 's3',
    });
}
// Auth Helper
async function checkAuth(c, workspace) {
    if (!workspace.password_hash)
        return true;
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer '))
        return false;
    const token = authHeader.split(' ')[1];
    try {
        const payload = await verify(token, c.env.JWT_SECRET || 'fallback-secret', 'HS256');
        return payload.workspaceId === workspace.id;
    }
    catch {
        return false;
    }
}
const app = new Hono();
app.use('*', loggerMiddleware);
app.use('*', cors());
app.use('*', securityHeaders);
app.onError(errorHandler);
app.get('/health', (c) => c.json({ status: 'ok', env: c.env.APP_ENV }));
// Check Workspace Existence
app.get('/api/workspaces/:id/exists', async (c) => {
    const id = c.req.param('id');
    if (!workspaceIdSchema.safeParse(id).success) {
        return c.json({ exists: false }, 400);
    }
    const workspace = await c.env.DB.prepare('SELECT expires_at, password_hash FROM workspaces WHERE id = ?').bind(id).first();
    if (!workspace)
        return c.json({ exists: false }, 404);
    const isExpired = new Date(workspace.expires_at) < new Date();
    return c.json({
        exists: !isExpired,
        isProtected: !!workspace.password_hash
    });
});
app.get('/ready', async (c) => {
    // Check DB and Storage availability
    try {
        await c.env.DB.prepare('SELECT 1').run();
        return c.json({ status: 'ready' });
    }
    catch (err) {
        throw new HTTPException(503, { message: 'Service Unavailable' });
    }
});
// Create Workspace
app.post('/api/workspaces', async (c) => {
    const ip = c.req.header('cf-connecting-ip') || 'unknown';
    if (!RateLimiter.check(`create-${ip}`, 10, 3600000)) { // 10 per hour
        throw new HTTPException(429, { message: 'Too many workspaces created' });
    }
    const body = await c.req.json().catch(() => ({}));
    const result = createWorkspaceSchema.safeParse(body);
    if (!result.success) {
        throw new HTTPException(400, { message: 'Invalid input' });
    }
    const { id: customId, password } = result.data;
    let id = customId || crypto.randomUUID().split('-')[0];
    const hasCustomId = !!customId;
    let passwordHash = null;
    let salt = null;
    if (password) {
        salt = crypto.randomUUID();
        passwordHash = await hashPassword(password, salt);
    }
    const now = new Date();
    const expireMinutes = parseInt(c.env.WORKSPACE_EXPIRE_MINUTES || '1440');
    const expiresAt = new Date(now.getTime() + expireMinutes * 60000);
    // If custom ID provided, check if it's already active
    if (hasCustomId) {
        const existing = await c.env.DB.prepare('SELECT expires_at FROM workspaces WHERE id = ?').bind(id).first();
        if (existing) {
            const existingExpiry = new Date(existing.expires_at);
            if (existingExpiry > now) {
                throw new HTTPException(409, { message: 'Workspace ID already exists and is active' });
            }
            else {
                // Recreate expired custom workspace
                await c.env.DB.prepare('DELETE FROM workspace_items WHERE workspace_id = ?').bind(id).run();
                await c.env.DB.prepare('UPDATE workspaces SET created_at = ?, expires_at = ?, password_hash = ?, salt = ? WHERE id = ?')
                    .bind(now.toISOString(), expiresAt.toISOString(), passwordHash, salt, id)
                    .run();
            }
        }
        else {
            // New custom workspace
            await c.env.DB.prepare('INSERT INTO workspaces (id, created_at, expires_at, password_hash, salt) VALUES (?, ?, ?, ?, ?)')
                .bind(id, now.toISOString(), expiresAt.toISOString(), passwordHash, salt)
                .run();
        }
    }
    else {
        // New random workspace
        await c.env.DB.prepare('INSERT INTO workspaces (id, created_at, expires_at, password_hash, salt) VALUES (?, ?, ?, ?, ?)')
            .bind(id, now.toISOString(), expiresAt.toISOString(), passwordHash, salt)
            .run();
    }
    trackEvent(AnalyticsEvent.WORKSPACE_CREATED, { id, isCustom: hasCustomId, isProtected: !!password });
    return c.json({ id, expiresAt: expiresAt.toISOString(), isProtected: !!password }, 201);
});
// Authenticate Workspace
app.post('/api/workspaces/:id/auth', async (c) => {
    const id = c.req.param('id');
    const ip = c.req.header('cf-connecting-ip') || 'unknown';
    if (!RateLimiter.check(`auth-${id}-${ip}`, 5, 60000)) { // 5 per minute
        throw new HTTPException(429, { message: 'Too many auth attempts' });
    }
    const workspace = await c.env.DB.prepare('SELECT password_hash, salt FROM workspaces WHERE id = ?').bind(id).first();
    if (!workspace || !workspace.password_hash) {
        throw new HTTPException(404, { message: 'Workspace not found or not protected' });
    }
    const body = await c.req.json().catch(() => ({}));
    const result = authRequestSchema.safeParse(body);
    if (!result.success) {
        throw new HTTPException(400, { message: 'Invalid input' });
    }
    const { password } = result.data;
    const hash = await hashPassword(password, workspace.salt);
    if (hash !== workspace.password_hash) {
        throw new HTTPException(401, { message: 'Invalid password' });
    }
    const token = await sign({
        workspaceId: id,
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    }, c.env.JWT_SECRET || 'fallback-secret', 'HS256');
    return c.json({ token });
});
// Get Workspace
app.get('/api/workspaces/:id', async (c) => {
    const id = c.req.param('id');
    if (!workspaceIdSchema.safeParse(id).success) {
        throw new HTTPException(400, { message: 'Invalid workspace ID' });
    }
    const workspace = await c.env.DB.prepare('SELECT * FROM workspaces WHERE id = ?')
        .bind(id)
        .first();
    if (!workspace) {
        throw new HTTPException(404, { message: 'Workspace not found' });
    }
    if (!(await checkAuth(c, workspace))) {
        throw new HTTPException(401, { message: 'Authentication required' });
    }
    const expiresAt = new Date(workspace.expires_at);
    if (expiresAt < new Date()) {
        throw new HTTPException(410, { message: 'Workspace expired' });
    }
    const items = await c.env.DB.prepare('SELECT * FROM workspace_items WHERE workspace_id = ? ORDER BY created_at DESC')
        .bind(id)
        .all();
    return c.json({
        id: workspace.id,
        created_at: workspace.created_at,
        expires_at: workspace.expires_at,
        items: items.results
    });
});
// Upload File
app.post('/api/workspaces/:id/files', async (c) => {
    const startTime = Date.now();
    const workspaceId = c.req.param('id');
    if (!workspaceIdSchema.safeParse(workspaceId).success) {
        throw new HTTPException(400, { message: 'Invalid workspace ID' });
    }
    const maxSize = parseInt(c.env.MAX_UPLOAD_SIZE_MB || '50') * 1024 * 1024;
    // Early check via Content-Length header
    const contentLength = c.req.header('Content-Length');
    if (contentLength && parseInt(contentLength) > maxSize + 1024 * 100) { // 100KB buffer for multipart
        trackEvent(AnalyticsEvent.UPLOAD_FAILURE, { workspaceId, reason: 'FILE_TOO_LARGE_CONTENT_LENGTH', size: contentLength });
        throw new HTTPException(413, { message: 'File too large' });
    }
    const formData = await c.req.raw.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
        throw new HTTPException(400, { message: 'No file uploaded or invalid format' });
    }
    const actualFile = file;
    // MIME Validation
    if (!allowedMimeTypes.includes(actualFile.type)) {
        trackEvent(AnalyticsEvent.UPLOAD_FAILURE, { workspaceId, reason: 'INVALID_MIME', mime: actualFile.type });
        throw new HTTPException(400, { message: `File type ${actualFile.type} not allowed` });
    }
    if (actualFile.size > maxSize) {
        trackEvent(AnalyticsEvent.UPLOAD_FAILURE, { workspaceId, reason: 'FILE_TOO_LARGE', size: actualFile.size });
        throw new HTTPException(413, { message: 'File too large' });
    }
    // Check workspace exists and not expired
    const workspace = await c.env.DB.prepare('SELECT expires_at, password_hash, id FROM workspaces WHERE id = ?').bind(workspaceId).first();
    if (!workspace)
        throw new HTTPException(404, { message: 'Workspace not found' });
    if (new Date(workspace.expires_at) < new Date())
        throw new HTTPException(410, { message: 'Workspace expired' });
    if (!(await checkAuth(c, workspace))) {
        throw new HTTPException(401, { message: 'Authentication required' });
    }
    // --- Quota Checks ---
    const itemCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM workspace_items WHERE workspace_id = ?').bind(workspaceId).first();
    const maxFiles = parseInt(c.env.MAX_FILES_PER_WORKSPACE || '100');
    if (itemCount?.count >= maxFiles) {
        trackEvent(AnalyticsEvent.QUOTA_EXCEEDED, { workspaceId, quota: 'MAX_FILES' });
        throw new HTTPException(403, { message: 'File limit reached for this workspace' });
    }
    // --------------------
    const itemId = crypto.randomUUID();
    const safeName = sanitizeFilename(actualFile.name);
    const fileKey = `${workspaceId}/${itemId}-${safeName}`;
    try {
        await c.env.STORAGE.put(fileKey, actualFile.stream(), {
            httpMetadata: { contentType: actualFile.type }
        });
        await c.env.DB.prepare('INSERT INTO workspace_items (id, workspace_id, type, file_key, content, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(itemId, workspaceId, 'file', fileKey, safeName, new Date().toISOString())
            .run();
        const duration = Date.now() - startTime;
        trackEvent(AnalyticsEvent.UPLOAD_SUCCESS, { workspaceId, size: actualFile.size, duration });
        return c.json({ id: itemId, fileKey }, 201);
    }
    catch (err) {
        trackEvent(AnalyticsEvent.UPLOAD_FAILURE, { workspaceId, error: err.message });
        throw err;
    }
});
// Get Presigned Upload URL
app.post('/api/uploads/presign', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = presignRequestSchema.safeParse(body);
    if (!result.success) {
        throw new HTTPException(400, { message: 'Invalid input' });
    }
    const { workspaceId, filename, contentType, size } = result.data;
    // MIME Validation
    if (!allowedMimeTypes.includes(contentType)) {
        trackEvent(AnalyticsEvent.UPLOAD_FAILURE, { workspaceId, reason: 'INVALID_MIME', mime: contentType });
        throw new HTTPException(400, { message: `File type ${contentType} not allowed` });
    }
    const maxSize = parseInt(c.env.MAX_UPLOAD_SIZE_MB || '50') * 1024 * 1024;
    if (size > maxSize) {
        trackEvent(AnalyticsEvent.UPLOAD_FAILURE, { workspaceId, reason: 'FILE_TOO_LARGE', size });
        throw new HTTPException(413, { message: 'File too large' });
    }
    // Check workspace exists and not expired
    const workspace = await c.env.DB.prepare('SELECT expires_at, password_hash, id FROM workspaces WHERE id = ?').bind(workspaceId).first();
    if (!workspace)
        throw new HTTPException(404, { message: 'Workspace not found' });
    if (new Date(workspace.expires_at) < new Date())
        throw new HTTPException(410, { message: 'Workspace expired' });
    if (!(await checkAuth(c, workspace))) {
        throw new HTTPException(401, { message: 'Authentication required' });
    }
    // Quota Checks
    const itemCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM workspace_items WHERE workspace_id = ?').bind(workspaceId).first();
    const maxFiles = parseInt(c.env.MAX_FILES_PER_WORKSPACE || '100');
    if (itemCount?.count >= maxFiles) {
        trackEvent(AnalyticsEvent.QUOTA_EXCEEDED, { workspaceId, quota: 'MAX_FILES' });
        throw new HTTPException(403, { message: 'File limit reached for this workspace' });
    }
    const itemId = crypto.randomUUID();
    const safeName = sanitizeFilename(filename);
    const fileKey = `${workspaceId}/${itemId}-${safeName}`;
    try {
        const aws = getAwsClient(c.env);
        const bucket = c.env.R2_BUCKET_NAME || 'droppad';
        const url = `https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${fileKey}`;
        const signedRequest = await aws.sign(url, {
            method: 'PUT',
            headers: { 'Content-Type': contentType },
        });
        return c.json({
            uploadUrl: signedRequest.url,
            fileKey,
            itemId,
            expiresIn: 300
        });
    }
    catch (err) {
        console.error('[Presign Error]:', err);
        throw new HTTPException(500, { message: 'Failed to generate upload URL' });
    }
});
// Complete Upload
app.post('/api/uploads/complete', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = completeUploadSchema.safeParse(body);
    if (!result.success) {
        throw new HTTPException(400, { message: 'Invalid input' });
    }
    const { workspaceId, fileKey, filename, size, contentType, duration } = result.data;
    // Check workspace exists and not expired
    const workspace = await c.env.DB.prepare('SELECT expires_at, password_hash, id FROM workspaces WHERE id = ?').bind(workspaceId).first();
    if (!workspace)
        throw new HTTPException(404, { message: 'Workspace not found' });
    if (new Date(workspace.expires_at) < new Date())
        throw new HTTPException(410, { message: 'Workspace expired' });
    if (!(await checkAuth(c, workspace))) {
        throw new HTTPException(401, { message: 'Authentication required' });
    }
    // Verify file exists in R2
    const object = await c.env.STORAGE.head(fileKey);
    if (!object) {
        throw new HTTPException(400, { message: 'File not found in storage. Upload may have failed.' });
    }
    const itemId = fileKey.split('/')[1].split('-')[0];
    try {
        await c.env.DB.prepare('INSERT INTO workspace_items (id, workspace_id, type, file_key, content, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(itemId, workspaceId, 'file', fileKey, sanitizeFilename(filename), new Date().toISOString())
            .run();
        trackEvent(AnalyticsEvent.UPLOAD_SUCCESS, { workspaceId, size, duration });
        return c.json({ id: itemId, fileKey }, 201);
    }
    catch (err) {
        trackEvent(AnalyticsEvent.UPLOAD_FAILURE, { workspaceId, error: err.message });
        throw new HTTPException(500, { message: 'Failed to register upload' });
    }
});
// --- Multipart Upload ---
// Initiate Multipart Upload
app.post('/api/uploads/multipart/initiate', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = initiateMultipartSchema.safeParse(body);
    if (!result.success)
        throw new HTTPException(400, { message: 'Invalid input' });
    const { workspaceId, filename, contentType, size } = result.data;
    // Check workspace
    const workspace = await c.env.DB.prepare('SELECT expires_at, password_hash, id FROM workspaces WHERE id = ?').bind(workspaceId).first();
    if (!workspace)
        throw new HTTPException(404, { message: 'Workspace not found' });
    if (!(await checkAuth(c, workspace)))
        throw new HTTPException(401, { message: 'Authentication required' });
    const itemId = crypto.randomUUID();
    const safeName = sanitizeFilename(filename);
    const fileKey = `${workspaceId}/${itemId}-${safeName}`;
    try {
        const aws = getAwsClient(c.env);
        const bucket = c.env.R2_BUCKET_NAME || 'droppad';
        const url = `https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${fileKey}?uploads`;
        const response = await aws.fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': contentType },
        });
        if (!response.ok)
            throw new Error(`R2 Initiate Error: ${await response.text()}`);
        const xmlText = await response.text();
        const parser = new XMLParser();
        const parsed = parser.parse(xmlText);
        const uploadId = parsed.InitiateMultipartUploadResult.UploadId;
        return c.json({
            uploadId,
            fileKey,
            itemId
        });
    }
    catch (err) {
        console.error('[Multipart Initiate Error]:', err);
        throw new HTTPException(500, { message: 'Failed to initiate multipart upload' });
    }
});
// Sign Multipart Part
app.post('/api/uploads/multipart/sign-part', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = signPartSchema.safeParse(body);
    if (!result.success)
        throw new HTTPException(400, { message: 'Invalid input' });
    const { workspaceId, uploadId, fileKey, partNumber } = result.data;
    // Check workspace
    const workspace = await c.env.DB.prepare('SELECT id, password_hash FROM workspaces WHERE id = ?').bind(workspaceId).first();
    if (!workspace)
        throw new HTTPException(404, { message: 'Workspace not found' });
    if (!(await checkAuth(c, workspace)))
        throw new HTTPException(401, { message: 'Authentication required' });
    try {
        const aws = getAwsClient(c.env);
        const bucket = c.env.R2_BUCKET_NAME || 'droppad';
        const url = `https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${fileKey}?partNumber=${partNumber}&uploadId=${uploadId}`;
        const signedRequest = await aws.sign(url, {
            method: 'PUT',
        });
        return c.json({ url: signedRequest.url });
    }
    catch (err) {
        console.error('[Multipart Sign Part Error]:', err);
        throw new HTTPException(500, { message: 'Failed to sign upload part' });
    }
});
// Complete Multipart Upload
app.post('/api/uploads/multipart/complete', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = completeMultipartSchema.safeParse(body);
    if (!result.success)
        throw new HTTPException(400, { message: 'Invalid input' });
    const { workspaceId, uploadId, fileKey, filename, size, contentType, parts, duration } = result.data;
    // Check workspace
    const workspace = await c.env.DB.prepare('SELECT expires_at, password_hash, id FROM workspaces WHERE id = ?').bind(workspaceId).first();
    if (!workspace)
        throw new HTTPException(404, { message: 'Workspace not found' });
    if (!(await checkAuth(c, workspace)))
        throw new HTTPException(401, { message: 'Authentication required' });
    try {
        const aws = getAwsClient(c.env);
        const bucket = c.env.R2_BUCKET_NAME || 'droppad';
        const url = `https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${fileKey}?uploadId=${uploadId}`;
        // Construct XML for completion
        const partsXml = parts
            .sort((a, b) => a.PartNumber - b.PartNumber)
            .map(p => `<Part><PartNumber>${p.PartNumber}</PartNumber><ETag>${p.ETag}</ETag></Part>`)
            .join('');
        const completeXml = `<CompleteMultipartUpload>${partsXml}</CompleteMultipartUpload>`;
        const response = await aws.fetch(url, {
            method: 'POST',
            body: completeXml,
        });
        if (!response.ok)
            throw new Error(`R2 Complete Error: ${await response.text()}`);
        // Register in D1
        const itemId = fileKey.split('/')[1].split('-')[0];
        await c.env.DB.prepare('INSERT INTO workspace_items (id, workspace_id, type, file_key, content, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(itemId, workspaceId, 'file', fileKey, sanitizeFilename(filename), new Date().toISOString())
            .run();
        trackEvent(AnalyticsEvent.UPLOAD_SUCCESS, { workspaceId, size, duration, type: 'multipart' });
        return c.json({ id: itemId, fileKey }, 201);
    }
    catch (err) {
        console.error('[Multipart Complete Error]:', err);
        throw new HTTPException(500, { message: 'Failed to complete multipart upload' });
    }
});
// Abort Multipart Upload
app.post('/api/uploads/multipart/abort', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { workspaceId, uploadId, fileKey } = body;
    if (!workspaceId || !uploadId || !fileKey) {
        throw new HTTPException(400, { message: 'Missing parameters' });
    }
    // Check workspace
    const workspace = await c.env.DB.prepare('SELECT id, password_hash FROM workspaces WHERE id = ?').bind(workspaceId).first();
    if (!workspace)
        throw new HTTPException(404, { message: 'Workspace not found' });
    if (!(await checkAuth(c, workspace)))
        throw new HTTPException(401, { message: 'Authentication required' });
    try {
        const aws = getAwsClient(c.env);
        const bucket = c.env.R2_BUCKET_NAME || 'droppad';
        const url = `https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${fileKey}?uploadId=${uploadId}`;
        const response = await aws.fetch(url, {
            method: 'DELETE',
        });
        if (!response.ok)
            throw new Error(`R2 Abort Error: ${await response.text()}`);
        return c.json({ success: true });
    }
    catch (err) {
        console.error('[Multipart Abort Error]:', err);
        throw new HTTPException(500, { message: 'Failed to abort multipart upload' });
    }
});
// --- End Multipart Upload ---
// Add Note
app.post('/api/workspaces/:id/notes', async (c) => {
    const workspaceId = c.req.param('id');
    if (!workspaceIdSchema.safeParse(workspaceId).success) {
        throw new HTTPException(400, { message: 'Invalid workspace ID' });
    }
    const body = await c.req.json();
    const result = createNoteSchema.safeParse(body);
    if (!result.success) {
        throw new HTTPException(400, { message: 'Invalid input' });
    }
    const { content } = result.data;
    // Check workspace exists and not expired
    const workspace = await c.env.DB.prepare('SELECT expires_at, password_hash, id FROM workspaces WHERE id = ?').bind(workspaceId).first();
    if (!workspace)
        throw new HTTPException(404, { message: 'Workspace not found' });
    if (new Date(workspace.expires_at) < new Date())
        throw new HTTPException(410, { message: 'Workspace expired' });
    if (!(await checkAuth(c, workspace))) {
        throw new HTTPException(401, { message: 'Authentication required' });
    }
    const itemId = crypto.randomUUID();
    await c.env.DB.prepare('INSERT INTO workspace_items (id, workspace_id, type, content, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(itemId, workspaceId, 'note', content, new Date().toISOString())
        .run();
    return c.json({ id: itemId }, 201);
});
// Get File
app.get('/api/files/:workspaceId/:itemId', async (c) => {
    const { workspaceId, itemId } = c.req.param();
    if (!workspaceIdSchema.safeParse(workspaceId).success) {
        throw new HTTPException(400, { message: 'Invalid workspace ID' });
    }
    const item = await c.env.DB.prepare('SELECT * FROM workspace_items WHERE id = ? AND workspace_id = ? AND type = "file"').bind(itemId, workspaceId).first();
    if (!item)
        throw new HTTPException(404, { message: 'File not found' });
    const object = await c.env.STORAGE.get(item.file_key);
    if (!object)
        throw new HTTPException(404, { message: 'File not found in storage' });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    // Suggest download filename
    headers.set('Content-Disposition', `attachment; filename="${item.content}"`);
    // object.body is already a ReadableStream, which is perfect for memory-efficient streaming
    return new Response(object.body, { headers });
});
// Delete Item
app.delete('/api/workspaces/:workspaceId/items/:itemId', async (c) => {
    const { workspaceId, itemId } = c.req.param();
    if (!workspaceIdSchema.safeParse(workspaceId).success) {
        throw new HTTPException(400, { message: 'Invalid workspace ID' });
    }
    const workspace = await c.env.DB.prepare('SELECT expires_at, password_hash, id FROM workspaces WHERE id = ?').bind(workspaceId).first();
    if (!workspace)
        throw new HTTPException(404, { message: 'Workspace not found' });
    if (!(await checkAuth(c, workspace))) {
        throw new HTTPException(401, { message: 'Authentication required' });
    }
    const item = await c.env.DB.prepare('SELECT * FROM workspace_items WHERE id = ? AND workspace_id = ?').bind(itemId, workspaceId).first();
    if (!item)
        throw new HTTPException(404, { message: 'Item not found' });
    if (item.type === 'file' && item.file_key) {
        try {
            await c.env.STORAGE.delete(item.file_key);
        }
        catch (err) {
            console.error(`[Delete Error] Failed to delete R2 object ${item.file_key}:`, err);
        }
    }
    await c.env.DB.prepare('DELETE FROM workspace_items WHERE id = ? AND workspace_id = ?').bind(itemId, workspaceId).run();
    return c.json({ success: true });
});
// Cron Trigger Handler
export { app };
export default {
    fetch: app.fetch,
    async scheduled(event, env, ctx) {
        ctx.waitUntil(cleanupExpiredWorkspaces(env));
    }
};

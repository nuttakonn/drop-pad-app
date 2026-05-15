import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'
import { errorHandler, securityHeaders } from './middleware/error'
import { loggerMiddleware } from './middleware/logger'
import { workspaceIdSchema, createNoteSchema, allowedMimeTypes, sanitizeFilename } from './utils/validation'
import { cleanupExpiredWorkspaces } from './services/cleanup'
import { trackEvent, AnalyticsEvent } from './services/analytics'
import { HTTPException } from 'hono/http-exception'

type Bindings = {
  DB: D1Database
  STORAGE: R2Bucket
  APP_ENV: string
  WORKSPACE_EXPIRE_MINUTES: string
  MAX_UPLOAD_SIZE_MB: string
  MAX_FILES_PER_WORKSPACE: string
  MAX_TOTAL_WORKSPACE_SIZE_MB: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', loggerMiddleware)
app.use('*', cors())
app.use('*', securityHeaders)
app.onError(errorHandler)

app.get('/health', (c) => c.json({ status: 'ok', env: c.env.APP_ENV }))
app.get('/ready', async (c) => {
  // Check DB and Storage availability
  try {
    await c.env.DB.prepare('SELECT 1').run()
    return c.json({ status: 'ready' })
  } catch (err) {
    throw new HTTPException(503, { message: 'Service Unavailable' })
  }
})

// Create Workspace
app.post('/api/workspaces', async (c) => {
  const id = crypto.randomUUID().split('-')[0] // 8 chars
  const now = new Date()
  const expireMinutes = parseInt(c.env.WORKSPACE_EXPIRE_MINUTES || '1440')
  const expiresAt = new Date(now.getTime() + expireMinutes * 60000)

  await c.env.DB.prepare(
    'INSERT INTO workspaces (id, created_at, expires_at) VALUES (?, ?, ?)'
  )
    .bind(id, now.toISOString(), expiresAt.toISOString())
    .run()

  trackEvent(AnalyticsEvent.WORKSPACE_CREATED, { id })

  return c.json({ id, expiresAt: expiresAt.toISOString() }, 201)
})

// Get Workspace
app.get('/api/workspaces/:id', async (c) => {
  const id = c.req.param('id')
  
  if (!workspaceIdSchema.safeParse(id).success) {
    throw new HTTPException(400, { message: 'Invalid workspace ID' })
  }
  
  const workspace = await c.env.DB.prepare(
    'SELECT * FROM workspaces WHERE id = ?'
  )
    .bind(id)
    .first()

  if (!workspace) {
    throw new HTTPException(404, { message: 'Workspace not found' })
  }

  const expiresAt = new Date(workspace.expires_at as string)
  if (expiresAt < new Date()) {
    throw new HTTPException(410, { message: 'Workspace expired' })
  }

  const items = await c.env.DB.prepare(
    'SELECT * FROM workspace_items WHERE workspace_id = ? ORDER BY created_at DESC'
  )
    .bind(id)
    .all()

  return c.json({
    id: workspace.id,
    created_at: workspace.created_at,
    expires_at: workspace.expires_at,
    items: items.results
  })
})

// Upload File
app.post('/api/workspaces/:id/files', async (c) => {
  const workspaceId = c.req.param('id')
  if (!workspaceIdSchema.safeParse(workspaceId).success) {
    throw new HTTPException(400, { message: 'Invalid workspace ID' })
  }

  const formData = await c.req.parseBody()
  const file = formData['file']

  if (!(file instanceof File)) {
    throw new HTTPException(400, { message: 'No file uploaded or invalid format' })
  }

  // MIME Validation
  if (!allowedMimeTypes.includes(file.type)) {
    trackEvent(AnalyticsEvent.UPLOAD_FAILURE, { workspaceId, reason: 'INVALID_MIME', mime: file.type })
    throw new HTTPException(400, { message: `File type ${file.type} not allowed` })
  }

  const maxSize = parseInt(c.env.MAX_UPLOAD_SIZE_MB || '50') * 1024 * 1024
  if (file.size > maxSize) {
    trackEvent(AnalyticsEvent.UPLOAD_FAILURE, { workspaceId, reason: 'FILE_TOO_LARGE', size: file.size })
    throw new HTTPException(400, { message: 'File too large' })
  }

  // Check workspace exists and not expired
  const workspace = await c.env.DB.prepare('SELECT expires_at FROM workspaces WHERE id = ?').bind(workspaceId).first()
  if (!workspace) throw new HTTPException(404, { message: 'Workspace not found' })
  if (new Date(workspace.expires_at as string) < new Date()) throw new HTTPException(410, { message: 'Workspace expired' })

  // --- Quota Checks ---
  const itemCount = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM workspace_items WHERE workspace_id = ?'
  ).bind(workspaceId).first()
  const maxFiles = parseInt(c.env.MAX_FILES_PER_WORKSPACE || '100')
  if ((itemCount?.count as number) >= maxFiles) {
    trackEvent(AnalyticsEvent.QUOTA_EXCEEDED, { workspaceId, quota: 'MAX_FILES' })
    throw new HTTPException(403, { message: 'File limit reached for this workspace' })
  }
  // --------------------

  const itemId = crypto.randomUUID()
  const safeName = sanitizeFilename(file.name)
  const fileKey = `${workspaceId}/${itemId}-${safeName}`
  
  try {
    await c.env.STORAGE.put(fileKey, file.stream(), {
      httpMetadata: { contentType: file.type }
    })

    await c.env.DB.prepare(
      'INSERT INTO workspace_items (id, workspace_id, type, file_key, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(itemId, workspaceId, 'file', fileKey, safeName, new Date().toISOString())
      .run()

    trackEvent(AnalyticsEvent.UPLOAD_SUCCESS, { workspaceId, size: file.size })
    return c.json({ id: itemId, fileKey }, 201)
  } catch (err: any) {
    trackEvent(AnalyticsEvent.UPLOAD_FAILURE, { workspaceId, error: err.message })
    throw err
  }
})

// Add Note
app.post('/api/workspaces/:id/notes', async (c) => {
    const workspaceId = c.req.param('id')
    if (!workspaceIdSchema.safeParse(workspaceId).success) {
      throw new HTTPException(400, { message: 'Invalid workspace ID' })
    }

    const body = await c.req.json()
    const result = createNoteSchema.safeParse(body)
    if (!result.success) {
      throw new HTTPException(400, { message: 'Invalid input' })
    }

    const { content } = result.data

    // Check workspace exists and not expired
    const workspace = await c.env.DB.prepare('SELECT expires_at FROM workspaces WHERE id = ?').bind(workspaceId).first()
    if (!workspace) throw new HTTPException(404, { message: 'Workspace not found' })
    if (new Date(workspace.expires_at as string) < new Date()) throw new HTTPException(410, { message: 'Workspace expired' })

    const itemId = crypto.randomUUID()
    await c.env.DB.prepare(
      'INSERT INTO workspace_items (id, workspace_id, type, content, created_at) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(itemId, workspaceId, 'note', content, new Date().toISOString())
      .run()

    return c.json({ id: itemId }, 201)
})

// Get File
app.get('/api/files/:workspaceId/:itemId', async (c) => {
    const { workspaceId, itemId } = c.req.param()
    
    if (!workspaceIdSchema.safeParse(workspaceId).success) {
      throw new HTTPException(400, { message: 'Invalid workspace ID' })
    }

    const item = await c.env.DB.prepare(
        'SELECT * FROM workspace_items WHERE id = ? AND workspace_id = ? AND type = "file"'
    ).bind(itemId, workspaceId).first()

    if (!item) throw new HTTPException(404, { message: 'File not found' })

    const object = await c.env.STORAGE.get(item.file_key as string)
    if (!object) throw new HTTPException(404, { message: 'File not found in storage' })

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    // Suggest download filename
    headers.set('Content-Disposition', `attachment; filename="${item.content}"`)

    // object.body is already a ReadableStream, which is perfect for memory-efficient streaming
    return new Response(object.body, { headers })
})

// Delete Item
app.delete('/api/workspaces/:workspaceId/items/:itemId', async (c) => {
    const { workspaceId, itemId } = c.req.param()
    
    if (!workspaceIdSchema.safeParse(workspaceId).success) {
      throw new HTTPException(400, { message: 'Invalid workspace ID' })
    }

    const item = await c.env.DB.prepare(
        'SELECT * FROM workspace_items WHERE id = ? AND workspace_id = ?'
    ).bind(itemId, workspaceId).first()

    if (!item) throw new HTTPException(404, { message: 'Item not found' })

    if (item.type === 'file' && item.file_key) {
      try {
        await c.env.STORAGE.delete(item.file_key as string)
      } catch (err: any) {
        console.error(`[Delete Error] Failed to delete R2 object ${item.file_key}:`, err)
      }
    }

    await c.env.DB.prepare(
        'DELETE FROM workspace_items WHERE id = ? AND workspace_id = ?'
    ).bind(itemId, workspaceId).run()

    return c.json({ success: true })
})

// Cron Trigger Handler
export { app }
export default {
  fetch: app.fetch,
  async scheduled(event: any, env: Bindings, ctx: any) {
    ctx.waitUntil(cleanupExpiredWorkspaces(env))
  }
}

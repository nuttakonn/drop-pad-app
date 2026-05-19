import { trackEvent, AnalyticsEvent } from './analytics';
import { S3Client, ListMultipartUploadsCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
export async function cleanupExpiredWorkspaces(env) {
    const now = new Date();
    const nowIso = now.toISOString();
    try {
        // 1. Get expired workspace IDs
        const expired = await env.DB.prepare('SELECT id FROM workspaces WHERE expires_at < ?').bind(nowIso).all();
        const ids = expired.results.map((r) => r.id);
        let deletedWorkspaces = 0;
        let deletedFiles = 0;
        if (ids.length > 0) {
            for (const id of ids) {
                try {
                    // 2. Delete files from R2 (using prefix)
                    const objects = await env.STORAGE.list({ prefix: `${id}/` });
                    if (objects.objects.length > 0) {
                        const keys = objects.objects.map((o) => o.key);
                        await env.STORAGE.delete(keys);
                        deletedFiles += keys.length;
                    }
                    // 3. Delete from DB
                    await env.DB.prepare('DELETE FROM workspace_items WHERE workspace_id = ?').bind(id).run();
                    await env.DB.prepare('DELETE FROM workspaces WHERE id = ?').bind(id).run();
                    deletedWorkspaces++;
                }
                catch (err) {
                    console.error(`[Cleanup Error] Failed to clean workspace ${id}:`, err);
                }
            }
        }
        // 4. Abort Stale Multipart Uploads
        let abortedMultipart = 0;
        if (env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ACCOUNT_ID) {
            const s3 = new S3Client({
                region: 'auto',
                endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
                credentials: {
                    accessKeyId: env.R2_ACCESS_KEY_ID,
                    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
                },
            });
            try {
                const multipart = await s3.send(new ListMultipartUploadsCommand({
                    Bucket: env.R2_BUCKET_NAME || 'droppad'
                }));
                if (multipart.Uploads) {
                    for (const upload of multipart.Uploads) {
                        const initiated = upload.Initiated ? new Date(upload.Initiated) : new Date();
                        const hoursOld = (now.getTime() - initiated.getTime()) / (1000 * 60 * 60);
                        // Abort if older than 24 hours
                        if (hoursOld > 24 && upload.Key && upload.UploadId) {
                            await s3.send(new AbortMultipartUploadCommand({
                                Bucket: env.R2_BUCKET_NAME || 'droppad',
                                Key: upload.Key,
                                UploadId: upload.UploadId
                            }));
                            abortedMultipart++;
                        }
                    }
                }
            }
            catch (err) {
                console.error('[Cleanup Error] Failed to list/abort multipart uploads:', err);
            }
        }
        trackEvent(AnalyticsEvent.CLEANUP_SUCCESS, {
            deletedWorkspaces,
            deletedFiles,
            abortedMultipart,
            timestamp: nowIso
        });
        return deletedWorkspaces;
    }
    catch (err) {
        trackEvent(AnalyticsEvent.CLEANUP_FAILURE, { error: err.message });
        throw err;
    }
}

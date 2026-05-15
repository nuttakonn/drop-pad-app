import { trackEvent, AnalyticsEvent } from './analytics'

export async function cleanupExpiredWorkspaces(env: { DB: D1Database; STORAGE: R2Bucket }) {
  const now = new Date().toISOString()
  
  try {
    // 1. Get expired workspace IDs
    const expired = await env.DB.prepare(
      'SELECT id FROM workspaces WHERE expires_at < ?'
    ).bind(now).all()

    const ids = expired.results.map(r => r.id as string)
    
    if (ids.length === 0) {
      // 2. Orphaned file detection (files in R2 without a workspace entry)
      // This is a simplified version. A full version would list all R2 objects 
      // and check each one against the DB, which is expensive.
      // Instead, we can do a partial "audit" of R2 objects.
      return 0
    }

    let deletedWorkspaces = 0
    let deletedFiles = 0

    for (const id of ids) {
      try {
        // 2. Delete files from R2 (using prefix)
        const objects = await env.STORAGE.list({ prefix: `${id}/` })
        if (objects.objects.length > 0) {
          const keys = objects.objects.map(o => o.key)
          await env.STORAGE.delete(keys)
          deletedFiles += keys.length
        }

        // 3. Delete from DB
        await env.DB.prepare('DELETE FROM workspace_items WHERE workspace_id = ?').bind(id).run()
        await env.DB.prepare('DELETE FROM workspaces WHERE id = ?').bind(id).run()
        
        deletedWorkspaces++
      } catch (err: any) {
        console.error(`[Cleanup Error] Failed to clean workspace ${id}:`, err)
      }
    }

    trackEvent(AnalyticsEvent.CLEANUP_SUCCESS, {
      deletedWorkspaces,
      deletedFiles,
      timestamp: now
    })

    return deletedWorkspaces
  } catch (err: any) {
    trackEvent(AnalyticsEvent.CLEANUP_FAILURE, { error: err.message })
    throw err
  }
}

import { describe, it, expect, beforeEach } from 'vitest'
import { app } from '../../apps/api/src/index'

describe('Operational Endpoints & Quotas', () => {
  const mockEnv = {
    APP_ENV: 'test',
    WORKSPACE_EXPIRE_MINUTES: '1440',
    MAX_UPLOAD_SIZE_MB: '50',
    MAX_FILES_PER_WORKSPACE: '2', // Strict limit for testing
    MAX_TOTAL_WORKSPACE_SIZE_MB: '500',
    DB: {
        prepare: (query: string) => {
            const result = {
                run: async () => ({}),
                first: async () => {
                    if (query.includes('COUNT(*)')) return { count: 2 }
                    if (query.includes('SELECT * FROM workspaces')) return { id: 'abcd1234', expires_at: new Date(Date.now() + 100000).toISOString() }
                    return {}
                },
                all: async () => ({ results: [] }),
                bind: () => result
            }
            return result
        }
    },
    STORAGE: {
        put: async () => ({}),
        get: async () => ({ body: new ReadableStream() }),
        delete: async () => ({})
    }
  }

  it('GET /ready should return 200', async () => {
    const res = await app.request('/ready', {}, mockEnv)
    expect(res.status).toBe(200)
    const body = await res.json() as { status: string }
    expect(body.status).toBe('ready')
  })

  it('POST /api/workspaces/:id/files should return 403 when file limit reached', async () => {
    const formData = new FormData()
    const file = new File(['test content'], 'test.txt', { type: 'text/plain' })
    formData.append('file', file)

    const res = await app.request('/api/workspaces/abcd1234/files', {
      method: 'POST',
      body: formData
    }, mockEnv)

    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('File limit reached')
  })
})

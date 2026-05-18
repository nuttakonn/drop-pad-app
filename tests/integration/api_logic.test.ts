import { describe, it, expect } from 'vitest'
import { app } from '../../apps/api/src/index'

describe('API Logic Integration', () => {
  const mockEnv = {
    APP_ENV: 'test',
    WORKSPACE_EXPIRE_MINUTES: '1440',
    MAX_UPLOAD_SIZE_MB: '50',
    DB: {
        prepare: () => {
          const result = {
            bind: () => result,
            run: async () => ({}),
            first: async () => ({ expires_at: new Date(Date.now() + 100000).toISOString() }),
            all: async () => ({ results: [] })
          }
          return result
        }
    },
    STORAGE: {}
  }

  it('GET /health should return 200', async () => {
    const res = await app.request('/health', {}, mockEnv)
    expect(res.status).toBe(200)
    const body = await res.json() as { status: string }
    expect(body.status).toBe('ok')
  })

  it('GET /api/workspaces/!! should return 400', async () => {
    const res = await app.request('/api/workspaces/!!', {}, mockEnv)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('Invalid workspace ID')
  })

  it('POST /api/workspaces should return 200/201/409 with valid structure', async () => {
    const res = await app.request('/api/workspaces', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'test-room' })
    }, mockEnv)
    
    expect([200, 201, 409]).toContain(res.status)
  })

  it('POST /api/workspaces/test/files should return 413 for oversized Content-Length', async () => {
    const res = await app.request('/api/workspaces/test/files', { 
      method: 'POST',
      headers: { 'Content-Length': '1000000000' } // 1GB
    }, mockEnv)
    expect(res.status).toBe(413)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('File too large')
  })
})

import { describe, it, expect } from 'vitest'
import { app } from '../../apps/api/src/index'

describe('API Logic Integration', () => {
  const mockEnv = {
    APP_ENV: 'test',
    WORKSPACE_EXPIRE_MINUTES: '1440',
    MAX_UPLOAD_SIZE_MB: '50',
    DB: {
        prepare: () => ({ bind: () => ({ run: async () => ({}), first: async () => ({ expires_at: new Date(Date.now() + 100000).toISOString() }), all: async () => ({ results: [] }) }) })
    },
    STORAGE: {}
  }

  it('GET /health should return 200', async () => {
    const res = await app.request('/health', {}, mockEnv)
    expect(res.status).toBe(200)
    const body = await res.json() as { status: string }
    expect(body.status).toBe('ok')
  })

  it('GET /api/workspaces/invalid-id should return 400', async () => {
    const res = await app.request('/api/workspaces/invalid-id', {}, mockEnv)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('Invalid workspace ID')
  })

  it('POST /api/workspaces should return 201 with valid structure', async () => {
    const res = await app.request('/api/workspaces', { method: 'POST' }, mockEnv)
    expect(res.status).toBe(201)
    const body = await res.json() as { id: string }
    expect(body.id).toMatch(/^[a-f0-9]{8}$/)
  })
})

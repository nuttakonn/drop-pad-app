import { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'

export interface ApiErrorResponse {
  error: string
  code: string
  details?: any
}

export const errorHandler = async (err: Error, c: Context) => {
  console.error(`[Error] ${c.req.method} ${c.req.url}:`, err)

  if (err instanceof HTTPException) {
    return c.json({
      error: err.message,
      code: `HTTP_${err.status}`
    }, err.status)
  }

  // Handle Zod or other validation errors if needed
  
  return c.json({
    error: 'Internal Server Error',
    code: 'INTERNAL_ERROR'
  }, 500)
}

export const securityHeaders = async (c: Context, next: Next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '1; mode=block')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none';")
}

import { z } from 'zod'

export const workspaceIdSchema = z.string().regex(/^[a-f0-9]{8}$/)

export const createNoteSchema = z.object({
  content: z.string().min(1).max(50000)
})

export const allowedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/json',
  'application/zip',
  // Microsoft Office
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Specialized types
  'application/vnd.jgraph.drawio',
  'application/xml',
  'text/xml',
  'image/svg+xml'
]

export function sanitizeFilename(filename: string): string {
  // 1. Remove leading slashes and dots
  let sanitized = filename
    .replace(/^[./\\]+/g, '') // Remove leading ., /, \
  
  // 2. Remove path traversal patterns
  sanitized = sanitized.replace(/^(\.\.(\/|\\|$))+/g, '') 
  
  // 3. Replace slashes with underscores
  sanitized = sanitized.replace(/[/\\]/g, '_')

  // 4. Remove any remaining ".." 
  while (sanitized.includes('..')) {
    sanitized = sanitized.replace(/\.\./g, '.')
  }

  // 5. Final pass: only allow safe characters (alphanumeric, dot, underscore, dash)
  return sanitized.replace(/[^a-zA-Z0-9.\-_]/g, '_')
}

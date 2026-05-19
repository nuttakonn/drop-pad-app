import { z } from 'zod'

export const workspaceIdSchema = z.string().regex(/^[a-zA-Z0-9-]{3,32}$/)

export const createNoteSchema = z.object({
  content: z.string().min(1).max(50000)
})

export const createWorkspaceSchema = z.object({
  id: workspaceIdSchema.optional(),
  password: z.string().min(4).max(64).optional()
})

export const authRequestSchema = z.object({
  password: z.string().min(1)
})

export const presignRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  size: z.number().positive().max(1024 * 1024 * 1024) // Max 1GB
})

export const completeUploadSchema = z.object({
  workspaceId: workspaceIdSchema,
  fileKey: z.string().min(1),
  filename: z.string().min(1).max(255),
  size: z.number().positive(),
  contentType: z.string().min(1),
  duration: z.number().optional()
})

export const initiateMultipartSchema = z.object({
  workspaceId: workspaceIdSchema,
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  size: z.number().positive().max(5 * 1024 * 1024 * 1024) // Max 5GB for multipart
})

export const signPartSchema = z.object({
  workspaceId: workspaceIdSchema,
  uploadId: z.string().min(1),
  fileKey: z.string().min(1),
  partNumber: z.number().int().positive().max(10000)
})

export const completeMultipartSchema = z.object({
  workspaceId: workspaceIdSchema,
  uploadId: z.string().min(1),
  fileKey: z.string().min(1),
  filename: z.string().min(1),
  size: z.number().positive(),
  contentType: z.string().min(1),
  duration: z.number().optional(),
  parts: z.array(z.object({
    PartNumber: z.number().int().positive(),
    ETag: z.string().min(1)
  }))
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

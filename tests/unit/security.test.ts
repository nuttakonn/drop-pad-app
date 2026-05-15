import { describe, it, expect } from 'vitest'
import { workspaceIdSchema, sanitizeFilename, allowedMimeTypes } from '../../apps/api/src/utils/validation'

describe('Security Validation', () => {
  describe('Workspace ID Validation', () => {
    it('should accept valid names', () => {
      expect(workspaceIdSchema.safeParse('abcd1234').success).toBe(true)
      expect(workspaceIdSchema.safeParse('my-room-123').success).toBe(true)
      expect(workspaceIdSchema.safeParse('abc').success).toBe(true)
    })

    it('should reject invalid IDs', () => {
      expect(workspaceIdSchema.safeParse('ab').success).toBe(false) // too short
      expect(workspaceIdSchema.safeParse('a'.repeat(33)).success).toBe(false) // too long
      expect(workspaceIdSchema.safeParse('room name').success).toBe(false) // spaces
      expect(workspaceIdSchema.safeParse('../test').success).toBe(false) // traversal attempt
    })
  })

  describe('Filename Sanitization', () => {
    it('should remove path traversal', () => {
      expect(sanitizeFilename('../../../etc/passwd')).not.toContain('..')
      expect(sanitizeFilename('/etc/passwd')).toBe('etc_passwd')
    })

    it('should replace risky characters', () => {
      expect(sanitizeFilename('my file@#$%^.txt')).toBe('my_file_____.txt')
    })

    it('should preserve extension', () => {
      expect(sanitizeFilename('test.jpg')).toBe('test.jpg')
    })
  })

  describe('MIME Type Validation', () => {
    it('should allow safe types', () => {
      expect(allowedMimeTypes).toContain('image/png')
      expect(allowedMimeTypes).toContain('application/pdf')
      expect(allowedMimeTypes).toContain('text/plain')
    })

    it('should not contain executable types', () => {
      expect(allowedMimeTypes).not.toContain('application/x-msdownload')
      expect(allowedMimeTypes).not.toContain('application/x-sh')
    })
  })
})

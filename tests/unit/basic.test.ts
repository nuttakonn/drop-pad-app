import { describe, it, expect } from 'vitest';

describe('Basic Logic', () => {
  it('should calculate expiration correctly', () => {
    const now = new Date('2026-05-15T12:00:00Z');
    const expireMinutes = 1440; // 24 hours
    const expiresAt = new Date(now.getTime() + expireMinutes * 60000);
    
    expect(expiresAt.toISOString()).toBe('2026-05-16T12:00:00.000Z');
  });

  it('should validate file size', () => {
    const maxSizeMB = 50;
    const fileSize = 40 * 1024 * 1024; // 40MB
    expect(fileSize).toBeLessThan(maxSizeMB * 1024 * 1024);
  });
});

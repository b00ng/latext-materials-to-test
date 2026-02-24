import { describe, expect, it } from 'vitest';
import { extractBearerToken } from '../src/middleware/auth';

describe('extractBearerToken', () => {
  it('extracts token from a valid bearer header', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123');
  });

  it('returns null for invalid header formats', () => {
    expect(extractBearerToken('Token abc123')).toBeNull();
    expect(extractBearerToken(null)).toBeNull();
  });
});

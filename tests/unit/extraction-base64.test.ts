import { describe, expect, it } from 'vitest';
import {
  decodeBase64ToArrayBuffer,
  encodeArrayBufferToBase64,
  estimateBase64Bytes
} from '../../src/extraction/base64-utils';

describe('base64-utils', () => {
  it('encodes and decodes array buffers consistently', () => {
    const input = 'Smoke extraction payload';
    const encoded = btoa(input);
    const decoded = decodeBase64ToArrayBuffer(encoded);
    const reEncoded = encodeArrayBufferToBase64(decoded);

    expect(reEncoded).toBe(encoded);
  });

  it('estimates decoded bytes from base64 text', () => {
    const value = btoa('abcde');
    expect(estimateBase64Bytes(value)).toBe(5);
  });
});

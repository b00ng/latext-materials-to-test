import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpNormalizationClient } from '../../src/extraction/normalization-client';

describe('HttpNormalizationClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends authenticated normalize requests', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          mainFile: 'main.tex',
          fileMap: { 'main.tex': 'normalized' }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as typeof fetch;

    const client = new HttpNormalizationClient('https://normalizer.example.com', 'token-123');
    const result = await client.normalize({
      materialId: 'mat-1',
      sourceType: 'pdf',
      files: [{ name: 'a.pdf', contentBase64: btoa('a') }]
    });

    expect(result.mainFile).toBe('main.tex');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(call[0]).toBe('https://normalizer.example.com/normalize');
    expect((call[1]?.headers as Record<string, string>).Authorization).toBe('Bearer token-123');
  });

  it('throws on non-2xx responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 })) as typeof fetch;

    const client = new HttpNormalizationClient('https://normalizer.example.com', 'token-123');

    await expect(
      client.normalize({
        materialId: 'mat-1',
        sourceType: 'pdf',
        files: [{ name: 'a.pdf', contentBase64: btoa('a') }]
      })
    ).rejects.toThrowError();
  });
});

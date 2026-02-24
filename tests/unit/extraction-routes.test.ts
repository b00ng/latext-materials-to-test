import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { EnvBindings } from '../../src/env';
import { extractionRoutes } from '../../src/extraction/routes';

class MemoryKv {
  private readonly map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
}

class MemoryR2 {
  async put(): Promise<void> {
    return;
  }

  async get(): Promise<null> {
    return null;
  }

  async delete(): Promise<void> {
    return;
  }
}

describe('extraction routes', () => {
  it('creates extraction jobs and enqueues queue messages', async () => {
    const queueSend = vi.fn().mockResolvedValue(undefined);
    const app = new Hono<{ Bindings: EnvBindings }>();
    app.route('/api/extraction', extractionRoutes);

    const env = {
      CACHE: new MemoryKv(),
      STORAGE: new MemoryR2(),
      EXTRACTION_QUEUE: {
        send: queueSend
      },
      DB: {} as D1Database,
      ENVIRONMENT: 'test',
      NORMALIZER_URL: 'https://normalizer.example.com',
      NORMALIZER_TOKEN: 'token'
    } as unknown as EnvBindings;

    const request = new Request('https://example.com/api/extraction/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        materialId: 'mat-1',
        sourceType: 'pdf',
        files: [{ name: 'a.pdf', contentBase64: btoa('sample') }]
      })
    });

    const response = await app.fetch(request, env);
    const body = (await response.json()) as { jobId: string; status: string };

    expect(response.status).toBe(202);
    expect(body.jobId).toBeTruthy();
    expect(body.status).toBe('queued');
    expect(queueSend).toHaveBeenCalledTimes(1);
  });
});

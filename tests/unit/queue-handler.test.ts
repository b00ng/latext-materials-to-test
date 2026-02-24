import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnvBindings } from '../../src/env';
import { handleExtractionMessage } from '../../src/extraction/queue-handler';
import { readExtractionJob } from '../../src/extraction/job-store';

class MemoryKv {
  private readonly map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
}

class MemoryR2Object {
  private readonly data: Uint8Array;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.data.buffer.slice(this.data.byteOffset, this.data.byteOffset + this.data.byteLength);
  }
}

class MemoryR2 {
  private readonly map = new Map<string, Uint8Array>();

  async put(key: string, value: ArrayBuffer): Promise<void> {
    this.map.set(key, new Uint8Array(value));
  }

  async get(key: string): Promise<MemoryR2Object | null> {
    const value = this.map.get(key);
    return value ? new MemoryR2Object(value) : null;
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}

describe('handleExtractionMessage', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('marks a queued job completed on successful normalization', async () => {
    const cache = new MemoryKv();
    const storage = new MemoryR2();
    await storage.put('inputs/a.pdf', new TextEncoder().encode('sample').buffer);

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          mainFile: 'main.tex',
          fileMap: { 'main.tex': 'normalized output' }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as typeof fetch;

    const env = {
      CACHE: cache,
      STORAGE: storage,
      NORMALIZER_URL: 'https://normalizer.example.com',
      NORMALIZER_TOKEN: 'token',
      DB: {} as D1Database,
      EXTRACTION_QUEUE: {} as Queue,
      ENVIRONMENT: 'test'
    } as unknown as EnvBindings;

    const message = {
      body: {
        jobId: 'job-1',
        materialId: 'mat-1',
        sourceType: 'pdf',
        files: [{ name: 'a.pdf', key: 'inputs/a.pdf' }]
      },
      ack: vi.fn(),
      retry: vi.fn()
    } as unknown as Message<unknown>;

    await handleExtractionMessage(message, env);

    const state = await readExtractionJob(cache as unknown as KVNamespace, 'job-1');
    expect(state?.status).toBe('completed');
    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.retry).not.toHaveBeenCalled();
  });

  it('marks a queued job failed and acknowledges terminal errors', async () => {
    const cache = new MemoryKv();
    const storage = new MemoryR2();
    await storage.put('inputs/a.pdf', new TextEncoder().encode('sample').buffer);

    globalThis.fetch = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 })) as typeof fetch;

    const env = {
      CACHE: cache,
      STORAGE: storage,
      NORMALIZER_URL: 'https://normalizer.example.com',
      NORMALIZER_TOKEN: 'token',
      DB: {} as D1Database,
      EXTRACTION_QUEUE: {} as Queue,
      ENVIRONMENT: 'test'
    } as unknown as EnvBindings;

    const message = {
      body: {
        jobId: 'job-2',
        materialId: 'mat-2',
        sourceType: 'pdf',
        files: [{ name: 'a.pdf', key: 'inputs/a.pdf' }]
      },
      ack: vi.fn(),
      retry: vi.fn()
    } as unknown as Message<unknown>;

    await handleExtractionMessage(message, env);

    const state = await readExtractionJob(cache as unknown as KVNamespace, 'job-2');
    expect(state?.status).toBe('failed');
    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.retry).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import worker from '../../src/index';
import type { EnvBindings } from '../../src/env';
import { apiKeyCacheKey } from '../../src/shared/api-key-auth';
import { MockD1Database } from '../helpers/mock-d1';

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

const createEnv = async (): Promise<EnvBindings & { CACHE: MemoryKv }> => {
  const cache = new MemoryKv();
  await cache.put(apiKeyCacheKey('valid-key'), 'active');
  const db = new MockD1Database();
  db.firstQueue.push({
    id: 'job-1',
    material_id: 'mat-1',
    status: 'pending',
    progress: 0,
    result: null,
    error: null,
    started_at: null,
    completed_at: null,
    created_at: new Date().toISOString()
  });

  return {
    CACHE: cache,
    STORAGE: new MemoryR2(),
    EXTRACTION_QUEUE: {
      send: async () => undefined
    } as Queue,
    DB: db,
    ENVIRONMENT: 'test',
    NORMALIZER_URL: 'https://normalizer.example.com',
    NORMALIZER_TOKEN: 'token'
  } as unknown as EnvBindings & { CACHE: MemoryKv };
};

describe('api auth and canonical jobs route', () => {
  it('rejects missing api key for protected route', async () => {
    const env = await createEnv();

    const response = await worker.fetch(new Request('https://example.com/api/jobs/job-1'), env);
    expect(response.status).toBe(401);
  });

  it('returns job state via canonical /api/jobs/:id when api key is valid', async () => {
    const env = await createEnv();

    const response = await worker.fetch(
      new Request('https://example.com/api/jobs/job-1', {
        headers: {
          'x-api-key': 'valid-key'
        }
      }),
      env
    );

    const body = (await response.json()) as { job: { jobId: string; materialId: string } };
    expect(response.status).toBe(200);
    expect(body.job.jobId).toBe('job-1');
    expect(body.job.materialId).toBe('mat-1');
  });

  it('does not expose duplicate status path at /api/extraction/jobs/:id', async () => {
    const env = await createEnv();

    const response = await worker.fetch(
      new Request('https://example.com/api/extraction/jobs/job-1', {
        headers: {
          'x-api-key': 'valid-key'
        }
      }),
      env
    );

    expect(response.status).toBe(404);
  });

  it('accepts bearer auth token as api key', async () => {
    const env = await createEnv();

    const response = await worker.fetch(
      new Request('https://example.com/api/jobs/job-1', {
        headers: {
          Authorization: 'Bearer valid-key'
        }
      }),
      env
    );

    expect(response.status).toBe(200);
  });
});

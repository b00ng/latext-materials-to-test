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
  readonly puts: Array<{ key: string; value: unknown }> = [];
  readonly deleted: string[] = [];
  private readonly keys = new Set<string>();

  async put(key: string, value: unknown): Promise<void> {
    this.puts.push({ key, value });
    this.keys.add(key);
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    if (!this.keys.has(key)) {
      return null;
    }
    return {
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0)
    } as R2ObjectBody;
  }

  async delete(key: string): Promise<void> {
    this.deleted.push(key);
    this.keys.delete(key);
  }

  async list(options?: { prefix?: string; cursor?: string }): Promise<R2Objects> {
    const prefix = options?.prefix ?? '';
    const objects = [...this.keys]
      .filter((key) => key.startsWith(prefix))
      .sort()
      .map((key) => ({ key }));
    return {
      objects,
      truncated: false
    } as unknown as R2Objects;
  }

  seed(keys: string[]): void {
    for (const key of keys) {
      this.keys.add(key);
    }
  }
}

const createEnv = async (): Promise<
  EnvBindings & { DB: MockD1Database; STORAGE: MemoryR2; queueMessages: unknown[] }
> => {
  const cache = new MemoryKv();
  await cache.put(apiKeyCacheKey('valid-key'), 'active');
  const db = new MockD1Database();
  const storage = new MemoryR2();
  const queueMessages: unknown[] = [];

  return {
    CACHE: cache as unknown as KVNamespace,
    STORAGE: storage as unknown as R2Bucket,
    EXTRACTION_QUEUE: {
      send: async (message: unknown) => {
        queueMessages.push(message);
      }
    } as Queue,
    DB: db,
    ENVIRONMENT: 'test',
    NORMALIZER_URL: 'https://normalizer.example.com',
    NORMALIZER_TOKEN: 'token',
    queueMessages
  } as EnvBindings & { DB: MockD1Database; STORAGE: MemoryR2; queueMessages: unknown[] };
};

const materialRow = (
  id: string,
  status: 'uploaded' | 'normalizing' | 'processing' | 'completed' | 'failed' = 'uploaded',
  sourceType: 'latex' | 'pdf' | 'docx' | 'image' = 'pdf',
  rootKey?: string
) => {
  const key = rootKey ?? `materials/${id}`;
  return {
    id,
    title: `Material ${id}`,
    source_type: sourceType,
    status,
    r2_key: key,
    manifest_key: `${key}/manifest.json`,
    metadata: null,
    error_message: null,
    created_at: '2026-02-24T10:00:00.000Z',
    updated_at: '2026-02-24T10:00:00.000Z'
  };
};

const jobRow = (jobId: string, materialId: string) => ({
  id: jobId,
  material_id: materialId,
  status: 'pending',
  progress: 0,
  result: null,
  error: null,
  started_at: null,
  completed_at: null,
  created_at: '2026-02-24T10:00:00.000Z'
});

const questionRow = (id: string, materialId: string) => ({
  id,
  material_id: materialId,
  stem: `Question ${id}`,
  stem_latex: `Question ${id}`,
  choices: JSON.stringify([
    { label: 'A', text: '1', latex: '1', isCorrect: false },
    { label: 'B', text: '2', latex: '2', isCorrect: false },
    { label: 'C', text: '3', latex: '3', isCorrect: false },
    { label: 'D', text: '4', latex: '4', isCorrect: true }
  ]),
  correct_answer: 'D',
  answer_status: 'confirmed',
  explanation: null,
  explanation_latex: null,
  difficulty: 5,
  topic: 'algebra',
  tags: JSON.stringify(['tag']),
  source_chapter: 1,
  source_section: 'S1',
  source_question_index: 0,
  created_at: '2026-02-24T10:00:00.000Z'
});

describe('materials routes', () => {
  it('accepts files[] uploads with metadata', async () => {
    const env = await createEnv();

    const form = new FormData();
    form.append('materialId', 'mat-upload');
    form.append('title', 'Sample PDF');
    form.append('sourceType', 'pdf');
    form.append('mainFile', 'sample.pdf');
    form.append('files[]', new Blob(['pdf-bytes'], { type: 'application/pdf' }), 'sample.pdf');

    const response = await worker.fetch(
      new Request('https://example.com/api/materials/upload', {
        method: 'POST',
        headers: { 'x-api-key': 'valid-key' },
        body: form
      }),
      env
    );

    expect(response.status).toBe(202);
    expect(env.DB.runCalls.some((call) => call.sql.includes('INSERT INTO materials'))).toBe(true);
    expect(env.DB.runCalls.some((call) => call.sql.includes('INSERT INTO extraction_jobs'))).toBe(true);
    expect(env.STORAGE.puts.length).toBeGreaterThanOrEqual(2);
  });

  it('lists materials with validated query params', async () => {
    const env = await createEnv();
    env.DB.allQueue.push({
      success: true,
      meta: { changes: 2 },
      results: [materialRow('mat-1'), materialRow('mat-2')]
    });

    const response = await worker.fetch(
      new Request('https://example.com/api/materials?status=uploaded&limit=10&offset=0', {
        headers: { 'x-api-key': 'valid-key' }
      }),
      env
    );

    const body = (await response.json()) as { materials: Array<{ id: string }>; count: number };
    expect(response.status).toBe(200);
    expect(body.count).toBe(2);
    expect(body.materials[0].id).toBe('mat-1');
  });

  it('returns material details and latest job', async () => {
    const env = await createEnv();
    env.DB.firstQueue.push(materialRow('mat-3'));
    env.DB.firstQueue.push(jobRow('job-3', 'mat-3'));

    const response = await worker.fetch(
      new Request('https://example.com/api/materials/mat-3', {
        headers: { 'x-api-key': 'valid-key' }
      }),
      env
    );

    const body = (await response.json()) as { material: { id: string }; job: { jobId: string } };
    expect(response.status).toBe(200);
    expect(body.material.id).toBe('mat-3');
    expect(body.job.jobId).toBe('job-3');
  });

  it('returns extracted questions by material id', async () => {
    const env = await createEnv();
    env.DB.firstQueue.push(materialRow('mat-4'));
    env.DB.allQueue.push({
      success: true,
      meta: { changes: 2 },
      results: [questionRow('q-1', 'mat-4'), questionRow('q-2', 'mat-4')]
    });

    const response = await worker.fetch(
      new Request('https://example.com/api/materials/mat-4/questions', {
        headers: { 'x-api-key': 'valid-key' }
      }),
      env
    );

    const body = (await response.json()) as { questions: Array<{ id: string }>; count: number };
    expect(response.status).toBe(200);
    expect(body.count).toBe(2);
    expect(body.questions.map((question) => question.id)).toEqual(['q-1', 'q-2']);
  });

  it('creates a retry extraction job and enqueues it', async () => {
    const env = await createEnv();
    env.DB.firstQueue.push(materialRow('mat-5', 'failed', 'pdf'));

    const response = await worker.fetch(
      new Request('https://example.com/api/materials/mat-5/retry', {
        method: 'POST',
        headers: { 'x-api-key': 'valid-key' }
      }),
      env
    );

    const body = (await response.json()) as {
      jobId: string;
      materialId: string;
      status: string;
    };
    expect(response.status).toBe(202);
    expect(body.jobId).toBeTruthy();
    expect(body.materialId).toBe('mat-5');
    expect(body.status).toBe('queued');
    expect(env.queueMessages).toHaveLength(1);
    expect(env.queueMessages[0]).toMatchObject({
      materialId: 'mat-5',
      sourceType: 'pdf'
    });
  });

  it('deletes material and associated R2 objects', async () => {
    const env = await createEnv();
    env.DB.firstQueue.push(materialRow('mat-6', 'completed', 'pdf', 'materials/mat-6'));
    env.STORAGE.seed([
      'materials/mat-6/job-1/a.pdf',
      'materials/mat-6/job-1/manifest.json',
      'materials/mat-6/job-2/b.pdf'
    ]);

    const response = await worker.fetch(
      new Request('https://example.com/api/materials/mat-6', {
        method: 'DELETE',
        headers: { 'x-api-key': 'valid-key' }
      }),
      env
    );

    const body = (await response.json()) as { deleted: boolean };
    expect(response.status).toBe(200);
    expect(body.deleted).toBe(true);
    expect(env.DB.runCalls.some((call) => call.sql.includes('DELETE FROM materials WHERE id = ?'))).toBe(true);
    expect(env.STORAGE.deleted).toContain('materials/mat-6');
    expect(env.STORAGE.deleted).toContain('materials/mat-6/job-1/a.pdf');
  });
});

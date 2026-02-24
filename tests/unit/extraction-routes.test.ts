import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import type { EnvBindings } from '../../src/env';
import { buildExtractionRoutes } from '../../src/extraction/routes';
import { handleHttpError } from '../../src/http/error-handler';
import type { MaterialRepository } from '../../src/application/ports/output/material-repository';
import type { TestMaterial } from '../../src/domain/entities/test-material';
import type { MaterialMetadata } from '../../src/domain/value-objects/material-metadata';
import type {
  ExtractionJobRepository
} from '../../src/infrastructure/persistence/d1-extraction-job-repository';
import type { ExtractionJobState } from '../../src/extraction/contracts';

class MemoryR2 {
  readonly puts: Array<{ key: string; value: unknown }> = [];

  async put(key: string, value: unknown): Promise<void> {
    this.puts.push({ key, value });
  }
}

class StubMaterialRepository implements MaterialRepository {
  readonly created: TestMaterial[] = [];

  async create(material: TestMaterial): Promise<void> {
    this.created.push(material);
  }

  async findById(_id: string): Promise<TestMaterial | null> {
    return null;
  }

  async findAll(_params?: { status?: TestMaterial['status']; limit?: number; offset?: number }): Promise<TestMaterial[]> {
    return [];
  }

  async updateStatus(_id: string, _status: TestMaterial['status'], _error?: string): Promise<void> {
    return;
  }

  async updateMetadata(_id: string, _metadata: MaterialMetadata): Promise<void> {
    return;
  }

  async delete(_id: string): Promise<void> {
    return;
  }
}

class StubJobRepository implements ExtractionJobRepository {
  readonly created: Array<{ jobId: string; materialId: string }> = [];
  private readonly jobs = new Map<string, ExtractionJobState>();

  async createPending(jobId: string, materialId: string): Promise<void> {
    this.created.push({ jobId, materialId });
    this.jobs.set(jobId, {
      jobId,
      materialId,
      status: 'pending',
      progress: 0,
      createdAt: new Date().toISOString()
    });
  }

  async findById(jobId: string): Promise<ExtractionJobState | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async markProcessing(_jobId: string, _progress: number): Promise<void> {
    return;
  }

  async updateProgress(_jobId: string, _progress: number): Promise<void> {
    return;
  }

  async markCompleted(_jobId: string, _result: Record<string, unknown>): Promise<void> {
    return;
  }

  async markFailed(_jobId: string, _error: string): Promise<void> {
    return;
  }

  async markRetryPending(_jobId: string, _error: string): Promise<void> {
    return;
  }
}

describe('extraction routes', () => {
  const createEnv = (queueSend: ReturnType<typeof vi.fn>, storage: MemoryR2): EnvBindings =>
    ({
      CACHE: {} as KVNamespace,
      STORAGE: storage as unknown as R2Bucket,
      EXTRACTION_QUEUE: { send: queueSend } as Queue,
      DB: {} as D1Database,
      ENVIRONMENT: 'test',
      NORMALIZER_URL: 'https://normalizer.example.com',
      NORMALIZER_TOKEN: 'token'
    }) as EnvBindings;

  it('creates extraction jobs and enqueues queue messages from JSON payload', async () => {
    const queueSend = vi.fn().mockResolvedValue(undefined);
    const storage = new MemoryR2();
    const materialRepo = new StubMaterialRepository();
    const jobRepo = new StubJobRepository();
    const app = new Hono<{ Bindings: EnvBindings }>();
    app.route('/api/extraction', buildExtractionRoutes(() => ({ materialRepo, jobRepo })));
    app.onError((error, c) => handleHttpError(error, c));
    const env = createEnv(queueSend, storage);

    const request = new Request('https://example.com/api/extraction/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        materialId: 'mat-1',
        sourceType: 'pdf',
        title: 'Sample material',
        mainFile: 'a.pdf',
        files: [{ name: 'a.pdf', contentBase64: btoa('sample') }]
      })
    });

    const response = await app.fetch(request, env);
    const body = (await response.json()) as { jobId: string; status: string };

    expect(response.status).toBe(202);
    expect(body.jobId).toBeTruthy();
    expect(body.status).toBe('queued');
    expect(queueSend).toHaveBeenCalledTimes(1);
    expect(materialRepo.created).toHaveLength(1);
    expect(materialRepo.created[0].title).toBe('Sample material');
    expect(jobRepo.created).toHaveLength(1);
    expect(storage.puts.length).toBeGreaterThanOrEqual(2);
  });

  it('accepts multipart files[] payloads', async () => {
    const queueSend = vi.fn().mockResolvedValue(undefined);
    const storage = new MemoryR2();
    const materialRepo = new StubMaterialRepository();
    const jobRepo = new StubJobRepository();
    const app = new Hono<{ Bindings: EnvBindings }>();
    app.route('/api/extraction', buildExtractionRoutes(() => ({ materialRepo, jobRepo })));
    app.onError((error, c) => handleHttpError(error, c));
    const env = createEnv(queueSend, storage);

    const form = new FormData();
    form.append('materialId', 'mat-2');
    form.append('sourceType', 'pdf');
    form.append('files[]', new Blob(['sample pdf content'], { type: 'application/pdf' }), 'sample.pdf');

    const request = new Request('https://example.com/api/extraction/jobs', {
      method: 'POST',
      body: form
    });

    const response = await app.fetch(request, env);
    const body = (await response.json()) as { materialId: string; status: string };

    expect(response.status).toBe(202);
    expect(body.materialId).toBe('mat-2');
    expect(body.status).toBe('queued');
    expect(queueSend).toHaveBeenCalledTimes(1);
    expect(materialRepo.created).toHaveLength(1);
  });

  it('detects latex source type from multipart files when sourceType is omitted', async () => {
    const queueSend = vi.fn().mockResolvedValue(undefined);
    const storage = new MemoryR2();
    const materialRepo = new StubMaterialRepository();
    const jobRepo = new StubJobRepository();
    const app = new Hono<{ Bindings: EnvBindings }>();
    app.route('/api/extraction', buildExtractionRoutes(() => ({ materialRepo, jobRepo })));
    app.onError((error, c) => handleHttpError(error, c));
    const env = createEnv(queueSend, storage);

    const form = new FormData();
    form.append('materialId', 'mat-latex');
    form.append('mainFile', 'main.tex');
    form.append('title', 'Latex source');
    form.append('files[]', new Blob(['\\begin{document}x\\end{document}'], { type: 'text/plain' }), 'main.tex');

    const request = new Request('https://example.com/api/extraction/jobs', {
      method: 'POST',
      body: form
    });

    const response = await app.fetch(request, env);
    expect(response.status).toBe(202);
    expect(materialRepo.created).toHaveLength(1);
    expect(materialRepo.created[0].sourceType).toBe('latex');
    expect(materialRepo.created[0].title).toBe('Latex source');
  });
});

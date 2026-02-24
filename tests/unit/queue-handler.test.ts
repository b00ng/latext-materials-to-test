import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnvBindings } from '../../src/env';
import type { ExtractionJobState } from '../../src/extraction/contracts';
import { handleExtractionMessage } from '../../src/extraction/queue-handler';
import type { ExtractionJobRepository } from '../../src/infrastructure/persistence/d1-extraction-job-repository';

class MemoryJobRepository implements ExtractionJobRepository {
  readonly jobs = new Map<string, ExtractionJobState>();
  readonly events: string[] = [];

  async createPending(jobId: string, materialId: string): Promise<void> {
    if (!this.jobs.has(jobId)) {
      this.jobs.set(jobId, {
        jobId,
        materialId,
        status: 'pending',
        progress: 0,
        createdAt: new Date().toISOString()
      });
    }
    this.events.push(`create:${jobId}`);
  }

  async findById(jobId: string): Promise<ExtractionJobState | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async markProcessing(jobId: string, progress: number): Promise<void> {
    const current = this.jobs.get(jobId);
    if (!current) {
      return;
    }
    current.status = 'processing';
    current.progress = progress;
    current.startedAt = current.startedAt ?? new Date().toISOString();
    this.events.push(`processing:${progress}`);
  }

  async updateProgress(jobId: string, progress: number): Promise<void> {
    const current = this.jobs.get(jobId);
    if (!current) {
      return;
    }
    current.progress = progress;
    this.events.push(`progress:${progress}`);
  }

  async markCompleted(jobId: string, result: Record<string, unknown>): Promise<void> {
    const current = this.jobs.get(jobId);
    if (!current) {
      return;
    }
    current.status = 'completed';
    current.progress = 100;
    current.result = result;
    current.errorMessage = undefined;
    current.completedAt = new Date().toISOString();
    this.events.push('completed');
  }

  async markFailed(jobId: string, error: string): Promise<void> {
    const current = this.jobs.get(jobId);
    if (!current) {
      return;
    }
    current.status = 'failed';
    current.errorMessage = error;
    current.completedAt = new Date().toISOString();
    this.events.push('failed');
  }

  async markRetryPending(jobId: string, error: string): Promise<void> {
    const current = this.jobs.get(jobId);
    if (!current) {
      return;
    }
    current.status = 'pending';
    current.errorMessage = error;
    current.completedAt = null;
    this.events.push('retry-pending');
  }
}

const env = {
  DB: {} as D1Database,
  STORAGE: {} as R2Bucket,
  EXTRACTION_QUEUE: {} as Queue,
  CACHE: {} as KVNamespace,
  ENVIRONMENT: 'test',
  NORMALIZER_URL: 'https://normalizer.example.com',
  NORMALIZER_TOKEN: 'token'
} as unknown as EnvBindings;

describe('handleExtractionMessage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes processing/progress/completed lifecycle and acknowledges', async () => {
    const jobRepo = new MemoryJobRepository();
    const runExtraction = vi.fn().mockResolvedValue(7);
    const message = {
      body: { jobId: 'job-1', materialId: 'mat-1', sourceType: 'pdf' },
      ack: vi.fn(),
      retry: vi.fn()
    } as unknown as Message<unknown>;

    await handleExtractionMessage(
      message,
      env,
      () => ({ jobRepo, runExtraction })
    );

    const state = jobRepo.jobs.get('job-1');
    expect(state?.status).toBe('completed');
    expect(state?.progress).toBe(100);
    expect(state?.result).toEqual({ questionCount: 7 });
    expect(jobRepo.events).toEqual([
      'create:job-1',
      'processing:10',
      'progress:35',
      'progress:90',
      'completed'
    ]);
    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.retry).not.toHaveBeenCalled();
  });

  it('retries retriable errors before max attempts', async () => {
    const jobRepo = new MemoryJobRepository();
    const runExtraction = vi.fn().mockRejectedValue(new Error('Normalizer request failed with 503: upstream'));
    const message = {
      body: { jobId: 'job-2', materialId: 'mat-2', sourceType: 'pdf' },
      attempts: 1,
      ack: vi.fn(),
      retry: vi.fn()
    } as unknown as Message<unknown>;

    await handleExtractionMessage(
      message,
      env,
      () => ({ jobRepo, runExtraction })
    );

    expect(jobRepo.jobs.get('job-2')?.status).toBe('pending');
    expect(jobRepo.events).toContain('retry-pending');
    expect(message.retry).toHaveBeenCalledTimes(1);
    expect(message.ack).not.toHaveBeenCalled();
  });

  it('marks job failed on terminal errors', async () => {
    const jobRepo = new MemoryJobRepository();
    const runExtraction = vi.fn().mockRejectedValue(new Error('Material mat-3 not found'));
    const message = {
      body: { jobId: 'job-3', materialId: 'mat-3', sourceType: 'pdf' },
      attempts: 1,
      ack: vi.fn(),
      retry: vi.fn()
    } as unknown as Message<unknown>;

    await handleExtractionMessage(
      message,
      env,
      () => ({ jobRepo, runExtraction })
    );

    expect(jobRepo.jobs.get('job-3')?.status).toBe('failed');
    expect(jobRepo.jobs.get('job-3')?.errorMessage).toContain('not found');
    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.retry).not.toHaveBeenCalled();
  });

  it('is idempotent for already completed jobs', async () => {
    const jobRepo = new MemoryJobRepository();
    jobRepo.jobs.set('job-4', {
      jobId: 'job-4',
      materialId: 'mat-4',
      status: 'completed',
      progress: 100,
      createdAt: new Date().toISOString()
    });

    const runExtraction = vi.fn().mockResolvedValue(1);
    const message = {
      body: { jobId: 'job-4', materialId: 'mat-4', sourceType: 'pdf' },
      ack: vi.fn(),
      retry: vi.fn()
    } as unknown as Message<unknown>;

    await handleExtractionMessage(
      message,
      env,
      () => ({ jobRepo, runExtraction })
    );

    expect(runExtraction).not.toHaveBeenCalled();
    expect(jobRepo.events).toEqual([]);
    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.retry).not.toHaveBeenCalled();
  });
});

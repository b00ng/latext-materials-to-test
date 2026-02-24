import { describe, expect, it } from 'vitest';

import { D1ExtractionJobRepository } from '../../src/infrastructure/persistence/d1-extraction-job-repository';
import { MockD1Database } from '../helpers/mock-d1';

describe('D1ExtractionJobRepository', () => {
  it('creates pending jobs and maps findById payloads', async () => {
    const db = new MockD1Database();
    const repo = new D1ExtractionJobRepository(db);

    await repo.createPending('job-1', 'mat-1');
    db.firstQueue.push({
      id: 'job-1',
      material_id: 'mat-1',
      status: 'processing',
      progress: 40,
      result: JSON.stringify({ questionCount: 3 }),
      error: null,
      started_at: '2026-02-24T12:00:00.000Z',
      completed_at: null,
      created_at: '2026-02-24T11:59:00.000Z'
    });

    const state = await repo.findById('job-1');

    expect(db.runCalls[0].sql).toContain('INSERT INTO extraction_jobs');
    expect(state?.status).toBe('processing');
    expect(state?.progress).toBe(40);
    expect(state?.result).toEqual({ questionCount: 3 });
  });

  it('writes completed/failed/retry transitions', async () => {
    const db = new MockD1Database();
    const repo = new D1ExtractionJobRepository(db);

    await repo.markProcessing('job-2', 10);
    await repo.updateProgress('job-2', 80);
    await repo.markCompleted('job-2', { questionCount: 10 });
    await repo.markRetryPending('job-2', 'temporary');
    await repo.markFailed('job-2', 'terminal');

    expect(db.runCalls).toHaveLength(5);
    expect(db.runCalls[0].sql).toContain("status = 'processing'");
    expect(db.runCalls[1].sql).toContain('SET progress = ?');
    expect(db.runCalls[2].sql).toContain("status = 'completed'");
    expect(db.runCalls[3].sql).toContain("status = 'pending'");
    expect(db.runCalls[4].sql).toContain("status = 'failed'");
  });
});

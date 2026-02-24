import { describe, expect, it } from 'vitest';
import worker from '../../src/index';
import { createApiTestEnv, extractionJobRow } from '../helpers/api-test-env';

describe('jobs api integration', () => {
  it('serves job status from canonical /api/jobs/:id path', async () => {
    const env = await createApiTestEnv();
    env.DB.firstQueue.push(extractionJobRow('job-1', 'mat-1', 'processing'));

    const response = await worker.fetch(
      new Request('https://example.com/api/jobs/job-1', {
        headers: { 'x-api-key': 'valid-key' }
      }),
      env
    );

    const body = (await response.json()) as { job: { jobId: string; materialId: string; status: string } };
    expect(response.status).toBe(200);
    expect(body.job.jobId).toBe('job-1');
    expect(body.job.materialId).toBe('mat-1');
    expect(body.job.status).toBe('processing');
  });

  it('does not expose legacy /api/extraction/jobs/:id status route', async () => {
    const env = await createApiTestEnv();

    const response = await worker.fetch(
      new Request('https://example.com/api/extraction/jobs/job-1', {
        headers: { 'x-api-key': 'valid-key' }
      }),
      env
    );

    expect(response.status).toBe(404);
  });
});

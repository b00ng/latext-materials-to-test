import { describe, expect, it } from 'vitest';
import worker from '../../src/index';
import { createApiTestEnv, extractionJobRow, materialRow, questionRow } from '../helpers/api-test-env';

describe('materials api integration', () => {
  it('supports upload, list, details, questions, retry, and delete flows', async () => {
    const env = await createApiTestEnv();

    const form = new FormData();
    form.append('materialId', 'mat-upload');
    form.append('title', 'Sample PDF');
    form.append('sourceType', 'pdf');
    form.append('mainFile', 'sample.pdf');
    form.append('files[]', new Blob(['pdf-bytes'], { type: 'application/pdf' }), 'sample.pdf');

    const uploadResponse = await worker.fetch(
      new Request('https://example.com/api/materials/upload', {
        method: 'POST',
        headers: { 'x-api-key': 'valid-key' },
        body: form
      }),
      env
    );
    expect(uploadResponse.status).toBe(202);
    expect(env.queueMessages).toHaveLength(1);

    env.DB.allQueue.push({
      success: true,
      meta: { changes: 1 },
      results: [materialRow('mat-upload')]
    });
    const listResponse = await worker.fetch(
      new Request('https://example.com/api/materials?status=uploaded&limit=10&offset=0', {
        headers: { 'x-api-key': 'valid-key' }
      }),
      env
    );
    const listBody = (await listResponse.json()) as { count: number };
    expect(listResponse.status).toBe(200);
    expect(listBody.count).toBe(1);

    env.DB.firstQueue.push(materialRow('mat-upload'));
    env.DB.firstQueue.push(extractionJobRow('job-1', 'mat-upload'));
    const getResponse = await worker.fetch(
      new Request('https://example.com/api/materials/mat-upload', {
        headers: { 'x-api-key': 'valid-key' }
      }),
      env
    );
    const getBody = (await getResponse.json()) as { material: { id: string }; job: { jobId: string } };
    expect(getResponse.status).toBe(200);
    expect(getBody.material.id).toBe('mat-upload');
    expect(getBody.job.jobId).toBe('job-1');

    env.DB.firstQueue.push(materialRow('mat-upload'));
    env.DB.allQueue.push({
      success: true,
      meta: { changes: 1 },
      results: [questionRow('q-1', 'mat-upload')]
    });
    const questionsResponse = await worker.fetch(
      new Request('https://example.com/api/materials/mat-upload/questions', {
        headers: { 'x-api-key': 'valid-key' }
      }),
      env
    );
    const questionsBody = (await questionsResponse.json()) as { count: number };
    expect(questionsResponse.status).toBe(200);
    expect(questionsBody.count).toBe(1);

    env.DB.firstQueue.push(materialRow('mat-upload', 'failed', 'pdf'));
    const retryResponse = await worker.fetch(
      new Request('https://example.com/api/materials/mat-upload/retry', {
        method: 'POST',
        headers: { 'x-api-key': 'valid-key' }
      }),
      env
    );
    expect(retryResponse.status).toBe(202);
    expect(env.queueMessages).toHaveLength(2);

    env.DB.firstQueue.push(materialRow('mat-upload', 'completed', 'pdf', 'materials/mat-upload'));
    env.STORAGE.seed([
      'materials/mat-upload/job-1/sample.pdf',
      'materials/mat-upload/job-1/manifest.json',
      'materials/mat-upload/job-2/sample-2.pdf'
    ]);
    const deleteResponse = await worker.fetch(
      new Request('https://example.com/api/materials/mat-upload', {
        method: 'DELETE',
        headers: { 'x-api-key': 'valid-key' }
      }),
      env
    );
    const deleteBody = (await deleteResponse.json()) as { deleted: boolean };
    expect(deleteResponse.status).toBe(200);
    expect(deleteBody.deleted).toBe(true);
    expect(env.STORAGE.deleted).toContain('materials/mat-upload/job-1/sample.pdf');
  });
});

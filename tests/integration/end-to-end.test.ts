import { describe, expect, it } from 'vitest';
import worker from '../../src/index';
import { createApiTestEnv, materialRow, questionRow } from '../helpers/api-test-env';

type UploadResponse = {
  jobId: string;
  materialId: string;
  status: string;
};

describe('end-to-end api flow', () => {
  it('runs upload -> job status -> extracted questions -> test generation', async () => {
    const env = await createApiTestEnv();

    const uploadForm = new FormData();
    uploadForm.append('materialId', 'mat-e2e-1');
    uploadForm.append('sourceType', 'latex');
    uploadForm.append('mainFile', 'main.tex');
    uploadForm.append('title', 'E2E LaTeX Sample');
    uploadForm.append('files[]', new Blob(['\\begin{enumerate}\\item 1+1=2\\end{enumerate}']), 'main.tex');

    const uploadResponse = await worker.fetch(
      new Request('https://example.com/api/materials/upload', {
        method: 'POST',
        headers: { 'x-api-key': 'valid-key' },
        body: uploadForm
      }),
      env
    );
    expect(uploadResponse.status).toBe(202);
    const uploadBody = (await uploadResponse.json()) as UploadResponse;
    expect(uploadBody.materialId).toBe('mat-e2e-1');
    expect(uploadBody.jobId).toBeTruthy();
    expect(uploadBody.status).toBe('queued');

    env.DB.firstQueue.push({
      id: uploadBody.jobId,
      material_id: uploadBody.materialId,
      status: 'completed',
      progress: 100,
      result: JSON.stringify({ questionCount: 2 }),
      error: null,
      started_at: '2026-02-24T10:00:10.000Z',
      completed_at: '2026-02-24T10:00:20.000Z',
      created_at: '2026-02-24T10:00:00.000Z'
    });
    const jobResponse = await worker.fetch(
      new Request(`https://example.com/api/jobs/${uploadBody.jobId}`, {
        headers: { 'x-api-key': 'valid-key' }
      }),
      env
    );
    expect(jobResponse.status).toBe(200);
    const jobBody = (await jobResponse.json()) as { job: { jobId: string; status: string; progress: number } };
    expect(jobBody.job.jobId).toBe(uploadBody.jobId);
    expect(jobBody.job.status).toBe('completed');
    expect(jobBody.job.progress).toBe(100);

    env.DB.firstQueue.push(materialRow(uploadBody.materialId, 'completed', 'latex'));
    env.DB.allQueue.push({
      success: true,
      meta: { changes: 2 },
      results: [
        questionRow('q-2', uploadBody.materialId, 'algebra', 4),
        questionRow('q-1', uploadBody.materialId, 'algebra', 4)
      ]
    });
    const questionsResponse = await worker.fetch(
      new Request(`https://example.com/api/materials/${uploadBody.materialId}/questions`, {
        headers: { 'x-api-key': 'valid-key' }
      }),
      env
    );
    expect(questionsResponse.status).toBe(200);
    const questionsBody = (await questionsResponse.json()) as {
      count: number;
      questions: Array<{ id: string; materialId: string }>;
    };
    expect(questionsBody.count).toBe(2);
    expect(questionsBody.questions.map((question) => question.id)).toEqual(['q-2', 'q-1']);
    expect(questionsBody.questions.every((question) => question.materialId === uploadBody.materialId)).toBe(true);

    env.DB.allQueue.push({
      success: true,
      meta: { changes: 2 },
      results: [
        questionRow('q-2', uploadBody.materialId, 'algebra', 4),
        questionRow('q-1', uploadBody.materialId, 'algebra', 4)
      ]
    });
    const generateResponse = await worker.fetch(
      new Request('https://example.com/api/tests/generate', {
        method: 'POST',
        headers: {
          'x-api-key': 'valid-key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'E2E Generated Test',
          questionCount: 2,
          topics: ['algebra'],
          materialIds: [uploadBody.materialId]
        })
      }),
      env
    );
    expect(generateResponse.status).toBe(201);
    const generateBody = (await generateResponse.json()) as {
      test: { id: string; questionIds: string[]; totalQuestions: number };
      questions: Array<{ id: string }>;
    };
    expect(generateBody.test.id).toBeTruthy();
    expect(generateBody.test.totalQuestions).toBe(2);
    expect(generateBody.test.questionIds).toEqual(['q-1', 'q-2']);
    expect(generateBody.questions.map((question) => question.id)).toEqual(['q-1', 'q-2']);
  });
});

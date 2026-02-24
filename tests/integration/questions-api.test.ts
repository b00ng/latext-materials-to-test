import { describe, expect, it } from 'vitest';
import worker from '../../src/index';
import { createApiTestEnv, questionRow } from '../helpers/api-test-env';

describe('questions api integration', () => {
  it('lists questions with filters', async () => {
    const env = await createApiTestEnv();
    env.DB.allQueue.push({
      success: true,
      meta: { changes: 2 },
      results: [questionRow('q-1', 'mat-1', 'algebra', 4), questionRow('q-2', 'mat-1', 'algebra', 6)]
    });

    const response = await worker.fetch(
      new Request(
        'https://example.com/api/questions?materialId=mat-1&topic=algebra&difficultyMin=3&difficultyMax=8&limit=10&offset=0',
        {
          headers: { 'x-api-key': 'valid-key' }
        }
      ),
      env
    );

    const body = (await response.json()) as { questions: Array<{ id: string }>; count: number };
    expect(response.status).toBe(200);
    expect(body.count).toBe(2);
    expect(body.questions.map((question) => question.id)).toEqual(['q-1', 'q-2']);
  });

  it('gets and patches a question', async () => {
    const env = await createApiTestEnv();

    env.DB.firstQueue.push(questionRow('q-9', 'mat-9', 'geometry', 5));
    const getResponse = await worker.fetch(
      new Request('https://example.com/api/questions/q-9', {
        headers: { 'x-api-key': 'valid-key' }
      }),
      env
    );
    const getBody = (await getResponse.json()) as { question: { id: string } };
    expect(getResponse.status).toBe(200);
    expect(getBody.question.id).toBe('q-9');

    env.DB.firstQueue.push(questionRow('q-9', 'mat-9', 'geometry', 7));
    const patchResponse = await worker.fetch(
      new Request('https://example.com/api/questions/q-9', {
        method: 'PATCH',
        headers: {
          'x-api-key': 'valid-key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          topic: 'geometry',
          difficulty: 7
        })
      }),
      env
    );

    const patchBody = (await patchResponse.json()) as { question: { difficulty: number } };
    expect(patchResponse.status).toBe(200);
    expect(patchBody.question.difficulty).toBe(7);
    expect(env.DB.runCalls.some((call) => call.sql.includes('UPDATE questions SET'))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import worker from '../../src/index';
import { createApiTestEnv, questionRow, testSheetRow } from '../helpers/api-test-env';

describe('tests api integration', () => {
  it('generates deterministic tests from filtered questions', async () => {
    const env = await createApiTestEnv();
    env.DB.allQueue.push({
      success: true,
      meta: { changes: 3 },
      results: [
        questionRow('q-3', 'mat-1', 'algebra', 5),
        questionRow('q-1', 'mat-1', 'algebra', 5),
        questionRow('q-2', 'mat-1', 'algebra', 5)
      ]
    });

    const response = await worker.fetch(
      new Request('https://example.com/api/tests/generate', {
        method: 'POST',
        headers: {
          'x-api-key': 'valid-key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'Midterm',
          questionCount: 2,
          topics: ['algebra'],
          materialIds: ['mat-1']
        })
      }),
      env
    );

    const body = (await response.json()) as { test: { questionIds: string[] } };
    expect(response.status).toBe(201);
    expect(body.test.questionIds).toEqual(['q-1', 'q-2']);
    expect(env.DB.runCalls.some((call) => call.sql.includes('INSERT INTO test_sheets'))).toBe(true);
  });

  it('lists and fetches persisted tests with questions', async () => {
    const env = await createApiTestEnv();
    env.DB.allQueue.push({
      success: true,
      meta: { changes: 1 },
      results: [testSheetRow('test-1', ['q-1'])]
    });

    const listResponse = await worker.fetch(
      new Request('https://example.com/api/tests?limit=10&offset=0', {
        headers: { 'x-api-key': 'valid-key' }
      }),
      env
    );
    const listBody = (await listResponse.json()) as { count: number };
    expect(listResponse.status).toBe(200);
    expect(listBody.count).toBe(1);

    env.DB.firstQueue.push(testSheetRow('test-1', ['q-1']));
    env.DB.firstQueue.push(questionRow('q-1', 'mat-1', 'algebra', 5));
    const getResponse = await worker.fetch(
      new Request('https://example.com/api/tests/test-1', {
        headers: { 'x-api-key': 'valid-key' }
      }),
      env
    );
    const getBody = (await getResponse.json()) as { questions: Array<{ id: string }> };
    expect(getResponse.status).toBe(200);
    expect(getBody.questions.map((question) => question.id)).toEqual(['q-1']);
  });
});

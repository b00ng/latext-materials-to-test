import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';

import type { EnvBindings } from '../../src/env';
import type { MCQQuestion } from '../../src/domain/entities/mcq-question';
import { handleHttpError } from '../../src/http/error-handler';
import { buildTestsRoutes } from '../../src/http/routes/tests-routes';
import type { QuestionRepository } from '../../src/application/ports/output/question-repository';
import { MockD1Database } from '../helpers/mock-d1';

class StubQuestionRepository implements QuestionRepository {
  constructor(private readonly questions: MCQQuestion[]) {}

  async createMany(): Promise<void> {
    return;
  }

  async findById(id: string): Promise<MCQQuestion | null> {
    return this.questions.find((question) => question.id === id) ?? null;
  }

  async findByMaterialId(materialId: string): Promise<MCQQuestion[]> {
    return this.questions.filter((question) => question.materialId === materialId);
  }

  async findAll(): Promise<MCQQuestion[]> {
    return this.questions;
  }

  async update(): Promise<MCQQuestion | null> {
    return null;
  }

  async deleteByMaterialId(): Promise<number> {
    return 0;
  }
}

const buildQuestion = (id: string, materialId: string, topic: string, difficulty: number): MCQQuestion => ({
  id,
  materialId,
  stem: id,
  stemLatex: id,
  choices: [
    { label: 'A', text: 'A', latex: 'A', isCorrect: false },
    { label: 'B', text: 'B', latex: 'B', isCorrect: true },
    { label: 'C', text: 'C', latex: 'C', isCorrect: false },
    { label: 'D', text: 'D', latex: 'D', isCorrect: false }
  ],
  correctAnswer: 'B',
  answerStatus: 'confirmed',
  explanation: null,
  explanationLatex: null,
  difficulty,
  topic,
  tags: [],
  sourceRef: {
    materialId,
    chapter: 1,
    section: 'S',
    questionIndex: 0
  },
  createdAt: new Date('2026-02-24T12:00:00.000Z')
});

const createEnv = (db: MockD1Database): EnvBindings =>
  ({
    CACHE: {} as KVNamespace,
    STORAGE: {} as R2Bucket,
    EXTRACTION_QUEUE: {} as Queue,
    DB: db,
    ENVIRONMENT: 'test',
    NORMALIZER_URL: 'https://normalizer.example.com',
    NORMALIZER_TOKEN: 'token'
  }) as unknown as EnvBindings;

describe('tests routes', () => {
  it('generates deterministic tests and writes test_sheets rows', async () => {
    const db = new MockD1Database();
    const repo = new StubQuestionRepository([
      buildQuestion('q-3', 'mat-1', 'algebra', 5),
      buildQuestion('q-1', 'mat-1', 'algebra', 5),
      buildQuestion('q-2', 'mat-1', 'algebra', 5)
    ]);
    const app = new Hono<{ Bindings: EnvBindings }>();
    app.route('/api/tests', buildTestsRoutes(() => ({ questionRepo: repo })));
    app.onError((error, c) => handleHttpError(error, c));

    const response = await app.fetch(
      new Request('https://example.com/api/tests/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Midterm',
          questionCount: 2,
          topics: ['algebra'],
          materialIds: ['mat-1']
        })
      }),
      createEnv(db)
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { test: { questionIds: string[] } };
    expect(body.test.questionIds).toEqual(['q-1', 'q-2']);
    expect(db.runCalls[0].sql).toContain('INSERT INTO test_sheets');
  });

  it('returns insufficient questions error when filters cannot satisfy count', async () => {
    const db = new MockD1Database();
    const repo = new StubQuestionRepository([buildQuestion('q-1', 'mat-1', 'geometry', 4)]);
    const app = new Hono<{ Bindings: EnvBindings }>();
    app.route('/api/tests', buildTestsRoutes(() => ({ questionRepo: repo })));
    app.onError((error, c) => handleHttpError(error, c));

    const response = await app.fetch(
      new Request('https://example.com/api/tests/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Final',
          questionCount: 2,
          topics: ['geometry']
        })
      }),
      createEnv(db)
    );

    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INSUFFICIENT_QUESTIONS');
  });

  it('lists and fetches persisted tests', async () => {
    const db = new MockD1Database();
    db.allQueue.push({
      success: true,
      meta: { changes: 1 },
      results: [
        {
          id: 'test-1',
          title: 'Quiz',
          subject: 'math',
          total_questions: 1,
          duration_minutes: 30,
          question_ids: JSON.stringify(['q-1']),
          created_at: '2026-02-24T12:00:00.000Z'
        }
      ]
    });
    db.firstQueue.push({
      id: 'test-1',
      title: 'Quiz',
      subject: 'math',
      total_questions: 1,
      duration_minutes: 30,
      question_ids: JSON.stringify(['q-1']),
      created_at: '2026-02-24T12:00:00.000Z'
    });

    const repo = new StubQuestionRepository([buildQuestion('q-1', 'mat-1', 'algebra', 5)]);
    const app = new Hono<{ Bindings: EnvBindings }>();
    app.route('/api/tests', buildTestsRoutes(() => ({ questionRepo: repo })));
    app.onError((error, c) => handleHttpError(error, c));
    const env = createEnv(db);

    const listResponse = await app.fetch(new Request('https://example.com/api/tests?limit=10&offset=0'), env);
    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as { count: number };
    expect(listBody.count).toBe(1);

    const getResponse = await app.fetch(new Request('https://example.com/api/tests/test-1'), env);
    expect(getResponse.status).toBe(200);
    const getBody = (await getResponse.json()) as { questions: MCQQuestion[] };
    expect(getBody.questions).toHaveLength(1);
    expect(getBody.questions[0].id).toBe('q-1');
  });
});

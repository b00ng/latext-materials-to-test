import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';

import type { EnvBindings } from '../../src/env';
import type { MCQQuestion } from '../../src/domain/entities/mcq-question';
import { handleHttpError } from '../../src/http/error-handler';
import { buildQuestionsRoutes } from '../../src/http/routes/questions-routes';
import type { QuestionRepository } from '../../src/application/ports/output/question-repository';

class StubQuestionRepository implements QuestionRepository {
  readonly listParams: Array<Parameters<QuestionRepository['findAll']>[0]> = [];
  readonly items = new Map<string, MCQQuestion>();

  async createMany(questions: MCQQuestion[]): Promise<void> {
    for (const question of questions) {
      this.items.set(question.id, question);
    }
  }

  async findById(id: string): Promise<MCQQuestion | null> {
    return this.items.get(id) ?? null;
  }

  async findByMaterialId(materialId: string): Promise<MCQQuestion[]> {
    return [...this.items.values()].filter((item) => item.materialId === materialId);
  }

  async findAll(params?: Parameters<QuestionRepository['findAll']>[0]): Promise<MCQQuestion[]> {
    this.listParams.push(params);
    return [...this.items.values()];
  }

  async update(id: string, updates: Partial<MCQQuestion>): Promise<MCQQuestion | null> {
    const item = this.items.get(id);
    if (!item) {
      return null;
    }
    const next = { ...item, ...updates };
    this.items.set(id, next);
    return next;
  }

  async deleteByMaterialId(materialId: string): Promise<number> {
    const before = this.items.size;
    for (const question of [...this.items.values()]) {
      if (question.materialId === materialId) {
        this.items.delete(question.id);
      }
    }
    return before - this.items.size;
  }
}

const sampleQuestion = (): MCQQuestion => ({
  id: 'q-1',
  materialId: 'mat-1',
  stem: 'What is 2+2?',
  stemLatex: 'What is 2+2?',
  choices: [
    { label: 'A', text: '1', latex: '1', isCorrect: false },
    { label: 'B', text: '2', latex: '2', isCorrect: false },
    { label: 'C', text: '3', latex: '3', isCorrect: false },
    { label: 'D', text: '4', latex: '4', isCorrect: true }
  ],
  correctAnswer: 'D',
  answerStatus: 'confirmed',
  explanation: null,
  explanationLatex: null,
  difficulty: 4,
  topic: 'arithmetic',
  tags: ['algebra'],
  sourceRef: {
    materialId: 'mat-1',
    chapter: 1,
    section: 'S1',
    questionIndex: 0
  },
  createdAt: new Date()
});

const createEnv = (): EnvBindings =>
  ({
    CACHE: {} as KVNamespace,
    STORAGE: {} as R2Bucket,
    EXTRACTION_QUEUE: {} as Queue,
    DB: {} as D1Database,
    ENVIRONMENT: 'test',
    NORMALIZER_URL: 'https://normalizer.example.com',
    NORMALIZER_TOKEN: 'token'
  }) as EnvBindings;

describe('questions routes', () => {
  it('lists questions with validated filters', async () => {
    const repo = new StubQuestionRepository();
    await repo.createMany([sampleQuestion()]);
    const app = new Hono<{ Bindings: EnvBindings }>();
    app.route('/api/questions', buildQuestionsRoutes(() => ({ questionRepo: repo })));
    app.onError((error, c) => handleHttpError(error, c));

    const response = await app.fetch(
      new Request(
        'https://example.com/api/questions?materialId=mat-1&difficultyMin=2&difficultyMax=5&limit=10&offset=0'
      ),
      createEnv()
    );

    const body = (await response.json()) as { questions: unknown[]; count: number };
    expect(response.status).toBe(200);
    expect(body.count).toBe(1);
    expect(repo.listParams[0]).toMatchObject({
      materialId: 'mat-1',
      difficulty: { min: 2, max: 5 },
      limit: 10,
      offset: 0
    });
  });

  it('updates question fields via PATCH', async () => {
    const repo = new StubQuestionRepository();
    await repo.createMany([sampleQuestion()]);
    const app = new Hono<{ Bindings: EnvBindings }>();
    app.route('/api/questions', buildQuestionsRoutes(() => ({ questionRepo: repo })));
    app.onError((error, c) => handleHttpError(error, c));

    const response = await app.fetch(
      new Request('https://example.com/api/questions/q-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'geometry',
          difficulty: 6
        })
      }),
      createEnv()
    );

    const body = (await response.json()) as { question: MCQQuestion };
    expect(response.status).toBe(200);
    expect(body.question.topic).toBe('geometry');
    expect(body.question.difficulty).toBe(6);
  });

  it('returns validation error when difficulty range is invalid', async () => {
    const repo = new StubQuestionRepository();
    const app = new Hono<{ Bindings: EnvBindings }>();
    app.route('/api/questions', buildQuestionsRoutes(() => ({ questionRepo: repo })));
    app.onError((error, c) => handleHttpError(error, c));

    const response = await app.fetch(
      new Request('https://example.com/api/questions?difficultyMin=7&difficultyMax=3'),
      createEnv()
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

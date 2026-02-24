import { Hono } from 'hono';
import type { EnvBindings } from '../../env';
import { D1QuestionRepository } from '../../infrastructure/persistence/d1-question-repository';
import type { QuestionRepository } from '../../application/ports/output/question-repository';
import { AppError, NotFoundError, ValidationError } from '../../shared/errors';
import { generateId } from '../../shared/types';
import { validateBody, validateQuery } from '../middleware/validation';
import { GenerateTestSchema, ListTestsSchema } from '../schemas/test-schema';

type TestsRouteContext = {
  Bindings: EnvBindings;
  Variables: {
    validatedQuery: unknown;
    validatedBody: unknown;
  };
};

type TestSheetRow = {
  id: string;
  title: string;
  subject: string;
  total_questions: number;
  duration_minutes: number | null;
  question_ids: string;
  created_at: string;
};

type TestsDependencies = {
  questionRepo: QuestionRepository;
};

type TestsDependenciesFactory = (env: EnvBindings) => TestsDependencies;

const defaultDependenciesFactory: TestsDependenciesFactory = (env) => ({
  questionRepo: new D1QuestionRepository(env.DB)
});

export const buildTestsRoutes = (
  dependenciesFactory: TestsDependenciesFactory = defaultDependenciesFactory
): Hono<TestsRouteContext> => {
  const routes = new Hono<TestsRouteContext>();

  routes.post('/generate', validateBody(GenerateTestSchema), async (c) => {
    const params = c.get('validatedBody') as {
      title: string;
      questionCount: number;
      difficulty?: { min: number; max: number };
      topics?: string[];
      materialIds?: string[];
      durationMinutes?: number;
    };

    if (params.difficulty && params.difficulty.min > params.difficulty.max) {
      throw new ValidationError('difficulty.min must be less than or equal to difficulty.max.');
    }

    const { questionRepo } = dependenciesFactory(c.env);
    const candidates = await questionRepo.findAll({
      difficulty: params.difficulty,
      limit: params.questionCount * 5
    });

    const filtered = candidates.filter((question) => {
      if (params.materialIds && params.materialIds.length > 0) {
        if (!params.materialIds.includes(question.materialId)) {
          return false;
        }
      }

      if (params.topics && params.topics.length > 0) {
        if (!question.topic || !params.topics.includes(question.topic)) {
          return false;
        }
      }

      return true;
    });

    const selected = filtered
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, params.questionCount);

    if (selected.length < params.questionCount) {
      throw new AppError(
        `Only ${selected.length} questions match criteria, need ${params.questionCount}.`,
        422,
        'INSUFFICIENT_QUESTIONS'
      );
    }

    const testId = generateId();
    const questionIds = selected.map((question) => question.id);
    const createdAt = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO test_sheets (id, title, subject, total_questions, duration_minutes, question_ids, created_at)
       VALUES (?, ?, 'math', ?, ?, ?, datetime('now'))`
    )
      .bind(testId, params.title, params.questionCount, params.durationMinutes ?? null, JSON.stringify(questionIds))
      .run();

    return c.json(
      {
        test: {
          id: testId,
          title: params.title,
          subject: 'math',
          totalQuestions: params.questionCount,
          durationMinutes: params.durationMinutes ?? null,
          questionIds,
          createdAt
        },
        questions: selected
      },
      201
    );
  });

  routes.get('/', validateQuery(ListTestsSchema), async (c) => {
    const params = c.get('validatedQuery') as { limit: number; offset: number };

    const result = await c.env.DB.prepare(
      'SELECT * FROM test_sheets ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
      .bind(params.limit, params.offset)
      .all<TestSheetRow>();

    return c.json({
      tests: result.results.map((row) => mapTestSheetRow(row)),
      count: result.results.length
    });
  });

  routes.get('/:id', async (c) => {
    const id = c.req.param('id');
    const row = await c.env.DB.prepare('SELECT * FROM test_sheets WHERE id = ?').bind(id).first<TestSheetRow>();
    if (!row) {
      throw new NotFoundError('Test', id);
    }

    const test = mapTestSheetRow(row);
    const { questionRepo } = dependenciesFactory(c.env);
    const questions = [];
    for (const questionId of test.questionIds) {
      const question = await questionRepo.findById(questionId);
      if (question) {
        questions.push(question);
      }
    }

    return c.json({ test, questions });
  });

  return routes;
};

export const testsRoutes = buildTestsRoutes();

function mapTestSheetRow(row: TestSheetRow) {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    totalQuestions: row.total_questions,
    durationMinutes: row.duration_minutes,
    questionIds: parseQuestionIds(row.question_ids),
    createdAt: row.created_at
  };
}

function parseQuestionIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

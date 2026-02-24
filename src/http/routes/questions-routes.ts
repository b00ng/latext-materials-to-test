import { Hono } from 'hono';
import type { EnvBindings } from '../../env';
import { D1QuestionRepository } from '../../infrastructure/persistence/d1-question-repository';
import type { QuestionRepository } from '../../application/ports/output/question-repository';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { validateBody, validateQuery } from '../middleware/validation';
import { ListQuestionsSchema, UpdateQuestionSchema } from '../schemas/question-schema';

type QuestionsRouteContext = {
  Bindings: EnvBindings;
  Variables: {
    validatedQuery: unknown;
    validatedBody: unknown;
  };
};

type QuestionsDependencies = {
  questionRepo: QuestionRepository;
};

type QuestionsDependenciesFactory = (env: EnvBindings) => QuestionsDependencies;

const defaultDependenciesFactory: QuestionsDependenciesFactory = (env) => ({
  questionRepo: new D1QuestionRepository(env.DB)
});

export const buildQuestionsRoutes = (
  dependenciesFactory: QuestionsDependenciesFactory = defaultDependenciesFactory
): Hono<QuestionsRouteContext> => {
  const routes = new Hono<QuestionsRouteContext>();

  routes.get('/', validateQuery(ListQuestionsSchema), async (c) => {
    const params = c.get('validatedQuery') as {
      materialId?: string;
      topic?: string;
      difficultyMin?: number;
      difficultyMax?: number;
      limit: number;
      offset: number;
    };

    if (
      params.difficultyMin !== undefined &&
      params.difficultyMax !== undefined &&
      params.difficultyMin > params.difficultyMax
    ) {
      throw new ValidationError('difficultyMin must be less than or equal to difficultyMax.');
    }

    const { questionRepo } = dependenciesFactory(c.env);
    const list = await questionRepo.findAll({
      materialId: params.materialId,
      topic: params.topic,
      difficulty:
        params.difficultyMin !== undefined || params.difficultyMax !== undefined
          ? {
              min: params.difficultyMin ?? 1,
              max: params.difficultyMax ?? 10
            }
          : undefined,
      limit: params.limit,
      offset: params.offset
    });

    return c.json({ questions: list, count: list.length });
  });

  routes.get('/:id', async (c) => {
    const id = c.req.param('id');
    const { questionRepo } = dependenciesFactory(c.env);
    const question = await questionRepo.findById(id);
    if (!question) {
      throw new NotFoundError('Question', id);
    }
    return c.json({ question });
  });

  routes.patch('/:id', validateBody(UpdateQuestionSchema), async (c) => {
    const id = c.req.param('id');
    const updates = c.get('validatedBody') as Parameters<QuestionRepository['update']>[1];
    const { questionRepo } = dependenciesFactory(c.env);
    const question = await questionRepo.update(id, updates);
    if (!question) {
      throw new NotFoundError('Question', id);
    }
    return c.json({ question });
  });

  return routes;
};

export const questionsRoutes = buildQuestionsRoutes();

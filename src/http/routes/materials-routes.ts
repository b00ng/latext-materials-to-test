import { Hono } from 'hono';
import type { EnvBindings } from '../../env';
import { createExtractionJob } from '../../extraction/routes';
import type { MaterialStatus } from '../../domain/entities/test-material';
import { generateId } from '../../shared/types';
import { D1MaterialRepository } from '../../infrastructure/persistence/d1-material-repository';
import { D1QuestionRepository } from '../../infrastructure/persistence/d1-question-repository';
import {
  D1ExtractionJobRepository,
  type ExtractionJobRepository
} from '../../infrastructure/persistence/d1-extraction-job-repository';
import type { MaterialRepository } from '../../application/ports/output/material-repository';
import type { QuestionRepository } from '../../application/ports/output/question-repository';
import { NotFoundError } from '../../shared/errors';
import { validateQuery } from '../middleware/validation';
import { ListMaterialsSchema } from '../schemas/material-schema';

type MaterialsRouteContext = {
  Bindings: EnvBindings;
  Variables: {
    validatedQuery: unknown;
  };
};

type ExtractionJobRow = {
  id: string;
  material_id: string;
  status: 'pending' | 'normalizing' | 'processing' | 'completed' | 'failed';
  progress: number;
  result: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type MaterialsDependencies = {
  materialRepo: MaterialRepository;
  questionRepo: QuestionRepository;
  jobRepo: ExtractionJobRepository;
};

type MaterialsDependenciesFactory = (env: EnvBindings) => MaterialsDependencies;

const defaultDependenciesFactory: MaterialsDependenciesFactory = (env) => ({
  materialRepo: new D1MaterialRepository(env.DB),
  questionRepo: new D1QuestionRepository(env.DB),
  jobRepo: new D1ExtractionJobRepository(env.DB)
});

export const buildMaterialsRoutes = (
  dependenciesFactory: MaterialsDependenciesFactory = defaultDependenciesFactory
): Hono<MaterialsRouteContext> => {
  const routes = new Hono<MaterialsRouteContext>();

  // POST /api/materials/upload uses extraction job flow and supports multipart files[]/files.
  routes.post('/upload', (c) => createExtractionJob(c as unknown as Parameters<typeof createExtractionJob>[0]));

  routes.get('/', validateQuery(ListMaterialsSchema), async (c) => {
    const params = c.get('validatedQuery') as {
      status?: MaterialStatus;
      limit: number;
      offset: number;
    };

    const { materialRepo } = dependenciesFactory(c.env);
    const materials = await materialRepo.findAll({
      status: params.status,
      limit: params.limit,
      offset: params.offset
    });
    return c.json({ materials, count: materials.length });
  });

  routes.get('/:id', async (c) => {
    const id = c.req.param('id');
    const { materialRepo } = dependenciesFactory(c.env);
    const material = await materialRepo.findById(id);
    if (!material) {
      throw new NotFoundError('Material', id);
    }

    const latestJob = await c.env.DB.prepare(
      `SELECT * FROM extraction_jobs
       WHERE material_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
      .bind(id)
      .first<ExtractionJobRow>();

    return c.json({
      material,
      job: latestJob ? mapExtractionJobRow(latestJob) : null
    });
  });

  routes.get('/:id/questions', async (c) => {
    const id = c.req.param('id');
    const { materialRepo, questionRepo } = dependenciesFactory(c.env);
    const material = await materialRepo.findById(id);
    if (!material) {
      throw new NotFoundError('Material', id);
    }

    const questions = await questionRepo.findByMaterialId(id);
    return c.json({ questions, count: questions.length });
  });

  routes.post('/:id/retry', async (c) => {
    const id = c.req.param('id');
    const { materialRepo, jobRepo } = dependenciesFactory(c.env);
    const material = await materialRepo.findById(id);
    if (!material) {
      throw new NotFoundError('Material', id);
    }

    const jobId = generateId();
    await materialRepo.updateStatus(id, 'uploaded');
    await jobRepo.createPending(jobId, id);
    await c.env.EXTRACTION_QUEUE.send({
      jobId,
      materialId: id,
      sourceType: material.sourceType
    });

    return c.json({ jobId, materialId: id, status: 'queued' }, 202);
  });

  routes.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const { materialRepo } = dependenciesFactory(c.env);
    const material = await materialRepo.findById(id);
    if (!material) {
      throw new NotFoundError('Material', id);
    }

    await deleteMaterialObjects(c.env.STORAGE, material.r2Key, material.manifestKey);
    await materialRepo.delete(id);
    return c.json({ deleted: true });
  });

  return routes;
};

export const materialsRoutes = buildMaterialsRoutes();

async function deleteMaterialObjects(bucket: R2Bucket, rootKey: string, manifestKey: string | null): Promise<void> {
  const keys = new Set([rootKey]);
  if (manifestKey) {
    keys.add(manifestKey);
  }

  const prefix = toPrefix(rootKey);
  let cursor: string | undefined;

  while (true) {
    const page = await bucket.list(cursor ? { prefix, cursor } : { prefix });
    for (const object of page.objects) {
      keys.add(object.key);
    }

    if (!page.truncated || !page.cursor) {
      break;
    }
    cursor = page.cursor;
  }

  await Promise.all([...keys].map((key) => bucket.delete(key)));
}

function toPrefix(rootKey: string): string {
  return rootKey.endsWith('/') ? rootKey : `${rootKey}/`;
}

function mapExtractionJobRow(row: ExtractionJobRow) {
  return {
    jobId: row.id,
    materialId: row.material_id,
    status: row.status,
    progress: row.progress,
    result: parseJsonObject(row.result),
    errorMessage: row.error ?? undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at
  };
}

function parseJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

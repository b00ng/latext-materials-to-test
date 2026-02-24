# Phase 4: API + Polish (Week 4)

> Implement all REST endpoints via Hono routes, add Zod schema validation, error handling, and wrap up with integration tests and deployment.

---

## Context Links

- [Master plan: implementation_plan.md](./implementation_plan.md)
- [Phase 3 pipeline plan](./phase-3-question-detection.md)
- Python reference: `/Users/khangvt/projects/latex-book-to-html/src/tex2html_book/resolve_tex.py`
- Python reference: `/Users/khangvt/projects/latex-book-to-html/src/tex2html_book/tex2html.py`

## Overview

- Priority: P0
- Status: In Progress (partial implementation live as of 2026-02-24)
- Scope: production API surface + auth + validation for multi-source ingestion

## Key Insights

- Upload endpoint must support `files[]` and source-type metadata.
- API key auth is mandatory in v1.
- Job status endpoint must exist in one canonical path.

## Requirements

- Functional: ingestion, query/edit, test generation, job status, retry/delete.
- Non-functional: strict validation, stable error contracts, deterministic fallback behavior.

## Architecture

- Middleware order: `cors -> auth -> validation -> handlers -> error`.
- Jobs exposed via dedicated `/api/jobs/*` route group.

## Related Code Files

- `src/adapters/http/routes/*.ts`
- `src/adapters/http/middleware/*.ts`
- `src/index.ts`

## Implementation Steps

1. Add schemas and auth middleware.
2. Update handlers for multi-file uploads.
3. Separate jobs route and remove duplicate handlers.
4. Add integration and E2E tests.

## Todo List

- [x] Ship extraction job APIs under `/api/extraction/jobs` (JSON + queue-backed).
- [ ] Implement API key auth + rotation.
- [ ] Support `files[]` upload contract.
- [ ] Remove duplicate jobs endpoint.
- [ ] Ensure deterministic test generation behavior.

## Success Criteria

- Upload works for `latex/pdf/docx/image`.
- All `/api/*` routes require API key (except explicitly excluded).
- Job status only at `/api/jobs/:id`.

## Risk Assessment

- Multipart parsing edge cases with large file batches.
- Inconsistent auth enforcement across routes.

## Security Considerations

- Enforce API key auth on all protected routes.
- Validate mime type and file size before persistence.

## Next Steps

- [Phase 5 accuracy hardening and review workflow UX](./phase-5-accuracy-hardening.md).

## 4.1 Zod Validation Schemas

### `src/adapters/http/schemas/material.schema.ts`

```typescript
import { z } from 'zod';

export const UploadMaterialSchema = z.object({
  sourceType: z.enum(['latex', 'pdf', 'docx', 'image']).optional(),
  mainFile: z.string().optional(),
  title: z.string().optional(),
});

export const ListMaterialsSchema = z.object({
  status: z.enum(['uploaded', 'normalizing', 'processing', 'completed', 'failed']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
```

### `src/adapters/http/schemas/question.schema.ts`

```typescript
import { z } from 'zod';

export const ListQuestionsSchema = z.object({
  materialId: z.string().uuid().optional(),
  topic: z.string().optional(),
  difficultyMin: z.coerce.number().int().min(1).max(10).optional(),
  difficultyMax: z.coerce.number().int().min(1).max(10).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const UpdateQuestionSchema = z.object({
  stem: z.string().optional(),
  stemLatex: z.string().optional(),
  choices: z.array(z.object({
    label: z.enum(['A', 'B', 'C', 'D']),
    text: z.string(),
    latex: z.string(),
    isCorrect: z.boolean(),
  })).length(4).optional(),
  correctAnswer: z.enum(['A', 'B', 'C', 'D']).nullable().optional(),
  answerStatus: z.enum(['confirmed', 'needs_review']).optional(),
  difficulty: z.number().int().min(1).max(10).optional(),
  topic: z.string().nullable().optional(),
});
```

### `src/adapters/http/schemas/test.schema.ts`

```typescript
import { z } from 'zod';

export const GenerateTestSchema = z.object({
  title: z.string().min(1).max(200),
  questionCount: z.number().int().min(1).max(200),
  difficulty: z.object({
    min: z.number().int().min(1).max(10),
    max: z.number().int().min(1).max(10),
  }).optional(),
  topics: z.array(z.string()).optional(),
  materialIds: z.array(z.string().uuid()).optional(),
  durationMinutes: z.number().int().min(1).optional(),
});

export const ListTestsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
```

---

## 4.2 Error Handling Middleware

### `src/adapters/http/middleware/error-handler.ts`

```typescript
import { Context, Next } from 'hono';
import { AppError } from '../../../shared/errors';
import { ZodError } from 'zod';

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    if (error instanceof AppError) {
      return c.json({
        error: { code: error.code, message: error.message }
      }, error.statusCode as any);
    }

    if (error instanceof ZodError) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        }
      }, 400);
    }

    console.error('Unhandled error:', error);
    return c.json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }
    }, 500);
  }
}
```

### `src/adapters/http/middleware/validation.ts`

```typescript
import { Context, Next } from 'hono';
import { z } from 'zod';

/**
 * Validate query parameters against a Zod schema.
 */
export function validateQuery<T extends z.ZodType>(schema: T) {
  return async (c: Context, next: Next) => {
    const query = c.req.query();
    const result = schema.safeParse(query);
    if (!result.success) {
      return c.json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters',
          details: result.error.errors }
      }, 400);
    }
    c.set('validatedQuery', result.data);
    await next();
  };
}

/**
 * Validate JSON body against a Zod schema.
 */
export function validateBody<T extends z.ZodType>(schema: T) {
  return async (c: Context, next: Next) => {
    const body = await c.req.json().catch(() => ({}));
    const result = schema.safeParse(body);
    if (!result.success) {
      return c.json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body',
          details: result.error.errors }
      }, 400);
    }
    c.set('validatedBody', result.data);
    await next();
  };
}
```

### `src/adapters/http/middleware/auth.ts`

```typescript
import { Context, Next } from 'hono';

export async function apiKeyAuth(c: Context, next: Next) {
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing API key' } }, 401);
  }

  const valid = await c.env.CACHE.get(`api-key:${apiKey}`);
  if (valid !== '1') {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } }, 401);
  }

  await next();
}
```

---

## 4.3 REST API Routes

### `src/adapters/http/routes/materials.ts`

```typescript
import { Hono } from 'hono';
import { Env } from '../../../index';
import { generateId } from '../../../shared/types';
import { NotFoundError } from '../../../shared/errors';
import { D1MaterialRepository } from '../../../infrastructure/persistence/D1MaterialRepository';
import { R2FileStorage } from '../../../infrastructure/storage/R2FileStorage';
import { createMaterial } from '../../../domain/entities/TestMaterial';
import { ListMaterialsSchema } from '../schemas/material.schema';
import { validateQuery } from '../middleware/validation';

const materials = new Hono<{ Bindings: Env }>();

// POST /api/materials/upload — Upload materials (latex/pdf/docx/image)
materials.post('/upload', async (c) => {
  const formData = await c.req.formData();
  const files = formData.getAll('files').filter((f): f is File => f instanceof File);
  const sourceType = (formData.get('sourceType') as string | null) ?? undefined;
  const mainFile = (formData.get('mainFile') as string | null) ?? undefined;
  const title = formData.get('title') as string | null;

  if (files.length === 0) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'No files provided' } }, 400);
  }

  const materialId = generateId();
  const jobId = generateId();
  const source = sourceType ?? detectSourceType(files);
  const r2Key = `materials/${materialId}/${mainFile ?? files[0].name}`;
  const manifestKey = `materials/${materialId}/manifest.json`;

  // Store file in R2
  const storage = new R2FileStorage(c.env.STORAGE);
  for (const file of files) {
    await storage.upload(`materials/${materialId}/${file.name}`, await file.arrayBuffer());
  }
  await storage.upload(manifestKey, JSON.stringify({
    sourceType: source,
    mainFile: mainFile ?? files[0].name,
    files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
  }));

  // Create material record
  const materialRepo = new D1MaterialRepository(c.env.DB);
  const material = createMaterial({
    id: materialId,
    sourceType: source,
    title: title ?? undefined,
    r2Key,
    manifestKey,
  });
  await materialRepo.create(material);

  // Create job record
  await c.env.DB.prepare(
    `INSERT INTO extraction_jobs (id, material_id, status, created_at)
     VALUES (?, ?, 'pending', datetime('now'))`
  ).bind(jobId, materialId).run();

  // Enqueue extraction job
  await c.env.EXTRACTION_QUEUE.send({ materialId, jobId });

  return c.json({ materialId, jobId }, 202);
});

function detectSourceType(files: File[]): 'latex' | 'pdf' | 'docx' | 'image' {
  const lower = files[0].name.toLowerCase();
  if (lower.endsWith('.tex')) return 'latex';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  return 'image';
}

// GET /api/materials — List all materials
materials.get('/', validateQuery(ListMaterialsSchema), async (c) => {
  const params = c.get('validatedQuery');
  const repo = new D1MaterialRepository(c.env.DB);
  const list = await repo.findAll(params);
  return c.json({ materials: list, count: list.length });
});

// GET /api/materials/:id — Get material details
materials.get('/:id', async (c) => {
  const { id } = c.req.param();
  const repo = new D1MaterialRepository(c.env.DB);
  const material = await repo.findById(id);
  if (!material) throw new NotFoundError('Material', id);

  // Also fetch latest job
  const job = await c.env.DB.prepare(
    'SELECT * FROM extraction_jobs WHERE material_id = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(id).first();

  return c.json({ material, job });
});

// GET /api/materials/:id/questions — Get extracted questions
materials.get('/:id/questions', async (c) => {
  const { id } = c.req.param();
  const questionRepo = new (await import('../../../infrastructure/persistence/D1QuestionRepository')).D1QuestionRepository(c.env.DB);
  const questions = await questionRepo.findByMaterialId(id);
  return c.json({ questions, count: questions.length });
});

// POST /api/materials/:id/retry — Retry failed extraction
materials.post('/:id/retry', async (c) => {
  const { id } = c.req.param();
  const repo = new D1MaterialRepository(c.env.DB);
  const material = await repo.findById(id);
  if (!material) throw new NotFoundError('Material', id);

  const jobId = generateId();
  await repo.updateStatus(id, 'uploaded');
  await c.env.DB.prepare(
    `INSERT INTO extraction_jobs (id, material_id, status, created_at)
     VALUES (?, ?, 'pending', datetime('now'))`
  ).bind(jobId, id).run();
  await c.env.EXTRACTION_QUEUE.send({ materialId: id, jobId });

  return c.json({ jobId }, 202);
});

// DELETE /api/materials/:id — Delete material and questions
materials.delete('/:id', async (c) => {
  const { id } = c.req.param();
  const repo = new D1MaterialRepository(c.env.DB);
  const material = await repo.findById(id);
  if (!material) throw new NotFoundError('Material', id);

  // Delete from R2
  const storage = new R2FileStorage(c.env.STORAGE);
  await storage.delete(material.r2Key);

  // Cascade delete (questions + jobs handled by ON DELETE CASCADE)
  await repo.delete(id);

  return c.json({ deleted: true });
});

export { materials };
```

### `src/adapters/http/routes/questions.ts`

```typescript
import { Hono } from 'hono';
import { Env } from '../../../index';
import { NotFoundError } from '../../../shared/errors';
import { D1QuestionRepository } from '../../../infrastructure/persistence/D1QuestionRepository';
import { ListQuestionsSchema, UpdateQuestionSchema } from '../schemas/question.schema';
import { validateQuery, validateBody } from '../middleware/validation';

const questions = new Hono<{ Bindings: Env }>();

// GET /api/questions — Search/filter questions
questions.get('/', validateQuery(ListQuestionsSchema), async (c) => {
  const params = c.get('validatedQuery');
  const repo = new D1QuestionRepository(c.env.DB);
  const list = await repo.findAll({
    materialId: params.materialId,
    topic: params.topic,
    difficulty: params.difficultyMin || params.difficultyMax
      ? { min: params.difficultyMin ?? 1, max: params.difficultyMax ?? 10 } : undefined,
    limit: params.limit,
    offset: params.offset,
  });
  return c.json({ questions: list, count: list.length });
});

// GET /api/questions/:id — Get single question
questions.get('/:id', async (c) => {
  const { id } = c.req.param();
  const repo = new D1QuestionRepository(c.env.DB);
  const question = await repo.findById(id);
  if (!question) throw new NotFoundError('Question', id);
  return c.json({ question });
});

// PATCH /api/questions/:id — Edit a question
questions.patch('/:id', validateBody(UpdateQuestionSchema), async (c) => {
  const { id } = c.req.param();
  const updates = c.get('validatedBody');
  const repo = new D1QuestionRepository(c.env.DB);
  const updated = await repo.update(id, updates);
  if (!updated) throw new NotFoundError('Question', id);
  return c.json({ question: updated });
});

export { questions };
```

### `src/adapters/http/routes/tests.ts`

```typescript
import { Hono } from 'hono';
import { Env } from '../../../index';
import { NotFoundError } from '../../../shared/errors';
import { generateId } from '../../../shared/types';
import { D1QuestionRepository } from '../../../infrastructure/persistence/D1QuestionRepository';
import { GenerateTestSchema, ListTestsSchema } from '../schemas/test.schema';
import { validateBody, validateQuery } from '../middleware/validation';

const tests = new Hono<{ Bindings: Env }>();

// POST /api/tests/generate — Generate a test sheet
tests.post('/generate', validateBody(GenerateTestSchema), async (c) => {
  const params = c.get('validatedBody');
  const questionRepo = new D1QuestionRepository(c.env.DB);

  // Find matching questions
  const candidates = await questionRepo.findAll({
    difficulty: params.difficulty,
    limit: params.questionCount * 3,  // Over-fetch for deterministic selection window
  });

  if (candidates.length < params.questionCount) {
    return c.json({
      error: { code: 'INSUFFICIENT_QUESTIONS',
        message: `Only ${candidates.length} questions match criteria, need ${params.questionCount}` }
    }, 422);
  }

  // Deterministic selection for reproducibility (replace with seeded shuffle if needed)
  const selected = candidates
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, params.questionCount);

  const testId = generateId();
  const questionIds = selected.map(q => q.id);

  // Store test sheet
  await c.env.DB.prepare(
    `INSERT INTO test_sheets (id, title, subject, total_questions, duration_minutes, question_ids, created_at)
     VALUES (?, ?, 'math', ?, ?, ?, datetime('now'))`
  ).bind(testId, params.title, params.questionCount,
    params.durationMinutes ?? null, JSON.stringify(questionIds)).run();

  return c.json({
    test: {
      id: testId, title: params.title, subject: 'math',
      totalQuestions: params.questionCount,
      durationMinutes: params.durationMinutes ?? null,
      questionIds, createdAt: new Date().toISOString(),
    },
    questions: selected,
  });
});

// GET /api/tests — List all tests
tests.get('/', validateQuery(ListTestsSchema), async (c) => {
  const params = c.get('validatedQuery');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM test_sheets ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(params.limit, params.offset).all();
  return c.json({ tests: results, count: results.length });
});

// GET /api/tests/:id — Get test with questions
tests.get('/:id', async (c) => {
  const { id } = c.req.param();
  const test = await c.env.DB.prepare('SELECT * FROM test_sheets WHERE id = ?').bind(id).first();
  if (!test) throw new NotFoundError('Test', id);

  const questionIds: string[] = JSON.parse(test.question_ids as string);
  const questionRepo = new D1QuestionRepository(c.env.DB);
  const questions = [];
  for (const qid of questionIds) {
    const q = await questionRepo.findById(qid);
    if (q) questions.push(q);
  }

  return c.json({ test, questions });
});

export { tests };
```

### `src/adapters/http/routes/jobs.ts`

```typescript
import { Hono } from 'hono';
import { Env } from '../../../index';
import { NotFoundError } from '../../../shared/errors';

const jobs = new Hono<{ Bindings: Env }>();

// GET /api/jobs/:id — Canonical job status endpoint
jobs.get('/:id', async (c) => {
  const { id } = c.req.param();
  const job = await c.env.DB.prepare('SELECT * FROM extraction_jobs WHERE id = ?').bind(id).first();
  if (!job) throw new NotFoundError('Job', id);
  return c.json({ job });
});

export { jobs };
```

---

## 4.4 Updated Worker Entry Point

### `src/index.ts` (final version)

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler } from './adapters/http/middleware/error-handler';
import { apiKeyAuth } from './adapters/http/middleware/auth';
import { materials } from './adapters/http/routes/materials';
import { questions } from './adapters/http/routes/questions';
import { tests } from './adapters/http/routes/tests';
import { jobs } from './adapters/http/routes/jobs';
import { handleExtractionMessage } from './adapters/queue/extraction-consumer';

export type Env = {
  DB: D1Database;
  STORAGE: R2Bucket;
  EXTRACTION_QUEUE: Queue;
  CACHE: KVNamespace;
  NORMALIZER_URL: string;
  NORMALIZER_TOKEN: string;
  ENVIRONMENT: string;
};

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', cors());
app.use('*', errorHandler);
app.use('/api/*', apiKeyAuth);

// Health check
app.get('/health', (c) => c.json({
  status: 'ok',
  version: '1.0.0',
  timestamp: new Date().toISOString(),
}));

// API routes
app.route('/api/materials', materials);
app.route('/api/questions', questions);
app.route('/api/tests', tests);
app.route('/api/jobs', jobs);

// 404 handler
app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404));

export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch, env: Env) {
    for (const message of batch.messages) {
      await handleExtractionMessage(message, env);
    }
  },

  async scheduled(event: ScheduledEvent, env: Env) {
    // Cleanup: remove failed materials older than 7 days
    await env.DB.prepare(
      `DELETE FROM materials WHERE status = 'failed' AND updated_at < datetime('now', '-7 days')`
    ).run();
  },
};
```

---

## 4.5 Deployment

### 4.5.1 Pre-deploy checklist

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] Confirm API key exists in KV (`api-key:<key>`)
- [ ] Confirm `NORMALIZER_URL` points to deployed normalizer
- [ ] Confirm `NORMALIZER_TOKEN` exists and matches normalizer service

### 4.5.2 Deploy to Cloudflare

```bash
# 1) Apply D1 migrations
npx wrangler d1 migrations apply mcq-generator-db --remote

# 2) Ensure required secret exists
npx wrangler secret put NORMALIZER_TOKEN

# 3) Deploy worker
npx wrangler deploy
```

### 4.5.3 Post-deploy smoke checklist (E4)

#### Option A: scripted smoke validation (recommended)

```bash
npm run smoke:api -- \
  --base-url https://mcq-generator.<subdomain>.workers.dev \
  --api-key <api-key>
```

Script location:
- `scripts/smoke-api-checklist.mjs`

Script verifies:
- `GET /health` -> `200`
- `POST /api/materials/upload` -> `202`
- `GET /api/jobs/:id` reaches `completed`
- `GET /api/materials/:id/questions` returns non-empty list
- `POST /api/tests/generate` -> `201`
- `GET /api/tests/:id` -> `200`
- legacy `GET /api/extraction/jobs/:id` -> `404`

#### Option B: manual smoke validation

```bash
# 1) Health
curl https://mcq-generator.<subdomain>.workers.dev/health

# 2) Upload one source file (capture materialId + jobId)
curl -X POST https://mcq-generator.<subdomain>.workers.dev/api/materials/upload \
  -H "x-api-key: <api-key>" \
  -F "files[]=@sample.tex" \
  -F "sourceType=latex" \
  -F "mainFile=sample.tex" \
  -F "title=Smoke Run"

# 3) Canonical job status
curl -H "x-api-key: <api-key>" \
  https://mcq-generator.<subdomain>.workers.dev/api/jobs/<jobId>

# 4) Extracted questions
curl -H "x-api-key: <api-key>" \
  https://mcq-generator.<subdomain>.workers.dev/api/materials/<materialId>/questions

# 5) Generate test
curl -X POST https://mcq-generator.<subdomain>.workers.dev/api/tests/generate \
  -H "x-api-key: <api-key>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Smoke Test","questionCount":1,"materialIds":["<materialId>"]}'

# 6) Validate test retrieval
curl -H "x-api-key: <api-key>" \
  https://mcq-generator.<subdomain>.workers.dev/api/tests/<testId>
```

---

## 4.6 Integration Test Plan

```bash
npx vitest run tests/integration/
```

| Test File | Covers |
|-----------|--------|
| `tests/integration/materials-api.test.ts` | Upload, list, get, retry, delete flows |
| `tests/integration/questions-api.test.ts` | Search, filter, edit questions |
| `tests/integration/tests-api.test.ts` | Generate test, list, get with questions |
| `tests/integration/end-to-end.test.ts` | Full flow: upload → extract → generate test |

---

## Deliverables

Current implementation (2026-02-24):
- [x] Base Hono Worker with health/root endpoints
- [x] Extraction create/status endpoints under `/api/extraction/jobs*`
- [x] Request validation for extraction create payload (`zod`)
- [x] Queue consumer integration for async normalization
- [x] Integration tests for materials/questions/tests/jobs route groups
- [x] End-to-end flow test (`upload -> job status -> extracted questions -> test generation`)
- [x] Deployment/smoke checklist (manual + scripted)

Remaining target deliverables:
- [ ] 14 REST API endpoints fully implemented with Hono
- [ ] Zod validation schemas for all API inputs (materials/questions/tests)
- [ ] Error handling middleware (AppError, ZodError, 404)
- [ ] API key middleware with KV-backed key validation
- [ ] Query and body validation middleware across route groups
- [ ] Canonical jobs route (`/api/jobs/:id`)
- [ ] Cron handler for cleanup of stale failed materials
- [ ] Complete MCQ generation pipeline: **multi-source upload (`latex/pdf/docx/image`) → normalize/parse → detect → format → JSON API**

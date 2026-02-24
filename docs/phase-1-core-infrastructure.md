# Phase 1: Core Infrastructure (Week 1)

> Scaffold the Cloudflare Worker project, configure all cloud resources (D1, R2, Queues, KV), and implement the domain entities and hexagonal port interfaces.

---

## Context Links

- [Master plan: implementation_plan.md](./implementation_plan.md)
- Python reference: `/Users/khangvt/projects/latex-book-to-html/src/tex2html_book/resolve_tex.py`
- Python reference: `/Users/khangvt/projects/latex-book-to-html/src/tex2html_book/tex2html.py`

## Overview

- Priority: P0
- Status: Planned
- Scope: Infra + contracts for `latex` / `pdf` / `docx` / `image`

## Key Insights

- D1 schema must encode source type + normalization/extraction states.
- Queue pipeline needs explicit job status transitions from day 1.
- Data model must support unresolved answers (`needs_review`) without fake defaults.

## Requirements

- Functional: store multi-format uploads; enqueue extraction jobs; persist metadata.
- Non-functional: deterministic processing contract; idempotent retries; clear status model.

## Architecture

- Worker receives uploads, stores artifacts in R2, persists metadata in D1, enqueues Queue jobs.
- Parsing and detection remain deterministic; non-LaTeX sources are normalized before detection.

## Related Code Files

- Modify: `migrations/*.sql`, `src/domain/entities/*`, `src/application/ports/*`
- Create later phases: ingestion and normalization adapters

## Implementation Steps

1. Create Worker + Cloudflare resources.
2. Add D1 migrations with multi-source contracts.
3. Define domain entities/value objects and ports.
4. Validate compile + migration apply + basic smoke checks.

## Todo List

- [ ] Add material schema for multi-source ingestion.
- [ ] Add question answer-review fields.
- [ ] Add material/job status transitions.
- [ ] Ensure interfaces map 1:1 with D1 schema.

## Success Criteria

- D1 schema supports all ingestion formats and job states.
- Type contracts compile without unsafe casts.
- Local smoke tests pass (`tsc`, migrations, worker boot).

## Risk Assessment

- Schema drift across phases can break adapters.
- Missing state transitions can leave stuck jobs.

## Security Considerations

- Upload validation by mime type + extension allowlist.
- Store only metadata needed for API responses.

## Next Steps

- Phase 2 parser parity with Python implementation.
- Phase 3 normalization for PDF/DOCX/images.

## 1.1 Project Scaffolding

### Step 1: Initialize the Worker project

```bash
# Create project directory
mkdir mcq-generator && cd mcq-generator

# Initialize with Wrangler
npx -y wrangler@latest init ./ --yes

# Install dependencies
npm install hono zod
npm install -D vitest @cloudflare/vitest-pool-workers typescript wrangler
```

### Step 2: Configure `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@domain/*": ["src/domain/*"],
      "@application/*": ["src/application/*"],
      "@infrastructure/*": ["src/infrastructure/*"],
      "@adapters/*": ["src/adapters/*"],
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Step 3: Configure `wrangler.toml`

```toml
name = "mcq-generator"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[vars]
ENVIRONMENT = "development"
NORMALIZER_URL = "http://localhost:8080"

[[d1_databases]]
binding = "DB"
database_name = "mcq-generator-db"
database_id = "<create-via-wrangler>"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "mcq-materials"

[[queues.producers]]
binding = "EXTRACTION_QUEUE"
queue = "extraction-jobs"

[[queues.consumers]]
queue = "extraction-jobs"
max_batch_size = 1
max_retries = 3
dead_letter_queue = "extraction-dlq"

[[kv_namespaces]]
binding = "CACHE"
id = "<create-via-wrangler>"

[[triggers.crons]]
cron = "0 */6 * * *"
```

```bash
# Store secret token for normalization service
npx wrangler secret put NORMALIZER_TOKEN
```

### Step 4: Create cloud resources

```bash
# Create D1 database
npx wrangler d1 create mcq-generator-db
# → Copy the database_id into wrangler.toml

# Create R2 bucket
npx wrangler r2 bucket create mcq-materials

# Create Queue
npx wrangler queues create extraction-jobs
npx wrangler queues create extraction-dlq

# Create KV namespace
npx wrangler kv namespace create CACHE
# → Copy the id into wrangler.toml
```

---

## 1.2 D1 Database Migrations

### `migrations/0001_create_materials.sql`

```sql
CREATE TABLE materials (
    id TEXT PRIMARY KEY,
    title TEXT,
    source_type TEXT NOT NULL CHECK(source_type IN ('latex', 'pdf', 'docx', 'image')),
    status TEXT NOT NULL DEFAULT 'uploaded'
        CHECK(status IN ('uploaded', 'normalizing', 'processing', 'completed', 'failed')),
    r2_key TEXT NOT NULL,
    manifest_key TEXT,
    metadata TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `migrations/0002_create_questions.sql`

```sql
CREATE TABLE questions (
    id TEXT PRIMARY KEY,
    material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    stem TEXT NOT NULL,
    stem_latex TEXT NOT NULL,
    choices TEXT NOT NULL,
    correct_answer TEXT CHECK(correct_answer IN ('A', 'B', 'C', 'D')),
    answer_status TEXT NOT NULL DEFAULT 'needs_review'
        CHECK(answer_status IN ('confirmed', 'needs_review')),
    explanation TEXT,
    explanation_latex TEXT,
    difficulty INTEGER NOT NULL CHECK(difficulty BETWEEN 1 AND 10),
    topic TEXT,
    tags TEXT,
    source_chapter INTEGER,
    source_section TEXT,
    source_question_index INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_questions_material ON questions(material_id);
CREATE INDEX idx_questions_topic ON questions(topic);
CREATE INDEX idx_questions_difficulty ON questions(difficulty);
```

### `migrations/0003_create_tests.sql`

```sql
CREATE TABLE test_sheets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT 'math',
    total_questions INTEGER NOT NULL,
    duration_minutes INTEGER,
    question_ids TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `migrations/0004_create_jobs.sql`

```sql
CREATE TABLE extraction_jobs (
    id TEXT PRIMARY KEY,
    material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
    progress INTEGER DEFAULT 0,
    result TEXT,
    error TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_jobs_material ON extraction_jobs(material_id);
CREATE INDEX idx_jobs_status ON extraction_jobs(status);
```

### Apply migrations

```bash
# Local development
npx wrangler d1 migrations apply mcq-generator-db --local

# Production
npx wrangler d1 migrations apply mcq-generator-db --remote
```

---

## 1.3 Domain Entities

### `src/domain/entities/TestMaterial.ts`

```typescript
import { MaterialMetadata } from '../value-objects/MaterialMetadata';

export type MaterialStatus = 'uploaded' | 'normalizing' | 'processing' | 'completed' | 'failed';

export interface TestMaterial {
  id: string;
  sourceType: 'latex' | 'pdf' | 'docx' | 'image';
  title: string | null;
  rawContent: string;
  status: MaterialStatus;
  r2Key: string;
  manifestKey: string | null;
  metadata: MaterialMetadata | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function createMaterial(params: {
  id: string;
  sourceType: TestMaterial['sourceType'];
  title?: string;
  r2Key: string;
  manifestKey?: string;
}): TestMaterial {
  return {
    id: params.id,
    sourceType: params.sourceType,
    title: params.title ?? null,
    rawContent: '',
    status: 'uploaded',
    r2Key: params.r2Key,
    manifestKey: params.manifestKey ?? null,
    metadata: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
```

### `src/domain/entities/MCQQuestion.ts`

```typescript
import { Choice } from './Choice';
import { SourceReference } from '../value-objects/SourceReference';

export interface MCQQuestion {
  id: string;
  materialId: string;
  stem: string;
  stemLatex: string;
  choices: Choice[];
  correctAnswer: 'A' | 'B' | 'C' | 'D' | null;
  answerStatus: 'confirmed' | 'needs_review';
  explanation: string | null;
  explanationLatex: string | null;
  difficulty: number;      // 1–10
  topic: string | null;
  tags: string[];
  sourceRef: SourceReference;
  createdAt: Date;
}
```

### `src/domain/entities/Choice.ts`

```typescript
export interface Choice {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
  latex: string;
  isCorrect: boolean;
}
```

### `src/domain/entities/TestSheet.ts`

```typescript
export interface TestSheet {
  id: string;
  title: string;
  subject: string;
  totalQuestions: number;
  durationMinutes: number | null;
  questionIds: string[];
  createdAt: Date;
}
```

### `src/domain/entities/QuestionBlock.ts`

```typescript
/**
 * Raw question block extracted from LaTeX, before structuring into MCQQuestion.
 */
export interface QuestionBlock {
  id: string;
  rawLatex: string;
  questionNumber: number | null;
  stemContent: string;
  choiceContents: string[];     // Raw choice texts (may contain LaTeX)
  correctAnswerHint: string | null;  // Detected correct answer if marked
  difficulty: number | null;
  topic: string | null;
}
```

---

## 1.4 Value Objects

### `src/domain/value-objects/MaterialMetadata.ts`

```typescript
import { ChapterInfo } from './ChapterInfo';

/**
 * Mirrors the metadata extracted by _parse_preamble() in resolve_tex.py L249–394.
 */
export interface MaterialMetadata {
  title: string;
  author: string;
  subject: string;
  language: string;
  docclass: string;
  mainFile?: string;
  macros: Record<string, string>;
  customEnvironments: Record<string, EnvironmentDef>;
  chapters: ChapterInfo[];
}

export interface EnvironmentDef {
  cssClass: string;
  label: string;
}
```

### `src/domain/value-objects/ChapterInfo.ts`

```typescript
import { SectionInfo } from './SectionInfo';

export interface ChapterInfo {
  number: number;
  title: string;
  sections: SectionInfo[];
}
```

### `src/domain/value-objects/SectionInfo.ts`

```typescript
import { QuestionBlock } from '../entities/QuestionBlock';

export interface SectionInfo {
  title: string;
  rawLatex: string;
  textContent: string;
  mathExpressions: MathExpr[];
  lists: ParsedList[];
  environments: ParsedEnv[];
  questionBlocks: QuestionBlock[];
}

export interface MathExpr {
  type: 'inline' | 'display' | 'equation' | 'align';
  latex: string;
  position: { start: number; end: number };
}

export interface ParsedList {
  type: 'itemize' | 'enumerate' | 'description';
  items: string[];
}

export interface ParsedEnv {
  name: string;
  title: string | null;
  content: string;
  cssClass: string;
  label: string;
}
```

### `src/domain/value-objects/SourceReference.ts`

```typescript
export interface SourceReference {
  materialId: string;
  chapter: number | null;
  section: string | null;
  questionIndex: number;
}
```

### `src/domain/value-objects/Difficulty.ts`

```typescript
/**
 * Maps to DEFAULT_DIFF_COLORS in tex2html.py L121–127.
 */
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export function validateDifficulty(value: number): DifficultyLevel {
  if (value < 1 || value > 10 || !Number.isInteger(value)) {
    throw new Error(`Invalid difficulty: ${value}. Must be 1–10.`);
  }
  return value as DifficultyLevel;
}
```

---

## 1.5 Hexagonal Ports (Interfaces)

### Input Ports

#### `src/application/ports/input/IngestMaterialPort.ts`

```typescript
import { TestMaterial } from '../../../domain/entities/TestMaterial';

export interface IngestMaterialCommand {
  sourceType: 'latex' | 'pdf' | 'docx' | 'image';
  files: { name: string; mimeType: string; content: ArrayBuffer }[];
  mainFile?: string;
  title?: string;
}

export interface IngestMaterialPort {
  execute(command: IngestMaterialCommand): Promise<{
    materialId: string;
    jobId: string;
  }>;
}
```

#### `src/application/ports/input/ExtractQuestionsPort.ts`

```typescript
import { MCQQuestion } from '../../../domain/entities/MCQQuestion';

export interface ExtractQuestionsCommand {
  materialId: string;
}

export interface ExtractQuestionsPort {
  execute(command: ExtractQuestionsCommand): Promise<MCQQuestion[]>;
}
```

#### `src/application/ports/input/GenerateTestPort.ts`

```typescript
import { TestSheet } from '../../../domain/entities/TestSheet';

export interface GenerateTestCommand {
  title: string;
  questionCount: number;
  difficulty?: { min: number; max: number };
  topics?: string[];
  materialIds?: string[];
  durationMinutes?: number;
}

export interface GenerateTestPort {
  execute(command: GenerateTestCommand): Promise<TestSheet>;
}
```

### Output Ports

#### `src/application/ports/output/MaterialRepository.ts`

```typescript
import { TestMaterial, MaterialStatus } from '../../../domain/entities/TestMaterial';
import { MaterialMetadata } from '../../../domain/value-objects/MaterialMetadata';

export interface MaterialRepository {
  create(material: TestMaterial): Promise<void>;
  findById(id: string): Promise<TestMaterial | null>;
  findAll(params?: { status?: MaterialStatus; limit?: number; offset?: number }): Promise<TestMaterial[]>;
  updateStatus(id: string, status: MaterialStatus, error?: string): Promise<void>;
  updateMetadata(id: string, metadata: MaterialMetadata): Promise<void>;
  delete(id: string): Promise<void>;
}
```

#### `src/application/ports/output/QuestionRepository.ts`

```typescript
import { MCQQuestion } from '../../../domain/entities/MCQQuestion';

export interface QuestionRepository {
  createMany(questions: MCQQuestion[]): Promise<void>;
  findById(id: string): Promise<MCQQuestion | null>;
  findByMaterialId(materialId: string): Promise<MCQQuestion[]>;
  findAll(params?: {
    topic?: string;
    difficulty?: { min: number; max: number };
    materialId?: string;
    limit?: number;
    offset?: number;
  }): Promise<MCQQuestion[]>;
  update(id: string, updates: Partial<MCQQuestion>): Promise<MCQQuestion | null>;
  deleteByMaterialId(materialId: string): Promise<number>;
}
```

#### `src/application/ports/output/FileStoragePort.ts`

```typescript
export interface FileStoragePort {
  upload(key: string, content: string | ArrayBuffer): Promise<void>;
  download(key: string): Promise<string | null>;
  downloadBytes(key: string): Promise<ArrayBuffer | null>;
  downloadAsFileMap(rootKey: string, manifestKey?: string | null): Promise<Map<string, ArrayBuffer>>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

#### `src/application/ports/output/NormalizationPort.ts`

```typescript
export interface NormalizeCommand {
  materialId: string;
  sourceType: 'pdf' | 'docx' | 'image';
  fileMap: Map<string, ArrayBuffer>;
}

export interface NormalizationPort {
  normalize(command: NormalizeCommand): Promise<{
    mainFile: string;
    fileMap: Map<string, string>;
  }>;
}
```

---

## 1.6 Worker Entry Point

### `src/index.ts`

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';

export type Env = {
  DB: D1Database;
  STORAGE: R2Bucket;
  EXTRACTION_QUEUE: Queue;
  CACHE: KVNamespace;
  ENVIRONMENT: string;
};

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', cors());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Routes will be added in Phase 4
app.get('/', (c) => c.json({ name: 'MCQ Generator', version: '0.1.0' }));

export default {
  fetch: app.fetch,
  queue: async (batch: MessageBatch, env: Env) => {
    // Queue consumer will be implemented in Phase 3
    console.log(`Received ${batch.messages.length} messages`);
  },
  scheduled: async (event: ScheduledEvent, env: Env) => {
    // Cron handler will be implemented in Phase 4
    console.log('Scheduled event triggered');
  },
};
```

### `src/shared/types.ts`

```typescript
export type UUID = string;

export function generateId(): UUID {
  return crypto.randomUUID();
}
```

### `src/shared/errors.ts`

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class ProcessingError extends AppError {
  constructor(message: string) {
    super(message, 422, 'PROCESSING_ERROR');
  }
}
```

---

## 1.7 Verification Checklist

| # | Check | Command |
|---|-------|---------|
| 1 | Project compiles | `npx tsc --noEmit` |
| 2 | Worker starts locally | `npx wrangler dev` |
| 3 | Health endpoint responds | `curl http://localhost:8787/health` |
| 4 | D1 migrations applied | `npx wrangler d1 migrations apply mcq-generator-db --local` |
| 5 | All interfaces compile without errors | `npx tsc --noEmit` |
| 6 | Vitest basic test passes | `npx vitest run` |

---

## Deliverables

After Phase 1 completion, the project will have:
- ✅ Working Cloudflare Worker with Hono (health endpoint responding)
- ✅ D1 database with 4 tables and indexes
- ✅ R2 bucket configured for file storage
- ✅ Queue configured for async extraction jobs
- ✅ KV namespace for config/cache
- ✅ 5 domain entities + 5 value objects (TypeScript interfaces)
- ✅ 3 input ports + 4 output ports (hexagonal architecture interfaces)
- ✅ Shared utilities (ID generation, error classes)
- ✅ TypeScript compiling cleanly with path aliases

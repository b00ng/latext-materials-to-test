# MCQ Generator (Cloudflare Workers)

TypeScript/Cloudflare Workers service for extracting multiple-choice questions (MCQ) from uploaded materials and tracking async extraction jobs.

This repository currently contains:

- `mcq-generator` Worker (root)
- `normalizer-service` Worker (`services/normalizer`) used for `pdf`/`docx`/`image` normalization

## Current Status

Implemented now:

- Hono Worker with health/root endpoints
- API key auth middleware for `/api/*` routes
- Extraction job APIs:
  - `POST /api/extraction/jobs`
  - `GET /api/extraction/jobs/:jobId`
  - `GET /api/jobs/:jobId` (canonical job status path)
- Queue consumer flow for async processing
- D1 repositories for materials/questions/jobs
- R2-backed input storage + manifest
- Unit and integration-style tests for parser, extraction routes, queue lifecycle, and repositories

In progress (see `docs/phase-4-api-polish.md`):

- Full REST surface for materials/questions/tests
- Global error contract middleware
- End-to-end API suites

## Architecture

Pipeline:

1. Client uploads files to `POST /api/extraction/jobs` (JSON base64 or multipart)
2. Worker stores files to R2 and writes material/job records to D1
3. Worker enqueues extraction message to Cloudflare Queue
4. Queue consumer runs extraction use case:
   - `latex`: parse directly
   - `pdf`/`docx`/`image`: call external `normalizer-service`
5. Questions are persisted to D1; job status is updated

Main runtime entrypoint:

- [`src/index.ts`](/Users/khangvt/projects/latext-materials-to-test/src/index.ts)

## Repository Layout

```text
src/
  application/          # Use cases + ports
  domain/               # Entities, value objects, domain services
  extraction/           # HTTP extraction routes, request parsing, queue contracts
  infrastructure/       # D1 repositories, R2 storage adapter, normalization adapter
  shared/               # Cross-cutting utilities (auth, errors, ids)
tests/
  unit/                 # Unit + integration-style tests
migrations/             # D1 schema migrations
services/normalizer/    # Separate normalizer Worker
docs/                   # Phase plans and runbooks
```

## Prerequisites

- Node.js 20+
- npm
- Cloudflare account + Wrangler login
- Cloudflare resources:
  - D1 database
  - R2 bucket
  - KV namespace
  - Queue (`extraction-jobs`) and optional DLQ

## Install

```bash
npm install
```

## Configure

Root Worker config is in [`wrangler.toml`](/Users/khangvt/projects/latext-materials-to-test/wrangler.toml).

Required root bindings/vars:

- `DB` (D1)
- `STORAGE` (R2)
- `EXTRACTION_QUEUE` (Queue producer/consumer)
- `CACHE` (KV for API keys)
- `ENVIRONMENT` (var)
- `NORMALIZER_URL` (var)
- `NORMALIZER_TOKEN` (secret)

Set secret:

```bash
npx wrangler secret put NORMALIZER_TOKEN
```

Add an API key in KV (example key = `dev-key`):

- KV entry key: `api-key:dev-key`
- KV value: `active` (also accepts `1` or `true`)

## Database Migrations

Apply local/remote migrations:

```bash
npx wrangler d1 migrations apply mcq-generator-db
# production
npx wrangler d1 migrations apply mcq-generator-db --remote
```

Migrations create:

- `materials`
- `questions`
- `test_sheets`
- `extraction_jobs`

## Run Locally

Start root Worker:

```bash
npm run dev
```

Health check:

```bash
curl http://127.0.0.1:8787/health
```

## API Summary

Public:

- `GET /health`
- `GET /`

Protected (requires `x-api-key`):

- `POST /api/extraction/jobs`
- `GET /api/extraction/jobs/:jobId`
- `GET /api/jobs/:jobId`

### `POST /api/extraction/jobs` payload modes

1. JSON (`application/json`)
2. Multipart (`multipart/form-data`) with `files[]` (or `files`)

Current validated `sourceType` values at the extraction API: `pdf`, `docx`, `image`.

### Example: multipart upload

```bash
curl -X POST http://127.0.0.1:8787/api/extraction/jobs \
  -H "x-api-key: dev-key" \
  -F "materialId=mat-001" \
  -F "sourceType=pdf" \
  -F "files[]=@./sample.pdf"
```

### Example: JSON upload

```bash
curl -X POST http://127.0.0.1:8787/api/extraction/jobs \
  -H "x-api-key: dev-key" \
  -H "Content-Type: application/json" \
  -d '{
    "materialId": "mat-001",
    "sourceType": "pdf",
    "files": [
      { "name": "sample.pdf", "contentBase64": "BASE64_CONTENT" }
    ]
  }'
```

### Check job status

```bash
curl -H "x-api-key: dev-key" \
  http://127.0.0.1:8787/api/jobs/<jobId>
```

## Normalizer Service (`services/normalizer`)

This Worker exposes:

- `GET /health`
- `POST /normalize` (Bearer auth)

Start it:

```bash
cd services/normalizer
npm run dev
```

Set matching token in both Workers:

- root Worker secret: `NORMALIZER_TOKEN`
- normalizer Worker secret: `NORMALIZER_TOKEN`

Reference runbook:

- [`docs/normalizer-service-runbook.md`](/Users/khangvt/projects/latext-materials-to-test/docs/normalizer-service-runbook.md)

## Test

Root tests:

```bash
npm test
```

Typecheck:

```bash
npm run typecheck
```

Normalizer tests:

```bash
cd services/normalizer
npm test
```

## Deployment

Root Worker:

```bash
npm run deploy
```

Normalizer Worker:

```bash
cd services/normalizer
npm run deploy
```

Smoke validation (root worker):

```bash
npm run smoke:api -- \
  --base-url https://mcq-generator.<subdomain>.workers.dev \
  --api-key <api-key>
```

## Docs

Planning and phase docs:

- [`docs/implementation_plan.md`](/Users/khangvt/projects/latext-materials-to-test/docs/implementation_plan.md)
- [`docs/phase-4-api-polish.md`](/Users/khangvt/projects/latext-materials-to-test/docs/phase-4-api-polish.md)
- [`docs/phase-5-accuracy-hardening.md`](/Users/khangvt/projects/latext-materials-to-test/docs/phase-5-accuracy-hardening.md)

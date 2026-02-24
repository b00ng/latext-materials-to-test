# In-Repo Normalizer Service Implementation Plan

**Date**: 2026-02-24  
**Type**: Feature Implementation  
**Status**: Planning  
**Scope**: Build and deploy a standalone normalizer service inside this repository before further mcq-generator feature work.

## Executive Summary
Create a dedicated normalizer service in this repo as a separate Cloudflare Worker, with token auth, health checks, and a stable `POST /normalize` API. Deliver real normalization for `pdf`, `docx`, and `image` inputs to canonical text blocks consumable by extraction flow. Use provider abstraction for OCR/vision with initial provider `OpenRouter` and initial model `z-ai/glm-4.6v` (https://openrouter.ai/z-ai/glm-4.6v), so future switches to Gemini/Kimi/DeepSeek are config-only.

## Context Links
- [implementation_plan.md](/Users/khangvt/projects/latext-materials-to-test/docs/implementation_plan.md)
- [phase-3-question-detection.md](/Users/khangvt/projects/latext-materials-to-test/docs/phase-3-question-detection.md)
- [normalization-port.ts](/Users/khangvt/projects/latext-materials-to-test/src/application/ports/output/normalization-port.ts)
- [wrangler.toml](/Users/khangvt/projects/latext-materials-to-test/wrangler.toml)

## Requirements
### Functional
- Provide `GET /health` for readiness.
- Provide `POST /normalize` protected by `Authorization: Bearer <NORMALIZER_TOKEN>`.
- Accept payload containing `materialId`, `sourceType` (`pdf|docx|image`), and source file data.
- Return `mainFile` and normalized `fileMap` compatible with `NormalizationPort` expectations.
- Return clear error payloads for invalid input and unsupported cases.
- Define provider interface for OCR/vision execution (`OcrProvider`) and route all model calls through that abstraction.
- Select provider/model through environment config, not hardcoded business logic.

### Non-Functional
- Enforce input size guardrails and file-count limits.
- Deterministic output shape and stable ordering for testability.
- Structured logs with request id and material id.
- No secrets in code or git history.
- Provider portability: changing provider should not require API contract changes.

## Proposed In-Repo Layout
- `services/normalizer/wrangler.toml`
- `services/normalizer/package.json`
- `services/normalizer/tsconfig.json`
- `services/normalizer/src/index.ts`
- `services/normalizer/src/middleware/auth.ts`
- `services/normalizer/src/schemas/normalize.schema.ts`
- `services/normalizer/src/core/normalizer.ts`
- `services/normalizer/src/core/ocr-provider.ts`
- `services/normalizer/src/core/provider-registry.ts`
- `services/normalizer/src/adapters/pdf-normalizer.ts`
- `services/normalizer/src/adapters/docx-normalizer.ts`
- `services/normalizer/src/adapters/image-normalizer.ts`
- `services/normalizer/src/providers/openrouter-provider.ts`
- `services/normalizer/src/providers/google-gemini-provider.ts` (stub/next phase)
- `services/normalizer/src/providers/kimi-provider.ts` (stub/next phase)
- `services/normalizer/src/providers/deepseek-provider.ts` (stub/next phase)
- `services/normalizer/tests/*`

## OCR Provider Strategy
### Initial Provider (Phase 1)
- Provider: `openrouter`
- Model: `z-ai/glm-4.6v`
- Model URL: `https://openrouter.ai/z-ai/glm-4.6v`
- Switching mode (v1): manual provider switch only
- Model policy (v1): single shared model for all source types (`pdf`, `docx`, `image`)

### Config Surface
- `OCR_PROVIDER=openrouter|gemini|kimi|deepseek`
- `OCR_MODEL=<provider-model-id>`
- `OPENROUTER_API_KEY` (secret)
- `OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`)
- Provider-specific keys for future providers (only when enabled).
- Default runtime config for v1:
  - `OCR_PROVIDER=openrouter`
  - `OCR_MODEL=z-ai/glm-4.6v`

### Abstraction Contract
- `OcrProvider.extractText(input): Promise<OcrExtractionResult>`
- `ProviderRegistry.get(providerName)` chooses implementation by env.
- Normalize pipeline only depends on `OcrProvider`, never provider SDK directly.

## API Contract (Target)
### `POST /normalize`
Request:
```json
{
  "materialId": "mat_123",
  "sourceType": "pdf",
  "files": [
    { "name": "input.pdf", "contentBase64": "..." }
  ]
}
```

Response:
```json
{
  "mainFile": "main.tex",
  "fileMap": {
    "main.tex": "normalized content"
  }
}
```

Notes:
- Keep response compatible with mcq pipeline expected normalized map semantics.
- If additional metadata is needed later, add optional fields only (backward-compatible).

## Implementation Phases

### Phase 1: Contract + Scaffold (Est: 0.5 day)
1. Create Beads issue tree:
   - epic: `Normalizer service (in-repo)`
   - tasks: scaffold, adapters, tests, deploy, integration
2. Scaffold `services/normalizer` Worker project.
3. Implement `GET /health`.
4. Implement auth middleware and Zod request validation.
5. Add centralized error mapping and response helpers.
6. Add provider abstraction contract (`OcrProvider`) + provider registry wiring.

Acceptance:
- `wrangler dev` runs in `services/normalizer`.
- Health endpoint returns 200.
- Unauthorized `/normalize` returns 401.
- Provider selected by config with deterministic startup validation errors if misconfigured.

### Phase 2: Core Normalization Engine (Est: 1.5-2 days)
1. Define internal normalized document model:
   - ordered segments/blocks
   - canonical newline and whitespace policy
2. Implement source adapters:
   - PDF text extraction adapter
   - DOCX text extraction adapter
   - Image OCR adapter via `OcrProvider`
3. Implement OpenRouter provider adapter:
   - call OpenRouter chat/completions endpoint
   - default model `z-ai/glm-4.6v`
   - timeout/retry/backoff + provider error mapping
4. Add provider-agnostic prompt builder and response parser.
5. Implement canonical assembler to output `main.tex` text.
6. Add limits:
   - max files per request
   - max aggregate payload size
   - timeout and fail-fast behavior
7. Add provider selection env handling:
   - default `openrouter`
   - explicit unsupported-provider error
   - manual switch only (no automatic fallback chain in v1)

Acceptance:
- Each source type returns non-empty `fileMap.main.tex` on valid fixture input.
- Invalid/oversized payload returns deterministic 4xx error.
- OpenRouter path works with configured key/model and no provider-specific leakage into core flow.

### Phase 3: Test Coverage + Fixtures (Est: 1 day)
1. Unit tests:
   - auth
   - schema validation
   - normalization dispatcher
   - provider registry selection
2. Adapter tests with local fixtures:
   - `tests/fixtures/pdf/*`
   - `tests/fixtures/docx/*`
   - `tests/fixtures/image/*`
3. Provider conformance tests:
   - OpenRouter provider implements `OcrProvider` contract
   - Provider error mapping is normalized
4. Contract tests for response shape and ordering.
5. Add regression fixtures for Vietnamese math-heavy samples.

Acceptance:
- All tests pass.
- Response format locked by tests.
- Core normalization tests remain unchanged when swapping provider implementation.

### Phase 4: Deploy + Integrate mcq-generator (Est: 0.5 day)
1. Deploy normalizer worker and capture URL.
2. Set `NORMALIZER_TOKEN` on normalizer worker.
3. Set provider secrets/vars on normalizer worker:
   - `OPENROUTER_API_KEY` (secret)
   - `OCR_PROVIDER=openrouter`
   - `OCR_MODEL=z-ai/glm-4.6v`
   - apply same `OCR_MODEL` for all source types
4. Rotate/set matching `NORMALIZER_TOKEN` on `mcq-generator`.
5. Update [wrangler.toml](/Users/khangvt/projects/latext-materials-to-test/wrangler.toml) `NORMALIZER_URL` to deployed normalizer URL.
6. Deploy `mcq-generator`.

Acceptance:
- `GET /health` works for both services.
- `mcq-generator` config points to real normalizer URL.
- Normalizer logs confirm OpenRouter path active with configured model id.

### Phase 5: Smoke + Closeout (Est: 0.5 day)
1. Smoke `POST /normalize` for each source type.
2. Run extraction job path and verify no auth/connectivity failures.
3. Update docs:
   - deployment/runbook
   - endpoint contract
   - env/secret requirements
4. Beads status updates + close completed tasks.
5. Git landing workflow:
   - `git pull --rebase`
   - `bd sync`
   - `git push`
   - verify clean status/up-to-date

Acceptance:
- End-to-end smoke passes.
- Docs updated.
- Changes pushed.

## Quality Gates
- `npm run typecheck`
- `npm run test`
- service-specific tests in `services/normalizer`
- deploy verification via `wrangler tail` + health checks

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Worker runtime limitations for document parsing libs | High | Evaluate worker-compatible libs early in Phase 2; if blocked, run normalizer in separate runtime but keep code in-repo |
| OCR quality variance for images | Medium | Add deterministic post-processing and fixtures from real docs |
| Provider API drift/rate limits | Medium | Isolate provider adapters; normalize errors; retry with bounded backoff |
| Token mismatch across services | High | Rotate once, set both sides in same session, verify via live normalize call |
| Payload size/perf spikes | Medium | Enforce strict limits and fail-fast 413/422 paths |

## Definition of Done
- In-repo normalizer service deployed with authenticated `/normalize`.
- mcq-generator points to deployed normalizer URL.
- Shared token configured both sides.
- Tests and smoke checks pass.
- Beads issues updated and pushed.

## TODO Checklist
- [ ] Create Beads epic/tasks for normalizer service
- [ ] Scaffold `services/normalizer`
- [ ] Implement auth + schema + error layer
- [ ] Implement provider abstraction (`OcrProvider` + registry)
- [ ] Implement OpenRouter adapter (`z-ai/glm-4.6v`)
- [ ] Implement pdf/docx/image normalizers
- [ ] Add fixtures and tests
- [ ] Deploy normalizer
- [ ] Configure provider vars/secrets (`OCR_PROVIDER`, `OCR_MODEL`, `OPENROUTER_API_KEY`)
- [ ] Wire `NORMALIZER_URL` and deploy mcq-generator
- [ ] Run smoke tests
- [ ] Update docs
- [ ] `bd sync`, `git push`, verify up-to-date

## Unresolved Questions
- Are there hard input size limits expected by product requirements per upload?
- Should normalizer output include optional metadata now, or keep strict minimal contract first?

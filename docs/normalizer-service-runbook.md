# Normalizer Service Runbook

## Production Status (2026-02-24)

- Normalizer Worker: `https://normalizer-service.thanhhien-writer.workers.dev`
- MCQ Generator Worker: `https://mcq-generator.thanhhien-writer.workers.dev`
- Health:
  - `GET /health` on normalizer: `200`
  - `GET /health` on mcq-generator: `200`

## Required Configuration

### normalizer-service

- Vars:
  - `OCR_PROVIDER=openrouter`
  - `OCR_MODEL=z-ai/glm-4.6v`
  - `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
  - `MAX_FILES_PER_REQUEST=5`
  - `MAX_AGGREGATE_PAYLOAD_BYTES=5242880`
  - `REQUEST_TIMEOUT_MS=20000`
- Secrets:
  - `NORMALIZER_TOKEN`
  - `OPENROUTER_API_KEY`

### mcq-generator

- Var:
  - `NORMALIZER_URL=https://normalizer-service.thanhhien-writer.workers.dev`
- Secret:
  - `NORMALIZER_TOKEN` (must match normalizer-service)

## V1 Decisions

- Input limits for v1:
  - Max files/request: `5`
  - Max aggregate payload: `5 MiB` (`5242880` bytes)
- Output contract for v1:
  - Keep minimal response only:
    - `mainFile`
    - `fileMap`
  - Do not add optional metadata fields yet.

## Smoke Verification (2026-02-24)

Authenticated `POST /normalize` checks were run against production for:

- `sourceType=pdf` -> `200`, non-empty `fileMap.main.tex`
- `sourceType=docx` -> `200`, non-empty `fileMap.main.tex`
- `sourceType=image` -> `200`, non-empty `fileMap.main.tex`

## Rotation Procedure

1. Generate one token.
2. Set same token in both Workers:
   - `wrangler secret put NORMALIZER_TOKEN --config services/normalizer/wrangler.toml`
   - `wrangler secret put NORMALIZER_TOKEN` (mcq-generator)
3. Validate:
   - normalizer `GET /health`
   - mcq-generator `GET /health`
   - authenticated normalizer `POST /normalize`

## Notes

- If normalizer health returns `500` with config error, verify both `OPENROUTER_API_KEY` and `OCR_*` vars on `normalizer-service`.

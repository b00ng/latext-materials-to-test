# Phase 5: Accuracy Hardening (Week 5)

> Improve extraction quality for real-world math materials and make unresolved answers explicit, measurable, and reviewable.

---

## Context Links

- [Master plan: implementation_plan.md](./implementation_plan.md)
- [Phase 3: question detection and async processing](./phase-3-question-detection.md)
- [Phase 4: API and polish](./phase-4-api-polish.md)
- [Normalizer runbook](./normalizer-service-runbook.md)

## Overview

- Priority: P1
- Status: Planned
- Scope: accuracy metrics, fixture expansion, review workflow for `needs_review`

## Key Insights

- Current extraction path normalizes files, but deterministic detection quality is not measured yet.
- `needs_review` is a first-class output; quality work means reducing false certainty, not forcing defaults.
- Accuracy improvements must be regression-tested across `latex`, `pdf`, `docx`, and `image`.

## Requirements

- Functional:
  - Build a labeled fixture set with expected stems, choices, and answers.
  - Evaluate extraction outputs against labels by source type.
  - Add API/query support to fetch `needs_review` items efficiently.
- Non-functional:
  - Deterministic scoring in CI.
  - Reproducible fixture corpus versioned in git.
  - No AI-generated or guessed answers in core output.

## Architecture

- Add an evaluation harness that runs detector/formatter output against gold fixtures.
- Store per-run metrics: precision, recall, F1, unresolved-rate.
- Gate merges on baseline thresholds and non-regression checks.

## Related Code Files

- Modify:
  - `src/extraction/routes.ts`
  - `src/extraction/queue-handler.ts`
  - `src/extraction/contracts.ts`
  - `tests/unit/queue-handler.test.ts`
- Create:
  - `tests/fixtures/accuracy/README.md`
  - `tests/fixtures/accuracy/latex/*.json`
  - `tests/fixtures/accuracy/pdf/*.json`
  - `tests/fixtures/accuracy/docx/*.json`
  - `tests/fixtures/accuracy/image/*.json`
  - `tests/integration/accuracy-e2e.test.ts`
  - `tests/integration/needs-review-flow.test.ts`

## Implementation Steps

1. Define fixture schema for expected extraction output.
2. Add at least 10 labeled fixtures per source type.
3. Implement evaluation helper to compare expected vs actual outputs.
4. Add summary report in test output by source type.
5. Add review-oriented API filters for `answer_status=needs_review`.
6. Add CI gate for non-regression against baseline metrics.

## Todo List

- [ ] Define accuracy fixture schema and validation.
- [ ] Add labeled fixtures for `latex` source.
- [ ] Add labeled fixtures for `pdf` source.
- [ ] Add labeled fixtures for `docx` source.
- [ ] Add labeled fixtures for `image` source.
- [ ] Implement metric calculator (precision, recall, F1, unresolved-rate).
- [ ] Add integration tests for review flow.
- [ ] Document thresholds and triage rules in docs.

## Success Criteria

- Metrics are produced per source type on every test run.
- No fabricated `correctAnswer` when evidence is missing.
- Baseline quality thresholds are met:
  - Choice extraction F1 >= 0.90 for `latex` fixtures.
  - Choice extraction F1 >= 0.80 for `pdf`/`docx`/`image` fixtures.
  - Unresolved-rate is tracked and not regressing by more than 5% week-over-week.

## Risk Assessment

- Fixture labels can drift from parser behavior if not reviewed.
- OCR quality variance can dominate downstream detector metrics.
- Overfitting to fixtures can hide failures on unseen material.

## Security Considerations

- Fixtures must not contain sensitive source documents.
- Strip or mask personal data from scanned materials before check-in.
- Keep secrets out of fixture generation scripts and test logs.

## Next Steps

- Complete Phase 4 API contract alignment first.
- Start Phase 2 parser implementation for deterministic `latex` extraction.
- Begin this phase once parser + detector baseline is functional.

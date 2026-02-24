# Phase 2 Parity Verification (lmtt-3ko.6)

Date: 2026-02-24

## Scope

Verified parser port parity against Python reference functions in:
- `/Users/khangvt/projects/latex-book-to-html/src/tex2html_book/resolve_tex.py`
- `/Users/khangvt/projects/latex-book-to-html/src/tex2html_book/tex2html.py`

Validated modules:
- `strip-comments.ts`
- `resolve-includes.ts`
- `parse-preamble.ts`
- `detect-structure.ts`
- `split-into-sections.ts`
- `math-protection.ts`
- `parse-lists.ts`
- `parse-environments.ts`
- `latex-parser.ts`

## Commands Run

```bash
node node_modules/vitest/vitest.mjs run tests/unit/strip-comments.test.ts tests/unit/math-protection.test.ts tests/unit/resolve-includes.test.ts tests/unit/parse-preamble.test.ts tests/unit/detect-structure.test.ts tests/unit/split-into-sections.test.ts tests/unit/parse-lists.test.ts tests/unit/parse-environments.test.ts tests/unit/latex-parser.test.ts tests/unit/latex-parser-fixtures.test.ts
npm run typecheck
```

Result:
- Parser test files: 10 passed
- Parser tests: 40 passed
- Typecheck: passed

## Fixture Corpus

Added in-repo parser fixtures (`9` `.tex` files):
- `tests/fixtures/latex-parser/minimal-book/*` (3 files)
- `tests/fixtures/latex-parser/article-sections/*` (1 file)
- `tests/fixtures/latex-parser/include-network/*` (5 files)

Fixture suite:
- `tests/unit/latex-parser-fixtures.test.ts`

## Parity Status

Completed:
- Comment stripping parity for escaped and unescaped `%`
- Math protection/restore parity order (`$$`, `\[...\]`, math envs, inline `$`)
- Include resolution with recursion guard, subimport/import handling, and include wrapping
- Preamble parsing for metadata, custom environments, macro extraction
- Structure detection parity for `article` vs `book/report`
- Section splitting parity for exercise-star filtering and label cleanup
- List/environment extraction pipeline integrated in `LaTeXParser`

## Known Gaps

1. Circular include output behavior differs.
   - Python: returns empty content on circular include.
   - TypeScript: keeps unresolved include token in output to avoid silent data loss.
2. `description` list detail is less rich.
   - Python HTML path emits `<dt>/<dd>` semantics.
   - TypeScript parser keeps description item text as raw item strings.
3. Proof label text currently ASCII (`Chung minh`) in parser output.
   - Python path can emit diacritics labels via config flow.

## Recommendation

Phase 2 core implementation is complete and stable. Keep `Full fixture parity` open until the 3 gaps above are resolved or explicitly accepted as intended Worker-mode deviations.

## Unresolved Questions

- Should circular includes return empty content (strict Python parity) or preserve unresolved include tokens (traceability-first)?
- Should parsed `description` lists expose structured `{ label, body }` items instead of flat strings?

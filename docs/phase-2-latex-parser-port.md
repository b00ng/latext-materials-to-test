# Phase 2: LaTeX Parser Port (Week 2)

> Port the core parsing logic from [resolve_tex.py](file:///Users/khangvt/projects/latex-book-to-html/src/tex2html_book/resolve_tex.py) and [tex2html.py](file:///Users/khangvt/projects/latex-book-to-html/src/tex2html_book/tex2html.py) into TypeScript as the `LaTeXParser` domain service. This is the **most critical** phase — it implements all the deterministic regex-based parsing that powers MCQ extraction.

---

## Context Links

- [Master plan: implementation_plan.md](./implementation_plan.md)
- Python source: `/Users/khangvt/projects/latex-book-to-html/src/tex2html_book/resolve_tex.py`
- Python source: `/Users/khangvt/projects/latex-book-to-html/src/tex2html_book/tex2html.py`

## Overview

- Priority: P0
- Status: Planned (not implemented in current codebase as of 2026-02-24)
- Goal: parity with Python LaTeX behavior before multi-format normalization path

## Key Insights

- Parser parity is the highest risk area.
- Include recursion must prevent cycles without blocking valid repeated includes.
- `article` and `book/report` top-level commands must be handled symmetrically.

## Requirements

- Functional: comment stripping, include resolution, preamble parsing, structure detection, math/list/env parsing.
- Non-functional: deterministic output, explicit fixture parity with Python tests.

## Architecture

- Keep parser pure (no storage/network in domain service).
- Accept a logical file map from ingestion layer.

## Related Code Files

- `src/domain/services/latex-parser/*.ts`
- `src/domain/services/LaTeXParser.ts`
- `tests/domain/*.test.ts`

## Implementation Steps

1. Port each parser primitive with source mapping comments.
2. Add parity tests per primitive.
3. Assemble facade parser and run integration fixture tests.

## Todo List

- [x] Cycle-safe include resolution.
- [x] Correct article/docclass splitting.
- [ ] Full fixture parity for `resolve` + `tex2html` behavior.

## Success Criteria

- All parser unit tests green.
- No duplicate chapter parsing in `article` mode.
- Include recursion deterministic with cycle protection.

## Risk Assessment

- Regex drift from Python behavior.
- Over-greedy captures on nested environments.

## Security Considerations

- Treat input as untrusted text; no eval/command execution.

## Next Steps

- Feed parser output into normalization/detection pipeline in Phase 3.

## 2.1 Comment Stripping

**Python source:** [_strip_tex_comments()](file:///Users/khangvt/projects/latex-book-to-html/src/tex2html_book/resolve_tex.py#L115-L122) and [strip_comments()](file:///Users/khangvt/projects/latex-book-to-html/src/tex2html_book/tex2html.py#L472-L479)

### `src/domain/services/latex-parser/stripComments.ts`

```typescript
/**
 * Remove LaTeX comments (% to end-of-line, unless escaped with \%).
 *
 * Ported from:
 *   - resolve_tex.py L115: _strip_tex_comments()
 *   - tex2html.py L472:    strip_comments()
 */
export function stripComments(text: string): string {
  return text
    .split('\n')
    .map(line => line.replace(/(?<!\\)%.*$/, ''))
    .join('\n');
}
```

**Test cases** (port from [test_tex2html.py L10–30](file:///Users/khangvt/projects/latex-book-to-html/tests/test_tex2html.py#L10-L30)):

```typescript
describe('stripComments', () => {
  it('removes line-end comments', () => {
    expect(stripComments('Hello % comment')).toBe('Hello ');
  });

  it('preserves escaped percent', () => {
    expect(stripComments('100\\% correct')).toBe('100\\% correct');
  });

  it('handles multi-line', () => {
    const input = 'line1 % comment\nline2 % another';
    expect(stripComments(input)).toBe('line1 \nline2 ');
  });
});
```

---

## 2.2 Include Resolution

**Python source:** [resolve_includes()](file:///Users/khangvt/projects/latex-book-to-html/src/tex2html_book/resolve_tex.py#L155-L243), [_resolve_file_path()](file:///Users/khangvt/projects/latex-book-to-html/src/tex2html_book/resolve_tex.py#L125-L152)

> [!IMPORTANT]
> In the Cloudflare Worker environment, we don't have filesystem access. Instead of reading files from disk, the `resolveIncludes` function works with a `Map<string, string>` (filename → content) representing the uploaded multi-file project stored in R2.

### `src/domain/services/latex-parser/resolveIncludes.ts`

```typescript
/**
 * Recursively resolve \input, \include, and \subimport commands
 * by inlining content from a file map.
 *
 * Ported from resolve_tex.py L155–243: resolve_includes()
 *
 * Key difference from Python: No filesystem access. Files are provided
 * as a Map<string, string> from the uploaded project in R2.
 */

const INPUT_RE = /\\(?:input|include)\{([^}]+)\}/g;
const SUBIMPORT_RE = /\\subimport\{([^}]*)\}\{([^}]+)\}/g;
const MAX_DEPTH = 10;

export function resolveIncludes(
  content: string,
  fileMap: Map<string, string>,
  currentDir: string = '',
  depth: number = 0,
  stack: string[] = []
): string {
  if (depth >= MAX_DEPTH) {
    console.warn(`Max include depth (${MAX_DEPTH}) reached`);
    return content;
  }

  // Replace \input{file} and \include{file}
  content = content.replace(INPUT_RE, (match, filename) => {
    const resolved = resolveFilePath(filename, currentDir, fileMap);
    if (!resolved) return match;
    if (stack.includes(resolved)) {
      console.warn(`Circular include detected: ${[...stack, resolved].join(' -> ')}`);
      return match;
    }

    const fileContent = fileMap.get(resolved) ?? '';
    const dir = resolved.includes('/') ? resolved.substring(0, resolved.lastIndexOf('/')) : '';
    return resolveIncludes(fileContent, fileMap, dir, depth + 1, [...stack, resolved]);
  });

  // Replace \subimport{dir}{file}
  content = content.replace(SUBIMPORT_RE, (match, dir, filename) => {
    const subDir = currentDir ? `${currentDir}/${dir}` : dir;
    const resolved = resolveFilePath(filename, subDir, fileMap);
    if (!resolved) return match;
    if (stack.includes(resolved)) {
      console.warn(`Circular include detected: ${[...stack, resolved].join(' -> ')}`);
      return match;
    }

    const fileContent = fileMap.get(resolved) ?? '';
    return resolveIncludes(fileContent, fileMap, subDir, depth + 1, [...stack, resolved]);
  });

  return content;
}

/**
 * Resolve a filename reference against a directory and file map.
 * Tries: exact path, with .tex extension, relative to root.
 *
 * Ported from resolve_tex.py L125–152: _resolve_file_path()
 */
function resolveFilePath(
  filename: string,
  currentDir: string,
  fileMap: Map<string, string>
): string | null {
  // Normalize: strip .tex if present, we'll try both
  const base = filename.replace(/\.tex$/, '');

  const candidates = [
    currentDir ? `${currentDir}/${base}.tex` : `${base}.tex`,
    currentDir ? `${currentDir}/${base}` : base,
    `${base}.tex`,
    base,
  ];

  for (const candidate of candidates) {
    const normalized = candidate.replace(/^\.\//, '');
    if (fileMap.has(normalized)) return normalized;
  }

  return null;
}
```

---

## 2.3 Preamble Parsing

**Python source:** [_parse_preamble()](file:///Users/khangvt/projects/latex-book-to-html/src/tex2html_book/resolve_tex.py#L249-L394)

### `src/domain/services/latex-parser/parsePreamble.ts`

```typescript
import { MaterialMetadata, EnvironmentDef } from '../../value-objects/MaterialMetadata';

/**
 * Extract metadata from the LaTeX preamble.
 *
 * Ported from resolve_tex.py L249–394: _parse_preamble()
 *
 * Extracts:
 *   - Document class (L256–260)
 *   - Title, author, date (L263–275)
 *   - Bibliography file (L278–290)
 *   - Image directories (L293–305)
 *   - Custom environments via \newtheorem, \newtcolorbox (L308–360)
 *   - KaTeX macros via \DeclareMathOperator, \newcommand (L363–394)
 */
export function parsePreamble(preamble: string): MaterialMetadata {
  const metadata: MaterialMetadata = {
    title: '',
    author: '',
    subject: 'math',
    language: 'vi',
    docclass: 'article',
    macros: {},
    customEnvironments: {},
    chapters: [],
  };

  // Document class — resolve_tex.py L256
  const docclassMatch = preamble.match(/\\documentclass(?:\[.*?\])?\{(\w+)\}/);
  if (docclassMatch) metadata.docclass = docclassMatch[1];

  // Title — resolve_tex.py L263
  const titleMatch = preamble.match(/\\title\{((?:[^{}]|\{[^{}]*\})*)\}/);
  if (titleMatch) metadata.title = cleanLatex(titleMatch[1]);

  // Author — resolve_tex.py L268
  const authorMatch = preamble.match(/\\author\{((?:[^{}]|\{[^{}]*\})*)\}/);
  if (authorMatch) metadata.author = cleanLatex(authorMatch[1]);

  // Language detection (heuristic)
  if (/\\usepackage.*\{.*vietnam.*\}/.test(preamble) ||
      /\\usepackage\[vietnamese\]/.test(preamble)) {
    metadata.language = 'vi';
  }

  // Custom environments: \newtheorem — resolve_tex.py L308–335
  const newtheoremRe = /\\newtheorem\{(\w+)\}(?:\[(\w+)\])?\{([^}]*)\}/g;
  let match;
  while ((match = newtheoremRe.exec(preamble)) !== null) {
    const [, name, , label] = match;
    metadata.customEnvironments[name] = {
      cssClass: 'env-theorem',
      label: label,
    };
  }

  // Custom environments: \newtcolorbox — resolve_tex.py L337–360
  const tcolorboxRe = /\\newtcolorbox\{(\w+)\}(?:\[.*?\])?\{.*?title\s*=\s*\{?([^},]*)\}?/gs;
  while ((match = tcolorboxRe.exec(preamble)) !== null) {
    const [, name, label] = match;
    metadata.customEnvironments[name] = {
      cssClass: 'box-green',
      label: label.trim(),
    };
  }

  // KaTeX macros: \DeclareMathOperator — resolve_tex.py L363–375
  const mathOpRe = /\\DeclareMathOperator\*?\{\\(\w+)\}\{([^}]*)\}/g;
  while ((match = mathOpRe.exec(preamble)) !== null) {
    const [, name, body] = match;
    metadata.macros[`\\${name}`] = `\\operatorname{${body}}`;
  }

  // KaTeX macros: \newcommand — resolve_tex.py L378–394
  const newcmdRe = /\\(?:re)?newcommand\{\\(\w+)\}(?:\[\d\])?\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g;
  while ((match = newcmdRe.exec(preamble)) !== null) {
    const [, name, body] = match;
    metadata.macros[`\\${name}`] = body;
  }

  return metadata;
}

/**
 * Minimal LaTeX cleaning — resolve_tex.py L397–417: _clean_latex()
 */
function cleanLatex(text: string): string {
  return text
    .replace(/\\texorpdfstring\{([^}]*)\}\{[^}]*\}/g, '$1')
    .replace(/\\\\/g, ' ')
    .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
    .trim();
}
```

---

## 2.4 Structure Detection

**Python source:** [_detect_structure()](file:///Users/khangvt/projects/latex-book-to-html/src/tex2html_book/resolve_tex.py#L420-L495)

### `src/domain/services/latex-parser/detectStructure.ts`

```typescript
import { ChapterInfo } from '../../value-objects/ChapterInfo';

/**
 * Detect the hierarchical structure: \part → \chapter → \section.
 *
 * Ported from resolve_tex.py L420–495: _detect_structure()
 *
 * For 'book'/'report' classes: top-level is \chapter
 * For 'article' class: top-level is \section
 */

interface PartInfo {
  num: string;
  name: string;
  chapters: number[];
}

interface StructureResult {
  parts: PartInfo[];
  chapters: ChapterInfo[];
}

const CHAPTER_RE = /\\chapter\*?\{((?:[^{}]|\{[^{}]*\})*)\}/g;
const SECTION_RE = /\\section\*?\{((?:[^{}]|\{[^{}]*\})*)\}/g;
const PART_RE = /\\part\*?\{((?:[^{}]|\{[^{}]*\})*)\}/g;

export function detectStructure(body: string, docclass: string): StructureResult {
  const isArticle = docclass === 'article';
  const topCmd = isArticle ? SECTION_RE : CHAPTER_RE;

  // Find all top-level splits
  const markers: { pos: number; title: string }[] = [];
  let m;
  const re = new RegExp(topCmd.source, topCmd.flags);
  while ((m = re.exec(body)) !== null) {
    markers.push({ pos: m.index, title: cleanTitle(m[1]) });
  }

  // Split body by markers
  const chapters: ChapterInfo[] = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].pos;
    const end = i + 1 < markers.length ? markers[i + 1].pos : body.length;
    const content = body.substring(start, end);

    chapters.push({
      number: i + 1,
      title: markers[i].title,
      sections: [],  // Sections filled by splitIntoSections() later
    });
  }

  // If no markers found, treat entire body as single chapter
  if (chapters.length === 0) {
    chapters.push({
      number: 1,
      title: '(Content)',
      sections: [],
    });
  }

  // Detect parts — resolve_tex.py L445–470
  const parts: PartInfo[] = [];
  const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const partRe = new RegExp(PART_RE.source, PART_RE.flags);
  let partIdx = 0;
  while ((m = partRe.exec(body)) !== null) {
    parts.push({
      num: romanNumerals[partIdx] ?? String(partIdx + 1),
      name: cleanTitle(m[1]),
      chapters: [],  // Chapter assignment done based on position
    });
    partIdx++;
  }

  return { parts, chapters };
}

function cleanTitle(title: string): string {
  return title
    .replace(/\\texorpdfstring\{([^}]*)\}\{[^}]*\}/g, '$1')
    .trim();
}
```

---

## 2.5 Math Protection

**Python source:** [protect_math()](file:///Users/khangvt/projects/latex-book-to-html/src/tex2html_book/tex2html.py#L377-L450), [restore_math()](file:///Users/khangvt/projects/latex-book-to-html/src/tex2html_book/tex2html.py#L453-L466), [_MATH_PLACEHOLDER](file:///Users/khangvt/projects/latex-book-to-html/src/tex2html_book/tex2html.py#L374)

### `src/domain/services/latex-parser/mathProtection.ts`

```typescript
/**
 * Protect math expressions by replacing them with placeholders.
 * This prevents other regex transformations from corrupting math content.
 *
 * Ported from tex2html.py L374–466:
 *   - L374: _MATH_PLACEHOLDER definition
 *   - L377–450: protect_math() — handles $$, \[, align, equation, $
 *   - L453–466: restore_math() — restores with inline math collapsing
 *
 * Order of protection (tex2html.py L426–448):
 *   1. Display math: $$...$$ (L427)
 *   2. Display bracket: \[...\] with lookbehind for \\[6pt] (L430–432)
 *   3. Named environments: align, equation, gather, multline (L435–443)
 *   4. Inline math: $...$ (L446–448)
 */

const MATH_PLACEHOLDER = '\x00MATH_%d\x00';

export interface MathStore {
  expressions: string[];
}

export function protectMath(text: string): { text: string; store: MathStore } {
  const store: MathStore = { expressions: [] };
  let counter = 0;

  function save(match: string): string {
    store.expressions.push(match);
    const ph = MATH_PLACEHOLDER.replace('%d', String(counter));
    counter++;
    return ph;
  }

  function saveDisplay(match: string): string {
    // Strip \[ and \], wrap in $$
    const content = match.slice(2, -2);
    store.expressions.push('$$' + content + '$$');
    const ph = MATH_PLACEHOLDER.replace('%d', String(counter));
    counter++;
    return ph;
  }

  // 1. Display math: $$...$$ — tex2html.py L427
  text = text.replace(/\$\$[\s\S]*?\$\$/g, save);

  // 2. Display bracket: \[...\] — tex2html.py L430–432
  text = text.replace(/(?<!\\)\\\[[\s\S]*?\\]/g, saveDisplay);

  // 3. Named math environments — tex2html.py L435–443
  const mathEnvs = [
    'align', 'align*', 'equation', 'equation*',
    'gather', 'gather*', 'multline', 'multline*',
  ];
  const alignEnvs = new Set(['align', 'align*']);

  for (const env of mathEnvs) {
    const escaped = env.replace('*', '\\*');
    const pat = new RegExp(
      `\\\\begin\\{${escaped}\\}[\\s\\S]*?\\\\end\\{${escaped}\\}`, 'g'
    );
    text = text.replace(pat, (match) => {
      // Extract inner content
      const innerRe = new RegExp(
        `\\\\begin\\{${escaped}\\}([\\s\\S]*?)\\\\end\\{${escaped}\\}`
      );
      const inner = match.match(innerRe);
      if (inner) {
        let body = inner[1].replace(/\n\s*\n/g, '\n');
        if (alignEnvs.has(env)) {
          // align → $$\begin{aligned}...\end{aligned}$$
          store.expressions.push(
            '$$\\begin{aligned}' + body + '\\end{aligned}$$'
          );
        } else {
          // equation/gather/multline → $$...$$
          store.expressions.push('$$' + body.trim() + '$$');
        }
      } else {
        store.expressions.push('$$' + match + '$$');
      }
      const ph = MATH_PLACEHOLDER.replace('%d', String(counter));
      counter++;
      return ph;
    });
  }

  // 4. Inline math: $...$ — tex2html.py L446–448
  text = text.replace(
    /(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g,
    save
  );

  return { text, store };
}

/**
 * Restore math placeholders back to their original content.
 *
 * Ported from tex2html.py L453–466: restore_math()
 * For inline math ($...$), collapse multi-line content onto a single line.
 */
export function restoreMath(text: string, store: MathStore): string {
  for (let i = 0; i < store.expressions.length; i++) {
    let restored = store.expressions[i];
    // Inline math: collapse newlines — tex2html.py L462–464
    if (restored.startsWith('$') && !restored.startsWith('$$')) {
      restored = restored.replace(/\s*\n\s*/g, ' ');
    }
    const ph = MATH_PLACEHOLDER.replace('%d', String(i));
    text = text.replace(ph, restored);
  }
  return text;
}
```

---

## 2.6 Section Splitting

**Python source:** [split_into_sections()](file:///Users/khangvt/projects/latex-book-to-html/src/tex2html_book/tex2html.py#L485-L536)

### `src/domain/services/latex-parser/splitIntoSections.ts`

```typescript
/**
 * Split chapter content into sections by \section{} commands.
 *
 * Ported from tex2html.py L485–536: split_into_sections()
 *
 * Also handles:
 *   - Starred sections \section*{} (L512, L522–529)
 *   - Exercise keyword filtering (L521–529)
 *   - \texorpdfstring cleanup (L514–515)
 *   - \label removal after section (L532)
 */

const DEFAULT_EXERCISE_KEYWORDS = [
  'Bai tap', 'bai tap', 'Bài tập', 'bài tập',
  'Exercise', 'exercise', 'Exercises', 'exercises',
];

export interface Section {
  title: string;
  content: string;
}

export function splitIntoSections(
  texContent: string,
  exerciseKeywords: string[] = DEFAULT_EXERCISE_KEYWORDS
): Section[] {
  // Remove \chapter{} command
  texContent = texContent.replace(/\\chapter\{.*?\}\s*/s, '');

  const sectionPat = /\\section(\*?)\{((?:[^{}]|\{[^{}]*\})*)\}/gs;
  const matches = [...texContent.matchAll(sectionPat)];

  if (matches.length === 0) {
    return [{ title: '(Content)', content: texContent.trim() }];
  }

  const sections: Section[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const isStar = m[1] === '*';
    let title = m[2].trim();
    title = title.replace(/\\texorpdfstring\{([^}]*)\}\{[^}]*\}/g, '$1');

    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : texContent.length;
    let content = texContent.substring(start, end).trim();

    // Skip exercise sections (starred)
    if (isStar) {
      const skip = exerciseKeywords.some(
        kw => title.includes(kw) || title.toLowerCase().includes(kw.toLowerCase())
      );
      if (skip) continue;
    }

    // Remove \label after section
    content = content.replace(/^\s*\\label\{[^}]*\}\s*/, '');

    sections.push({ title, content });
  }

  return sections;
}
```

---

## 2.7 List Parsing

**Python source:** [convert_lists()](file:///Users/khangvt/projects/latex-book-to-html/src/tex2html_book/tex2html.py#L723-L796)

### `src/domain/services/latex-parser/parseLists.ts`

```typescript
import { ParsedList } from '../../value-objects/SectionInfo';

/**
 * Extract list structures from LaTeX (itemize, enumerate, description).
 *
 * Ported from tex2html.py L723–796: convert_lists()
 *
 * Key difference from Python: Instead of converting to HTML,
 * we extract structured data (list type + items array).
 * This is essential for MCQ choices which are typically \begin{enumerate}
 * with \item A), B), C), D).
 *
 * Handles:
 *   - Nested lists up to 20 levels (L736, L767)
 *   - enumerate options like [label=(...)] (L729–730)
 *   - description items with [Label] (L752–757)
 *   - Optional item labels like [(a)] (L787)
 */
export function parseLists(text: string): { text: string; lists: ParsedList[] } {
  const lists: ParsedList[] = [];

  // Strip enumerate/description options
  text = text.replace(/\\begin\{enumerate\}\[[^\]]*\]/, '\\begin{enumerate}');
  text = text.replace(/\\begin\{description\}\[[^\]]*\]/, '\\begin{description}');

  // Process innermost lists first (up to 20 levels)
  for (let depth = 0; depth < 20; depth++) {
    const listRe = /\\begin\{(itemize|enumerate|description)\}((?:(?!\\begin\{(?:itemize|enumerate|description)\})(?!\\end\{(?:itemize|enumerate|description)\})[\s\S])*?)\\end\{\1\}/;
    const m = text.match(listRe);
    if (!m) break;

    const listType = m[1] as ParsedList['type'];
    const content = m[2];
    const items = content.split(/\\item\b/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => s.replace(/^\[[^\]]*\]\s*/, ''));  // Remove optional labels

    const parsedList: ParsedList = { type: listType, items };
    lists.push(parsedList);

    // Replace in text with placeholder for tracking
    text = text.replace(m[0], `[LIST_${lists.length - 1}]`);
  }

  return { text, lists };
}
```

---

## 2.8 Environment Parsing

**Python source:** [convert_environments()](file:///Users/khangvt/projects/latex-book-to-html/src/tex2html_book/tex2html.py#L542-L611), [DEFAULT_ENVIRONMENTS](file:///Users/khangvt/projects/latex-book-to-html/src/tex2html_book/tex2html.py#L42-L71)

### `src/domain/services/latex-parser/parseEnvironments.ts`

```typescript
import { ParsedEnv } from '../../value-objects/SectionInfo';
import { EnvironmentDef } from '../../value-objects/MaterialMetadata';

/**
 * Extract theorem/proof/example environments from LaTeX.
 *
 * Ported from tex2html.py L542–611: convert_environments()
 *
 * Key difference: Instead of generating HTML divs, we extract structured data.
 *
 * Default environments defined at tex2html.py L42–71:
 *   - Vietnamese: dinhly, bode, menhde, hequa, vidu, baitap, etc.
 *   - English: theorem, lemma, proposition, corollary, definition, etc.
 */

/** Default environments — ported from tex2html.py L42–71 */
export const DEFAULT_ENVIRONMENTS: Record<string, EnvironmentDef> = {
  'dinhly':    { cssClass: 'env-theorem',  label: 'Định lý' },
  'bode':      { cssClass: 'env-theorem',  label: 'Bổ đề' },
  'menhde':    { cssClass: 'env-theorem',  label: 'Mệnh đề' },
  'hequa':     { cssClass: 'env-theorem',  label: 'Hệ quả' },
  'vidu':      { cssClass: 'env-example',  label: 'Ví dụ' },
  'baitap':    { cssClass: 'env-example',  label: 'Bài tập' },
  'theorem':   { cssClass: 'env-theorem',  label: 'Theorem' },
  'lemma':     { cssClass: 'env-theorem',  label: 'Lemma' },
  'proposition': { cssClass: 'env-theorem',  label: 'Proposition' },
  'corollary': { cssClass: 'env-theorem',  label: 'Corollary' },
  'definition': { cssClass: 'env-theorem',  label: 'Definition' },
  'example':   { cssClass: 'env-example',  label: 'Example' },
  'exercise':  { cssClass: 'env-example',  label: 'Exercise' },
  'remark':    { cssClass: 'box-yellow',   label: 'Remark' },
};

export function parseEnvironments(
  text: string,
  customEnvs: Record<string, EnvironmentDef> = {}
): { text: string; environments: ParsedEnv[] } {
  const envs = { ...DEFAULT_ENVIRONMENTS, ...customEnvs };
  const result: ParsedEnv[] = [];

  for (const [envName, def] of Object.entries(envs)) {
    const escaped = envName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // With title: \begin{env}[title]...\end{env} — tex2html.py L567–583
    const withTitleRe = new RegExp(
      `\\\\begin\\{${escaped}\\}\\[([^\\]]*)\\]([\\s\\S]*?)\\\\end\\{${escaped}\\}`, 'g'
    );
    let m;
    while ((m = withTitleRe.exec(text)) !== null) {
      result.push({
        name: envName,
        title: m[1].trim(),
        content: m[2].trim(),
        cssClass: def.cssClass,
        label: def.label,
      });
    }
    text = text.replace(withTitleRe, (_, title, content) =>
      `[ENV_${envName}:${title.trim()}]`
    );

    // Without title: \begin{env}...\end{env} — tex2html.py L586–600
    const withoutTitleRe = new RegExp(
      `\\\\begin\\{${escaped}\\}([\\s\\S]*?)\\\\end\\{${escaped}\\}`, 'g'
    );
    while ((m = withoutTitleRe.exec(text)) !== null) {
      result.push({
        name: envName,
        title: null,
        content: m[1].trim(),
        cssClass: def.cssClass,
        label: def.label,
      });
    }
    text = text.replace(withoutTitleRe, `[ENV_${envName}]`);
  }

  // Proof environment — tex2html.py L603–609
  const proofRe = /\\begin\{proof\}([\s\S]*?)\\end\{proof\}/g;
  while ((m = proofRe.exec(text)) !== null) {
    result.push({
      name: 'proof',
      title: null,
      content: m[1].trim(),
      cssClass: 'env-proof',
      label: 'Chứng minh',
    });
  }
  text = text.replace(proofRe, '[ENV_proof]');

  return { text, environments: result };
}
```

---

## 2.9 Main Parser Facade

### `src/domain/services/LaTeXParser.ts`

```typescript
import { MaterialMetadata } from '../value-objects/MaterialMetadata';
import { ChapterInfo } from '../value-objects/ChapterInfo';
import { SectionInfo } from '../value-objects/SectionInfo';
import { stripComments } from './latex-parser/stripComments';
import { resolveIncludes } from './latex-parser/resolveIncludes';
import { parsePreamble } from './latex-parser/parsePreamble';
import { detectStructure } from './latex-parser/detectStructure';
import { splitIntoSections } from './latex-parser/splitIntoSections';
import { protectMath, restoreMath } from './latex-parser/mathProtection';
import { parseLists } from './latex-parser/parseLists';
import { parseEnvironments } from './latex-parser/parseEnvironments';

/**
 * Main LaTeX parser facade — orchestrates the full parsing pipeline.
 *
 * Mirrors the pipeline in cli.py run() L321–462:
 *   Step 1: Resolve (resolve_tex.py)
 *   Step 2: Configure (cli.py project_to_config)
 *   Step 3: Convert (tex2html.py latex_to_html)
 *
 * But outputs structured data instead of HTML.
 */

export interface ParsedMaterial {
  metadata: MaterialMetadata;
  chapters: ParsedChapter[];
}

export interface ParsedChapter {
  number: number;
  title: string;
  sections: SectionInfo[];
}

export class LaTeXParser {
  /**
   * Parse a LaTeX project into structured content.
   *
   * @param fileMap Map of filename → content (from R2 upload)
   * @param mainFile Name of the main .tex file
   */
  parse(fileMap: Map<string, string>, mainFile: string = 'main.tex'): ParsedMaterial {
    // 1. Get main content
    let content = fileMap.get(mainFile) ?? '';
    if (!content) throw new Error(`Main file '${mainFile}' not found in upload`);

    // 2. Resolve includes — resolve_tex.py L155–243
    content = resolveIncludes(content, fileMap);

    // 3. Strip comments — resolve_tex.py L115 + tex2html.py L472
    content = stripComments(content);

    // 4. Split preamble / body
    const docBegin = content.indexOf('\\begin{document}');
    const docEnd = content.indexOf('\\end{document}');
    const preamble = docBegin >= 0 ? content.substring(0, docBegin) : '';
    const body = docBegin >= 0
      ? content.substring(docBegin + '\\begin{document}'.length, docEnd >= 0 ? docEnd : undefined)
      : content;

    // 5. Parse preamble — resolve_tex.py L249–394
    const metadata = parsePreamble(preamble);

    // 6. Detect structure — resolve_tex.py L420–495
    const structure = detectStructure(body, metadata.docclass);

    // 7. Process each chapter's sections
    const chapters: ParsedChapter[] = structure.chapters.map((ch, idx) => {
      const chapterContent = ch.title === '(Content)'
        ? body
        : this.getChapterContent(body, idx, metadata.docclass);
      const sections = splitIntoSections(chapterContent, metadata.language === 'vi'
        ? ['Bài tập', 'Exercise'] : ['Exercise']);

      const parsedSections: SectionInfo[] = sections.map(sec => {
        return this.parseSection(sec.title, sec.content, metadata);
      });

      return {
        number: ch.number,
        title: ch.title,
        sections: parsedSections,
      };
    });

    metadata.chapters = chapters.map(ch => ({
      number: ch.number,
      title: ch.title,
      sections: [],
    }));

    return { metadata, chapters };
  }

  private parseSection(
    title: string,
    content: string,
    metadata: MaterialMetadata
  ): SectionInfo {
    // Protect math first — tex2html.py L377–450
    const { text: mathProtected, store } = protectMath(content);

    // Parse environments — tex2html.py L542–611
    const { text: envParsed, environments } = parseEnvironments(
      mathProtected, metadata.customEnvironments
    );

    // Parse lists — tex2html.py L723–796
    const { text: listParsed, lists } = parseLists(envParsed);

    // Extract math expressions from the store
    const mathExpressions = store.expressions.map((expr, i) => ({
      type: (expr.startsWith('$$') ? 'display' : 'inline') as 'inline' | 'display',
      latex: expr,
      position: { start: i, end: i },
    }));

    // Restore math for the text content
    const textContent = restoreMath(listParsed, store);

    return {
      title,
      rawLatex: content,
      textContent,
      mathExpressions,
      lists,
      environments,
      questionBlocks: [],  // Filled by QuestionDetector in Phase 3
    };
  }

  private getChapterContent(body: string, idx: number, docclass: string): string {
    // In article mode, top-level chunks are sections; in book/report mode, chapters.
    const topLevelRe = docclass === 'article'
      ? /\\section\*?\{(?:[^{}]|\{[^{}]*\})*\}/g
      : /\\chapter\*?\{(?:[^{}]|\{[^{}]*\})*\}/g;
    const matches = [...body.matchAll(topLevelRe)];
    if (idx >= matches.length) return body;
    const start = matches[idx].index!;
    const end = idx + 1 < matches.length ? matches[idx + 1].index! : body.length;
    return body.substring(start, end);
  }
}
```

---

## 2.10 Test Plan

### Test files to create

| Test File | Covers | Python Fixtures From |
|-----------|--------|---------------------|
| `tests/domain/strip-comments.test.ts` | `stripComments()` | [test_tex2html.py L10–30](file:///Users/khangvt/projects/latex-book-to-html/tests/test_tex2html.py#L10-L30) |
| `tests/domain/resolve-includes.test.ts` | `resolveIncludes()` | [test_resolve.py L30–70](file:///Users/khangvt/projects/latex-book-to-html/tests/test_resolve.py#L30-L70) |
| `tests/domain/parse-preamble.test.ts` | `parsePreamble()` | [test_resolve.py L75–113](file:///Users/khangvt/projects/latex-book-to-html/tests/test_resolve.py#L75-L113) |
| `tests/domain/math-protection.test.ts` | `protectMath()` / `restoreMath()` | [test_tex2html.py L32–55](file:///Users/khangvt/projects/latex-book-to-html/tests/test_tex2html.py#L32-L55) |
| `tests/domain/split-sections.test.ts` | `splitIntoSections()` | [test_tex2html.py L92–110](file:///Users/khangvt/projects/latex-book-to-html/tests/test_tex2html.py#L92-L110) |
| `tests/domain/parse-lists.test.ts` | `parseLists()` | New (no direct Python equivalent) |
| `tests/domain/parse-environments.test.ts` | `parseEnvironments()` | [test_tex2html.py L57–90](file:///Users/khangvt/projects/latex-book-to-html/tests/test_tex2html.py#L57-L90) |
| `tests/domain/latex-parser.test.ts` | Full `LaTeXParser` integration | [examples/minimal-book/](file:///Users/khangvt/projects/latex-book-to-html/examples/minimal-book) |

### Run tests

```bash
npx vitest run tests/domain/
```

---

## Deliverables (Target)

After Phase 2 completion:
- [x] `stripComments()` — ported and tested
- [x] `resolveIncludes()` — adapted for R2 file map (no filesystem)
- [x] `parsePreamble()` — extracts metadata, macros, custom environments
- [x] `detectStructure()` — finds parts/chapters/sections
- [x] `splitIntoSections()` — splits chapters into section pairs
- [x] `protectMath()` / `restoreMath()` — math placeholder system
- [x] `parseLists()` — extracts structured list data (critical for MCQ choices)
- [x] `parseEnvironments()` — extracts theorem/example/exercise blocks
- [x] `LaTeXParser` facade class — orchestrates full pipeline
- [x] 8+ test files covering all ported functions

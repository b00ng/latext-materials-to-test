import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { LaTeXParser } from '../../src/domain/services/latex-parser/latex-parser';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(TEST_DIR, '../fixtures/latex-parser');

describe('LaTeXParser fixture parity', () => {
  it('parses the minimal-book fixture', () => {
    const parser = new LaTeXParser();
    const parsed = parser.parse(loadFixture('minimal-book'), 'main.tex');

    expect(parsed.metadata.title).toBe('Fixture Minimal Book');
    expect(parsed.metadata.author).toBe('Fixture Author');
    expect(parsed.metadata.macros['\\Q']).toBe('\\mathbb{Q}');
    expect(parsed.metadata.customEnvironments.theorem?.label).toBe('Theorem');
    expect(parsed.chapters).toHaveLength(2);
    expect(parsed.chapters[0].title).toBe('First Chapter');
    expect(parsed.chapters[1].title).toBe('Second Chapter');

    const intro = parsed.chapters[0].sections[0];
    expect(intro.title).toBe('Introduction');
    expect(intro.mathExpressions.some((expr) => expr.latex === '$\\Q$')).toBe(true);
    expect(intro.environments.some((env) => env.name === 'theorem')).toBe(true);

    const choices = parsed.chapters[0].sections[1];
    expect(choices.lists).toHaveLength(1);
    expect(choices.lists[0].type).toBe('enumerate');
    expect(choices.lists[0].items).toEqual(['Alpha', 'Beta']);
    expect(parsed.chapters[1].sections).toHaveLength(1);
  });

  it('parses the article-sections fixture with section-as-chapter behavior', () => {
    const parser = new LaTeXParser();
    const parsed = parser.parse(loadFixture('article-sections'), 'main.tex');

    expect(parsed.metadata.docclass).toBe('article');
    expect(parsed.chapters).toHaveLength(2);
    expect(parsed.chapters[0].title).toBe('Overview');
    expect(parsed.chapters[1].title).toBe('Methods');

    const overview = parsed.chapters[0].sections[0];
    expect(overview.mathExpressions.some((expr) => expr.type === 'display')).toBe(true);
    expect(overview.lists.some((list) => list.type === 'description')).toBe(true);

    const methods = parsed.chapters[1].sections[0];
    expect(methods.mathExpressions.some((expr) => expr.type === 'align')).toBe(true);
  });

  it('parses the include-network fixture with include/subimport/comment parity', () => {
    const parser = new LaTeXParser();
    const parsed = parser.parse(loadFixture('include-network'), 'main.tex');

    expect(parsed.metadata.title).toBe('Include Fixture');
    expect(parsed.chapters).toHaveLength(2);
    expect(parsed.chapters[0].title).toBe('Include Chapter');
    expect(parsed.chapters[1].title).toBe('Appendix');

    const core = parsed.chapters[0].sections[0];
    expect(core.environments.some((env) => env.name === 'proof')).toBe(true);
    expect(core.lists).toHaveLength(1);
    expect(core.lists[0].items).toEqual(['Inner A', 'Inner B']);

    const allRaw = parsed.chapters
      .flatMap((chapter) => chapter.sections.map((section) => section.rawLatex))
      .join('\n');
    expect(allRaw).not.toContain('SHOULD NOT APPEAR');
  });
});

function loadFixture(name: string): Map<string, string> {
  const fixtureDir = join(FIXTURE_ROOT, name);
  const files = collectFiles(fixtureDir);
  const fileMap = new Map<string, string>();

  for (const absolutePath of files) {
    const relPath = relative(fixtureDir, absolutePath).replace(/\\/g, '/');
    const content = readFileSync(absolutePath, 'utf8');
    fileMap.set(relPath, content);
  }

  return fileMap;
}

function collectFiles(dir: string): string[] {
  const result: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      result.push(...collectFiles(fullPath));
      continue;
    }
    result.push(fullPath);
  }

  return result;
}

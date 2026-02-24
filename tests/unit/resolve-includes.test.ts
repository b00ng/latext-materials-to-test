import { describe, expect, it } from 'vitest';

import { resolveIncludes } from '../../src/domain/services/latex-parser/resolve-includes';

describe('resolveIncludes', () => {
  it('resolves input commands with .tex fallback', () => {
    const content = 'Start\n\\input{chapters/ch01}\nEnd';
    const fileMap = new Map<string, string>([['chapters/ch01.tex', 'Chapter 1 content']]);

    const resolved = resolveIncludes(content, fileMap);

    expect(resolved).toContain('Chapter 1 content');
    expect(resolved).not.toContain('\\input{chapters/ch01}');
  });

  it('wraps include content with clearpage markers', () => {
    const content = 'A\n\\include{parts/p1}\nB';
    const fileMap = new Map<string, string>([['parts/p1.tex', 'Part body']]);

    const resolved = resolveIncludes(content, fileMap);
    const clearPageCount = (resolved.match(/\\clearpage/g) ?? []).length;

    expect(resolved).toContain('Part body');
    expect(clearPageCount).toBe(2);
  });

  it('does not resolve commands inside comments', () => {
    const content = '% \\input{chapters/ch01}\nBody';
    const fileMap = new Map<string, string>([['chapters/ch01.tex', 'Ignored']]);

    const resolved = resolveIncludes(content, fileMap);

    expect(resolved).toContain('\\input{chapters/ch01}');
    expect(resolved).not.toContain('Ignored');
  });

  it('resolves subimport from the current directory', () => {
    const content = '\\subimport{chapters/}{ch01}';
    const fileMap = new Map<string, string>([['chapters/ch01.tex', 'Nested chapter']]);

    const resolved = resolveIncludes(content, fileMap);

    expect(resolved).toContain('Nested chapter');
    expect(resolved).not.toContain('\\subimport');
  });

  it('prevents infinite recursion on circular includes', () => {
    const fileMap = new Map<string, string>([
      ['a.tex', 'A \\input{b}'],
      ['b.tex', 'B \\input{a}']
    ]);

    const resolved = resolveIncludes('\\input{a}', fileMap);

    expect(resolved).toContain('A');
    expect(resolved).toContain('B');
    expect(resolved).toContain('\\input{a}');
  });
});

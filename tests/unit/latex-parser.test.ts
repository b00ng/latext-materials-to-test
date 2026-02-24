import { describe, expect, it } from 'vitest';

import { LaTeXParser } from '../../src/domain/services/latex-parser/latex-parser';

describe('LaTeXParser', () => {
  it('parses a minimal multi-file book and extracts structured section data', () => {
    const parser = new LaTeXParser();
    const fileMap = new Map<string, string>([
      [
        'main.tex',
        String.raw`\documentclass{book}
\title{Test Book}
\author{Test Author}
\begin{document}
\input{chapters/ch01}
\end{document}`
      ],
      [
        'chapters/ch01.tex',
        String.raw`\chapter{First Chapter}
\section{Introduction}
Formula: $x^2 + y^2 = z^2$. % inline note
\begin{theorem}
Every even number greater than 2 is the sum of two primes.
\end{theorem}
\section{Choices}
\begin{enumerate}
\item Alpha
\item Beta
\end{enumerate}`
      ]
    ]);

    const parsed = parser.parse(fileMap, 'main.tex');

    expect(parsed.metadata.title).toBe('Test Book');
    expect(parsed.metadata.author).toBe('Test Author');
    expect(parsed.chapters).toHaveLength(1);
    expect(parsed.chapters[0].title).toBe('First Chapter');
    expect(parsed.chapters[0].sections).toHaveLength(2);

    const intro = parsed.chapters[0].sections[0];
    expect(intro.title).toBe('Introduction');
    expect(intro.mathExpressions.some((m) => m.latex === '$x^2 + y^2 = z^2$')).toBe(true);
    expect(intro.environments).toHaveLength(1);
    expect(intro.environments[0].name).toBe('theorem');
    expect(intro.textContent).toContain('$x^2 + y^2 = z^2$');
    expect(intro.textContent).not.toContain('% inline note');

    const choices = parsed.chapters[0].sections[1];
    expect(choices.lists).toHaveLength(1);
    expect(choices.lists[0].type).toBe('enumerate');
    expect(choices.lists[0].items).toEqual(['Alpha', 'Beta']);
  });

  it('treats article sections as top-level chapters', () => {
    const parser = new LaTeXParser();
    const fileMap = new Map<string, string>([
      [
        'main.tex',
        String.raw`\documentclass{article}
\begin{document}
\section{Overview}
Body text.
\end{document}`
      ]
    ]);

    const parsed = parser.parse(fileMap);

    expect(parsed.metadata.docclass).toBe('article');
    expect(parsed.chapters).toHaveLength(1);
    expect(parsed.chapters[0].title).toBe('Overview');
  });

  it('throws when main file is missing', () => {
    const parser = new LaTeXParser();
    const fileMap = new Map<string, string>([['other.tex', '\\begin{document}x\\end{document}']]);

    expect(() => parser.parse(fileMap, 'main.tex')).toThrow("Main file 'main.tex' not found in upload");
  });
});

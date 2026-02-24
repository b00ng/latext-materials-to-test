import { describe, expect, it } from 'vitest';

import { detectStructure } from '../../src/domain/services/latex-parser/detect-structure';

describe('detectStructure', () => {
  it('detects parts and chapters for book documents', () => {
    const body = String.raw`
\part{Part One}
\chapter{First Chapter}
First content.
\chapter{Second Chapter}
Second content.
`;

    const structure = detectStructure(body, 'book');

    expect(structure.parts).toHaveLength(1);
    expect(structure.parts[0]).toEqual({
      num: 'I',
      name: 'Part One',
      chapters: [1, 2]
    });
    expect(structure.chapters).toHaveLength(2);
    expect(structure.chapters[0].title).toBe('First Chapter');
    expect(structure.chapters[1].title).toBe('Second Chapter');
  });

  it('treats sections as top-level chapters for article docclass', () => {
    const body = String.raw`
\section{Introduction}
Intro content.
\section{Methods}
Method content.
`;

    const structure = detectStructure(body, 'article');

    expect(structure.parts).toEqual([]);
    expect(structure.chapters).toHaveLength(2);
    expect(structure.chapters[0].title).toBe('Introduction');
    expect(structure.chapters[1].title).toBe('Methods');
  });

  it('falls back to section splitting when book has no chapter command', () => {
    const body = String.raw`
\section{Only Section}
Standalone content.
`;

    const structure = detectStructure(body, 'book');

    expect(structure.chapters).toHaveLength(1);
    expect(structure.chapters[0].title).toBe('Only Section');
  });

  it('returns a single content chapter when no structure markers exist', () => {
    const body = 'Plain body without chapter or section markers.';
    const structure = detectStructure(body, 'book');

    expect(structure.parts).toEqual([]);
    expect(structure.chapters).toHaveLength(1);
    expect(structure.chapters[0].title).toBe('(Content)');
    expect(structure.chapters[0].content).toBe(body);
  });

  it('cleans texorpdfstring and labels from chapter titles', () => {
    const body = String.raw`\chapter{A \texorpdfstring{B}{C}\label{ch:a}}Body`;
    const structure = detectStructure(body, 'book');

    expect(structure.chapters[0].title).toBe('A B');
  });
});

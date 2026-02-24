import { describe, expect, it } from 'vitest';

import { parsePreamble } from '../../src/domain/services/latex-parser/parse-preamble';

describe('parsePreamble', () => {
  it('extracts core metadata and cleans latex wrappers', () => {
    const preamble = String.raw`
\documentclass[12pt]{book}
\title{Algebra \textbf{I}\\[6pt]\texorpdfstring{(Advanced)}{Advanced}}
\subtitle{\emph{Linear Algebra}}
\author{Alice \textit{Nguyen}}
\date{2026}
\bibliography{refs/main}
`;

    const metadata = parsePreamble(preamble);

    expect(metadata.docclass).toBe('book');
    expect(metadata.title).toBe('Algebra I (Advanced)');
    expect(metadata.subtitle).toBe('Linear Algebra');
    expect(metadata.author).toBe('Alice Nguyen');
    expect(metadata.date).toBe('2026');
    expect(metadata.bibliography).toBe('refs/main.bib');
  });

  it('extracts custom environments and image directories', () => {
    const preamble = String.raw`
\graphicspath{{images/}{figures/}}
\newtheorem{theorem}{Theorem}
\newtcolorbox{notebox}[1]{title={Lưu ý},colback=green!5}
`;

    const metadata = parsePreamble(preamble);

    expect(metadata.imageDirectories).toEqual(['images/', 'figures/']);
    expect(metadata.customEnvironments.theorem).toEqual({
      cssClass: 'env-theorem',
      label: 'Theorem'
    });
    expect(metadata.customEnvironments.notebox).toEqual({
      cssClass: 'box-green',
      label: 'Lưu ý'
    });
  });

  it('extracts KaTeX macro definitions from common command styles', () => {
    const preamble = String.raw`
\DeclareMathOperator{\rank}{rank}
\newcommand{\Q}{\mathbb{Q}}
\newcommand{\GL}{\mathrm{GL}}
\def\R{\mathbb{R}}
\newcommand{\SOI}[2]{SO_{#1}\!\left(#2\right)}
\usetikzlibrary{arrows.meta}
\usepackage{pgfplots}
`;

    const metadata = parsePreamble(preamble);

    expect(metadata.macros['\\rank']).toBe('\\mathrm{rank}');
    expect(metadata.macros['\\Q']).toBe('\\mathbb{Q}');
    expect(metadata.macros['\\GL']).toBe('\\mathrm{GL}');
    expect(metadata.macros['\\R']).toBe('\\mathbb{R}');
    expect(metadata.macros['\\SOI']).toBe('SO_{#1}\\!\\left(#2\\right)');
    expect(metadata.tikzPreamble).toContain('\\usetikzlibrary{arrows.meta}');
    expect(metadata.tikzPreamble).toContain('\\usepackage{pgfplots}');
  });
});

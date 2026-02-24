import { describe, expect, it } from 'vitest';

import { splitIntoSections } from '../../src/domain/services/latex-parser/split-into-sections';

describe('splitIntoSections', () => {
  it('splits content by section commands', () => {
    const tex = String.raw`
\section{Introduction}
Hello world.
\section{Methods}
Some methods.
`;

    const sections = splitIntoSections(tex);

    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe('Introduction');
    expect(sections[1].title).toBe('Methods');
  });

  it('returns a single content section when no section markers exist', () => {
    const tex = 'No section marker here';
    const sections = splitIntoSections(tex);

    expect(sections).toEqual([{ title: '(Content)', content: 'No section marker here' }]);
  });

  it('skips starred exercise sections and strips leading labels', () => {
    const tex = String.raw`
\section{Theory}
\label{sec:theory}
Core content.
\section*{Bai tap}
Exercise section should be skipped.
`;

    const sections = splitIntoSections(tex);

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Theory');
    expect(sections[0].content).toContain('Core content.');
    expect(sections[0].content).not.toContain('\\label');
  });
});

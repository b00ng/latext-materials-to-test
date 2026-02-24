import { describe, expect, it } from 'vitest';

import { stripComments } from '../../src/domain/services/latex-parser/strip-comments';

describe('stripComments', () => {
  it('removes line-end comments', () => {
    expect(stripComments('Hello % comment')).toBe('Hello ');
  });

  it('preserves escaped percent characters', () => {
    expect(stripComments('100\\% correct')).toBe('100\\% correct');
  });

  it('removes unescaped comment after escaped percent', () => {
    expect(stripComments('100\\% correct % note')).toBe('100\\% correct ');
  });

  it('handles multi-line content', () => {
    const input = 'line1 % comment\nline2 % another';
    expect(stripComments(input)).toBe('line1 \nline2 ');
  });

  it('keeps line breaks for full-line comments', () => {
    const input = 'line1\n% remove this line\nline3';
    expect(stripComments(input)).toBe('line1\n\nline3');
  });
});

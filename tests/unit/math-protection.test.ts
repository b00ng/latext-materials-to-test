import { describe, expect, it } from 'vitest';

import {
  protectMath,
  restoreMath
} from '../../src/domain/services/latex-parser/math-protection';

describe('protectMath', () => {
  it('replaces inline math with placeholders', () => {
    const input = 'The formula $x^2 + y^2 = z^2$ is famous.';
    const result = protectMath(input);

    expect(result.text).toContain('MATH_0');
    expect(result.store.expressions).toEqual(['$x^2 + y^2 = z^2$']);
  });

  it('converts \\[...\\] display math to $$...$$ in the store', () => {
    const input = String.raw`We have \[ E = mc^2 \] which is important.`;
    const result = protectMath(input);

    expect(result.text).toContain('MATH_0');
    expect(result.text).not.toContain(String.raw`\[`);
    expect(result.store.expressions).toEqual(['$$ E = mc^2 $$']);
  });

  it('does not treat \\\\[6pt] as display math', () => {
    const input = String.raw`line1 \\[6pt] line2`;
    const result = protectMath(input);

    expect(result.text).toBe(input);
    expect(result.store.expressions).toEqual([]);
  });

  it('wraps align environments with aligned when restoring store values', () => {
    const input = String.raw`\begin{align*}
a &= b \\
c &= d
\end{align*}`;
    const result = protectMath(input);

    expect(result.text).toContain('MATH_0');
    expect(result.store.expressions).toHaveLength(1);
    expect(result.store.expressions[0]).toContain('$$\\begin{aligned}');
    expect(result.store.expressions[0]).toContain('a &= b');
    expect(result.store.expressions[0]).toContain('\\end{aligned}$$');
  });
});

describe('restoreMath', () => {
  it('collapses inline math newlines while restoring', () => {
    const output = restoreMath('\x00MATH_0\x00', { expressions: ['$x\n + y$'] });
    expect(output).toBe('$x + y$');
  });

  it('restores protected expressions from protectMath output', () => {
    const input = String.raw`Text $x$ and \[ y \] and \begin{equation} z=1 \end{equation}`;
    const { text, store } = protectMath(input);
    const restored = restoreMath(text, store);

    expect(restored).toContain('$x$');
    expect(restored).toContain('$$ y $$');
    expect(restored).toContain('$$z=1$$');
  });
});

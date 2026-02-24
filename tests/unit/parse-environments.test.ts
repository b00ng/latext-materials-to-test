import { describe, expect, it } from 'vitest';

import {
  parseEnvironments
} from '../../src/domain/services/latex-parser/parse-environments';

describe('parseEnvironments', () => {
  it('extracts theorem environments without optional titles', () => {
    const tex = String.raw`
\begin{theorem}
Every even number greater than 2 is the sum of two primes.
\end{theorem}
`;

    const { text, environments } = parseEnvironments(tex);

    expect(text).toContain('[ENV_theorem]');
    expect(environments).toHaveLength(1);
    expect(environments[0]).toEqual({
      name: 'theorem',
      title: null,
      content: 'Every even number greater than 2 is the sum of two primes.',
      cssClass: 'env-theorem',
      label: 'Theorem'
    });
  });

  it('extracts environments with optional titles', () => {
    const tex = String.raw`
\begin{definition}[Group]
A set with a binary operation.
\end{definition}
`;

    const { text, environments } = parseEnvironments(tex);

    expect(text).toContain('[ENV_definition:Group]');
    expect(environments).toHaveLength(1);
    expect(environments[0].title).toBe('Group');
    expect(environments[0].name).toBe('definition');
  });

  it('extracts proof environment and replaces with placeholder', () => {
    const tex = String.raw`
\begin{proof}
Trivial by direct computation.
\end{proof}
`;

    const { text, environments } = parseEnvironments(tex);

    expect(text).toContain('[ENV_proof]');
    expect(environments).toHaveLength(1);
    expect(environments[0]).toEqual({
      name: 'proof',
      title: null,
      content: 'Trivial by direct computation.',
      cssClass: 'env-proof',
      label: 'Chung minh'
    });
  });

  it('merges custom environment definitions', () => {
    const tex = String.raw`
\begin{mybox}
Custom content.
\end{mybox}
`;

    const { text, environments } = parseEnvironments(tex, {
      mybox: { cssClass: 'box-blue', label: 'My Box' }
    });

    expect(text).toContain('[ENV_mybox]');
    expect(environments).toHaveLength(1);
    expect(environments[0].cssClass).toBe('box-blue');
    expect(environments[0].label).toBe('My Box');
  });
});

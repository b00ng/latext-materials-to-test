import { describe, expect, it } from 'vitest';

import { parseLists } from '../../src/domain/services/latex-parser/parse-lists';

describe('parseLists', () => {
  it('extracts enumerate items and removes optional item labels', () => {
    const tex = String.raw`
\begin{enumerate}
\item[(a)] Alpha
\item Beta
\end{enumerate}
`;

    const { text, lists } = parseLists(tex);

    expect(lists).toHaveLength(1);
    expect(lists[0].type).toBe('enumerate');
    expect(lists[0].items).toEqual(['Alpha', 'Beta']);
    expect(text).toContain('[LIST_0]');
  });

  it('strips enumerate and description options', () => {
    const tex = String.raw`
\begin{enumerate}[label=(\alph*)]
\item A
\end{enumerate}
\begin{description}[leftmargin=2em]
\item[Key] Value
\end{description}
`;

    const { lists } = parseLists(tex);

    expect(lists).toHaveLength(2);
    expect(lists[0].type).toBe('description');
    expect(lists[1].type).toBe('enumerate');
  });

  it('extracts nested lists from innermost to outermost', () => {
    const tex = String.raw`
\begin{itemize}
\item Outer item
\begin{enumerate}
\item Inner one
\item Inner two
\end{enumerate}
\item Outer end
\end{itemize}
`;

    const { text, lists } = parseLists(tex);

    expect(lists).toHaveLength(2);
    expect(lists[0].type).toBe('enumerate');
    expect(lists[0].items).toEqual(['Inner one', 'Inner two']);
    expect(lists[1].type).toBe('itemize');
    expect(lists[1].items.some((item) => item.includes('[LIST_0]'))).toBe(true);
    expect(text).toContain('[LIST_1]');
  });
});

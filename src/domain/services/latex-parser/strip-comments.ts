/**
 * Remove LaTeX comments (% to end-of-line) but preserve escaped \%.
 *
 * Ported from:
 * - resolve_tex.py:_strip_tex_comments
 * - tex2html.py:strip_comments
 */
export function stripComments(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/(?<!\\)%.*$/, ''))
    .join('\n');
}

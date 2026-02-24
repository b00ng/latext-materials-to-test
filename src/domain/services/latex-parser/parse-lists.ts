import type { ParsedList } from '../../value-objects/section-info';

const MAX_NESTED_DEPTH = 20;

const NESTED_LIST_CONTENT =
  '((?:(?!\\\\begin\\{(?:itemize|enumerate|description)\\})(?!\\\\end\\{(?:itemize|enumerate|description)\\})[\\s\\S])*?)';

const DESCRIPTION_PATTERN = new RegExp(
  `\\\\begin\\{description\\}${NESTED_LIST_CONTENT}\\\\end\\{description\\}`
);

const ITEMIZE_OR_ENUMERATE_PATTERN = new RegExp(
  `\\\\begin\\{(itemize|enumerate)\\}${NESTED_LIST_CONTENT}\\\\end\\{\\1\\}`
);

export function parseLists(text: string): { text: string; lists: ParsedList[] } {
  let normalized = text
    .replace(/\\begin\{enumerate\}\[[^\]]*\]/g, '\\begin{enumerate}')
    .replace(/\\begin\{description\}\[[^\]]*\]/g, '\\begin{description}');

  const lists: ParsedList[] = [];

  for (let depth = 0; depth < MAX_NESTED_DEPTH; depth += 1) {
    const match = normalized.match(DESCRIPTION_PATTERN);
    if (!match) {
      break;
    }
    const parsed = extractItems(match[1], true);
    lists.push({ type: 'description', items: parsed });
    normalized = normalized.replace(match[0], `[LIST_${lists.length - 1}]`);
  }

  for (let depth = 0; depth < MAX_NESTED_DEPTH; depth += 1) {
    const match = normalized.match(ITEMIZE_OR_ENUMERATE_PATTERN);
    if (!match) {
      break;
    }
    const type = match[1] as ParsedList['type'];
    const parsed = extractItems(match[2], false);
    lists.push({ type, items: parsed });
    normalized = normalized.replace(match[0], `[LIST_${lists.length - 1}]`);
  }

  return { text: normalized, lists };
}

function extractItems(content: string, keepDescriptionLabel: boolean): string[] {
  return content
    .split(/\\item\b/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => {
      if (keepDescriptionLabel) {
        return item;
      }
      return item.replace(/^\[[^\]]*\]\s*/, '');
    });
}

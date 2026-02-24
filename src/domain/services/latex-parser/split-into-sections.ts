const DEFAULT_EXERCISE_KEYWORDS = [
  'Bai tap',
  'bai tap',
  'Bài tập',
  'bài tập',
  'Exercise',
  'exercise',
  'Exercises',
  'exercises'
];

export interface SectionSplit {
  title: string;
  content: string;
}

export function splitIntoSections(
  texContent: string,
  exerciseKeywords: string[] = DEFAULT_EXERCISE_KEYWORDS
): SectionSplit[] {
  let normalized = texContent.replace(/\\chapter\{.*?\}\s*/s, '');

  const sectionPattern = /\\section(\*?)\{((?:[^{}]|\{[^{}]*\})*)\}/gs;
  const matches = Array.from(normalized.matchAll(sectionPattern));

  if (matches.length === 0) {
    return [{ title: '(Content)', content: normalized.trim() }];
  }

  const sections: SectionSplit[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const isStar = match[1] === '*';
    const title = cleanTitle(match[2] ?? '');

    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? normalized.length) : normalized.length;
    let content = normalized.slice(start, end).trim();

    if (isStar && hasExerciseKeyword(title, exerciseKeywords)) {
      continue;
    }

    content = content.replace(/^\s*\\label\{[^}]*\}\s*/, '');
    sections.push({ title, content });
  }

  return sections;
}

function cleanTitle(title: string): string {
  return title.replace(/\\texorpdfstring\{([^}]*)\}\{[^}]*\}/g, '$1').trim();
}

function hasExerciseKeyword(title: string, keywords: string[]): boolean {
  const lowered = title.toLowerCase();
  return keywords.some((keyword) => title.includes(keyword) || lowered.includes(keyword.toLowerCase()));
}

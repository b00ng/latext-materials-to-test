import type { ChapterInfo } from '../../value-objects/chapter-info';

const ROMAN = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
  'XIII',
  'XIV',
  'XV'
];

export interface PartInfo {
  num: string;
  name: string;
  chapters: number[];
}

export interface DetectedChapter extends ChapterInfo {
  content: string;
  source: string;
}

export interface StructureResult {
  parts: PartInfo[];
  chapters: DetectedChapter[];
}

export function detectStructure(body: string, docclass: string): StructureResult {
  let topCommand = 'chapter';
  if (docclass === 'article' || docclass === 'scrartcl') {
    topCommand = 'section';
  } else if (!/\\chapter\*?\{/.test(body)) {
    topCommand = 'section';
  }

  const tokenPattern = new RegExp(
    `\\\\(part|${topCommand})\\*?\\{((?:[^{}]|\\{[^{}]*\\})*)\\}`,
    'gs'
  );
  const matches = Array.from(body.matchAll(tokenPattern));

  if (matches.length === 0) {
    return {
      parts: [],
      chapters: [
        {
          number: 1,
          title: '(Content)',
          sections: [],
          content: body.trim(),
          source: 'inline'
        }
      ]
    };
  }

  const parts: PartInfo[] = [];
  const chapters: DetectedChapter[] = [];
  let currentPart: PartInfo | null = null;
  let partIndex = 0;
  let chapterNumber = 0;

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const cmd = match[1];
    const title = cleanTitle(match[2] ?? '');
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? body.length) : body.length;
    const content = body.slice(start, end).trim();

    if (cmd === 'part') {
      if (currentPart) {
        parts.push(currentPart);
      }
      currentPart = {
        num: ROMAN[partIndex] ?? String(partIndex + 1),
        name: title,
        chapters: []
      };
      partIndex += 1;
      continue;
    }

    chapterNumber += 1;
    chapters.push({
      number: chapterNumber,
      title,
      sections: [],
      content,
      source: 'inline'
    });

    if (currentPart) {
      currentPart.chapters.push(chapterNumber);
    }
  }

  if (currentPart) {
    parts.push(currentPart);
  }

  return { parts, chapters };
}

function cleanTitle(rawTitle: string): string {
  return rawTitle
    .replace(/\\texorpdfstring\{([^}]*)\}\{[^}]*\}/g, '$1')
    .replace(/\\label\{[^}]*\}/g, '')
    .trim();
}

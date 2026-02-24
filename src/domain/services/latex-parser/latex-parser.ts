import type { ChapterInfo } from '../../value-objects/chapter-info';
import type { MaterialMetadata } from '../../value-objects/material-metadata';
import type { MathExpr, SectionInfo } from '../../value-objects/section-info';
import { detectStructure } from './detect-structure';
import { protectMath, restoreMath } from './math-protection';
import { parseEnvironments } from './parse-environments';
import { parseLists } from './parse-lists';
import { parsePreamble } from './parse-preamble';
import { resolveIncludes } from './resolve-includes';
import { splitIntoSections } from './split-into-sections';
import { stripComments } from './strip-comments';

export interface ParsedChapter extends ChapterInfo {
  sections: SectionInfo[];
}

export interface ParsedMaterial {
  metadata: MaterialMetadata;
  chapters: ParsedChapter[];
}

export class LaTeXParser {
  parse(fileMap: Map<string, string>, mainFile = 'main.tex'): ParsedMaterial {
    const resolvedMainFile = this.resolveMainFile(fileMap, mainFile);
    if (!resolvedMainFile) {
      throw new Error(`Main file '${mainFile}' not found in upload`);
    }

    let content = fileMap.get(resolvedMainFile) ?? '';
    content = resolveIncludes(content, fileMap, {
      currentDir: dirname(resolvedMainFile),
      rootDir: ''
    });
    content = stripComments(content);

    const { preamble, body } = splitDocument(content);
    const metadata = parsePreamble(preamble);
    metadata.mainFile = resolvedMainFile;

    const structure = detectStructure(body, metadata.docclass);
    const chapters: ParsedChapter[] = structure.chapters.map((chapter) => ({
      number: chapter.number,
      title: chapter.title,
      sections: this.parseChapterSections(chapter.content, metadata)
    }));

    metadata.chapters = chapters.map((chapter) => ({
      number: chapter.number,
      title: chapter.title,
      sections: []
    }));

    return { metadata, chapters };
  }

  private parseChapterSections(content: string, metadata: MaterialMetadata): SectionInfo[] {
    const sectionPairs = splitIntoSections(content, this.exerciseKeywords(metadata.language));
    return sectionPairs.map((section) => this.parseSection(section.title, section.content, metadata));
  }

  private parseSection(title: string, content: string, metadata: MaterialMetadata): SectionInfo {
    const { text: mathProtected, store } = protectMath(content);
    const envParsed = parseEnvironments(mathProtected, metadata.customEnvironments);
    const listParsed = parseLists(envParsed.text);
    const textContent = restoreMath(listParsed.text, store);

    return {
      title,
      rawLatex: content,
      textContent,
      mathExpressions: store.expressions.map((latex, index) => ({
        type: mathType(latex),
        latex,
        position: { start: index, end: index }
      })) as MathExpr[],
      lists: listParsed.lists,
      environments: envParsed.environments,
      questionBlocks: []
    };
  }

  private resolveMainFile(fileMap: Map<string, string>, mainFile: string): string | null {
    if (fileMap.has(mainFile)) {
      return mainFile;
    }
    const wanted = normalizePath(mainFile);
    for (const file of fileMap.keys()) {
      if (normalizePath(file) === wanted) {
        return file;
      }
    }
    return null;
  }

  private exerciseKeywords(language: string): string[] {
    if (language.toLowerCase().startsWith('vi')) {
      return ['Bai tap', 'Bài tập', 'Exercise'];
    }
    return ['Exercise'];
  }
}

function splitDocument(content: string): { preamble: string; body: string } {
  const docStart = content.indexOf('\\begin{document}');
  const docEnd = content.indexOf('\\end{document}');

  if (docStart < 0) {
    return { preamble: '', body: content };
  }

  const preamble = content.slice(0, docStart);
  const body = content.slice(
    docStart + '\\begin{document}'.length,
    docEnd >= 0 ? docEnd : undefined
  );

  return { preamble, body };
}

function mathType(latex: string): MathExpr['type'] {
  if (latex.startsWith('$$\\begin{aligned}')) {
    return 'align';
  }
  if (latex.startsWith('$$') && /\\begin\{equation\*?\}/.test(latex)) {
    return 'equation';
  }
  if (latex.startsWith('$$')) {
    return 'display';
  }
  return 'inline';
}

function dirname(path: string): string {
  const normalized = normalizePath(path);
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? '' : normalized.slice(0, idx);
}

function normalizePath(path: string): string {
  const segments = path.replace(/\\/g, '/').split('/');
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }
  return normalized.join('/');
}

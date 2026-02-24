import type { QuestionBlock } from '../entities/question-block';
import type { ParsedEnvironment, ParsedList, SectionInfo } from '../value-objects/section-info';
import { generateId } from '../../shared/types';

const QUESTION_MARKER_PATTERNS = [
  /(?:^|\n)\s*(?:Câu|Bài)\s+(\d+)[.:]\s*/gim,
  /(?:^|\n)\s*(?:Question|Problem)\s+(\d+)[.:]\s*/gim
];

const CHOICE_LINE_PATTERN = /(?:^|\n)\s*([A-D])[.)]\s+([\s\S]*?)(?=(?:\n\s*[A-D][.)]\s+)|$)/g;
const CHOICE_ITEM_PATTERN =
  /\\item\s*(?:\([A-Da-d]\)|\[[^\]]*\])?\s*([\s\S]*?)(?=(?:\\item\b)|$)/g;

const ANSWER_HINT_PATTERNS = [
  /Đáp\s+án[:\s]+([A-D])/i,
  /Answer[:\s]+([A-D])/i,
  /\\textbf\{\s*([A-D])\s*\}/i,
  /\\underline\{\s*([A-D])\s*\}/i,
  /\\boxed\{\s*([A-D])\s*\}/i
];

const DIFFICULTY_PATTERNS = [
  /(?:Mức|Level|Difficulty)[:\s]*(\d+)/i,
  /\[(\d+)\s*(?:điểm|points?)\]/i
];

const EXAM_ENV_NAMES = new Set(['questions', 'question', 'exercise', 'exercises', 'baitap', 'exam']);

export class QuestionDetector {
  detect(section: SectionInfo): QuestionBlock[] {
    const content = section.textContent;

    const fromNumbered = this.detectByNumberedPatterns(content);
    if (fromNumbered.length > 0) {
      return fromNumbered;
    }

    const fromLists = this.detectByEnumerateLists(section.lists);
    if (fromLists.length > 0) {
      return fromLists;
    }

    const fromEnvironments = this.detectByEnvironments(section.environments);
    if (fromEnvironments.length > 0) {
      return fromEnvironments;
    }

    return this.detectByParagraphHeuristic(content);
  }

  private detectByNumberedPatterns(content: string): QuestionBlock[] {
    for (const pattern of QUESTION_MARKER_PATTERNS) {
      const markers = Array.from(content.matchAll(new RegExp(pattern.source, pattern.flags)));
      if (markers.length === 0) {
        continue;
      }

      const blocks: QuestionBlock[] = [];
      for (let i = 0; i < markers.length; i += 1) {
        const marker = markers[i];
        const questionNumber = Number.parseInt(marker[1], 10);
        const start = (marker.index ?? 0) + marker[0].length;
        const end = i + 1 < markers.length ? markers[i + 1].index ?? content.length : content.length;
        const text = content.slice(start, end).trim();
        const block = this.extractQuestionBlock(text, Number.isFinite(questionNumber) ? questionNumber : null);
        if (block) {
          blocks.push(block);
        }
      }

      if (blocks.length > 0) {
        return blocks;
      }
    }

    return [];
  }

  private detectByEnumerateLists(lists: ParsedList[]): QuestionBlock[] {
    const blocks: QuestionBlock[] = [];

    for (const list of lists) {
      if (list.type !== 'enumerate') {
        continue;
      }

      for (let index = 0; index < list.items.length; index += 1) {
        const block = this.extractQuestionBlock(list.items[index], index + 1);
        if (block && block.choiceContents.length >= 2) {
          blocks.push(block);
        }
      }
    }

    return blocks;
  }

  private detectByEnvironments(environments: ParsedEnvironment[]): QuestionBlock[] {
    const blocks: QuestionBlock[] = [];

    for (const env of environments) {
      if (!EXAM_ENV_NAMES.has(env.name.toLowerCase())) {
        continue;
      }
      blocks.push(...this.detectByNumberedPatterns(env.content));
    }

    return blocks;
  }

  private detectByParagraphHeuristic(content: string): QuestionBlock[] {
    const paragraphs = content.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
    const blocks: QuestionBlock[] = [];
    let questionNumber = 1;

    for (const paragraph of paragraphs) {
      const choices = this.extractChoices(paragraph);
      if (choices.length < 3) {
        continue;
      }
      const block = this.extractQuestionBlock(paragraph, questionNumber);
      if (block) {
        blocks.push(block);
        questionNumber += 1;
      }
    }

    return blocks;
  }

  private extractQuestionBlock(text: string, questionNumber: number | null): QuestionBlock | null {
    const choices = this.extractChoices(text);
    if (choices.length < 2) {
      return null;
    }

    const firstChoiceIndex = this.findFirstChoiceIndex(text);
    const stemContent = firstChoiceIndex > 0 ? text.slice(0, firstChoiceIndex).trim() : text.trim();

    return {
      id: generateId(),
      rawLatex: text,
      questionNumber,
      stemContent,
      choiceContents: choices,
      correctAnswerHint: this.detectCorrectAnswer(text),
      difficulty: this.detectDifficulty(text),
      topic: null
    };
  }

  private extractChoices(text: string): string[] {
    const lineMatches = Array.from(text.matchAll(new RegExp(CHOICE_LINE_PATTERN.source, CHOICE_LINE_PATTERN.flags)));
    if (lineMatches.length >= 2) {
      return lineMatches.map((match) => cleanChoiceText(match[2]));
    }

    const itemMatches = Array.from(text.matchAll(new RegExp(CHOICE_ITEM_PATTERN.source, CHOICE_ITEM_PATTERN.flags)));
    if (itemMatches.length >= 2) {
      return itemMatches.map((match) => cleanChoiceText(match[1]));
    }

    return [];
  }

  private findFirstChoiceIndex(text: string): number {
    const patterns = [/(?:^|\n)\s*A[.)]\s/m, /\\item\s*(?:\([A-Da-d]\)|\[[^\]]*\])?\s*/];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.index !== undefined) {
        return match.index;
      }
    }
    return -1;
  }

  private detectCorrectAnswer(text: string): string | null {
    for (const pattern of ANSWER_HINT_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        return match[1].toUpperCase();
      }
    }
    return null;
  }

  private detectDifficulty(text: string): number | null {
    for (const pattern of DIFFICULTY_PATTERNS) {
      const match = text.match(pattern);
      if (!match) {
        continue;
      }
      const value = Number.parseInt(match[1], 10);
      if (value >= 1 && value <= 10) {
        return value;
      }
    }
    return null;
  }
}

function cleanChoiceText(value: string): string {
  return value
    .replace(/\n\s*(?:Đáp\s+án|Answer|Mức|Level|Difficulty)\b[\s\S]*$/i, '')
    .trim();
}

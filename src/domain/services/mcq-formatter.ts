import type { Choice } from '../entities/choice';
import type { MCQQuestion } from '../entities/mcq-question';
import type { QuestionBlock } from '../entities/question-block';
import type { SourceReference } from '../value-objects/source-reference';
import { generateId } from '../../shared/types';

const ANSWER_LABELS = ['A', 'B', 'C', 'D'] as const;

export class MCQFormatter {
  format(
    block: QuestionBlock,
    materialId: string,
    chapterNumber: number | null,
    sectionTitle: string | null,
    questionIndex: number
  ): MCQQuestion {
    const normalizedHint = block.correctAnswerHint?.toUpperCase() ?? null;
    const correctAnswer = ANSWER_LABELS.includes(normalizedHint as (typeof ANSWER_LABELS)[number])
      ? (normalizedHint as (typeof ANSWER_LABELS)[number])
      : null;
    const answerStatus = correctAnswer ? 'confirmed' : 'needs_review';

    const choices: Choice[] = block.choiceContents.slice(0, 4).map((latex, idx) => ({
      label: ANSWER_LABELS[idx],
      text: this.stripLatexForDisplay(latex),
      latex,
      isCorrect: correctAnswer === ANSWER_LABELS[idx]
    }));

    const sourceRef: SourceReference = {
      materialId,
      chapter: chapterNumber,
      section: sectionTitle,
      questionIndex
    };

    return {
      id: generateId(),
      materialId,
      stem: this.stripLatexForDisplay(block.stemContent),
      stemLatex: block.stemContent,
      choices,
      correctAnswer,
      answerStatus,
      explanation: null,
      explanationLatex: null,
      difficulty: block.difficulty ?? 5,
      topic: block.topic,
      tags: [],
      sourceRef,
      createdAt: new Date()
    };
  }

  private stripLatexForDisplay(latex: string): string {
    return latex
      .replace(/\\textbf\{([^}]*)\}/g, '$1')
      .replace(/\\textit\{([^}]*)\}/g, '$1')
      .replace(/\\emph\{([^}]*)\}/g, '$1')
      .replace(/\\underline\{([^}]*)\}/g, '$1')
      .replace(/\\text\{([^}]*)\}/g, '$1')
      .replace(/\\\\/g, ' ')
      .replace(/\\quad/g, ' ')
      .replace(/\\,/g, ' ')
      .replace(/~/g, ' ')
      .trim();
  }
}

import type { Choice } from '../../domain/entities/choice';
import type { AnswerLabel, AnswerStatus, MCQQuestion } from '../../domain/entities/mcq-question';

export type QuestionRow = {
  id: string;
  material_id: string;
  stem: string;
  stem_latex: string;
  choices: string;
  correct_answer: AnswerLabel | null;
  answer_status: AnswerStatus;
  explanation: string | null;
  explanation_latex: string | null;
  difficulty: number;
  topic: string | null;
  tags: string | null;
  source_chapter: number | null;
  source_section: string | null;
  source_question_index: number;
  created_at: string;
};

export function mapQuestionRow(row: QuestionRow): MCQQuestion {
  return {
    id: row.id,
    materialId: row.material_id,
    stem: row.stem,
    stemLatex: row.stem_latex,
    choices: parseChoices(row.choices),
    correctAnswer: row.correct_answer,
    answerStatus: row.answer_status,
    explanation: row.explanation,
    explanationLatex: row.explanation_latex,
    difficulty: row.difficulty,
    topic: row.topic,
    tags: parseTags(row.tags),
    sourceRef: {
      materialId: row.material_id,
      chapter: row.source_chapter,
      section: row.source_section,
      questionIndex: row.source_question_index
    },
    createdAt: new Date(row.created_at)
  };
}

function parseChoices(value: string): Choice[] {
  try {
    return JSON.parse(value) as Choice[];
  } catch {
    return [];
  }
}

function parseTags(value: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

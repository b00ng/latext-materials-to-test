import type { Choice } from './choice';
import type { SourceReference } from '../value-objects/source-reference';

export type AnswerLabel = 'A' | 'B' | 'C' | 'D';
export type AnswerStatus = 'confirmed' | 'needs_review';

export interface MCQQuestion {
  id: string;
  materialId: string;
  stem: string;
  stemLatex: string;
  choices: Choice[];
  correctAnswer: AnswerLabel | null;
  answerStatus: AnswerStatus;
  explanation: string | null;
  explanationLatex: string | null;
  difficulty: number;
  topic: string | null;
  tags: string[];
  sourceRef: SourceReference;
  createdAt: Date;
}

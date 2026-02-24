export interface QuestionBlock {
  id: string;
  rawLatex: string;
  questionNumber: number | null;
  stemContent: string;
  choiceContents: string[];
  correctAnswerHint: string | null;
  difficulty: number | null;
  topic: string | null;
}

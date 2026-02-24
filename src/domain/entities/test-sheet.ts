export interface TestSheet {
  id: string;
  title: string;
  subject: string;
  totalQuestions: number;
  durationMinutes: number | null;
  questionIds: string[];
  createdAt: Date;
}

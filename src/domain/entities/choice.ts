export interface Choice {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
  latex: string;
  isCorrect: boolean;
}

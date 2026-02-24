import type { TestSheet } from '../../../domain/entities/test-sheet';

export interface GenerateTestCommand {
  title: string;
  questionCount: number;
  difficulty?: {
    min: number;
    max: number;
  };
  topics?: string[];
  materialIds?: string[];
  durationMinutes?: number;
}

export interface GenerateTestPort {
  execute(command: GenerateTestCommand): Promise<TestSheet>;
}

import type { MCQQuestion } from '../../../domain/entities/mcq-question';

export interface ExtractQuestionsCommand {
  materialId: string;
}

export interface ExtractQuestionsPort {
  execute(command: ExtractQuestionsCommand): Promise<MCQQuestion[]>;
}

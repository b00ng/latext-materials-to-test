import type { MCQQuestion } from '../../../domain/entities/mcq-question';

export interface QuestionRepository {
  createMany(questions: MCQQuestion[]): Promise<void>;
  findById(id: string): Promise<MCQQuestion | null>;
  findByMaterialId(materialId: string): Promise<MCQQuestion[]>;
  findAll(params?: {
    topic?: string;
    difficulty?: {
      min: number;
      max: number;
    };
    materialId?: string;
    limit?: number;
    offset?: number;
  }): Promise<MCQQuestion[]>;
  update(id: string, updates: Partial<MCQQuestion>): Promise<MCQQuestion | null>;
  deleteByMaterialId(materialId: string): Promise<number>;
}

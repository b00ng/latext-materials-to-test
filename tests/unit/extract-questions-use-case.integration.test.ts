import { describe, expect, it } from 'vitest';

import { createMaterial, type MaterialStatus, type TestMaterial } from '../../src/domain/entities/test-material';
import type { MCQQuestion } from '../../src/domain/entities/mcq-question';
import type { MaterialMetadata } from '../../src/domain/value-objects/material-metadata';
import type { MaterialRepository } from '../../src/application/ports/output/material-repository';
import type { QuestionRepository } from '../../src/application/ports/output/question-repository';
import type { FileStoragePort } from '../../src/application/ports/output/file-storage-port';
import type { NormalizationPort, NormalizeCommand, NormalizationResult } from '../../src/application/ports/output/normalization-port';
import { ExtractQuestionsUseCase } from '../../src/application/use-cases/extract-questions-use-case';

class MemoryMaterialRepository implements MaterialRepository {
  readonly items = new Map<string, TestMaterial>();
  readonly statusHistory = new Map<string, MaterialStatus[]>();
  async create(material: TestMaterial): Promise<void> {
    this.items.set(material.id, material);
  }
  async findById(id: string): Promise<TestMaterial | null> {
    return this.items.get(id) ?? null;
  }
  async findAll(): Promise<TestMaterial[]> {
    return [...this.items.values()];
  }
  async updateStatus(id: string, status: MaterialStatus, error?: string): Promise<void> {
    const material = this.items.get(id);
    if (!material) {
      return;
    }
    material.status = status;
    material.errorMessage = error ?? null;
    if (!this.statusHistory.has(id)) {
      this.statusHistory.set(id, []);
    }
    this.statusHistory.get(id)?.push(status);
  }
  async updateMetadata(id: string, metadata: MaterialMetadata): Promise<void> {
    const material = this.items.get(id);
    if (material) {
      material.metadata = metadata;
    }
  }
  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }
}

class MemoryQuestionRepository implements QuestionRepository {
  readonly byMaterial = new Map<string, MCQQuestion[]>();
  async createMany(questions: MCQQuestion[]): Promise<void> {
    const materialId = questions[0]?.materialId;
    if (!materialId) {
      return;
    }
    this.byMaterial.set(materialId, questions);
  }
  async findById(id: string): Promise<MCQQuestion | null> {
    for (const questions of this.byMaterial.values()) {
      const found = questions.find((question) => question.id === id);
      if (found) {
        return found;
      }
    }
    return null;
  }
  async findByMaterialId(materialId: string): Promise<MCQQuestion[]> {
    return this.byMaterial.get(materialId) ?? [];
  }
  async findAll(_params?: {
    topic?: string;
    difficulty?: { min: number; max: number };
    materialId?: string;
    limit?: number;
    offset?: number;
  }): Promise<MCQQuestion[]> {
    return [...this.byMaterial.values()].flat();
  }
  async update(_id: string, _updates: Partial<MCQQuestion>): Promise<MCQQuestion | null> {
    return null;
  }
  async deleteByMaterialId(materialId: string): Promise<number> {
    const count = this.byMaterial.get(materialId)?.length ?? 0;
    this.byMaterial.delete(materialId);
    return count;
  }
}

class MemoryStorage implements FileStoragePort {
  readonly filesByRoot = new Map<string, Map<string, ArrayBuffer>>();
  async upload(_key: string, _content: string | ArrayBuffer): Promise<void> {
    return;
  }
  async download(_key: string): Promise<string | null> {
    return null;
  }
  async downloadBytes(_key: string): Promise<ArrayBuffer | null> {
    return null;
  }
  async downloadAsFileMap(rootKey: string, _manifestKey?: string | null): Promise<Map<string, ArrayBuffer>> {
    return this.filesByRoot.get(rootKey) ?? new Map();
  }
  async delete(_key: string): Promise<void> {
    return;
  }
  async exists(_key: string): Promise<boolean> {
    return false;
  }
}

class MemoryNormalizationPort implements NormalizationPort {
  calls: NormalizeCommand[] = [];
  constructor(private readonly response: NormalizationResult) {}
  async normalize(command: NormalizeCommand): Promise<NormalizationResult> {
    this.calls.push(command);
    return this.response;
  }
}

describe('ExtractQuestionsUseCase integration', () => {
  it('extracts MCQs directly from latex sources', async () => {
    const materialRepo = new MemoryMaterialRepository();
    const questionRepo = new MemoryQuestionRepository();
    const storage = new MemoryStorage();
    const normalizer = new MemoryNormalizationPort({ mainFile: 'unused.tex', fileMap: new Map() });

    const material = createMaterial({
      id: 'mat-latex',
      sourceType: 'latex',
      r2Key: 'materials/mat-latex',
      manifestKey: 'materials/mat-latex/manifest.json'
    });
    await materialRepo.create(material);

    storage.filesByRoot.set(
      'materials/mat-latex',
      new Map([
        [
          'main.tex',
          new TextEncoder().encode(
            '\\documentclass{article}\n\\begin{document}\nCâu 1: Tính 1+1\nA. 1\nB. 2\nC. 3\nD. 4\nĐáp án: B\n\\end{document}'
          ).buffer
        ]
      ])
    );

    const useCase = new ExtractQuestionsUseCase(materialRepo, questionRepo, storage, normalizer);
    const questions = await useCase.execute({ materialId: 'mat-latex' });

    expect(questions).toHaveLength(1);
    expect(questions[0].correctAnswer).toBe('B');
    expect(questions[0].answerStatus).toBe('confirmed');
    expect(materialRepo.items.get('mat-latex')?.status).toBe('completed');
    expect(normalizer.calls).toHaveLength(0);
  });

  it('extracts MCQs from normalized non-latex sources', async () => {
    const materialRepo = new MemoryMaterialRepository();
    const questionRepo = new MemoryQuestionRepository();
    const storage = new MemoryStorage();
    const normalizer = new MemoryNormalizationPort({
      mainFile: 'main.tex',
      fileMap: new Map([
        [
          'main.tex',
          '\\documentclass{article}\n\\begin{document}\nQuestion 1: Pick one\nA. alpha\nB. beta\nC. gamma\nD. delta\n\\end{document}'
        ]
      ])
    });

    const material = createMaterial({
      id: 'mat-pdf',
      sourceType: 'pdf',
      r2Key: 'materials/mat-pdf',
      manifestKey: 'materials/mat-pdf/manifest.json'
    });
    await materialRepo.create(material);
    storage.filesByRoot.set(
      'materials/mat-pdf',
      new Map([['input.pdf', new TextEncoder().encode('pdf bytes').buffer]])
    );

    const useCase = new ExtractQuestionsUseCase(materialRepo, questionRepo, storage, normalizer);
    const questions = await useCase.execute({ materialId: 'mat-pdf' });

    expect(normalizer.calls).toHaveLength(1);
    expect(questions).toHaveLength(1);
    expect(questions[0].answerStatus).toBe('needs_review');
    expect(materialRepo.statusHistory.get('mat-pdf')).toEqual(['normalizing', 'processing', 'completed']);
    expect(questionRepo.byMaterial.get('mat-pdf')).toHaveLength(1);
  });
});

import type { ExtractQuestionsCommand, ExtractQuestionsPort } from '../ports/input/extract-questions-port';
import type { MaterialRepository } from '../ports/output/material-repository';
import type { QuestionRepository } from '../ports/output/question-repository';
import type { FileStoragePort } from '../ports/output/file-storage-port';
import type { NormalizationPort } from '../ports/output/normalization-port';
import type { MCQQuestion } from '../../domain/entities/mcq-question';
import type { TestMaterial } from '../../domain/entities/test-material';
import { LaTeXParser } from '../../domain/services/latex-parser/latex-parser';
import { QuestionDetector } from '../../domain/services/question-detector';
import { MCQFormatter } from '../../domain/services/mcq-formatter';

export class ExtractQuestionsUseCase implements ExtractQuestionsPort {
  private readonly parser = new LaTeXParser();
  private readonly detector = new QuestionDetector();
  private readonly formatter = new MCQFormatter();

  constructor(
    private readonly materialRepo: MaterialRepository,
    private readonly questionRepo: QuestionRepository,
    private readonly storage: FileStoragePort,
    private readonly normalizer: NormalizationPort
  ) {}

  async execute(command: ExtractQuestionsCommand): Promise<MCQQuestion[]> {
    const { materialId } = command;
    let material: TestMaterial | null = null;

    try {
      material = await this.materialRepo.findById(materialId);
      if (!material) {
        throw new Error(`Material ${materialId} not found`);
      }

      const rawFiles = await this.storage.downloadAsFileMap(material.r2Key, material.manifestKey);
      if (rawFiles.size === 0) {
        throw new Error(`No files found for material ${materialId}`);
      }

      const normalized =
        material.sourceType === 'latex'
          ? this.fromLatexFiles(rawFiles, material)
          : await this.fromNormalizedSource(rawFiles, material);

      await this.materialRepo.updateStatus(materialId, 'processing');
      const parsed = this.parser.parse(normalized.fileMap, normalized.mainFile);

      const questions: MCQQuestion[] = [];
      let questionIndex = 0;
      for (const chapter of parsed.chapters) {
        for (const section of chapter.sections) {
          const blocks = this.detector.detect(section);
          for (const block of blocks) {
            questions.push(
              this.formatter.format(block, materialId, chapter.number, section.title, questionIndex)
            );
            questionIndex += 1;
          }
        }
      }

      await this.questionRepo.deleteByMaterialId(materialId);
      if (questions.length > 0) {
        await this.questionRepo.createMany(questions);
      }

      await this.materialRepo.updateMetadata(materialId, parsed.metadata);
      await this.materialRepo.updateStatus(materialId, 'completed');

      return questions;
    } catch (error) {
      if (material) {
        const message = error instanceof Error ? error.message : 'Unknown extraction error';
        await this.materialRepo.updateStatus(material.id, 'failed', message);
      }
      throw error;
    }
  }

  private fromLatexFiles(rawFiles: Map<string, ArrayBuffer>, material: TestMaterial): {
    mainFile: string;
    fileMap: Map<string, string>;
  } {
    const decoded = new Map<string, string>();
    for (const [name, bytes] of rawFiles) {
      decoded.set(name, new TextDecoder().decode(bytes));
    }

    return {
      mainFile: selectMainFile(decoded, material.metadata?.mainFile),
      fileMap: decoded
    };
  }

  private async fromNormalizedSource(rawFiles: Map<string, ArrayBuffer>, material: TestMaterial): Promise<{
    mainFile: string;
    fileMap: Map<string, string>;
  }> {
    await this.materialRepo.updateStatus(material.id, 'normalizing');

    const normalized = await this.normalizer.normalize({
      materialId: material.id,
      sourceType: material.sourceType as 'pdf' | 'docx' | 'image',
      fileMap: rawFiles
    });

    return {
      mainFile: normalized.mainFile,
      fileMap: normalized.fileMap
    };
  }
}

function selectMainFile(fileMap: Map<string, string>, preferred?: string): string {
  if (preferred && fileMap.has(preferred)) {
    return preferred;
  }

  for (const name of fileMap.keys()) {
    if (name.toLowerCase().endsWith('/main.tex') || name.toLowerCase() === 'main.tex') {
      return name;
    }
  }

  const [first] = [...fileMap.keys()].sort((a, b) => a.localeCompare(b));
  if (!first) {
    throw new Error('No files available for parsing');
  }
  return first;
}

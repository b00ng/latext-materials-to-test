import type { SourceType } from '../../../domain/entities/test-material';

export interface IngestMaterialCommand {
  sourceType: SourceType;
  files: Array<{
    name: string;
    mimeType: string;
    content: ArrayBuffer;
  }>;
  mainFile?: string;
  title?: string;
}

export interface IngestMaterialResult {
  materialId: string;
  jobId: string;
}

export interface IngestMaterialPort {
  execute(command: IngestMaterialCommand): Promise<IngestMaterialResult>;
}

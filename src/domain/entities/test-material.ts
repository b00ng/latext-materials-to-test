import type { MaterialMetadata } from '../value-objects/material-metadata';

export type SourceType = 'latex' | 'pdf' | 'docx' | 'image';

export type MaterialStatus =
  | 'uploaded'
  | 'normalizing'
  | 'processing'
  | 'completed'
  | 'failed';

export interface TestMaterial {
  id: string;
  sourceType: SourceType;
  title: string | null;
  rawContent: string;
  status: MaterialStatus;
  r2Key: string;
  manifestKey: string | null;
  metadata: MaterialMetadata | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMaterialParams {
  id: string;
  sourceType: SourceType;
  title?: string;
  r2Key: string;
  manifestKey?: string;
}

export function createMaterial(params: CreateMaterialParams): TestMaterial {
  return {
    id: params.id,
    sourceType: params.sourceType,
    title: params.title ?? null,
    rawContent: '',
    status: 'uploaded',
    r2Key: params.r2Key,
    manifestKey: params.manifestKey ?? null,
    metadata: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

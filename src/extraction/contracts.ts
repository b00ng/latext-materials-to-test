import { z } from 'zod';

export const MAX_EXTRACTION_FILES = 5;
export const MAX_EXTRACTION_INPUT_BYTES = 5 * 1024 * 1024;
export const EXTRACTION_JOB_TTL_SECONDS = 60 * 60 * 24;
export const SOURCE_TYPES = ['pdf', 'docx', 'image'] as const;

const base64Pattern = /^[A-Za-z0-9+/=\s]+$/;
export const materialIdSchema = z.string().trim().min(1).max(128);
export const sourceTypeSchema = z.enum(SOURCE_TYPES);

const inputFileSchema = z.object({
  name: z.string().trim().min(1).max(260),
  contentBase64: z
    .string()
    .trim()
    .min(1)
    .max(10_000_000)
    .refine((value) => base64Pattern.test(value), 'contentBase64 must be valid base64')
});

export const extractionRequestSchema = z.object({
  materialId: materialIdSchema,
  sourceType: sourceTypeSchema,
  files: z.array(inputFileSchema).min(1).max(MAX_EXTRACTION_FILES)
});

export type SourceType = z.infer<typeof extractionRequestSchema>['sourceType'];

export interface ExtractionQueueMessage {
  jobId: string;
  materialId: string;
  sourceType: SourceType;
  files: Array<{
    name: string;
    key: string;
  }>;
}

export type ExtractionJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface ExtractionJobState {
  jobId: string;
  materialId: string;
  sourceType: SourceType;
  status: ExtractionJobStatus;
  updatedAt: string;
  errorMessage?: string;
  normalized?: {
    mainFile: string;
    fileCount: number;
    preview: string;
  };
}

import { z } from 'zod';
import { ApiError } from '../http/api-error';
import type { SourceType } from '../core/ocr-provider';

const BASE64_PATTERN = /^[A-Za-z0-9+/=\s]+$/;

const normalizeFileSchema = z.object({
  name: z.string().trim().min(1).max(260),
  contentBase64: z
    .string()
    .trim()
    .min(1)
    .max(10_000_000)
    .refine((value) => BASE64_PATTERN.test(value), 'contentBase64 must be valid base64 text')
});

const normalizeRequestSchema = z.object({
  materialId: z.string().trim().min(1).max(128),
  sourceType: z.enum(['pdf', 'docx', 'image']),
  files: z.array(normalizeFileSchema).min(1).max(25)
});

export type NormalizeRequest = {
  materialId: string;
  sourceType: SourceType;
  files: Array<{
    name: string;
    contentBase64: string;
  }>;
};

export const parseNormalizeRequest = (payload: unknown): NormalizeRequest => {
  try {
    const parsed = normalizeRequestSchema.parse(payload);
    return {
      materialId: parsed.materialId,
      sourceType: parsed.sourceType,
      files: parsed.files.map((file) => ({
        name: file.name,
        contentBase64: file.contentBase64.replace(/\s+/g, '')
      }))
    };
  } catch (error) {
    throw new ApiError(400, 'invalid_request', 'Request payload is invalid.', error);
  }
};

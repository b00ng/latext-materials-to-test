import { z } from 'zod';

export const MaterialStatusSchema = z.enum([
  'uploaded',
  'normalizing',
  'processing',
  'completed',
  'failed'
]);

export const ListMaterialsSchema = z.object({
  status: MaterialStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export const UploadMaterialMetadataSchema = z.object({
  sourceType: z.enum(['latex', 'pdf', 'docx', 'image']).optional(),
  mainFile: z.string().trim().min(1).max(260).optional(),
  title: z.string().trim().min(1).max(200).optional()
});

import { z } from 'zod';

export const GenerateTestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  questionCount: z.coerce.number().int().min(1).max(200),
  difficulty: z
    .object({
      min: z.coerce.number().int().min(1).max(10),
      max: z.coerce.number().int().min(1).max(10)
    })
    .optional(),
  topics: z.array(z.string().trim().min(1)).max(100).optional(),
  materialIds: z.array(z.string().trim().min(1)).max(200).optional(),
  durationMinutes: z.coerce.number().int().min(1).optional()
});

export const ListTestsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

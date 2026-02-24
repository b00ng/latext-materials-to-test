import { z } from 'zod';

export const QuestionChoiceSchema = z.object({
  label: z.enum(['A', 'B', 'C', 'D']),
  text: z.string(),
  latex: z.string(),
  isCorrect: z.boolean()
});

export const ListQuestionsSchema = z.object({
  materialId: z.string().trim().min(1).optional(),
  topic: z.string().trim().min(1).optional(),
  difficultyMin: z.coerce.number().int().min(1).max(10).optional(),
  difficultyMax: z.coerce.number().int().min(1).max(10).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export const UpdateQuestionSchema = z
  .object({
    stem: z.string().optional(),
    stemLatex: z.string().optional(),
    choices: z.array(QuestionChoiceSchema).length(4).optional(),
    correctAnswer: z.enum(['A', 'B', 'C', 'D']).nullable().optional(),
    answerStatus: z.enum(['confirmed', 'needs_review']).optional(),
    explanation: z.string().nullable().optional(),
    explanationLatex: z.string().nullable().optional(),
    difficulty: z.coerce.number().int().min(1).max(10).optional(),
    topic: z.string().nullable().optional(),
    tags: z.array(z.string()).optional()
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one updatable field is required in the request body.'
  );

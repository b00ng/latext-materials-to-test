import type { Context, Next } from 'hono';
import type { z } from 'zod';
import { ValidationError } from '../../shared/errors';

export function validateQuery<T extends z.ZodTypeAny>(schema: T) {
  return async (c: Context, next: Next): Promise<void> => {
    const parsed = schema.safeParse(c.req.query());
    if (!parsed.success) {
      throw new ValidationError('Invalid query parameters.', parsed.error.flatten());
    }
    c.set('validatedQuery', parsed.data);
    await next();
  };
}

export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return async (c: Context, next: Next): Promise<void> => {
    let body: unknown = {};

    try {
      body = await c.req.json();
    } catch {
      body = {};
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body.', parsed.error.flatten());
    }

    c.set('validatedBody', parsed.data);
    await next();
  };
}

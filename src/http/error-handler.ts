import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import { AppError } from '../shared/errors';
import { RouteError } from '../extraction/create-job-request';

type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export const handleHttpError = (error: unknown, c: Context): Response => {
  if (error instanceof AppError) {
    return c.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      } satisfies ErrorEnvelope,
      error.statusCode as ContentfulStatusCode
    );
  }

  if (error instanceof RouteError) {
    return c.json(
      {
        error: {
          code: error.code,
          message: error.message
        }
      } satisfies ErrorEnvelope,
      error.statusCode as ContentfulStatusCode
    );
  }

  if (error instanceof ZodError) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request.',
          details: error.flatten()
        }
      } satisfies ErrorEnvelope,
      400
    );
  }

  console.error('Unhandled HTTP error:', error);
  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.'
      }
    } satisfies ErrorEnvelope,
    500
  );
};

import { ZodError } from 'zod';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const toApiError = (error: unknown): ApiError => {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ApiError(400, 'invalid_request', 'Request payload is invalid.', error.flatten());
  }

  if (error instanceof Error) {
    return new ApiError(500, 'internal_error', error.message);
  }

  return new ApiError(500, 'internal_error', 'Unexpected server error.');
};

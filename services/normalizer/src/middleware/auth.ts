import type { MiddlewareHandler } from 'hono';
import { ApiError } from '../http/api-error';
import type { NormalizerBindings } from '../core/runtime-config';

export const extractBearerToken = (headerValue: string | null): string | null => {
  if (!headerValue) {
    return null;
  }

  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
};

export const requireBearerAuth = (): MiddlewareHandler<{ Bindings: NormalizerBindings }> => {
  return async (c, next) => {
    const expectedToken = c.env.NORMALIZER_TOKEN;
    if (!expectedToken) {
      throw new ApiError(500, 'config_error', 'NORMALIZER_TOKEN is not configured.');
    }

    const providedToken = extractBearerToken(c.req.header('Authorization') ?? null);
    if (!providedToken || providedToken !== expectedToken) {
      throw new ApiError(401, 'unauthorized', 'Missing or invalid bearer token.');
    }

    await next();
  };
};

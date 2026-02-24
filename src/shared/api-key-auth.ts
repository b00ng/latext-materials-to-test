import type { Context, Next } from 'hono';
import type { EnvBindings } from '../env';
import { AppError } from './errors';

const API_KEY_PREFIX = 'api-key:';
const ACTIVE_STATES = new Set(['active', '1', 'true', 'enabled']);
const MAX_API_KEY_LENGTH = 256;

type ApiContext = Context<{ Bindings: EnvBindings }>;

export const apiKeyCacheKey = (apiKey: string): string => `${API_KEY_PREFIX}${apiKey.trim()}`;

export const extractApiKeyFromRequest = (c: ApiContext): string | null => {
  const fromHeader = c.req.header('x-api-key')?.trim();
  if (fromHeader) {
    return fromHeader;
  }

  const authHeader = c.req.header('authorization') ?? c.req.header('Authorization');
  if (!authHeader) {
    return null;
  }

  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  return bearerMatch?.[1]?.trim() || null;
};

export const requireApiKey = async (c: ApiContext, next: Next): Promise<Response | void> => {
  const key = extractApiKeyFromRequest(c);

  if (!key) {
    throw new AppError('Missing API key.', 401, 'UNAUTHORIZED');
  }

  if (key.length > MAX_API_KEY_LENGTH) {
    throw new AppError('Invalid API key.', 401, 'UNAUTHORIZED');
  }

  const status = await c.env.CACHE.get(apiKeyCacheKey(key));
  if (!status || !ACTIVE_STATES.has(status.trim().toLowerCase())) {
    throw new AppError('Invalid API key.', 401, 'UNAUTHORIZED');
  }

  await next();
};

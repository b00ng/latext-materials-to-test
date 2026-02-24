import type { Context, Next } from 'hono';
import type { EnvBindings } from '../env';

const API_KEY_PREFIX = 'api-key:';
const ACTIVE_STATES = new Set(['active', '1', 'true']);

type ApiContext = Context<{ Bindings: EnvBindings }>;

export const apiKeyCacheKey = (apiKey: string): string => `${API_KEY_PREFIX}${apiKey.trim()}`;

export const requireApiKey = async (c: ApiContext, next: Next): Promise<Response | void> => {
  const key = c.req.header('x-api-key')?.trim();

  if (!key) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing API key.' } }, 401);
  }

  const status = await c.env.CACHE.get(apiKeyCacheKey(key));
  if (!status || !ACTIVE_STATES.has(status.toLowerCase())) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid API key.' } }, 401);
  }

  await next();
};

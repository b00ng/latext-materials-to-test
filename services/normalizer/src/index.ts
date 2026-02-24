import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ApiError, toApiError } from './http/api-error';
import { requireBearerAuth } from './middleware/auth';
import { parseNormalizeRequest } from './schemas/normalize-schema';
import { readRuntimeConfig, type NormalizerBindings } from './core/runtime-config';
import { createOcrProvider } from './core/provider-registry';
import { normalizeMaterial } from './core/normalizer';

type AppContext = {
  Bindings: NormalizerBindings;
  Variables: {
    requestId: string;
  };
};

const app = new Hono<AppContext>();

app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id')?.trim() || crypto.randomUUID();
  c.set('requestId', requestId);
  await next();
});

app.get('/health', (c) => {
  const requestId = c.get('requestId');

  try {
    const config = readRuntimeConfig(c.env);
    return c.json({
      status: 'ok',
      requestId,
      provider: config.provider,
      model: config.model,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const apiError = toApiError(error);
    return c.json(
      {
        status: 'error',
        requestId,
        error: {
          code: apiError.code,
          message: apiError.message
        }
      },
      500
    );
  }
});

app.post('/normalize', requireBearerAuth(), async (c) => {
  const requestId = c.get('requestId');

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.');
  }

  const request = parseNormalizeRequest(payload);
  const runtimeConfig = readRuntimeConfig(c.env);
  const provider = createOcrProvider(runtimeConfig);

  const result = await normalizeMaterial({
    provider,
    config: runtimeConfig,
    input: {
      materialId: request.materialId,
      sourceType: request.sourceType,
      files: request.files,
      requestId
    }
  });

  console.log(
    JSON.stringify({
      level: 'info',
      event: 'normalize.completed',
      requestId,
      materialId: request.materialId,
      sourceType: request.sourceType,
      fileCount: request.files.length,
      provider: runtimeConfig.provider,
      model: runtimeConfig.model
    })
  );

  return c.json(result);
});

app.notFound((c) => {
  return c.json(
    {
      error: {
        code: 'not_found',
        message: 'Route not found.',
        requestId: c.get('requestId')
      }
    },
    404
  );
});

app.onError((error, c) => {
  const requestId = c.get('requestId');
  const apiError = toApiError(error);

  console.error(
    JSON.stringify({
      level: 'error',
      event: 'request.failed',
      requestId,
      code: apiError.code,
      status: apiError.status,
      message: apiError.message,
      details: apiError.details
    })
  );

  return c.json(
    {
      error: {
        code: apiError.code,
        message: apiError.message,
        requestId,
        details: apiError.details
      }
    },
    apiError.status as ContentfulStatusCode
  );
});

export default {
  fetch: app.fetch
};

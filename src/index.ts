import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { EnvBindings } from './env';
import { extractionRoutes } from './extraction/routes';
import { handleExtractionMessage } from './extraction/queue-handler';
import { requireApiKey } from './shared/api-key-auth';
import { handleHttpError } from './http/error-handler';
import { jobsRoutes } from './http/routes/jobs-routes';
import { materialsRoutes } from './http/routes/materials-routes';
import { questionsRoutes } from './http/routes/questions-routes';
import { testsRoutes } from './http/routes/tests-routes';

const app = new Hono<{ Bindings: EnvBindings }>();

app.use('*', cors());

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  })
);

app.get('/', (c) => c.json({ name: 'MCQ Generator', version: '0.2.0' }));

app.use('/api/*', requireApiKey);
app.route('/api/extraction', extractionRoutes);
app.route('/api/materials', materialsRoutes);
app.route('/api/questions', questionsRoutes);
app.route('/api/tests', testsRoutes);
app.route('/api/jobs', jobsRoutes);

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404));
app.onError((error, c) => handleHttpError(error, c));

export default {
  fetch: app.fetch,
  queue: async (batch: MessageBatch<unknown>, env: EnvBindings): Promise<void> => {
    for (const message of batch.messages) {
      await handleExtractionMessage(message, env);
    }
  },
  scheduled: async (_event: ScheduledEvent, env: EnvBindings): Promise<void> => {
    await env.DB.prepare(
      `DELETE FROM materials
       WHERE status = 'failed' AND updated_at < datetime('now', '-7 days')`
    ).run();
  }
};

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { EnvBindings } from './env';
import { extractionRoutes, getExtractionJob } from './extraction/routes';
import { handleExtractionMessage } from './extraction/queue-handler';
import { requireApiKey } from './shared/api-key-auth';

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
app.get('/api/jobs/:jobId', getExtractionJob);

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404));

export default {
  fetch: app.fetch,
  queue: async (batch: MessageBatch<unknown>, env: EnvBindings): Promise<void> => {
    for (const message of batch.messages) {
      await handleExtractionMessage(message, env);
    }
  },
  scheduled: async (_event: ScheduledEvent, env: EnvBindings): Promise<void> => {
    console.log(`Scheduled trigger executed in ${env.ENVIRONMENT}`);
  }
};

import { Hono } from 'hono';
import { cors } from 'hono/cors';

export type Env = {
  DB: D1Database;
  STORAGE: R2Bucket;
  EXTRACTION_QUEUE: Queue;
  CACHE: KVNamespace;
  ENVIRONMENT: string;
  NORMALIZER_URL: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  })
);

app.get('/', (c) => c.json({ name: 'MCQ Generator', version: '0.1.0' }));

export default {
  fetch: app.fetch,
  queue: async (batch: MessageBatch<unknown>, env: Env): Promise<void> => {
    console.log(`Received ${batch.messages.length} message(s) in ${env.ENVIRONMENT}`);
  },
  scheduled: async (_event: ScheduledEvent, env: Env): Promise<void> => {
    console.log(`Scheduled trigger executed in ${env.ENVIRONMENT}`);
  }
};

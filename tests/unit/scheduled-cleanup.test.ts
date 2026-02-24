import { describe, expect, it } from 'vitest';

import worker from '../../src/index';
import type { EnvBindings } from '../../src/env';
import { MockD1Database } from '../helpers/mock-d1';

const createEnv = (): EnvBindings & { DB: MockD1Database } => {
  const db = new MockD1Database();
  return {
    CACHE: {} as KVNamespace,
    STORAGE: {} as R2Bucket,
    EXTRACTION_QUEUE: {} as Queue,
    DB: db,
    ENVIRONMENT: 'test',
    NORMALIZER_URL: 'https://normalizer.example.com',
    NORMALIZER_TOKEN: 'token'
  } as EnvBindings & { DB: MockD1Database };
};

describe('scheduled cleanup', () => {
  it('deletes stale failed materials older than seven days', async () => {
    const env = createEnv();
    await worker.scheduled({} as ScheduledEvent, env);

    expect(env.DB.runCalls).toHaveLength(1);
    expect(env.DB.runCalls[0].sql).toContain("DELETE FROM materials WHERE status = 'failed'");
    expect(env.DB.runCalls[0].sql).toContain("datetime('now', '-7 days')");
  });
});

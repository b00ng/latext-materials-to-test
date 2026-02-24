import type { EnvBindings } from '../../src/env';
import { apiKeyCacheKey } from '../../src/shared/api-key-auth';
import { MockD1Database } from './mock-d1';

export class MemoryKv {
  private readonly map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
}

export class MemoryR2 {
  readonly puts: Array<{ key: string; value: unknown }> = [];
  readonly deleted: string[] = [];
  private readonly keys = new Set<string>();

  async put(key: string, value: unknown): Promise<void> {
    this.puts.push({ key, value });
    this.keys.add(key);
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    if (!this.keys.has(key)) {
      return null;
    }
    return {
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0)
    } as R2ObjectBody;
  }

  async delete(key: string): Promise<void> {
    this.deleted.push(key);
    this.keys.delete(key);
  }

  async list(options?: { prefix?: string; cursor?: string }): Promise<R2Objects> {
    const prefix = options?.prefix ?? '';
    const objects = [...this.keys]
      .filter((key) => key.startsWith(prefix))
      .sort()
      .map((key) => ({ key }));

    return {
      objects,
      truncated: false
    } as unknown as R2Objects;
  }

  seed(keys: string[]): void {
    for (const key of keys) {
      this.keys.add(key);
    }
  }
}

export type ApiTestEnv = EnvBindings & {
  DB: MockD1Database;
  CACHE: MemoryKv;
  STORAGE: MemoryR2;
  queueMessages: unknown[];
};

export async function createApiTestEnv(): Promise<ApiTestEnv> {
  const cache = new MemoryKv();
  await cache.put(apiKeyCacheKey('valid-key'), 'active');

  const db = new MockD1Database();
  const storage = new MemoryR2();
  const queueMessages: unknown[] = [];

  return {
    CACHE: cache,
    STORAGE: storage,
    EXTRACTION_QUEUE: {
      send: async (message: unknown) => {
        queueMessages.push(message);
      }
    } as Queue,
    DB: db,
    ENVIRONMENT: 'test',
    NORMALIZER_URL: 'https://normalizer.example.com',
    NORMALIZER_TOKEN: 'token',
    queueMessages
  } as unknown as ApiTestEnv;
}

export const materialRow = (
  id: string,
  status: 'uploaded' | 'normalizing' | 'processing' | 'completed' | 'failed' = 'uploaded',
  sourceType: 'latex' | 'pdf' | 'docx' | 'image' = 'pdf',
  rootKey?: string
) => {
  const key = rootKey ?? `materials/${id}`;
  return {
    id,
    title: `Material ${id}`,
    source_type: sourceType,
    status,
    r2_key: key,
    manifest_key: `${key}/manifest.json`,
    metadata: null,
    error_message: null,
    created_at: '2026-02-24T10:00:00.000Z',
    updated_at: '2026-02-24T10:00:00.000Z'
  };
};

export const extractionJobRow = (jobId: string, materialId: string, status = 'pending') => ({
  id: jobId,
  material_id: materialId,
  status,
  progress: 0,
  result: null,
  error: null,
  started_at: null,
  completed_at: null,
  created_at: '2026-02-24T10:00:00.000Z'
});

export const questionRow = (id: string, materialId: string, topic = 'algebra', difficulty = 5) => ({
  id,
  material_id: materialId,
  stem: `Question ${id}`,
  stem_latex: `Question ${id}`,
  choices: JSON.stringify([
    { label: 'A', text: '1', latex: '1', isCorrect: false },
    { label: 'B', text: '2', latex: '2', isCorrect: false },
    { label: 'C', text: '3', latex: '3', isCorrect: false },
    { label: 'D', text: '4', latex: '4', isCorrect: true }
  ]),
  correct_answer: 'D',
  answer_status: 'confirmed',
  explanation: null,
  explanation_latex: null,
  difficulty,
  topic,
  tags: JSON.stringify(['tag']),
  source_chapter: 1,
  source_section: 'S1',
  source_question_index: 0,
  created_at: '2026-02-24T10:00:00.000Z'
});

export const testSheetRow = (id: string, questionIds: string[]) => ({
  id,
  title: 'Generated Test',
  subject: 'math',
  total_questions: questionIds.length,
  duration_minutes: 45,
  question_ids: JSON.stringify(questionIds),
  created_at: '2026-02-24T10:00:00.000Z'
});

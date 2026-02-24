import type { ExtractionJobState } from '../../extraction/contracts';

type ExtractionJobRow = {
  id: string;
  material_id: string;
  status: ExtractionJobState['status'];
  progress: number;
  result: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export interface ExtractionJobRepository {
  createPending(jobId: string, materialId: string): Promise<void>;
  findById(jobId: string): Promise<ExtractionJobState | null>;
  markProcessing(jobId: string, progress: number): Promise<void>;
  updateProgress(jobId: string, progress: number): Promise<void>;
  markCompleted(jobId: string, result: Record<string, unknown>): Promise<void>;
  markFailed(jobId: string, error: string): Promise<void>;
  markRetryPending(jobId: string, error: string): Promise<void>;
}

export class D1ExtractionJobRepository implements ExtractionJobRepository {
  constructor(private readonly db: D1Database) {}

  async createPending(jobId: string, materialId: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO extraction_jobs (id, material_id, status, progress, created_at)
         VALUES (?, ?, 'pending', 0, datetime('now'))
         ON CONFLICT(id) DO NOTHING`
      )
      .bind(jobId, materialId)
      .run();
  }

  async findById(jobId: string): Promise<ExtractionJobState | null> {
    const row = await this.db
      .prepare('SELECT * FROM extraction_jobs WHERE id = ?')
      .bind(jobId)
      .first<ExtractionJobRow>();
    if (!row) {
      return null;
    }

    return {
      jobId: row.id,
      materialId: row.material_id,
      status: row.status,
      progress: row.progress,
      result: parseJsonObject(row.result),
      errorMessage: row.error ?? undefined,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at
    };
  }

  async markProcessing(jobId: string, progress: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE extraction_jobs
         SET status = 'processing',
             progress = ?,
             started_at = COALESCE(started_at, datetime('now')),
             error = NULL
         WHERE id = ?`
      )
      .bind(progress, jobId)
      .run();
  }

  async updateProgress(jobId: string, progress: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE extraction_jobs
         SET progress = ?
         WHERE id = ?`
      )
      .bind(progress, jobId)
      .run();
  }

  async markCompleted(jobId: string, result: Record<string, unknown>): Promise<void> {
    await this.db
      .prepare(
        `UPDATE extraction_jobs
         SET status = 'completed',
             progress = 100,
             result = ?,
             error = NULL,
             completed_at = datetime('now')
         WHERE id = ?`
      )
      .bind(JSON.stringify(result), jobId)
      .run();
  }

  async markFailed(jobId: string, error: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE extraction_jobs
         SET status = 'failed',
             error = ?,
             completed_at = datetime('now')
         WHERE id = ?`
      )
      .bind(error, jobId)
      .run();
  }

  async markRetryPending(jobId: string, error: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE extraction_jobs
         SET status = 'pending',
             error = ?,
             completed_at = NULL
         WHERE id = ?`
      )
      .bind(error, jobId)
      .run();
  }
}

function parseJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

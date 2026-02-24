import type { MaterialRepository } from '../../application/ports/output/material-repository';
import type { MaterialStatus, TestMaterial } from '../../domain/entities/test-material';
import type { MaterialMetadata } from '../../domain/value-objects/material-metadata';

type MaterialRow = {
  id: string;
  title: string | null;
  source_type: TestMaterial['sourceType'];
  status: MaterialStatus;
  r2_key: string;
  manifest_key: string | null;
  metadata: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export class D1MaterialRepository implements MaterialRepository {
  constructor(private readonly db: D1Database) {}

  async create(material: TestMaterial): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO materials (id, title, source_type, status, r2_key, manifest_key, metadata, error_message, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           source_type = excluded.source_type,
           status = excluded.status,
           r2_key = excluded.r2_key,
           manifest_key = excluded.manifest_key,
           metadata = excluded.metadata,
           error_message = excluded.error_message,
           updated_at = datetime('now')`
      )
      .bind(
        material.id,
        material.title,
        material.sourceType,
        material.status,
        material.r2Key,
        material.manifestKey,
        material.metadata ? JSON.stringify(material.metadata) : null,
        material.errorMessage
      )
      .run();
  }

  async findById(id: string): Promise<TestMaterial | null> {
    const row = await this.db
      .prepare('SELECT * FROM materials WHERE id = ?')
      .bind(id)
      .first<MaterialRow>();
    return row ? mapMaterialRow(row) : null;
  }

  async findAll(params?: {
    status?: MaterialStatus;
    limit?: number;
    offset?: number;
  }): Promise<TestMaterial[]> {
    let sql = 'SELECT * FROM materials';
    const binds: unknown[] = [];

    if (params?.status) {
      sql += ' WHERE status = ?';
      binds.push(params.status);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    binds.push(params?.limit ?? 50);
    binds.push(params?.offset ?? 0);

    const result = await this.db
      .prepare(sql)
      .bind(...binds)
      .all<MaterialRow>();

    return result.results.map(mapMaterialRow);
  }

  async updateStatus(id: string, status: MaterialStatus, error?: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE materials
         SET status = ?, error_message = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(status, error ?? null, id)
      .run();
  }

  async updateMetadata(id: string, metadata: MaterialMetadata): Promise<void> {
    await this.db
      .prepare(
        `UPDATE materials
         SET metadata = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(JSON.stringify(metadata), id)
      .run();
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM materials WHERE id = ?').bind(id).run();
  }
}

function mapMaterialRow(row: MaterialRow): TestMaterial {
  return {
    id: row.id,
    sourceType: row.source_type,
    title: row.title,
    rawContent: '',
    status: row.status,
    r2Key: row.r2_key,
    manifestKey: row.manifest_key,
    metadata: parseMetadata(row.metadata),
    errorMessage: row.error_message,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function parseMetadata(raw: string | null): MaterialMetadata | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as MaterialMetadata;
  } catch {
    return null;
  }
}

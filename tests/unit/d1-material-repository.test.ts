import { describe, expect, it } from 'vitest';

import { createMaterial } from '../../src/domain/entities/test-material';
import { D1MaterialRepository } from '../../src/infrastructure/persistence/d1-material-repository';
import { MockD1Database } from '../helpers/mock-d1';

describe('D1MaterialRepository', () => {
  it('upserts materials with expected SQL bindings', async () => {
    const db = new MockD1Database();
    const repo = new D1MaterialRepository(db);
    const material = createMaterial({
      id: 'mat-1',
      sourceType: 'latex',
      r2Key: 'materials/mat-1',
      manifestKey: 'materials/mat-1/manifest.json'
    });

    await repo.create(material);

    expect(db.runCalls).toHaveLength(1);
    expect(db.runCalls[0].sql).toContain('INSERT INTO materials');
    expect(db.runCalls[0].binds).toEqual([
      'mat-1',
      null,
      'latex',
      'uploaded',
      'materials/mat-1',
      'materials/mat-1/manifest.json',
      null,
      null
    ]);
  });

  it('maps findById row payloads into domain entities', async () => {
    const db = new MockD1Database();
    db.firstQueue.push({
      id: 'mat-2',
      title: 'Sheet A',
      source_type: 'pdf',
      status: 'processing',
      r2_key: 'materials/mat-2',
      manifest_key: 'materials/mat-2/manifest.json',
      metadata: JSON.stringify({ title: 'Sheet A', author: 'A', subject: 'math', language: 'vi', docclass: 'book', macros: {}, customEnvironments: {}, chapters: [] }),
      error_message: null,
      created_at: '2026-02-24T12:00:00.000Z',
      updated_at: '2026-02-24T12:05:00.000Z'
    });
    const repo = new D1MaterialRepository(db);

    const result = await repo.findById('mat-2');

    expect(result?.id).toBe('mat-2');
    expect(result?.sourceType).toBe('pdf');
    expect(result?.status).toBe('processing');
    expect(result?.metadata?.title).toBe('Sheet A');
    expect(result?.createdAt.toISOString()).toBe('2026-02-24T12:00:00.000Z');
  });

  it('supports status-filtered pagination in findAll', async () => {
    const db = new MockD1Database();
    db.allQueue.push({
      success: true,
      meta: { changes: 1 },
      results: [
        {
          id: 'mat-3',
          title: null,
          source_type: 'docx',
          status: 'failed',
          r2_key: 'materials/mat-3',
          manifest_key: null,
          metadata: null,
          error_message: 'parse failed',
          created_at: '2026-02-24T12:00:00.000Z',
          updated_at: '2026-02-24T12:05:00.000Z'
        }
      ]
    });
    const repo = new D1MaterialRepository(db);

    const results = await repo.findAll({ status: 'failed', limit: 10, offset: 5 });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('failed');
    expect(db.allCalls[0].binds).toEqual(['failed', 10, 5]);
  });

  it('updates status and metadata fields', async () => {
    const db = new MockD1Database();
    const repo = new D1MaterialRepository(db);

    await repo.updateStatus('mat-9', 'failed', 'broken');
    await repo.updateMetadata('mat-9', {
      title: 'T',
      author: 'A',
      subject: 'math',
      language: 'vi',
      docclass: 'book',
      macros: {},
      customEnvironments: {},
      chapters: []
    });

    expect(db.runCalls[0].sql).toContain('UPDATE materials');
    expect(db.runCalls[0].binds).toEqual(['failed', 'broken', 'mat-9']);
    expect(db.runCalls[1].binds[1]).toBe('mat-9');
  });
});

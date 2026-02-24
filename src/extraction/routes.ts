import { Hono } from 'hono';
import { z } from 'zod';
import { generateId } from '../shared/types';
import type { EnvBindings } from '../env';
import type { ExtractionJobState } from './contracts';
import {
  extractionRequestSchema,
  MAX_EXTRACTION_INPUT_BYTES,
  type ExtractionQueueMessage
} from './contracts';
import { decodeBase64ToArrayBuffer, estimateBase64Bytes } from './base64-utils';
import { readExtractionJob, writeExtractionJob } from './job-store';

const extractionRoutes = new Hono<{ Bindings: EnvBindings }>();

const nowIso = (): string => new Date().toISOString();

const parseCreateJobPayload = (payload: unknown) => {
  return extractionRequestSchema.parse(payload);
};

const ensurePayloadSize = (files: Array<{ contentBase64: string }>): void => {
  const bytes = files.reduce((total, file) => total + estimateBase64Bytes(file.contentBase64), 0);
  if (bytes > MAX_EXTRACTION_INPUT_BYTES) {
    throw new Error(`Payload exceeds ${MAX_EXTRACTION_INPUT_BYTES} bytes.`);
  }
};

const storageKey = (jobId: string, fileName: string): string => {
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_');
  return `extraction-inputs/${jobId}/${safeName}`;
};

extractionRoutes.post('/jobs', async (c) => {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: { code: 'INVALID_JSON', message: 'Body must be valid JSON.' } }, 400);
  }

  try {
    const request = parseCreateJobPayload(payload);
    ensurePayloadSize(request.files);

    const jobId = generateId();
    const queuedAt = nowIso();

    const fileRefs: ExtractionQueueMessage['files'] = [];

    for (const file of request.files) {
      const key = storageKey(jobId, file.name);
      const bytes = decodeBase64ToArrayBuffer(file.contentBase64);
      await c.env.STORAGE.put(key, bytes);
      fileRefs.push({
        name: file.name,
        key
      });
    }

    await writeExtractionJob(c.env.CACHE, {
      jobId,
      materialId: request.materialId,
      sourceType: request.sourceType,
      status: 'queued',
      updatedAt: queuedAt
    });

    await c.env.EXTRACTION_QUEUE.send({
      jobId,
      materialId: request.materialId,
      sourceType: request.sourceType,
      files: fileRefs
    } satisfies ExtractionQueueMessage);

    return c.json({ jobId, status: 'queued', queuedAt }, 202);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request payload is invalid.',
            details: error.flatten()
          }
        },
        400
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: { code: 'EXTRACTION_CREATE_FAILED', message } }, 422);
  }
});

extractionRoutes.get('/jobs/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  const state = (await readExtractionJob(c.env.CACHE, jobId)) as ExtractionJobState | null;

  if (!state) {
    return c.json({ error: { code: 'NOT_FOUND', message: `Job ${jobId} was not found.` } }, 404);
  }

  return c.json({ job: state });
});

export { extractionRoutes };

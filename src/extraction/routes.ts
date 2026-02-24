import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { EnvBindings } from '../env';
import type { ExtractionJobState, ExtractionQueueMessage } from './contracts';
import { parseCreateJobPayload, RouteError } from './create-job-request';
import { generateId } from '../shared/types';
import { readExtractionJob, writeExtractionJob } from './job-store';

const extractionRoutes = new Hono<{ Bindings: EnvBindings }>();

const nowIso = (): string => new Date().toISOString();

const storageKey = (jobId: string, fileName: string): string => {
  const safeName = fileName.trim().replace(/[^A-Za-z0-9._-]/g, '_');
  return `extraction-inputs/${jobId}/${safeName}`;
};

export const getExtractionJob = async (c: Context<{ Bindings: EnvBindings }>): Promise<Response> => {
  const jobId = c.req.param('jobId');
  const state = (await readExtractionJob(c.env.CACHE, jobId)) as ExtractionJobState | null;

  if (!state) {
    return c.json({ error: { code: 'NOT_FOUND', message: `Job ${jobId} was not found.` } }, 404);
  }

  return c.json({ job: state });
};

extractionRoutes.post('/jobs', async (c) => {
  try {
    const request = await parseCreateJobPayload(c);
    const jobId = generateId();
    const queuedAt = nowIso();
    const fileRefs: ExtractionQueueMessage['files'] = [];

    for (const file of request.files) {
      const key = storageKey(jobId, file.name);
      await c.env.STORAGE.put(key, file.bytes);
      fileRefs.push({ name: file.name, key });
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

    return c.json({ jobId, materialId: request.materialId, status: 'queued', queuedAt }, 202);
  } catch (error) {
    if (error instanceof RouteError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.statusCode);
    }

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

extractionRoutes.get('/jobs/:jobId', getExtractionJob);

export { extractionRoutes };

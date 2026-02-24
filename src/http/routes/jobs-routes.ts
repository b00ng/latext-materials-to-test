import { Hono } from 'hono';
import type { EnvBindings } from '../../env';
import { getExtractionJob } from '../../extraction/routes';

export const jobsRoutes = new Hono<{ Bindings: EnvBindings }>();

// GET /api/jobs/:jobId is canonical for extraction job status.
jobsRoutes.get('/:jobId', (c) => getExtractionJob(c));

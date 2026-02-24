import { Hono, type Context } from 'hono';
import type { EnvBindings } from '../env';
import type { ExtractionQueueMessage } from './contracts';
import { parseCreateJobPayload } from './create-job-request';
import { generateId } from '../shared/types';
import { createMaterial } from '../domain/entities/test-material';
import type { MaterialRepository } from '../application/ports/output/material-repository';
import { D1MaterialRepository } from '../infrastructure/persistence/d1-material-repository';
import {
  D1ExtractionJobRepository,
  type ExtractionJobRepository
} from '../infrastructure/persistence/d1-extraction-job-repository';
import { NotFoundError, ValidationError } from '../shared/errors';

type ExtractionRouteDependencies = {
  materialRepo: MaterialRepository;
  jobRepo: ExtractionJobRepository;
};

type ExtractionRouteDependenciesFactory = (env: EnvBindings) => ExtractionRouteDependencies;

const defaultDependenciesFactory: ExtractionRouteDependenciesFactory = (env) => ({
  materialRepo: new D1MaterialRepository(env.DB),
  jobRepo: new D1ExtractionJobRepository(env.DB)
});

const nowIso = (): string => new Date().toISOString();

const storageRootKey = (materialId: string, jobId: string): string => `materials/${materialId}/${jobId}`;
const storageKey = (rootKey: string, fileName: string): string => `${rootKey}/${sanitizeFileName(fileName)}`;
const storageManifestKey = (rootKey: string): string => `${rootKey}/manifest.json`;

export const getExtractionJob = async (
  c: Context<{ Bindings: EnvBindings }>,
  dependenciesFactory: ExtractionRouteDependenciesFactory = defaultDependenciesFactory
): Promise<Response> => {
  const jobId = c.req.param('jobId');
  const { jobRepo } = dependenciesFactory(c.env);
  const state = await jobRepo.findById(jobId);

  if (!state) {
    throw new NotFoundError('Job', jobId);
  }

  return c.json({ job: state });
};

export const createExtractionJob = async (
  c: Context<{ Bindings: EnvBindings }>,
  dependenciesFactory: ExtractionRouteDependenciesFactory = defaultDependenciesFactory
): Promise<Response> => {
  const request = await parseCreateJobPayload(c);
  const jobId = generateId();
  const queuedAt = nowIso();
  const rootKey = storageRootKey(request.materialId, jobId);
  const mainFile = request.mainFile?.trim();
  const manifestKey = storageManifestKey(rootKey);
  const fileRefs: Array<{ name: string; key: string }> = [];

  for (const file of request.files) {
    const key = storageKey(rootKey, file.name);
    await c.env.STORAGE.put(key, file.bytes);
    fileRefs.push({ name: file.name, key });
  }

  if (mainFile && !fileRefs.some((fileRef) => fileRef.name === mainFile)) {
    throw new ValidationError(`mainFile "${request.mainFile}" was not found in uploaded files.`);
  }

  await c.env.STORAGE.put(
    manifestKey,
    JSON.stringify({
      files: fileRefs,
      mainFile: mainFile ?? inferMainFile(fileRefs.map((fileRef) => fileRef.name))
    })
  );

  const dependencies = dependenciesFactory(c.env);
  await dependencies.materialRepo.create(
    createMaterial({
      id: request.materialId,
      sourceType: request.sourceType,
      title: request.title,
      r2Key: rootKey,
      manifestKey
    })
  );
  await dependencies.jobRepo.createPending(jobId, request.materialId);

  await c.env.EXTRACTION_QUEUE.send({
    jobId,
    materialId: request.materialId,
    sourceType: request.sourceType
  } satisfies ExtractionQueueMessage);

  return c.json({ jobId, materialId: request.materialId, status: 'queued', queuedAt }, 202);
};

export const buildExtractionRoutes = (
  dependenciesFactory: ExtractionRouteDependenciesFactory = defaultDependenciesFactory
): Hono<{ Bindings: EnvBindings }> => {
  const routes = new Hono<{ Bindings: EnvBindings }>();

  routes.post('/jobs', (c) => createExtractionJob(c, dependenciesFactory));

  return routes;
};

export const extractionRoutes = buildExtractionRoutes();

function sanitizeFileName(fileName: string): string {
  return fileName.trim().replace(/[^A-Za-z0-9._/-]/g, '_');
}

function inferMainFile(fileNames: string[]): string {
  for (const fileName of fileNames) {
    if (fileName.toLowerCase().endsWith('/main.tex') || fileName.toLowerCase() === 'main.tex') {
      return fileName;
    }
  }
  return fileNames[0] ?? 'main.tex';
}

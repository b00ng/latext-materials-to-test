import { z } from 'zod';
import type { EnvBindings } from '../env';
import type { ExtractionQueueMessage } from './contracts';
import { ExtractQuestionsUseCase } from '../application/use-cases/extract-questions-use-case';
import { D1MaterialRepository } from '../infrastructure/persistence/d1-material-repository';
import { D1QuestionRepository } from '../infrastructure/persistence/d1-question-repository';
import {
  D1ExtractionJobRepository,
  type ExtractionJobRepository
} from '../infrastructure/persistence/d1-extraction-job-repository';
import { R2FileStorage } from '../infrastructure/storage/r2-file-storage';
import { HttpNormalizationPort } from '../infrastructure/normalization/http-normalization-port';

const MAX_QUEUE_ATTEMPTS = 3;

const queueMessageSchema = z.object({
  jobId: z.string().min(1),
  materialId: z.string().min(1),
  sourceType: z.enum(['latex', 'pdf', 'docx', 'image']).optional()
});

type QueueDependencies = {
  jobRepo: ExtractionJobRepository;
  runExtraction: (materialId: string) => Promise<number>;
};

type QueueDependenciesFactory = (env: EnvBindings) => QueueDependencies;

export const defaultQueueDependenciesFactory: QueueDependenciesFactory = (env) => {
  const materialRepo = new D1MaterialRepository(env.DB);
  const questionRepo = new D1QuestionRepository(env.DB);
  const storage = new R2FileStorage(env.STORAGE);
  const normalizer = new HttpNormalizationPort(env.NORMALIZER_URL, env.NORMALIZER_TOKEN, 20_000);
  const useCase = new ExtractQuestionsUseCase(materialRepo, questionRepo, storage, normalizer);

  return {
    jobRepo: new D1ExtractionJobRepository(env.DB),
    runExtraction: async (materialId: string) => {
      const questions = await useCase.execute({ materialId });
      return questions.length;
    }
  };
};

export const handleExtractionMessage = async (
  message: Message<unknown>,
  env: EnvBindings,
  dependenciesFactory: QueueDependenciesFactory = defaultQueueDependenciesFactory
): Promise<void> => {
  let payload: ExtractionQueueMessage | null = null;
  let dependencies: QueueDependencies | null = null;

  try {
    payload = queueMessageSchema.parse(message.body) as ExtractionQueueMessage;
    dependencies = dependenciesFactory(env);

    const existing = await dependencies.jobRepo.findById(payload.jobId);
    if (existing?.status === 'completed') {
      message.ack();
      return;
    }

    await dependencies.jobRepo.createPending(payload.jobId, payload.materialId);
    await dependencies.jobRepo.markProcessing(payload.jobId, 10);
    await dependencies.jobRepo.updateProgress(payload.jobId, 35);

    const questionCount = await dependencies.runExtraction(payload.materialId);

    await dependencies.jobRepo.updateProgress(payload.jobId, 90);
    await dependencies.jobRepo.markCompleted(payload.jobId, { questionCount });
    message.ack();
  } catch (error) {
    if (!payload || !dependencies) {
      console.error('Invalid extraction queue message:', error);
      message.ack();
      return;
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown extraction error';
    const attempts = queueAttempt(message);
    const retriable = isRetriableError(error);

    if (retriable && attempts < MAX_QUEUE_ATTEMPTS) {
      await dependencies.jobRepo.markRetryPending(payload.jobId, errorMessage);
      message.retry();
      return;
    }

    await dependencies.jobRepo.markFailed(payload.jobId, errorMessage);
    console.error(`Extraction failed for ${payload.jobId}:`, error);
    message.ack();
  }
};

function queueAttempt(message: Message<unknown>): number {
  const attempt = (message as Message<unknown> & { attempts?: number }).attempts;
  if (typeof attempt === 'number' && Number.isFinite(attempt) && attempt > 0) {
    return attempt;
  }
  return 1;
}

function isRetriableError(error: unknown): boolean {
  if (error instanceof z.ZodError) {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/not found/i.test(message)) {
    return false;
  }
  if (/aborted|timeout|timed out/i.test(message)) {
    return true;
  }

  const statusMatch = message.match(/Normalizer request failed with (\d{3})/i);
  if (statusMatch) {
    const statusCode = Number.parseInt(statusMatch[1], 10);
    return statusCode >= 500 || statusCode === 429;
  }

  return true;
}

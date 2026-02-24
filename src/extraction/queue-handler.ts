import { z } from 'zod';
import type { EnvBindings } from '../env';
import type { ExtractionJobState, ExtractionQueueMessage } from './contracts';
import { encodeArrayBufferToBase64 } from './base64-utils';
import { writeExtractionJob } from './job-store';
import { HttpNormalizationClient } from './normalization-client';

const queueMessageSchema = z.object({
  jobId: z.string().min(1),
  materialId: z.string().min(1),
  sourceType: z.enum(['pdf', 'docx', 'image']),
  files: z.array(
    z.object({
      name: z.string().min(1),
      key: z.string().min(1)
    })
  )
});

const nowIso = (): string => new Date().toISOString();

const toProcessingState = (message: ExtractionQueueMessage): ExtractionJobState => ({
  jobId: message.jobId,
  materialId: message.materialId,
  sourceType: message.sourceType,
  status: 'processing',
  updatedAt: nowIso()
});

export const handleExtractionMessage = async (
  message: Message<unknown>,
  env: EnvBindings
): Promise<void> => {
  const payload = queueMessageSchema.parse(message.body) as ExtractionQueueMessage;

  await writeExtractionJob(env.CACHE, toProcessingState(payload));

  try {
    const files = [] as Array<{ name: string; contentBase64: string }>;

    for (const fileRef of payload.files) {
      const object = await env.STORAGE.get(fileRef.key);
      if (!object) {
        throw new Error(`File not found in storage: ${fileRef.key}`);
      }

      const bytes = await object.arrayBuffer();
      files.push({
        name: fileRef.name,
        contentBase64: encodeArrayBufferToBase64(bytes)
      });
    }

    const normalizer = new HttpNormalizationClient(env.NORMALIZER_URL, env.NORMALIZER_TOKEN, 20_000);
    const normalized = await normalizer.normalize({
      materialId: payload.materialId,
      sourceType: payload.sourceType,
      files
    });

    await writeExtractionJob(env.CACHE, {
      jobId: payload.jobId,
      materialId: payload.materialId,
      sourceType: payload.sourceType,
      status: 'completed',
      updatedAt: nowIso(),
      normalized: {
        mainFile: normalized.mainFile,
        fileCount: Object.keys(normalized.fileMap).length,
        preview: normalized.fileMap[normalized.mainFile]?.slice(0, 160) ?? ''
      }
    });

    await Promise.all(payload.files.map(async (fileRef) => env.STORAGE.delete(fileRef.key)));
    message.ack();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown extraction error';

    await writeExtractionJob(env.CACHE, {
      jobId: payload.jobId,
      materialId: payload.materialId,
      sourceType: payload.sourceType,
      status: 'failed',
      updatedAt: nowIso(),
      errorMessage
    });

    console.error(`Extraction failed for ${payload.jobId}:`, error);
    message.ack();
  }
};

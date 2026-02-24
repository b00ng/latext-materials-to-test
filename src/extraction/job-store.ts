import type { ExtractionJobState } from './contracts';
import { EXTRACTION_JOB_TTL_SECONDS } from './contracts';

const jobKey = (jobId: string): string => `extraction-job:${jobId}`;

export const readExtractionJob = async (
  cache: KVNamespace,
  jobId: string
): Promise<ExtractionJobState | null> => {
  const raw = await cache.get(jobKey(jobId));
  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as ExtractionJobState;
};

export const writeExtractionJob = async (cache: KVNamespace, state: ExtractionJobState): Promise<void> => {
  await cache.put(jobKey(state.jobId), JSON.stringify(state), {
    expirationTtl: EXTRACTION_JOB_TTL_SECONDS
  });
};

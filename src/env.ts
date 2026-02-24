export type EnvBindings = {
  DB: D1Database;
  STORAGE: R2Bucket;
  EXTRACTION_QUEUE: Queue;
  CACHE: KVNamespace;
  ENVIRONMENT: string;
  NORMALIZER_URL: string;
  NORMALIZER_TOKEN: string;
};

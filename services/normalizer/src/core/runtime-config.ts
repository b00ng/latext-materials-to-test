import { ApiError } from '../http/api-error';

export type ProviderName = 'openrouter' | 'gemini' | 'kimi' | 'deepseek';

export type NormalizerBindings = {
  NORMALIZER_TOKEN?: string;
  OCR_PROVIDER?: string;
  OCR_MODEL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_BASE_URL?: string;
  MAX_FILES_PER_REQUEST?: string;
  MAX_AGGREGATE_PAYLOAD_BYTES?: string;
  REQUEST_TIMEOUT_MS?: string;
};

export interface RuntimeConfig {
  provider: ProviderName;
  model: string;
  openRouterApiKey?: string;
  openRouterBaseUrl: string;
  maxFilesPerRequest: number;
  maxAggregatePayloadBytes: number;
  requestTimeoutMs: number;
}

const SUPPORTED_PROVIDERS: ProviderName[] = ['openrouter', 'gemini', 'kimi', 'deepseek'];

const parsePositiveInt = (value: string | undefined, fallback: number, field: string): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError(500, 'config_error', `${field} must be a positive integer.`);
  }

  return parsed;
};

export const readRuntimeConfig = (env: NormalizerBindings): RuntimeConfig => {
  const provider = (env.OCR_PROVIDER ?? 'openrouter').toLowerCase() as ProviderName;
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new ApiError(
      500,
      'config_error',
      `Unsupported OCR_PROVIDER '${env.OCR_PROVIDER}'. Supported values: ${SUPPORTED_PROVIDERS.join(', ')}.`
    );
  }

  const model = env.OCR_MODEL?.trim();
  if (!model) {
    throw new ApiError(500, 'config_error', 'OCR_MODEL is required.');
  }

  const config: RuntimeConfig = {
    provider,
    model,
    openRouterApiKey: env.OPENROUTER_API_KEY,
    openRouterBaseUrl: env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    maxFilesPerRequest: parsePositiveInt(env.MAX_FILES_PER_REQUEST, 5, 'MAX_FILES_PER_REQUEST'),
    maxAggregatePayloadBytes: parsePositiveInt(
      env.MAX_AGGREGATE_PAYLOAD_BYTES,
      5 * 1024 * 1024,
      'MAX_AGGREGATE_PAYLOAD_BYTES'
    ),
    requestTimeoutMs: parsePositiveInt(env.REQUEST_TIMEOUT_MS, 20_000, 'REQUEST_TIMEOUT_MS')
  };

  if (provider === 'openrouter' && !config.openRouterApiKey) {
    throw new ApiError(500, 'config_error', 'OPENROUTER_API_KEY is required when OCR_PROVIDER=openrouter.');
  }

  return config;
};

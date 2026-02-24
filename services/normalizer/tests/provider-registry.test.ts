import { describe, expect, it } from 'vitest';
import { createOcrProvider } from '../src/core/provider-registry';
import { readRuntimeConfig } from '../src/core/runtime-config';

describe('provider-registry', () => {
  it('creates openrouter provider from config', () => {
    const config = readRuntimeConfig({
      NORMALIZER_TOKEN: 'token',
      OCR_PROVIDER: 'openrouter',
      OCR_MODEL: 'z-ai/glm-4.6v',
      OPENROUTER_API_KEY: 'secret'
    });

    const provider = createOcrProvider(config);
    expect(provider.name).toBe('openrouter');
  });

  it('rejects unsupported provider', () => {
    expect(() =>
      readRuntimeConfig({
        NORMALIZER_TOKEN: 'token',
        OCR_PROVIDER: 'unsupported-provider',
        OCR_MODEL: 'model',
        OPENROUTER_API_KEY: 'secret'
      })
    ).toThrowError();
  });
});

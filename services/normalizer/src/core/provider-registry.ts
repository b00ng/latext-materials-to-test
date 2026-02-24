import type { OcrProvider } from './ocr-provider';
import type { RuntimeConfig } from './runtime-config';
import { OpenRouterProvider } from '../providers/openrouter-provider';
import { GoogleGeminiProvider } from '../providers/google-gemini-provider';
import { KimiProvider } from '../providers/kimi-provider';
import { DeepSeekProvider } from '../providers/deepseek-provider';

export const createOcrProvider = (config: RuntimeConfig): OcrProvider => {
  switch (config.provider) {
    case 'openrouter':
      return new OpenRouterProvider({
        apiKey: config.openRouterApiKey ?? '',
        baseUrl: config.openRouterBaseUrl,
        model: config.model,
        timeoutMs: config.requestTimeoutMs
      });
    case 'gemini':
      return new GoogleGeminiProvider();
    case 'kimi':
      return new KimiProvider();
    case 'deepseek':
      return new DeepSeekProvider();
  }
};

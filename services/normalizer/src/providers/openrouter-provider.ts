import type { OcrExtractionInput, OcrExtractionResult, OcrProvider } from '../core/ocr-provider';
import { OcrProviderError } from '../core/ocr-provider';

interface OpenRouterProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const parseAssistantText = (payload: ChatCompletionResponse): string => {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => part.text ?? '')
      .join('\n')
      .trim();
  }

  return '';
};

const toPrompt = (input: OcrExtractionInput): string => {
  return [
    'Extract plain text from the provided file payload.',
    'Output only extracted text without markdown fences or commentary.',
    `materialId: ${input.materialId}`,
    `sourceType: ${input.sourceType}`,
    `fileName: ${input.fileName}`,
    'base64Content:',
    input.contentBase64
  ].join('\n');
};

export class OpenRouterProvider implements OcrProvider {
  readonly name = 'openrouter';
  private readonly config: OpenRouterProviderConfig;

  constructor(config: OpenRouterProviderConfig) {
    this.config = config;
  }

  async extractText(input: OcrExtractionInput): Promise<OcrExtractionResult> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await this.callModel(input);
        return {
          provider: this.name,
          model: this.config.model,
          text: response
        };
      } catch (error) {
        const retryable =
          error instanceof OcrProviderError
            ? error.status >= 500 || error.status === 429
            : true;

        if (!retryable || attempt === maxAttempts) {
          throw error;
        }

        await sleep(250 * attempt);
      }
    }

    throw new OcrProviderError('provider_error', 502, 'OpenRouter call failed.');
  }

  private async callModel(input: OcrExtractionInput): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'normalizer-service'
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content: 'You are an OCR and document text extraction engine.'
            },
            {
              role: 'user',
              content: toPrompt(input)
            }
          ]
        }),
        signal: controller.signal
      });

      const payload = (await response.json()) as ChatCompletionResponse;
      if (!response.ok) {
        throw new OcrProviderError(
          'provider_http_error',
          response.status,
          payload.error?.message ?? `OpenRouter returned status ${response.status}.`,
          payload
        );
      }

      const text = parseAssistantText(payload);
      if (!text) {
        throw new OcrProviderError('provider_empty_result', 502, 'OpenRouter returned empty text.', payload);
      }

      return text;
    } catch (error) {
      if (error instanceof OcrProviderError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new OcrProviderError('provider_timeout', 504, 'OpenRouter request timed out.');
      }

      throw new OcrProviderError('provider_network_error', 502, 'OpenRouter request failed.', error);
    } finally {
      clearTimeout(timeout);
    }
  }
}

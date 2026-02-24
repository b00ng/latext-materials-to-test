import type { OcrExtractionInput, OcrExtractionResult, OcrProvider } from '../core/ocr-provider';
import { OcrProviderError } from '../core/ocr-provider';

export class GoogleGeminiProvider implements OcrProvider {
  readonly name = 'gemini';

  async extractText(_input: OcrExtractionInput): Promise<OcrExtractionResult> {
    throw new OcrProviderError('provider_not_implemented', 501, 'Gemini provider is not implemented yet.');
  }
}

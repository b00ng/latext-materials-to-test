import type { OcrExtractionInput, OcrExtractionResult, OcrProvider } from '../core/ocr-provider';
import { OcrProviderError } from '../core/ocr-provider';

export class DeepSeekProvider implements OcrProvider {
  readonly name = 'deepseek';

  async extractText(_input: OcrExtractionInput): Promise<OcrExtractionResult> {
    throw new OcrProviderError('provider_not_implemented', 501, 'DeepSeek provider is not implemented yet.');
  }
}

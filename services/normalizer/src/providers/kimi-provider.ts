import type { OcrExtractionInput, OcrExtractionResult, OcrProvider } from '../core/ocr-provider';
import { OcrProviderError } from '../core/ocr-provider';

export class KimiProvider implements OcrProvider {
  readonly name = 'kimi';

  async extractText(_input: OcrExtractionInput): Promise<OcrExtractionResult> {
    throw new OcrProviderError('provider_not_implemented', 501, 'Kimi provider is not implemented yet.');
  }
}

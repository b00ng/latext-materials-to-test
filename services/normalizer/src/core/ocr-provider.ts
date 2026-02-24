export type SourceType = 'pdf' | 'docx' | 'image';

export interface OcrExtractionInput {
  materialId: string;
  sourceType: SourceType;
  fileName: string;
  contentBase64: string;
  requestId: string;
}

export interface OcrExtractionResult {
  provider: string;
  model: string;
  text: string;
}

export interface OcrProvider {
  readonly name: string;
  extractText(input: OcrExtractionInput): Promise<OcrExtractionResult>;
}

export class OcrProviderError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'OcrProviderError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

import type { SourceType } from './ocr-provider';

export interface NormalizedTextBlock {
  sourceType: SourceType;
  sourceFile: string;
  text: string;
  provider: string;
  model: string;
}

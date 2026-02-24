import type { OcrProvider } from '../core/ocr-provider';
import type { NormalizedTextBlock } from '../core/normalized-block';

interface ImageInputFile {
  name: string;
  contentBase64: string;
}

export const normalizeImageFiles = async (params: {
  provider: OcrProvider;
  materialId: string;
  requestId: string;
  files: ImageInputFile[];
}): Promise<NormalizedTextBlock[]> => {
  const blocks: NormalizedTextBlock[] = [];

  for (const file of params.files) {
    const result = await params.provider.extractText({
      materialId: params.materialId,
      sourceType: 'image',
      fileName: file.name,
      contentBase64: file.contentBase64,
      requestId: params.requestId
    });

    blocks.push({
      sourceType: 'image',
      sourceFile: file.name,
      text: result.text,
      provider: result.provider,
      model: result.model
    });
  }

  return blocks;
};

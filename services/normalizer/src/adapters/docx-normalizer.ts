import type { OcrProvider } from '../core/ocr-provider';
import type { NormalizedTextBlock } from '../core/normalized-block';

interface DocxInputFile {
  name: string;
  contentBase64: string;
}

export const normalizeDocxFiles = async (params: {
  provider: OcrProvider;
  materialId: string;
  requestId: string;
  files: DocxInputFile[];
}): Promise<NormalizedTextBlock[]> => {
  const blocks: NormalizedTextBlock[] = [];

  for (const file of params.files) {
    const result = await params.provider.extractText({
      materialId: params.materialId,
      sourceType: 'docx',
      fileName: file.name,
      contentBase64: file.contentBase64,
      requestId: params.requestId
    });

    blocks.push({
      sourceType: 'docx',
      sourceFile: file.name,
      text: result.text,
      provider: result.provider,
      model: result.model
    });
  }

  return blocks;
};

import { normalizePdfFiles } from '../adapters/pdf-normalizer';
import { normalizeDocxFiles } from '../adapters/docx-normalizer';
import { normalizeImageFiles } from '../adapters/image-normalizer';
import { ApiError } from '../http/api-error';
import type { OcrProvider, SourceType } from './ocr-provider';
import type { NormalizedTextBlock } from './normalized-block';
import type { RuntimeConfig } from './runtime-config';

export interface NormalizerInput {
  materialId: string;
  sourceType: SourceType;
  files: Array<{
    name: string;
    contentBase64: string;
  }>;
  requestId: string;
}

export interface NormalizationOutput {
  mainFile: 'main.tex';
  fileMap: Record<string, string>;
}

const estimateBase64Bytes = (value: string): number => {
  const cleaned = value.replace(/\s+/g, '');
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding);
};

const canonicalizeText = (value: string): string => {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
};

const assembleMainTex = (blocks: NormalizedTextBlock[]): string => {
  const segments = blocks.map((block) => {
    const header = `% sourceType: ${block.sourceType} | file: ${block.sourceFile}`;
    return `${header}\n${canonicalizeText(block.text)}`;
  });

  return canonicalizeText(segments.join('\n\n'));
};

const sortFiles = <T extends { name: string }>(files: T[]): T[] => {
  return [...files].sort((left, right) => left.name.localeCompare(right.name));
};

const enforceRequestLimits = (files: Array<{ contentBase64: string }>, config: RuntimeConfig): void => {
  if (files.length > config.maxFilesPerRequest) {
    throw new ApiError(
      413,
      'too_many_files',
      `files length exceeds MAX_FILES_PER_REQUEST (${config.maxFilesPerRequest}).`
    );
  }

  const aggregateBytes = files.reduce((sum, file) => sum + estimateBase64Bytes(file.contentBase64), 0);
  if (aggregateBytes > config.maxAggregatePayloadBytes) {
    throw new ApiError(
      413,
      'payload_too_large',
      `Request payload exceeds MAX_AGGREGATE_PAYLOAD_BYTES (${config.maxAggregatePayloadBytes}).`
    );
  }
};

const normalizeBySourceType = async (params: {
  provider: OcrProvider;
  input: NormalizerInput;
}): Promise<NormalizedTextBlock[]> => {
  const files = sortFiles(params.input.files);

  if (params.input.sourceType === 'pdf') {
    return normalizePdfFiles({
      provider: params.provider,
      materialId: params.input.materialId,
      requestId: params.input.requestId,
      files
    });
  }

  if (params.input.sourceType === 'docx') {
    return normalizeDocxFiles({
      provider: params.provider,
      materialId: params.input.materialId,
      requestId: params.input.requestId,
      files
    });
  }

  return normalizeImageFiles({
    provider: params.provider,
    materialId: params.input.materialId,
    requestId: params.input.requestId,
    files
  });
};

export const normalizeMaterial = async (params: {
  provider: OcrProvider;
  config: RuntimeConfig;
  input: NormalizerInput;
}): Promise<NormalizationOutput> => {
  enforceRequestLimits(params.input.files, params.config);

  const blocks = await normalizeBySourceType({
    provider: params.provider,
    input: params.input
  });

  const assembled = assembleMainTex(blocks);
  if (!assembled) {
    throw new ApiError(422, 'normalization_empty', 'Normalized output is empty.');
  }

  return {
    mainFile: 'main.tex',
    fileMap: {
      'main.tex': assembled
    }
  };
};

import type { Context } from 'hono';
import { z } from 'zod';
import { generateId } from '../shared/types';
import type { EnvBindings } from '../env';
import {
  extractionRequestSchema,
  materialIdSchema,
  sourceTypeSchema,
  MAX_EXTRACTION_FILES,
  MAX_EXTRACTION_INPUT_BYTES,
  type SourceType
} from './contracts';
import { decodeBase64ToArrayBuffer } from './base64-utils';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tif', '.tiff']);
const fileNameSchema = z.string().trim().min(1).max(260);
type RouteStatusCode = 400 | 413 | 415;

export class RouteError extends Error {
  readonly statusCode: RouteStatusCode;
  readonly code: string;

  constructor(statusCode: RouteStatusCode, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'RouteError';
  }
}
export type BufferedUploadFile = {
  name: string;
  bytes: ArrayBuffer;
};

export type CreateJobRequest = {
  materialId: string;
  sourceType: SourceType;
  mainFile?: string;
  title?: string;
  files: BufferedUploadFile[];
};
const ensurePayloadSize = (files: BufferedUploadFile[]): void => {
  const bytes = files.reduce((total, file) => total + file.bytes.byteLength, 0);
  if (bytes > MAX_EXTRACTION_INPUT_BYTES) {
    throw new RouteError(413, 'PAYLOAD_TOO_LARGE', `Payload exceeds ${MAX_EXTRACTION_INPUT_BYTES} bytes.`);
  }
};

const detectFileSourceType = (fileName: string): SourceType | 'latex' | 'unknown' => {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.pdf')) {
    return 'pdf';
  }
  if (lowerName.endsWith('.docx')) {
    return 'docx';
  }
  if (lowerName.endsWith('.tex')) {
    return 'latex';
  }

  for (const extension of IMAGE_EXTENSIONS) {
    if (lowerName.endsWith(extension)) {
      return 'image';
    }
  }

  return 'unknown';
};

const detectSourceTypeFromNames = (names: string[]): SourceType | null => {
  if (names.length === 0) {
    return null;
  }

  const detected = names.map((name) => detectFileSourceType(name));
  if (detected.some((value) => value === 'unknown')) {
    return null;
  }

  const unique = new Set(detected);
  if (unique.size !== 1) {
    return null;
  }

  return detected[0] as SourceType;
};

const collectMultipartFiles = (formData: FormData): File[] => {
  const files: File[] = [];
  for (const key of ['files[]', 'files']) {
    const values = formData.getAll(key);
    for (const value of values) {
      if (typeof value !== 'string') {
        files.push(value);
      }
    }
  }

  if (files.length > 0) {
    return files;
  }

  for (const [, value] of formData.entries()) {
    if (typeof value !== 'string') {
      files.push(value);
    }
  }

  return files;
};

const parseJsonCreateJobPayload = async (c: Context<{ Bindings: EnvBindings }>): Promise<CreateJobRequest> => {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    throw new RouteError(400, 'INVALID_JSON', 'Body must be valid JSON.');
  }

  const request = extractionRequestSchema.parse(payload);
  const files = request.files.map((file) => ({
    name: fileNameSchema.parse(file.name),
    bytes: decodeBase64ToArrayBuffer(file.contentBase64)
  }));
  ensurePayloadSize(files);

  return {
    materialId: request.materialId,
    sourceType: request.sourceType,
    mainFile: request.mainFile,
    title: request.title,
    files
  };
};

const parseMultipartCreateJobPayload = async (
  c: Context<{ Bindings: EnvBindings }>
): Promise<CreateJobRequest> => {
  const formData = await c.req.formData();
  const uploadFiles = collectMultipartFiles(formData);
  if (uploadFiles.length === 0) {
    throw new RouteError(400, 'VALIDATION_ERROR', 'At least one file is required in files[] or files.');
  }
  if (uploadFiles.length > MAX_EXTRACTION_FILES) {
    throw new RouteError(400, 'VALIDATION_ERROR', `Maximum ${MAX_EXTRACTION_FILES} files are allowed.`);
  }

  const rawSourceType = formData.get('sourceType');
  const sourceType =
    typeof rawSourceType === 'string' && rawSourceType.trim().length > 0
      ? sourceTypeSchema.parse(rawSourceType)
      : undefined;
  const detectedType = detectSourceTypeFromNames(uploadFiles.map((file) => file.name));
  if (!sourceType && !detectedType) {
    throw new RouteError(
      400,
      'VALIDATION_ERROR',
      'sourceType is required when file extensions are mixed or unsupported.'
    );
  }
  if (sourceType && detectedType && sourceType !== detectedType) {
    throw new RouteError(400, 'VALIDATION_ERROR', 'sourceType does not match uploaded files.');
  }

  const rawMaterialId = formData.get('materialId');
  const materialId =
    typeof rawMaterialId === 'string' && rawMaterialId.trim().length > 0
      ? materialIdSchema.parse(rawMaterialId)
      : generateId();
  const rawMainFile = formData.get('mainFile');
  const mainFile =
    typeof rawMainFile === 'string' && rawMainFile.trim().length > 0
      ? fileNameSchema.parse(rawMainFile)
      : undefined;
  const rawTitle = formData.get('title');
  const title =
    typeof rawTitle === 'string' && rawTitle.trim().length > 0
      ? rawTitle.trim().slice(0, 200)
      : undefined;

  const files: BufferedUploadFile[] = [];
  for (const file of uploadFiles) {
    files.push({
      name: fileNameSchema.parse(file.name),
      bytes: await file.arrayBuffer()
    });
  }

  ensurePayloadSize(files);

  return {
    materialId,
    sourceType: sourceType ?? (detectedType as SourceType),
    mainFile,
    title,
    files
  };
};

export const parseCreateJobPayload = async (
  c: Context<{ Bindings: EnvBindings }>
): Promise<CreateJobRequest> => {
  const contentType = (c.req.header('content-type') ?? '').toLowerCase();
  if (contentType.includes('multipart/form-data')) {
    return parseMultipartCreateJobPayload(c);
  }

  if (contentType.includes('application/json') || contentType.length === 0) {
    return parseJsonCreateJobPayload(c);
  }

  throw new RouteError(
    415,
    'UNSUPPORTED_MEDIA_TYPE',
    'Only application/json and multipart/form-data are supported.'
  );
};

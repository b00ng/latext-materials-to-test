export interface NormalizeCommand {
  materialId: string;
  sourceType: 'pdf' | 'docx' | 'image';
  fileMap: Map<string, ArrayBuffer>;
}

export interface NormalizationResult {
  mainFile: string;
  fileMap: Map<string, string>;
}

export interface NormalizationPort {
  normalize(command: NormalizeCommand): Promise<NormalizationResult>;
}

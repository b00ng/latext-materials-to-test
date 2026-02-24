export interface FileStoragePort {
  upload(key: string, content: string | ArrayBuffer): Promise<void>;
  download(key: string): Promise<string | null>;
  downloadBytes(key: string): Promise<ArrayBuffer | null>;
  downloadAsFileMap(rootKey: string, manifestKey?: string | null): Promise<Map<string, ArrayBuffer>>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

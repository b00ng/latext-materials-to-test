import type { FileStoragePort } from '../../application/ports/output/file-storage-port';

type ManifestEntry = {
  name: string;
  key: string;
};

type ManifestPayload = {
  files: ManifestEntry[];
};

export class R2FileStorage implements FileStoragePort {
  constructor(private readonly bucket: R2Bucket) {}

  async upload(key: string, content: string | ArrayBuffer): Promise<void> {
    await this.bucket.put(key, content);
  }

  async download(key: string): Promise<string | null> {
    const object = await this.bucket.get(key);
    if (!object) {
      return null;
    }
    return object.text();
  }

  async downloadBytes(key: string): Promise<ArrayBuffer | null> {
    const object = await this.bucket.get(key);
    if (!object) {
      return null;
    }
    return object.arrayBuffer();
  }

  async downloadAsFileMap(rootKey: string, manifestKey?: string | null): Promise<Map<string, ArrayBuffer>> {
    if (manifestKey) {
      const fromManifest = await this.downloadViaManifest(manifestKey);
      if (fromManifest.size > 0) {
        return fromManifest;
      }
    }

    const direct = await this.downloadBytes(rootKey);
    if (direct) {
      return new Map([[fileNameFromKey(rootKey), direct]]);
    }

    const list = await this.bucket.list({ prefix: ensurePrefix(rootKey) });
    const fileMap = new Map<string, ArrayBuffer>();
    for (const object of list.objects) {
      const bytes = await this.downloadBytes(object.key);
      if (!bytes) {
        continue;
      }

      const relativeName = object.key.startsWith(ensurePrefix(rootKey))
        ? object.key.slice(ensurePrefix(rootKey).length)
        : fileNameFromKey(object.key);
      fileMap.set(relativeName, bytes);
    }

    return fileMap;
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const object = await this.bucket.get(key);
    return Boolean(object);
  }

  private async downloadViaManifest(manifestKey: string): Promise<Map<string, ArrayBuffer>> {
    const rawManifest = await this.download(manifestKey);
    if (!rawManifest) {
      return new Map();
    }

    let manifest: ManifestPayload | null = null;
    try {
      manifest = JSON.parse(rawManifest) as ManifestPayload;
    } catch {
      return new Map();
    }

    const entries = manifest.files ?? [];
    const fileMap = new Map<string, ArrayBuffer>();
    for (const entry of entries) {
      const bytes = await this.downloadBytes(entry.key);
      if (!bytes) {
        continue;
      }
      fileMap.set(entry.name, bytes);
    }

    return fileMap;
  }
}

function fileNameFromKey(key: string): string {
  const normalized = key.replace(/\\/g, '/');
  const segments = normalized.split('/');
  return segments[segments.length - 1] || normalized;
}

function ensurePrefix(rootKey: string): string {
  return rootKey.endsWith('/') ? rootKey : `${rootKey}/`;
}

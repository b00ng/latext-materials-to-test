import type { NormalizationPort, NormalizeCommand, NormalizationResult } from '../../application/ports/output/normalization-port';
import { encodeArrayBufferToBase64 } from '../../extraction/base64-utils';
import { HttpNormalizationClient } from '../../extraction/normalization-client';

export class HttpNormalizationPort implements NormalizationPort {
  private readonly client: HttpNormalizationClient;

  constructor(baseUrl: string, token: string, timeoutMs?: number) {
    this.client = new HttpNormalizationClient(baseUrl, token, timeoutMs);
  }

  async normalize(command: NormalizeCommand): Promise<NormalizationResult> {
    const files = [...command.fileMap.entries()].map(([name, bytes]) => ({
      name,
      contentBase64: encodeArrayBufferToBase64(bytes)
    }));

    const result = await this.client.normalize({
      materialId: command.materialId,
      sourceType: command.sourceType,
      files
    });

    return {
      mainFile: result.mainFile,
      fileMap: new Map(Object.entries(result.fileMap))
    };
  }
}

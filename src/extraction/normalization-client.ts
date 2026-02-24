import type { SourceType } from './contracts';

interface NormalizeRequest {
  materialId: string;
  sourceType: SourceType;
  files: Array<{
    name: string;
    contentBase64: string;
  }>;
}

interface NormalizeResponse {
  mainFile: string;
  fileMap: Record<string, string>;
}

export class HttpNormalizationClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, token: string, timeoutMs: number = 20_000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  async normalize(request: NormalizeRequest): Promise<NormalizeResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const response = await fetch(`${this.baseUrl}/normalize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request),
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Normalizer request failed with ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as NormalizeResponse;
    if (!payload.mainFile || !payload.fileMap || typeof payload.fileMap !== 'object') {
      throw new Error('Normalizer response is invalid.');
    }

    return payload;
  }
}

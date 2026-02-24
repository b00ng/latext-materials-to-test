import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeMaterial } from '../src/core/normalizer';
import type { OcrExtractionInput, OcrExtractionResult, OcrProvider } from '../src/core/ocr-provider';

class FakeProvider implements OcrProvider {
  readonly name = 'fake';

  async extractText(input: OcrExtractionInput): Promise<OcrExtractionResult> {
    return {
      provider: this.name,
      model: 'fake-model',
      text: `normalized ${input.sourceType} ${input.fileName}`
    };
  }
}

const fixture = (path: string): string => {
  return readFileSync(path, 'utf-8').trim();
};

describe('normalizeMaterial', () => {
  it('returns deterministic main.tex output ordering', async () => {
    const output = await normalizeMaterial({
      provider: new FakeProvider(),
      config: {
        provider: 'openrouter',
        model: 'z-ai/glm-4.6v',
        openRouterBaseUrl: 'https://openrouter.ai/api/v1',
        openRouterApiKey: 'x',
        maxFilesPerRequest: 5,
        maxAggregatePayloadBytes: 5_000_000,
        requestTimeoutMs: 2_000
      },
      input: {
        materialId: 'mat-1',
        sourceType: 'pdf',
        requestId: 'req-1',
        files: [
          {
            name: 'b.pdf',
            contentBase64: fixture('tests/fixtures/pdf/sample.txt')
          },
          {
            name: 'a.pdf',
            contentBase64: fixture('tests/fixtures/pdf/sample.txt')
          }
        ]
      }
    });

    expect(output.mainFile).toBe('main.tex');
    const content = output.fileMap['main.tex'];
    expect(content.includes('a.pdf')).toBe(true);
    expect(content.includes('b.pdf')).toBe(true);
    expect(content.indexOf('a.pdf')).toBeLessThan(content.indexOf('b.pdf'));
  });

  it('supports docx and image fixtures', async () => {
    const provider = new FakeProvider();

    const docxOutput = await normalizeMaterial({
      provider,
      config: {
        provider: 'openrouter',
        model: 'z-ai/glm-4.6v',
        openRouterBaseUrl: 'https://openrouter.ai/api/v1',
        openRouterApiKey: 'x',
        maxFilesPerRequest: 5,
        maxAggregatePayloadBytes: 5_000_000,
        requestTimeoutMs: 2_000
      },
      input: {
        materialId: 'mat-2',
        sourceType: 'docx',
        requestId: 'req-2',
        files: [{ name: 'sample.docx', contentBase64: fixture('tests/fixtures/docx/sample.txt') }]
      }
    });

    const imageOutput = await normalizeMaterial({
      provider,
      config: {
        provider: 'openrouter',
        model: 'z-ai/glm-4.6v',
        openRouterBaseUrl: 'https://openrouter.ai/api/v1',
        openRouterApiKey: 'x',
        maxFilesPerRequest: 5,
        maxAggregatePayloadBytes: 5_000_000,
        requestTimeoutMs: 2_000
      },
      input: {
        materialId: 'mat-3',
        sourceType: 'image',
        requestId: 'req-3',
        files: [{ name: 'sample.png', contentBase64: fixture('tests/fixtures/image/sample.txt') }]
      }
    });

    expect(docxOutput.fileMap['main.tex'].includes('sample.docx')).toBe(true);
    expect(imageOutput.fileMap['main.tex'].includes('sample.png')).toBe(true);
  });

  it('rejects oversized payloads', async () => {
    await expect(
      normalizeMaterial({
        provider: new FakeProvider(),
        config: {
          provider: 'openrouter',
          model: 'z-ai/glm-4.6v',
          openRouterBaseUrl: 'https://openrouter.ai/api/v1',
          openRouterApiKey: 'x',
          maxFilesPerRequest: 1,
          maxAggregatePayloadBytes: 2,
          requestTimeoutMs: 2_000
        },
        input: {
          materialId: 'mat-4',
          sourceType: 'pdf',
          requestId: 'req-4',
          files: [{ name: 'sample.pdf', contentBase64: fixture('tests/fixtures/pdf/sample.txt') }]
        }
      })
    ).rejects.toThrowError();
  });
});

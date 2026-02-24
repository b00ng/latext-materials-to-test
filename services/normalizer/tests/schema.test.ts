import { describe, expect, it } from 'vitest';
import { parseNormalizeRequest } from '../src/schemas/normalize-schema';

describe('parseNormalizeRequest', () => {
  it('parses a valid payload', () => {
    const result = parseNormalizeRequest({
      materialId: 'mat-1',
      sourceType: 'pdf',
      files: [{ name: 'input.pdf', contentBase64: 'UERG' }]
    });

    expect(result.materialId).toBe('mat-1');
    expect(result.sourceType).toBe('pdf');
    expect(result.files).toHaveLength(1);
  });

  it('throws for invalid source type', () => {
    expect(() =>
      parseNormalizeRequest({
        materialId: 'mat-1',
        sourceType: 'txt',
        files: [{ name: 'input.txt', contentBase64: 'VEVYVA==' }]
      })
    ).toThrowError();
  });
});

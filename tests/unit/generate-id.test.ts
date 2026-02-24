import { describe, expect, it } from 'vitest';

import { generateId } from '../../src/shared/types';

describe('generateId', () => {
  it('returns a non-empty string', () => {
    expect(generateId()).toBeTypeOf('string');
    expect(generateId().length).toBeGreaterThan(0);
  });
});

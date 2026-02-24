export type DifficultyLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export function validateDifficulty(value: number): DifficultyLevel {
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error(`Invalid difficulty: ${value}. Must be an integer from 1 to 10.`);
  }

  return value as DifficultyLevel;
}

export type UUID = string;

export function generateId(): UUID {
  return crypto.randomUUID();
}

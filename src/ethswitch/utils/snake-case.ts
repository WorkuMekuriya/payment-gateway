/** Converts camelCase keys to snake_case for the NGB gateway (Newtonsoft SnakeCaseNamingStrategy). */
export function toSnakeCaseKeys(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(toSnakeCaseKeys);
  if (typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[toSnakeCase(key)] = toSnakeCaseKeys(val);
  }
  return out;
}

function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

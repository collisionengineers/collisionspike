/** Returns parsed JSON when a database value is encoded as text. */
export function coerceJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

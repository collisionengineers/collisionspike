/** PostgreSQL uniqueness helpers shared by idempotent write routes. */

export function isUniqueViolation(error: unknown): boolean {
  return (
    error != null
    && typeof error === 'object'
    && 'code' in error
    && (error as { code: unknown }).code === '23505'
  );
}

export function uniqueConstraintName(error: unknown): string | undefined {
  if (error != null && typeof error === 'object' && 'constraint' in error) {
    const constraint = (error as { constraint: unknown }).constraint;
    return typeof constraint === 'string' ? constraint : undefined;
  }
  return undefined;
}

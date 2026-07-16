import { createHash } from 'node:crypto';
import type { TxQuery } from '../../platform/db/client.js';

export const PROVIDER_INTAKE_OPERATION_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? 'undefined' : encoded;
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

export function providerIntakeRequestHash(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export class ProviderIntakeOperationConflict extends Error {}

export interface ProviderIntakeReplay {
  caseId: string;
  casePo: string | null;
  completed: boolean;
}

/** Claims a provider-scoped request identity under row lock. A committed case is
 * returned on replay; the same key with different content is always refused. */
export async function beginProviderIntakeOperation(
  q: TxQuery,
  input: { workProviderId: string; idempotencyKey: string; requestHash: string },
): Promise<ProviderIntakeReplay | undefined> {
  await q(
    `INSERT INTO provider_intake_operation (work_provider_id, idempotency_key, request_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (work_provider_id, idempotency_key) DO NOTHING`,
    [input.workProviderId, input.idempotencyKey, input.requestHash],
  );
  const rows = await q<{
    request_hash: string;
    case_id: string | null;
    case_po: string | null;
    completed_at: Date | string | null;
  }>(
    `SELECT request_hash, case_id, case_po, completed_at
       FROM provider_intake_operation
      WHERE work_provider_id = $1 AND idempotency_key = $2
      FOR UPDATE`,
    [input.workProviderId, input.idempotencyKey],
  );
  const operation = rows[0];
  if (!operation || operation.request_hash !== input.requestHash) {
    throw new ProviderIntakeOperationConflict('The idempotency key is already bound to different content.');
  }
  return operation.case_id
    ? {
        caseId: operation.case_id,
        casePo: operation.case_po,
        completed: operation.completed_at != null,
      }
    : undefined;
}

export async function bindProviderIntakeCase(
  q: TxQuery,
  input: { workProviderId: string; idempotencyKey: string; caseId: string; casePo: string | null },
): Promise<void> {
  const rows = await q<{ idempotency_key: string }>(
    `UPDATE provider_intake_operation
        SET case_id = $3, case_po = $4, updated_at = now()
      WHERE work_provider_id = $1 AND idempotency_key = $2 AND case_id IS NULL
      RETURNING idempotency_key`,
    [input.workProviderId, input.idempotencyKey, input.caseId, input.casePo],
  );
  if (!rows[0]) throw new ProviderIntakeOperationConflict('The provider intake operation changed while locked.');
}

export async function completeProviderIntakeOperation(
  q: TxQuery,
  input: { workProviderId: string; idempotencyKey: string; caseId: string },
): Promise<void> {
  await q(
    `UPDATE provider_intake_operation
        SET completed_at = COALESCE(completed_at, now()), updated_at = now()
      WHERE work_provider_id = $1 AND idempotency_key = $2 AND case_id = $3`,
    [input.workProviderId, input.idempotencyKey, input.caseId],
  );
}

import { describe, expect, it } from 'vitest';
import type { TxQuery } from '../../platform/db/client.js';
import {
  ProviderIntakeOperationConflict,
  beginProviderIntakeOperation,
  bindProviderIntakeCase,
  completeProviderIntakeOperation,
  providerIntakeRequestHash,
} from './intake-operation.js';

interface Row {
  request_hash: string;
  case_id: string | null;
  case_po: string | null;
  completed_at: string | null;
}

function memoryQuery(): TxQuery {
  const rows = new Map<string, Row>();
  return (async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
    const key = `${params[0]}:${params[1]}`;
    if (sql.includes('INSERT INTO provider_intake_operation')) {
      if (!rows.has(key)) {
        rows.set(key, {
          request_hash: String(params[2]), case_id: null, case_po: null, completed_at: null,
        });
      }
      return [];
    }
    if (sql.includes('SELECT request_hash')) return (rows.has(key) ? [rows.get(key)] : []) as T[];
    if (sql.includes('SET case_id')) {
      const row = rows.get(key);
      if (!row || row.case_id) return [];
      row.case_id = String(params[2]);
      row.case_po = params[3] == null ? null : String(params[3]);
      return [{ idempotency_key: params[1] }] as T[];
    }
    if (sql.includes('SET completed_at')) {
      const row = rows.get(key);
      if (row && row.case_id === params[2]) row.completed_at = '2026-07-15T00:00:00Z';
      return [];
    }
    throw new Error(`unexpected SQL: ${sql}`);
  }) as TxQuery;
}

describe('provider intake durable operation', () => {
  it('hashes semantically identical object key ordering the same way', () => {
    expect(providerIntakeRequestHash({ b: 2, a: 1 })).toBe(providerIntakeRequestHash({ a: 1, b: 2 }));
  });

  it('replays the bound case and its completion state', async () => {
    const q = memoryQuery();
    const input = { workProviderId: 'provider-1', idempotencyKey: 'provider-request-0001', requestHash: 'a'.repeat(64) };
    expect(await beginProviderIntakeOperation(q, input)).toBeUndefined();
    await bindProviderIntakeCase(q, { ...input, caseId: 'case-1', casePo: 'PCH26001' });
    expect(await beginProviderIntakeOperation(q, input)).toEqual({
      caseId: 'case-1', casePo: 'PCH26001', completed: false,
    });
    await completeProviderIntakeOperation(q, { ...input, caseId: 'case-1' });
    expect(await beginProviderIntakeOperation(q, input)).toEqual({
      caseId: 'case-1', casePo: 'PCH26001', completed: true,
    });
  });

  it('refuses reuse of the same provider-scoped key with different content', async () => {
    const q = memoryQuery();
    const base = { workProviderId: 'provider-1', idempotencyKey: 'provider-request-0002' };
    await beginProviderIntakeOperation(q, { ...base, requestHash: 'a'.repeat(64) });
    await expect(beginProviderIntakeOperation(q, { ...base, requestHash: 'b'.repeat(64) }))
      .rejects.toBeInstanceOf(ProviderIntakeOperationConflict);
  });
});

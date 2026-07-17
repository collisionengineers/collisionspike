import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { TxQuery } from '../../platform/db/client.js';
import {
  completeProviderRecoveryUsing,
  PROVIDER_ARCHIVE_PENDING_HOLD_REASON,
  PROVIDER_UNRESOLVED_HOLD_REASON,
  stampCaseArchiveFolderUsing,
} from './recovery.js';

type Call = { sql: string; params: unknown[] };

function recoveryRunner(overrides: Record<string, unknown> = {}): {
  q: TxQuery;
  calls: Call[];
} {
  const calls: Call[] = [];
  const row = {
    case_po: null,
    on_hold: true,
    on_hold_reason: PROVIDER_UNRESOLVED_HOLD_REASON,
    work_provider_id: 'wp-pch',
    case_type_code: null,
    principal_code: 'PCH',
    provider_automation_mode_code: 100000002,
    box_folder_id: null,
    ...overrides,
  };
  const q = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('FOR UPDATE OF c')) return [row];
    if (sql.includes("to_regclass('public.case_po_floor')")) return [{ ok: null }];
    if (sql.includes('MAX(SUBSTRING')) return [{ max_seq: 7 }];
    if (sql.includes('RETURNING case_po')) {
      return [{
        case_po: String(row.case_po ?? '').trim() ? row.case_po : params[1],
      }];
    }
    if (sql.includes('RETURNING status_recompute_requested_generation')) {
      return [{ status_recompute_requested_generation: 4 }];
    }
    return [];
  }) as unknown as TxQuery;
  return { q, calls };
}

describe('completeProviderRecoveryUsing', () => {
  it('mints, clears only the provider hold, requests status and audits on one transaction runner', async () => {
    const { q, calls } = recoveryRunner();

    const result = await completeProviderRecoveryUsing(q, {
      caseId: 'case-1',
      resolvedProviderId: 'wp-pch',
      caseType: 'standard',
      allowCasePoMint: true,
    });

    expect(result).toMatchObject({
      outcome: 'identity_ready',
      holdCleared: false,
      casePo: 'PCH26008',
      casePoSource: 'minted',
      providerAutomationMode: 'full_auto',
    });
    expect(calls.some((c) => c.sql.includes('pg_advisory_xact_lock'))).toBe(true);
    expect(calls.some((c) => c.sql.includes('on_hold_reason = $5'))).toBe(true);
    expect(calls.some((c) => c.params.includes(PROVIDER_ARCHIVE_PENDING_HOLD_REASON))).toBe(true);
    expect(calls.some((c) => c.sql.includes('status_recompute_requested_generation ='))).toBe(false);
    expect(calls.some((c) => c.sql.includes('INSERT INTO audit_event'))).toBe(true);
  });

  it('adopts an existing Case/PO without allocating a second number', async () => {
    const { q, calls } = recoveryRunner({ case_po: 'PCH26123' });

    const result = await completeProviderRecoveryUsing(q, {
      caseId: 'case-1',
      resolvedProviderId: 'wp-pch',
      allowCasePoMint: true,
    });

    expect(result).toMatchObject({
      outcome: 'identity_ready',
      casePo: 'PCH26123',
      casePoSource: 'adopted',
    });
    expect(calls.some((c) => c.sql.includes('pg_advisory_xact_lock'))).toBe(false);
  });

  it('treats a legacy blank-string Case/PO as absent and persists the minted identity', async () => {
    const { q, calls } = recoveryRunner({ case_po: '   ' });

    const result = await completeProviderRecoveryUsing(q, {
      caseId: 'case-1',
      resolvedProviderId: 'wp-pch',
      allowCasePoMint: true,
    });

    expect(result).toMatchObject({ outcome: 'identity_ready', casePo: 'PCH26008' });
    const identityUpdate = calls.find((c) => c.sql.includes('RETURNING case_po'));
    expect(identityUpdate?.sql).toContain("COALESCE(NULLIF(btrim(case_po), ''), $2)");
  });

  it('locks the provider row and keeps the persisted case type authoritative for minting', async () => {
    const { q, calls } = recoveryRunner({ case_type_code: 100000001 });

    const result = await completeProviderRecoveryUsing(q, {
      caseId: 'case-1',
      resolvedProviderId: 'wp-pch',
      caseType: 'standard',
      allowCasePoMint: true,
    });

    expect(result).toMatchObject({
      outcome: 'identity_ready',
      casePo: 'A.PCH26008',
      casePoMarker: 'A.',
    });
    expect(calls[0]?.sql).toContain('FOR UPDATE OF c, wp');
  });

  it('never clears or mints for a staff-owned hold', async () => {
    const { q, calls } = recoveryRunner({ on_hold_reason: 'manual' });

    const result = await completeProviderRecoveryUsing(q, {
      caseId: 'case-1',
      resolvedProviderId: 'wp-pch',
      allowCasePoMint: true,
    });

    expect(result).toMatchObject({ outcome: 'not_needed', holdCleared: false });
    expect(calls.some((c) => c.sql.includes('UPDATE case_'))).toBe(false);
    expect(calls.some((c) => c.sql.includes('pg_advisory_xact_lock'))).toBe(false);
  });

  it('keeps retro recovery held when that seam does not authorise a new number', async () => {
    const { q, calls } = recoveryRunner();

    const result = await completeProviderRecoveryUsing(q, {
      caseId: 'case-1',
      resolvedProviderId: 'wp-pch',
      allowCasePoMint: false,
    });

    expect(result).toMatchObject({
      outcome: 'blocked',
      holdCleared: false,
      blockedReason: 'mint_not_allowed',
    });
    expect(calls.some((c) => c.sql.includes('UPDATE case_'))).toBe(false);
  });

  it('never mints over an unverified historical Archive folder', async () => {
    const { q, calls } = recoveryRunner({ box_folder_id: 'historical-folder' });

    const result = await completeProviderRecoveryUsing(q, {
      caseId: 'case-1',
      resolvedProviderId: 'wp-pch',
      allowCasePoMint: true,
    });

    expect(result).toMatchObject({
      outcome: 'blocked',
      blockedReason: 'archive_identity_requires_review',
      holdCleared: false,
    });
    expect(calls.some((c) => c.sql.includes('pg_advisory_xact_lock'))).toBe(false);
    expect(calls.some((c) => c.sql.startsWith('UPDATE case_'))).toBe(false);
  });

  it('mints past a stamped Archive folder when the retro dev seam acknowledges the identity', async () => {
    const { q, calls } = recoveryRunner({ box_folder_id: 'historical-folder' });

    const result = await completeProviderRecoveryUsing(q, {
      caseId: 'case-1',
      resolvedProviderId: 'wp-pch',
      allowCasePoMint: true,
      archiveIdentityAcknowledged: true,
    });

    expect(result).toMatchObject({
      outcome: 'identity_ready',
      casePo: 'PCH26008',
      casePoSource: 'minted',
      holdCleared: false,
    });
    expect(calls.some((c) => c.sql.includes('pg_advisory_xact_lock'))).toBe(true);
  });

  it('blocks a saved Case/PO that belongs to a different provider principal', async () => {
    const { q, calls } = recoveryRunner({ case_po: 'SAB26001' });

    const result = await completeProviderRecoveryUsing(q, {
      caseId: 'case-1',
      resolvedProviderId: 'wp-pch',
      allowCasePoMint: true,
    });

    expect(result).toMatchObject({
      outcome: 'blocked',
      blockedReason: 'case_po_provider_mismatch',
      casePo: 'SAB26001',
    });
    expect(calls.some((c) => c.sql.startsWith('UPDATE case_'))).toBe(false);
  });

  it('keeps an interrupted identity phase pending for Archive retry', async () => {
    const { q, calls } = recoveryRunner({
      case_po: 'PCH26008',
      on_hold_reason: PROVIDER_ARCHIVE_PENDING_HOLD_REASON,
    });

    const result = await completeProviderRecoveryUsing(q, {
      caseId: 'case-1',
      resolvedProviderId: 'wp-pch',
      allowCasePoMint: true,
    });

    expect(result).toMatchObject({
      outcome: 'identity_ready',
      holdCleared: false,
      casePo: 'PCH26008',
      casePoSource: 'adopted',
    });
    expect(calls.some((c) => c.sql.startsWith('UPDATE case_'))).toBe(false);
  });
});

describe('stampCaseArchiveFolderUsing', () => {
  it('links the folder, clears only Archive-pending recovery and requests status atomically', async () => {
    const calls: Call[] = [];
    const q = vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT box_folder_id, on_hold_reason')) {
        return [{ box_folder_id: null, on_hold_reason: PROVIDER_ARCHIVE_PENDING_HOLD_REASON }];
      }
      if (sql.includes('RETURNING status_recompute_requested_generation')) {
        return [{ status_recompute_requested_generation: 9 }];
      }
      return [];
    }) as unknown as TxQuery;

    const result = await stampCaseArchiveFolderUsing(q, {
      caseId: 'case-1',
      boxFolderId: 'folder-1',
      boxFolderUrl: 'https://app.box.com/folder/folder-1',
    });

    expect(result).toMatchObject({
      found: true,
      applied: true,
      boxFolderId: 'folder-1',
      providerRecoveryCompleted: true,
      statusGeneration: 9,
    });
    expect(calls.some((call) => call.sql.includes('SET on_hold = false, on_hold_reason = NULL'))).toBe(true);
    expect(calls.some((call) => call.sql.includes('status_recompute_requested_generation ='))).toBe(true);
    expect(calls.filter((call) => call.sql.includes('INSERT INTO audit_event'))).toHaveLength(2);
  });

  it('finalizes a pending recovery against the same already-linked folder', async () => {
    const calls: Call[] = [];
    const q = vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT box_folder_id, on_hold_reason')) {
        return [{ box_folder_id: 'folder-1', on_hold_reason: PROVIDER_ARCHIVE_PENDING_HOLD_REASON }];
      }
      if (sql.includes('RETURNING status_recompute_requested_generation')) {
        return [{ status_recompute_requested_generation: 10 }];
      }
      return [];
    }) as unknown as TxQuery;

    const result = await stampCaseArchiveFolderUsing(q, {
      caseId: 'case-1',
      boxFolderId: 'folder-1',
      boxFolderUrl: null,
    });

    expect(result).toMatchObject({
      applied: false,
      providerRecoveryCompleted: true,
      statusGeneration: 10,
    });
    expect(calls.some((call) => /SET box_folder_id/.test(call.sql))).toBe(false);
  });

  it('reports an already-completed same-folder recovery after response loss', async () => {
    const q = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT box_folder_id, on_hold_reason')) {
        return [{ box_folder_id: 'folder-1', on_hold_reason: null }];
      }
      return [];
    }) as unknown as TxQuery;

    const result = await stampCaseArchiveFolderUsing(q, {
      caseId: 'case-1',
      boxFolderId: 'folder-1',
      boxFolderUrl: 'https://app.box.com/folder/folder-1',
    });

    expect(result).toMatchObject({
      found: true,
      applied: false,
      boxFolderId: 'folder-1',
      providerRecoveryCompleted: true,
    });
  });
});

describe('provider hold schema parity', () => {
  const schema = (relative: string): string => {
    const location = relative.startsWith('deltas/')
      ? `migrations/${relative.slice('deltas/'.length)}`
      : `baseline/${relative}`;
    return readFileSync(
      fileURLToPath(new URL(`../../../../../database/${location}`, import.meta.url)),
      'utf8',
    );
  };

  it('ships the reason and invariant in both fresh-build and rolling schemas', () => {
    const canonical = schema('050_case.sql');
    const delta = schema('deltas/2026-07-14-tkt150-provider-recovery.sql');
    for (const sql of [canonical, delta]) {
      expect(sql).toContain('on_hold_reason');
      expect(sql).toContain('ck_case_on_hold_reason');
      expect(sql).toMatch(/on_hold_reason IS NULL/);
      expect(sql).toContain("'provider_archive_pending'");
    }
    expect(delta).not.toMatch(/SET\s+held_by/i);
    expect(delta).toContain("manual_hold.name = 'Case put on hold'");
  });

  it('ships an explicit non-staff source for legacy claimant carry-over', () => {
    const choices = schema('000_enums_lookups.sql');
    const delta = schema('deltas/2026-07-14-tkt150-provider-recovery.sql');
    for (const sql of [choices, delta]) {
      expect(sql).toContain("100000011, 'unknown',");
      expect(sql).toContain('Source Not Recorded');
    }
  });
});

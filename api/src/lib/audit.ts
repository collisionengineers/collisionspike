/**
 * api/src/lib/audit.ts — append-only audit_event writer.
 *
 * Mirrors the Dataverse audit invariants (plan 21 / plan 10 §5):
 *   - The DB app role has no UPDATE on audit_event (tamper-evidence; 900_constraints).
 *   - INSERT + SELECT only for both app roles; DELETE Admin-only (retention cascade).
 *   - 27 controlled auditaction codes (100000000–100000026, integers preserved).
 *
 * Column mapping to 080_audit_event.sql:
 *   name          = one-line human summary  (NOT NULL, primary column)
 *   occurred_at   = event time (the sort key; NOT NULL)
 *   action_code   = choice_audit_action(code) integer
 *   severity_code = choice_audit_severity(code) integer (info default)
 *   before/after  = optional JSON snapshots
 *   actor         = the staff/flow identity (Entra oid/upn from the JWT)
 *
 * NEVER throws — an audit-write failure must not block the primary operation.
 */

import { query } from './db.js';

/** Controlled audit action codes (choice_audit_action, plan 10 §2.1; base 100000000). */
export const AUDIT_ACTION = {
  graph_message_ingested: 100000000,
  graph_message_ingest_failed: 100000001,
  attachment_classified: 100000002,
  case_created: 100000003,
  case_attached: 100000004,
  duplicate_dropped: 100000005,
  duplicate_flagged: 100000006,
  provider_matched: 100000007,
  provider_unmatched: 100000008,
  parser_called: 100000009,
  parser_failed: 100000010,
  enrichment_called: 100000011,
  enrichment_failed: 100000012,
  status_changed: 100000013,
  jobsheet_imported: 100000014,
  eva_submitted: 100000015,
  box_synced: 100000016,
  corpus_record_changed: 100000017,
  inspection_override: 100000018,
  box_folder_created: 100000019,
  box_file_request_copied: 100000020,
  box_upload_received: 100000021,
  location_assist_confirmed: 100000022,
  chaser_sent: 100000023,
  inbound_classified: 100000024,
  inbound_routed: 100000025,
  case_disposed: 100000026,
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

/** choice_audit_severity(code) integers (plan 10 §2.1). */
const SEVERITY_CODE: Record<'info' | 'warning' | 'error', number> = {
  info: 100000000,
  warning: 100000001,
  error: 100000002,
};

export interface AuditEventOptions {
  action: AuditAction;
  /** One-line human summary (audit_event.name — required). */
  summary: string;
  caseId?: string;
  severity?: 'info' | 'warning' | 'error';
  before?: unknown;
  after?: unknown;
  /** The acting identity (Entra oid / upn / name from the validated JWT claims). */
  actor?: string;
}

/**
 * Write one append-only audit row. Never throws — audit failures are logged and
 * swallowed so the primary operation still succeeds.
 */
export async function writeAudit(opts: AuditEventOptions): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_event
         (name, case_id, actor, action_code, severity_code, before, after, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [
        opts.summary,
        opts.caseId ?? null,
        opts.actor ?? null,
        opts.action,
        SEVERITY_CODE[opts.severity ?? 'info'],
        opts.before !== undefined ? JSON.stringify(opts.before) : null,
        opts.after !== undefined ? JSON.stringify(opts.after) : null,
      ],
    );
  } catch (err) {
    // Log but do not rethrow — audit failures must not block primary ops.
    console.error('[audit] write failed', err);
  }
}

/** Extract a human actor label from the validated JWT claims (oid > upn > name > sub). */
export function actorFromClaims(claims: {
  oid?: unknown;
  preferred_username?: unknown;
  name?: unknown;
  sub?: unknown;
}): string | undefined {
  const pick = (v: unknown): string | undefined =>
    typeof v === 'string' && v.length > 0 ? v : undefined;
  return (
    pick(claims.oid) ?? pick(claims.preferred_username) ?? pick(claims.name) ?? pick(claims.sub)
  );
}

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

import { query, type TxQuery } from './db.js';

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
  // Phase-8 staff triage state-change actions (work-todo-spike: email-management).
  inbound_dismissed: 100000027,
  inbound_actioned: 100000028,
  inbound_reopened: 100000029,
  // Superuser soft-remove of a case (work-todo-spike: ui-changes/delete-case).
  case_removed: 100000030,
  // Staff override of a classifier suggestion (work-todo-spike: suggested-tags-and-folders).
  inbound_reclassified: 100000031,
  // AI suggestion lifecycle (TKT-015 AI suggestion layer; gated by AI_ASSIST_ENABLED).
  // created = a model produced a suggestion; accepted/rejected = a human reviewed it.
  ai_suggestion_created: 100000032,
  ai_suggestion_accepted: 100000033,
  ai_suggestion_rejected: 100000034,
  // rules-engine-v2 Phase 2 (ADR-0019) — the ref-gate suggest/link/detach lifecycle +
  // the cancellation-propose action. Minted in the DDL delta
  // migration/assets/schema/deltas/2026-07-02-rules-engine-v2-taxonomy.sql, NOT YET applied
  // live: writing one of these four codes before that delta lands will FK-fail on
  // choice_audit_action — writeAudit's catch-all below swallows that (never throws), so a
  // pre-DDL write degrades to "no audit row", never a blocked caller.
  inbound_link_suggested: 100000035,
  inbound_linked: 100000036,
  inbound_detached: 100000037,
  cancellation_proposed: 100000038,
  // Outlook filing lifecycle (TKT-054 / 020726 E6; gated by OUTLOOK_MOVE_ENABLED).
  // Minted in deltas/2026-07-02-tkt054-outlook-move.sql — same pre-DDL degrade as above.
  outlook_move_requested: 100000039,
  outlook_moved: 100000040,
  outlook_move_failed: 100000041,
  // Provider API intake channel (TKT-055 / ADR-0020; gated by the presence of at least one
  // minted key). Minted in deltas/2026-07-03-provider-api-intake.sql — same pre-DDL degrade
  // as the codes above (writeAudit's catch-all swallows an FK failure before the delta lands).
  // api_key_* audit the Superuser key lifecycle; provider_api_case_* audit the intake outcome.
  api_key_created: 100000042,
  api_key_revoked: 100000043,
  provider_api_case_created: 100000044,
  provider_api_case_rejected: 100000045,
  // Retroactive case reconstruction (TKT-058 / ADR-0022; gated by RETRO_CASE_ENABLED).
  // Minted in deltas/2026-07-04-retro-case.sql — same pre-DDL degrade as the codes above.
  // created = a case was reconstructed; linked = the trigger email matched an EXISTING
  // case (any status, incl. terminal); failed = the ladder found no source to rebuild from.
  retro_case_created: 100000046,
  retro_case_linked: 100000047,
  retro_reconstruction_failed: 100000048,
  // TKT-068 — staff added evidence via the assistant's attach affordance (bytes uploaded to Blob
  // + an evidence row created). Records the actor from the validated JWT (never the model).
  evidence_added: 100000049,
  // PLAN-001 Phase 3 (TKT-110/3b) — autonomous MCP-agent actions. Reserved now so the codes are
  // stable; only WRITTEN once agent writes ship (3b). An agent action stamps the agent SP identity
  // + autonomous:true into the actor/after (never a silent managed-identity fallback).
  agent_read: 100000050,
  agent_write: 100000051,
  // TKT-016 — a run of the staged image-analysis suggestion producer (POST /api/cases/{id}/
  // image-analysis/generate; gated IMAGE_ANALYSIS_ENABLED). Records the RUN (how many observation
  // suggestions were minted + which stages degraded) distinct from the per-suggestion
  // ai_suggestion_created (100000032) each draft also writes. Minted in
  // deltas/2026-07-08-image-analysis-suggestion-types.sql — same pre-DDL degrade as the codes
  // above (writeAudit's catch-all swallows the choice_audit_action FK failure until the delta lands).
  image_analysis_generated: 100000052,
  // TKT-094/095 (ADR-0023) — the CE report was delivered back to the work provider
  // (the case's eva_submitted → done transition; manual button or a detector).
  // Minted in deltas/2026-07-09-case-done.sql — same pre-DDL degrade as the codes
  // above. NOTE: the case-done plan draft reserved 100000049 for this, but
  // 100000049–100000052 were taken by TKT-068/110/016 first — hence 100000053.
  report_delivered: 100000053,
  // TKT-148 — a deterministic draft chase suggestion. Distinct from chaser_sent:
  // no email or message has been sent and staff still decide whether to use the draft.
  chaser_suggested: 100000054,
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
 * swallowed so the primary operation still succeeds. When a transaction query is
 * supplied, a savepoint keeps that best-effort posture without aborting the caller's
 * surrounding transaction.
 */
export async function writeAudit(opts: AuditEventOptions, transactionQuery?: TxQuery): Promise<void> {
  const q = transactionQuery ?? query;
  const savepoint = transactionQuery ? 'audit_event_write' : null;
  try {
    if (savepoint) await q(`SAVEPOINT ${savepoint}`);
    await q(
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
    if (savepoint) await q(`RELEASE SAVEPOINT ${savepoint}`);
  } catch (err) {
    if (savepoint) {
      try {
        await q(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await q(`RELEASE SAVEPOINT ${savepoint}`);
      } catch {
        // The outer transaction owns the final rollback if the connection itself failed.
      }
    }
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

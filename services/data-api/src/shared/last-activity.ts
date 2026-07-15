/**
 * services/data-api/src/shared/last-activity.ts — the ONE place a case's most-recent activity is
 * turned into a plain-English "Last update" descriptor (TKT-117).
 *
 * The queue LIST payload carries `lastActivity: { label, date }` per case, computed
 * from a LATERAL join over the newest of the case's audit_event / note / chaser rows
 * (see CASE_SELECT_WITH_ACTIVITY in shared/mapping/cases.ts). This module owns the wording:
 *
 *   - audit rows map their controlled action code to a handler-plain label
 *     ("Email received", "Images received", "Chased", "Sent to EVA", …) — NEVER the
 *     raw enum name (CONTEXT.md terminology rule);
 *   - note rows read "Note added by <author>" (author only when it is a human-safe
 *     name — a GUID/oid actor must never render, so it degrades to "Note added");
 *   - chaser rows read "Chased".
 *
 * PURE + framework-free (no DB, no env) so the mapping is unit-testable.
 */

import { auditActionCodec } from '@cs/domain/codecs';

/** Where the newest activity row came from (the UNION branches of the lateral join). */
export type LastActivityKind = 'audit' | 'note' | 'chaser';

/** Plain-English label per controlled audit action NAME (choice_audit_action).
 *  Keys are the codec names; anything unmapped falls back to 'Updated'. */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  graph_message_ingested: 'Email received',
  graph_message_ingest_failed: 'Email could not be read',
  attachment_classified: 'Files received',
  case_created: 'Case created',
  case_attached: 'Email attached',
  duplicate_dropped: 'Duplicate email set aside',
  duplicate_flagged: 'Possible duplicate flagged',
  provider_matched: 'Provider identified',
  provider_unmatched: 'Provider not recognised',
  parser_called: 'Instructions read',
  parser_failed: 'Instructions could not be read',
  enrichment_called: 'Vehicle details looked up',
  enrichment_failed: 'Vehicle lookup failed',
  status_changed: 'Details updated',
  jobsheet_imported: 'Job sheet imported',
  eva_submitted: 'Sent to EVA',
  box_synced: 'Archived',
  corpus_record_changed: 'Reference details updated',
  inspection_override: 'Inspection decision recorded',
  box_folder_created: 'Archive folder created',
  box_file_request_copied: 'Upload link created',
  box_upload_received: 'Images received',
  location_assist_confirmed: 'Inspection address set',
  chaser_sent: 'Chased',
  chaser_suggested: 'Chase suggested',
  inbound_classified: 'Email sorted',
  inbound_routed: 'Email filed',
  case_disposed: 'Case closed',
  inbound_dismissed: 'Email dismissed',
  inbound_actioned: 'Email handled',
  inbound_reopened: 'Email reopened',
  case_removed: 'Case closed',
  inbound_reclassified: 'Email re-sorted',
  ai_suggestion_created: 'Suggestion added',
  ai_suggestion_accepted: 'Suggestion accepted',
  ai_suggestion_rejected: 'Suggestion declined',
};

/** Codes newer than the seeded audit-event code table (100000035+, minted by DDL
 *  deltas — auditActionCodec cannot name them, so they map by frozen integer).
 *  Append-only, mirroring AUDIT_ACTION in lib/audit.ts. */
const AUDIT_ACTION_CODE_LABELS: Record<number, string> = {
  100000035: 'Email match suggested', // inbound_link_suggested
  100000036: 'Email attached', // inbound_linked
  100000037: 'Email detached', // inbound_detached
  100000038: 'Cancellation flagged', // cancellation_proposed
  100000039: 'Email filing requested', // outlook_move_requested
  100000040: 'Email filed', // outlook_moved
  100000041: 'Email filing failed', // outlook_move_failed
  100000044: 'Case received from the provider', // provider_api_case_created
  100000046: 'Case reconstructed', // retro_case_created
  100000047: 'Email attached', // retro_case_linked
  100000049: 'Files added', // evidence_added
  100000052: 'Photos analysed', // image_analysis_generated
  100000054: 'Chase suggested', // chaser_suggested
  100000055: 'Files checked', // evidence_upload_result
};

/** Safe fallback when an action has no mapping — plain, honest, never an enum. */
const DEFAULT_LABEL = 'Updated';

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A human-renderable form of an actor/author string, or undefined when it must not
 * render: Entra oids (GUIDs) and the 'System' sentinel never reach the UI
 * (CONTEXT.md: internal ids never render). A UPN/email degrades to its local part.
 */
export function humanActorName(raw: string | null | undefined): string | undefined {
  const s = (raw ?? '').trim();
  if (!s) return undefined;
  if (GUID_RE.test(s)) return undefined;
  if (s.toLowerCase() === 'system') return undefined;
  const at = s.indexOf('@');
  if (at > 0) return s.slice(0, at);
  return s;
}

/** The plain-English label for an AUDIT activity row (by controlled action code). */
export function auditActionLabel(actionCode: number | null | undefined): string {
  if (actionCode == null) return DEFAULT_LABEL;
  const code = Number(actionCode);
  const name = auditActionCodec.toName(code);
  if (name && AUDIT_ACTION_LABELS[name]) return AUDIT_ACTION_LABELS[name];
  return AUDIT_ACTION_CODE_LABELS[code] ?? DEFAULT_LABEL;
}

/* ============================================================
   TKT-134 — Action-logs detail-line safety filter.
   ============================================================ */

/** Engineering-shaped tokens that must never render on a staff-visible line:
 *  anything underscored (box_upload_received, missing_required_fields, img_1_1
 *  filename stems), enum-transition arrows (duplicate_risk -> missing_images),
 *  GUIDs anywhere in the text, and code-y key=value pairs (category=case_update). */
const GUID_ANYWHERE_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ARROW_RE = /->|→/;
const KEY_VALUE_RE = /\b\w+=[^\s]/;

/**
 * A human-safe rendering of a raw audit summary, or undefined when it must not
 * render on a staff-visible line (TKT-134). Conservative by design: a summary
 * carrying ANY engineering-shaped token (an underscore, an enum arrow, a GUID,
 * a key=value pair) is withheld entirely — the caller keeps the raw text behind
 * a technical-details affordance instead. Plain summaries ("Case created
 * (CCPY26050)", "Chaser marked responded — the requested item arrived") pass
 * through untouched.
 */
export function plainDetail(raw: string | null | undefined): string | undefined {
  const s = (raw ?? '').trim();
  if (!s) return undefined;
  if (s.includes('_')) return undefined;
  if (GUID_ANYWHERE_RE.test(s)) return undefined;
  if (ARROW_RE.test(s)) return undefined;
  if (KEY_VALUE_RE.test(s)) return undefined;
  return s;
}

/**
 * The "Last update" descriptor for the newest activity row of a case.
 *   audit  → the controlled-action mapping above;
 *   note   → "Note added by <author>" (author omitted unless human-safe);
 *   chaser → "Chase suggested" for a system draft, otherwise "Chased".
 * Unknown kinds degrade to the safe default (never a raw token).
 */
export function lastActivityLabel(row: {
  kind: LastActivityKind | string | null | undefined;
  actionCode?: number | null;
  actor?: string | null;
  /** True for deterministic draft suggestions, including earlier audit rows whose
   *  `after` metadata carried suggested=true under the older chaser_sent action. */
  suggested?: boolean;
}): string {
  if (row.suggested === true) return 'Chase suggested';
  switch (row.kind) {
    case 'audit':
      return auditActionLabel(row.actionCode);
    case 'note': {
      const who = humanActorName(row.actor);
      return who ? `Note added by ${who}` : 'Note added';
    }
    case 'chaser':
      return 'Chased';
    default:
      return DEFAULT_LABEL;
  }
}

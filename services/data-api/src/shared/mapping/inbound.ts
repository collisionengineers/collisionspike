/** inbound — cohesive Data API module. */

import { INBOUND_ATTENTION_REASONS, OUTLOOK_MOVE_STATES, normalizeOutlookWebLink, type AiSuggestion, type AiSuggestionReviewState, type ClassifierMode, type InboundAttentionReason, type InboundCategory, type InboundCounts, type InboundEmail, type InboundSubtype, type OutlookMoveState, type TriageState } from '@cs/domain';
import { type Row, toIso } from './cases.js';

const INBOUND_CATEGORY_BY_INT: Record<number, InboundCategory> = {
  100000000: 'receiving_work',
  100000001: 'query',
  100000002: 'other',
  100000003: 'billing',
  100000004: 'non_actionable',
  100000005: 'case_update',
  100000006: 'cancellation',
  // Taxonomy v3 (TKT-084) — see deltas/2026-07-09-taxonomy-v3-pre-instruction-payments.sql.
  100000007: 'pre_instruction',
  100000008: 'website_enquiry',
};

export const INBOUND_CATEGORY_TO_INT: Record<InboundCategory, number> = {
  receiving_work: 100000000,
  query: 100000001,
  other: 100000002,
  billing: 100000003,
  non_actionable: 100000004,
  case_update: 100000005,
  cancellation: 100000006,
  pre_instruction: 100000007,
  website_enquiry: 100000008,
};

const INBOUND_SUBTYPE_BY_INT: Record<number, InboundSubtype> = {
  100000000: 'existing_provider_instruction',
  100000001: 'existing_provider_audit',
  100000002: 'new_client_work',
  100000003: 'query_existing_work',
  100000004: 'query_new_enquiry',
  100000005: 'other',
  100000006: 'existing_provider_diminution',
  100000007: 'billing_request',
  100000008: 'case_summary',
  100000009: 'acknowledgement',
  100000010: 'images_received',
  100000011: 'cancellation_notice',
  100000012: 'update_general',
  // Taxonomy v3 (TKT-105/120 + TKT-084).
  100000013: 'payment_remittance',
  100000014: 'pre_instruction_directions',
  100000015: 'website_general_enquiry',
  // TKT-226 — system-stamped by the retro link-related lane (TKT-222); never
  // classifier-emitted. See migrations/2026-07-17-tkt226-retro-related-subtype.sql.
  100000016: 'retro_related',
};

export const INBOUND_SUBTYPE_TO_INT: Record<InboundSubtype, number> = {
  existing_provider_instruction: 100000000,
  existing_provider_audit: 100000001,
  new_client_work: 100000002,
  query_existing_work: 100000003,
  query_new_enquiry: 100000004,
  other: 100000005,
  existing_provider_diminution: 100000006,
  billing_request: 100000007,
  case_summary: 100000008,
  acknowledgement: 100000009,
  images_received: 100000010,
  cancellation_notice: 100000011,
  update_general: 100000012,
  payment_remittance: 100000013,
  pre_instruction_directions: 100000014,
  website_general_enquiry: 100000015,
  retro_related: 100000016,
};

export const TRIAGE_STATES: readonly TriageState[] = ['new', 'routed', 'actioned', 'dismissed'];

const CLASSIFIER_MODES: readonly ClassifierMode[] = ['deterministic', 'llm', 'human'];

export const HANDLED_TRIAGE_STATES: readonly TriageState[] = ['actioned', 'dismissed'];

export function isValidTriageState(s: unknown): s is TriageState {
  return typeof s === 'string' && (TRIAGE_STATES as readonly string[]).includes(s);
}

export function isHandledTriageState(s: string | null | undefined): boolean {
  return s === 'actioned' || s === 'dismissed';
}

export function inboundCategoryFromInt(v: number | null | undefined): InboundCategory | undefined {
  return v == null ? undefined : INBOUND_CATEGORY_BY_INT[v];
}

export function inboundSubtypeFromInt(v: number | null | undefined): InboundSubtype | undefined {
  return v == null ? undefined : INBOUND_SUBTYPE_BY_INT[v];
}

function parseSignals(memo: string | undefined): string[] {
  const s = (memo ?? '').trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const arr: unknown = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((x) => String(x)).filter(Boolean);
    } catch {
      /* fall through to delimiter split */
    }
  }
  return s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function rowToInboundEmail(rec: Row): InboundEmail {
  const triageState: TriageState = TRIAGE_STATES.includes(
    (rec.triage_state ?? '') as TriageState,
  )
    ? (rec.triage_state as TriageState)
    : 'new';
  const classifierMode: ClassifierMode = CLASSIFIER_MODES.includes(
    (rec.classifier_mode ?? '') as ClassifierMode,
  )
    ? (rec.classifier_mode as ClassifierMode)
    : 'deterministic';
  const outlookWebLink = normalizeOutlookWebLink(rec.outlook_web_link);
  return {
    id: rec.id ?? '',
    name: rec.name ?? '',
    sourceMessageId: rec.source_message_id ?? '',
    ...(outlookWebLink ? { outlookWebLink } : {}),
    subject: rec.subject ?? '',
    fromAddress: rec.from_address ?? '',
    senderDomain: rec.sender_domain ?? '',
    sourceMailbox: rec.source_mailbox ?? '',
    receivedOn: toIso(rec.received_on),
    hasAttachments: rec.has_attachments ?? false,
    category: INBOUND_CATEGORY_BY_INT[rec.category_code ?? -1] ?? 'other',
    subtype: INBOUND_SUBTYPE_BY_INT[rec.subtype_code ?? -1] ?? 'other',
    confidence: rec.confidence != null ? Number(rec.confidence) : 0,
    classifierMode,
    signals: parseSignals(rec.signals),
    triageState,
    bodyVrm: rec.body_vrm ?? '',
    bodyCaseref: rec.body_caseref ?? '',
    // Stored by the Phase-2 DDL but only surfaced from TKT-054 (columns/keys absent on
    // older rows or unjoined queries — the conditional spread tolerates both).
    ...(rec.body_jobref ? { bodyJobref: rec.body_jobref } : {}),
    ...(rec.conversation_id ? { conversationId: rec.conversation_id } : {}),
    bodyPreview: rec.body_preview ?? '',
    ...(rec.case_id ? { caseId: rec.case_id } : {}),
    // The linked case's Case/PO — present only when the query LEFT JOINs case_ (inbox list).
    ...(rec.case_po ? { casePo: rec.case_po } : {}),
    // TKT-093 — a pending "attach to this open case" suggestion's Case/PO for a not-yet-linked
    // email (only when the inbox-list query joins the suggestion). Suppressed once linked.
    ...(!rec.case_id && rec.link_suggestion_case_po
      ? { linkSuggestionCasePo: rec.link_suggestion_case_po }
      : {}),
    ...(rec.work_provider_id ? { workProviderId: rec.work_provider_id } : {}),
    // The classifier's original suggestion (columns may be absent on a not-yet-migrated DB
    // — SELECT * simply omits them, so these stay undefined). work-todo-spike: suggested-tags.
    ...(rec.suggested_category_code != null && INBOUND_CATEGORY_BY_INT[rec.suggested_category_code]
      ? { suggestedCategory: INBOUND_CATEGORY_BY_INT[rec.suggested_category_code] }
      : {}),
    ...(rec.suggested_subtype_code != null && INBOUND_SUBTYPE_BY_INT[rec.suggested_subtype_code]
      ? { suggestedSubtype: INBOUND_SUBTYPE_BY_INT[rec.suggested_subtype_code] }
      : {}),
    // Outlook filing lifecycle (TKT-054; columns absent pre-delta — spreads tolerate).
    ...(rec.outlook_move_state && OUTLOOK_MOVE_STATES.includes(rec.outlook_move_state as OutlookMoveState)
      ? { outlookMoveState: rec.outlook_move_state as OutlookMoveState }
      : {}),
    ...(rec.outlook_moved_folder ? { outlookMovedFolder: rec.outlook_moved_folder } : {}),
    ...(rec.outlook_moved_at ? { outlookMovedAt: toIso(rec.outlook_moved_at) } : {}),
    // TKT-119c / TKT-034 — attention flag (column absent pre-delta; spread tolerates).
    ...(rec.attention_reason &&
    (INBOUND_ATTENTION_REASONS as readonly string[]).includes(rec.attention_reason)
      ? { attentionReason: rec.attention_reason as InboundAttentionReason }
      : {}),
  };
}

const AI_REVIEW_STATES: readonly AiSuggestionReviewState[] = [
  'pending',
  'accepted',
  'rejected',
  'superseded',
];

export function isAiReviewState(s: unknown): s is AiSuggestionReviewState {
  return typeof s === 'string' && (AI_REVIEW_STATES as readonly string[]).includes(s);
}

function coerceJson(v: unknown): unknown {
  if (typeof v !== 'string') return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

export function rowToAiSuggestion(rec: Row): AiSuggestion {
  const reviewState: AiSuggestionReviewState = AI_REVIEW_STATES.includes(
    (rec.review_state ?? '') as AiSuggestionReviewState,
  )
    ? (rec.review_state as AiSuggestionReviewState)
    : 'pending';
  return {
    id: rec.id ?? '',
    ...(rec.case_id ? { caseId: rec.case_id } : {}),
    ...(rec.evidence_id ? { evidenceId: rec.evidence_id } : {}),
    ...(rec.inbound_email_id ? { inboundEmailId: rec.inbound_email_id } : {}),
    suggestionType: rec.suggestion_type ?? '',
    suggestedValue: coerceJson(rec.suggested_value),
    ...(rec.rationale ? { rationale: rec.rationale } : {}),
    ...(rec.confidence != null ? { confidence: Number(rec.confidence) } : {}),
    ...(rec.model_version ? { modelVersion: rec.model_version } : {}),
    reviewState,
    createdAt: toIso(rec.created_at),
    ...(rec.reviewed_by ? { reviewedBy: rec.reviewed_by } : {}),
    ...(rec.reviewed_at ? { reviewedAt: toIso(rec.reviewed_at) } : {}),
  };
}

export interface SuggestionIdempotencyKey {
  suggestionType: 'case_link' | 'cancellation' | 'triage_category';
  /** Which subject column the duplicate-check filters on. */
  subjectKind: 'inbound_email_id' | 'source_message_id';
  subject: string;
  /** null when the request carried no target (e.g. an ambiguous ref-gate match, or any
   *  'triage_category' suggestion — that type never carries one). */
  targetCaseId: string | null;
}

export function deriveSuggestionIdempotencyKey(input: {
  suggestionType: 'case_link' | 'cancellation' | 'triage_category';
  inboundEmailId: string | null;
  sourceMessageId: string | null;
  targetCaseId: string | null;
}): SuggestionIdempotencyKey | null {
  if (input.inboundEmailId) {
    return {
      suggestionType: input.suggestionType,
      subjectKind: 'inbound_email_id',
      subject: input.inboundEmailId,
      targetCaseId: input.targetCaseId,
    };
  }
  if (input.sourceMessageId) {
    return {
      suggestionType: input.suggestionType,
      subjectKind: 'source_message_id',
      subject: input.sourceMessageId,
      targetCaseId: input.targetCaseId,
    };
  }
  return null;
}

export function inboundViewWhere(view: string | null | undefined): string {
  switch (view) {
    case 'handled':
      return "triage_state IN ('actioned','dismissed')";
    case 'all':
      return '';
    case 'active':
    default:
      // active = everything NOT handled. NULL triage_state counts as active (it maps to 'new').
      return "(triage_state IS NULL OR triage_state NOT IN ('actioned','dismissed'))";
  }
}

export function tallyActiveInboundCounts(
  rows: ReadonlyArray<{ category_code?: number | null; triage_state?: string | null }>,
): InboundCounts {
  const counts: InboundCounts = {
    receiving_work: 0,
    query: 0,
    billing: 0,
    non_actionable: 0,
    case_update: 0,
    cancellation: 0,
    pre_instruction: 0,
    website_enquiry: 0,
    other: 0,
    untriaged: 0,
  };
  for (const r of rows) {
    if (isHandledTriageState(r.triage_state)) continue; // handled = not active work
    const cat = inboundCategoryFromInt(r.category_code ?? undefined);
    if (cat) counts[cat] += 1;
    if ((r.triage_state ?? 'new') === 'new') counts.untriaged += 1;
  }
  return counts;
}

/**
 * api/src/lib/mappers.ts — Postgres row <-> @cs/domain model/dto mapping.
 *
 * Ports mockup-app/src/data/adapter.ts (caseFromRecord / evidenceFromRecord /
 * providerFromRecord / suggestionFromRecord / auditToActivity) from the Dataverse
 * cr1bd_* record shapes to the Postgres snake_case column shapes ([`20`]).
 * Uses @cs/domain/codecs (the SAME choiceset integer<->name codecs the Code App
 * used) so the EVA choice integers are preserved byte-for-byte (R4, plan 10 §2.1).
 *
 * Also carries the pure windowing helpers (parseDmy / startOfWeek / filterQueue /
 * actionableCases) the dashboard + queue aggregates need — ported verbatim from
 * mockup-app/src/data/dataverse-source.ts so the numbers are identical for
 * identical data. NO db import here (pure row<->domain + pure windowing math); the
 * function handlers own the SQL and call these mappers over the fetched rows.
 */

import {
  EVA_FIELD_ORDER,
  QUEUES,
  queueByName,
  statusToQueue,
  type ActivityEvent,
  type AiSuggestion,
  type AiSuggestionReviewState,
  type Case,
  type CaseStatus,
  type ClassifierMode,
  type EvaField,
  type EvaFields,
  type EvaFieldKey,
  type Evidence,
  type EvidenceKind,
  type InboundCategory,
  type InboundCounts,
  type InboundEmail,
  type InboundSubtype,
  type MileageUnit,
  type OverviewFacts,
  type Provider,
  type QueueName,
  type SuggestedAddress,
  type TriageState,
  type VatStatus,
} from '@cs/domain';
import {
  actionReasonCodec,
  auditActionCodec,
  auditActionToActivityKind,
  automationModeCodec,
  caseStatusCodec,
  evidenceKindCodec,
  imageRoleCodec,
  inspectionDecisionCodec,
  inspectionPolicyCodec,
  intakeChannelKindCodec,
  reviewStateCodec,
  sourceTypeCodec,
} from '@cs/domain/codecs';

/** A raw pg row. Columns come back snake-cased; values are string|number|boolean|Date|null. */
export type Row = Record<string, any>;

/* ============================================================
   SELECT fragment for a full Case (row + provider display join).
   ============================================================ */

/** Base SELECT for case_ rows, joining the provider display name (mirrors the
 *  expanded cr1bd_provider_display the Code App read). Append WHERE/ORDER as needed. */
export const CASE_SELECT =
  'SELECT c.*, wp.display_name AS provider_display, wp.principal_code AS provider_principal ' +
  'FROM case_ c LEFT JOIN work_provider wp ON wp.id = c.work_provider_id';

/* ============================================================
   Date helpers — Postgres date/timestamptz <-> domain DD/MM/YYYY strings.
   pg returns `date` and `timestamptz` columns as JS Date objects.
   ============================================================ */

const pad = (n: number): string => String(n).padStart(2, '0');

/** A Date or ISO/DD-MM string -> DD/MM/YYYY; null/empty -> undefined. */
export function toDmy(v: Date | string | null | undefined): string | undefined {
  if (v == null || v === '') return undefined;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return undefined;
    return `${pad(v.getDate())}/${pad(v.getMonth() + 1)}/${v.getFullYear()}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // ISO yyyy-mm-dd
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // already DD/MM/YYYY
  if (m) return s;
  return undefined;
}

/** A Date or string -> ISO-8601 string; null/empty -> ''. */
export function toIso(v: Date | string | null | undefined): string {
  if (v == null || v === '') return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString();
  return String(v);
}

/** Whole days between a DD/MM/YYYY createdAt and `now` (>= 0). */
function ageDaysFrom(createdAtDmy: string | undefined, now: Date): number {
  if (!createdAtDmy) return 0;
  const m = createdAtDmy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return 0;
  const created = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const ms =
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
    Date.UTC(created.getFullYear(), created.getMonth(), created.getDate());
  return Math.max(0, Math.round(ms / 86_400_000));
}

/* ============================================================
   EVA field column mapping (camelCase key -> case_ eva_* column).
   ============================================================ */

export const EVA_COLUMN_BY_KEY: Record<EvaFieldKey, string> = {
  workProvider: 'eva_work_provider',
  vehicleModel: 'eva_vehicle_model',
  claimantName: 'eva_claimant_name',
  claimantTelephone: 'eva_claimant_telephone',
  claimantEmail: 'eva_claimant_email',
  dateOfLoss: 'eva_date_of_loss',
  dateOfInstruction: 'eva_date_of_instruction',
  accidentCircumstances: 'eva_accident_circumstances',
  inspectionAddress: 'eva_inspection_address',
  vatStatus: 'eva_vat_status',
  mileage: 'eva_mileage',
  mileageUnit: 'eva_mileage_unit',
};

/** Pair a Case eva_* column value with its provenance row (source + review state). */
function provenanceRowToEvaField(value: string, row?: Row): EvaField {
  const sourceType = sourceTypeCodec.toName(row?.source_type_code) ?? 'staff';
  const reviewState = reviewStateCodec.toName(row?.review_state_code) ?? 'needs_review';
  const confidence = row?.confidence;
  return {
    value,
    reviewState,
    provenance: {
      sourceType,
      sourceLabel: row?.source_label ?? 'Staff entry',
      ...(confidence != null ? { confidence: Number(confidence) } : {}),
    },
  };
}

/** Assemble the 12-field EvaFields object from a case_ row + its provenance rows. */
export function rowToEvaFields(rec: Row, provenanceRows: readonly Row[] = []): EvaFields {
  const byField = new Map<string, Row>();
  for (const row of provenanceRows) {
    if (row.field_name) byField.set(String(row.field_name), row);
  }
  const out = {} as EvaFields;
  for (const desc of EVA_FIELD_ORDER) {
    const value = (rec[EVA_COLUMN_BY_KEY[desc.key]] as string | undefined) ?? '';
    (out as Record<EvaFieldKey, EvaField>)[desc.key] = provenanceRowToEvaField(
      value,
      byField.get(desc.key),
    );
  }
  out.vatStatus = { ...out.vatStatus, value: out.vatStatus.value as VatStatus };
  out.mileageUnit = { ...out.mileageUnit, value: out.mileageUnit.value as MileageUnit };
  return out;
}

function rowToOverviewFacts(rec: Row): OverviewFacts {
  const f: OverviewFacts = {};
  if (rec.ov_insured_name) f.insuredName = rec.ov_insured_name;
  if (rec.ov_claimant_name) f.claimantName = rec.ov_claimant_name;
  if (rec.ov_third_party_name) f.thirdPartyName = rec.ov_third_party_name;
  if (rec.ov_claim_number) f.claimNumber = rec.ov_claim_number;
  if (rec.ov_policy_reference) f.policyReference = rec.ov_policy_reference;
  if (rec.ov_incident_date) f.incidentDate = rec.ov_incident_date;
  if (rec.ov_claim_type) f.claimType = rec.ov_claim_type;
  if (rec.ov_insurer_name) f.insurerName = rec.ov_insurer_name;
  if (rec.ov_repairer_name) f.repairerName = rec.ov_repairer_name;
  return f;
}

/** Resolve the inspection decision; image-based fallback when the address text is
 *  the IBA literal but no explicit mode was written yet (mirrors the adapter). */
function deriveInspectionDecision(rec: Row): Case['inspectionDecision'] {
  const explicit = inspectionDecisionCodec.toName(rec.inspection_decision_code);
  if (explicit) return explicit;
  if ((rec.eva_inspection_address ?? '').trim() === 'Image Based Assessment') {
    return 'image_based';
  }
  return 'unknown';
}

export interface CaseAssembly {
  evidence?: Evidence[];
  notes?: Case['notes'];
  chasers?: Case['chasers'];
  provenanceRows?: readonly Row[];
  now?: Date;
}

/** A case_ row (+ optional expanded children) -> the domain Case. */
export function rowToCase(rec: Row, opts: CaseAssembly = {}): Case {
  const now = opts.now ?? new Date();
  const createdAt = toDmy(rec.created_at) ?? '';
  const channelKind = intakeChannelKindCodec.toName(rec.intake_channel_kind_code) ?? 'email';
  const actionReason = actionReasonCodec.toName(rec.action_reason_code ?? undefined);
  const dateDue = toDmy(rec.date_due);
  const submittedAt = toDmy(rec.submitted_at);

  return {
    id: rec.id ?? '',
    vrm: rec.vrm ?? '',
    ...(rec.case_po ? { casePo: rec.case_po } : {}),
    ...(rec.eva_claimant_address ? { claimantAddress: rec.eva_claimant_address } : {}),
    provider: rec.provider_display ?? rec.eva_work_provider ?? '',
    providerCode: rec.provider_principal ?? '',
    vehicleModel: rec.eva_vehicle_model ?? '',
    evaFields: rowToEvaFields(rec, opts.provenanceRows),
    evidence: opts.evidence ?? [],
    notes: opts.notes ?? [],
    chasers: opts.chasers ?? [],
    overviewFacts: rowToOverviewFacts(rec),
    status: caseStatusCodec.toName(rec.status_code) ?? 'error',
    missing: [],
    ...(actionReason ? { actionReason } : {}),
    ...(rec.on_hold ? { onHold: true } : {}),
    channel: {
      kind: channelKind,
      mode: rec.intake_channel_manual ? 'manual' : 'auto',
      sourceMailbox: rec.source_mailbox ?? '',
    },
    ageDays: ageDaysFrom(createdAt, now),
    inspectionDecision: deriveInspectionDecision(rec),
    createdAt,
    ...(dateDue ? { dateDue } : {}),
    ...(submittedAt ? { submittedAt } : {}),
    ...(rec.box_folder_id ? { boxFolderId: rec.box_folder_id } : {}),
    ...(rec.box_folder_url ? { boxFolderUrl: rec.box_folder_url } : {}),
  };
}

/* ============================================================
   Evidence <-> evidence row.
   ============================================================ */

export function rowToEvidence(rec: Row): Evidence {
  return {
    id: rec.id ?? '',
    fileName: rec.file_name ?? '',
    kind: (evidenceKindCodec.toName(rec.kind_code) ?? 'other') as EvidenceKind,
    imageRole: imageRoleCodec.toName(rec.image_role_code) ?? 'unknown',
    registrationVisible: rec.registration_visible ?? false,
    acceptedForEva: rec.accepted_for_eva ?? false,
    ...(rec.excluded != null ? { excluded: rec.excluded } : {}),
    ...(rec.exclusion_reason ? { exclusionReason: rec.exclusion_reason } : {}),
    sourceLabel: rec.source_label ?? '',
    ...(rec.box_file_id ? { boxFileId: rec.box_file_id } : {}),
    ...(rec.box_file_url ? { boxFileUrl: rec.box_file_url } : {}),
  };
}

/** Record-level mirror of imagesForCase's predicate: image-kind, not excluded. */
export function isAcceptedImageRow(rec: Row): boolean {
  return evidenceKindCodec.toName(rec.kind_code) === 'image' && rec.excluded !== true;
}

/* ============================================================
   Provider <-> work_provider row.
   ============================================================ */

function parseDomains(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) return arr.map((d) => String(d).trim()).filter(Boolean);
    } catch {
      /* fall through to newline parse */
    }
  }
  return trimmed
    .split(/[\r\n,]+/)
    .map((d) => d.trim())
    .filter(Boolean);
}

export function rowToProvider(rec: Row): Provider {
  return {
    id: rec.id ?? '',
    displayName: rec.display_name ?? '',
    principalCode: rec.principal_code ?? '',
    defaultMailbox: rec.default_mailbox ?? '',
    knownEmailDomains: parseDomains(rec.known_email_domains),
    inspectionLocationPolicy:
      inspectionPolicyCodec.toName(rec.inspection_location_policy_code) ?? 'prefer_address',
    providerAutomationMode:
      automationModeCodec.toName(rec.provider_automation_mode_code) ?? 'review_auto',
    active: rec.active ?? false,
  };
}

/* ============================================================
   Inspection-address SUGGESTIONS <-> inspection_address row.
   ============================================================ */

/** True when the row is a low-confidence suggestion (source_label startswith 'suggested'). */
export function isSuggestedAddressRow(rec: Row): boolean {
  return (rec.source_label ?? '').trim().toLowerCase().startsWith('suggested');
}

function noteToken(note: string | undefined, key: string): string | undefined {
  if (!note) return undefined;
  const m = note.match(new RegExp(`${key}=([^\\s|]+)`));
  return m ? m[1] : undefined;
}

export function rowToSuggestedAddress(rec: Row): SuggestedAddress {
  const lines = [
    rec.address_line1,
    rec.address_line2,
    rec.address_line3,
    rec.address_line4,
    rec.address_line5,
    rec.address_line6,
  ]
    .map((l) => (l ?? '').trim())
    .filter((l) => l.length > 0);
  const label = (rec.source_label ?? '').trim();
  const colon = label.indexOf(':');
  const confidenceBand = colon >= 0 ? label.slice(colon + 1).trim() : undefined;
  const note: string | undefined = rec.source_note ?? undefined;
  const humanEvidence = note
    ? note
        .replace(/\b(?:provider|loc|status)=\S*/gi, '')
        .replace(/\bsource=/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([.,])/g, '$1')
        .replace(/\.{2,}/g, '.')
        .trim()
    : '';
  const lastSeen = toIso(rec.last_seen_on).slice(0, 10);
  return {
    id: rec.id ?? '',
    lines,
    postcode: (rec.postcode ?? '').trim(),
    ...(noteToken(note, 'provider') ? { providerCode: noteToken(note, 'provider') } : {}),
    ...(noteToken(note, 'loc') ? { locValue: noteToken(note, 'loc') } : {}),
    ...(humanEvidence ? { evidenceNote: humanEvidence } : {}),
    ...(confidenceBand ? { confidenceBand } : {}),
    ...(rec.suggestion_frequency != null ? { frequency: Number(rec.suggestion_frequency) } : {}),
    ...(lastSeen ? { lastSeen } : {}),
    ...(rec.suggestion_rank != null ? { rank: Number(rec.suggestion_rank) } : {}),
  };
}

/** Order suggestions by the offline ranking: rank ASC, frequency DESC, lastSeen DESC.
 *  Stable; presentation ORDERING ONLY (never auto-selects — ADR-0013). */
export function sortSuggestions(list: SuggestedAddress[]): SuggestedAddress[] {
  return list
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const ra = a.s.rank;
      const rb = b.s.rank;
      if (ra != null && rb != null && ra !== rb) return ra - rb;
      if (ra != null && rb == null) return -1;
      if (ra == null && rb != null) return 1;
      const fa = a.s.frequency ?? 0;
      const fb = b.s.frequency ?? 0;
      if (fa !== fb) return fb - fa;
      const la = a.s.lastSeen ?? '';
      const lb = b.s.lastSeen ?? '';
      if (la !== lb) return lb < la ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.s);
}

/* ============================================================
   AuditEvent row -> ActivityEvent (the activity feed).
   ============================================================ */

function formatOccurredAt(v: Date | string | undefined): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return typeof v === 'string' ? v : '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function rowToActivityEvent(rec: Row): ActivityEvent {
  const action = auditActionCodec.toName(
    rec.action_code == null ? undefined : Number(rec.action_code),
  );
  return {
    id: rec.id ?? '',
    caseId: rec.case_id ?? '',
    vrm: '',
    kind: auditActionToActivityKind(action),
    actor: rec.actor ?? 'System',
    timestamp: formatOccurredAt(rec.occurred_at),
    description: rec.name ?? rec.after ?? action ?? '',
  };
}

/* ============================================================
   Inbound-email row -> InboundEmail (Phase 8 triage).
   The two append-only choicesets' integer values are FROZEN (never renumber).
   ============================================================ */

const INBOUND_CATEGORY_BY_INT: Record<number, InboundCategory> = {
  100000000: 'receiving_work',
  100000001: 'query',
  100000002: 'other',
};
export const INBOUND_CATEGORY_TO_INT: Record<InboundCategory, number> = {
  receiving_work: 100000000,
  query: 100000001,
  other: 100000002,
};
const INBOUND_SUBTYPE_BY_INT: Record<number, InboundSubtype> = {
  100000000: 'existing_provider_instruction',
  100000001: 'existing_provider_audit',
  100000002: 'new_client_work',
  100000003: 'query_existing_work',
  100000004: 'query_new_enquiry',
  100000005: 'other',
  100000006: 'existing_provider_diminution',
};
export const INBOUND_SUBTYPE_TO_INT: Record<InboundSubtype, number> = {
  existing_provider_instruction: 100000000,
  existing_provider_audit: 100000001,
  new_client_work: 100000002,
  query_existing_work: 100000003,
  query_new_enquiry: 100000004,
  other: 100000005,
  existing_provider_diminution: 100000006,
};
export const TRIAGE_STATES: readonly TriageState[] = ['new', 'routed', 'actioned', 'dismissed'];
const CLASSIFIER_MODES: readonly ClassifierMode[] = ['deterministic', 'llm', 'human'];

/** The two DURABLE handled states a staff action sets — hidden from the active-first
 *  list/counts (work-todo-spike: email-management). 'new'/'routed' are active. */
export const HANDLED_TRIAGE_STATES: readonly TriageState[] = ['actioned', 'dismissed'];

/** True when `s` is one of the four canonical TriageState tokens (route input validation). */
export function isValidTriageState(s: unknown): s is TriageState {
  return typeof s === 'string' && (TRIAGE_STATES as readonly string[]).includes(s);
}

/** True when a row's triage_state is a durable handled state (actioned/dismissed). */
export function isHandledTriageState(s: string | null | undefined): boolean {
  return s === 'actioned' || s === 'dismissed';
}

/** category int -> name (exported for inboundEmailCounts tallying). */
export function inboundCategoryFromInt(v: number | null | undefined): InboundCategory | undefined {
  return v == null ? undefined : INBOUND_CATEGORY_BY_INT[v];
}

/** subtype int -> name (exported for the reclassify override-capture). */
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
  return {
    id: rec.id ?? '',
    name: rec.name ?? '',
    sourceMessageId: rec.source_message_id ?? '',
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
    bodyPreview: rec.body_preview ?? '',
    ...(rec.case_id ? { caseId: rec.case_id } : {}),
    ...(rec.work_provider_id ? { workProviderId: rec.work_provider_id } : {}),
    // The classifier's original suggestion (columns may be absent on a not-yet-migrated DB
    // — SELECT * simply omits them, so these stay undefined). work-todo-spike: suggested-tags.
    ...(rec.suggested_category_code != null && INBOUND_CATEGORY_BY_INT[rec.suggested_category_code]
      ? { suggestedCategory: INBOUND_CATEGORY_BY_INT[rec.suggested_category_code] }
      : {}),
    ...(rec.suggested_subtype_code != null && INBOUND_SUBTYPE_BY_INT[rec.suggested_subtype_code]
      ? { suggestedSubtype: INBOUND_SUBTYPE_BY_INT[rec.suggested_subtype_code] }
      : {}),
  };
}

/* ============================================================
   AI suggestion row -> AiSuggestion  (TKT-015 AI suggestion layer).
   review_state is a short String token (pending|accepted|rejected|superseded).
   ============================================================ */

const AI_REVIEW_STATES: readonly AiSuggestionReviewState[] = [
  'pending',
  'accepted',
  'rejected',
  'superseded',
];

/** True when `s` is one of the four canonical review-state tokens (route validation). */
export function isAiReviewState(s: unknown): s is AiSuggestionReviewState {
  return typeof s === 'string' && (AI_REVIEW_STATES as readonly string[]).includes(s);
}

/** Coerce a jsonb column to a JS value. node-postgres parses jsonb already; this is
 *  belt-and-braces for a path that hands back a JSON string. Never throws. */
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

/* ============================================================
   Pure helpers for the work-todo-spike features (testable; no DB).
   ============================================================ */

/** Active-first inbound list scope -> the SQL WHERE fragment over triage_state.
 *  'active' (default) hides handled rows; 'handled' shows only them; 'all' = no filter.
 *  Returns '' for 'all' (no clause). work-todo-spike: email-management. */
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

/** Tally ACTIVE inbound rows per category (+ untriaged='new') from {category_code, triage_state}
 *  rows. Handled rows (actioned/dismissed) are excluded so the count reflects outstanding work
 *  (work-todo-spike: amalgamated-dashboard / email-management). */
export function tallyActiveInboundCounts(
  rows: ReadonlyArray<{ category_code?: number | null; triage_state?: string | null }>,
): InboundCounts {
  const counts: InboundCounts = { receiving_work: 0, query: 0, other: 0, untriaged: 0 };
  for (const r of rows) {
    if (isHandledTriageState(r.triage_state)) continue; // handled = not active work
    const cat = inboundCategoryFromInt(r.category_code ?? undefined);
    if (cat) counts[cat] += 1;
    if ((r.triage_state ?? 'new') === 'new') counts.untriaged += 1;
  }
  return counts;
}

/** Parse the 3-digit sequence from a Box folder / Case-PO name that EXACTLY matches
 *  `<PRINCIPAL><YY><digits>` (case-insensitive). Returns 0 when it does not match. */
export function casePoSeqOfName(name: string, principal: string, yy: string): number {
  const prefix = `${principal}${yy}`.toUpperCase();
  const up = String(name ?? '').trim().toUpperCase();
  if (!up.startsWith(prefix)) return 0;
  const tail = up.slice(prefix.length);
  if (!/^[0-9]{3,}$/.test(tail)) return 0;
  return Number.parseInt(tail, 10);
}

/** The MAX sequence across a list of folder/Case-PO names for a (principal, year), or 0
 *  when none match. Used by the Case/PO allocator's Box fallback (work-todo-spike: case-po-gen). */
export function maxCasePoSeqFromNames(
  names: ReadonlyArray<string>,
  principal: string,
  yy: string,
): number {
  let max = 0;
  for (const n of names) {
    const seq = casePoSeqOfName(n, principal, yy);
    if (seq > max) max = seq;
  }
  return max;
}

/** Map the richer operator taxonomy tag onto a {category, subtype} pair
 *  (work-todo-spike: suggested-tags-and-folders). Returns undefined for an unknown tag. */
export function richTagToClassification(
  tag: string,
): { category: InboundCategory; subtype: InboundSubtype } | undefined {
  switch (tag) {
    case 'Inspection':
      return { category: 'receiving_work', subtype: 'existing_provider_instruction' };
    case 'New client work':
      return { category: 'receiving_work', subtype: 'new_client_work' };
    case 'Audit':
      return { category: 'receiving_work', subtype: 'existing_provider_audit' };
    case 'Diminution':
      return { category: 'receiving_work', subtype: 'existing_provider_diminution' };
    case 'Query':
      return { category: 'query', subtype: 'query_existing_work' };
    default:
      return undefined;
  }
}

/* ============================================================
   Pure windowing helpers (ported verbatim from dataverse-source.ts) — the
   dashboard + queue aggregates compute over the adapted Case[] using these.
   ============================================================ */

export function parseDmy(s?: string): Date | undefined {
  if (!s) return undefined;
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function isSameDay(a?: Date, b?: Date): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7; // Monday-anchored
  s.setDate(s.getDate() - dow);
  return s;
}

/** Filter an already-fetched Case[] for a queue (status membership; on-hold -> Held). */
export function filterQueue(all: Case[], name: QueueName): Case[] {
  if (!queueByName(name)) return [];
  return all.filter((c) => (c.onHold ? 'held' : statusToQueue(c.status)) === name);
}

/** The cases that need a human — all three queues, Held INCLUDED (an overdue held
 *  case must still surface in the aging hero / tallies). */
export function actionableCases(all: Case[]): Case[] {
  return [
    ...filterQueue(all, 'not-ready'),
    ...filterQueue(all, 'review'),
    ...filterQueue(all, 'held'),
  ];
}

/** Twin/merge terminal set: a finalised case is NOT an open twin/merge target.
 *  Mirrors dataverse-source's TERMINAL (eva_submitted, box_synced — `error` is still
 *  an open, actionable twin). `removed` (soft-remove) is also excluded: a removed case
 *  must never surface as a twin or be a merge target (work-todo-spike: delete-case). */
export const TWIN_TERMINAL: ReadonlySet<CaseStatus> = new Set<CaseStatus>([
  'eva_submitted',
  'box_synced',
  'removed',
]);

/* QUEUES kept referenced for downstream filter-builders / parity readers. */
void QUEUES;

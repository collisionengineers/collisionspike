/* ============================================================
   Collision Engineers — DATA SEAM: domain DTOs.

   The DataAccess interface (29 methods) + every input/result type.
   Lifted from mockup-app/src/data/types.ts.

   EXCLUDED:
     - cr1bd_* Record shapes (Dataverse physical schema — stay in the Code App)
     - GeneratedServices (Power Apps SDK boundary — stays in the Code App)
     - OperationResult / GetAllOptions / GeneratedTableService (SDK boundary)

   IMPORTS: from '../model/types' and '../model/queues' (NOT from '../mock/...').

   PURE TYPES ONLY. No values other than the all-false/zero fallback constants,
   no React, no I/O.
   ============================================================ */

import type {
  Case,
  CaseStatus,
  EvaFields,
  EvaFieldKey,
  Evidence,
  Provider,
  ProviderAutomationMode,
  ActivityEvent,
} from '../model/types';
import type {
  QueueName,
  LiveCounts,
  Throughput,
  AgingExceptions,
  PipelineStage,
  ReasonFacet,
} from '../model/queues';

/* ============================================================
   DataAccess — the repository the screens use.
   ============================================================ */

/**
 * Input to `createCase` — the manual-intake write path. Carries the reviewed 12
 * EVA fields, the Case-identity values (vrm / Case-PO), the initial status, and
 * the intake channel marker (always manual here). `writeProvenance` opts into
 * persisting one FieldLevelProvenance row per EVA field (source/confidence).
 */
export interface CreateCaseInput {
  /** The 12 reviewed EVA fields (camelCase keys). */
  evaFields: EvaFields;
  /** VRM (Case identity). */
  vrm: string;
  /** Provider reference / Case-PO (Case identity), if any. */
  casePo?: string;
  /** Provider display name + 4-char principal code, if known. */
  provider?: string;
  providerCode?: string;
  /** Insured / policyholder name (overview fact). */
  insuredName?: string;
  /** Provider's own case / claim number (their reference) — NOT our Case-PO. */
  providerReference?: string;
  /** Initial workflow status (e.g. 'ingested'). */
  status: CaseStatus;
  /** Free-text source mailbox/label for the manual channel. */
  sourceLabel?: string;
  /** Persist a FieldLevelProvenance row per EVA field when true. */
  writeProvenance?: boolean;
  /** Inspection decision to stamp on create (e.g. 'image_based' for an image-only
   *  case); omitted -> the back-fill derives it from the address text. */
  inspectionDecision?: Case['inspectionDecision'];
  /** Reason for an image-based decision — persisted as a case note when present. */
  inspectionDecisionReason?: string;
  /** Park the new case in the Held queue on creation (hold-by-default / per-case). */
  onHold?: boolean;
  /** Image-only intake (TKT-024): who the images came from. Persisted (with
   *  receivedOn) as a durable case note — there is no dedicated column. */
  receivedFrom?: string;
  /** Image-only intake (TKT-024): when the images arrived, DD/MM/YYYY
   *  (defaults to today in the form). Persisted in the same note. */
  receivedOn?: string;
}

/** The result of a Case write — the new row's id (GUID) the UI navigates to. */
export interface CreateCaseResult {
  /** The created Case's id (cr1bd_caseid GUID), used by `/case/:caseId`. */
  id: string;
}

/**
 * Patch body for `updateCase` — the human-correction write path for fields the
 * extractor can get wrong. Today only the VRM is editable (issue #12: the
 * registration mis-extraction safety net). It is a PARTIAL on purpose — future
 * correctable fields can be added without minting a new endpoint, and the server
 * patches only the keys present.
 */
export interface CaseUpdateInput {
  /** Corrected vehicle registration mark. Stored normalised (uppercase, no spaces). */
  vrm?: string;
  /**
   * Durable case-page edits (work-todo-spike: ui-changes/casepage): a partial map of
   * EVA field key -> new value (e.g. { dateOfLoss: '12/06/2026', vehicleModel: 'Audi A3' }).
   * Each changed field is persisted, audited, and gets a field_level_provenance row
   * (source 'staff' / manual). Date fields must be DD/MM/YYYY or ''; vatStatus ∈ {'',Yes,No};
   * mileageUnit ∈ {'',Miles,Km} — invalid values are rejected (400), not coerced.
   */
  evaFields?: Partial<Record<EvaFieldKey, string>>;
  /** ADR-0021 review-time case-type correction ('standard'/'' clears). */
  caseType?: string;
  /**
   * ADR-0022 transition seam — stamp the REAL Case/PO onto the case (the staff member
   * assigns the official number at EVA-add during the parallel-run; the cutover
   * renumber uses the same write). Shape-validated server-side; a number held by
   * another case returns 409 `case_po_in_use` (with the conflicting case id); ''
   * clears. Stored UPPER verbatim — never re-minted.
   */
  casePo?: string;
}

/* ----------  Superuser case soft-remove (work-todo-spike: ui-changes/delete-case)  ----------
   ADR-0017 + data-protection.md: a SOFT remove only — status -> terminal 'removed',
   PII anonymised, the case row + append-only audit trail KEPT. Works under the
   least-privilege staff grant (an UPDATE, never a hard DELETE). The Box folder is
   NEVER auto-deleted: `acknowledgeBoxFolderHandled` records the operator's intent in
   the audit `after` only (the human follows the archive runbook separately). */
export interface RemoveCaseInput {
  /** The archive folder has been handled separately (audit-only flag). */
  acknowledgeArchiveFolderHandled?: boolean;
  /** Legacy request field accepted for older clients. */
  acknowledgeBoxFolderHandled?: boolean;
  /** Free-text reason captured in the audit trail. */
  reason?: string;
}

export interface RemoveCaseResult {
  id: string;
  /** Always 'removed' on success. */
  status: CaseStatus;
  /** True when the case was ALREADY removed (idempotent re-remove). */
  alreadyRemoved: boolean;
  /** The case's Box archive deep link, surfaced so the operator can open + handle it. */
  boxFolderUrl?: string;
}

/* ----------  Superuser provider update (work-todo-spike: automation-mode + acme)  ----------
   PATCH /api/providers/{id}. principal_code is IMMUTABLE (not accepted here). */
export interface ProviderUpdateInput {
  /** New automation trust level (manual | review_auto | full_auto). */
  providerAutomationMode?: ProviderAutomationMode;
  /** New sender-domain list (replaces the stored list). */
  knownEmailDomains?: string[];
}

/* ----------  Case/PO allocator preview (work-todo-spike: box/case-po-gen)  ----------
   GET /api/cases/next-po?principal=XXX[&year=YY]. DB history is authoritative; a
   brand-new provider with NO DB rows falls back to the Box folder scan. PREVIEW only —
   the durable claim happens under the advisory-locked mint at case create. */
export interface NextCasePoResult {
  principal: string;
  yy: string;
  seq: string;
  /** The next sequence as an integer. */
  nextSeq: number;
  /** EVA (lowercase) form, e.g. "ccpy26051". */
  evaLower: string;
  /** Box folder / Case-PO (UPPERCASE) form, e.g. "CCPY26051". */
  boxUpper: string;
  /** Where the baseline came from: 'db' (DB history or empty), 'box' (Box fallback), or
   *  'floor' (the ADR-0022 cutover sequence floor outranked both — the real-world
   *  numbering continues past anything the post-reset DB has seen). */
  source: 'db' | 'box' | 'floor';
}

/* ----------  Amalgamated dashboard summary (work-todo-spike: amalgamated-dashboard)  ----------
   GET /api/dashboard — ONE call returning the case overview AND the inbound-email
   overview, so the compact cockpit needs a single request, not two. */
export interface DashboardSummary {
  liveCounts: LiveCounts;
  throughput: Throughput;
  queueCounts: Record<QueueName, number>;
  pipelineStages: PipelineStage[];
  reasonFacets: ReasonFacet[];
  agingExceptions: AgingExceptions;
  /** Active-first inbound triage counts (handled rows excluded). */
  inbound: InboundCounts;
}

/* ----------  Inspection-decision SAVE input (ADR-0013 confirm-path persist)  ----------
   The payload `saveInspectionDecision` persists when a reviewer EXPLICITLY confirms a
   pick on CaseDetail (picks a suggested location, or records Image Based Assessment with
   a reason). It captures the HUMAN-CONFIRMED decision + its plain-language provenance —
   it is NOT an auto-resolve and is NEVER written on load. ADR-0013 (BINDING): nothing
   here reintroduces a runtime address matcher; the row carries the decision a person made.
   `addressLines`/`postcode` are present only for a physical-address (manual/confirmed)
   decision; an image-based decision omits them and carries the reason in sourceNote. */
export interface InspectionDecisionInput {
  /** The decision the reviewer confirmed (e.g. 'manual' for a picked address,
   *  'image_based' for an explicit IBA, 'confirmed_physical' under required_address). */
  decisionMode: Case['inspectionDecision'];
  /** Origin of the CONFIRMED pick (-> cr1bd_sourcelabel). MUST NOT start with
   *  'suggested' (that prefix marks the unconfirmed corpus candidates that
   *  isSuggestedAddressRecord + the suggestions query key on). Confirm-path values:
   *  'confirmed:assist' (a live-assist pick the reviewer accepted), 'confirmed:corpus'
   *  (a catalogue row the reviewer accepted), 'manual', or 'image_based'. */
  sourceLabel: string;
  /** Plain-language provenance note (-> cr1bd_sourcenote): "Suggested from the photos",
   *  the image-based reason, etc. Free text the reviewer's action produced. */
  sourceNote: string;
  /** The confirmed address lines (physical-address decisions only; omitted for IBA). */
  addressLines?: string[];
  /** Normalised UK postcode for a physical-address decision (omitted for IBA). */
  postcode?: string;
}

/** Result of `saveInspectionDecision`. `persisted:false` is the honest no-op the seam
 *  returns when the InspectionAddress table is not yet wired — the confirm still updates
 *  the local working copy; only the durable write is deferred until deploy.
 *  `id` is the upserted row id when a write actually happened. */
export interface SaveInspectionDecisionResult {
  /** True only when the decision was durably written to the corpus table. */
  persisted: boolean;
  /** The upserted cr1bd_inspectionaddress row id, when a write happened. */
  id?: string;
}

/* ----------  Inspection-address SUGGESTIONS (always a suggestion)  ---------- */
export interface SuggestedAddress {
  /** Catalogue row id (cr1bd_inspectionaddressid GUID). */
  id: string;
  /** The candidate address as up-to-6 lines (already split; blanks trimmed). */
  lines: string[];
  /** Normalised UK postcode, if present. */
  postcode: string;
  /** Provider principal code this candidate is associated with, if known. */
  providerCode?: string;
  /** The location value (loc) the candidate was matched on, if known. */
  locValue?: string;
  /** Free-text evidence/provenance note (source + detail) — shown in a tooltip. */
  evidenceNote?: string;
  /** The confidence band carried in the source label (e.g. 'candidate_multiple_addresses'). */
  confidenceBand?: string;
  /* ---- Live-assist origin (Phase 4a — live-location-suggestion-assist.md). */
  source?: 'corpus' | 'assist';
  /** 0..1 confidence the assist returned — drives ORDERING only, NEVER auto-select. */
  confidence?: number;
  /** Short human label the assist returned — becomes the InspectionAddress display name on confirm. */
  label?: string;
  /** evidence_id of the primary photo this candidate's top clue came from, if any. */
  sourcePhotoRef?: string;
  /* ---- Offline-derived ranking metadata (ADR-0016 helper #2). */
  frequency?: number;
  lastSeen?: string;
  rank?: number;
  /* ---- Proximity ordering (ADR-0016 helper #2b; TKT-076) — ORDERING ONLY, never auto-selects. */
  /** Great-circle miles from the case's accident/claimant postcode to this site, when both geocode. */
  distanceMiles?: number;
  /** True when this row is a LABELLED global fallback (no provider-specific match) — not provider-scoped. */
  scopeFallback?: boolean;
}

/** Confirmed-vs-suggested split of the inspection-address corpus (Admin count). */
export interface InspectionAddressCounts {
  /** Confirmed reference rows (decisionMode confirmed_physical). */
  confirmed: number;
  /** Low-confidence suggestion rows (sourceLabel startswith 'suggested'). */
  suggested: number;
}

/* ----------  Box feature gates  ---------- */
export interface BoxGates {
  apiEnabled: boolean;
  folderAtIntakeEnabled: boolean;
  fileRequestEnabled: boolean;
  fileRequestTemplateConfigured: boolean;
}

/** All-false default — the honest "Box not switched on / unreadable" baseline. */
export const BOX_GATES_ALL_FALSE: BoxGates = {
  apiEnabled: false,
  folderAtIntakeEnabled: false,
  fileRequestEnabled: false,
  fileRequestTemplateConfigured: false,
};

/* ----------  Location-assist gate (Phase 4a)  ---------- */
export interface LocationAssistGate {
  assistEnabled: boolean;
  mapsEnabled: boolean;
  apiBaseConfigured: boolean;
  enabled: boolean;
  /** The AI vision-reasoning ESCALATION (TKT-078) — the deeper photo-based suggestion. Distinct
   *  from `enabled`; ships DARK (default false), operator-gated live flip (gated.md E2). */
  aiEnabled: boolean;
}

/** All-off default — the honest "location assist not switched on / unreadable" baseline. */
export const LOCATION_ASSIST_GATE_ALL_OFF: LocationAssistGate = {
  assistEnabled: false,
  mapsEnabled: false,
  apiBaseConfigured: false,
  enabled: false,
  aiEnabled: false,
};

/** Result of a manual staff case merge. */
export interface MergeCasesResult {
  /** The surviving (target) case id. */
  targetCaseId: string;
  /** Count of evidence rows reparented from source to target. */
  movedEvidence: number;
}

/* ============================================================
   AI suggestion layer (TKT-015) — observation-first, GATED.

   AI output lands here as a SUGGESTION (with model version + confidence), never
   as a silent mutation; promotion into evidence/case fields happens only on a
   human accept (fill-if-empty). Producers: image-analysis (TKT-016), reg-OCR
   (TKT-017), triage-category; the deferred total-loss VLM (TKT-018) reuses it.
   The whole surface is dark unless AI_ASSIST_ENABLED is on.
   ============================================================ */

/** Known suggestion kinds (open vocabulary — producers add more; the DB does not
 *  constrain the value, so the string fallback keeps new kinds type-compatible). */
export type AiSuggestionType =
  | 'image_role'
  | 'registration'
  | 'inspection_address'
  | 'triage_category'
  // TKT-016 staged image-analysis observations (all observation-only; only 'registration' and
  // 'inspection_address' have a fill-if-empty promote target — the rest are informational and
  // are accepted WITHOUT auto-promotion). See api/src/lib/image-analysis.ts.
  | 'vehicle_present'
  | 'same_vehicle'
  | 'background_text'
  | 'location_hint'
  | 'address_suggestion'
  // TKT-015 case/damage-assessment consumer (the generic generate route). All observation-only —
  // NONE has a fill-if-empty promote branch, so a human accept records/audits but never auto-writes
  // a case/evidence column. See api/src/lib/aoai-suggestions.ts.
  | 'damage_area'
  | 'damage_severity'
  | 'accident_summary'
  | (string & {});

/** Review lifecycle of a suggestion. `superseded` = a newer suggestion replaced it. */
export type AiSuggestionReviewState = 'pending' | 'accepted' | 'rejected' | 'superseded';

/** One AI suggestion/observation row (camelCase domain shape over `ai_suggestion`). */
export interface AiSuggestion {
  id: string;
  /** Subject anchors (any/all may be absent). */
  caseId?: string;
  evidenceId?: string;
  inboundEmailId?: string;
  suggestionType: AiSuggestionType;
  /** The proposed value — shape varies by suggestionType (e.g. { role } | { vrm }). */
  suggestedValue: unknown;
  /** Plain-language "why", shown to the reviewer. */
  rationale?: string;
  /** 0..1 model confidence (ordering/triage only — never auto-applies). */
  confidence?: number;
  /** e.g. 'gpt-4o-2024-08-06' / 'fast-alpr@1.2'; absent for a non-model suggestion. */
  modelVersion?: string;
  reviewState: AiSuggestionReviewState;
  createdAt: string;
  /** Entra oid/upn + time of the human review decision (present once reviewed). */
  reviewedBy?: string;
  reviewedAt?: string;
}

/** The human decision on a pending suggestion. */
export type AiSuggestionReviewDecision = 'accepted' | 'rejected';

/** Body for `POST /api/ai-suggestions/{id}/review`. */
export interface AiSuggestionReviewInput {
  decision: AiSuggestionReviewDecision;
}

/** Result of reviewing a suggestion. On accept the API MAY promote the value into
 *  the target field FILL-IF-EMPTY; `promoted`/`promotedField` report whether it did. */
export interface AiSuggestionReviewResult {
  id: string;
  reviewState: AiSuggestionReviewState;
  /** True when an accepted suggestion was promoted into its target field. */
  promoted: boolean;
  /** Which field was promoted into (e.g. 'evidence.image_role_code'), when promoted. */
  promotedField?: string;
}

/** Result of `POST /api/cases/{id}/ai-suggestions/generate`. When the gate is OFF
 *  or no model is configured this is the honest no-op `{ generated: 0, reason:
 *  'disabled' }`; when ON + configured it reports how many suggestions were minted.
 *  A zero-generated outcome ALWAYS carries an explicit `reason` (TKT-127: the SPA
 *  must be able to explain an empty result — never a silent nothing). */
export interface GenerateAiSuggestionsResult {
  generated: number;
  /** Why nothing was generated — 'disabled' (gate/model off), 'no_input' (the case has
   *  no usable notes to reason over), 'empty' (the model ran cleanly and had nothing to
   *  suggest), or 'error' (the model call / persist failed). Absent when generated > 0. */
  reason?: 'disabled' | 'no_input' | 'empty' | 'error';
}

/** The AI-assist feature gate, read by the SPA via GET /api/gates/ai-assist. */
export interface AiAssistGate {
  /** AI_ASSIST_ENABLED — the master switch the UI panel keys on. */
  enabled: boolean;
  /** A model endpoint + deployment are both configured (generate can do real work). */
  modelConfigured: boolean;
}

/** All-off default — the honest "AI assist not switched on / unreadable" baseline. */
export const AI_ASSIST_GATE_ALL_OFF: AiAssistGate = {
  enabled: false,
  modelConfigured: false,
};

/** One turn in the AI chat helper transcript (TKT-060). */
export interface AssistantChatTurn {
  role: 'user' | 'assistant';
  content: string;
}
/** A write the assistant PROPOSED (TKT-111). The model never performs the write — the SPA
 *  renders a confirmation card over independently re-fetched state, and only a human confirm
 *  issues the POST to `path`. Present only while the write tier gate is on. */
export interface ProposedAction {
  /** the write capability name (registry, ADR-0025), e.g. 'set_on_hold'. */
  capability: string;
  /** short human title for the confirm card, e.g. 'Hold / release a case'. */
  title: string;
  /** the existing Data API route the confirmed action hits. */
  method: string;
  /** the resolved route path (placeholders substituted), e.g. 'cases/abc/hold'. */
  path: string;
  /** the request body for the confirmed write (path params stripped). */
  body: Record<string, unknown>;
  /** the full validated params (path + body) — for the card to reason about the target. */
  params: Record<string, unknown>;
}

/** The assistant's reply to POST /api/assistant/chat. */
export interface AssistantReply {
  reply: string;
  /** Names of the read-only tools the assistant used (for a subtle "looked up …" hint). */
  toolsUsed?: string[];
  /** True when the gate is off (the SPA hides the drawer anyway, but be defensive). */
  disabled?: boolean;
  /** True when the server hit an error and returned a graceful apology. */
  error?: boolean;
  /** Actions the assistant PROPOSED this turn (TKT-111 write tier). The SPA renders a confirm
   *  card for each; nothing is written until the user confirms. Absent while the tier is off. */
  proposals?: ProposedAction[];
}

/** The Outlook-move gate, read by the SPA via GET /api/gates/outlook-move (TKT-054 /
 *  020726 E6). `enabled` is the actionable state the "Suggested action" button keys on:
 *  OUTLOOK_MOVE_ENABLED is on AND the move queue is configured. While false the SPA
 *  renders the suggestion as display-only text. */
export interface OutlookMoveGate {
  enabled: boolean;
}

/** All-off default — the honest "Outlook filing not switched on / unreadable" baseline. */
export const OUTLOOK_MOVE_GATE_ALL_OFF: OutlookMoveGate = {
  enabled: false,
};

/* ============================================================
   Phase 8 — Inbox / Triage domain types (cr1bd_inboundemail).
   ============================================================ */

/** cr1bd_inboundcategory option names. APPEND-ONLY (collisionspike TKT-029/037/038):
 *  the original receiving_work | query | other are joined by `billing` (an invoice/fee
 *  request — TKT-037) and `non_actionable` (a case-summary digest or bare acknowledgement
 *  — TKT-029/038; distinct from `other`, which is genuinely unidentified). The
 *  Enquiries-vs-Case-Queries split (TKT-034) is carried by the two `query` subtypes.
 *
 *  `case_update` and `cancellation` (append-only, taxonomy v2 — rules-engine-v2 Phase 2,
 *  ADR-0019/ADR-0015's 2026-07-02 amendment) are the two NEW top-level categories the
 *  triage-policy module (`domain/triage-policy.ts`) can route an inbound to: `case_update`
 *  is an inbound belonging to an existing open Case (attach-to-case, suggest-first —
 *  CONTEXT.md "Case Update"); `cancellation` is a claim/case reported cancelled or closed
 *  (a staff-confirmed close/hold proposal, never automatic — CONTEXT.md "Cancellation").
 *  Per the Phase-2 deploy order, the DDL/choicesets land before the engine tag that emits
 *  these live — existing rows keep their v1 codes (no backfill).
 *
 *  `pre_instruction` (append-only, taxonomy v3 — TKT-084, operator-signed-off 2026-07-09)
 *  is directions sent BEFORE the official instruction ("when you receive an instruction
 *  from X please…"): no case is minted; the row is held and correlated onto the case the
 *  later instruction mints (suggest-first, gated TRIAGE_PRE_INSTRUCTION_ENABLED). */
export type InboundCategory =
  | 'receiving_work'
  | 'query'
  | 'billing'
  | 'non_actionable'
  | 'other'
  | 'case_update'
  | 'cancellation'
  | 'pre_instruction';

/** Every {@link InboundCategory} name, in declaration/choice-set order — the runtime
 *  companion to the type union (mirrors `CASE_STATUSES` in contracts/case-status.ts),
 *  used by the codec parity test + anywhere a caller needs to enumerate/validate. */
export const INBOUND_CATEGORIES: readonly InboundCategory[] = [
  'receiving_work',
  'query',
  'billing',
  'non_actionable',
  'other',
  'case_update',
  'cancellation',
  'pre_instruction',
];

/** cr1bd_inboundsubtype option names. `existing_provider_diminution` (append-only,
 *  work-todo-spike: suggested-tags-and-folders) is the staff-applicable Diminution tag
 *  in the richer Inspection/Audit/Diminution/Query taxonomy; the deterministic classifier
 *  may not emit it yet (staff set it via the reclassify route). `billing_request`,
 *  `case_summary` and `acknowledgement` are the deterministic subtypes for the new
 *  top-level categories above (TKT-029/037/038).
 *
 *  `images_received`, `cancellation_notice` and `update_general` (append-only, taxonomy
 *  v2 — rules-engine-v2 Phase 2) are the subtypes for the two new categories above:
 *  `images_received` is photos with no other new information (paired with `case_update`
 *  when matched, or standalone under the unmatched-images routing lane — ADR-0015 §5);
 *  `cancellation_notice` and `update_general` are `cancellation`'s and `case_update`'s
 *  default subtypes respectively.
 *
 *  `payment_remittance` and `pre_instruction_directions` (append-only, taxonomy v3 —
 *  TKT-105/120 + TKT-084): `payment_remittance` is an INBOUND payment notification
 *  (a remittance advice / transfer notice — the mirror-image of `billing_request`,
 *  filed under `billing`); `pre_instruction_directions` is `pre_instruction`'s only
 *  subtype (directions held for the later official instruction). */
export type InboundSubtype =
  | 'existing_provider_instruction'
  | 'existing_provider_audit'
  | 'existing_provider_diminution'
  | 'new_client_work'
  | 'query_existing_work'
  | 'query_new_enquiry'
  | 'billing_request'
  | 'case_summary'
  | 'acknowledgement'
  | 'other'
  | 'images_received'
  | 'cancellation_notice'
  | 'update_general'
  | 'payment_remittance'
  | 'pre_instruction_directions';

/** Every {@link InboundSubtype} name, in declaration/choice-set order — see
 *  {@link INBOUND_CATEGORIES}. */
export const INBOUND_SUBTYPES: readonly InboundSubtype[] = [
  'existing_provider_instruction',
  'existing_provider_audit',
  'existing_provider_diminution',
  'new_client_work',
  'query_existing_work',
  'query_new_enquiry',
  'billing_request',
  'case_summary',
  'acknowledgement',
  'other',
  'images_received',
  'cancellation_notice',
  'update_general',
  'payment_remittance',
  'pre_instruction_directions',
];

/** cr1bd_triagestate: the row's lifecycle in the triage queue. */
export type TriageState = 'new' | 'routed' | 'actioned' | 'dismissed';

/** cr1bd_classifiermode: which engine settled the label. */
export type ClassifierMode = 'deterministic' | 'llm' | 'human';

/** One inbound-email triage row. */
export interface InboundEmail {
  id: string;
  name: string;
  sourceMessageId: string;
  subject: string;
  fromAddress: string;
  senderDomain: string;
  sourceMailbox: string;
  receivedOn: string;
  hasAttachments: boolean;
  category: InboundCategory;
  subtype: InboundSubtype;
  confidence: number;
  classifierMode: ClassifierMode;
  signals: string[];
  triageState: TriageState;
  bodyVrm: string;
  bodyCaseref: string;
  /** Provider job/claim reference the engine surfaces (rules-engine-v2 Phase 0 pass-
   *  through of the vendored engine's existing `_job_reference` detector). Persisted
   *  from the Phase-2 DDL on (`inbound_email.body_jobref`); absent on rows ingested
   *  before that column existed — never backfilled. Feeds the triage-policy ref-gate
   *  (case_po match beats job_ref beats vrm) alongside bodyCaseref/bodyVrm. */
  bodyJobref?: string;
  /** Graph conversationId, captured for LOCAL thread correlation only (Postgres-side;
   *  Graph's own `$filter=conversationId` is not contractually documented — ADR-0019 /
   *  rules-engine-v2 Phase 2). Persisted from the Phase-2 DDL on
   *  (`inbound_email.conversation_id`); absent on older rows. A SECONDARY signal only —
   *  it never creates a case match by itself (see triage-policy.ts). */
  conversationId?: string;
  bodyPreview: string;
  caseId?: string;
  /** The linked case's human-readable Case/PO (e.g. CCPY26050). Present only when the
   *  row is case-linked AND the serving query joined `case_` (the inbox list does —
   *  TKT-054 status cell "Case created / Linked to case · <Case/PO>"). */
  casePo?: string;
  /** TKT-093 — the Case/PO of a PENDING "attach to this open case" suggestion for a
   *  NOT-yet-linked email (from `ai_suggestion` case_link). Surfaces the suggest-attach
   *  affordance in the inbox LIST (a "may belong to · <Case/PO>" hint), not only inside
   *  the opened email. Absent when the row is already linked or has no pending suggestion.
   *  Present only when the serving query joins the suggestion (the inbox list does). */
  linkSuggestionCasePo?: string;
  workProviderId?: string;
  /** The classifier's ORIGINAL suggestion, kept distinct from category/subtype (the
   *  chosen value) so a staff override is visible (work-todo-spike: suggested-tags). */
  suggestedCategory?: InboundCategory;
  suggestedSubtype?: InboundSubtype;
  /** Outlook filing lifecycle (TKT-054 / 020726 E6, gated by OUTLOOK_MOVE_ENABLED):
   *  absent = never attempted; queued = staff clicked, mover pending; moved = filed in
   *  the shared mailbox; failed = the mover gave up (retryable). */
  outlookMoveState?: OutlookMoveState;
  /** The Outlook folder path involved: the queued/actual destination. */
  outlookMovedFolder?: string;
  /** When the terminal moved/failed outcome was recorded (ISO). */
  outlookMovedAt?: string;
}

/** Outlook filing lifecycle states (inbound_email.outlook_move_state). */
export type OutlookMoveState = 'queued' | 'moved' | 'failed';
export const OUTLOOK_MOVE_STATES: readonly OutlookMoveState[] = ['queued', 'moved', 'failed'];

/** Which slice of the triage queue to load. `active` (default) hides handled rows
 *  (actioned/dismissed); `handled` shows only those; `all` shows everything. */
export type InboundView = 'active' | 'handled' | 'all';

/** Facet for `inboundEmails(facet?)`. */
export interface InboundFacet {
  category?: InboundCategory;
  subtype?: InboundSubtype;
  /** Active-first list scope (default 'active'). work-todo-spike: email-management. */
  view?: InboundView;
}

/** Body for `PATCH /api/inbound/{id}/classification` — the staff reclassify/override
 *  (work-todo-spike: suggested-tags-and-folders). Supply EITHER an explicit
 *  category/subtype OR a `tag` from the richer Inspection/New client work/Audit/Diminution/Query
 *  taxonomy (mapped server-side onto category+subtype). `reason` is optional override copy. */
export interface ReclassifyInboundInput {
  category?: InboundCategory;
  subtype?: InboundSubtype;
  /** Richer-taxonomy shortcut, mapped to category+subtype server-side. */
  tag?: 'Inspection' | 'New client work' | 'Audit' | 'Diminution' | 'Query';
  reason?: string;
}

/** Per-category triage counts. `case_update`/`cancellation` (taxonomy v2, rules-engine-v2
 *  Phase 2) join the set — added here so this stays an EXHAUSTIVE map over
 *  {@link InboundCategory} (a missing key is a compile error, not a silent gap); a
 *  consumer that only tallies the v1 five buckets today may ignore the two new fields
 *  until it is ready to surface them (Phase 5: "SPA filters/metrics must state how
 *  mixed-vintage rows display"). */
export interface InboundCounts {
  receiving_work: number;
  query: number;
  billing: number;
  non_actionable: number;
  other: number;
  case_update: number;
  cancellation: number;
  /** Taxonomy v3 (TKT-084) — pre-instruction directions held for a later instruction. */
  pre_instruction: number;
  untriaged: number;
}

/** Honest-zero default. */
export const INBOUND_COUNTS_ZERO: InboundCounts = {
  receiving_work: 0,
  query: 0,
  billing: 0,
  non_actionable: 0,
  other: 0,
  case_update: 0,
  cancellation: 0,
  pre_instruction: 0,
  untriaged: 0,
};

/* ============================================================
   DataAccess — 29-method repository interface (the frozen API contract).
   ============================================================ */

export interface DataAccess {
  /* ----- Cases ----- */
  caseById(id: string): Promise<Case | undefined>;
  createCase(input: CreateCaseInput): Promise<CreateCaseResult>;
  /**
   * Patch an existing case (human correction — e.g. the editable VRM, issue #12).
   * `PATCH /api/cases/{id}` with a partial body → 200 + the updated Case JSON.
   * A mutation, NOT safe()-wrapped: a failed correction must surface, never be
   * swallowed (a silent failure would let the operator believe a bad VRM was fixed).
   */
  updateCase(id: string, patch: CaseUpdateInput): Promise<Case>;
  casesForQueue(name: QueueName, now?: Date): Promise<Case[]>;
  openVrmTwins(vrm: string, excludeCaseId?: string): Promise<Case[]>;
  setOnHold(caseId: string, onHold: boolean): Promise<void>;
  mergeCandidates(caseId: string): Promise<Case[]>;
  mergeCases(sourceCaseId: string, targetCaseId: string): Promise<MergeCasesResult>;

  /* ----- Evidence ----- */
  imagesForCase(caseId: string): Promise<Evidence[]>;

  /* ----- Providers (corpus) ----- */
  providers(): Promise<Provider[]>;
  providerByCode(code: string): Promise<Provider | undefined>;

  /* ----- Inspection-address suggestions (corpus; ALWAYS suggestions) -----
     No `q` → the ranked, provider-scoped SHORTLIST; `q` → a search across the whole
     corpus (so staff can still reach any of the ~2,200 addresses). TKT-062. */
  inspectionAddressSuggestions(caseId: string, q?: string): Promise<SuggestedAddress[]>;
  inspectionAddressCounts(): Promise<InspectionAddressCounts>;
  saveInspectionDecision(
    caseId: string,
    decision: InspectionDecisionInput,
  ): Promise<SaveInspectionDecisionResult>;

  /* ----- Dashboard / queue aggregates ----- */
  liveCounts(now?: Date): Promise<LiveCounts>;
  throughput(now?: Date): Promise<Throughput>;
  agingExceptions(now?: Date): Promise<AgingExceptions>;
  queueCounts(now?: Date): Promise<Record<QueueName, number>>;
  reasonCounts(now?: Date): Promise<ReasonFacet[]>;
  pipelineStages(): Promise<PipelineStage[]>;

  /* ----- Activity feed ----- */
  recentActivity(): Promise<ActivityEvent[]>;
  activityForCase(caseId: string): Promise<ActivityEvent[]>;

  /* ----- Box feature gates ----- */
  getBoxGates(): Promise<BoxGates>;
  getBoxFileRequestTemplateId(): Promise<string | undefined>;

  /* ----- Location-assist gate (Phase 4a) ----- */
  getLocationAssistGate(): Promise<LocationAssistGate>;

  /* ----- App intake preferences ----- */
  getHoldNewCasesDefault(): Promise<boolean>;
  setHoldNewCasesDefault(value: boolean): Promise<void>;

  /* ----- Inbox / Triage (Phase 8 — cr1bd_inboundemail) ----- */
  inboundEmails(facet?: InboundFacet): Promise<InboundEmail[]>;
  inboundEmailCounts(): Promise<InboundCounts>;
  setTriageState(id: string, state: TriageState): Promise<void>;
}

// Note: ActionReason is available via the model barrel (re-exported from model/types.ts)

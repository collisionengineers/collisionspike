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
  Evidence,
  Provider,
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
}

/** The result of a Case write — the new row's id (GUID) the UI navigates to. */
export interface CreateCaseResult {
  /** The created Case's id (cr1bd_caseid GUID), used by `/case/:caseId`. */
  id: string;
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
  embedEnabled: boolean;
  metadataEnabled: boolean;
  fileRequestTemplateConfigured: boolean;
}

/** All-false default — the honest "Box not switched on / unreadable" baseline. */
export const BOX_GATES_ALL_FALSE: BoxGates = {
  apiEnabled: false,
  folderAtIntakeEnabled: false,
  fileRequestEnabled: false,
  embedEnabled: false,
  metadataEnabled: false,
  fileRequestTemplateConfigured: false,
};

/* ----------  Location-assist gate (Phase 4a)  ---------- */
export interface LocationAssistGate {
  assistEnabled: boolean;
  mapsEnabled: boolean;
  apiBaseConfigured: boolean;
  enabled: boolean;
}

/** All-off default — the honest "location assist not switched on / unreadable" baseline. */
export const LOCATION_ASSIST_GATE_ALL_OFF: LocationAssistGate = {
  assistEnabled: false,
  mapsEnabled: false,
  apiBaseConfigured: false,
  enabled: false,
};

/** Result of a manual staff case merge. */
export interface MergeCasesResult {
  /** The surviving (target) case id. */
  targetCaseId: string;
  /** Count of evidence rows reparented from source to target. */
  movedEvidence: number;
}

/* ============================================================
   Phase 8 — Inbox / Triage domain types (cr1bd_inboundemail).
   ============================================================ */

/** cr1bd_inboundcategory option names. */
export type InboundCategory = 'receiving_work' | 'query' | 'other';

/** cr1bd_inboundsubtype option names. */
export type InboundSubtype =
  | 'existing_provider_instruction'
  | 'existing_provider_audit'
  | 'new_client_work'
  | 'query_existing_work'
  | 'query_new_enquiry'
  | 'other';

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
  bodyPreview: string;
  caseId?: string;
  workProviderId?: string;
}

/** Facet for `inboundEmails(facet?)`. */
export interface InboundFacet {
  category?: InboundCategory;
  subtype?: InboundSubtype;
}

/** Per-category triage counts. */
export interface InboundCounts {
  receiving_work: number;
  query: number;
  other: number;
  untriaged: number;
}

/** Honest-zero default. */
export const INBOUND_COUNTS_ZERO: InboundCounts = {
  receiving_work: 0,
  query: 0,
  other: 0,
  untriaged: 0,
};

/* ============================================================
   DataAccess — 29-method repository interface (the frozen API contract).
   ============================================================ */

export interface DataAccess {
  /* ----- Cases ----- */
  caseById(id: string): Promise<Case | undefined>;
  createCase(input: CreateCaseInput): Promise<CreateCaseResult>;
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

  /* ----- Inspection-address suggestions (corpus; ALWAYS suggestions) ----- */
  inspectionAddressSuggestions(caseId: string): Promise<SuggestedAddress[]>;
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

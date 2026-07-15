/* ============================================================
   Collision Engineers — M1 domain model types.

   Shaped like the eventual Dataverse / EVA-contract model (see
   docs/architecture/data-model.md + the eva-sentry-api skill), but
   trimmed to what the UI prototype needs. DOMAIN TYPES ONLY — no live shapes.
   ============================================================ */

/* ----------  Case status state machine  ----------
   CANONICAL source is the framework-free contract; re-exported here so the
   screens keep importing `CaseStatus` from '../mock' unchanged. The Dataverse
   `cr1bd_casestatus` choice set reconciles 1:1 against this same union. */
export type { CaseStatus } from '../contracts/case-status';
import type { CaseStatus } from '../contracts/case-status';

/* ----------  Provenance & review state  ---------- */
// sourceType ∈ data-model field-level provenance set (cloud_vision → azure_vision).
export type ProvenanceSourceType =
  | 'staff'
  | 'pdf_extraction'
  | 'email_text'
  | 'corpus'
  | 'ai'
  | 'dvla_dvsa'
  | 'document_ai'
  | 'azure_vision'
  | 'web_lookup'
  | 'whatsapp'
  | 'manual_upload'
  | 'unknown';

// Compact UI marker shown in the provenance badge.
export type ProvenanceMarker = 'PDF' | 'Corpus' | 'AI' | 'Web' | 'Staff';

export interface FieldProvenance {
  sourceType: ProvenanceSourceType;
  /** Human-readable origin, e.g. "Instruction PDF p.2" or "Principals corpus". */
  sourceLabel: string;
  /** Optional 0..1 confidence (parser / AI fields). Omit for deterministic sources. */
  confidence?: number;
}

export type ReviewState = 'not_required' | 'needs_review' | 'reviewed' | 'conflict';

/** A retained value that disagrees with the currently saved field value. The
 * saved value remains authoritative until a staff member resolves the conflict. */
export interface EvaFieldConflict {
  candidateValue: string;
  provenance: FieldProvenance;
}

/** One EVA-relevant field: its value plus where it came from and its review state. */
export interface EvaField {
  value: string;
  provenance: FieldProvenance;
  reviewState: ReviewState;
  /** Unresolved alternatives, kept separate so they can never replace `value`
   * merely by being included in a read response. */
  conflicts?: EvaFieldConflict[];
}

/* ----------  The 12-field EVA contract  ----------
   Order + formats per the eva-sentry-api skill / Final Format Example 02.json:
   1 Work Provider (non-empty) · 2 Vehicle Model · 3 Claimant Name ·
   4 Claimant Telephone · 5 Claimant Email · 6 Date of Incident (DD/MM/YYYY) ·
   7 Date of Instruction (DD/MM/YYYY) · 8 Accident Circumstances ·
   9 Inspection Address (6 newline-separated lines OR "Image Based Assessment") ·
   10 VAT Status ∈ {"",Yes,No} · 11 Mileage · 12 Mileage Unit ∈ {"",Miles,Km}.

   (Engineer allocation is NOT an EVA submission field — it is left blank and
   assigned inside EVA AFTER submission, so it is excluded from the contract.)

   CANONICAL field order, descriptor shape, payload keys, and the VatStatus /
   MileageUnit enums live in '../contracts/eva-export'; re-exported here so the
   prototype keeps a single source of truth shared with the EVA serializer. */
export type { VatStatus, MileageUnit, EvaFieldKey, EvaFieldDescriptor } from '../contracts/eva-export';
export { EVA_FIELD_ORDER } from '../contracts/eva-export';
import type { VatStatus, MileageUnit } from '../contracts/eva-export';

export interface EvaFields {
  workProvider: EvaField; // 1
  vehicleModel: EvaField; // 2
  claimantName: EvaField; // 3
  claimantTelephone: EvaField; // 4
  claimantEmail: EvaField; // 5
  dateOfLoss: EvaField; // 6  DD/MM/YYYY
  dateOfInstruction: EvaField; // 7  DD/MM/YYYY
  accidentCircumstances: EvaField; // 8
  /** value holds all 6 lines newline-separated, or "Image Based Assessment". */
  inspectionAddress: EvaField; // 9
  vatStatus: EvaField & { value: VatStatus }; // 10
  mileage: EvaField; // 11
  mileageUnit: EvaField & { value: MileageUnit }; // 12
}

/* `EvaFieldKey`, `EvaFieldDescriptor`, and the ordered `EVA_FIELD_ORDER` are
   re-exported from '../contracts/eva-export' above — the single canonical list
   the UI iterates and the EVA serializer projects. `keyof EvaFields` here equals
   the contract's `EvaFieldKey` 1:1 (same 12 camelCase keys). */

/* ----------  Evidence (mirrors collisioncc image-rules)  ---------- */
export type EvidenceKind =
  | 'image'
  | 'video'
  | 'instruction'
  | 'email'
  | 'valuation'
  | 'eva_payload'
  // ADR-0014/ADR-0021: a THIRD-PARTY engineer's ORIGINAL report on an audit case,
  // stored for comparison — never overlaid (choice_evidence_kind 100000007).
  | 'engineer_report';

// CANONICAL ImageRole lives in '../contracts/image-rules'; re-export for one
// source, and import it locally so the Evidence interface can reference it.
export type { ImageRole } from '../contracts/image-rules';
import type { ImageRole } from '../contracts/image-rules';

export interface Evidence {
  id: string;
  /** Display name, e.g. "IMG_0421.jpg" or "Instruction.pdf". */
  fileName: string;
  kind: EvidenceKind;
  imageRole: ImageRole;
  /** OCR-assisted: does the image's OCR text contain the case VRM? */
  registrationVisible: boolean;
  /** Has staff accepted this image into the EVA upload set? */
  acceptedForEva: boolean;
  /** Flagged unusable (e.g. a person's reflection is visible). */
  excluded?: boolean;
  exclusionReason?: string;
  /** An automatic exclusion that staff can review and recover from on the case page. */
  reviewRequired?: boolean;
  /** The current exclusion was an explicit staff decision, rather than the initial capture hold. */
  excludedByStaff?: boolean;
  /** The vision classifier saw a person's reflection in this photo (TKT-123).
   *  ADVISORY flag only — exclusion stays a staff decision. */
  personReflection?: boolean;
  /** A reviewer dismissed the reflection warning (persists across reload). */
  reflectionDismissed?: boolean;
  /** Optional placeholder thumbnail tint (no real image bytes in the mock). */
  thumbColor?: string;
  /** Where it came from (message / upload label). */
  sourceLabel: string;
  /** Box file id for this artifact (one-way mirror; absent until archived to Box). */
  boxFileId?: string;
  /** Box per-file shared-link URL — a direct "open in Box" link for this artifact. */
  boxFileUrl?: string;
}

/* ----------  Chaser & Note  ---------- */
export type ChaserChannel = 'email' | 'whatsapp';
export type ChaserStatus = 'drafted' | 'sent' | 'responded' | 'overdue';
export type ChaserTargetType = 'image_source' | 'repairer' | 'work_provider';

export interface Chaser {
  id: string;
  targetType: ChaserTargetType;
  targetName: string;
  channel: ChaserChannel;
  templateUsed: string;
  status: ChaserStatus;
  /** What's being chased, for the queue summary. */
  summary: string;
  createdAt: string; // DD/MM/YYYY
  sentBy?: string;
  sentAt?: string; // DD/MM/YYYY
}

export interface Note {
  id: string;
  author: string;
  timestamp: string; // DD/MM/YYYY HH:mm
  text: string;
}

/* ----------  Overview-only facts (imported, must NOT drive workflow)  ---------- */
export interface OverviewFacts {
  insuredName?: string;
  claimantName?: string;
  thirdPartyName?: string;
  claimNumber?: string;
  policyReference?: string;
  incidentDate?: string; // DD/MM/YYYY
  claimType?: string;
  insurerName?: string;
  repairerName?: string;
}

/* ----------  Intake channel  ---------- */
/** How a Case entered the system. Append-only, mirroring choice_intake_channel_kind:
 *  `provider_api` = the machine-to-machine channel (ADR-0020); `retro` = a case
 *  reconstructed after the fact from the Box archive / Outlook search (ADR-0022). */
export type IntakeChannelKind = 'email' | 'whatsapp' | 'provider_api' | 'retro';
export type IntakeChannelMode = 'auto' | 'manual';

/** Display labels for the channel chips — one source so a render site can never
 *  silently mislabel a newer channel as 'Email' again. */
export const INTAKE_CHANNEL_LABELS: Readonly<Record<IntakeChannelKind, string>> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  provider_api: 'Provider API',
  retro: 'Retro (reconstructed)',
};
export interface IntakeChannel {
  kind: IntakeChannelKind;
  mode: IntakeChannelMode;
  /** Shared inbox / WhatsApp group that the item arrived on. */
  sourceMailbox: string;
}

/* ----------  Provider (corpus record)  ----------
   `inspectionLocationPolicy` + `providerAutomationMode` use the BINDING enums
   (data-model.md / provider-corpus.md / inspection-address.md), re-exported from
   the domain layer so there is one source of truth shared with the policy gate
   and the Dataverse choice sets (cr1bd_inspectionlocationpolicy /
   cr1bd_providerautomationmode). This SUPERSEDES the stale prototype literals
   ('physical'|'image_based'|'mixed') — `prefer_address` is the unknown default. */
export type { InspectionLocationPolicy } from '../domain/address-policy';
import type { InspectionLocationPolicy } from '../domain/address-policy';

/** How much automation a provider's intake is trusted with (only `review_auto`
 *  honored in M1). Mirrors the cr1bd_providerautomationmode choice set 1:1. */
export type ProviderAutomationMode = 'manual' | 'review_auto' | 'full_auto';

export interface Provider {
  id: string;
  displayName: string;
  /** One code: lowercase = EVA code, UPPERCASE = Box code & Case/PO. */
  principalCode: string;
  defaultMailbox: string;
  knownEmailDomains: string[];
  /** Binding policy enum (prefer_address = unknown-provider default). */
  inspectionLocationPolicy: InspectionLocationPolicy;
  /** Automation trust level; only `review_auto` is honored in M1. */
  providerAutomationMode: ProviderAutomationMode;
  active: boolean;
}

/* ----------  Activity feed event  ---------- */
export type ActivityKind =
  | 'intake'
  | 'parse'
  | 'classify'
  | 'review'
  | 'enrich'
  | 'chaser'
  | 'eva_submit'
  | 'box_sync'
  | 'status_change'
  | 'note'
  | 'dedup';

export interface ActivityEvent {
  id: string;
  caseId: string;
  /** Denormalised for feed rendering. */
  vrm: string;
  kind: ActivityKind;
  actor: string;
  timestamp: string; // DD/MM/YYYY HH:mm
  /** PRIMARY line — always plain English (the ONE audit-action label map,
   *  api/src/lib/last-activity.ts). Never a raw enum/snake_case/GUID (TKT-134). */
  description: string;
  /** Optional plain-language specifics (rendered as a secondary line). Only present
   *  when the underlying audit summary is human-safe — an engineering-shaped summary
   *  moves to `technical` instead (TKT-134). */
  detail?: string;
  /** Raw audit summary/payload for support — rendered ONLY behind an expandable
   *  "technical details" affordance, never on a primary line (TKT-134). */
  technical?: string;
}

/* ----------  Missing-item (the readiness "Missing" list)  ---------- */
export type MissingItemKind =
  | 'required_field'
  | 'image_rule'
  | 'inspection_address'
  | 'source_evidence'
  | 'conflict';

export interface MissingItem {
  kind: MissingItemKind;
  label: string;
}

/* ----------  Needs-action reason (drives the Needs-action facet chips)  ----------
   Why a PERSON must act on a case. Only meaningful for needs-action cases. */
export type ActionReason =
  | 'missing_images'
  | 'missing_instructions'
  | 'duplicate'
  | 'conflict'
  | 'needs_review';

/* ----------  Last activity (queue-row recency line, TKT-117)  ----------
   Computed SERVER-side from the case's audit trail + notes + chase log so the
   plain-English descriptor lives in ONE place (api/src/lib/last-activity.ts) and
   the SPA renders it verbatim — never a raw enum/status code. */
export interface CaseLastActivity {
  /** Plain-English descriptor, e.g. "Images received", "Chased", "Note added by Alex". */
  label: string;
  /** When it happened, DD/MM/YYYY. */
  date: string;
}

// Case work TYPE (ADR-0021: standard / audit / audit_total_loss / diminution) —
// canonical union + re-export live in domain/case-type.ts (already on the main
// barrel via domain/index); imported type-only here for the Case field.
import type { CaseWorkType } from '../domain/case-type';
import type { MileageOutcomeStatus, VehicleLookupStatus } from '../contracts/vehicle-data';

export interface VehicleLookupSummary {
  runId?: string;
  status: VehicleLookupStatus;
  mileageStatus?: MileageOutcomeStatus;
  mileageMethod?: string;
  warning?: string;
  retryable: boolean;
  attemptedAt?: string;
}

/* ----------  Case (the live work item)  ---------- */
export interface Case {
  id: string;
  /** Optimistic-concurrency token returned by a single-case read/write. Queue/list
   *  payloads may omit it; an edit session must have one before it can save. */
  version?: string;
  vrm: string;
  /** Entered at EVA submit; absent until then. */
  casePo?: string;
  provider: string; // displayName (matches a Provider.displayName)
  providerCode: string; // principalCode
  /** The provider's operator-designated inspection-location policy (ADR-0016), joined onto the
   *  case. Surfaced in the address flow as an informational default (e.g. an "Image Based
   *  Assessment (provider default)" chip) — NEVER auto-applied (ADR-0013). Omitted / unknown
   *  provider => the picker behaves as prefer_address. */
  providerInspectionPolicy?: InspectionLocationPolicy;
  vehicleModel: string;
  vehicleYear?: number;
  /** Latest durable vehicle-lookup outcome. Full evidence stays server-side. */
  vehicleLookup?: VehicleLookupSummary;

  /** Claimant postal address captured at intake (cr1bd_evaclaimantaddress). A
   *  Case-identity/intake-capture clue (like vrm/casePo), NOT one of the 12 EVA
   *  payload fields. Used ONLY as a geolocation text clue for the Phase-4a
   *  location-suggestion assist; never drives workflow/readiness/matching. */
  claimantAddress?: string;

  /** The 12 EVA fields, each value + provenance + reviewState. */
  evaFields: EvaFields;

  evidence: Evidence[];
  /** A manually selected source batch has not finished attaching to this case yet. */
  sourceEvidencePending?: boolean;
  /** A selected Manual Intake source file exhausted archive retries. */
  sourceEvidenceArchiveFailed?: boolean;
  notes: Note[];
  chasers: Chaser[];
  overviewFacts: OverviewFacts;

  status: CaseStatus;
  /** Pre-computed missing list (also derivable via ReadinessChecklist). */
  missing: MissingItem[];

  /** Why a person must act (needs-action cases only). Omit otherwise. */
  actionReason?: ActionReason;

  /** Staff manually parked this case (routes to the Held queue). */
  onHold?: boolean;

  channel: IntakeChannel;
  /** Age of the case in days (for queue urgency). */
  ageDays: number;

  /** ADR-0021 case work type (audit / total-loss audit / diminution). Absent /
   *  'standard' = an ordinary case. Set at intake (gated) or refined at review
   *  via PATCH { caseType } (TKT-057). */
  caseType?: CaseWorkType;

  /** The most recent thing that happened on the case (audit trail + notes +
   *  chases), for the queues' "Last update" line (TKT-117). Present only on the
   *  queue LIST payload — single-case reads may omit it. */
  lastActivity?: CaseLastActivity;

  /** Inspection-address decision mode (drives the readiness check). */
  inspectionDecision: 'confirmed_physical' | 'manual' | 'image_based' | 'unknown';

  /** ISO date the case entered the pipeline (windowing + aging). */
  createdAt: string; // DD/MM/YYYY
  /** ISO date the case is due (aging / past-due chips). */
  dateDue?: string; // DD/MM/YYYY
  /** ISO date the case was submitted to EVA (windowed "Done today" / throughput). */
  submittedAt?: string; // DD/MM/YYYY

  /** Box archive (one-way mirror; absent until the Case/PO folder is created). */
  boxFolderId?: string;
  /** Box folder shared-link URL — the "Open in Box" case-archive deep link. */
  boxFolderUrl?: string;

  /** Survivor case id when THIS case was retired by a staff merge (TKT-092: the
   *  source case is set `linked_to_instruction` with a `mergedInto` marker in its
   *  dedup staging). Present => the case is resolved work, not an open twin — it
   *  is excluded from twin counts, needs-action lists, and stage counts (TKT-141)
   *  while staying openable directly. */
  mergedInto?: string;
}

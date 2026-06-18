/* ============================================================
   Collision Engineers — M1 prototype mock-data types.

   Shaped like the eventual Dataverse / EVA-contract model (see
   docs/architecture/data-model.md + the eva-sentry-api skill), but
   trimmed to what the UI prototype needs. MOCK ONLY — no live shapes.
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
  | 'manual_upload';

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

/** One EVA-relevant field: its value plus where it came from and its review state. */
export interface EvaField {
  value: string;
  provenance: FieldProvenance;
  reviewState: ReviewState;
}

/* ----------  The 12-field EVA contract  ----------
   Order + formats per the eva-sentry-api skill / Final Format Example 02.json:
   1 Work Provider (non-empty) · 2 Vehicle Model · 3 Claimant Name ·
   4 Claimant Telephone · 5 Claimant Email · 6 Date of Loss (DD/MM/YYYY) ·
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
  | 'eva_payload';

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
  /** Optional placeholder thumbnail tint (no real image bytes in the mock). */
  thumbColor?: string;
  /** Where it came from (message / upload label). */
  sourceLabel: string;
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
export type IntakeChannelKind = 'email' | 'whatsapp';
export type IntakeChannelMode = 'auto' | 'manual';
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
  description: string;
}

/* ----------  Missing-item (the readiness "Missing" list)  ---------- */
export type MissingItemKind =
  | 'required_field'
  | 'image_rule'
  | 'inspection_address'
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

/* ----------  Case (the live work item)  ---------- */
export interface Case {
  id: string;
  vrm: string;
  /** Entered at EVA submit; absent until then. */
  casePo?: string;
  provider: string; // displayName (matches a Provider.displayName)
  providerCode: string; // principalCode
  vehicleModel: string;
  vehicleYear?: number;

  /** The 12 EVA fields, each value + provenance + reviewState. */
  evaFields: EvaFields;

  evidence: Evidence[];
  notes: Note[];
  chasers: Chaser[];
  overviewFacts: OverviewFacts;

  status: CaseStatus;
  /** Pre-computed missing list (also derivable via ReadinessChecklist). */
  missing: MissingItem[];

  /** Why a person must act (needs-action cases only). Omit otherwise. */
  actionReason?: ActionReason;

  channel: IntakeChannel;
  /** Age of the case in days (for queue urgency). */
  ageDays: number;

  /** Inspection-address decision mode (drives the readiness check). */
  inspectionDecision: 'confirmed_physical' | 'manual' | 'image_based' | 'unknown';

  /** ISO date the case entered the pipeline (windowing + aging). */
  createdAt: string; // DD/MM/YYYY
  /** ISO date the case is due (aging / past-due chips). */
  dateDue?: string; // DD/MM/YYYY
  /** ISO date the case was submitted to EVA (windowed "Done today" / throughput). */
  submittedAt?: string; // DD/MM/YYYY
}

/* ============================================================
   Collision Engineers — @cs/domain/codecs (server-only subpath).

   Choice-set integer<->name codecs and DD/MM/YYYY date helpers.
   Lifted from mockup-app/src/data/adapter.ts.

   SERVER-ONLY: imports the frozen choiceset-contract JSON co-located in this
   package (src/data/choicesets/). NOT re-exported from the main src/index.ts barrel (browser-safe).
   Consumers: api/ and orchestration/ (import '@cs/domain/codecs').

   The integer<->name maps are derived FROM THE REAL CHOICE-SET ARTIFACTS in
   src/data/choicesets/*.json — the frozen contract source (originally the Dataverse
   global choicesets, now co-located in this package) so the codec can never drift
   from the deployed option values. resolveJsonModule is on in the package tsconfig.

   Round-trippable: codec.toName(codec.toInt(name)) === name for every option.
   ============================================================ */

import type { CaseStatus } from '../contracts/case-status';
import type { CaseWorkType } from '../domain/case-type';
import type {
  MileageUnit,
  VatStatus,
} from '../contracts/eva-export';
import type { ImageRole } from '../contracts/image-rules';
import type { InspectionLocationPolicy } from '../domain/address-policy';
import type {
  ActionReason,
  Case,
  EvidenceKind,
  ReviewState,
  ProvenanceSourceType,
  ProviderAutomationMode,
  ActivityKind,
} from '../model/types';
import type { InboundCategory, InboundSubtype } from '../dto';

/* The REAL choice-set artifacts, co-located in this package (src/data/choicesets/). */
import caseStatusChoiceSet from '../data/choicesets/case-status.json';
import caseTypeChoiceSet from '../data/choicesets/case-type.json';
import actionReasonChoiceSet from '../data/choicesets/action-reason.json';
import inspectionDecisionChoiceSet from '../data/choicesets/inspection-decision-mode.json';
import intakeChannelChoiceSet from '../data/choicesets/intake-channel.json';
import evidenceKindChoiceSet from '../data/choicesets/evidence-kind.json';
import imageRoleChoiceSet from '../data/choicesets/image-role.json';
import reviewStateChoiceSet from '../data/choicesets/review-state.json';
import sourceTypeChoiceSet from '../data/choicesets/field-provenance-source-type.json';
import inspectionPolicyChoiceSet from '../data/choicesets/inspection-location-policy.json';
import automationModeChoiceSet from '../data/choicesets/provider-automation-mode.json';
import auditEventChoiceSet from '../data/choicesets/audit-event.json';
import inboundEmailClassificationChoiceSet from '../data/choicesets/inbound-email-classification.json';

/* ============================================================
   Choice-set <-> integer bijection helper.
   ============================================================ */

export interface ChoiceOption {
  value: number;
  name: string;
  label: string;
}

export interface ChoiceSet {
  logicalName: string;
  options: ChoiceOption[];
}

/** A round-trippable integer<->name codec built from a choice-set's options. */
export interface ChoiceCodec<TName extends string> {
  readonly logicalName: string;
  /** integer option value -> string name (undefined if unknown). */
  toName(value: number | null | undefined): TName | undefined;
  /** string name -> integer option value (undefined if unknown). */
  toInt(name: TName | null | undefined): number | undefined;
  /** All names in declaration order. */
  names(): TName[];
  /** All integer values in declaration order. */
  values(): number[];
}

/** Build a codec from a raw choice-set JSON object. */
export function makeChoiceCodec<TName extends string>(cs: ChoiceSet): ChoiceCodec<TName> {
  const byValue = new Map<number, TName>();
  const byName = new Map<TName, number>();
  for (const o of cs.options) {
    byValue.set(o.value, o.name as TName);
    byName.set(o.name as TName, o.value);
  }
  return {
    logicalName: cs.logicalName,
    toName: (value) => (value == null ? undefined : byValue.get(value)),
    toInt: (name) => (name == null ? undefined : byName.get(name)),
    names: () => cs.options.map((o) => o.name as TName),
    values: () => cs.options.map((o) => o.value),
  };
}

/* ----------  One codec per choice set the M1 binding touches  ---------- */
export const caseStatusCodec = makeChoiceCodec<CaseStatus>(caseStatusChoiceSet as ChoiceSet);
export const caseTypeCodec = makeChoiceCodec<CaseWorkType>(caseTypeChoiceSet as ChoiceSet);
export const actionReasonCodec = makeChoiceCodec<ActionReason>(actionReasonChoiceSet as ChoiceSet);
export const inspectionDecisionCodec = makeChoiceCodec<Case['inspectionDecision']>(
  inspectionDecisionChoiceSet as ChoiceSet,
);
export const intakeChannelKindCodec = makeChoiceCodec<
  'email' | 'whatsapp' | 'provider_api' | 'retro'
>(intakeChannelChoiceSet as ChoiceSet);
/** The choice set carries an `other` value the domain EvidenceKind union lacks
 *  (data-model.md adds it at the data layer); type the codec over the superset. */
export const evidenceKindCodec = makeChoiceCodec<EvidenceKind | 'other'>(
  evidenceKindChoiceSet as ChoiceSet,
);
export const imageRoleCodec = makeChoiceCodec<ImageRole>(imageRoleChoiceSet as ChoiceSet);
export const reviewStateCodec = makeChoiceCodec<ReviewState>(reviewStateChoiceSet as ChoiceSet);
export const sourceTypeCodec = makeChoiceCodec<ProvenanceSourceType>(
  sourceTypeChoiceSet as ChoiceSet,
);
export const inspectionPolicyCodec = makeChoiceCodec<InspectionLocationPolicy>(
  inspectionPolicyChoiceSet as ChoiceSet,
);
export const automationModeCodec = makeChoiceCodec<ProviderAutomationMode>(
  automationModeChoiceSet as ChoiceSet,
);

/* ----------  Audit action -> Activity-feed kind  ----------
   audit-event.json is a BUNDLE (action + severity sets), so the action set is
   indexed by logicalName here rather than imported as a single set. The codec is
   built from the canonical choiceset (not the pac-generated enum, which can lag
   the Box additions), so it can never drift from the deployed option values. */
const auditActionSet = (auditEventChoiceSet as { choiceSets: ChoiceSet[] }).choiceSets.find(
  (s) => s.logicalName === 'cr1bd_auditaction',
) as ChoiceSet;
export const auditActionCodec = makeChoiceCodec<string>(auditActionSet);

/** Map a controlled audit-action name -> the ActivityKind the Action Logs feed
 *  badges. Covers all 22 canonical actions — including the EXTRACTION (parser_*)
 *  and AUTO (enrichment/provider/dedup/status/box) actions the flows write — so
 *  each renders with its correct badge instead of a generic "Status". Unknown ->
 *  'status_change'. */
export function auditActionToActivityKind(action: string | undefined): ActivityKind {
  switch (action) {
    case 'graph_message_ingested':
    case 'graph_message_ingest_failed':
    case 'case_created':
    case 'case_attached':
      return 'intake';
    case 'attachment_classified':
    case 'provider_matched':
    case 'provider_unmatched':
      return 'classify';
    case 'parser_called':
    case 'parser_failed':
      return 'parse';
    case 'enrichment_called':
    case 'enrichment_failed':
      return 'enrich';
    case 'duplicate_dropped':
    case 'duplicate_flagged':
      return 'dedup';
    case 'eva_submitted':
      return 'eva_submit';
    case 'box_synced':
    case 'box_folder_created':
    case 'box_file_request_copied':
    case 'box_upload_received':
      return 'box_sync';
    case 'jobsheet_imported':
    case 'corpus_record_changed':
    case 'inspection_override':
      return 'note';
    case 'status_changed':
    default:
      return 'status_change';
  }
}

/* ----------  Inbound-email triage: category / subtype  ----------
   inbound-email-classification.json is a BUNDLE (category + subtype sets), same shape
   as audit-event.json above -- indexed by logicalName rather than imported as a single
   set. Built from the canonical choiceset (never renumbered; append-only — see the
   JSON's own header) so this can never drift from the deployed option values, and typed
   over the SAME InboundCategory/InboundSubtype unions the DTO exposes (dto/index.ts) so
   an unmapped name is a compile error here, not a silent runtime gap. Covers the
   taxonomy-v2 additions (rules-engine-v2 Phase 2 / ADR-0019): case_update, cancellation,
   images_received, cancellation_notice, update_general. */
const inboundCategorySet = (
  inboundEmailClassificationChoiceSet as { choiceSets: ChoiceSet[] }
).choiceSets.find((s) => s.logicalName === 'cr1bd_inboundcategory') as ChoiceSet;
export const inboundCategoryCodec = makeChoiceCodec<InboundCategory>(inboundCategorySet);

const inboundSubtypeSet = (
  inboundEmailClassificationChoiceSet as { choiceSets: ChoiceSet[] }
).choiceSets.find((s) => s.logicalName === 'cr1bd_inboundsubtype') as ChoiceSet;
export const inboundSubtypeCodec = makeChoiceCodec<InboundSubtype>(inboundSubtypeSet);

/* ============================================================
   statuscode <-> CaseStatus (the headline mapping the task calls out).
   ============================================================ */

/** Dataverse statuscode integer -> CaseStatus union. Throws on an unknown int. */
export function statusFromInt(value: number | null | undefined): CaseStatus {
  const name = caseStatusCodec.toName(value);
  if (!name) throw new Error(`Unknown cr1bd_casestatus value: ${String(value)}`);
  return name;
}

/** CaseStatus union -> Dataverse statuscode integer. Throws on an unknown status. */
export function statusToInt(status: CaseStatus): number {
  const value = caseStatusCodec.toInt(status);
  if (value == null) throw new Error(`Unknown CaseStatus: ${status}`);
  return value;
}

/* ============================================================
   Date helpers — Dataverse DateOnly (ISO yyyy-mm-dd) <-> domain DD/MM/YYYY.
   The domain uses DD/MM/YYYY strings everywhere; Dataverse DateOnly columns
   serialize as yyyy-mm-dd (and DateTime as ISO). Round-trippable for
   well-formed inputs.
   ============================================================ */

/** Dataverse date string (ISO yyyy-mm-dd[...]) -> DD/MM/YYYY. '' / null -> undefined. */
export function dvDateToDmy(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** DD/MM/YYYY -> Dataverse DateOnly ISO yyyy-mm-dd. undefined / malformed -> undefined. */
export function dmyToDvDate(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/* Re-export type aliases for the VatStatus / MileageUnit consumers. */
export type { VatStatus, MileageUnit };

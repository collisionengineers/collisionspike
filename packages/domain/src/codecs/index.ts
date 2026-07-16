/* ============================================================
   Collision Engineers — @cs/domain/codecs (server-only subpath).

   Code-table integer<->name codecs and DD/MM/YYYY date helpers.
   Shared codecs for the web app and services.

   SERVER-ONLY: imports the frozen code-table contract JSON co-located in this
   package (src/data/code-tables/). NOT re-exported from the main src/index.ts barrel (browser-safe).
   Consumers: api/ and orchestration/ (import '@cs/domain/codecs').

   The integer<->name maps are derived from the canonical code-table artifacts in
   src/data/code-tables/*.json — the frozen contract source, co-located in this
   package so the codec can never drift
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

/* Canonical code-table artifacts co-located in this package. */
import caseStatusCodeTable from '../data/code-tables/case-status.json';
import caseTypeCodeTable from '../data/code-tables/case-type.json';
import actionReasonCodeTable from '../data/code-tables/action-reason.json';
import inspectionDecisionCodeTable from '../data/code-tables/inspection-decision-mode.json';
import intakeChannelCodeTable from '../data/code-tables/intake-channel.json';
import evidenceKindCodeTable from '../data/code-tables/evidence-kind.json';
import imageRoleCodeTable from '../data/code-tables/image-role.json';
import reviewStateCodeTable from '../data/code-tables/review-state.json';
import sourceTypeCodeTable from '../data/code-tables/field-provenance-source-type.json';
import inspectionPolicyCodeTable from '../data/code-tables/inspection-location-policy.json';
import automationModeCodeTable from '../data/code-tables/provider-automation-mode.json';
import auditEventCodeTable from '../data/code-tables/audit-event.json';
import inboundEmailClassificationCodeTable from '../data/code-tables/inbound-email-classification.json';

/* ============================================================
   Code-table <-> integer bijection helper.
   ============================================================ */

export interface CodeTableOption {
  value: number;
  name: string;
  label: string;
}

export interface CodeTable {
  codeTableId: string;
  options: CodeTableOption[];
}

/** A round-trippable integer<->name codec built from a code table's options. */
export interface CodeTableCodec<TName extends string> {
  readonly codeTableId: string;
  /** integer option value -> string name (undefined if unknown). */
  toName(value: number | null | undefined): TName | undefined;
  /** string name -> integer option value (undefined if unknown). */
  toInt(name: TName | null | undefined): number | undefined;
  /** All names in declaration order. */
  names(): TName[];
  /** All integer values in declaration order. */
  values(): number[];
}

/** Build a codec from a raw code-table JSON object. */
export function makeCodeTableCodec<TName extends string>(table: CodeTable): CodeTableCodec<TName> {
  const byValue = new Map<number, TName>();
  const byName = new Map<TName, number>();
  for (const o of table.options) {
    byValue.set(o.value, o.name as TName);
    byName.set(o.name as TName, o.value);
  }
  return {
    codeTableId: table.codeTableId,
    toName: (value) => (value == null ? undefined : byValue.get(value)),
    toInt: (name) => (name == null ? undefined : byName.get(name)),
    names: () => table.options.map((o) => o.name as TName),
    values: () => table.options.map((o) => o.value),
  };
}

/* ----------  One codec per persisted code table  ---------- */
export const caseStatusCodec = makeCodeTableCodec<CaseStatus>(caseStatusCodeTable as CodeTable);
export const caseTypeCodec = makeCodeTableCodec<CaseWorkType>(caseTypeCodeTable as CodeTable);
export const actionReasonCodec = makeCodeTableCodec<ActionReason>(actionReasonCodeTable as CodeTable);
export const inspectionDecisionCodec = makeCodeTableCodec<Case['inspectionDecision']>(
  inspectionDecisionCodeTable as CodeTable,
);
export const intakeChannelKindCodec = makeCodeTableCodec<
  'email' | 'whatsapp' | 'provider_api' | 'retro'
>(intakeChannelCodeTable as CodeTable);
/** The code table carries an `other` value the domain EvidenceKind union lacks
 *  (data-model.md adds it at the data layer); type the codec over the superset. */
export const evidenceKindCodec = makeCodeTableCodec<EvidenceKind | 'other'>(
  evidenceKindCodeTable as CodeTable,
);
export const imageRoleCodec = makeCodeTableCodec<ImageRole>(imageRoleCodeTable as CodeTable);
export const reviewStateCodec = makeCodeTableCodec<ReviewState>(reviewStateCodeTable as CodeTable);
export const sourceTypeCodec = makeCodeTableCodec<ProvenanceSourceType>(
  sourceTypeCodeTable as CodeTable,
);
export const inspectionPolicyCodec = makeCodeTableCodec<InspectionLocationPolicy>(
  inspectionPolicyCodeTable as CodeTable,
);
export const automationModeCodec = makeCodeTableCodec<ProviderAutomationMode>(
  automationModeCodeTable as CodeTable,
);

/* ----------  Audit action -> Activity-feed kind  ----------
   audit-event.json is a BUNDLE (action + severity sets), so the action set is
   indexed by codeTableId here rather than imported as a single table. The codec is
   built from the canonical code table so it cannot drift from persisted option values. */
const auditActionTable = (auditEventCodeTable as { codeTables: CodeTable[] }).codeTables.find(
  (table) => table.codeTableId === 'audit_action',
) as CodeTable;
export const auditActionCodec = makeCodeTableCodec<string>(auditActionTable);

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
   as audit-event.json above -- indexed by codeTableId rather than imported as a single
   table. Built from the canonical code table (never renumbered; append-only — see the
   JSON's own header) so this can never drift from the deployed option values, and typed
   over the SAME InboundCategory/InboundSubtype unions the DTO exposes (dto/index.ts) so
   an unmapped name is a compile error here, not a silent runtime gap. Covers the
   taxonomy-v2 additions (rules-engine-v2 Phase 2 / ADR-0019): case_update, cancellation,
   images_received, cancellation_notice, update_general. */
const inboundCategoryTable = (
  inboundEmailClassificationCodeTable as { codeTables: CodeTable[] }
).codeTables.find((table) => table.codeTableId === 'inbound_category') as CodeTable;
export const inboundCategoryCodec = makeCodeTableCodec<InboundCategory>(inboundCategoryTable);

const inboundSubtypeTable = (
  inboundEmailClassificationCodeTable as { codeTables: CodeTable[] }
).codeTables.find((table) => table.codeTableId === 'inbound_subtype') as CodeTable;
export const inboundSubtypeCodec = makeCodeTableCodec<InboundSubtype>(inboundSubtypeTable);

/* ============================================================
   statuscode <-> CaseStatus (the headline mapping the task calls out).
   ============================================================ */

/** Persisted status integer -> CaseStatus union. Throws on an unknown int. */
export function statusFromInt(value: number | null | undefined): CaseStatus {
  const name = caseStatusCodec.toName(value);
  if (!name) throw new Error(`Unknown case_status value: ${String(value)}`);
  return name;
}

/** CaseStatus union -> persisted status integer. Throws on an unknown status. */
export function statusToInt(status: CaseStatus): number {
  const value = caseStatusCodec.toInt(status);
  if (value == null) throw new Error(`Unknown CaseStatus: ${status}`);
  return value;
}

/* ============================================================
   Date helpers — ISO yyyy-mm-dd <-> domain DD/MM/YYYY.
   The domain uses DD/MM/YYYY strings while persisted dates serialize as
   yyyy-mm-dd (and timestamps as ISO). Round-trippable for
   well-formed inputs.
   ============================================================ */

/** ISO date string (yyyy-mm-dd[...]) -> DD/MM/YYYY. '' / null -> undefined. */
export function isoDateToDmy(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** DD/MM/YYYY -> ISO yyyy-mm-dd. undefined / malformed -> undefined. */
export function dmyToIsoDate(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/* Re-export type aliases for the VatStatus / MileageUnit consumers. */
export type { VatStatus, MileageUnit };

/* ============================================================
   Collision Engineers — Code App DATA SEAM: field-name adapter.

   Maps Dataverse logical-name records (cr1bd_*) <-> the camelCase domain types
   the screens use (Case / Evidence / Provider / …), and the choice-set INTEGER
   values <-> the string-enum unions (CaseStatus, ActionReason, ImageRole, …).

   The integer<->name maps are derived FROM THE REAL CHOICE-SET ARTIFACTS in
   repo-root dataverse/choicesets/*.json (imported here, not copied) so the
   adapter can never drift from the deployed option values. Vite/Vitest resolve
   these out-of-src JSON imports at runtime (resolveJsonModule is on) — the same
   pattern the existing case-status.parity.test.ts uses.

   Round-trippable: domainToInt(intToDomain(v)) === v for every option, asserted
   in adapter.test.ts against the choice-set values.

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No SDK import, no React, no I/O.
   ============================================================ */

import type { CaseStatus } from '../contracts/case-status';
import type {
  EvaFieldKey,
  MileageUnit,
  VatStatus,
} from '../contracts/eva-export';
import { EVA_FIELD_ORDER } from '../contracts/eva-export';
import type { ImageRole } from '../contracts/image-rules';
import type { InspectionLocationPolicy } from '../domain/address-policy';
import type {
  ActionReason,
  Case,
  Evidence,
  EvaField,
  EvaFields,
  EvidenceKind,
  OverviewFacts,
  Provider,
  ProviderAutomationMode,
  ReviewState,
  ProvenanceSourceType,
} from '../mock/types';
import type {
  CaseRecord,
  EvidenceRecord,
  FieldLevelProvenanceRecord,
  WorkProviderRecord,
} from './types';

/* The REAL choice-set artifacts (repo-root dataverse/). Single source of truth. */
import caseStatusChoiceSet from '../../../dataverse/choicesets/case-status.json';
import actionReasonChoiceSet from '../../../dataverse/choicesets/action-reason.json';
import inspectionDecisionChoiceSet from '../../../dataverse/choicesets/inspection-decision-mode.json';
import intakeChannelChoiceSet from '../../../dataverse/choicesets/intake-channel.json';
import evidenceKindChoiceSet from '../../../dataverse/choicesets/evidence-kind.json';
import imageRoleChoiceSet from '../../../dataverse/choicesets/image-role.json';
import reviewStateChoiceSet from '../../../dataverse/choicesets/review-state.json';
import sourceTypeChoiceSet from '../../../dataverse/choicesets/field-provenance-source-type.json';
import inspectionPolicyChoiceSet from '../../../dataverse/choicesets/inspection-location-policy.json';
import automationModeChoiceSet from '../../../dataverse/choicesets/provider-automation-mode.json';

/* ============================================================
   Choice-set <-> integer bijection helper.
   ============================================================ */

interface ChoiceOption {
  value: number;
  name: string;
  label: string;
}
interface ChoiceSet {
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
export const actionReasonCodec = makeChoiceCodec<ActionReason>(actionReasonChoiceSet as ChoiceSet);
export const inspectionDecisionCodec = makeChoiceCodec<Case['inspectionDecision']>(
  inspectionDecisionChoiceSet as ChoiceSet,
);
export const intakeChannelKindCodec = makeChoiceCodec<'email' | 'whatsapp'>(
  intakeChannelChoiceSet as ChoiceSet,
);
/** The choice set carries an `other` value the prototype EvidenceKind union lacks
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
   The prototype domain uses DD/MM/YYYY strings everywhere; Dataverse DateOnly
   columns serialize as yyyy-mm-dd (and DateTime as ISO). Round-trippable for
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

/* ============================================================
   EVA field column mapping.

   The 12 EVA values live on the Case row as cr1bd_eva* string columns; their
   per-field provenance + reviewState live in joined FieldLevelProvenance rows
   (separate table). The adapter assembles a prototype `EvaField`
   ({ value, provenance, reviewState }) per EVA_FIELD_ORDER key by pairing the
   Case column value with the matching provenance row (when present), defaulting
   to a staff/needs_review stub when no row exists.
   ============================================================ */

/** Map an EVA camelCase key -> its cr1bd_eva* Case column logical name. */
const EVA_KEY_TO_COLUMN: Record<EvaFieldKey, keyof CaseRecord> = {
  workProvider: 'cr1bd_evaworkprovider',
  vehicleModel: 'cr1bd_evavehiclemodel',
  claimantName: 'cr1bd_evaclaimantname',
  claimantTelephone: 'cr1bd_evaclaimanttelephone',
  claimantEmail: 'cr1bd_evaclaimantemail',
  dateOfLoss: 'cr1bd_evadateofloss',
  dateOfInstruction: 'cr1bd_evadateofinstruction',
  accidentCircumstances: 'cr1bd_evaaccidentcircumstances',
  inspectionAddress: 'cr1bd_evainspectionaddress',
  vatStatus: 'cr1bd_evavatstatus',
  mileage: 'cr1bd_evamileage',
  mileageUnit: 'cr1bd_evamileageunit',
};

/** A single provenance row -> the prototype `EvaField` for that value. */
function provenanceRowToEvaField(value: string, row?: FieldLevelProvenanceRecord): EvaField {
  const sourceType = sourceTypeCodec.toName(row?.cr1bd_sourcetype) ?? 'staff';
  const reviewState = reviewStateCodec.toName(row?.cr1bd_reviewstate) ?? 'needs_review';
  return {
    value,
    reviewState,
    provenance: {
      sourceType,
      sourceLabel: row?.cr1bd_sourcelabel ?? 'Staff entry',
      ...(row?.cr1bd_confidence != null ? { confidence: row.cr1bd_confidence } : {}),
    },
  };
}

/** The prototype `EvaField` -> a FieldLevelProvenance row (deploy-time writes). */
export function evaFieldToProvenanceRow(
  caseId: string,
  fieldName: EvaFieldKey,
  field: EvaField,
): FieldLevelProvenanceRecord {
  return {
    _cr1bd_caseid_value: caseId,
    cr1bd_fieldname: fieldName,
    cr1bd_value: field.value,
    cr1bd_sourcetype: sourceTypeCodec.toInt(field.provenance.sourceType),
    cr1bd_sourcelabel: field.provenance.sourceLabel,
    cr1bd_confidence: field.provenance.confidence ?? null,
    cr1bd_reviewstate: reviewStateCodec.toInt(field.reviewState),
  };
}

/** Assemble the 12-field `EvaFields` object from a Case row + its provenance rows. */
export function evaFieldsFromRecord(
  rec: CaseRecord,
  provenanceRows: readonly FieldLevelProvenanceRecord[] = [],
): EvaFields {
  const byField = new Map<string, FieldLevelProvenanceRecord>();
  for (const row of provenanceRows) {
    if (row.cr1bd_fieldname) byField.set(row.cr1bd_fieldname, row);
  }
  const out = {} as EvaFields;
  for (const desc of EVA_FIELD_ORDER) {
    const value = (rec[EVA_KEY_TO_COLUMN[desc.key]] as string | undefined) ?? '';
    const field = provenanceRowToEvaField(value, byField.get(desc.key));
    // vatStatus / mileageUnit are narrowed-value variants in the prototype.
    (out as Record<EvaFieldKey, EvaField>)[desc.key] = field;
  }
  // Narrow the two enum fields' value types to satisfy EvaFields.
  out.vatStatus = { ...out.vatStatus, value: out.vatStatus.value as VatStatus };
  out.mileageUnit = { ...out.mileageUnit, value: out.mileageUnit.value as MileageUnit };
  return out;
}

/** Project the 12 EvaFields values onto the Case row's cr1bd_eva* columns. */
export function evaFieldsToColumns(fields: EvaFields): Partial<CaseRecord> {
  const out: Record<string, string> = {};
  for (const desc of EVA_FIELD_ORDER) {
    out[EVA_KEY_TO_COLUMN[desc.key] as string] = fields[desc.key].value;
  }
  return out as Partial<CaseRecord>;
}

/* ============================================================
   Overview facts <-> cr1bd_ov* columns.
   ============================================================ */

export function overviewFactsFromRecord(rec: CaseRecord): OverviewFacts {
  const f: OverviewFacts = {};
  if (rec.cr1bd_ovinsuredname) f.insuredName = rec.cr1bd_ovinsuredname;
  if (rec.cr1bd_ovclaimantname) f.claimantName = rec.cr1bd_ovclaimantname;
  if (rec.cr1bd_ovthirdpartyname) f.thirdPartyName = rec.cr1bd_ovthirdpartyname;
  if (rec.cr1bd_ovclaimnumber) f.claimNumber = rec.cr1bd_ovclaimnumber;
  if (rec.cr1bd_ovpolicyreference) f.policyReference = rec.cr1bd_ovpolicyreference;
  if (rec.cr1bd_ovincidentdate) f.incidentDate = rec.cr1bd_ovincidentdate;
  if (rec.cr1bd_ovclaimtype) f.claimType = rec.cr1bd_ovclaimtype;
  if (rec.cr1bd_ovinsurername) f.insurerName = rec.cr1bd_ovinsurername;
  if (rec.cr1bd_ovrepairername) f.repairerName = rec.cr1bd_ovrepairername;
  return f;
}

export function overviewFactsToColumns(f: OverviewFacts): Partial<CaseRecord> {
  return {
    cr1bd_ovinsuredname: f.insuredName,
    cr1bd_ovclaimantname: f.claimantName,
    cr1bd_ovthirdpartyname: f.thirdPartyName,
    cr1bd_ovclaimnumber: f.claimNumber,
    cr1bd_ovpolicyreference: f.policyReference,
    cr1bd_ovincidentdate: f.incidentDate,
    cr1bd_ovclaimtype: f.claimType,
    cr1bd_ovinsurername: f.insurerName,
    cr1bd_ovrepairername: f.repairerName,
  };
}

/* ============================================================
   Evidence <-> cr1bd_evidence row.
   ============================================================ */

export function evidenceFromRecord(rec: EvidenceRecord): Evidence {
  return {
    id: rec.cr1bd_evidenceid ?? '',
    fileName: rec.cr1bd_filename ?? '',
    // `other` (data-layer-only) flows through as a string; screens switch on the
    // known prototype kinds and ignore the rest.
    kind: (evidenceKindCodec.toName(rec.cr1bd_kind) ?? 'other') as EvidenceKind,
    imageRole: imageRoleCodec.toName(rec.cr1bd_imagerole) ?? 'unknown',
    registrationVisible: rec.cr1bd_registrationvisible ?? false,
    acceptedForEva: rec.cr1bd_acceptedforeva ?? false,
    ...(rec.cr1bd_excluded != null ? { excluded: rec.cr1bd_excluded } : {}),
    ...(rec.cr1bd_exclusionreason ? { exclusionReason: rec.cr1bd_exclusionreason } : {}),
    sourceLabel: rec.cr1bd_sourcelabel ?? '',
  };
}

/**
 * Record-level mirror of imagesForCase's predicate: image-kind evidence that is
 * accepted for EVA and not excluded. Used by the Dataverse source to filter the
 * EVA-relevant image set before adapting (parity with mock `imagesForCase`,
 * which filters `kind === 'image' && !excluded`).
 */
export function isAcceptedImageRecord(rec: EvidenceRecord): boolean {
  return evidenceKindCodec.toName(rec.cr1bd_kind) === 'image' && rec.cr1bd_excluded !== true;
}

export function evidenceToRecord(caseId: string, e: Evidence): EvidenceRecord {
  return {
    cr1bd_evidenceid: e.id || undefined,
    _cr1bd_caseid_value: caseId,
    cr1bd_filename: e.fileName,
    cr1bd_kind: evidenceKindCodec.toInt(e.kind),
    cr1bd_imagerole: imageRoleCodec.toInt(e.imageRole),
    cr1bd_registrationvisible: e.registrationVisible,
    cr1bd_acceptedforeva: e.acceptedForEva,
    cr1bd_excluded: e.excluded ?? false,
    cr1bd_exclusionreason: e.exclusionReason,
    cr1bd_sourcelabel: e.sourceLabel,
  };
}

/* ============================================================
   Provider <-> cr1bd_workprovider row.
   ============================================================ */

/** Parse the Memo domains column (newline or JSON list) into a string[]. */
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

export function providerFromRecord(rec: WorkProviderRecord): Provider {
  return {
    id: rec.cr1bd_workproviderid ?? '',
    displayName: rec.cr1bd_displayname ?? '',
    principalCode: rec.cr1bd_principalcode ?? '',
    defaultMailbox: rec.cr1bd_defaultmailbox ?? '',
    knownEmailDomains: parseDomains(rec.cr1bd_knownemaildomains),
    inspectionLocationPolicy:
      inspectionPolicyCodec.toName(rec.cr1bd_inspectionlocationpolicy) ?? 'prefer_address',
    providerAutomationMode:
      automationModeCodec.toName(rec.cr1bd_providerautomationmode) ?? 'review_auto',
    active: rec.cr1bd_active ?? false,
  };
}

export function providerToRecord(p: Provider): WorkProviderRecord {
  return {
    cr1bd_workproviderid: p.id || undefined,
    cr1bd_displayname: p.displayName,
    cr1bd_principalcode: p.principalCode,
    cr1bd_defaultmailbox: p.defaultMailbox,
    cr1bd_knownemaildomains: p.knownEmailDomains.join('\n'),
    cr1bd_inspectionlocationpolicy: inspectionPolicyCodec.toInt(p.inspectionLocationPolicy),
    cr1bd_providerautomationmode: automationModeCodec.toInt(p.providerAutomationMode),
    cr1bd_active: p.active,
  };
}

/* ============================================================
   Case <-> cr1bd_case row (the headline assembler).

   The Dataverse-backed DataAccess fetches a Case row + its expanded children
   (Evidence, Note, Chaser, FieldLevelProvenance) and calls `caseFromRecord` with
   the already-converted child collections. `ageDays`/`missing` are derived
   client-side (the prototype computes `missing` via ReadinessChecklist; the
   adapter leaves it empty for the readiness component to fill).
   ============================================================ */

export interface CaseAssemblyInput {
  record: CaseRecord;
  provenanceRows?: readonly FieldLevelProvenanceRecord[];
  evidence?: Evidence[];
  notes?: Case['notes'];
  chasers?: Case['chasers'];
  /** Anchor for ageDays derivation; defaults to new Date() in the source layer. */
  now?: Date;
}

/** Whole days between a DD/MM/YYYY createdAt and `now` (>= 0). */
function ageDaysFrom(createdAtDmy: string | undefined, now: Date): number {
  if (!createdAtDmy) return 0;
  const m = createdAtDmy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return 0;
  const created = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const ms = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
    Date.UTC(created.getFullYear(), created.getMonth(), created.getDate());
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function caseFromRecord(input: CaseAssemblyInput): Case {
  const { record: rec } = input;
  const now = input.now ?? new Date();
  const createdAt = dvDateToDmy(rec.createdon) ?? '';
  const channelKind = intakeChannelKindCodec.toName(rec.cr1bd_intakechannelkind) ?? 'email';
  const actionReason = actionReasonCodec.toName(rec.cr1bd_actionreason ?? undefined);

  return {
    id: rec.cr1bd_caseid ?? '',
    vrm: rec.cr1bd_vrm ?? '',
    ...(rec.cr1bd_casepo ? { casePo: rec.cr1bd_casepo } : {}),
    provider: rec.cr1bd_provider_display ?? rec.cr1bd_evaworkprovider ?? '',
    providerCode: rec.cr1bd_provider_code ?? '',
    vehicleModel: rec.cr1bd_evavehiclemodel ?? '',
    evaFields: evaFieldsFromRecord(rec, input.provenanceRows),
    evidence: input.evidence ?? [],
    notes: input.notes ?? [],
    chasers: input.chasers ?? [],
    overviewFacts: overviewFactsFromRecord(rec),
    status: statusFromInt(rec.cr1bd_status),
    missing: [], // derived by the readiness component in the UI
    ...(actionReason ? { actionReason } : {}),
    channel: {
      kind: channelKind,
      mode: rec.cr1bd_intakechannelmanual ? 'manual' : 'auto',
      sourceMailbox: rec.cr1bd_sourcemailbox ?? '',
    },
    ageDays: ageDaysFrom(createdAt, now),
    inspectionDecision:
      inspectionDecisionCodec.toName(rec.cr1bd_inspectiondecision) ?? 'unknown',
    createdAt,
    ...(dvDateToDmy(rec.cr1bd_datedue) ? { dateDue: dvDateToDmy(rec.cr1bd_datedue) } : {}),
    ...(dvDateToDmy(rec.cr1bd_submittedat)
      ? { submittedAt: dvDateToDmy(rec.cr1bd_submittedat) }
      : {}),
  };
}

/** Project a Case's identity + workflow + EVA columns back onto a cr1bd_case row. */
export function caseToRecord(c: Case): Partial<CaseRecord> {
  return {
    cr1bd_caseid: c.id || undefined,
    cr1bd_vrm: c.vrm,
    cr1bd_casepo: c.casePo,
    cr1bd_status: statusToInt(c.status),
    cr1bd_intakechannelkind: intakeChannelKindCodec.toInt(c.channel.kind),
    cr1bd_intakechannelmanual: c.channel.mode === 'manual',
    cr1bd_sourcemailbox: c.channel.sourceMailbox,
    cr1bd_actionreason: c.actionReason ? actionReasonCodec.toInt(c.actionReason) : null,
    cr1bd_inspectiondecision: inspectionDecisionCodec.toInt(c.inspectionDecision),
    cr1bd_datedue: dmyToDvDate(c.dateDue),
    cr1bd_submittedat: dmyToDvDate(c.submittedAt),
    ...evaFieldsToColumns(c.evaFields),
    ...overviewFactsToColumns(c.overviewFacts),
  };
}

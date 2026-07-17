/** cases — cohesive Data API module. */

import { EVA_FIELD_ORDER, type Case, type EvaField, type EvaFieldConflict, type EvaFields, type EvaFieldKey, type Evidence, type MileageUnit, type OverviewFacts, type VatStatus } from '@cs/domain';
import { actionReasonCodec, caseStatusCodec, caseTypeCodec, inspectionDecisionCodec, inspectionPolicyCodec, intakeChannelKindCodec, reviewStateCodec, sourceTypeCodec } from '@cs/domain/codecs';
import { lastActivityLabel } from '../last-activity.js';

export type Row = Record<string, any>;

const CASE_SELECT_COLUMNS =
  'c.*, wp.display_name AS provider_display, wp.principal_code AS provider_principal, ' +
  'wp.inspection_location_policy_code AS provider_inspection_policy';

const CASE_SELECT_FROM = 'FROM case_ c LEFT JOIN work_provider wp ON wp.id = c.work_provider_id';

export const CASE_SELECT = `SELECT ${CASE_SELECT_COLUMNS} ${CASE_SELECT_FROM}`;

export const CASE_SELECT_WITH_ACTIVITY =
  `SELECT ${CASE_SELECT_COLUMNS}, ` +
  'la.last_activity_kind, la.last_activity_at, la.last_activity_actor, ' +
  'la.last_activity_action_code, la.last_activity_suggested, ' +
  'la.last_activity_summary, la.last_activity_evidence_class, la.last_activity_origin ' +
  `${CASE_SELECT_FROM} ` +
  'LEFT JOIN LATERAL (' +
  'SELECT ev.kind AS last_activity_kind, ev.occurred_at AS last_activity_at, ' +
  'ev.actor AS last_activity_actor, ev.action_code AS last_activity_action_code, ' +
  'ev.suggested AS last_activity_suggested, ev.summary AS last_activity_summary, ' +
  'ev.evidence_class AS last_activity_evidence_class, ev.origin AS last_activity_origin FROM (' +
  "SELECT 'audit'::text AS kind, ae.occurred_at, ae.actor, ae.action_code, " +
  // audit_event.after is a text memo, not jsonb. Guard the cast inside
  // CASE so one arbitrary/non-JSON historical value cannot sink every queue read.
  "COALESCE(CASE WHEN pg_input_is_valid(ae.after, 'jsonb') " +
  "THEN ae.after::jsonb @> '{\"suggested\": true}'::jsonb ELSE false END, false) AS suggested, " +
  // TKT-226 — the audit summary plus the honest-label fields carried in the
  // OBJECT `after` payload. Legacy rows hold a JSON string SCALAR (valid jsonb,
  // jsonb_typeof = 'string'), so the object guard yields NULL there — the label
  // seam then falls back to parsing the filename out of the summary. The
  // jsonb_typeof probe is NESTED inside the validity CASE (mirroring `suggested`
  // above): PostgreSQL does not guarantee AND operand order, so a flat
  // `pg_input_is_valid(…) AND jsonb_typeof(ae.after::jsonb) = …` may evaluate the
  // cast first and error on a non-JSON memo, sinking every queue read.
  'ae.name AS summary, ' +
  "CASE WHEN pg_input_is_valid(ae.after, 'jsonb') " +
  "THEN CASE WHEN jsonb_typeof(ae.after::jsonb) = 'object' " +
  "THEN ae.after::jsonb->>'evidenceClass' END END AS evidence_class, " +
  "CASE WHEN pg_input_is_valid(ae.after, 'jsonb') " +
  "THEN CASE WHEN jsonb_typeof(ae.after::jsonb) = 'object' " +
  "THEN ae.after::jsonb->>'origin' END END AS origin " +
  'FROM audit_event ae WHERE ae.case_id = c.id ' +
  'UNION ALL ' +
  "SELECT 'note', COALESCE(n.occurred_at, n.created_at), n.author, NULL::integer, false, NULL::text, NULL::text, NULL::text FROM note n WHERE n.case_id = c.id " +
  'UNION ALL ' +
  "SELECT 'chaser', COALESCE(ch.sent_at, ch.drafted_at, ch.created_at), NULL, NULL::integer, ch.suggested, NULL::text, NULL::text, NULL::text FROM chaser ch WHERE ch.case_id = c.id" +
  ') ev WHERE ev.occurred_at IS NOT NULL ORDER BY ev.occurred_at DESC LIMIT 1' +
  ') la ON true';

export const pad = (n: number): string => String(n).padStart(2, '0');

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

export function toIso(v: Date | string | null | undefined): string {
  if (v == null || v === '') return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString();
  return String(v);
}

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

function provenanceRowToEvaField(value: string, row?: Row): EvaField {
  const sourceType = sourceTypeCodec.toName(row?.source_type_code) ?? 'unknown';
  const reviewState = reviewStateCodec.toName(row?.review_state_code) ?? 'needs_review';
  const confidence = row?.confidence;
  return {
    value,
    reviewState,
    provenance: {
      sourceType,
      sourceLabel: row?.source_label ?? 'Source not recorded',
      ...(confidence != null ? { confidence: Number(confidence) } : {}),
    },
  };
}

function comparableProvenanceValue(key: EvaFieldKey, raw: unknown): string | null {
  if (raw == null) return null;
  let value = String(raw).replace(/\r\n/g, '\n').trim();
  if (key === 'mileage') value = value.replace(/[^\d]/g, '');
  if (key === 'claimantTelephone') value = value.replace(/[\s().-]+/g, '');
  return value.toLocaleLowerCase('en-GB');
}

export function rowToEvaFields(rec: Row, provenanceRows: readonly Row[] = []): EvaFields {
  const byField = new Map<string, Row[]>();
  for (const row of provenanceRows) {
    if (!row.field_name) continue;
    const key = String(row.field_name);
    byField.set(key, [...(byField.get(key) ?? []), row]);
  }
  const out = {} as EvaFields;
  for (const desc of EVA_FIELD_ORDER) {
    const value = (rec[EVA_COLUMN_BY_KEY[desc.key]] as string | undefined) ?? '';
    // Multiple source/conflict rows are valid. Only provenance for the CURRENT case
    // value can describe that value. Prefer an explicitly reviewed row, then a staff
    // row, then the newest source. The final id tie-break makes the result independent
    // of PostgreSQL row order (which has no guarantee without ORDER BY).
    const currentComparable = comparableProvenanceValue(desc.key, value);
    const fieldProvenance = byField.get(desc.key) ?? [];
    const provenance = fieldProvenance
      .filter((row) => comparableProvenanceValue(desc.key, row.value) === currentComparable)
      .sort((a, b) => {
        const reviewedA = reviewStateCodec.toName(a.review_state_code) === 'reviewed' ? 1 : 0;
        const reviewedB = reviewStateCodec.toName(b.review_state_code) === 'reviewed' ? 1 : 0;
        if (reviewedA !== reviewedB) return reviewedB - reviewedA;
        const staffA = sourceTypeCodec.toName(a.source_type_code) === 'staff' ? 1 : 0;
        const staffB = sourceTypeCodec.toName(b.source_type_code) === 'staff' ? 1 : 0;
        if (staffA !== staffB) return staffB - staffA;
        const timeA = new Date(String(a.updated_at ?? a.created_at ?? 0)).getTime() || 0;
        const timeB = new Date(String(b.updated_at ?? b.created_at ?? 0)).getTime() || 0;
        if (timeA !== timeB) return timeB - timeA;
        return String(a.id ?? '').localeCompare(String(b.id ?? ''));
      })[0];
    const mapped = provenanceRowToEvaField(
      value,
      provenance,
    );
    // A differing unresolved source remains visible even though it cannot describe (and
    // therefore must not replace the provenance of) the current value. Retain every distinct
    // candidate with its own source so staff can make an informed choice in the case screen.
    const conflictByValue = new Map<string, EvaFieldConflict>();
    const unresolvedConflicts = fieldProvenance
      .filter(
        (row) =>
          reviewStateCodec.toName(row.review_state_code) === 'conflict' &&
          comparableProvenanceValue(desc.key, row.value) !== currentComparable,
      )
      .sort((a, b) => {
        const timeA = new Date(String(a.updated_at ?? a.created_at ?? 0)).getTime() || 0;
        const timeB = new Date(String(b.updated_at ?? b.created_at ?? 0)).getTime() || 0;
        if (timeA !== timeB) return timeB - timeA;
        return String(a.id ?? '').localeCompare(String(b.id ?? ''));
      });
    for (const row of unresolvedConflicts) {
      const comparable = comparableProvenanceValue(desc.key, row.value);
      if (comparable == null || conflictByValue.has(comparable)) continue;
      conflictByValue.set(comparable, {
        candidateValue: String(row.value).trim(),
        provenance: provenanceRowToEvaField('', row).provenance,
      });
    }
    if (conflictByValue.size > 0) {
      mapped.reviewState = 'conflict';
      mapped.conflicts = [...conflictByValue.values()];
    }
    (out as Record<EvaFieldKey, EvaField>)[desc.key] = mapped;
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

function deriveInspectionDecision(rec: Row): Case['inspectionDecision'] {
  const explicit = inspectionDecisionCodec.toName(rec.inspection_decision_code);
  if (explicit) return explicit;
  return 'unknown';
}

export interface CaseAssembly {
  evidence?: Evidence[];
  notes?: Case['notes'];
  chasers?: Case['chasers'];
  provenanceRows?: readonly Row[];
  now?: Date;
}

export function mergedIntoFrom(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const v = (parsed as { mergedInto?: unknown } | null)?.mergedInto;
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined; // free-form duplicate_keys value, not a merge marker
  }
}

export function rowToCase(rec: Row, opts: CaseAssembly = {}): Case {
  const now = opts.now ?? new Date();
  const createdAt = toDmy(rec.created_at) ?? '';
  // The codec union covers provider_api + retro (R4, ADR-0022), so the 'email' fallback
  // now only masks a genuinely-NULL channel code — a real channel always maps honestly
  // (a retro-reconstructed case must never masquerade as an email arrival).
  const channelKind = intakeChannelKindCodec.toName(rec.intake_channel_kind_code) ?? 'email';
  const actionReason = actionReasonCodec.toName(rec.action_reason_code ?? undefined);
  const dateDue = toDmy(rec.date_due);
  const submittedAt = toDmy(rec.submitted_at);
  // ADR-0021 case work type (NULL = standard, omitted from the payload).
  const caseType = caseTypeCodec.toName(rec.case_type_code ?? undefined);
  // "Last update" (TKT-117) — present only when the serving query LATERAL-joined
  // the newest audit/note/chaser row (CASE_SELECT_WITH_ACTIVITY, cases.ts). The
  // label is composed in ONE place (lib/last-activity.ts) — never a raw enum.
  const lastActivityDate = toDmy(rec.last_activity_at);

  return {
    id: rec.id ?? '',
    vrm: rec.vrm ?? '',
    ...(rec.case_po ? { casePo: rec.case_po } : {}),
    ...(rec.eva_claimant_address ? { claimantAddress: rec.eva_claimant_address } : {}),
    provider: rec.provider_display ?? rec.eva_work_provider ?? '',
    providerCode: rec.provider_principal ?? '',
    // The provider's operator-designated inspection policy (ADR-0016) — surfaced in the address
    // flow as an informational default, NEVER auto-applied (TKT-079). Omitted for an unknown provider.
    ...(inspectionPolicyCodec.toName(rec.provider_inspection_policy ?? undefined)
      ? { providerInspectionPolicy: inspectionPolicyCodec.toName(rec.provider_inspection_policy)! }
      : {}),
    vehicleModel: rec.eva_vehicle_model ?? '',
    ...(rec.vehicle_lookup_status
      ? {
          vehicleLookup: {
            ...(rec.last_vehicle_lookup_run_id ? { runId: rec.last_vehicle_lookup_run_id } : {}),
            status: rec.vehicle_lookup_status,
            ...(rec.vehicle_mileage_status ? { mileageStatus: rec.vehicle_mileage_status } : {}),
            ...(rec.vehicle_mileage_method ? { mileageMethod: rec.vehicle_mileage_method } : {}),
            ...(rec.vehicle_lookup_warning ? { warning: rec.vehicle_lookup_warning } : {}),
            retryable: rec.vehicle_lookup_retryable === true,
            ...(rec.vehicle_lookup_attempted_at ? { attemptedAt: toIso(rec.vehicle_lookup_attempted_at) } : {}),
          },
        }
      : {}),
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
    // TKT-141 — surface the merge-retirement marker (TKT-092 writes it into the
    // duplicate_keys dedup staging JSON) so the ONE isRetiredMerged predicate can
    // exclude retired duplicates from twin counts / attention lists / stage counts.
    ...(mergedIntoFrom(rec.duplicate_keys) ? { mergedInto: mergedIntoFrom(rec.duplicate_keys)! } : {}),
    ...(caseType && caseType !== 'standard' ? { caseType } : {}),
    ...(lastActivityDate
      ? {
          lastActivity: {
            label: lastActivityLabel({
              kind: rec.last_activity_kind,
              actionCode: rec.last_activity_action_code ?? null,
              actor: rec.last_activity_actor ?? null,
              suggested: rec.last_activity_suggested === true,
              // TKT-226 — honest Box-upload labels: the audit summary + the
              // `after` payload fields (evidenceClass/origin) let the label seam
              // say what actually arrived instead of assuming images.
              summary: rec.last_activity_summary ?? null,
              evidenceClass: rec.last_activity_evidence_class ?? null,
              origin: rec.last_activity_origin ?? null,
            }),
            date: lastActivityDate,
          },
        }
      : {}),
  };
}

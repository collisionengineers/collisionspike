/* ============================================================
   Collision Engineers — Code App DATA SEAM: Dataverse source.

   Implements `DataAccess` against an injected `GeneratedServices` bundle (the
   local model of what `pac code add-data-source` emits), using adapter.ts to map
   cr1bd_* logical-name records <-> the camelCase domain types and the choice-set
   integers <-> the string-enum unions.

   This source is WIRED AT STARTUP: src/main.tsx calls
   `configureDataAccess(generatedServices)`, so the deployed Code App runs
   Dataverse-backed (real rows). This module itself imports NO SDK and NO
   `src/generated/` module — only the LOCAL `GeneratedServices` interface, which
   the real pac-generated services satisfy structurally and which the caller
   injects at runtime; the SDK bootstrap lives in main.tsx, not here. The
   pre-bootstrap default and the SDK-free unit tests use the empty mock source.
   (There is NO "no @microsoft/power-apps import in src" grep gate in
   verify-all.mjs; the boundary grep-gate there allowlists the connector seam and
   the generated SDK, and forbids only raw fetch/external-host calls.)

   The queue/dashboard windowing math mirrors mock/queues.ts EXACTLY (same QUEUES
   map, same Monday-anchored week, same DD/MM/YYYY parsing) but runs over the
   ADAPTED Case[] fetched from Dataverse rather than the mock array — so the
   numbers are identical for identical data.
   ============================================================ */

import type { Case, Evidence, Provider, ActivityEvent } from '../mock/types';
import {
  QUEUES,
  queueByName,
  statusToQueue,
  statusToStage,
  REASON_LABELS,
  type QueueName,
  type LiveCounts,
  type Throughput,
  type AgingRow,
  type AgingExceptions,
  type PipelineStage,
  type PipelineStageKey,
  type ReasonFacet,
} from '../mock/queues';
import type { ActionReason, CaseStatus } from '../mock/types';
import {
  caseFromRecord,
  evidenceFromRecord,
  providerFromRecord,
  suggestionFromRecord,
  isSuggestedAddressRecord,
  isAcceptedImageRecord,
  evaFieldsToColumns,
  evaFieldToProvenanceRow,
  statusToInt,
  inspectionDecisionCodec,
  intakeChannelKindCodec,
  auditActionCodec,
  auditActionToActivityKind,
} from './adapter';
import { EVA_FIELD_ORDER } from '../contracts/eva-export';
import { BOX_GATES_ALL_FALSE } from './types';
import type {
  BoxGates,
  CaseRecord,
  CreateCaseInput,
  CreateCaseResult,
  DataAccess,
  GeneratedServices,
  InspectionAddressCounts,
  InspectionAddressRecord,
  InspectionDecisionInput,
  LocationAssistGate,
  SaveInspectionDecisionResult,
  SuggestedAddress,
} from './types';
import { LOCATION_ASSIST_GATE_ALL_OFF } from './types';
import {
  BOX_ENV_VAR_SCHEMA_NAMES,
  BOX_FILE_REQUEST_TEMPLATE_ID_SCHEMA,
  boxFileRequestTemplateIdFromRows,
  boxGatesFromRows,
  HOLD_NEW_CASES_SCHEMA,
  holdNewCasesFromRows,
  LOCATION_ASSIST_ENV_VAR_SCHEMA_NAMES,
  locationAssistGateFromRows,
} from './box-gates';

/* ----------  Date helpers (ported verbatim from mock/queues.ts)  ---------- */
function parseDmy(s?: string): Date | undefined {
  if (!s) return undefined;
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function isSameDay(a?: Date, b?: Date): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}
function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7;
  s.setDate(s.getDate() - dow);
  return s;
}

/** Filter an already-fetched Case[] for a queue (status membership). */
function filterQueue(all: Case[], name: QueueName, _now: Date): Case[] {
  if (!queueByName(name)) return [];
  // A staff-held case lives in Held regardless of its underlying status; every
  // other case maps by status (terminal statuses own no active queue).
  return all.filter((c) => (c.onHold ? 'held' : statusToQueue(c.status)) === name);
}

/** The cases that need a human — backs the dashboard "needs action" aging hero
    list, its past-due/reason tallies, and the reason-facet chips. ALL THREE
    queues, Held INCLUDED: a held/errored case is actionable, and an overdue one
    must still surface in the aging hero / pastDueCount / reasonCounts rather
    than vanish because the Held queue was dropped. */
function actionableCases(all: Case[], now: Date): Case[] {
  return [
    ...filterQueue(all, 'not-ready', now),
    ...filterQueue(all, 'review', now),
    ...filterQueue(all, 'held', now),
  ];
}

/* Pipeline-stage mapping for the re-cut 4-stage strip lives in mock/queues.ts
   (`statusToStage`, imported above) so the dashboard funnel, the CaseDetail spine
   and the queues all share ONE bucket map. `error` maps to `undefined` there —
   an exception, surfaced via the Exceptions queue + aging hero, never a funnel
   count (queues #1). */

const TERMINAL = new Set<CaseStatus>(['eva_submitted', 'box_synced']);

/* ----------  Suggestion ORDERING (ADR-0016 helper #2 — ordering ONLY)  ----------
   Order the provider-scoped suggestion list by the offline-derived ranking the
   EVA-export pre-processor + 16-seed wrote: rank ASC when defined, else frequency
   DESC, then lastSeen DESC. STABLE — equal-rank rows keep their incoming order
   (Array.prototype.sort is stable in modern JS, and the comparator returns 0 only
   for genuine ties so input order is preserved). This is presentation ORDERING
   ONLY: it never auto-selects a suggestion and never mirrors one onto a Case
   (ADR-0013 stays binding — staff still pick per case). */
export function sortSuggestions(list: SuggestedAddress[]): SuggestedAddress[] {
  return list
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      // 1) rank ASC when BOTH defined; a defined rank sorts ahead of an undefined.
      const ra = a.s.rank;
      const rb = b.s.rank;
      if (ra != null && rb != null && ra !== rb) return ra - rb;
      if (ra != null && rb == null) return -1;
      if (ra == null && rb != null) return 1;
      // 2) frequency DESC (undefined treated as 0).
      const fa = a.s.frequency ?? 0;
      const fb = b.s.frequency ?? 0;
      if (fa !== fb) return fb - fa;
      // 3) lastSeen DESC (YYYY-MM-DD sorts lexicographically; '' sorts last).
      const la = a.s.lastSeen ?? '';
      const lb = b.s.lastSeen ?? '';
      if (la !== lb) return lb < la ? -1 : 1;
      // 4) stable tie-break: preserve incoming order.
      return a.i - b.i;
    })
    .map((x) => x.s);
}

/**
 * Build a Dataverse-backed DataAccess over the injected generated services.
 *
 * @param services  the pac-generated `<Entity>Service` bundle (injected; the
 *                  real services satisfy the local GeneratedServices interface).
 */
export function createDataverseDataAccess(services: GeneratedServices): DataAccess {
  /* Assemble a full Case (row + expanded children) from the generated services. */
  async function assembleCase(caseId: string, now: Date): Promise<Case | undefined> {
    const res = await services.cases.get(caseId);
    const rec = res.data;
    if (!rec) return undefined;

    const [prov, ev, notes, chasers] = await Promise.all([
      services.fieldProvenance.getAll({ filter: `_cr1bd_caseid_value eq ${caseId}` }),
      services.evidence.getAll({ filter: `_cr1bd_caseid_value eq ${caseId}` }),
      services.notes.getAll({ filter: `_cr1bd_caseid_value eq ${caseId}` }),
      services.chasers.getAll({ filter: `_cr1bd_caseid_value eq ${caseId}` }),
    ]);

    return caseFromRecord({
      record: rec,
      provenanceRows: prov.data ?? [],
      evidence: (ev.data ?? []).map(evidenceFromRecord),
      notes: (notes.data ?? []).map((n) => ({
        id: n.cr1bd_noteid ?? '',
        author: n.cr1bd_author ?? '',
        timestamp: n.cr1bd_timestamp ?? '',
        text: n.cr1bd_text ?? '',
      })),
      chasers: (chasers.data ?? []).map((ch) => ({
        id: ch.cr1bd_chaserid ?? '',
        targetType: 'work_provider',
        targetName: ch.cr1bd_targetname ?? '',
        channel: ch.cr1bd_channel === 100000001 ? 'whatsapp' : 'email',
        templateUsed: ch.cr1bd_templateused ?? '',
        status: 'drafted',
        summary: ch.cr1bd_summary ?? '',
        createdAt: ch.cr1bd_createdat ?? '',
        ...(ch.cr1bd_sentby ? { sentBy: ch.cr1bd_sentby } : {}),
        ...(ch.cr1bd_sentat ? { sentAt: ch.cr1bd_sentat } : {}),
      })),
      now,
    });
  }

  /** Fetch + adapt ALL cases (the dashboard/queue aggregates window over these). */
  async function allCases(now: Date): Promise<Case[]> {
    // Newest-first, so a freshly-arrived case surfaces at the top of the list,
    // the queues and the dashboard (Dataverse's default order is ~insertion,
    // which buried new arrivals below older ones).
    const res = await services.cases.getAll({ orderBy: ['createdon desc'] });
    return (res.data ?? []).map((rec) => caseFromRecord({ record: rec, now }));
  }

  /* Create a Case row from reviewed manual-intake fields, then (optionally) write
     one FieldLevelProvenance row per EVA field. Returns the new row's id. */
  async function createCase(input: CreateCaseInput): Promise<CreateCaseResult> {
    const record: Partial<CaseRecord> = {
      cr1bd_vrm: input.vrm,
      ...(input.casePo ? { cr1bd_casepo: input.casePo } : {}),
      cr1bd_status: statusToInt(input.status),
      cr1bd_intakechannelkind: intakeChannelKindCodec.toInt('email'),
      cr1bd_intakechannelmanual: true,
      cr1bd_sourcemailbox: input.sourceLabel ?? 'Manual intake (Code App)',
      ...(input.insuredName ? { cr1bd_ovinsuredname: input.insuredName } : {}),
      ...(input.providerReference ? { cr1bd_ovclaimnumber: input.providerReference } : {}),
      // Image-based (or other explicit) inspection decision, stamped on create so
      // it does not rely solely on the address-text back-fill.
      ...(input.inspectionDecision && input.inspectionDecision !== 'unknown'
        ? { cr1bd_inspectiondecision: inspectionDecisionCodec.toInt(input.inspectionDecision) }
        : {}),
      // Hold-by-default (or a per-case hold): parks the case in the Held queue.
      ...(input.onHold ? { cr1bd_onhold: true } : {}),
      ...evaFieldsToColumns(input.evaFields),
    };

    const res = await services.cases.create(record);
    const created = res.data;
    const newId = created?.cr1bd_caseid;
    if (!newId) {
      throw new Error('Case create returned no id');
    }

    if (input.writeProvenance) {
      // Best-effort: write a provenance row per EVA field. Failures here must not
      // sink the whole intake (the Case already exists), so they are swallowed.
      await Promise.all(
        EVA_FIELD_ORDER.map(async (desc) => {
          const field = input.evaFields[desc.key];
          const row = evaFieldToProvenanceRow(newId, desc.key, field);
          try {
            await services.fieldProvenance.create(row);
          } catch {
            /* provenance is supplementary — ignore a single-row failure */
          }
        }),
      );
    }

    // Persist the image-based reason as a case note when provided (best-effort —
    // a note failure must not sink the already-created case).
    if (input.inspectionDecisionReason?.trim()) {
      try {
        await services.notes.create({
          'cr1bd_Caseid@odata.bind': `/cr1bd_cases(${newId})`,
          cr1bd_author: 'Manual intake (Code App)',
          cr1bd_timestamp: new Date().toISOString(),
          cr1bd_text: `Inspection decision: image-based — ${input.inspectionDecisionReason.trim()}`,
        });
      } catch {
        /* a note failure must not sink the create */
      }
    }

    return { id: newId };
  }

  /* ----------  BOX_* gate read (cached, refetchable, default all-false)  ----------
     Code Apps cannot read env-vars natively, so read the platform env-var tables
     the flows read — coalescing value ?? defaultvalue ?? 'false' in box-gates.ts.
     Cached in a module-scoped promise (read once at startup); a falsy result on
     ANY failure (tables not wired, query error) is the all-false honest-off
     baseline. The hook's `refetch` re-runs by clearing the cache via
     `getDataAccess().getBoxGates()` only after a reload — within a session the
     cache is intentionally sticky (gates change ~hourly at publish, not live). */
  let boxGatesCache: Promise<BoxGates> | undefined;
  async function fetchBoxGates(): Promise<BoxGates> {
    const defsSvc = services.environmentVariableDefinitions;
    const valsSvc = services.environmentVariableValues;
    // Until the operator wires both env-var tables (pac add-data-source), there is
    // nothing to read — return all-false rather than throwing.
    if (!defsSvc || !valsSvc) return { ...BOX_GATES_ALL_FALSE };
    try {
      // Filter the DEFINITION table to just the BOX_* schema names (an OData
      // `schemaname eq 'a' or schemaname eq 'b' …` disjunction). The VALUE table
      // is small (one row per overridden var) so fetch it whole and join in code.
      const schemaFilter = BOX_ENV_VAR_SCHEMA_NAMES.map(
        (s) => `schemaname eq '${s}'`,
      ).join(' or ');
      const [defsRes, valsRes] = await Promise.all([
        defsSvc.getAll({
          select: ['environmentvariabledefinitionid', 'schemaname', 'defaultvalue'],
          filter: schemaFilter,
        }),
        valsSvc.getAll({
          select: ['value', '_environmentvariabledefinitionid_value'],
        }),
      ]);
      return boxGatesFromRows(defsRes.data ?? [], valsRes.data ?? []);
    } catch {
      // Honest off on any read failure — never fabricate an enabled gate.
      return { ...BOX_GATES_ALL_FALSE };
    }
  }

  /* ----------  Location-assist gate read (read FRESH, default all-off)  ----------
     Same env-var-table read as the BOX_* gates: the new master gate, the paired
     Maps gate, and the per-env API-base config var. `enabled` is the AND of all
     three; a failure (tables not wired, query error) returns all-off so the
     "Suggest location" action stays hidden until the feature is genuinely live.
     NOT memoised — an operator gate flip must take effect on the next read, not a
     full app reload (see getLocationAssistGate). */
  async function fetchLocationAssistGate(): Promise<LocationAssistGate> {
    const defsSvc = services.environmentVariableDefinitions;
    const valsSvc = services.environmentVariableValues;
    if (!defsSvc || !valsSvc) return { ...LOCATION_ASSIST_GATE_ALL_OFF };
    try {
      const schemaFilter = LOCATION_ASSIST_ENV_VAR_SCHEMA_NAMES.map(
        (s) => `schemaname eq '${s}'`,
      ).join(' or ');
      const [defsRes, valsRes] = await Promise.all([
        defsSvc.getAll({
          select: ['environmentvariabledefinitionid', 'schemaname', 'defaultvalue'],
          filter: schemaFilter,
        }),
        valsSvc.getAll({
          select: ['value', '_environmentvariabledefinitionid_value'],
        }),
      ]);
      return locationAssistGateFromRows(defsRes.data ?? [], valsRes.data ?? []);
    } catch {
      return { ...LOCATION_ASSIST_GATE_ALL_OFF };
    }
  }

  return {
    /* ----- Cases ----- */
    caseById: (id) => assembleCase(id, new Date()),
    createCase,

    casesForQueue: async (name, now = new Date()) =>
      filterQueue(await allCases(now), name, now),

    openVrmTwins: async (vrm, excludeCaseId) => {
      const res = await services.cases.getAll({ filter: `cr1bd_vrm eq '${vrm}'` });
      return (res.data ?? [])
        .map((rec) => caseFromRecord({ record: rec }))
        .filter((c) => !TERMINAL.has(c.status) && c.id !== excludeCaseId);
    },

    setOnHold: async (caseId, onHold) => {
      // Staff manual park/un-park; routes the case to (or out of) the Held queue.
      await services.cases.update(caseId, { cr1bd_onhold: onHold });
    },

    mergeCandidates: async (caseId) => {
      // Targets a staff merge could fold this case into: OPEN, same-provider, not
      // this case, not already merged. (ADR-0010 rule 2: same provider only.)
      const selfRes = await services.cases.get(caseId);
      const self = selfRes.data ? caseFromRecord({ record: selfRes.data }) : undefined;
      if (!self) return [];
      const res = await services.cases.getAll({ orderBy: ['createdon desc'] });
      return (res.data ?? [])
        .map((rec) => caseFromRecord({ record: rec }))
        .filter(
          (cc) =>
            cc.id !== caseId &&
            !TERMINAL.has(cc.status) &&
            cc.status !== 'linked_to_instruction' &&
            cc.providerCode === self.providerCode,
        );
    },

    mergeCases: async (sourceCaseId, targetCaseId) => {
      if (sourceCaseId === targetCaseId) {
        throw new Error('Cannot merge a case into itself.');
      }
      const [srcRes, tgtRes] = await Promise.all([
        services.cases.get(sourceCaseId),
        services.cases.get(targetCaseId),
      ]);
      const src = srcRes.data ? caseFromRecord({ record: srcRes.data }) : undefined;
      const tgt = tgtRes.data ? caseFromRecord({ record: tgtRes.data }) : undefined;
      if (!src || !tgt) throw new Error('Source or target case not found.');
      // ADR-0010 rule 2: NEVER link across different work providers.
      if (src.providerCode && tgt.providerCode && src.providerCode !== tgt.providerCode) {
        throw new Error('Refusing to merge across different work providers.');
      }
      if (TERMINAL.has(tgt.status)) {
        throw new Error('Cannot merge into a finalised (terminal) case.');
      }
      // 1. Reparent the source's evidence onto the target. A lookup is rebound on
      //    WRITE via the @odata.bind navigation property — the `_<rel>_value` form
      //    is read-only (valid only in $filter queries, as used just below).
      const evRes = await services.evidence.getAll({
        filter: `_cr1bd_caseid_value eq ${sourceCaseId}`,
      });
      let moved = 0;
      for (const e of evRes.data ?? []) {
        if (!e.cr1bd_evidenceid) continue;
        await services.evidence.update(e.cr1bd_evidenceid, {
          'cr1bd_Caseid@odata.bind': `/cr1bd_cases(${targetCaseId})`,
        });
        moved += 1;
      }
      // 2. Retire the source: linked_to_instruction (caseType 'merged'), record the
      //    survivor in the dedup-staging Memo, clear any manual hold. The backend
      //    CS Status Evaluate flow recomputes the target's readiness + writes audit.
      await services.cases.update(sourceCaseId, {
        cr1bd_status: statusToInt('linked_to_instruction'),
        cr1bd_duplicatekeys: JSON.stringify({ mergedInto: targetCaseId }),
        cr1bd_onhold: false,
      });
      return { targetCaseId, movedEvidence: moved };
    },

    /* ----- Evidence ----- */
    imagesForCase: async (caseId) => {
      const res = await services.evidence.getAll({
        filter: `_cr1bd_caseid_value eq ${caseId}`,
      });
      return (res.data ?? [])
        .filter(isAcceptedImageRecord)
        .map(evidenceFromRecord) as Evidence[];
    },

    /* ----- Providers ----- */
    providers: async () => {
      const res = await services.workProviders.getAll();
      return (res.data ?? []).map(providerFromRecord) as Provider[];
    },
    providerByCode: async (code) => {
      const res = await services.workProviders.getAll({
        filter: `cr1bd_principalcode eq '${code}'`,
      });
      const rec = (res.data ?? [])[0];
      return rec ? providerFromRecord(rec) : undefined;
    },

    /* ----- Inspection-address suggestions (corpus; ALWAYS suggestions) -----
       The InspectionAddress table is added at deploy time (pac add-data-source);
       until then `services.inspectionAddresses` is undefined and we return honest
       empty results rather than throwing. */
    inspectionAddressSuggestions: async (caseId): Promise<SuggestedAddress[]> => {
      const svc = services.inspectionAddresses;
      if (!svc) return [];
      // Scope to the case's provider so the reviewer sees candidates for THIS
      // provider first (corpus plan: provider-scoped). The suggested rows carry
      // their provider code in the free-text source note, so fetch the suggested
      // subset and filter client-side (a note substring isn't OData-filterable).
      const caseRes = await services.cases.get(caseId);
      // Scope by the 4-char PRINCIPAL code. The suggestion rows carry it in their note
      // as provider=<CODE> (the EVA-export pre-processor parsed it from the Case ID's
      // leading-alpha run, uppercased). The Case's principal is likewise the leading
      // alpha run of the Case/PO (e.g. 'CCPY26050' -> 'CCPY') — NOT cr1bd_evaworkprovider,
      // which holds the work-provider NAME (EVA field 1, e.g. 'Acme Solicitors'): a
      // different namespace that almost never matched and fell through to "return all".
      const providerCode = (
        caseRes.data?.cr1bd_casepo?.trim().match(/^[A-Za-z]+/)?.[0] ?? ''
      ).toUpperCase();
      // getAll returns ALL columns (no explicit $select), so the new ADR-0016
      // ranking columns (cr1bd_suggestionrank/-frequency/-lastseenon) come back
      // without a read change; the adapter carries them onto SuggestedAddress.
      const res = await svc.getAll({
        filter: "startswith(cr1bd_sourcelabel,'suggested')",
      });
      const all = (res.data ?? []).filter(isSuggestedAddressRecord).map(suggestionFromRecord);
      if (!providerCode) return sortSuggestions(all);
      const scoped = all.filter(
        (s) => !s.providerCode || s.providerCode.toUpperCase() === providerCode,
      );
      // If the provider has no scoped candidates, fall back to all suggestions so
      // the reviewer still sees the catalogue rather than an empty panel. ORDER
      // BY the offline ranking in both branches (ADR-0016 helper #2: ordering
      // ONLY — never an auto-select; ADR-0013 unchanged).
      return sortSuggestions(scoped.length > 0 ? scoped : all);
    },

    inspectionAddressCounts: async (): Promise<InspectionAddressCounts> => {
      const svc = services.inspectionAddresses;
      if (!svc) return { confirmed: 0, suggested: 0 };
      const res = await svc.getAll();
      const rows = res.data ?? [];
      let confirmed = 0;
      let suggested = 0;
      const confirmedInt = inspectionDecisionCodec.toInt('confirmed_physical');
      for (const r of rows) {
        if (isSuggestedAddressRecord(r)) suggested += 1;
        else if (r.cr1bd_decisionmode === confirmedInt) confirmed += 1;
      }
      return { confirmed, suggested };
    },

    /* ----- Persist a reviewer's CONFIRMED inspection decision (ADR-0013) -----
       Writes ONE cr1bd_inspectionaddress row carrying the decision a HUMAN just
       confirmed on CaseDetail (a picked address, or Image Based Assessment with a
       reason) + its plain-language provenance. Honest NO-OP until the corpus table
       is wired (services.inspectionAddresses undefined) — exactly like the other
       not-yet-wired seams, so the confirm still drives the local working copy and
       the offline build stays green.

       The corpus table is provider-scoped and standalone — it carries NO case
       lookup (ADR-0013: a corpus row is never mirrored onto / bound to a Case). So
       the caseId is recorded for traceability INSIDE the source note, not as a
       lookup. The required primary `cr1bd_name` (Label) is derived from the
       confirmed address (or the IBA literal).

       ADR-0013 (BINDING): this is reached ONLY from the explicit confirm path; it
       does not auto-resolve, does not write on load, and reintroduces no runtime
       address matcher. The row it writes is a CONFIRMED decision (decisionMode !=
       unknown, sourceLabel NOT 'suggested*'), NOT a new unconfirmed suggestion. */
    saveInspectionDecision: async (
      caseId,
      decision: InspectionDecisionInput,
    ): Promise<SaveInspectionDecisionResult> => {
      const svc = services.inspectionAddresses;
      // Table not yet added (pac add-data-source) -> honest no-op. The local
      // working-copy capture in CaseDetail still happened; only the durable write
      // is deferred until deploy.
      if (!svc) return { persisted: false };

      // Project the confirmed decision onto an InspectionAddress row. A physical
      // decision carries up-to-6 address lines + postcode; an image-based decision
      // omits them and rides the reason in the source note. decisionMode is the
      // HUMAN-confirmed mode (never 'unknown' here — the confirm path supplies a
      // resolved mode), so the written row is a CONFIRMED reference, not a suggestion.
      const lines = (decision.addressLines ?? []).map((l) => (l ?? '').trim()).filter(Boolean);
      const isImageBased = decision.decisionMode === 'image_based';
      // Required primary column: a short Label for the confirmed location. The IBA
      // literal for an image-based decision; the first address line (+ postcode) for
      // a physical one; a safe fallback otherwise.
      const label = isImageBased
        ? 'Image Based Assessment'
        : [lines[0], decision.postcode?.trim()].filter(Boolean).join(', ') || 'Inspection address';
      // Trace the originating case in the note (no case lookup exists on the corpus).
      const sourceNote = `case=${caseId} ${decision.sourceNote}`.trim();
      const record: Partial<InspectionAddressRecord> = {
        cr1bd_name: label,
        cr1bd_sourcelabel: decision.sourceLabel,
        cr1bd_sourcenote: sourceNote,
        ...(decision.decisionMode && decision.decisionMode !== 'unknown'
          ? { cr1bd_decisionmode: inspectionDecisionCodec.toInt(decision.decisionMode) }
          : {}),
        // The image-based reason also lands in the dedicated decision-reason column
        // (the schema requires a non-empty reason for an image-based decision).
        ...(isImageBased && decision.sourceNote.trim()
          ? { cr1bd_decisionreason: decision.sourceNote.trim() }
          : {}),
        ...(lines[0] ? { cr1bd_addressline1: lines[0] } : {}),
        ...(lines[1] ? { cr1bd_addressline2: lines[1] } : {}),
        ...(lines[2] ? { cr1bd_addressline3: lines[2] } : {}),
        ...(lines[3] ? { cr1bd_addressline4: lines[3] } : {}),
        ...(lines[4] ? { cr1bd_addressline5: lines[4] } : {}),
        ...(lines[5] ? { cr1bd_addressline6: lines[5] } : {}),
        ...(!isImageBased && decision.postcode?.trim()
          ? { cr1bd_postcode: decision.postcode.trim() }
          : {}),
      };

      const res = await svc.create(record);
      const id = res.data?.cr1bd_inspectionaddressid;
      return { persisted: true, ...(id ? { id } : {}) };
    },

    /* ----- Dashboard / queue aggregates (window over the adapted set) ----- */
    liveCounts: async (now = new Date()): Promise<LiveCounts> => {
      const all = await allCases(now);
      return {
        notReady: filterQueue(all, 'not-ready', now).length,
        review: filterQueue(all, 'review', now).length,
        held: filterQueue(all, 'held', now).length,
      };
    },

    throughput: async (now = new Date()): Promise<Throughput> => {
      const all = await allCases(now);
      const today = startOfDay(now);
      const weekStart = startOfWeek(now);
      let inToday = 0;
      let submittedToday = 0;
      let clearedThisWeek = 0;
      for (const c of all) {
        if (isSameDay(parseDmy(c.createdAt), today)) inToday += 1;
        const sub = parseDmy(c.submittedAt);
        if (sub) {
          if (isSameDay(sub, today)) submittedToday += 1;
          if (startOfDay(sub).getTime() >= weekStart.getTime()) clearedThisWeek += 1;
        }
      }
      return { inToday, submittedToday, clearedThisWeek };
    },

    agingExceptions: async (now = new Date()): Promise<AgingExceptions> => {
      const all = await allCases(now);
      const today = startOfDay(now);
      const rows: AgingRow[] = actionableCases(all, now)
        .map((c) => {
          const due = parseDmy(c.dateDue);
          const daysToDue = due ? daysBetween(today, due) : Number.POSITIVE_INFINITY;
          return { case: c, daysToDue, pastDue: due ? daysToDue < 0 : false, reason: c.actionReason };
        })
        .sort((a, b) => a.daysToDue - b.daysToDue);
      return {
        rows,
        pastDueCount: rows.filter((r) => r.pastDue).length,
        duplicateCount: rows.filter((r) => r.reason === 'duplicate').length,
        conflictCount: rows.filter((r) => r.reason === 'conflict').length,
      };
    },

    queueCounts: async (now = new Date()): Promise<Record<QueueName, number>> => {
      const all = await allCases(now);
      return {
        'not-ready': filterQueue(all, 'not-ready', now).length,
        review: filterQueue(all, 'review', now).length,
        held: filterQueue(all, 'held', now).length,
      };
    },

    reasonCounts: async (now = new Date()): Promise<ReasonFacet[]> => {
      const all = await allCases(now);
      const tally = new Map<ActionReason, number>();
      for (const c of actionableCases(all, now)) {
        if (!c.actionReason) continue;
        tally.set(c.actionReason, (tally.get(c.actionReason) ?? 0) + 1);
      }
      return (Object.keys(REASON_LABELS) as ActionReason[])
        .map((reason) => ({ reason, label: REASON_LABELS[reason], count: tally.get(reason) ?? 0 }))
        .filter((f) => f.count > 0);
    },

    pipelineStages: async (): Promise<PipelineStage[]> => {
      const all = await allCases(new Date());
      // All four buckets are computed. The dashboard hero renders only the three
      // live-depth backlog stages (New/Not ready/Review); the `submitted`
      // cumulative total feeds the "Sent to EVA (total)" throughput cell, and the
      // CaseDetail spine uses `submitted` for the per-case "you are here". So the
      // stage set stays four here — the hero filters to the backlog client-side.
      const defs: { key: PipelineStageKey; label: string }[] = [
        { key: 'new', label: 'New' },
        { key: 'not_ready', label: 'Not ready' },
        { key: 'review', label: 'Review' },
        { key: 'submitted', label: 'Submitted' },
      ];
      const counts = new Map<PipelineStageKey, number>(defs.map((d) => [d.key, 0]));
      for (const c of all) {
        // On-hold cases are parked in Held, not a workflow-stage count — skip
        // them from the funnel just like the Held statuses below.
        if (c.onHold) continue;
        const k = statusToStage(c.status);
        // `error`/`duplicate_risk` map to undefined — Held, counted in the Held
        // bar/queue, never in the funnel. Skip here.
        if (k === undefined) continue;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return defs.map((d) => ({
        key: d.key,
        label: d.label,
        count: counts.get(d.key) ?? 0,
        tone: d.key === 'not_ready' ? 'stuck' : 'normal',
      }));
    },

    /* ----- Activity feed ----- */
    recentActivity: async (): Promise<ActivityEvent[]> => {
      const res = await services.auditEvents.getAll({ orderBy: ['cr1bd_occurredat desc'] });
      return (res.data ?? []).map(auditToActivity);
    },
    activityForCase: async (caseId): Promise<ActivityEvent[]> => {
      const res = await services.auditEvents.getAll({
        filter: `_cr1bd_caseid_value eq ${caseId}`,
        orderBy: ['cr1bd_occurredat desc'],
      });
      return (res.data ?? []).map(auditToActivity);
    },

    /* ----- Box feature gates (cached env-var read; all-false on failure) ----- */
    getBoxGates: (): Promise<BoxGates> => {
      if (!boxGatesCache) boxGatesCache = fetchBoxGates();
      return boxGatesCache;
    },

    /* ----- Box File-Request TEMPLATE id (the string value, not the boolean) -----
       Read FRESH per call off the same env-var tables — undefined when the var is
       unset/empty or the tables aren't wired (honest off). Consumed only by the
       Phase-7 deploy wiring's BoxCaseResolver.templateId(); the id is never shown
       in the UI. NOT cached (a deploy-time read happens at most once per submit). */
    getBoxFileRequestTemplateId: async (): Promise<string | undefined> => {
      const defsSvc = services.environmentVariableDefinitions;
      const valsSvc = services.environmentVariableValues;
      if (!defsSvc || !valsSvc) return undefined;
      try {
        const [defsRes, valsRes] = await Promise.all([
          defsSvc.getAll({
            select: ['environmentvariabledefinitionid', 'schemaname', 'defaultvalue'],
            filter: `schemaname eq '${BOX_FILE_REQUEST_TEMPLATE_ID_SCHEMA}'`,
          }),
          valsSvc.getAll({ select: ['value', '_environmentvariabledefinitionid_value'] }),
        ]);
        return boxFileRequestTemplateIdFromRows(defsRes.data ?? [], valsRes.data ?? []);
      } catch {
        return undefined; // honest off on any read failure
      }
    },

    /* ----- Location-assist gate (read FRESH per call; all-off on failure) -----
       NOT cached: an operator enabling/disabling the gate must take effect on the
       next read (next CaseDetail mount), not require a full app reload. The read is
       two small env-var-table queries, run only when a case is opened. */
    getLocationAssistGate: (): Promise<LocationAssistGate> => fetchLocationAssistGate(),

    /* ----- App intake preference: hold new cases by default (read fresh) ----- */
    getHoldNewCasesDefault: async (): Promise<boolean> => {
      const defsSvc = services.environmentVariableDefinitions;
      const valsSvc = services.environmentVariableValues;
      if (!defsSvc || !valsSvc) return false;
      try {
        const [defsRes, valsRes] = await Promise.all([
          defsSvc.getAll({
            select: ['environmentvariabledefinitionid', 'schemaname', 'defaultvalue'],
            filter: `schemaname eq '${HOLD_NEW_CASES_SCHEMA}'`,
          }),
          valsSvc.getAll({ select: ['value', '_environmentvariabledefinitionid_value'] }),
        ]);
        return holdNewCasesFromRows(defsRes.data ?? [], valsRes.data ?? []);
      } catch {
        return false; // honest off on any read failure
      }
    },

    // The ONE Code-App env-var WRITE: upsert the hold-by-default value row. The var
    // ships default-only (no value row), so the FIRST toggle on any environment hits
    // CREATE (binds the definition via @odata.bind); later toggles UPDATE by value-id.
    // Needs env-var customization rights + the env-var tables wired into the seam.
    setHoldNewCasesDefault: async (value): Promise<void> => {
      const defsSvc = services.environmentVariableDefinitions;
      const valsSvc = services.environmentVariableValues;
      if (!defsSvc || !valsSvc) {
        throw new Error('Environment-variable tables are not wired (pac add-data-source).');
      }
      const defRes = await defsSvc.getAll({
        select: ['environmentvariabledefinitionid'],
        filter: `schemaname eq '${HOLD_NEW_CASES_SCHEMA}'`,
      });
      const defId = (defRes.data ?? [])[0]?.environmentvariabledefinitionid;
      if (!defId) throw new Error('Hold-by-default environment variable is not deployed.');
      const valsRes = await valsSvc.getAll({
        select: ['environmentvariablevalueid', '_environmentvariabledefinitionid_value'],
      });
      const existing = (valsRes.data ?? []).find(
        (v) => v._environmentvariabledefinitionid_value === defId,
      );
      const valueStr = value ? 'true' : 'false';
      if (existing?.environmentvariablevalueid) {
        await valsSvc.update(existing.environmentvariablevalueid, { value: valueStr });
      } else {
        await valsSvc.create({
          value: valueStr,
          'EnvironmentVariableDefinitionId@odata.bind': `/environmentvariabledefinitions(${defId})`,
        });
      }
    },
  };

  /* QUEUES is referenced for its statuses via queueByName; keep the import alive
     for readers and future filter-builders. */
  void QUEUES;
}

/** Format a Dataverse DateTime (ISO) as DD/MM/YYYY HH:mm for the activity feed. */
function formatOccurredAt(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ----------  AuditEvent row -> ActivityEvent  ----------
   The flows write a cr1bd_auditevent for every auto / extraction action
   (parser_called, enrichment_called, provider_matched, duplicate_dropped,
   status_changed, …). Read the REAL columns: derive the kind from cr1bd_action
   via the choiceset codec, take the summary from cr1bd_name, and the time from
   cr1bd_occurredat — so each action surfaces with its correct badge, newest
   first. (No cr1bd_vrm on the audit row; the plate is omitted.) */
function auditToActivity(rec: import('./types').AuditEventRecord): ActivityEvent {
  const action = auditActionCodec.toName(
    rec.cr1bd_action == null ? undefined : Number(rec.cr1bd_action),
  );
  return {
    id: rec.cr1bd_auditeventid ?? '',
    caseId: rec._cr1bd_caseid_value ?? '',
    vrm: '',
    kind: auditActionToActivityKind(action),
    actor: rec.cr1bd_actor ?? 'System',
    timestamp: formatOccurredAt(rec.cr1bd_occurredat),
    description: rec.cr1bd_name ?? rec.cr1bd_after ?? action ?? '',
  };
}

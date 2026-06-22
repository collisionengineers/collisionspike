/* ============================================================
   Collision Engineers — Code App DATA SEAM: Dataverse source.

   Implements `DataAccess` against an injected `GeneratedServices` bundle (the
   local model of what `pac code add-data-source` emits), using adapter.ts to map
   cr1bd_* logical-name records <-> the camelCase domain types and the choice-set
   integers <-> the string-enum unions.

   AUTHORED FOR DEPLOY, NOT WIRED BY DEFAULT. It imports NO SDK and NO
   `src/generated/` module — only the LOCAL `GeneratedServices` interface, which
   the real pac-generated services satisfy structurally and which the caller
   injects at runtime. The default build keeps using the mock source, so the
   'no @microsoft/power-apps import in src' grep gate stays green.

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
  SuggestedAddress,
} from './types';
import { BOX_ENV_VAR_SCHEMA_NAMES, boxGatesFromRows } from './box-gates';

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
      // The case's principal lives in the work-provider value (e.g. 'AX'). The
      // old `cr1bd_provider_code` column does not exist on the row, so reading it
      // always yielded '' — which dropped through to "return all" and showed
      // every provider's addresses. Read the work-provider value instead.
      const providerCode = caseRes.data?.cr1bd_evaworkprovider?.trim() ?? '';
      const res = await svc.getAll({
        filter: "startswith(cr1bd_sourcelabel,'suggested')",
      });
      const all = (res.data ?? []).filter(isSuggestedAddressRecord).map(suggestionFromRecord);
      if (!providerCode) return all;
      const scoped = all.filter((s) => !s.providerCode || s.providerCode === providerCode);
      // If the provider has no scoped candidates, fall back to all suggestions so
      // the reviewer still sees the catalogue rather than an empty panel.
      return scoped.length > 0 ? scoped : all;
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
      const res = await services.auditEvents.getAll({ orderBy: ['cr1bd_timestamp desc'] });
      return (res.data ?? []).map(auditToActivity);
    },
    activityForCase: async (caseId): Promise<ActivityEvent[]> => {
      const res = await services.auditEvents.getAll({
        filter: `_cr1bd_caseid_value eq ${caseId}`,
        orderBy: ['cr1bd_timestamp desc'],
      });
      return (res.data ?? []).map(auditToActivity);
    },

    /* ----- Box feature gates (cached env-var read; all-false on failure) ----- */
    getBoxGates: (): Promise<BoxGates> => {
      if (!boxGatesCache) boxGatesCache = fetchBoxGates();
      return boxGatesCache;
    },
  };

  /* QUEUES is referenced for its statuses via queueByName; keep the import alive
     for readers and future filter-builders. */
  void QUEUES;
}

/* ----------  AuditEvent row -> ActivityEvent  ---------- */
function auditToActivity(rec: import('./types').AuditEventRecord): ActivityEvent {
  return {
    id: rec.cr1bd_auditeventid ?? '',
    caseId: rec._cr1bd_caseid_value ?? '',
    vrm: rec.cr1bd_vrm ?? '',
    kind: 'status_change',
    actor: rec.cr1bd_actor ?? 'System',
    timestamp: rec.cr1bd_timestamp ?? '',
    description: rec.cr1bd_description ?? String(rec.cr1bd_action ?? ''),
  };
}

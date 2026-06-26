/* ============================================================
   Collision Engineers — REST DataAccess client (plan 30 §2).

   `createRestDataAccess(opts)` returns a DataAccess that calls the P3
   BFF API (api/) over fetch + Bearer token.  The API returns domain JSON
   already (camelCase), so this is a thin HTTP layer — no cr1bd_* records,
   no Dataverse choice integers, no OData on the client.

   Design choices:
   - Bearer token is acquired inside `call()` via `opts.getToken()` (the
     MSAL thunk from auth/msalConfig.ts — acquireTokenSilent, redirect
     fallback).  Token acquisition is OPAQUE to the data hooks; it never
     appears in query args or component state.
   - `safe(p, fallback)` mirrors the existing "honest off / honest empty"
     contract baked into the DataAccess JSDoc: gate/aggregate reads
     NEVER throw a feature on by accident — they resolve to the all-off
     baseline on any failure.
   - `ApiCall` is exported so the three REST transports (parser, location-
     assist, box) can share the same authenticated helper without re-
     acquiring the token independently.
   ============================================================ */

import type {
  DataAccess,
  CreateCaseInput,
  CreateCaseResult,
  SuggestedAddress,
  InspectionDecisionInput,
  SaveInspectionDecisionResult,
  BoxGates,
  LocationAssistGate,
  InboundEmail,
  InboundFacet,
  InboundCounts,
  TriageState,
  InspectionAddressCounts,
  MergeCasesResult,
} from '@cs/domain';
import type { Case, Evidence, Provider, ActivityEvent } from '@cs/domain';
import type {
  QueueName,
  LiveCounts,
  Throughput,
  AgingExceptions,
  PipelineStage,
  ReasonFacet,
} from '@cs/domain';
import {
  BOX_GATES_ALL_FALSE,
  LOCATION_ASSIST_GATE_ALL_OFF,
  INBOUND_COUNTS_ZERO,
} from '@cs/domain';

export interface RestClientOptions {
  /** API origin, e.g. https://cespk-api-dev.azurewebsites.net (Vite env at build time). */
  baseUrl: string;
  /** Returns a fresh Entra access token for the API scope (MSAL acquireTokenSilent). */
  getToken: () => Promise<string>;
}

/** The authenticated HTTP helper shared with the three REST transports. */
export type ApiCall = <T>(method: string, path: string, body?: unknown) => Promise<T>;

export function createRestDataAccess(opts: RestClientOptions): DataAccess {
  const base = opts.baseUrl.replace(/\/$/, '');

  const call: ApiCall = async <T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> => {
    const token = await opts.getToken();              // Bearer injected HERE, not in query args
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 204) return undefined as T;
    if (!res.ok)
      throw new Error(
        `${method} ${path} → ${res.status} ${await res.text().catch(() => '')}`,
      );
    return (await res.json()) as T;
  };

  const get = <T>(p: string) => call<T>('GET', p);
  const post = <T>(p: string, b?: unknown) => call<T>('POST', p, b);

  // "Honest off / honest empty" wrapper: a gate or aggregate read NEVER 5xx
  // the UI on a soft failure — it resolves to the documented all-off baseline.
  const safe = <T>(p: () => Promise<T>, fallback: T): Promise<T> =>
    p().catch(() => fallback);

  const enc = encodeURIComponent;

  return {
    /* ----- Cases ----- */
    // 404 resolves undefined (plan 21 §21.1: "404 if absent → SPA maps to undefined").
    // call() encodes the status in the error message ("GET /path → 404 …"); we match
    // that to distinguish a genuine "not found" from any other non-ok status.
    caseById: (id) =>
      get<Case | undefined>(`/api/cases/${enc(id)}`).catch((e: unknown) =>
        /→ 404\b/.test(String(e)) ? undefined : Promise.reject(e),
      ),
    createCase: (input: CreateCaseInput) => post<CreateCaseResult>('/api/cases', input),
    casesForQueue: (name) => get<Case[]>(`/api/queues/${enc(name)}/cases`),
    openVrmTwins: (vrm, exclude) =>
      get<Case[]>(
        `/api/cases?vrm=${enc(vrm)}&open=true${exclude ? `&exclude=${enc(exclude)}` : ''}`,
      ),
    setOnHold: (id, onHold) => post<void>(`/api/cases/${enc(id)}/hold`, { onHold }),
    mergeCandidates: (id) => get<Case[]>(`/api/cases/${enc(id)}/merge-candidates`),
    mergeCases: (src, tgt) =>
      post<MergeCasesResult>(`/api/cases/${enc(tgt)}/merge`, { sourceCaseId: src }),

    /* ----- Evidence ----- */
    imagesForCase: (id) => get<Evidence[]>(`/api/cases/${enc(id)}/images`),

    /* ----- Providers (corpus) ----- */
    providers: () => get<Provider[]>('/api/providers'),
    // 404 resolves undefined (plan 21 §21.1: same contract as caseById above).
    providerByCode: (code) =>
      get<Provider | undefined>(`/api/providers/${enc(code)}`).catch((e: unknown) =>
        /→ 404\b/.test(String(e)) ? undefined : Promise.reject(e),
      ),

    /* ----- Inspection-address suggestions (honest [] on failure) ----- */
    inspectionAddressSuggestions: (id) =>
      safe(
        () => get<SuggestedAddress[]>(`/api/cases/${enc(id)}/inspection-suggestions`),
        [],
      ),
    inspectionAddressCounts: () =>
      safe(
        () => get<InspectionAddressCounts>('/api/inspection-addresses/counts'),
        { confirmed: 0, suggested: 0 },
      ),
    saveInspectionDecision: (id, d: InspectionDecisionInput) =>
      post<SaveInspectionDecisionResult>(
        `/api/cases/${enc(id)}/inspection-decision`,
        d,
      ),

    /* ----- Dashboard aggregates (computed server-side) ----- */
    liveCounts: () => get<LiveCounts>('/api/dashboard/live-counts'),
    throughput: () => get<Throughput>('/api/dashboard/throughput'),
    agingExceptions: () => get<AgingExceptions>('/api/dashboard/aging-exceptions'),
    queueCounts: () => get<Record<QueueName, number>>('/api/dashboard/queue-counts'),
    reasonCounts: () => get<ReasonFacet[]>('/api/dashboard/reason-counts'),
    pipelineStages: () => get<PipelineStage[]>('/api/dashboard/pipeline-stages'),

    /* ----- Activity feed ----- */
    recentActivity: () => get<ActivityEvent[]>('/api/activity'),
    activityForCase: (id) => get<ActivityEvent[]>(`/api/cases/${enc(id)}/activity`),

    /* ----- Box gates (honest BOX_GATES_ALL_FALSE on failure) ----- */
    getBoxGates: () =>
      safe(() => get<BoxGates>('/api/gates/box'), { ...BOX_GATES_ALL_FALSE }),
    getBoxFileRequestTemplateId: () =>
      safe(
        () =>
          get<{ templateId: string | null }>('/api/gates/box/file-request-template').then(
            (r) => r.templateId ?? undefined,
          ),
        undefined,
      ),

    /* ----- Location-assist gate (honest all-off on failure) ----- */
    getLocationAssistGate: () =>
      safe(
        () => get<LocationAssistGate>('/api/gates/location-assist'),
        { ...LOCATION_ASSIST_GATE_ALL_OFF },
      ),

    /* ----- App intake preferences ----- */
    getHoldNewCasesDefault: () =>
      safe(
        () => get<{ value: boolean }>('/api/settings/hold-new-cases').then((r) => r.value),
        false,
      ),
    setHoldNewCasesDefault: (value) =>
      call<void>('PUT', '/api/settings/hold-new-cases', { value }),

    /* ----- Inbox / Triage (honest [] / zero on failure) ----- */
    inboundEmails: (facet?: InboundFacet) =>
      safe(
        () =>
          get<InboundEmail[]>(
            `/api/inbound${
              facet?.category
                ? `?category=${enc(facet.category)}${
                    facet.subtype ? `&subtype=${enc(facet.subtype)}` : ''
                  }`
                : ''
            }`,
          ),
        [],
      ),
    inboundEmailCounts: () =>
      safe(
        () => get<InboundCounts>('/api/inbound/counts'),
        { ...INBOUND_COUNTS_ZERO },
      ),
    setTriageState: (id, state: TriageState) =>
      post<void>(`/api/inbound/${enc(id)}/triage`, { state }),
  };
}

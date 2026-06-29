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
  DashboardSummary,
  RemoveCaseInput,
  RemoveCaseResult,
  NextCasePoResult,
  ProviderUpdateInput,
  ReclassifyInboundInput,
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

/* ============================================================
   DataAccessExt — the seam interface the SPA actually binds to.

   It is the frozen `@cs/domain` `DataAccess` PLUS the work-todo-spike methods
   the BACKEND-API worker shipped (amalgamated dashboard, soft-remove case, the
   Case/PO allocator preview, the Superuser provider PATCH, and the inbound
   reclassify). The base `DataAccess` interface stays in `@cs/domain` (the frozen
   server contract); these additive methods live HERE in the data layer so the
   SPA can call them without re-minting the shared contract. `getDataAccess()`,
   the rest client, and the mock source all speak `DataAccessExt`.

   NOTE: `updateCase` and `inboundEmails` are NOT re-declared — their signatures
   are unchanged; the widening is in the DTOs they already accept
   (`CaseUpdateInput.evaFields`, `InboundFacet.view`).
   ============================================================ */
export interface DataAccessExt extends DataAccess {
  /** ONE-call amalgamated dashboard (case pipeline + inbound). `now` windows
   *  server aggregates against the CLIENT clock. NOT safe()-wrapped — a failure
   *  surfaces so the dashboard shows its error panel (matches the prior bundle). */
  dashboardSummary(now?: Date): Promise<DashboardSummary>;
  /** Superuser SOFT-remove (status -> terminal 'removed'; row + audit KEPT).
   *  Throws on non-2xx; surfaces `boxFolderUrl` so the operator can handle the
   *  archive folder separately (it is NEVER auto-deleted). */
  removeCase(id: string, input: RemoveCaseInput): Promise<RemoveCaseResult>;
  /** Preview the next Case/PO for a principal (+ optional 2- or 4-digit year).
   *  PREVIEW only — the durable claim happens under the advisory-locked mint at
   *  case create. */
  nextCasePo(principal: string, year?: string | number): Promise<NextCasePoResult>;
  /** Superuser provider PATCH (automation mode / known sender-domains).
   *  `idOrCode` accepts the provider id GUID or the principal code. */
  updateProvider(idOrCode: string, input: ProviderUpdateInput): Promise<Provider>;
  /** Staff reclassify/override of an inbound email -> the updated row (so the UI
   *  can re-render the chosen vs. suggested category/subtype). Throws on non-2xx. */
  reclassifyInbound(id: string, input: ReclassifyInboundInput): Promise<InboundEmail>;
}

export function createRestDataAccess(opts: RestClientOptions): DataAccessExt {
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

  // Dashboard reads accept `?now=<ISO-8601>` so the server windows (today / this
  // week, Monday-anchored) against the CLIENT's clock, not the server's. The hooks
  // pass `now`; absent => the server falls back to its own now(). This was being
  // dropped — the `now` arg never reached the URL, so client/server windows could
  // disagree across timezones / clock skew.
  const nowQ = (now?: Date) => (now ? `?now=${enc(now.toISOString())}` : '');

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
    // Human-correction write path (issue #12): PATCH the case with a partial body
    // (`{ vrm }`) → 200 + the updated Case JSON. DELIBERATELY NOT safe()-wrapped — a
    // failed VRM correction MUST reach the operator (a silent swallow would let them
    // believe a mis-extracted registration was fixed when it wasn't). call() encodes
    // any non-ok status in the thrown error so the screen can toast + keep the editor open.
    updateCase: (id, patch) => call<Case>('PATCH', `/api/cases/${enc(id)}`, patch),
    casesForQueue: (name) => get<Case[]>(`/api/queues/${enc(name)}/cases`),
    openVrmTwins: (vrm, exclude) =>
      get<Case[]>(
        `/api/cases?vrm=${enc(vrm)}&open=true${exclude ? `&exclude=${enc(exclude)}` : ''}`,
      ),
    setOnHold: (id, onHold) => post<void>(`/api/cases/${enc(id)}/hold`, { onHold }),
    mergeCandidates: (id) => get<Case[]>(`/api/cases/${enc(id)}/merge-candidates`),
    mergeCases: (src, tgt) =>
      post<MergeCasesResult>(`/api/cases/${enc(tgt)}/merge`, { sourceCaseId: src }),
    // Superuser SOFT-remove (work-todo-spike: ui-changes/delete-case). DELETE with a
    // JSON body (the audit-only ack flag + reason). DELIBERATELY NOT safe()-wrapped — a
    // failed remove MUST reach the operator (never a fake success); call() throws on any
    // non-2xx and decodes 200 -> RemoveCaseResult (which surfaces boxFolderUrl).
    removeCase: (id, input: RemoveCaseInput) =>
      call<RemoveCaseResult>('DELETE', `/api/cases/${enc(id)}`, input),
    // Case/PO allocator PREVIEW (work-todo-spike: box/case-po-gen). `year` is optional
    // (2- or 4-digit); omitted -> the server uses the current year. A read, but NOT
    // safe()-wrapped: a failed preview surfaces to the reviewer rather than silently
    // showing a wrong "next" number.
    nextCasePo: (principal: string, year?: string | number) =>
      get<NextCasePoResult>(
        `/api/cases/next-po?principal=${enc(principal)}${
          year !== undefined && year !== '' ? `&year=${enc(String(year))}` : ''
        }`,
      ),

    /* ----- Evidence ----- */
    imagesForCase: (id) => get<Evidence[]>(`/api/cases/${enc(id)}/images`),

    /* ----- Providers (corpus) ----- */
    providers: () => get<Provider[]>('/api/providers'),
    // 404 resolves undefined (plan 21 §21.1: same contract as caseById above).
    providerByCode: (code) =>
      get<Provider | undefined>(`/api/providers/${enc(code)}`).catch((e: unknown) =>
        /→ 404\b/.test(String(e)) ? undefined : Promise.reject(e),
      ),
    // Superuser provider PATCH (work-todo-spike: automation-mode + acme). principal_code
    // is IMMUTABLE (not in ProviderUpdateInput). A mutation — NOT safe()-wrapped — so a
    // failed trust-level / domain-list change reaches the operator; returns the full Provider.
    updateProvider: (idOrCode, input: ProviderUpdateInput) =>
      call<Provider>('PATCH', `/api/providers/${enc(idOrCode)}`, input),

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

    /* ----- Dashboard aggregates (computed server-side; client `now` threaded) ----- */
    // ONE-call amalgamated summary (work-todo-spike: amalgamated-dashboard): case
    // pipeline + inbound in a single request, replacing the prior multi-call fan-out.
    // NOT safe()-wrapped — a failure rejects so the dashboard renders its error panel
    // (the per-aggregate reads below stay for any screen that still needs them à la carte).
    dashboardSummary: (now) => get<DashboardSummary>(`/api/dashboard${nowQ(now)}`),
    liveCounts: (now) => get<LiveCounts>(`/api/dashboard/live-counts${nowQ(now)}`),
    throughput: (now) => get<Throughput>(`/api/dashboard/throughput${nowQ(now)}`),
    agingExceptions: (now) => get<AgingExceptions>(`/api/dashboard/aging-exceptions${nowQ(now)}`),
    // safe()-wrapped like the other aggregate reads: a 5xx must never crash the nav
    // badges / dashboard — degrade to the zero baseline (sweep #12).
    queueCounts: (now) =>
      safe(
        () => get<Record<QueueName, number>>(`/api/dashboard/queue-counts${nowQ(now)}`),
        { 'not-ready': 0, review: 0, held: 0 } as Record<QueueName, number>,
      ),
    reasonCounts: (now) =>
      safe(() => get<ReasonFacet[]>(`/api/dashboard/reason-counts${nowQ(now)}`), []),
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

    /* ----- Inbox / Triage ----- */
    // The inbox LIST is deliberately NOT safe()-wrapped: a 5xx / timeout must
    // reach the screen as an error / retry state, never masquerade as an empty
    // inbox (which is what swallowing the error to `[]` did — a transient API
    // failure looked exactly like "no email"). The COUNTS read below STAYS
    // safe() — a zero badge degrades cleanly and must never crash the nav.
    inboundEmails: (facet?: InboundFacet) => {
      // category / subtype / view are each threaded only when present (order:
      // category, subtype, view), so `view=active|handled|all` reaches the server
      // even when no category facet is set (active-first list scope #email-management).
      const parts: string[] = [];
      if (facet?.category) parts.push(`category=${enc(facet.category)}`);
      if (facet?.subtype) parts.push(`subtype=${enc(facet.subtype)}`);
      if (facet?.view) parts.push(`view=${enc(facet.view)}`);
      const q = parts.length ? `?${parts.join('&')}` : '';
      return get<InboundEmail[]>(`/api/inbound${q}`);
    },
    inboundEmailCounts: () =>
      safe(
        () => get<InboundCounts>('/api/inbound/counts'),
        { ...INBOUND_COUNTS_ZERO },
      ),
    setTriageState: (id, state: TriageState) =>
      post<void>(`/api/inbound/${enc(id)}/triage`, { state }),
    // Staff reclassify/override (work-todo-spike: suggested-tags-and-folders). PATCH the
    // classification with EITHER an explicit category/subtype OR a richer-taxonomy `tag`
    // (mapped server-side). A mutation — NOT safe()-wrapped — returning the updated row so
    // the screen re-renders the chosen-vs-suggested marker.
    reclassifyInbound: (id, input: ReclassifyInboundInput) =>
      call<InboundEmail>('PATCH', `/api/inbound/${enc(id)}/classification`, input),
  };
}

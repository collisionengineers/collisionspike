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
  AiSuggestion,
  AiSuggestionReviewInput,
  AiSuggestionReviewResult,
  GenerateAiSuggestionsResult,
  AiAssistGate,
  AssistantChatTurn,
  AssistantReply,
  ProposedAction,
  OutlookMoveGate,
  ProviderApiKey,
  CreateProviderApiKeyInput,
  CreateProviderApiKeyResult,
} from '@cs/domain';
import type { Case, Chaser, Evidence, Provider, ActivityEvent } from '@cs/domain';
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
  AI_ASSIST_GATE_ALL_OFF,
  OUTLOOK_MOVE_GATE_ALL_OFF,
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
/** Input for recording a chase against a case (M-E2). The chase is RECORDED,
 *  never sent — sending stays a person action (review #10), so there is no
 *  send flag here, only what was chased and how. */
export interface LogChaseInput {
  channel: 'email' | 'whatsapp';
  templateLabel: string;
  note?: string;
}

/** Result of `POST /api/inbound/{id}/detach` (rules-engine-v2 Phase 2 — unlink an
 *  inbound email from its case). */
export interface DetachInboundResult {
  ok: boolean;
}

/* ----- Global search (TKT-072) — GET /api/search?q= result shapes ----- */
export interface SearchCaseHit {
  id: string;
  casePo: string | null;
  vrm: string | null;
  vrmCanonical: string | null;
  ref: string | null;
  queue: string;
  claimant: string | null;
  provider: string | null;
}
export interface SearchEmailHit {
  id: string;
  subject: string | null;
  from: string | null;
  received: string | null;
  category: string;
  caseId: string | null;
}
export interface SearchProviderHit {
  id: string;
  displayName: string | null;
  principalCode: string | null;
}
export interface GlobalSearchResults {
  query: string;
  tooShort: boolean;
  /** true when the server returned the gate-off honest-empty payload. */
  disabled?: boolean;
  cases: SearchCaseHit[];
  emails: SearchEmailHit[];
  providers: SearchProviderHit[];
  truncated: { cases: boolean; emails: boolean; providers: boolean };
}
/** Result of POST /api/cases/{id}/evidence/upload (TKT-068). */
export interface EvidenceUploadResult {
  added: Array<{ fileName: string }>;
  rejected: Array<{ fileName: string; reason: string }>;
  status: number;
}

export const EMPTY_SEARCH: GlobalSearchResults = {
  query: '',
  tooShort: false,
  cases: [],
  emails: [],
  providers: [],
  truncated: { cases: false, emails: false, providers: false },
};

/** Result of `POST /api/inbound/{id}/outlook-move` (TKT-054 / 020726 E6). */
export interface OutlookMoveResult {
  queued: boolean;
  /** The server-derived destination, e.g. "Inbox/Instructions". */
  folder: string;
}

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
  /** Record a chase against a case (M-E2). POST → 201 returning the created
   *  chaser row in the SAME shape the case-detail read returns. Throws on
   *  non-2xx — a chase that didn't persist must never look logged. */
  logChase(caseId: string, input: LogChaseInput): Promise<Chaser>;

  /* ----- AI suggestion layer (TKT-015) — observation-first, GATED ----- */
  /** Pending + recently-reviewed AI suggestions for a case. safe()-empty on failure
   *  (the panel only renders when AI_ASSIST_ENABLED, so an empty read is harmless). */
  aiSuggestions(caseId: string): Promise<AiSuggestion[]>;
  /** Record the human decision on a suggestion (accept/reject). On accept the server
   *  MAY promote the value into its target field FILL-IF-EMPTY. Throws on non-2xx. */
  reviewAiSuggestion(id: string, input: AiSuggestionReviewInput): Promise<AiSuggestionReviewResult>;
  /** Ask the server to generate suggestions for a case. Honest no-op
   *  `{ generated: 0, reason: 'disabled' }` when the gate is off / no model configured. */
  generateAiSuggestions(caseId: string): Promise<GenerateAiSuggestionsResult>;
  /** The AI-assist feature gate (honest all-off on failure) — the SPA panel keys on `enabled`. */
  getAiAssistGate(): Promise<AiAssistGate>;
  /** AI chat helper (TKT-060): send the turn history, get the assistant's reply. */
  assistantChat(messages: AssistantChatTurn[]): Promise<AssistantReply>;
  /** The AI-chat feature gate (honest { enabled:false } on failure). */
  getAiChatGate(): Promise<{ enabled: boolean }>;
  /** Global search (TKT-072): one normalised query across cases / inbound email / providers.
   *  safe()-empty on failure; the server returns disabled+empty while GLOBAL_SEARCH_ENABLED is off. */
  globalSearch(q: string): Promise<GlobalSearchResults>;
  /** Re-fetch a case plus its version ETag — the assistant write tier's independent state check
   *  (TKT-111) before rendering a confirmation diff. {} when the case is gone. */
  caseWithVersion(id: string): Promise<{ case?: Case; etag?: string }>;
  /** Execute a CONFIRMED assistant proposal against its existing staff-authorized route
   *  (TKT-111). Sends the re-fetched version as If-Match so a stale write returns 409. Returns the
   *  HTTP status + the new ETag; never throws (the card interprets the status). */
  executeProposal(action: ProposedAction, ifMatchToken?: string): Promise<{ ok: boolean; status: number; etag?: string }>;
  /** Upload staff-attached evidence files to a case (TKT-068) — multipart POST. The model never
   *  uploads; these bytes come from the user's file picker. Returns which files landed / were
   *  rejected (with plain-language reasons) plus the HTTP status. Never throws. */
  uploadEvidence(caseId: string, files: File[]): Promise<EvidenceUploadResult>;
  /** Evidence inline preview (TKT-048): authenticated fetch → a `blob:` object URL for an
   *  <img>, or undefined when there's no inline content (Box-only / bytes gone). The caller
   *  MUST URL.revokeObjectURL it on unmount. */
  evidenceContentUrl(id: string): Promise<string | undefined>;

  /* ----- Inbound suggestion affordance — ref-gate (rules-engine-v2 Phase 2) -----
     Distinct from `aiSuggestions` above (case-scoped): keyed by the INBOUND EMAIL
     id, this backs the inbox preview panel's "looks like an open case" / "may be a
     cancellation" banner. Accept/reject reuses `reviewAiSuggestion` above — there is
     no separate inbound-scoped review endpoint. */
  /** Pending (+ recently-reviewed) AI suggestions for ONE inbound email, pending
   *  first. safe()-empty on failure — a secondary, suggestion-only surface, so a
   *  soft failure just means the banner doesn't render, never a crash. */
  inboundSuggestions(id: string): Promise<AiSuggestion[]>;
  /** Unlink a linked inbound email from its case. The case's already-filed archive
   *  copy is untouched (Box stays a one-way additive mirror — ADR-0012/0017; flagged
   *  for manual tidy-up, never auto-removed). Throws on non-2xx — never a fake unlink. */
  detachInbound(id: string): Promise<DetachInboundResult>;

  /* ----- Outlook filing (TKT-054 / 020726 E6) — GATED ----- */
  /** The Outlook-move gate (honest all-off on failure) — the "Suggested action"
   *  column renders an actionable button only when `enabled`. */
  getOutlookMoveGate(): Promise<OutlookMoveGate>;
  /** Queue the REAL Outlook filing of one inbound email into its suggested folder
   *  (server-derived — no folder is sent). Throws on non-2xx (409 while the gate is
   *  off / already filed; 503 when the queue is unreachable) — never a fake "Filing…". */
  moveInboundToOutlook(id: string): Promise<OutlookMoveResult>;

  /* ----- Provider API keys (TKT-055 / ADR-0020) — Superuser, provider intake channel -----
     OPTIONAL on the seam: the REST client implements them; the empty/unconfigured
     mock source (mock-source.ts) omits them (the provider-API-key channel has no mock),
     so callers optional-chain and treat an absent method as "channel unavailable". */
  /** List a provider's API keys (never the plaintext). `idOrCode` = provider id GUID or
   *  principal code. Throws on non-2xx (403 for a non-Superuser). */
  listProviderApiKeys?(idOrCode: string): Promise<ProviderApiKey[]>;
  /** Mint a new key — the plaintext secret is returned ONCE and never recoverable.
   *  Throws on non-2xx; the UI must warn the operator to copy it before dismissing. */
  createProviderApiKey?(idOrCode: string, input: CreateProviderApiKeyInput): Promise<CreateProviderApiKeyResult>;
  /** Soft-revoke a key (revoked_at := now()). Returns the updated row; throws on non-2xx. */
  revokeProviderApiKey?(idOrCode: string, keyId: string): Promise<ProviderApiKey>;
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

  /** Authenticated GET → a `blob:` object URL (for <img>, since an <img> can't send the
   *  bearer and the API is a different origin). Undefined on any non-2xx; caller revokes. */
  const blobUrl = async (path: string): Promise<string | undefined> => {
    try {
      const token = await opts.getToken();
      const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return undefined;
      return URL.createObjectURL(await res.blob());
    } catch {
      return undefined;
    }
  };

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
    // Record a chase (M-E2) — 201 + the created chaser row. NOT safe()-wrapped:
    // a chase that failed to persist must surface (never a fake "logged").
    logChase: (caseId, input) => post<Chaser>(`/api/cases/${enc(caseId)}/chase`, input),
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
    inspectionAddressSuggestions: (id, q) =>
      safe(
        () =>
          get<SuggestedAddress[]>(
            `/api/cases/${enc(id)}/inspection-suggestions${q ? `?q=${enc(q)}` : ''}`,
          ),
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

    /* ----- AI suggestion layer (TKT-015) ----- */
    // The LIST read is safe()-wrapped to honest [] (mirrors the API's own honest-empty
    // GET): the panel is a secondary, gated surface — a soft failure shows nothing, never
    // a crash. The review + generate WRITES are NOT safe()-wrapped — a failed accept/reject
    // or generate must reach the operator (never a fake success); the hooks surface it.
    aiSuggestions: (id) =>
      safe(() => get<AiSuggestion[]>(`/api/cases/${enc(id)}/ai-suggestions`), []),
    reviewAiSuggestion: (id, input: AiSuggestionReviewInput) =>
      post<AiSuggestionReviewResult>(`/api/ai-suggestions/${enc(id)}/review`, input),
    // Defensive over a body-less 2xx (TKT-127: the operator saw a "204 - no content" row):
    // call() maps a 204 to `undefined`, which would crash `result.generated` in the panel
    // and read as a SILENT nothing. The server contract always returns a JSON body, so an
    // undefined here is a fault — surface it as an explicit error-shaped result the UI explains.
    generateAiSuggestions: async (id) => {
      const r = await post<GenerateAiSuggestionsResult>(
        `/api/cases/${enc(id)}/ai-suggestions/generate`,
      );
      return r ?? { generated: 0, reason: 'error' };
    },
    getAiAssistGate: () =>
      safe(() => get<AiAssistGate>('/api/gates/ai-assist'), { ...AI_ASSIST_GATE_ALL_OFF }),
    assistantChat: (messages) =>
      call<AssistantReply>('POST', '/api/assistant/chat', { messages }),
    getAiChatGate: () => safe(() => get<{ enabled: boolean }>('/api/gates/ai-chat'), { enabled: false }),
    globalSearch: (q) =>
      safe(() => get<GlobalSearchResults>(`/api/search?q=${encodeURIComponent(q)}`), { ...EMPTY_SEARCH, query: q }),
    caseWithVersion: async (id) => {
      const token = await opts.getToken();
      const res = await fetch(`${base}/api/cases/${enc(id)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return {};
      const c = (await res.json()) as Case;
      return { case: c, etag: res.headers.get('etag') ?? undefined };
    },
    executeProposal: async (action, ifMatchToken) => {
      const token = await opts.getToken();
      const res = await fetch(`${base}/api/${action.path}`, {
        method: action.method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(ifMatchToken ? { 'If-Match': ifMatchToken } : {}),
        },
        body: JSON.stringify(action.body),
      });
      return { ok: res.ok, status: res.status, etag: res.headers.get('etag') ?? undefined };
    },
    uploadEvidence: async (caseId, files) => {
      try {
        const token = await opts.getToken();
        const fd = new FormData();
        for (const f of files) fd.append('file', f);
        // NB: no Content-Type header — the browser sets the multipart boundary itself.
        const res = await fetch(`${base}/api/cases/${enc(caseId)}/evidence/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const json = (await res.json().catch(() => ({ added: [], rejected: [] }))) as {
          added?: Array<{ fileName: string }>;
          rejected?: Array<{ fileName: string; reason: string }>;
        };
        return { added: json.added ?? [], rejected: json.rejected ?? [], status: res.status };
      } catch {
        return { added: [], rejected: [], status: 0 };
      }
    },
    evidenceContentUrl: (id) => blobUrl(`/api/evidence/${enc(id)}/content`),

    /* ----- Inbound suggestions — ref-gate affordance (rules-engine-v2 Phase 2) ----- */
    inboundSuggestions: (id) =>
      safe(() => get<AiSuggestion[]>(`/api/inbound/${enc(id)}/suggestions`), []),
    // Mutation — NOT safe()-wrapped: a failed unlink must reach the operator (never a
    // fake success); throws on non-2xx like every other write in this client.
    detachInbound: (id) => post<DetachInboundResult>(`/api/inbound/${enc(id)}/detach`),

    /* ----- Outlook filing (TKT-054 / 020726 E6) ----- */
    getOutlookMoveGate: () =>
      safe(() => get<OutlookMoveGate>('/api/gates/outlook-move'), { ...OUTLOOK_MOVE_GATE_ALL_OFF }),
    // Mutation — NOT safe()-wrapped: a 409/503 must reach the operator as a toast,
    // never a phantom "Filing…" on a row the server refused.
    moveInboundToOutlook: (id) => post<OutlookMoveResult>(`/api/inbound/${enc(id)}/outlook-move`),

    /* ----- Provider API keys (TKT-055 / ADR-0020) — Superuser ----- */
    // List a provider's keys (never the plaintext). NOT safe()-wrapped — a failed read in
    // the Admin API-keys panel must surface (a 403 for a non-Superuser is meaningful).
    listProviderApiKeys: (idOrCode) =>
      get<ProviderApiKey[]>(`/api/providers/${enc(idOrCode)}/api-keys`),
    // Mint a key — returns the plaintext ONCE. NOT safe()-wrapped: a failed mint must reach
    // the operator, and a fake success would strand them without the (unrecoverable) secret.
    createProviderApiKey: (idOrCode, input: CreateProviderApiKeyInput) =>
      post<CreateProviderApiKeyResult>(`/api/providers/${enc(idOrCode)}/api-keys`, input),
    // Soft-revoke a key. DELETE — throws on non-2xx; returns the updated (revoked) row.
    revokeProviderApiKey: (idOrCode, keyId) =>
      call<ProviderApiKey>('DELETE', `/api/providers/${enc(idOrCode)}/api-keys/${enc(keyId)}`),
  };
}

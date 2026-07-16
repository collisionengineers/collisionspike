/* Authenticated REST data source for the staff web app. */

/* Authenticated REST data source for the staff web app. */
import type { CreateCaseInput, CreateCaseOptions, CreateCaseResult, SuggestedAddress, InspectionDecisionInput, SaveInspectionDecisionResult, BoxGates, LocationAssistGate, InboundEmail, InboundFacet, InboundCounts, TriageState, InspectionAddressCounts, MergeCasesResult, DashboardSummary, RemoveCaseInput, RemoveCaseResult, NextCasePoResult, ProviderUpdateInput, ReclassifyInboundInput, AiSuggestion, AiSuggestionReviewInput, AiSuggestionReviewResult, GenerateAiSuggestionsResult, AiAssistGate, AssistantReply, ProposedAction, OutlookMoveGate, OutlookMessageLinkResolution, ProviderApiKey, CreateProviderApiKeyInput, CreateProviderApiKeyResult, CaptureSessionListResponse, CaptureSessionSecretResponse, CaptureSessionStaffSummary, DeleteCaseImageGate } from '@cs/domain';
import type { Case, Chaser, Evidence, Provider, ActivityEvent } from '@cs/domain';
import type { QueueName, LiveCounts, Throughput, AgingExceptions, PipelineStage, ReasonFacet } from '@cs/domain';
import { BOX_GATES_ALL_FALSE, LOCATION_ASSIST_GATE_ALL_OFF, AI_ASSIST_GATE_ALL_OFF, OUTLOOK_MOVE_GATE_ALL_OFF, DELETE_CASE_IMAGE_GATE_ALL_OFF } from '@cs/domain';
import type { AiChatGate, ApiCall, ArchiveHoldingResolution, DataAccessExt, DeleteCaseImageResult, DetachInboundResult, GlobalSearchResults, OutlookMoveResult, ProposalExecutionResult, RestClientOptions, VersionedRead, VehicleLookupResult } from './rest-client.types';
import { EMPTY_SEARCH } from './rest-client.types';

export * from './rest-client.types';


/** The staff-facing sentence a failed call carried (the server's `message` field —
 *  attached by `call` below), or undefined when the failure had none. Screens render
 *  THIS in toasts, never the technical `err.message` line (TKT-091). */
export function serverMessageOf(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'serverMessage' in err) {
    const m = (err as { serverMessage?: unknown }).serverMessage;
    if (typeof m === 'string' && m) return m;
  }
  return undefined;
}

export function imageDeletionPendingOf(err: unknown): boolean | undefined {
  if (!err || typeof err !== 'object' || !('deletionPending' in err)) return undefined;
  const value = (err as { deletionPending?: unknown }).deletionPending;
  return typeof value === 'boolean' ? value : undefined;
}

const ASSISTANT_REQUEST_TIMEOUT_MS = 20_000;

/** Bound the two assistant-confirmation network hops. A hung token/fetch promise must
 *  become an explicit retry state instead of leaving the card spinning forever. */
async function settleWithin<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ASSISTANT_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function responseHeader(res: Response, name: string): string | undefined {
  try {
    return res.headers?.get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

function cleanEtag(value: string | undefined): string | undefined {
  const cleaned = value?.trim().replace(/^W\//i, '').replace(/^"|"$/g, '').trim();
  return cleaned || undefined;
}

function requiresProposalVersion(action: ProposedAction): boolean {
  // Every registered write mutates an existing row except create_case. Keeping this
  // deny-by-default means a future capability cannot silently bypass If-Match.
  return action.capability !== 'create_case';
}

export function createRestDataAccess(opts: RestClientOptions): DataAccessExt {
  const base = opts.baseUrl.replace(/\/$/, '');

  const call: ApiCall = async <T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> => {
    const token = await opts.getToken();              // Bearer injected HERE, not in query args
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...extraHeaders,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 204) return undefined as T;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`${method} ${path} → ${res.status} ${text}`) as Error & {
        status?: number;
        serverMessage?: string;
        deletionPending?: boolean;
      };
      err.status = res.status;
      // TKT-091 — when the server sent a staff-facing `message` (plain English), carry
      // it so the UI can render THAT instead of the technical line above.
      try {
        const parsed = JSON.parse(text) as { message?: unknown; deletionPending?: unknown };
        if (typeof parsed.message === 'string' && parsed.message) err.serverMessage = parsed.message;
        if (typeof parsed.deletionPending === 'boolean') err.deletionPending = parsed.deletionPending;
      } catch {
        /* non-JSON body — no server message */
      }
      throw err;
    }
    return (await res.json()) as T;
  };

  const get = <T>(p: string) => call<T>('GET', p);
  const post = <T>(p: string, b?: unknown) => call<T>('POST', p, b);

  /** Authenticated GET → the response Blob. Undefined on any non-2xx / transport failure. */
  const blobOf = async (path: string): Promise<Blob | undefined> => {
    try {
      const token = await opts.getToken();
      const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return undefined;
      return await res.blob();
    } catch {
      return undefined;
    }
  };

  /** Authenticated GET → a `blob:` object URL (for <img>, since an <img> can't send the
   *  bearer and the API is a different origin). Undefined on any non-2xx; caller revokes. */
  const blobUrl = async (path: string): Promise<string | undefined> => {
    const blob = await blobOf(path);
    return blob ? URL.createObjectURL(blob) : undefined;
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

  const versionedRead = async <T>(
    path: string,
    unavailableLabel: string,
  ): Promise<VersionedRead<T>> => {
    const fallback: VersionedRead<T> = {
      state: 'unavailable',
      reason: 'request_failed',
      status: 0,
      error: `The latest ${unavailableLabel} could not be loaded.`,
    };
    const work = (async (): Promise<VersionedRead<T>> => {
      try {
        const token = await opts.getToken();
        const res = await fetch(`${base}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 404) {
          return {
            state: 'unavailable',
            reason: 'not_found',
            status: 404,
            error: `That ${unavailableLabel} could not be found.`,
          };
        }
        if (!res.ok) {
          return {
            state: 'unavailable',
            reason: 'request_failed',
            status: res.status,
            error: `The latest ${unavailableLabel} could not be loaded.`,
          };
        }
        const raw = await res.json().catch(() => undefined);
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
          return {
            state: 'unavailable',
            reason: 'invalid_response',
            status: res.status,
            error: `The latest ${unavailableLabel} could not be checked.`,
          };
        }
        const record = raw as Record<string, unknown>;
        const bodyVersion =
          typeof record.version === 'string' && record.version.trim()
            ? record.version.trim()
            : undefined;
        const etagVersion = cleanEtag(responseHeader(res, 'etag'));
        const version = bodyVersion ?? etagVersion;
        if (!version) {
          return {
            state: 'unavailable',
            reason: 'version_missing',
            status: res.status,
            error: `The latest ${unavailableLabel} could not be safely confirmed.`,
          };
        }
        // `version` is response metadata, not part of the Case/InboundEmail domain row.
        const { version: _version, ...value } = record;
        return {
          state: 'available',
          value: value as T,
          version,
          versionSource: bodyVersion ? 'body' : 'etag',
        };
      } catch {
        return fallback;
      }
    })();
    return settleWithin(work, fallback);
  };

  return {
    /* ----- Cases ----- */
    // 404 resolves undefined (plan 21 §21.1: "404 if absent → SPA maps to undefined").
    // call() encodes the status in the error message ("GET /path → 404 …"); we match
    // that to distinguish a genuine "not found" from any other non-ok status.
    caseById: (id) =>
      get<Case | undefined>(`/api/cases/${enc(id)}`).catch((e: unknown) =>
        /→ 404\b/.test(String(e)) ? undefined : Promise.reject(e),
      ),
    lookupVehicle: (input) => post<VehicleLookupResult>('/api/vehicle-data/lookup', input),
    createCase: (input: CreateCaseInput, options?: CreateCaseOptions) =>
      call<CreateCaseResult>('POST', '/api/cases', input, {
        ...(options?.idempotencyKey
          ? { 'Idempotency-Key': options.idempotencyKey }
          : {}),
        ...(options?.evidenceUploadKey
          ? { 'X-Manual-Intake-Upload-Key': options.evidenceUploadKey }
          : {}),
        ...(options?.expectedEvidenceCount !== undefined
          ? { 'X-Manual-Intake-File-Count': String(options.expectedEvidenceCount) }
          : {}),
        ...(options?.instructionEvidenceIndex !== undefined
          ? { 'X-Manual-Intake-Instruction-Index': String(options.instructionEvidenceIndex) }
          : {}),
      }),
    // Human-correction write path (issue #12): PATCH the case with a partial body
    // (`{ vrm }`) → 200 + the updated Case JSON. DELIBERATELY NOT safe()-wrapped — a
    // failed VRM correction MUST reach the operator (a silent swallow would let them
    // believe a mis-extracted registration was fixed when it wasn't). call() encodes
    // any non-ok status in the thrown error so the screen can toast + keep the editor open.
    updateCase: (id, patch) => call<Case>('PATCH', `/api/cases/${enc(id)}`, patch),
    saveCaseEdits: (id, patch, version) =>
      call<Case>(
        'PATCH',
        `/api/cases/${enc(id)}`,
        { ...patch, editSession: true },
        { 'If-Match': version },
      ),
    casesForQueue: (name) => get<Case[]>(`/api/queues/${enc(name)}/cases`),
    openVrmTwins: (vrm, exclude) =>
      get<Case[]>(
        `/api/cases?vrm=${enc(vrm)}&open=true${exclude ? `&exclude=${enc(exclude)}` : ''}`,
      ),
    // Resolve an EXACT Case/PO (TKT-068 attach-by-Case/PO). safe()-empty: the confirm card
    // treats "no match" and "lookup failed" identically (it prompts for a registration instead).
    openCasePoMatches: (casePo, exclude) =>
      safe(
        () =>
          get<Case[]>(
            `/api/cases?case_po=${enc(casePo)}${exclude ? `&exclude=${enc(exclude)}` : ''}`,
          ),
        [],
      ),
    setOnHold: (id, onHold) => post<void>(`/api/cases/${enc(id)}/hold`, { onHold }),
    // Record a chase (M-E2) — 201 + the created chaser row. NOT safe()-wrapped:
    // a chase that failed to persist must surface (never a fake "logged").
    logChase: (caseId, input) => post<Chaser>(`/api/cases/${enc(caseId)}/chase`, input),
    captureSessions: (caseId) =>
      get<CaptureSessionListResponse>(`/api/cases/${enc(caseId)}/capture-sessions`).then(
        (result) => result.sessions,
      ),
    createCaptureSession: (caseId, input) =>
      post<CaptureSessionSecretResponse>(`/api/cases/${enc(caseId)}/capture-sessions`, input),
    rotateCaptureSession: (sessionId) =>
      post<CaptureSessionSecretResponse>(`/api/capture-sessions/${enc(sessionId)}/rotate`),
    revokeCaptureSession: (sessionId) =>
      post<CaptureSessionStaffSummary>(`/api/capture-sessions/${enc(sessionId)}/revoke`),
    // Case done lifecycle (TKT-094/095/096). The two writes are NOT safe()-wrapped —
    // a status flip that failed must reach the operator; the completed list is a
    // browse read, safe()-empty on failure.
    markEvaSubmitted: (caseId) =>
      post<{ updated: boolean }>(`/api/cases/${enc(caseId)}/eva-submitted`),
    markCaseDone: (caseId) =>
      post<{ updated: boolean }>(`/api/cases/${enc(caseId)}/mark-done`),
    retryManualIntakeArchive: (caseId) =>
      post<{ requeued: number }>(`/api/cases/${enc(caseId)}/archive-retry`),
    archiveHoldingResolution: (caseId) =>
      get<ArchiveHoldingResolution>(`/api/cases/${enc(caseId)}/archive-holding`),
    selectArchiveHolding: (caseId) =>
      post<{ resolved: number; holdingIds: string[] }>(
        `/api/cases/${enc(caseId)}/archive-holding/select`,
      ),
    // E4: the server caps each page (default 200, max 500) and returns a bare
    // Case[] with no total — a single fetch under-counts and hides rows past the
    // first page, so the Completed tab counts (derived from this list) were wrong.
    // Page through with limit=500 until a short page ends the list, concatenating.
    // Still safe()-wrapped to [] — a browse surface, never a blocker.
    completedCases: (status) =>
      safe(async () => {
        const PAGE = 500;
        const all: Case[] = [];
        for (let offset = 0; ; offset += PAGE) {
          const page = await get<Case[]>(
            `/api/completed/cases?limit=${PAGE}&offset=${offset}${
              status ? `&status=${enc(status)}` : ''
            }`,
          );
          all.push(...page);
          if (page.length < PAGE) break;
        }
        return all;
      }, []),
    mergeCandidates: (id) => get<Case[]>(`/api/cases/${enc(id)}/merge-candidates`),
    mergeCases: (src, tgt) =>
      post<MergeCasesResult>(`/api/cases/${enc(tgt)}/merge`, { sourceCaseId: src }),
    // Superuser SOFT-remove (current: ui-changes/delete-case). DELETE with a
    // JSON body (the audit-only ack flag + reason). DELIBERATELY NOT safe()-wrapped — a
    // failed remove MUST reach the operator (never a fake success); call() throws on any
    // non-2xx and decodes 200 -> RemoveCaseResult (which surfaces boxFolderUrl).
    removeCase: (id, input: RemoveCaseInput) =>
      call<RemoveCaseResult>('DELETE', `/api/cases/${enc(id)}`, input),
    // Case/PO allocator PREVIEW (current: box/case-po-gen). `year` is optional
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
    // Superuser provider PATCH (current: automation-mode + acme). principal_code
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
    // ONE-call amalgamated summary (current: amalgamated-dashboard): case
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
    // failure looked exactly like "no email"). The counts read is strict too:
    // callers that can deliberately degrade (the nav badge) catch it locally,
    // while the dashboard can identify only its affected Inbox section.
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
    inboundEmailCounts: () => get<InboundCounts>('/api/inbound/counts'),
    setTriageState: (id, state: TriageState) =>
      post<void>(`/api/inbound/${enc(id)}/triage`, { state }),
    // Staff reclassify/override (current: suggested-tags-and-folders). PATCH the
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
    getAiChatGate: () => safe(
      () => get<AiChatGate>('/api/gates/ai-chat'),
      { enabled: false, writeEnabled: false },
    ),
    globalSearch: (q) =>
      safe(() => get<GlobalSearchResults>(`/api/search?q=${encodeURIComponent(q)}`), { ...EMPTY_SEARCH, query: q }),
    caseWithVersion: (id) =>
      versionedRead<Case>(`/api/cases/${enc(id)}`, 'case'),
    inboundWithVersion: (id) =>
      versionedRead<InboundEmail>(`/api/inbound/${enc(id)}`, 'email'),
    resolveOutlookMessageLink: (id) =>
      get<OutlookMessageLinkResolution>(`/api/inbound/${enc(id)}/outlook-link`),
    executeProposal: async (action, ifMatchToken) => {
      if (requiresProposalVersion(action) && !ifMatchToken?.trim()) {
        return {
          ok: false,
          status: 428,
          error: 'Review the latest information before confirming this change.',
        };
      }
      const fallback: ProposalExecutionResult = {
        ok: false,
        status: 0,
        error: 'We could not confirm whether that change was saved. Review the latest information and try again.',
      };
      const work = (async (): Promise<ProposalExecutionResult> => {
        try {
          const token = await opts.getToken();
          const res = await fetch(`${base}/api/${action.path}`, {
            method: action.method,
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              ...(ifMatchToken?.trim() ? { 'If-Match': ifMatchToken.trim() } : {}),
            },
            body: JSON.stringify(action.body),
          });
          const nextVersion = cleanEtag(responseHeader(res, 'etag'));
          if (res.ok) {
            let resourceId: string | undefined;
            if (res.status !== 204) {
              const payload = await res.json().catch(() => undefined) as unknown;
              if (payload && typeof payload === 'object' &&
                  typeof (payload as Record<string, unknown>).id === 'string') {
                resourceId = ((payload as Record<string, unknown>).id as string).trim() || undefined;
              }
            }
            return {
              ok: true,
              status: res.status,
              ...(nextVersion ? { version: nextVersion } : {}),
              ...(resourceId ? { resourceId } : {}),
            };
          }
          return {
            ok: false,
            status: res.status,
            ...(nextVersion ? { version: nextVersion } : {}),
            error:
              res.status === 409
                ? 'This information changed before the update was confirmed.'
                : 'That change was not saved. Please try again.',
          };
        } catch {
          return fallback;
        }
      })();
      return settleWithin(work, fallback);
    },
    uploadEvidence: async (caseId, files, options) => {
      try {
        const token = await opts.getToken();
        const fd = new FormData();
        for (const f of files) fd.append('file', f);
        const source = options?.source ?? 'assistant_confirmed';
        fd.append('source', source);
        for (const role of options?.fileRoles ?? []) fd.append('fileRole', role);
        if (options?.manualIntakeOperation) fd.append('manualIntakeOperation', 'true');
        if (options?.manualIntakeInstructionIndex !== undefined) {
          fd.append('manualIntakeInstructionIndex', String(options.manualIntakeInstructionIndex));
        }
        const idempotencyKey = options?.idempotencyKey ?? crypto.randomUUID();
        // NB: no Content-Type header — the browser sets the multipart boundary itself.
        const res = await fetch(`${base}/api/cases/${enc(caseId)}/evidence/upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': idempotencyKey,
          },
          body: fd,
        });
        const json = (await res.json().catch(() => ({ added: [], rejected: [] }))) as {
          added?: Array<{ fileIndex?: number; fileName: string; evidenceId: string; duplicate?: boolean }>;
          rejected?: Array<{ fileIndex?: number; fileName: string; reason: string }>;
          error?: string;
          targetCaseId?: string;
          manualIntakeCompletion?: 'completed' | 'already_complete' | 'not_bound';
        };
        return {
          added: (json.added ?? []).flatMap((item, responseIndex) =>
            item.evidenceId
              ? [{
                  fileIndex: Number.isInteger(item.fileIndex) ? Number(item.fileIndex) : responseIndex,
                  fileName: item.fileName,
                  evidenceId: item.evidenceId,
                  duplicate: item.duplicate === true,
                }]
              : [],
          ),
          rejected: (json.rejected ?? []).map((item, responseIndex) => ({
            fileIndex: Number.isInteger(item.fileIndex) ? Number(item.fileIndex) : responseIndex,
            fileName: item.fileName,
            reason: item.reason,
          })),
          status: res.status,
          ...(json.error ? { error: json.error } : {}),
          ...(json.targetCaseId ? { targetCaseId: json.targetCaseId } : {}),
          ...(json.manualIntakeCompletion
            ? { manualIntakeCompletion: json.manualIntakeCompletion }
            : {}),
        };
      } catch {
        return {
          added: [],
          rejected: files.map((file, fileIndex) => ({
            fileIndex,
            fileName: file.name,
            reason: 'The files could not be added. Check your connection and try again.',
          })),
          status: 0,
        };
      }
    },
    evidenceContentUrl: (id) => blobUrl(`/api/evidence/${enc(id)}/content`),
    evidenceContentBlob: (id) => blobOf(`/api/evidence/${enc(id)}/content`),
    // Mutation — NOT safe()-wrapped: a dismissal that failed to persist must surface
    // (never a fake "dismissed" that reappears on reload).
    setReflectionDismissed: (evidenceId, dismissed) =>
      call<Evidence>('PATCH', `/api/evidence/${enc(evidenceId)}`, {
        reflectionDismissed: dismissed,
      }),
    updateEvidenceReview: (evidenceId, input) =>
      call<Evidence>('PATCH', `/api/evidence/${enc(evidenceId)}`, input),
    deleteCaseImage: (caseId, evidenceId) =>
      call<DeleteCaseImageResult>('DELETE', `/api/cases/${enc(caseId)}/images/${enc(evidenceId)}`),
    getDeleteCaseImageGate: () =>
      safe(
        () => get<DeleteCaseImageGate>('/api/gates/delete-case-image'),
        { ...DELETE_CASE_IMAGE_GATE_ALL_OFF },
      ),

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

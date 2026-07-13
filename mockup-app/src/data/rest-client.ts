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
  CreateCaseOptions,
  CreateCaseResult,
  CaseUpdateInput,
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
  OutlookMessageLinkResolution,
  ProviderApiKey,
  CreateProviderApiKeyInput,
  CreateProviderApiKeyResult,
  VehicleDataEnrichmentResponse,
  CaptureSessionStaffSummary,
  CaptureSessionListResponse,
  CreateCaptureSessionRequest,
  CaptureSessionSecretResponse,
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
export type ApiCall = <T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
) => Promise<T>;

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
  /** Raw status name (TKT-096): terminal cases are in search scope, so result rows
   *  carry a real status badge; `removed` never surfaces (excluded server-side). */
  status?: string;
  claimant: string | null;
  provider: string | null;
  /** ISO created timestamp (TKT-072 age): result rows show "12d old". OPTIONAL —
   *  absent on an older server payload, in which case no age is rendered. */
  createdAt?: string | null;
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
export type EvidenceUploadSource = 'add_evidence' | 'manual_intake' | 'assistant_confirmed';
export type EvidenceUploadRole = 'instruction' | 'extra';
export interface EvidenceUploadOptions {
  source: EvidenceUploadSource;
  /** Stable across a retry of the same case + ordered files. */
  idempotencyKey?: string;
  /** Manual Intake binds the staff-selected instruction/extra role per file. */
  fileRoles?: EvidenceUploadRole[];
  /** This batch is the source batch bound by POST /cases, not images-only intake. */
  manualIntakeOperation?: boolean;
  /** Exact instruction position bound by the Manual Intake case operation. */
  manualIntakeInstructionIndex?: number;
}
export interface EvidenceUploadResult {
  added: Array<{ fileIndex: number; fileName: string; evidenceId: string; duplicate: boolean }>;
  rejected: Array<{ fileIndex: number; fileName: string; reason: string }>;
  status: number;
  error?: string;
  targetCaseId?: string;
  manualIntakeCompletion?: 'completed' | 'already_complete' | 'not_bound';
}

/** A fresh entity snapshot used by the assistant confirmation gate. Existing-target
 *  writes are disabled unless the read succeeds AND carries a stable version token.
 *  This is deliberately discriminated: a transport/JSON/version failure can never be
 *  mistaken for a missing row or an unversioned success. */
export type VersionedRead<T> =
  | {
      state: 'available';
      value: T;
      version: string;
      /** `body` is the steady-state contract; `etag` only bridges a rolling deploy. */
      versionSource: 'body' | 'etag';
    }
  | {
      state: 'unavailable';
      reason: 'not_found' | 'request_failed' | 'invalid_response' | 'version_missing';
      status: number;
      error: string;
    };

/** Non-throwing result from a confirmed proposal write. `status:0` means the client
 *  could not obtain a response (network/auth/timeout); callers must not show success. */
export interface ProposalExecutionResult {
  ok: boolean;
  status: number;
  version?: string;
  /** Identifier returned by a successful create-style route. */
  resourceId?: string;
  error?: string;
}

export interface AiChatGate {
  enabled: boolean;
  writeEnabled: boolean;
}

/** Partial, durable staff review of one image. Omitted fields are preserved. */
export interface EvidenceReviewInput {
  imageRole?: Evidence['imageRole'];
  registrationVisible?: boolean;
  acceptedForEva?: boolean;
  excluded?: boolean;
  exclusionReason?: string | null;
  reflectionDismissed?: boolean;
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

/** Result of one confirmed case-image deletion (TKT-160). Non-2xx partial
 *  outcomes throw so the screen keeps the image visible and offers a retry. */
export interface DeleteCaseImageResult {
  completed: true;
  repeated?: boolean;
  evidenceId: string;
  fileName: string;
}

export type VehicleLookupResult = VehicleDataEnrichmentResponse & {
  persisted?: { applied: string[]; warning?: string; retryable: boolean };
};

export interface DataAccessExt extends DataAccess {
  /** Save one reviewed case-edit session with optimistic concurrency. Every EVA
   *  field plus the inspection address/decision travels in this one PATCH. */
  saveCaseEdits(id: string, patch: CaseUpdateInput, version: string): Promise<Case>;
  /** Requeue Manual Intake source files that reached a terminal archive failure. */
  retryManualIntakeArchive(caseId: string): Promise<{ requeued: number }>;
  /** The sole authenticated vehicle lookup path. A case id persists evidence;
   *  a registration alone is a Manual Intake preview. */
  lookupVehicle(input: { caseId: string } | { registration: string; targetDate?: string }): Promise<VehicleLookupResult>;
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

  /* ----- Guided photo requests ----- */
  /** List safe staff summaries. Public links are never recoverable from this read. */
  captureSessions(caseId: string): Promise<CaptureSessionStaffSummary[]>;
  /** Create a request and return its public link once. */
  createCaptureSession(
    caseId: string,
    input: CreateCaptureSessionRequest,
  ): Promise<CaptureSessionSecretResponse>;
  /** Invalidate the previous public link and return its replacement once. */
  rotateCaptureSession(sessionId: string): Promise<CaptureSessionSecretResponse>;
  /** Cancel a public link and return the updated safe summary. */
  revokeCaptureSession(sessionId: string): Promise<CaptureSessionStaffSummary>;

  /* ----- Case done lifecycle (TKT-094/095/096, ADR-0023) ----- */
  /** Mark a case EVA Submitted after a successful Export-for-EVA download
   *  (TKT-094 Phase B). Guarded server-side: only a ready_for_eva case advances,
   *  so a repeat call is `{ updated:false }` — never an error. Throws on
   *  non-2xx transport failures so the export handler can tell the operator the
   *  status flip didn't record (the download itself already succeeded). */
  markEvaSubmitted(caseId: string): Promise<{ updated: boolean }>;
  /** Staff "Mark report delivered" (TKT-095 thin slice): eva_submitted → done.
   *  Guarded idempotent server-side; throws on non-2xx — a delivery that didn't
   *  record must never look recorded. */
  markCaseDone(caseId: string): Promise<{ updated: boolean }>;
  /** The Completed/Archive list (TKT-096): terminal cases the work-queues
   *  deliberately exclude — eva_submitted (awaiting delivery), done (delivered),
   *  box_synced (historical). Optional status filter. safe()-empty on failure
   *  (a browse surface, never a blocker). */
  completedCases(status?: 'eva_submitted' | 'done' | 'box_synced'): Promise<Case[]>;

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
  getAiChatGate(): Promise<AiChatGate>;
  /** Global search (TKT-072): one normalised query across cases / inbound email / providers.
   *  safe()-empty on failure; the server returns disabled+empty while GLOBAL_SEARCH_ENABLED is off. */
  globalSearch(q: string): Promise<GlobalSearchResults>;
  /** Independently re-fetch a case plus the version from the JSON snapshot. The ETag is
   *  accepted only as a rolling-deploy fallback. Never throws; failure is explicit. */
  caseWithVersion(id: string): Promise<VersionedRead<Case>>;
  /** Independently re-fetch an inbound email plus its version before a triage/classification
   *  confirmation. Same non-throwing contract as caseWithVersion. */
  inboundWithVersion(id: string): Promise<VersionedRead<InboundEmail>>;
  /** Re-check the exact mailbox item through the read-only server path. Missing,
   * deleted or inaccessible items return an explicit saved-preview outcome. */
  resolveOutlookMessageLink(id: string): Promise<OutlookMessageLinkResolution>;
  /** Execute a CONFIRMED assistant proposal against its existing staff-authorized route
   *  (TKT-111). Sends the re-fetched version as If-Match so a stale write returns 409.
   *  Refuses an existing-target write when the token is absent. Never throws. */
  executeProposal(action: ProposedAction, ifMatchToken?: string): Promise<ProposalExecutionResult>;
  /** Upload staff-attached evidence files to a case (TKT-068) — multipart POST. The model never
   *  uploads; these bytes come from the user's file picker. Returns which files landed / were
   *  rejected (with plain-language reasons) plus the HTTP status. Never throws. */
  uploadEvidence(
    caseId: string,
    files: File[],
    options?: EvidenceUploadOptions,
  ): Promise<EvidenceUploadResult>;
  /** Evidence inline preview (TKT-048): authenticated fetch → a `blob:` object URL for an
   *  <img>, or undefined when there's no inline content (Box-only / bytes gone). The caller
   *  MUST URL.revokeObjectURL it on unmount. */
  evidenceContentUrl(id: string): Promise<string | undefined>;
  /** Evidence bytes as a Blob (TKT-126 EVA-export zip): the SAME authenticated content
   *  route, but handing back the Blob itself (zipping needs bytes; fetching a blob: URL
   *  would need `connect-src blob:`, which the CSP does not grant). undefined when the
   *  artifact has no inline content. */
  evidenceContentBlob(id: string): Promise<Blob | undefined>;
  /** Dismiss/restore the person-reflection warning on an image (TKT-123). PATCH →
   *  the updated Evidence row. Throws on non-2xx — a dismissal that didn't persist
   *  must never look dismissed. */
  setReflectionDismissed(evidenceId: string, dismissed: boolean): Promise<Evidence>;
  /** Persist role, registration, EVA-use, and include/exclude decisions. */
  updateEvidenceReview(evidenceId: string, input: EvidenceReviewInput): Promise<Evidence>;
  /** Permanently delete one image from its case and required stores. The server
   *  owns scope checks, retries, audit and readiness recomputation. */
  deleteCaseImage(caseId: string, evidenceId: string): Promise<DeleteCaseImageResult>;

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

/** Whether a failed image-delete call crossed the durable-intent boundary. The
 * screen uses this server truth to distinguish a retryable partial deletion from
 * a preflight refusal where no deletion ever started. */
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
        if (typeof parsed.deletionPending === 'boolean') {
          err.deletionPending = parsed.deletionPending;
        }
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
      post<CaptureSessionSecretResponse>(
        `/api/cases/${enc(caseId)}/capture-sessions`,
        input,
      ),
    rotateCaptureSession: (sessionId) =>
      post<CaptureSessionSecretResponse>(
        `/api/capture-sessions/${enc(sessionId)}/rotate`,
      ),
    revokeCaptureSession: (sessionId) =>
      post<CaptureSessionStaffSummary>(
        `/api/capture-sessions/${enc(sessionId)}/revoke`,
      ),
    // Case done lifecycle (TKT-094/095/096). The two writes are NOT safe()-wrapped —
    // a status flip that failed must reach the operator; the completed list is a
    // browse read, safe()-empty on failure.
    markEvaSubmitted: (caseId) =>
      post<{ updated: boolean }>(`/api/cases/${enc(caseId)}/eva-submitted`),
    markCaseDone: (caseId) =>
      post<{ updated: boolean }>(`/api/cases/${enc(caseId)}/mark-done`),
    retryManualIntakeArchive: (caseId) =>
      post<{ requeued: number }>(`/api/cases/${enc(caseId)}/archive-retry`),
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
      call<DeleteCaseImageResult>(
        'DELETE',
        `/api/cases/${enc(caseId)}/images/${enc(evidenceId)}`,
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

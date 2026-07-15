import type { DataAccess, CaseUpdateInput, InboundEmail, DashboardSummary, RemoveCaseInput, RemoveCaseResult, NextCasePoResult, ProviderUpdateInput, ReclassifyInboundInput, AiSuggestion, AiSuggestionReviewInput, AiSuggestionReviewResult, GenerateAiSuggestionsResult, AiAssistGate, AssistantChatTurn, AssistantReply, ProposedAction, OutlookMoveGate, OutlookMessageLinkResolution, ProviderApiKey, CreateProviderApiKeyInput, CreateProviderApiKeyResult, VehicleDataEnrichmentResponse } from '@cs/domain';
import type { Case, Chaser, Evidence, Provider } from '@cs/domain';

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

   It is the frozen `@cs/domain` `DataAccess` PLUS the current methods
   the data service shipped (amalgamated dashboard, soft-remove case, the
   Case/PO allocator preview, the Superuser provider PATCH, and the inbound
   reclassify). The base `DataAccess` interface stays in `@cs/domain` (the frozen
   server contract); these additive methods live HERE in the data layer so the
   SPA can call them without re-minting the shared contract. `getDataAccess()`,
   the rest client, and the empty source all speak `DataAccessExt`.

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
   *  box_synced (earlier). Optional status filter. safe()-empty on failure
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
     empty source (empty-source.ts) omits them (the provider-API-key channel has no mock),
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

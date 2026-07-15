/**
 * orchestration/src/lib/data-api.ts
 *
 * Typed client for the new Data API (plan 21, the BFF). Every DB write the orchestration
 * makes goes through the Data API — the orchestration never opens a Postgres connection
 * (plan 22: "it calls ... the new Data API for every DB write"). The two INVIOLABLE dedup
 * rules run in the shared `@cs/domain` `resolveCase`/`matchProviderByDomain` inside the
 * activities; the Data API persists the result.
 *
 * Two route families are used:
 *   - the frozen §21.1 DataAccess endpoints where they fit (createCase POST /api/cases);
 *   - internal orchestration-facing routes under `/api/internal/*` for intake-time writes
 *     that have no SPA equivalent (provider-match records, dedup context, evidence persist,
 *     status recompute, audit). Keeping them under a distinct prefix leaves the DataAccess
 *     freeze (R3) untouched (plan 21 §21.3 pattern).
 *
 * Auth: a service Bearer token for the Data API audience. In Azure it is the orchestration
 * app's managed identity (App Service MSI token endpoint, dependency-free REST); locally a
 * static DATA_API_TOKEN app-setting short-circuits it.
 *
 * App-settings: DATA_API_URL, DATA_API_AUDIENCE (api://<data-api-client-id>),
 *   optional DATA_API_TOKEN (local dev).
 */

import type {
  CreateCaseInput,
  CreateCaseResult,
} from '@cs/domain';
import type { ProviderMatchRecord, OpenProviderCase } from '@cs/domain';
import type { ImageSourceMatchRecord } from '@cs/domain';
import type { EvidenceDescriptor } from '@cs/domain';

/**
 * GET /api/internal/provider-match-records response (rules-engine-v2 Phase 3, ADR-0011).
 * `providers` is the existing matchProviderByDomain corpus (unchanged shape); `imageSources`
 * is the NEW Image-Source intermediary corpus `@cs/domain`'s `matchSenderIdentity` needs
 * (image_source WHERE kind=intermediary, joined through imagesource_workprovider — empty
 * candidateProviderIds when an intermediary has no linked providers yet, never omitted).
 */
export interface ProviderMatchRecordsResult {
  providers: ProviderMatchRecord[];
  imageSources: ImageSourceMatchRecord[];
}

/**
 * Parser-owned EVA fields forwarded from the orchestration `parse` activity to
 * the Data API resolve-persist, where they fill the case_ eva_* columns fill-if-empty. Keyed
 * by EVA contract key. inspection_address is excluded (corpus picker — ADR-0013); mileage rides
 * its own parserMileage field. When work_provider is absent/UNKNOWN, resolve-persist may still
 * fill eva_work_provider from the matched corpus display_name. `sources` is an optional
 * per-field provenance override for a conservative e-mail-body supplement.
 */
export type ParserEvaFieldKey =
  | 'work_provider'
  | 'vehicle_model'
  | 'claimant_name'
  | 'claimant_telephone'
  | 'claimant_email'
  | 'date_of_loss'
  | 'date_of_instruction'
  | 'accident_circumstances'
  | 'vat_status';

export interface ParserEvaFields {
  work_provider?: string;
  vehicle_model?: string;
  claimant_name?: string;
  claimant_telephone?: string;
  claimant_email?: string;
  date_of_loss?: string;
  date_of_instruction?: string;
  accident_circumstances?: string;
  vat_status?: string;
  sources?: Partial<Record<ParserEvaFieldKey, 'email_text'>>;
  /** Defensible alternatives that must be shown for review, never selected silently. */
  claimant_conflicts?: Array<{
    value: string;
    source: 'email_text';
    source_reference?: string;
  }>;
  /** Stable inbound identity used to make retained-source conflict writes replay-safe. */
  source_reference?: string;
}

/* ---------- service token ---------- */

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getDataApiToken(): Promise<string> {
  const local = process.env.DATA_API_TOKEN;
  if (local) return local; // local dev / func start

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value;

  const audience = process.env.DATA_API_AUDIENCE;
  const idEndpoint = process.env.IDENTITY_ENDPOINT;
  const idHeader = process.env.IDENTITY_HEADER;
  if (!audience || !idEndpoint || !idHeader) {
    throw new Error('missing DATA_API_AUDIENCE / managed-identity endpoint for Data API auth');
  }
  const url = `${idEndpoint}?resource=${encodeURIComponent(audience)}&api-version=2019-08-01`;
  const res = await fetch(url, { headers: { 'X-IDENTITY-HEADER': idHeader } });
  if (!res.ok) throw new Error(`MSI token ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_on?: string };
  cachedToken = {
    value: json.access_token,
    expiresAt: json.expires_on ? Number(json.expires_on) * 1000 : now + 3_300_000,
  };
  return cachedToken.value;
}

/* ---------- request core ---------- */

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const baseUrl = (process.env.DATA_API_URL ?? '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('missing DATA_API_URL');
  const token = await getDataApiToken();
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 409) {
    // Surfaced verbatim so caseResolve can map a UNIQUE(sourcemessageid) collision
    // to `already_ingested` (idempotent intake).
    const detail = await safeText(res);
    if (detail.includes('evidence_backfill_reclassification_required')) {
      let targetCaseId: string | undefined;
      try {
        const parsed = JSON.parse(detail) as { targetCaseId?: unknown };
        if (typeof parsed.targetCaseId === 'string' && parsed.targetCaseId.trim()) {
          targetCaseId = parsed.targetCaseId.trim();
        }
      } catch {
        // The typed code is enough to force a safe retry; targetCaseId is an
        // optional convenience for the terminal report path.
      }
      throw new EvidenceBackfillReclassificationRequiredError(
        `${method} ${path} → 409: ${detail}`,
        targetCaseId,
      );
    }
    if (detail.includes('evidence_backfill_target_changed')) {
      throw new EvidenceBackfillTargetChangedError(`${method} ${path} → 409: ${detail}`);
    }
    throw new ConflictError(`${method} ${path} → 409: ${detail}`);
  }
  if (!res.ok) {
    const detail = await safeText(res);
    throw new DataApiHttpError(
      `data-api ${method} ${path} → ${res.status}: ${detail}`,
      res.status,
      detail,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ConflictError extends Error {}
export class DataApiHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(message);
  }
}
export class EvidenceBackfillTargetChangedError extends ConflictError {}
export class EvidenceBackfillReclassificationRequiredError extends ConflictError {
  constructor(message: string, public readonly targetCaseId?: string) {
    super(message);
  }
}

export interface EvidenceBackfillCommittedResult {
  outcome: 'completed' | 'partial';
  persisted: number;
  merged?: number;
  failedAttachments?: number;
  detail?: string;
}

/* ---------- typed surface ---------- */

/** Intake-time dedup context for a provider+VRM (internal route). */
export interface DedupContext {
  openProviderCases: OpenProviderCase[];
  seenMessageIds: string[];
  seenPayloadHashes: string[];
  /** The sole case that owns this immutable Internet Message-ID, when one exists. */
  exactSourceOwner?: {
    caseId: string;
    casePo: string | null;
    providerAutomationMode: 'manual' | 'review_auto' | 'full_auto';
    status: string;
    replayAllowed: boolean;
  };
}

/**
 * POST /api/internal/triage/context request body (ADR-0019 pinned contract). Every field
 * is a plain (possibly empty) string — the caller (triagePolicy.ts) never omits a key, it
 * sends '' for "nothing to match on" so the API always parses one shape.
 */
export interface TriageContextRequest {
  caseref?: string;
  jobref?: string;
  vrm?: string;
  internetMessageId?: string;
  conversationId?: string;
}

/** POST /api/internal/triage/context response body (ADR-0019 pinned contract) — maps
 *  1:1 onto `@cs/domain`'s `TriagePolicyContext` open-case-match fields. */
export interface TriageContextResult {
  openCaseMatches: Array<{
    caseId: string;
    casePo: string;
    matchedOn: 'case_po' | 'job_ref' | 'vrm';
    status: string;
  }>;
  duplicateInternetMessageId: boolean;
  conversationSiblingCaseIds: string[];
}

/** POST /api/internal/triage/suggest-link request body (ADR-0019 pinned contract). */
export interface TriageSuggestLinkRequest {
  sourceMessageId?: string;
  inboundEmailId?: string;
  targetCaseId?: string;
  suggestionType: 'case_link' | 'cancellation';
  rationale: string;
  confidence?: number;
  decisionInputs: Record<string, unknown>;
  /** TKT-093 (DARK) — case_link only: self-accept the written suggestion so the Data API
   *  performs the reversible `inbound_linked` attach immediately. Set by the orchestrator
   *  ONLY when decideTriage returned `attach_case` (gated behind `TRIAGE_AUTO_ATTACH_ENABLED`
   *  + an exact single case_po/job_ref match). Omitted/false = today's suggestion-only write. */
  autoAttach?: boolean;
}

/** POST /api/internal/triage/suggest-link response body (ADR-0019 pinned contract).
 *  `created: false` means an equivalent PENDING suggestion already existed — idempotent
 *  under Durable at-least-once retries, never a duplicate row. */
export interface TriageSuggestLinkResult {
  suggestionId: string;
  created: boolean;
}

/** POST /api/internal/triage/held-pre-instruction request/response (TKT-084, taxonomy
 *  v3). FIND-only: held pre-instruction rows (category pre_instruction, no case link,
 *  triage_state 'new') matching the newly-minted case's identifiers — the caller writes
 *  the actual case_link suggestion via `triageSuggestLink` (suggest-first; the match is
 *  typically VRM-only, which never auto-attaches per the ADR-0019 promotion doctrine). */
export interface HeldPreInstructionRequest {
  vrm?: string;
  caseRef?: string;
  jobRef?: string;
}
export interface HeldPreInstructionResult {
  held: Array<{
    inboundEmailId: string;
    sourceMessageId: string | null;
    matchedOn: 'vrm' | 'case_ref' | 'job_ref';
  }>;
}

/**
 * POST /api/internal/triage/suggest-link request body, `suggestionType: 'triage_category'`
 * shape (rules-engine-v2 Phase 4, ADR-0019 Stage C) — a DIFFERENT `suggested_value` shape
 * than `TriageSuggestLinkRequest` above (`{category, subtype}`, never a `targetCaseId`: a
 * triage-category suggestion proposes a RELABEL of the inbound email, not a case link).
 * Same endpoint, same idempotency mechanism (subject-key + suggestionType), distinct
 * client method so the two request shapes never get confused at a call site.
 */
export interface TriageSuggestClassificationRequest {
  sourceMessageId?: string;
  inboundEmailId?: string;
  category: string;
  subtype: string;
  rationale: string;
  confidence: number;
  /** '<deployment>:<modelVersion-from-response>' — see triage-classify.ts's own stamp. */
  modelVersion: string;
}

/**
 * One claimed still-unclassified autonomous image row. This includes Box
 * FILE.UPLOADED and staff-confirmed Blob uploads. `sourceMessageId` is the row's
 * own durable identity; the sweep mirrors it verbatim on the stamp re-POST (see
 * box-classify-sweep.ts's buildStampRow — sending a tag the row does not have would
 * make the evidence route's NOT-EXISTS dedup miss and INSERT a duplicate).
 */
export interface UnclassifiedBoxEvidenceRow {
  evidenceId: string;
  caseId: string;
  filename: string;
  contentType: string | null;
  /** Exactly one byte locator is present: Box for FILE.UPLOADED, Blob for staff upload. */
  boxFileId: string | null;
  storagePath: string | null;
  sourceLabel: string;
  sourceMessageId: string | null;
  caseVrm: string;
  workProviderId: string;
  /** Present on POST/claim responses; null only for rolling-compatible GET reads. */
  claimToken: string | null;
  attemptCount: number;
}

export interface BoxClassificationFailure {
  disposition: 'transient' | 'terminal';
  code: string;
  detail?: string;
}

export interface StaffUploadCleanupRow {
  itemId: string;
  blobPath: string;
  claimToken: string;
  attemptCount: number;
}

export interface OutlookLinkBackfillCandidate {
  inboundEmailId: string;
  sourceMailbox: string;
  sourceMessageId: string;
}

/** Durable case-status recompute generation requested atomically by a Box stamp. */
export interface PendingStatusRecompute {
  caseId: string;
  generation: number;
}

export const dataApi = {
  /** Historical TKT-009 candidates. Read-only enumeration; nothing runs unless the
   * function-key protected backfill endpoint is explicitly invoked. */
  outlookLinkBackfillCandidates(limit: number): Promise<{ rows: OutlookLinkBackfillCandidate[] }> {
    return request(
      'GET',
      `/api/internal/outlook-links/backfill-candidates?limit=${encodeURIComponent(String(limit))}`,
    );
  },

  /** Append one remediation outcome and, for a verified exact match, atomically fill
   * the stored immutable id/webLink tuple. Outlook itself remains read-only. */
  reportOutlookLinkBackfill(payload: {
    attemptId: string;
    inboundEmailId: string;
    sourceMailbox: string;
    sourceMessageId: string;
    outcome: 'resolved' | 'not_found' | 'not_accessible' | 'ambiguous' | 'unavailable';
    reason: string;
    graphMessageId?: string;
    outlookWebLink?: string;
  }): Promise<{ recorded: boolean; applied: boolean; outcome: string }> {
    return request('POST', '/api/internal/outlook-links/backfill-result', payload);
  },

  /**
   * Providers + Image-Source intermediaries for the in-activity `matchSenderIdentity`
   * (internal route; rules-engine-v2 Phase 3, ADR-0011 — was providers-only before).
   */
  providerMatchRecords(): Promise<ProviderMatchRecordsResult> {
    return request('GET', '/api/internal/provider-match-records');
  },

  /**
   * Read a work provider's per-provider AI opt-out flag (docs/gated.md D6; internal route).
   * `aiAllowed` is NULLABLE: null/true = AI allowed, ONLY explicit `false` opts the provider
   * out of the gated LLM triage second-opinion (triage-classify.ts). Schema-tolerant
   * server-side — the `ai_allowed` column is modeled but may be pre-migration, in which case
   * the API returns `{ aiAllowed: null }` (i.e. allowed).
   */
  workProviderAiAllowed(workProviderId: string): Promise<{ aiAllowed: boolean | null }> {
    return request('GET', `/api/internal/work-provider/${encodeURIComponent(workProviderId)}/ai-allowed`);
  },

  /** Open same-provider cases + seen ids/hashes for `resolveCase` (internal route). */
  dedupContext(params: {
    workProviderId: string;
    vrm: string;
    messageId: string;
  }): Promise<DedupContext> {
    const q = new URLSearchParams({
      workProviderId: params.workProviderId,
      vrm: params.vrm,
      messageId: params.messageId,
    });
    return request('GET', `/api/internal/dedup-context?${q.toString()}`);
  },

  /** Create a Case (frozen §21.1 #2). 409 → ConflictError (already ingested). */
  createCase(input: CreateCaseInput): Promise<CreateCaseResult> {
    return request('POST', '/api/cases', input);
  },

  /**
   * Persist the result of the in-activity dedup decision (internal route). The orchestration
   * owns the ADR-0010 *decision* (shared `resolveCase`); the API owns the *persist* — it
   * constructs the Case row (default EvaFields, status machine) on create, reparents evidence
   * on attach, stamps duplicate-risk / case-link flags, and maps a UNIQUE(sourcemessageid)
   * collision to `already_ingested`. Keeps EvaFields construction + status machine in the API.
   */
  resolvePersist(payload: {
    inbound: unknown;
    providerId?: string;
    matchState?: string;
    /** Parser-confirmed PDF VRM — the API prefers it over the email-body sniff (#7). */
    parserVrm?: string;
    /** #100 — parser-confirmed provider reference; a PDF-only ref feeds dedup + persists as case_ref. */
    parserRef?: string;
    /** #107 — parser-extracted document mileage (+unit); persisted fill-if-empty (ADR-0006 doc-first). */
    parserMileage?: string;
    parserMileageUnit?: string;
    /** Parser-owned EVA fields (claimant, dates, vehicle, circumstances, VAT) — persisted
     *  fill-if-empty by the API (constraint-guarded). The fix for "email case shows only its
     *  registration + Case/PO": the parser extracts all 12 fields; this carries the other 8. */
    parserEva?: ParserEvaFields;
    /** rules-engine-v2 Phase 3 (ADR-0011) — set when the SENDER matched an Image-Source
     *  intermediary rather than a direct work provider; its N:N candidate work providers
     *  let the API's applyParserFields treat a content-detected provider among them as
     *  CORROBORATED. Absent when the sender matched a direct provider or nothing at all. */
    intermediaryImageSourceId?: string;
    intermediaryCandidateProviderIds?: string[];
    /** ADR-0021 — the intake case-type decision. Applied by the API (case_type_code +
     *  marker mint) only behind AUDIT_CASES_ENABLED; observe-only audit_event otherwise. */
    caseType?: 'standard' | 'audit' | 'audit_total_loss' | 'diminution';
    caseTypeDual?: boolean;
    caseTypeSignals?: string[];
    decision: {
      resolution: string;
      targetCaseId?: string;
      setDuplicateRisk: boolean;
      caseLinkState?: 'none' | 'pending';
      statusEffect: string;
      auditAction: string;
    };
  }): Promise<{
    /** 'refused_category' (TKT-119): the API's belt-and-braces mint guard refused the
     *  create — the message's own triage row carries a category that never mints
     *  (acknowledgement/query/non_actionable/…). caseId is '' on that outcome. */
    outcome: 'created' | 'attached' | 'replayed' | 'already_ingested' | 'refused_category';
    caseId: string;
    casePo?: string | null;
    /**
     * The matched work-provider's automation mode ('manual' | 'review_auto' |
     * 'full_auto') — the SEAM BACKEND-API adds to internalCasesResolve so the
     * orchestrator can branch intake (automation-mode ticket). Absent → the
     * orchestrator defaults to 'review_auto' (current behaviour preserved).
     */
    providerAutomationMode?: 'manual' | 'review_auto' | 'full_auto';
    /** Database identity phase only; orchestration reports completion after Archive ensure. */
    providerRecovery?: 'identity_ready' | 'not_needed' | 'blocked';
  }> {
    return request('POST', '/api/internal/cases/resolve', payload);
  },

  /**
   * Record a classified inbound_email triage row with NO case (ADR-0015). Used for
   * query/other AND as the always-on first write for receiving_work (caseResolve later
   * stamps case_id onto the same row). Idempotent upsert on source_message_id.
   *
   * `inbound` is the FULL InboundEnvelope and already carries `conversationId` as-is (one
   * of the rules-engine-v2 Phase 2 DDL's two new inbound_email columns —
   * `inbound_email.conversation_id`); `classification.bodyJobref` is the other
   * (`inbound_email.body_jobref`). Both are sent unconditionally — schema-tolerant
   * server-side: the API persists them once its upsert is wired to the (already-landed)
   * columns, and simply ignores the extra fields until then.
   */
  recordInboundEmail(payload: {
    inbound: unknown;
    providerId?: string;
    classification: {
      category: string;
      subtype: string;
      confidence: number;
      signals: string[];
      bodyVrm: string;
      bodyCaseref: string;
      /** rules-engine-v2 Phase 2 DDL target: inbound_email.body_jobref (capture-only
       *  until the API's upsert reads it — see the note above). */
      bodyJobref?: string;
    };
  }): Promise<{ inboundEmailId: string | null }> {
    return request('POST', '/api/internal/inbound-email', payload);
  },

  /**
   * ADR-0022 retro reconstruction — the ANY-STATUS existence check + link (internal route).
   * Unlike linkReply this matches terminal cases too (a billing email about an
   * eva_submitted case must link, not strand); 'gated_off' while RETRO_CASE_ENABLED is
   * not 'true' on the API app (honest refusal — the gate lives on BOTH apps).
   */
  retroResolveExisting(payload: {
    trigger: unknown;
    keys: { casePo?: string; externalRef?: string; vrm?: string };
    providerId?: string;
    triggerCategory?: string;
  }): Promise<{
    outcome: 'linked' | 'ambiguous' | 'none' | 'gated_off';
    caseId?: string;
    candidateCount: number;
  }> {
    return request('POST', '/api/internal/retro/resolve-existing', payload);
  },

  /**
   * ADR-0022 retro reconstruction — get-or-create persist of a reconstructed case.
   * `casePo` is the DISCOVERED archive folder name (verbatim — the API never mints on
   * this path); concurrent duplicates come back as 'already_exists_linked', never 409/500.
   */
  retroCreate(payload: {
    original: unknown;
    trigger: unknown;
    keys: { casePo?: string; externalRef?: string; vrm?: string };
    casePo?: string;
    vrm?: string;
    statusName: 'eva_submitted' | 'needs_review';
    onHold: boolean;
    actionReason?: 'needs_review';
    reconstructionSource: 'box_eml' | 'box_doc' | 'outlook' | 'minimal';
    providerId?: string;
    parserVrm?: string;
    parserRef?: string;
    parserMileage?: string;
    parserMileageUnit?: string;
    parserEva?: ParserEvaFields;
    caseType?: 'standard' | 'audit' | 'audit_total_loss' | 'diminution';
    caseTypeSignals?: string[];
    boxFolder?: { id: string; url?: string };
    triggerCategory?: string;
  }): Promise<{
    outcome: 'created' | 'already_exists_linked' | 'ambiguous' | 'gated_off' | 'refused_category';
    caseId?: string;
    casePo?: string | null;
    newClient?: boolean;
    candidateCount?: number;
    providerRecovery?: 'identity_ready' | 'not_needed' | 'blocked';
  }> {
    return request('POST', '/api/internal/retro/create', payload);
  },

  /**
   * TKT-119c / TKT-034 — stamp a VISIBLE attention reason on an email's triage row
   * ('unable_to_locate' after a failed retro reconstruction; 'images_no_match' for an
   * image-bearing email with no case match). Keyed on the Internet-Message-Id; the API
   * is schema-tolerant (stamped:false until the attention_reason column lands).
   */
  markInboundAttention(payload: {
    sourceMessageId: string;
    reason: 'unable_to_locate' | 'images_no_match';
  }): Promise<{ stamped: boolean; detail?: string }> {
    return request('POST', '/api/internal/inbound/attention', payload);
  },

  /**
   * ADR-0022 R2 — register archive files as BYTE-LESS Box evidence rows (id + link
   * only; the existing internal evidence route dedups them on box_file_id, storage_path
   * stays NULL). `acceptedForEva: false` keeps a retro backfill out of the EVA image
   * rules until staff review.
   */
  registerBoxEvidence(
    caseId: string,
    rows: Array<{
      filename: string;
      boxFileId: string;
      boxFileUrl?: string;
      size?: number;
      contentType?: string;
      evidenceClass?: 'image' | 'email' | 'other';
      acceptedForEva?: boolean;
      sourceLabel?: string;
    }>,
  ): Promise<{ persisted: number }> {
    return request('POST', `/api/internal/cases/${caseId}/evidence`, { rows });
  },

  /** Persist classified evidence rows for a case (internal route; upsert by blob path). */
  persistEvidence(
    caseId: string,
    rows: Array<
      EvidenceDescriptor & {
        blobPath: string;
        size: number;
        // Optional image metadata — the live classifier (TKT-064) attaches these to image
        // rows; the API evidence route reads them off any row (ignored on non-image rows).
        imageRole?: string;
        registrationVisible?: boolean;
        acceptedForEva?: boolean;
        excluded?: boolean;
        exclusionReason?: string | null;
        decisionSource?: 'classifier';
        /** TKT-123: the vision classifier saw a person's reflection (advisory —
         *  drives the SPA's dismissible warning; separate from `excluded`). */
        personReflection?: boolean;
        /** TKT-133 — lower-case hex SHA-256 of the attachment bytes (hashed at blob
         *  landing, fetchMessage/blob.ts). The API's dedup extension links/skips the Box
         *  FILE.UPLOADED mirror twin on (case_id, sha256). Optional + forward-compatible:
         *  the route ignores it until the extension lands, and an envelope checkpointed
         *  before the hash shipped simply omits it. */
        sha256?: string;
      }
    >,
    options?: {
      expectedInboundEmailId?: string;
      evidenceBackfillGeneration?: number;
      evidenceBackfillResult?: Omit<EvidenceBackfillCommittedResult, 'persisted' | 'merged'>;
    },
  ): Promise<{
    persisted: number;
    updated: number;
    merged: number;
    targetCaseId?: string;
    statusGeneration?: number;
    backfillGeneration?: number;
    alreadyCompleted?: boolean;
    completedResult?: EvidenceBackfillCommittedResult;
  }> {
    return request('POST', `/api/internal/cases/${caseId}/evidence`, {
      rows,
      ...(options?.expectedInboundEmailId ? { expectedInboundEmailId: options.expectedInboundEmailId } : {}),
      ...(options?.evidenceBackfillGeneration != null
        ? { evidenceBackfillGeneration: options.evidenceBackfillGeneration }
        : {}),
      ...(options?.evidenceBackfillResult
        ? {
            evidenceBackfillOutcome: options.evidenceBackfillResult.outcome,
            ...(options.evidenceBackfillResult.failedAttachments == null
              ? {}
              : { evidenceBackfillFailedAttachments: options.evidenceBackfillResult.failedAttachments }),
            ...(options.evidenceBackfillResult.detail
              ? { evidenceBackfillDetail: options.evidenceBackfillResult.detail }
              : {}),
          }
        : {}),
    });
  },

  /**
   * Persist EXTRACTED-image evidence rows with image metadata (pdf-image-extraction
   * ticket). Same internal evidence route (idempotent on storage_path), but carries
   * the image fields the SEAM BACKEND-API wires: `imageRoleCode`, `registrationVisible`
   * (tri-state — omit when OCR was not run), `sha256`, `sequenceIndex`, plus
   * `acceptedForEva` (false for auto-extracted unknowns — staff tag role + accept).
   * Until BACKEND-API wires the fields the route ignores the extras and still dedups
   * idempotently on the child blob path, so this is forward-compatible.
   */
  persistImageEvidence(
    caseId: string,
    rows: Array<{
      filename: string;
      contentType?: string;
      size?: number;
      blobPath: string;
      evidenceClass: 'image';
      imageRoleCode?: string;
      /** Role NAME (overview/damage_closeup/additional/other) — the API route maps it to
       *  image_role_code; preferred over imageRoleCode for the live classifier. */
      imageRole?: string;
      registrationVisible?: boolean;
      acceptedForEva?: boolean;
      /** EVA exclusion (e.g. person reflection) — reason required by the schema when true. */
      excluded?: boolean;
      exclusionReason?: string | null;
      decisionSource?: 'classifier';
      /** TKT-123 advisory reflection flag (dismissible SPA warning). */
      personReflection?: boolean;
      sha256?: string;
      sequenceIndex?: number;
      sourceLabel?: string;
    }>,
  ): Promise<{
    persisted: number;
    updated: number;
    merged: number;
    statusGeneration?: number;
  }> {
    return request('POST', `/api/internal/cases/${caseId}/evidence`, { rows });
  },

  /** Persisted blob-backed evidence rows ready for archive mirroring. */
  archiveEvidenceRows(
    caseId: string,
  ): Promise<{ rows: Array<{
    id: string;
    filename: string;
    contentType: string | null;
    blobPath: string;
    claimToken: string;
    decisionGeneration: number;
    sourceLabel: string;
  }> }> {
    return request('GET', `/api/internal/cases/${caseId}/archive-evidence`);
  },

  /** Stamp one evidence row after its bytes were mirrored into the archive. */
  stampArchivedEvidence(payload: {
    caseId: string;
    evidenceId: string;
    blobPath: string;
    boxFileId: string;
    boxFileUrl?: string;
    claimToken: string;
    decisionGeneration: number;
  }): Promise<{ updated: boolean }> {
    return request('POST', `/api/internal/cases/${payload.caseId}/archive-evidence/stamp`, {
      evidenceId: payload.evidenceId,
      blobPath: payload.blobPath,
      boxFileId: payload.boxFileId,
      claimToken: payload.claimToken,
      decisionGeneration: payload.decisionGeneration,
      ...(payload.boxFileUrl ? { boxFileUrl: payload.boxFileUrl } : {}),
    });
  },

  /**
   * Recompute EVA-readiness from a row-locked snapshot. Supplying the generation
   * atomically acknowledges it only after that stable evaluation succeeds.
   */
  evaluateStatus(
    caseId: string,
    generation?: number,
  ): Promise<{ value: string; completed?: boolean; pending?: boolean }> {
    return request('POST', `/api/internal/cases/${caseId}/status-evaluate`, {
      ...(generation == null ? {} : { generation }),
    });
  },

  releaseArchiveEvidenceClaim(payload: {
    caseId: string;
    evidenceId: string;
    claimToken: string;
  }): Promise<{ released: boolean }> {
    return request('POST', `/api/internal/cases/${payload.caseId}/archive-evidence/release`, {
      evidenceId: payload.evidenceId,
      claimToken: payload.claimToken,
    });
  },

  /** Set status to ingested (only if currently new_email). Internal route — idempotent. */
  setIngested(caseId: string): Promise<{ updated: boolean }> {
    return request('POST', `/api/internal/cases/${caseId}/set-ingested`, {});
  },

  /**
   * TKT-095 / ADR-0023 — the shared `done` transition (internal route). Guarded
   * server-side `WHERE status_code = eva_submitted`, so a Durable at-least-once
   * retry / double-fire is `{ updated: false }` and any other status is never
   * moved. `signal` names the detector; `detail` lands in the report_delivered
   * audit snapshot (truncated server-side).
   */
  markDone(
    caseId: string,
    signal: 'sent_email' | 'box_pdf' | 'eva_poll' | 'manual',
    detail?: string,
  ): Promise<{ updated: boolean }> {
    return request('POST', `/api/internal/cases/${encodeURIComponent(caseId)}/mark-done`, {
      signal,
      ...(detail ? { detail } : {}),
    });
  },

  /**
   * TKT-095 detector (a) — STATUS-AGNOSTIC case lookup (internal route; read-only).
   * Unlike `triageContext`'s openCaseMatches (which excludes terminals by design),
   * this returns cases in ANY status — the sent-email detector's targets sit in the
   * terminal `eva_submitted` — together with each case's work_provider_id so the
   * handler can confirm the recipient is that case's provider before marking done.
   */
  casesLookup(payload: {
    caseIds?: string[];
    casePo?: string;
    vrm?: string;
  }): Promise<{
    cases: Array<{
      caseId: string;
      casePo: string;
      status: string;
      workProviderId: string;
      vrm: string;
    }>;
  }> {
    return request('POST', '/api/internal/cases/lookup', payload);
  },

  /** Run and persist the canonical vehicle lookup through its one Data API owner. */
  lookupVehicle(caseId: string, registration: string, idempotencyKey?: string): Promise<{
    persisted: { applied: string[]; warning?: string; retryable: boolean; replayed: boolean };
    lookup: { status: string; run_id: string };
    mileage: { status: string; warnings: Array<{ message: string }> };
  }> {
    return request('POST', '/api/vehicle-data/lookup', {
      caseId,
      registration,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
  },

  /**
   * Resolve a REPLY about existing work against OPEN cases (Case-ref first, then VRM) and
   * link the triage row to the single match — or, when ambiguous (>1), leave it for a human
   * (ADR-0010: never auto-link). The DB lookup + ADR-0010 decision run server-side (#3).
   */
  linkReplyToOpenCase(payload: {
    inbound: unknown;
    providerId?: string;
    ref?: string;
    vrm?: string;
    /** Provider job/claim reference (rules-engine-v2 Phase 2 / TKT-023 — capture-only
     *  field #2 alongside recordInboundEmail's bodyJobref/conversationId): widens the
     *  match beyond Case/PO+VRM so a follow-up bearing only e.g. "Our ref: 576299" can
     *  still attach to its open case. */
    jobref?: string;
  }): Promise<{ outcome: 'linked' | 'ambiguous' | 'no_match'; caseId?: string; candidateCount: number }> {
    return request('POST', '/api/internal/inbound/link-reply', payload);
  },

  /**
   * Resolve the LIVE context the pure `@cs/domain` `decideTriage` (Stage B, ADR-0019 /
   * rules-engine-v2 Phase 2) needs: open-case Case/PO + job-ref + VRM matches,
   * cross-mailbox duplicate delivery (the SAME Internet-Message-Id already ingested), and
   * local conversation-thread siblings (internal route; a pure read, no mutation — safe
   * to call on every Durable replay).
   */
  triageContext(payload: TriageContextRequest): Promise<TriageContextResult> {
    return request('POST', '/api/internal/triage/context', payload);
  },

  /**
   * Write ONE `ai_suggestion` row for a triage-policy proposal (case-link or
   * cancellation) — the ONLY call that persists a triage-policy decision. A `shadow`
   * (all-gates-forced-on) decision NEVER calls this (ADR-0019 §5 / the Phase-2 plan: "no
   * shadow rows in ai_suggestion while its gate is off"). Idempotent server-side: returns
   * `created: false` (never a duplicate row) when an equivalent PENDING suggestion
   * already exists, so an at-least-once Durable retry is safe.
   */
  triageSuggestLink(payload: TriageSuggestLinkRequest): Promise<TriageSuggestLinkResult> {
    return request('POST', '/api/internal/triage/suggest-link', payload);
  },

  /**
   * FIND held pre-instruction rows matching a newly-minted case's identifiers
   * (TKT-084, taxonomy v3) — read-only; the `correlatePreInstruction` activity pairs
   * this with `triageSuggestLink` (case_link, suggest-first) per returned row.
   */
  heldPreInstruction(payload: HeldPreInstructionRequest): Promise<HeldPreInstructionResult> {
    return request('POST', '/api/internal/triage/held-pre-instruction', payload);
  },

  /**
   * Write ONE `ai_suggestion` row for a Stage-C (gated LLM) triage-category proposal
   * (rules-engine-v2 Phase 4, ADR-0019 §3) — the ONLY call `triage-classify.ts`'s
   * activity makes on a non-abstain model result. Never a case mutation: a human accepts
   * it via the existing `ai_suggestion` review lifecycle
   * (`api/src/functions/ai-suggestions.ts`'s `promoteAcceptedSuggestion`), which applies
   * category_code/subtype_code the same way a staff reclassify does. Idempotent
   * server-side (same subject-key + suggestionType mechanism as `triageSuggestLink`).
   */
  triageSuggestClassification(payload: TriageSuggestClassificationRequest): Promise<TriageSuggestLinkResult> {
    return request('POST', '/api/internal/triage/suggest-link', {
      ...(payload.sourceMessageId ? { sourceMessageId: payload.sourceMessageId } : {}),
      ...(payload.inboundEmailId ? { inboundEmailId: payload.inboundEmailId } : {}),
      suggestionType: 'triage_category',
      category: payload.category,
      subtype: payload.subtype,
      rationale: payload.rationale,
      confidence: payload.confidence,
      modelVersion: payload.modelVersion,
    });
  },

  /**
   * Report the terminal outcome of a gated Outlook filing (TKT-054 / 020726 E6) — the
   * `outlook-move` queue function's write-back. `moved` also marks a still-new row
   * actioned on the API side; `failed` leaves the row retryable.
   */
  reportOutlookMove(
    inboundEmailId: string,
    payload: { outcome: 'moved' | 'failed'; folder?: string; detail?: string },
  ): Promise<void> {
    return request('POST', `/api/internal/inbound/${inboundEmailId}/outlook-moved`, payload);
  },

  /**
   * Report the terminal outcome of a case_link evidence backfill (TKT-145) — the
   * `evidence-backfill` queue consumer's write-back (the reportOutlookMove pattern).
   * `completed` writes the case-scoped attachment_classified audit; `failed` writes the
   * durable "Attachments to add" staff note + a warning audit (the inverted mitigation).
   */
  reportEvidenceBackfill(
    inboundEmailId: string,
    payload: {
      outcome: 'completed' | 'partial' | 'failed';
      targetCaseId: string;
      persisted?: number;
      merged?: number;
      failedAttachments?: number;
      detail?: string;
      generation: number;
    },
  ): Promise<void> {
    return request(
      'POST',
      `/api/internal/inbound/${encodeURIComponent(inboundEmailId)}/evidence-backfill`,
      payload,
    );
  },

  /**
   * Resolve the current owner of a queued backfill. The API follows only a
   * verified merge-retirement lineage; an unrelated relink still returns 409.
   */
  validateEvidenceBackfillTarget(
    inboundEmailId: string,
    targetCaseId: string,
    generation?: number,
  ): Promise<{
    targetCaseId: string;
    generation: number;
    completed: boolean;
    superseded?: boolean;
    committedResult?: EvidenceBackfillCommittedResult;
  }> {
    return request(
      'POST',
      `/api/internal/inbound/${encodeURIComponent(inboundEmailId)}/evidence-backfill/validate`,
      { targetCaseId, ...(generation == null ? {} : { generation }) },
    );
  },

  /** Append one audit_event row (internal route; the API enforces append-only). */
  recordAudit(payload: {
    action: string;
    caseId?: string;
    summary: string;
    severity?: 'info' | 'warning' | 'error';
    before?: unknown;
    after?: unknown;
  }): Promise<void> {
    return request('POST', '/api/internal/audit', payload);
  },

  /** Per-principal job rows for the jobsheet-import fan-out (internal route). */
  principals(): Promise<Array<{ principalCode: string }>> {
    return request('GET', '/api/internal/principals');
  },

  /** Cases due for retention disposition (internal route; case-disposition job). */
  casesForDisposition(): Promise<Array<{ caseId: string }>> {
    return request('GET', '/api/internal/disposition/due');
  },

  /** Run the retention/erasure for one case (internal route; job identity only). */
  disposeCase(caseId: string): Promise<void> {
    return request('POST', `/api/internal/disposition/${caseId}`, {});
  },

  /** Evidence blob paths eligible for the post-mirror purge (internal route). */
  blobsForPurge(): Promise<Array<{ caseId: string; blobPath: string }>> {
    return request('GET', '/api/internal/box/purge-candidates');
  },

  /** Mark an evidence blob purged after the one-way Box mirror confirmed it (internal route). */
  markBlobPurged(payload: { caseId: string; blobPath: string }): Promise<void> {
    return request('POST', '/api/internal/box/mark-purged', payload);
  },

  /** Claim unique, unreferenced Blob paths left by a failed staff upload. */
  claimStaffUploadCleanup(limit: number): Promise<{ rows: StaffUploadCleanupRow[] }> {
    return request(
      'POST',
      `/api/internal/staff-upload-cleanup/claim?limit=${encodeURIComponent(String(limit))}`,
      {},
    );
  },

  /** Acknowledge deletion/missing bytes or persist retry backoff for cleanup. */
  completeStaffUploadCleanup(
    itemId: string,
    payload: {
      claimToken: string;
      outcome: 'deleted' | 'missing' | 'failed';
      detail?: string;
    },
  ): Promise<{ updated: boolean; cleaned?: boolean; stale?: boolean }> {
    return request(
      'POST',
      `/api/internal/staff-upload-cleanup/${encodeURIComponent(itemId)}/complete`,
      payload,
    );
  },

  /**
   * Atomically claim still-unclassified Box/staff-upload image evidence rows.
   * Rows with a canonical byte locator whose
   * image_role_code is `unknown` AND registration_visible IS NULL (the TKT-131
   * "still-unclassified" predicate — a classified non-vehicle row keeps role unknown but
   * gains a boolean registration_visible, so re-sweeps are idempotent), newest first,
   * capped server-side at `limit` (clamped 1..100). The 14-day first-attempt
   * window applies to Box rows; staff uploads stay durable until disposition.
   */
  claimUnclassifiedBoxEvidence(
    limit: number,
    includeBox = true,
  ): Promise<{ rows: UnclassifiedBoxEvidenceRow[] }> {
    return request(
      'POST',
      `/api/internal/evidence/unclassified-box?limit=${encodeURIComponent(String(limit))}` +
        (includeBox ? '' : '&includeBox=false'),
      {},
    );
  },

  /** Rolling-deploy compatibility/read-only diagnostic; the sweep uses the claim method. */
  unclassifiedBoxEvidence(limit: number): Promise<{ rows: UnclassifiedBoxEvidenceRow[] }> {
    return request(
      'GET',
      `/api/internal/evidence/unclassified-box?limit=${encodeURIComponent(String(limit))}`,
    );
  },

  /**
   * TKT-146 — stamp one exact Box-lane evidence row and atomically increment the
   * case's durable status-recompute generation. The evidence id comes from the server-side
   * enumeration, so this never re-enters the general evidence dedup/link path.
   */
  stampBoxEvidenceClassification(
    evidenceId: string,
    caseId: string,
    row: {
      filename: string;
      evidenceClass: 'image';
      sourceMessageId?: string;
      boxFileId?: string;
      storagePath?: string;
      imageRole: string;
      registrationVisible: boolean;
      acceptedForEva: boolean;
      excluded: boolean;
      exclusionReason?: string | null;
      decisionSource: 'classifier';
      personReflection: boolean;
    },
    claimToken?: string,
  ): Promise<{ updated: boolean; statusGeneration?: number; stale?: boolean }> {
    return request(
      'POST',
      `/api/internal/evidence/${encodeURIComponent(evidenceId)}/box-classification`,
      {
        ...row,
        caseId,
        ...(claimToken ? { claimToken } : {}),
      },
    );
  },

  /** Wake-safe publisher backstop: the API owns the generation outbox and queue write. */
  drainEvidenceBackfillRequests(): Promise<{ published: number; failed: number }> {
    return request('POST', '/api/internal/evidence-backfill-requests/drain', {});
  },

  /**
   * Release a classification claim after a failed attempt. Transient failures are
   * rescheduled with server-owned backoff; terminal row-specific failures are
   * dead-lettered without deleting or excluding the evidence.
   */
  reportBoxEvidenceClassificationFailure(
    evidenceId: string,
    claimToken: string,
    failure: BoxClassificationFailure,
  ): Promise<{
    updated: boolean;
    stale?: boolean;
    disposition?: 'transient' | 'terminal';
    attemptCount?: number;
    nextAttemptAt?: string | null;
    deadLettered?: boolean;
  }> {
    return request(
      'POST',
      `/api/internal/evidence/${encodeURIComponent(evidenceId)}/box-classification`,
      { claimToken, failure },
    );
  },

  /** Pending durable status generations, oldest request first. */
  pendingStatusRecomputes(limit: number): Promise<{ rows: PendingStatusRecompute[] }> {
    return request(
      'GET',
      `/api/internal/status-recompute/pending?limit=${encodeURIComponent(String(limit))}`,
    );
  },

  /** Acknowledge only the generation whose status evaluation completed successfully. */
  completeStatusRecompute(
    caseId: string,
    generation: number,
  ): Promise<{ completed: boolean; pending: boolean }> {
    return request(
      'POST',
      `/api/internal/status-recompute/${encodeURIComponent(caseId)}/complete`,
      { generation },
    );
  },

  /**
   * Read a case's current Box folder linkage (internal route; idempotency source for
   * box-folder-create). `boxFolderId` is null when the case has no folder yet.
   */
  getCaseBoxFolder(
    caseId: string,
  ): Promise<{ boxFolderId: string | null; boxFolderUrl: string | null; casePo: string | null }> {
    return request('GET', `/api/internal/cases/${caseId}/box-folder`);
  },

  /**
   * First-wins stamp of the Box folder id/url onto a case (internal route). Idempotent:
   * a re-run / concurrent create returns { applied: false } and the API audits
   * box_folder_created ONLY on the stamping call. The activity reads back first, so this
   * is the durable backstop, not the primary dedup.
   */
  stampCaseBoxFolder(
    caseId: string,
    payload: { boxFolderId: string; boxFolderUrl?: string },
  ): Promise<{
    found: boolean;
    applied: boolean;
    boxFolderId: string | null;
    providerRecoveryCompleted: boolean;
    statusGeneration?: number;
  }> {
    return request('POST', `/api/internal/cases/${caseId}/box-folder`, payload);
  },
};

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}

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

import type { CreateCaseInput, CreateCaseResult } from '@cs/domain';
import type { ProviderMatchRecord, OpenProviderCase } from '@cs/domain';
import type { EvidenceDescriptor } from '@cs/domain';

/**
 * Parser-owned EVA fields (value-only) forwarded from the orchestration `parse` activity to
 * the Data API resolve-persist, where they fill the case_ eva_* columns fill-if-empty. Keyed
 * by EVA contract key. inspection_address is excluded (corpus picker — ADR-0013); mileage rides
 * its own parserMileage field. When work_provider is absent/UNKNOWN, resolve-persist may still
 * fill eva_work_provider from the matched corpus display_name.
 */
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
    throw new ConflictError(`${method} ${path} → 409`);
  }
  if (!res.ok) {
    throw new Error(`data-api ${method} ${path} → ${res.status}: ${await safeText(res)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ConflictError extends Error {}

/* ---------- typed surface ---------- */

/** Intake-time dedup context for a provider+VRM (internal route). */
export interface DedupContext {
  openProviderCases: OpenProviderCase[];
  seenMessageIds: string[];
  seenPayloadHashes: string[];
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
}

/** POST /api/internal/triage/suggest-link response body (ADR-0019 pinned contract).
 *  `created: false` means an equivalent PENDING suggestion already existed — idempotent
 *  under Durable at-least-once retries, never a duplicate row. */
export interface TriageSuggestLinkResult {
  suggestionId: string;
  created: boolean;
}

export const dataApi = {
  /** ProviderMatchRecord[] for the in-activity `matchProviderByDomain` (internal route). */
  providerMatchRecords(): Promise<ProviderMatchRecord[]> {
    return request('GET', '/api/internal/provider-match-records');
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
    decision: {
      resolution: string;
      targetCaseId?: string;
      setDuplicateRisk: boolean;
      caseLinkState?: 'none' | 'pending';
      statusEffect: string;
      auditAction: string;
    };
  }): Promise<{
    outcome: 'created' | 'attached' | 'already_ingested';
    caseId: string;
    casePo?: string | null;
    /**
     * The matched work-provider's automation mode ('manual' | 'review_auto' |
     * 'full_auto') — the SEAM BACKEND-API adds to internalCasesResolve so the
     * orchestrator can branch intake (automation-mode ticket). Absent → the
     * orchestrator defaults to 'review_auto' (current behaviour preserved).
     */
    providerAutomationMode?: 'manual' | 'review_auto' | 'full_auto';
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

  /** Persist classified evidence rows for a case (internal route; upsert by blob path). */
  persistEvidence(
    caseId: string,
    rows: Array<EvidenceDescriptor & { blobPath: string; size: number }>,
  ): Promise<{ persisted: number }> {
    return request('POST', `/api/internal/cases/${caseId}/evidence`, { rows });
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
      registrationVisible?: boolean;
      acceptedForEva?: boolean;
      sha256?: string;
      sequenceIndex?: number;
      sourceLabel?: string;
    }>,
  ): Promise<{ persisted: number }> {
    return request('POST', `/api/internal/cases/${caseId}/evidence`, { rows });
  },

  /** Persisted blob-backed evidence rows ready for archive mirroring. */
  archiveEvidenceRows(
    caseId: string,
  ): Promise<{ rows: Array<{ id: string; filename: string; contentType: string | null; blobPath: string }> }> {
    return request('GET', `/api/internal/cases/${caseId}/archive-evidence`);
  },

  /** Stamp one evidence row after its bytes were mirrored into the archive. */
  stampArchivedEvidence(payload: {
    caseId: string;
    evidenceId: string;
    blobPath: string;
    boxFileId: string;
    boxFileUrl?: string;
  }): Promise<{ updated: boolean }> {
    return request('POST', `/api/internal/cases/${payload.caseId}/archive-evidence/stamp`, {
      evidenceId: payload.evidenceId,
      blobPath: payload.blobPath,
      boxFileId: payload.boxFileId,
      ...(payload.boxFileUrl ? { boxFileUrl: payload.boxFileUrl } : {}),
    });
  },

  /** Recompute EVA-readiness + status machine and persist (internal route). */
  evaluateStatus(caseId: string): Promise<{ value: string }> {
    return request('POST', `/api/internal/cases/${caseId}/status-evaluate`, {});
  },

  /** Set status to ingested (only if currently new_email). Internal route — idempotent. */
  setIngested(caseId: string): Promise<{ updated: boolean }> {
    return request('POST', `/api/internal/cases/${caseId}/set-ingested`, {});
  },

  /**
   * Persist the advisory DVSA/DVLA enrichment result onto the case (internal route, #1).
   * Fill-if-empty on the API side; returns the fields it actually filled.
   */
  persistEnrichment(
    caseId: string,
    result: {
      vehicle_model?: string;
      make?: string;
      current_mileage?: number | string;
      mileage_unit?: string;
      warnings?: string[];
    },
  ): Promise<{ applied: string[] }> {
    return request('POST', `/api/internal/cases/${caseId}/enrichment`, result);
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
  ): Promise<{ applied: boolean; boxFolderId: string | null }> {
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

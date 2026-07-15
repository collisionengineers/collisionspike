/**
 * Typed REST client used by orchestration. All authoritative case writes pass
 * through the data service; this application never opens a database connection.
 */
import type { CreateCaseInput, CreateCaseResult, EvidenceDescriptor } from '@cs/domain';
import type {
  BoxClassificationFailure,
  DedupContext,
  EvidenceBackfillCommittedResult,
  HeldPreInstructionRequest,
  HeldPreInstructionResult,
  OutlookLinkBackfillCandidate,
  ParserEvaFields,
  PendingStatusRecompute,
  ProviderMatchRecordsResult,
  StaffUploadCleanupRow,
  TriageContextRequest,
  TriageContextResult,
  TriageSuggestClassificationRequest,
  TriageSuggestLinkRequest,
  TriageSuggestLinkResult,
  UnclassifiedBoxEvidenceRow,
} from './data-api-contracts.js';
import { request } from './data-api-http.js';

export * from './data-api-contracts.js';
export {
  ConflictError,
  DataApiHttpError,
  EvidenceBackfillReclassificationRequiredError,
  EvidenceBackfillTargetChangedError,
} from './data-api-http.js';

export interface ArchiveHoldingFile {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  blobPath: string;
  sha256: string;
  boxFileId: string | null;
  boxFileUrl: string | null;
  boxSha1: string | null;
  canonicalBoxFileId: string | null;
  state: string;
}

export interface ArchiveHoldingUploadClaim extends ArchiveHoldingFile {
  holdingId: string;
  boxFolderId: string;
  claimToken: string;
}

export interface DeferredArchiveHoldingIntake {
  id: string;
  sourceMessageId: string;
  vrm: string;
  rootFolderId: string;
  claimToken: string;
  files: Array<{ filename: string; contentType: string; size: number; blobPath: string; sha256: string }>;
}

export interface EvaSubmissionRequest {
  evaPayload12: Record<string, string>;
  images: Array<{
    filename: string;
    role: string;
    registrationVisible: boolean | null;
    sequenceIndex: number;
    content: string;
  }>;
  casePo: string;
  vrm: string;
  clmNo: string;
  payloadHash: string;
}

export type ArchiveHoldingClaim =
  | { kind: 'none' }
  | { kind: 'busy' }
  | { kind: 'complete' }
  | { kind: 'ambiguous'; candidates?: string[]; folders?: string[]; changed?: boolean }
  | {
      kind: 'claimed';
      holdingId: string;
      claimToken: string;
      mode: 'rename' | 'merge';
      holdingFolderId: string;
      canonicalFolderId: string;
      casePo: string;
      files: ArchiveHoldingFile[];
    };

export const dataApi = {
  evaSubmission(caseId: string): Promise<EvaSubmissionRequest> {
    return request('GET', `/api/internal/cases/${encodeURIComponent(caseId)}/eva-submission`);
  },

  /** Rows missing immutable message links. Read-only enumeration; processing starts
   * only through the protected repair endpoint. */
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
   * Read a work provider's per-provider AI opt-out flag (internal route; activation is
   * tracked in docs/operations/operator-actions.md).
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

  reserveArchiveHoldingIntake(payload: {
    vrm: string;
    rootFolderId: string;
    sourceMessageId: string;
    claimToken: string;
    files: Array<{ filename: string; contentType: string; size: number; blobPath: string; sha256: string }>;
  }): Promise<{ id: string; acquired: boolean; completed: boolean; busy: boolean }> {
    return request('POST', '/api/internal/archive-holding/reserve', payload);
  },

  registerArchiveHolding(payload: {
    vrm: string;
    rootFolderId: string;
    boxFolderId: string;
    sourceMessageId: string;
    claimToken: string;
    files: Array<{ filename: string; contentType: string; size: number; blobPath: string; sha256: string }>;
  }): Promise<{
    holdingId: string;
    boxFolderId: string;
    files: ArchiveHoldingFile[];
    deferred: boolean;
    replayed: boolean;
  }> {
    return request('POST', '/api/internal/archive-holding/register', payload);
  },

  stampArchiveHoldingUpload(fileId: string, payload: {
    claimToken: string;
    boxFileId: string;
    boxFileUrl: string;
    boxSha1?: string;
  }): Promise<{ updated: boolean }> {
    return request('POST', `/api/internal/archive-holding/files/${encodeURIComponent(fileId)}/uploaded`, payload);
  },

  failArchiveHoldingUpload(fileId: string, payload: { claimToken: string; error: string }): Promise<void> {
    return request('POST', `/api/internal/archive-holding/files/${encodeURIComponent(fileId)}/failed`, payload);
  },

  claimArchiveHoldingUploads(claimToken: string, limit = 25): Promise<{ files: ArchiveHoldingUploadClaim[] }> {
    return request('POST', '/api/internal/archive-holding/uploads/claim', { claimToken, limit });
  },

  archiveHoldingAdoptionCandidates(limit = 50): Promise<{ caseIds: string[] }> {
    return request('GET', `/api/internal/archive-holding/adoption-candidates?limit=${encodeURIComponent(String(limit))}`);
  },

  claimDeferredArchiveHoldingIntakes(
    claimToken: string,
    limit = 10,
  ): Promise<{ intakes: DeferredArchiveHoldingIntake[] }> {
    return request('POST', '/api/internal/archive-holding/deferred/claim', { claimToken, limit });
  },

  completeDeferredArchiveHoldingIntake(id: string, claimToken: string): Promise<{ updated: boolean }> {
    return request('POST', `/api/internal/archive-holding/deferred/${encodeURIComponent(id)}/complete`, { claimToken });
  },

  failDeferredArchiveHoldingIntake(
    id: string,
    payload: { claimToken: string; error: string },
  ): Promise<void> {
    return request('POST', `/api/internal/archive-holding/deferred/${encodeURIComponent(id)}/failed`, payload);
  },

  claimArchiveHolding(caseId: string, claimToken: string): Promise<ArchiveHoldingClaim> {
    return request('POST', `/api/internal/cases/${encodeURIComponent(caseId)}/archive-holding/claim`, { claimToken });
  },

  checkpointArchiveHoldingFile(
    holdingId: string,
    fileId: string,
    payload: {
      claimToken: string;
      kind: 'moved' | 'deduplicated';
      canonicalFileId: string;
      canonicalFileUrl: string;
      sourceRetired: boolean;
    },
  ): Promise<{ updated: boolean }> {
    return request(
      'POST',
      `/api/internal/archive-holding/${encodeURIComponent(holdingId)}/files/${encodeURIComponent(fileId)}/checkpoint`,
      payload,
    );
  },

  finalizeArchiveHolding(
    holdingId: string,
    payload: { caseId: string; claimToken: string; folderId: string; folderUrl: string },
  ): Promise<{ adopted: number }> {
    return request('POST', `/api/internal/archive-holding/${encodeURIComponent(holdingId)}/finalize`, payload);
  },

  failArchiveHoldingAdoption(
    holdingId: string,
    payload: { claimToken: string; error: string },
  ): Promise<void> {
    return request('POST', `/api/internal/archive-holding/${encodeURIComponent(holdingId)}/failed`, payload);
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
         *  FILE.UPLOADED mirror twin on (case_id, sha256). Optional:
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
   * idempotently on the child blob path.
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
   * (`services/data-api/src/features/assistant/suggestion-review-routes.ts`'s
   * `promoteAcceptedSuggestion`), which applies
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

  /** Read-only diagnostic; the sweep uses the claim method. */
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

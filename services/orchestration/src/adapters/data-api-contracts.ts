/** Typed orchestration contracts for the REST data service. */
import type {
  ImageSourceMatchRecord,
  OpenProviderCase,
  ProviderMatchRecord,
} from '@cs/domain';

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
  /** Present on claim responses; diagnostic reads may return null. */
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

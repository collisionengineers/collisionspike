/**
 * api/src/functions/internal.ts — orchestration-facing internal routes.
 *
 * The /api/internal/* routes called by orchestration/src/lib/data-api.ts AND by
 * the retained box-webhook Python Function (the box/case-by-folder lookup + the
 * box-aware evidence persist — see functions/box-webhook/data_api_client.py).
 * Auth: service-level Bearer token (a client-credentials MSI token for the API
 * audience), validated against the tenant JWKS (same jwtVerify as user routes)
 * but no CollisionSpike.* app role required — the orchestration / box-webhook MSI
 * token carries the API audience but is not a user token with assigned app roles.
 * Plan 21 §21.3 pattern: the distinct /api/internal/* prefix leaves the
 * DataAccess freeze (R3) untouched.
 *
 * Routes (plan 21 §21.3 + orchestration/src/lib/data-api.ts + box-webhook surface):
 *  GET  /api/internal/provider-match-records         → ProviderMatchRecord[]
 *  GET  /api/internal/work-provider/{id}/ai-allowed  → { aiAllowed: boolean | null } (per-provider AI opt-out, docs/gated.md D6)
 *  GET  /api/internal/dedup-context                  → DedupContext
 *  POST /api/internal/cases/resolve                  → { outcome, caseId }
 *  POST /api/internal/cases/{id}/evidence            → { persisted, updated, merged }
 *  GET  /api/internal/cases/{id}/archive-evidence    → blob-backed evidence rows for archive mirroring
 *  POST /api/internal/cases/{id}/archive-evidence/stamp → stamp archive file id/link
 *  POST /api/internal/cases/{id}/status-evaluate     → { value: string }
 *  POST /api/internal/cases/{id}/set-ingested        → { updated: boolean }
 *  POST /api/internal/audit                          → 204
 *  GET  /api/internal/principals                     → [{ principalCode }]
 *  GET  /api/internal/disposition/due                → [{ caseId }]
 *  POST /api/internal/disposition/{id}               → 204
 *  POST /api/internal/cases/{id}/mark-done           → { updated: boolean } (TKT-095/ADR-0023: eva_submitted → done, guarded)
 *  POST /api/internal/cases/lookup                    → { cases: [...] } (TKT-095 detector (a): status-agnostic case lookup)
 *  GET  /api/internal/box/case-by-folder/{folderId}  → { caseId: string | null, casePo: string | null }
 *  GET  /api/internal/box/purge-candidates           → [{ caseId, blobPath }]
 *  POST /api/internal/box/mark-purged                → 204
 *  GET|POST /api/internal/evidence/unclassified-box → { rows: [...] } (TKT-146: due-row read /
 *                                                        atomic claim for the Box classify sweep)
 *  POST /api/internal/evidence/{id}/box-classification → { updated, statusGeneration }
 *  GET  /api/internal/status-recompute/pending       → { rows: [{ caseId, generation }] }
 *  POST /api/internal/status-recompute/{id}/complete → { completed, pending }
 *  GET  /api/internal/cases/{id}/box-folder          → { boxFolderId, boxFolderUrl, casePo }
 *  POST /api/internal/cases/{id}/box-folder          → { applied, boxFolderId } (first-wins stamp)
 *  POST /api/internal/triage/context                 → { openCaseMatches, duplicateInternetMessageId, conversationSiblingCaseIds } (rules-engine-v2 Phase 2)
 *  POST /api/internal/triage/suggest-link             → { suggestionId, created } (rules-engine-v2 Phase 2;
 *                                                         suggestionType 'triage_category' added Phase 4)
 *  POST /api/internal/triage/held-pre-instruction     → { held: [{ inboundEmailId, sourceMessageId, matchedOn }] } (TKT-084, taxonomy v3)
 *  POST /api/internal/inbound/{id}/outlook-moved      → 204 (TKT-054 Outlook-filing outcome report)
 *  POST /api/internal/inbound/{id}/evidence-backfill  → 204 (TKT-145 case_link evidence-backfill outcome report)
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import {
  EVA_FIELD_ORDER,
  TERMINAL_STATUSES,
  allowedCaseTypes,
  categoryMintsCase,
  describeEvidence,
  markerForMint,
  statusForReviewCase,
  type CaseStatus,
  type CaseWorkType,
  type EvidenceDescriptor,
  type ImageRole,
  type InboundCategory,
  type InboundSubtype,
  type StatusEvaluationInput,
} from '@cs/domain';
import {
  actionReasonCodec,
  automationModeCodec,
  caseStatusCodec,
  caseTypeCodec,
  evidenceKindCodec,
  imageRoleCodec,
  intakeChannelKindCodec,
  sourceTypeCodec,
  statusToInt,
} from '@cs/domain/codecs';
import { gates } from '../lib/gates.js';
import { authenticate, toErrorResponse } from '../lib/auth.js';
import { query, tx, type TxQuery } from '../lib/db.js';
import { isPrefillApplicable, prefillImageBasedInspection } from '../lib/inspection-prefill.js';
import { maybeSuggestOverviewChase } from '../lib/overview-chase.js';
import { writeEvidenceBackfillNote } from '../lib/evidence-backfill-note.js';
import { withResolvedEvidenceBackfillTarget } from '../lib/evidence-backfill-target.js';
import { mintCasePo } from '../lib/case-po.js';
import { AUDIT_ACTION, writeAudit } from '../lib/audit.js';
import { markCaseDoneUsing } from '../lib/terminal-transition.js';
import { combineMakeModel } from '../lib/enrichment-map.js';
import {
  corpusWorkProviderCandidate,
  isEngineerReportLayoutSentinel,
  isUnknownWorkProviderSentinel,
  matchWorkProviderByContentString,
  selectParserEvaCandidates,
  type ParserEvaFields,
  type WorkProviderContentMatchRecord,
} from '../lib/parser-eva-fields.js';
import {
  CASE_SELECT,
  EVA_COLUMN_BY_KEY,
  INBOUND_CATEGORY_TO_INT,
  INBOUND_SUBTYPE_TO_INT,
  deriveSuggestionIdempotencyKey,
  mergedIntoFrom,
  rowToCase,
  rowToEvidence,
  type Row,
} from '../lib/mappers.js';
import { hasColumn, planOptionalColumns, tableColumns } from '../lib/schema-introspect.js';
import { acquireTriageLocks } from '../lib/triage-locks.js';
import { lockCaseForMutation } from '../lib/case-mutation-locks.js';
import { clampVarchar, vrmOrEmpty } from '../lib/varchar-guard.js';
import { vrmLinkRefConflict } from '../lib/link-guards.js';
import { requestStatusRecompute } from '../lib/status-recompute.js';
import {
  requestArchiveMirrorIfEligible,
  type ArchiveMirrorCandidate,
} from '../lib/archive-mirror-outbox.js';

/* ============================================================
   Service auth — validate the JWT (sig + iss + aud + exp) without
   requiring a CollisionSpike.* app role. The orchestration MSI presents
   a client-credentials token for the API audience, not a user-delegated
   token with app roles assigned.
   ============================================================ */

export async function withServiceAuth(
  req: HttpRequest,
  ctx: InvocationContext,
  fn: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>,
): Promise<HttpResponseInit> {
  // authenticate() throws HttpError(401) for a missing/invalid/expired token and
  // rethrows anything UNEXPECTED (e.g. a transient JWKS fetch failure). toErrorResponse
  // maps the former to 401 and the latter to 500 — same discrimination as withRole, so a
  // transient server-side fault is reported as 500 (server fault), not a misleading 401.
  try {
    await authenticate(req);
  } catch (e) {
    return toErrorResponse(e, ctx);
  }
  try {
    return await fn(req, ctx);
  } catch (e) {
    ctx.error(e);
    return { status: 500, jsonBody: { error: 'internal' } };
  }
}

/* ============================================================
   Module-level helpers
   ============================================================ */

/** Integer codes for the three terminal CaseStatuses — used in SQL NOT IN filters. */
const TERMINAL_INT_CODES: number[] = TERMINAL_STATUSES
  .map((s) => caseStatusCodec.toInt(s))
  .filter((v): v is number => v != null);

/** Audit action name -> integer code (reverse of AUDIT_ACTION). */
const AUDIT_ACTION_BY_NAME: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(AUDIT_ACTION).map(([name, code]) => [name, code as number]),
);

/** Sniff the domain after '@' in a sender address (lower-case). Returns '' on failure. */
function senderDomain(address: string): string {
  const at = address.lastIndexOf('@');
  if (at < 0 || at === address.length - 1) return '';
  return address.slice(at + 1).toLowerCase().trim();
}

/**
 * TKT-119 belt-and-braces mint guard — the Data-API-side twin of the orchestration
 * `categoryMintsCase` guard (TKT-081). Looks up the message's OWN triage row (written by
 * classifyInbound BEFORE any create runs, and carrying any later staff reclassify) and
 * returns the category name when that category may NOT mint a case (acknowledgement/
 * query/non_actionable/billing/…), or null when minting is allowed. A missing row (a
 * never-classified envelope, e.g. a synthetic retro anchor) allows the create — this is
 * a second lock on the same door, not a new gate.
 */
export async function mintBlockedByCategory(
  internetMessageId: string | null | undefined,
): Promise<string | null> {
  const id = (internetMessageId ?? '').trim();
  if (!id) return null;
  try {
    const rows = await query<Row>(
      `SELECT c.name AS category
         FROM inbound_email ie
         JOIN choice_inbound_category c ON c.code = ie.category_code
        WHERE ie.source_message_id = $1`,
      [id],
    );
    const category = (rows[0]?.category as string | undefined) ?? '';
    if (!category) return null;
    return categoryMintsCase(category as InboundCategory) ? null : category;
  } catch {
    return null; // guard is belt-and-braces — a read failure must never block intake
  }
}

/** choice_chaser_status codes (000_enums_lookups.sql). */
const CHASER_STATUS_RESPONDED = 100000002;
const CHASER_OUTSTANDING_CODES = [100000000, 100000001, 100000003]; // drafted, sent, overdue

/**
 * TKT-023 — when an inbound email ATTACHES to a case (auto-link, suggestion accept,
 * dedup attach), any outstanding chaser on that case is satisfied by the arrival: mark
 * it 'responded' (drafted/sent/overdue → responded) with an audit. No-op when the case
 * has no outstanding chaser. Best-effort: a chaser bookkeeping failure must never block
 * the attach that triggered it. Returns the number of chasers updated.
 */
export async function markOutstandingChasersResponded(
  caseId: string,
  via: string,
): Promise<number> {
  try {
    const rows = await query<Row>(
      `UPDATE chaser SET status_code = $2, updated_at = now()
        WHERE case_id = $1 AND status_code IN (${CHASER_OUTSTANDING_CODES.join(',')})
        RETURNING id`,
      [caseId, CHASER_STATUS_RESPONDED],
    );
    if (rows.length > 0) {
      // chaser_sent (100000023) is the controlled chaser-family audit action (the same
      // reuse logChase makes in cases.ts); the summary keeps the wording honest.
      await writeAudit({
        action: AUDIT_ACTION.chaser_sent,
        caseId,
        summary: `Chaser marked responded — the requested item arrived (${via})`,
        after: { chaserIds: rows.map((r) => r.id), via },
      });
    }
    return rows.length;
  } catch {
    return 0;
  }
}

/**
 * Recompute a case's status via @cs/domain statusForReviewCase and persist when it
 * changes. Returns the resulting CaseStatus name. Safe to call in any activity that
 * may change the case state.
 *
 * TKT-109/129: the evaluation seam first applies the provider-policy inspection
 * pre-fill (always_image_based providers auto-complete "Image Based Assessment",
 * fill-if-empty, audited) — the SAME seam as the staff-facing recomputeStatus in
 * cases.ts, so intake-driven evaluation and staff-driven evaluation agree.
 */
interface StatusRecomputeResult {
  found: boolean;
  value: CaseStatus;
  completed?: boolean;
  pending?: boolean;
}

/**
 * Evaluate from one stable case snapshot. The case row is locked before evidence is
 * read, status is computed, and an optional durable generation is acknowledged. Every
 * evidence mutation requests its generation by updating this same case row, so a
 * concurrent mutation either commits before this lock (and is visible) or waits and
 * requests a newer still-pending generation after this transaction commits.
 */
async function recomputeStatus(
  caseId: string,
  acknowledgeGeneration?: number,
): Promise<StatusRecomputeResult> {
  // Preserve the provider-policy prefill seam. It owns supplementary provenance and
  // audit writes outside this module; the guarded fill completes before the stable
  // status transaction re-reads and locks the case.
  const previewRows = await query<Row>(`${CASE_SELECT} WHERE c.id = $1`, [caseId]);
  const preview = previewRows[0];
  if (preview && isPrefillApplicable(rowToCase(preview))) {
    await prefillImageBasedInspection(caseId);
  }

  const result = await tx<StatusRecomputeResult>(async (q) => {
    const rows = await q<Row>(
      `${CASE_SELECT} WHERE c.id = $1 FOR UPDATE OF c`,
      [caseId],
    );
    const rec = rows[0];
    if (!rec) return { found: false, value: 'error' };

    const evidenceRows = await q<Row>('SELECT * FROM evidence WHERE case_id = $1', [caseId]);
    const evidence = evidenceRows.map(rowToEvidence);
    const full = rowToCase(rec, { evidence });
    const input: StatusEvaluationInput = {
      status: full.status,
      evaFields: full.evaFields,
      evidence: full.evidence,
      instructionCount: full.evidence.filter((e) => e.kind === 'instruction').length,
      hasIdentity:
        full.vrm.trim().length > 0 ||
        full.providerCode.trim().length > 0 ||
        full.evaFields.claimantName.value.trim().length > 0,
      // TKT-141 retired-lock: the marker is read while the case row is locked.
      // A merge that won first is preserved; one that starts later waits.
      mergedInto: full.mergedInto,
    };
    const next = statusForReviewCase(input);

    if (next !== full.status) {
      await q('UPDATE case_ SET status_code = $2, updated_at = now() WHERE id = $1', [
        caseId,
        statusToInt(next),
      ]);
      await writeAudit({
        action: AUDIT_ACTION.status_changed,
        caseId,
        summary: `Status ${full.status} -> ${next} (internal recompute)`,
        before: { status: full.status },
        after: { status: next },
      }, q);
    }

    if (acknowledgeGeneration != null) {
      const ack = await q<{
        status_recompute_requested_generation: string | number;
        status_recompute_completed_generation: string | number;
      }>(
        `UPDATE case_
            SET status_recompute_completed_generation = GREATEST(
                  status_recompute_completed_generation,
                  LEAST($2::bigint, status_recompute_requested_generation)
                )
          WHERE id = $1
          RETURNING status_recompute_requested_generation,
                    status_recompute_completed_generation`,
        [caseId, acknowledgeGeneration],
      );
      const requested = Number(ack[0].status_recompute_requested_generation);
      const completedGeneration = Number(ack[0].status_recompute_completed_generation);
      return {
        found: true,
        value: next,
        completed: completedGeneration >= acknowledgeGeneration,
        pending: completedGeneration < requested,
      };
    }

    return { found: true, value: next };
  });

  if (result.found) {
    // TKT-148: advisory and internally row-locking before it inserts, so it is safe
    // after the status transaction commits and never widens the locked critical path.
    await maybeSuggestOverviewChase(caseId, result.value);
  }
  return result;
}

/**
 * Fill-if-empty persist of parser-extracted instruction fields onto a case (cross-cutting
 * parser-field persistence). ADVISORY: never clobbers a staff/intake value (mirrors the
 * enrichment fill-if-empty pattern below).
 *  - case_ref            ← parserRef            (only when the case has no case_ref yet)
 *  - eva_mileage (+unit)  ← parserMileage/Unit   (only when the case has no mileage yet)
 *  - the parser-owned EVA columns (work_provider, vehicle_model, claimant_name/telephone/email,
 *    date_of_loss, date_of_instruction, accident_circumstances, vat_status) ← parserEva — each
 *    fill-if-empty and CONSTRAINT-GUARDED (selectParserEvaCandidates drops a bad date / non-Yes-No
 *    VAT / UNKNOWN work_provider so a malformed parser value can never break the intake UPDATE).
 *    When the parser did not yield work_provider, the matched corpus display_name fills
 *    eva_work_provider (fill-if-empty, provenance corpus / "Matched provider").
 *    (inspection_address is owned by the corpus picker / ADR-0013 — excluded from auto-fill.)
 *  - work_provider_id (the Case-IDENTITY FK — NOT the same column as eva_work_provider above)
 *    ← parserEva.work_provider, mapped to a real corpus row via matchWorkProviderByContentString
 *    (rules-engine-v2 Phase 3, ADR-0011 "as written"). Fill-if-empty; NEVER overwrites an
 *    existing work_provider_id — content is the PRIMARY provider signal but this function is
 *    an advisory correction, not an override authority. A disagreement between the content
 *    match and an already-set work_provider_id is audited (never auto-flipped) so staff can
 *    see it. When `intermediary` is supplied (the sender matched an Image-Source
 *    intermediary — providerMatch activity, Phase 3) and the content-matched provider is
 *    among its N:N candidates, that agreement is CORROBORATION — recorded in both the
 *    provenance row's source_label and a dedicated audit_event.
 *  Each field actually filled this run gets a field_level_provenance row. A no-op when every
 *  input is absent, so callers can pass them unconditionally.
 */
export type ProviderResolutionSource = 'none' | 'instruction_content' | 'single_intermediary';

export interface ApplyParserFieldsResult {
  providerResolutionSource: ProviderResolutionSource;
  resolvedProviderId?: string;
}

export async function applyParserFields(
  caseId: string,
  parserRef?: string,
  parserMileage?: string,
  parserMileageUnit?: string,
  parserEva?: ParserEvaFields,
  workProviderId?: string | null,
  /** rules-engine-v2 Phase 3 — set when the SENDER matched an Image-Source intermediary
   *  (orchestration providerMatch activity); its N:N candidate work providers let a
   *  content-detected match be recorded as CORROBORATED rather than a bare guess. */
  intermediary?: { imageSourceId: string; candidateProviderIds: readonly string[] } | null,
): Promise<ApplyParserFieldsResult> {
  let providerResolutionSource: ProviderResolutionSource = 'none';
  let resolvedProviderId: string | undefined;
  const result = (): ApplyParserFieldsResult => ({
    providerResolutionSource,
    ...(resolvedProviderId ? { resolvedProviderId } : {}),
  });
  const ref = (parserRef ?? '').trim();
  const mileage = parserMileage != null ? String(parserMileage).replace(/[^\d]/g, '') : '';
  const unitRaw = (parserMileageUnit ?? '').trim();
  const unit = unitRaw === 'Miles' || unitRaw === 'Km' ? unitRaw : '';
  const evaCandidates = selectParserEvaCandidates(parserEva);
  const matchedProviderId = (workProviderId ?? '').trim();
  const mightFillWorkProviderFromCorpus =
    Boolean(matchedProviderId) &&
    !evaCandidates.some((c) => c.column === 'eva_work_provider');
  const rawContentProvider = (parserEva?.work_provider ?? '').toString().trim();
  const mightMatchWorkProviderIdFromContent =
    Boolean(rawContentProvider) &&
    !isUnknownWorkProviderSentinel(rawContentProvider) &&
    // TKT-051: an engineer-report layout name ("EVA (Engineers)") is the audited
    // firm's report, never the instructing provider — skip the corpus match entirely.
    !isEngineerReportLayoutSentinel(rawContentProvider);
  // 1c (audit-case provider recovery, TKT-065): the sender matched an Image-Source
  // INTERMEDIARY (e.g. Connexus) that routes for EXACTLY ONE work provider. A single
  // candidate is unambiguous, so it can resolve work_provider_id when nothing else did —
  // the case where content-match is unmatched/denylisted (the instruction doc was the
  // audited engineer report) AND the sender domain resolved no provider. A >1-candidate
  // intermediary ({PCH,SBL}) stays a human decision (left Held) — never guessed.
  const singleIntermediaryCandidate =
    intermediary && intermediary.candidateProviderIds.length === 1
      ? intermediary.candidateProviderIds[0]
      : null;
  if (
    !ref &&
    !mileage &&
    evaCandidates.length === 0 &&
    !mightFillWorkProviderFromCorpus &&
    !mightMatchWorkProviderIdFromContent &&
    !singleIntermediaryCandidate
  ) {
    return result();
  }

  // Read every column we might fill so each write is strictly fill-if-empty.
  const readCols = [
    'case_ref',
    'ov_claim_number',
    'eva_mileage',
    'eva_work_provider',
    'work_provider_id',
    ...evaCandidates.map((c) => c.column),
  ];
  const cur = await query<Row>(`SELECT ${readCols.join(', ')} FROM case_ WHERE id = $1`, [caseId]);
  if (!cur[0]) return result();
  const isEmpty = (v: unknown): boolean => !String(v ?? '').trim();

  const sets: string[] = [];
  const vals: unknown[] = [];
  let mileageFilled = false;
  // Fields filled this run → provenance row each (source type varies by origin).
  const provenance: Array<{
    field: string;
    value: string;
    sourceType: 'pdf_extraction' | 'corpus';
    sourceLabel: string;
  }> = [];

  if (ref && isEmpty(cur[0].case_ref)) {
    sets.push(`case_ref = $${sets.length + 1}`);
    vals.push(ref.slice(0, 100)); // TKT-073: case_ref is varchar(100) — the old 200 cap could 22001
  }
  // TKT-128: mirror the provider's reference into the "Imported details" overview
  // fact (ov_claim_number — the same column manual intake's Provider's-reference
  // field writes) so a parsed case's panel isn't blank. Fill-if-empty like
  // everything else here; the parser envelope carries no other ov_* facts.
  if (ref && isEmpty(cur[0].ov_claim_number)) {
    sets.push(`ov_claim_number = $${sets.length + 1}`);
    vals.push(ref.slice(0, 100)); // ov_claim_number varchar(100)
  }
  if (mileage && isEmpty(cur[0].eva_mileage)) {
    sets.push(`eva_mileage = $${sets.length + 1}`);
    vals.push(mileage.slice(0, 20));
    mileageFilled = true;
    if (unit) {
      sets.push(`eva_mileage_unit = $${sets.length + 1}`);
      vals.push(unit);
    }
  }
  for (const cand of evaCandidates) {
    if (isEmpty(cur[0][cand.column])) {
      sets.push(`${cand.column} = $${sets.length + 1}`);
      vals.push(cand.value);
      provenance.push({
        field: cand.provenanceField,
        value: cand.value,
        sourceType: 'pdf_extraction',
        sourceLabel: 'From instructions',
      });
    }
  }

  // rules-engine-v2 Phase 3 (ADR-0011) — map the parser's content-detected work_provider
  // STRING to a real work_provider_id. Doc content is the PRIMARY provider signal
  // (ADR-0011); the sender's own domain (workProviderId, resolved earlier by
  // matchProviderByDomain) is the SECONDARY/confirmatory one for a direct provider and is
  // what already fills work_provider_id at case-create (cases/resolve below) — this block
  // is the fill for when THAT signal was absent or wrong (an intermediary sender like
  // Connexus, a not-yet-known direct domain, …) but the document content still names a
  // real, known provider (TKT-021/TKT-051). Evaluated whenever the parser supplied a
  // (non-UNKNOWN) string, regardless of whether work_provider_id is currently empty — a
  // MISMATCH must also surface even when it is already set (never auto-flip).
  //
  // HELD/on_hold FINDING (verified 2026-07-02 — do not assume this fill un-holds a case):
  // a "new client" case (no provider matched at case-create — cases/resolve above) is
  // parked with `on_hold = true` PLUS a Held-queue-only status; `on_hold` is a SEPARATE
  // boolean column that `recomputeStatus`/statusForReviewCase (packages/domain
  // case-status.ts) NEVER reads or writes — it only ever recomputes `status_code`. The
  // ONLY existing writers of `on_hold = false` are the explicit staff "take off hold"
  // PATCH (cases.ts), the dedup ATTACH path, and case-close/removal — none of which this
  // fill triggers. So filling work_provider_id here does NOT retroactively unhold the case
  // or mint a Case/PO (that mint is a one-time, advisory-locked decision taken inside the
  // cases/resolve transaction, before this function ever runs) — it fills the identity
  // field (+ provenance) so the correct provider is visible on an otherwise still-Held
  // case, but a person still confirms/unholds it. Deliberately NOT "fixed" here: doing so
  // would mean either silently un-holding a case with no Case/PO (worse than leaving it
  // Held — nothing else in this codebase, including the staff-facing case-edit PATCH,
  // mints a Case/PO for an already-created case today), or reimplementing the advisory-
  // locked mint outside its transaction and changing this route's response contract
  // (Box-folder-creation in intakeOrchestrator.ts keys off THIS request's own casePo) —
  // both are a genuinely new capability beyond a fill-if-empty field mapping.
  if (mightMatchWorkProviderIdFromContent) {
    const providerRows = await query<Row>(
      'SELECT id, principal_code, display_name FROM work_provider WHERE active = true',
    );
    const contentCandidates: WorkProviderContentMatchRecord[] = providerRows.map((r) => ({
      workProviderId: r.id as string,
      principalCode: (r.principal_code as string | null) ?? '',
      displayName: (r.display_name as string | null) ?? '',
    }));
    const contentMatch = matchWorkProviderByContentString(rawContentProvider, contentCandidates);

    if (contentMatch.outcome === 'matched') {
      const existingWorkProviderId = (cur[0].work_provider_id as string | null) ?? null;
      const corroborated = Boolean(
        intermediary?.candidateProviderIds?.includes(contentMatch.workProviderId),
      );
      if (isEmpty(existingWorkProviderId)) {
        sets.push(`work_provider_id = $${sets.length + 1}`);
        vals.push(contentMatch.workProviderId);
        providerResolutionSource = 'instruction_content';
        resolvedProviderId = contentMatch.workProviderId;
        provenance.push({
          field: 'workProviderId',
          value: contentMatch.workProviderId,
          sourceType: 'pdf_extraction',
          sourceLabel: corroborated
            ? 'From instructions — provider identified (confirmed by intermediary sender)'
            : 'From instructions — provider identified',
        });
        if (corroborated) {
          await writeAudit({
            action: AUDIT_ACTION.provider_matched,
            caseId,
            summary: 'Instruction content confirms the work provider the intermediary sender routes for',
            after: {
              workProviderId: contentMatch.workProviderId,
              viaIntermediaryImageSourceId: intermediary?.imageSourceId,
            },
          });
        }
      } else if (existingWorkProviderId !== contentMatch.workProviderId) {
        // NEVER overwrite an existing work_provider_id — content is the primary SIGNAL,
        // not an override authority (ADR-0011). A disagreement is surfaced to the audit
        // trail only; staff resolve it — it never auto-flips.
        await writeAudit({
          action: AUDIT_ACTION.provider_matched,
          caseId,
          severity: 'warning',
          summary:
            'Instruction content names a different work provider than the one already on the case — kept the existing provider',
          before: { workProviderId: existingWorkProviderId },
          after: { contentDetectedWorkProviderId: contentMatch.workProviderId },
        });
      }
      // else: content agrees with the existing FK already — nothing to change or flag.
    }
    // 'ambiguous' / 'unmatched' — never guess; the free-text eva_work_provider candidate
    // above (or the corpus fallback below) still carries the human-readable string either way.
  }

  // 1c (TKT-065) — single-candidate intermediary fallback for work_provider_id. Runs when the
  // above content-match did NOT set work_provider_id this run (audit case: the parsed
  // instruction was the audited EVA report, so content is empty/denylisted) and the FK is still
  // empty. A single-provider intermediary link is unambiguous → fill it (fill-if-empty), with an
  // audit trail. Like the content-match fill, this does NOT un-hold the case or mint a Case/PO
  // (see the HELD/on_hold finding above) — it fills the identity field so the right provider is
  // visible while a person still confirms/unholds. >1 candidate is left for a human.
  const alreadySettingWorkProviderId = sets.some((s) => s.startsWith('work_provider_id ='));
  if (singleIntermediaryCandidate && !alreadySettingWorkProviderId && isEmpty(cur[0].work_provider_id)) {
    // Resolve the candidate's row and REQUIRE it active — the intermediary N:N
    // (candidateProviderIds) is NOT itself active-filtered (the image_source join in the
    // provider-match-records route), so a stale link to a deactivated provider must not
    // resolve, exactly as the direct-domain and content-match paths only match active rows.
    const wpRows = await query<Row>(
      'SELECT display_name FROM work_provider WHERE id = $1 AND active = true',
      [singleIntermediaryCandidate],
    );
    if (wpRows[0]) {
      sets.push(`work_provider_id = $${sets.length + 1}`);
      vals.push(singleIntermediaryCandidate);
      providerResolutionSource = 'single_intermediary';
      resolvedProviderId = singleIntermediaryCandidate;
      provenance.push({
        field: 'workProviderId',
        value: singleIntermediaryCandidate,
        sourceType: 'corpus',
        sourceLabel: 'From intermediary sender — routes for a single provider',
      });
      // Mirror the corpus-display fallback below: also fill the free-text EVA provider column
      // (fill-if-empty) so the REQUIRED EVA `workProvider` field isn't left blank while the FK
      // identity is set. mightFillWorkProviderFromCorpus is false on this audit path (no
      // sender-domain provider resolved), so the block below never fills it for these cases.
      const corpusCandidate = corpusWorkProviderCandidate(wpRows[0].display_name as string | undefined);
      if (
        corpusCandidate &&
        isEmpty(cur[0].eva_work_provider) &&
        !sets.some((s) => s.startsWith('eva_work_provider ='))
      ) {
        sets.push(`eva_work_provider = $${sets.length + 1}`);
        vals.push(corpusCandidate.value);
        provenance.push({
          field: corpusCandidate.provenanceField,
          value: corpusCandidate.value,
          sourceType: 'corpus',
          sourceLabel: 'From intermediary sender — routes for a single provider',
        });
      }
      await writeAudit({
        action: AUDIT_ACTION.provider_matched,
        caseId,
        summary:
          'Intermediary sender routes for exactly one work provider — provider resolved from the intermediary link',
        after: {
          workProviderId: singleIntermediaryCandidate,
          viaIntermediaryImageSourceId: intermediary?.imageSourceId,
        },
      });
    }
  }

  if (mightFillWorkProviderFromCorpus && isEmpty(cur[0].eva_work_provider)) {
    const wpRows = await query<Row>(
      'SELECT display_name FROM work_provider WHERE id = $1',
      [matchedProviderId],
    );
    const corpusCandidate = corpusWorkProviderCandidate(
      wpRows[0]?.display_name as string | undefined,
    );
    if (corpusCandidate) {
      sets.push(`eva_work_provider = $${sets.length + 1}`);
      vals.push(corpusCandidate.value);
      provenance.push({
        field: corpusCandidate.provenanceField,
        value: corpusCandidate.value,
        sourceType: 'corpus',
        sourceLabel: 'Matched provider',
      });
    }
  }

  if (sets.length === 0) return result(); // every candidate already populated — respect existing values

  vals.push(caseId);
  await query(
    `UPDATE case_ SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`,
    vals,
  );

  // Provenance (mirror the manual-create field_level_provenance shape). Supplementary — must
  // never block intake. Written only for fields actually filled this run.
  if (mileageFilled) {
    provenance.unshift({
      field: 'mileage',
      value: mileage.slice(0, 20),
      sourceType: 'pdf_extraction',
      sourceLabel: 'From instructions',
    });
  }
  const pdfSourceTypeCode = sourceTypeCodec.toInt('pdf_extraction') ?? 100000001;
  const corpusSourceTypeCode = sourceTypeCodec.toInt('corpus') ?? 100000003;
  for (const p of provenance) {
    const sourceTypeCode = p.sourceType === 'corpus' ? corpusSourceTypeCode : pdfSourceTypeCode;
    await query(
      `INSERT INTO field_level_provenance
         (name, case_id, field_name, value, source_type_code, source_label)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`${caseId}:${p.field}`, caseId, p.field, p.value, sourceTypeCode, p.sourceLabel],
    ).catch(() => { /* provenance is supplementary */ });
  }
  return result();
}

/* ============================================================
   The InboundEnvelope shape received in resolvePersist.
   Mirrors orchestration/src/functions/activities/fetchMessage.ts InboundEnvelope.
   Exported: the retro reconstruction routes (internal-retro.ts, ADR-0022) receive
   the same envelope shape.
   ============================================================ */
export interface InboundEnvelope {
  messageId: string;
  internetMessageId: string;
  subject: string;
  senderAddress: string;
  receivedAt: string;
  sourceMailbox: string;
  payloadHash: string;
  candidateVrm: string;
  candidateRef: string;
  body?: string;
  bodyPreview?: string;
  /** Graph conversationId (orchestration/src/functions/activities/fetchMessage.ts's
   *  InboundEnvelope carries the same field name) — rules-engine-v2 Phase 2 LOCAL thread
   *  correlation only. Optional: absent on any caller still on the pre-Phase-2 envelope
   *  shape. Persisted SCHEMA-TOLERANTLY by upsertInboundEmail (see schema-introspect.ts) —
   *  a no-op until the 2026-07-02 DDL delta adds inbound_email.conversation_id. */
  conversationId?: string;
  attachments: Array<{ filename: string; contentType: string; blobPath: string; size: number }>;
}

/** Triage classification carried from the orchestration classifyInbound activity (ADR-0015). */
export interface InboundClassificationDto {
  category: string;
  subtype: string;
  confidence: number;
  signals: string[];
  bodyVrm: string;
  bodyCaseref: string;
  /** Provider job/claim reference (email_classifier.py's `_job_reference` pass-through;
   *  orchestration/src/functions/activities/classifyInbound.ts's InboundClassification
   *  carries the same field name). Optional for the same reason as conversationId above.
   *  Persisted SCHEMA-TOLERANTLY (inbound_email.body_jobref, same DDL delta). */
  bodyJobref?: string;
}

/* ============================================================
   1 — GET /api/internal/provider-match-records
   Called by: orchestration providerMatch activity (plan 22 §B §A1).
   Returns: { providers: ProviderMatchRecord[], imageSources: ImageSourceMatchRecord[] }.
   `providers` is the minimum corpus the shared matchProviderByDomain needs
   (id, principalCode, knownEmailDomains, active). `imageSources` (rules-engine-v2
   Phase 3, ADR-0011) is the Image-Source INTERMEDIARY corpus — image_source rows with
   kind=intermediary, joined through imagesource_workprovider to their candidate work
   providers — the minimum @cs/domain's matchSenderIdentity needs. Empty-N:N tolerant:
   an intermediary with no linked providers yet returns candidateProviderIds: []. This
   is an ADDITIVE response-shape change (was a bare array); providerMatch.ts (the sole
   caller) is updated in the same change.
   ============================================================ */
app.http('internalProviderMatchRecords', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/provider-match-records',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const rows = await query<Row>(
        'SELECT id, principal_code, known_email_domains, known_email_addresses, active, provider_automation_mode_code FROM work_provider ORDER BY display_name',
      );
      const providers = rows.map((r) => ({
        workProviderId: r.id as string,
        principalCode: r.principal_code as string,
        knownEmailDomains: parseDomains(r.known_email_domains),
        knownEmailAddresses: parseDomains(r.known_email_addresses),
        active: Boolean(r.active),
        // Lets the orchestrator branch on the matched provider's automation mode
        // (work-todo-spike: automation-mode). Default review_auto (the live default).
        providerAutomationMode:
          automationModeCodec.toName(r.provider_automation_mode_code) ?? 'review_auto',
      }));

      // image_source(kind=intermediary) LEFT JOINed through imagesource_workprovider so an
      // intermediary with zero linked providers still returns a row (candidateProviderIds:
      // []), never silently dropped. kind_code 100000002 = 'intermediary'
      // (000_enums_lookups.sql choice_image_source_kind) — hardcoded here because this
      // route only ever surfaces that one kind (no codec needed for a single literal).
      const imageSourceRows = await query<Row>(
        `SELECT img.id, img.name, img.email_domain,
                COALESCE(array_agg(iw.work_provider_id) FILTER (WHERE iw.work_provider_id IS NOT NULL), '{}') AS candidate_provider_ids
           FROM image_source img
           LEFT JOIN imagesource_workprovider iw ON iw.image_source_id = img.id
          WHERE img.kind_code = 100000002
          GROUP BY img.id, img.name, img.email_domain
          ORDER BY img.name`,
      );
      const imageSources = imageSourceRows.map((r) => ({
        imageSourceId: r.id as string,
        name: r.name as string,
        emailDomain: (r.email_domain as string | null) ?? '',
        kind: 'intermediary',
        candidateProviderIds: (r.candidate_provider_ids as string[] | null) ?? [],
      }));

      return { status: 200, jsonBody: { providers, imageSources } };
    }),
});

function parseDomains(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const s = raw.trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((d) => String(d).trim()).filter(Boolean);
    } catch { /* fall through */ }
  }
  return s.split(/[\r\n,]+/).map((d) => d.trim()).filter(Boolean);
}

/* ============================================================
   1b — GET /api/internal/work-provider/{id}/ai-allowed
   Called by: orchestration triageClassify activity (gated LLM triage second-opinion —
   docs/gated.md D6). Returns the work provider's per-provider AI opt-out flag so the
   activity can skip the model call for a provider that opted out.

   `ai_allowed` is a NULLABLE boolean: null/true = AI allowed, ONLY explicit false opts out
   (the caller enforces that semantics — providerAiOptedOut). SCHEMA-TOLERANT: the column is
   modeled but "deferred in M1" (migration/assets/schema/010_work_provider.sql), so a
   pre-migration DB returns { aiAllowed: null } (allowed) rather than erroring. An unknown id
   also returns null (nothing to opt out of).
   ============================================================ */
app.http('internalWorkProviderAiAllowed', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/work-provider/{id}/ai-allowed',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const workProviderId = req.params.id;
      if (!(await hasColumn('work_provider', 'ai_allowed'))) {
        return { status: 200, jsonBody: { aiAllowed: null } };
      }
      const rows = await query<Row>('SELECT ai_allowed FROM work_provider WHERE id = $1', [
        workProviderId,
      ]);
      const raw = rows[0]?.ai_allowed;
      const aiAllowed = raw == null ? null : Boolean(raw);
      return { status: 200, jsonBody: { aiAllowed } };
    }),
});

/* ============================================================
   2 — GET /api/internal/dedup-context
   Called by: orchestration caseResolve activity (plan 22 §B §A2).
   Returns: { openProviderCases, seenMessageIds, seenPayloadHashes }
   so resolveCase (domain) can run the ADR-0010 ladder client-side.

   Scoped to workProviderId + vrm (VRM may be '' when none sniffed yet;
   omitting VRM filter returns all open cases for the provider).
   seenMessageIds + seenPayloadHashes are also provider-scoped for
   efficiency; the domain re-asserts the cross-provider guard regardless.
   ============================================================ */
app.http('internalDedupContext', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/dedup-context',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const workProviderId = req.query.get('workProviderId') ?? '';
      const vrm = req.query.get('vrm') ?? '';

      // No provider matched (unknown sender, e.g. a non-provider gmail address):
      // there is nothing to dedup on the provider axis, and work_provider_id is a
      // uuid column so binding '' raises `invalid input syntax for type uuid`.
      // Return an empty context — the UNIQUE(source_message_id) insert backstop in
      // cases/resolve still guards a genuine repeat of the same message.
      if (!workProviderId) {
        return {
          status: 200,
          jsonBody: { openProviderCases: [], seenMessageIds: [], seenPayloadHashes: [] },
        };
      }

      // Open same-provider cases (non-terminal) for the provider + VRM.
      // VRM = '' skips the VRM filter so resolveCase sees all provider cases.
      const caseRows = vrm
        ? await query<Row>(
            `SELECT id, case_ref, status_code, work_provider_id
               FROM case_
              WHERE work_provider_id = $1
                AND (vrm = $2 OR vrm IS NULL OR vrm = '')
                AND status_code NOT IN (${TERMINAL_INT_CODES.join(',')})
              ORDER BY created_at`,
            [workProviderId, vrm],
          )
        : await query<Row>(
            `SELECT id, case_ref, status_code, work_provider_id
               FROM case_
              WHERE work_provider_id = $1
                AND status_code NOT IN (${TERMINAL_INT_CODES.join(',')})
              ORDER BY created_at`,
            [workProviderId],
          );

      const openProviderCases = caseRows.map((r) => ({
        caseId: r.id as string,
        caseRef: (r.case_ref as string | null) ?? undefined,
        status: (caseStatusCodec.toName(r.status_code as number) ?? 'error') as CaseStatus,
        workProviderId: (r.work_provider_id as string | null) ?? undefined,
      }));

      // Seen message IDs for rung-1 repeat guard — provider-scoped from
      // case_ (the primary dedup key store).
      const msgRows = await query<Row>(
        `SELECT source_message_id FROM case_
          WHERE work_provider_id = $1 AND source_message_id IS NOT NULL`,
        [workProviderId],
      );
      const seenMessageIds = msgRows.map((r) => r.source_message_id as string);

      // Seen payload hashes — provider-scoped from case_.
      const hashRows = await query<Row>(
        `SELECT payload_hash FROM case_
          WHERE work_provider_id = $1 AND payload_hash IS NOT NULL`,
        [workProviderId],
      );
      const seenPayloadHashes = hashRows.map((r) => r.payload_hash as string);

      return {
        status: 200,
        jsonBody: { openProviderCases, seenMessageIds, seenPayloadHashes },
      };
    }),
});

/** Staff-facing wording for the Held routing note + audit written when a case is created
 *  with no matched work provider (the `newClient` create branch below). */
export interface HeldReason {
  noteName: string;
  noteText: string;
  auditSummary: string;
}

/**
 * Build the Held reason for a no-provider case create (TKT-021 reopen fix, 2026-07-10).
 *
 * Two distinct situations were previously collapsed into one "New client" note:
 *  - TRUE UNKNOWN sender (no corpus match at all) → the existing New-client wording,
 *    kept verbatim.
 *  - KNOWN INTERMEDIARY sender (the provider-match step resolved an Image-Source
 *    intermediary — e.g. a claims manager that routes work for several providers) → must
 *    NOT be branded "New client"; the note names the intermediary and its candidate
 *    providers explicitly ("intermediary — principal unresolved", per the ticket's
 *    acceptance). applyParserFields returns HOW it resolved a provider, so instruction
 *    evidence and the neutral one-provider intermediary fallback cannot be conflated.
 *
 * PURE — display names in, strings out (callers resolve ids → names). All strings are
 * handler-plain: no matchState/FK/corpus vocabulary. Empty-tolerant: a missing
 * intermediary name or an empty candidate list degrades the wording, never throws.
 */
export function buildHeldReason(input: {
  senderDomain: string;
  /** null → true unknown sender (New-client wording). */
  intermediary: {
    /** Intermediary display name (image_source.name); '' tolerated. */
    name: string;
    /** Candidate providers' display names; may be empty (intermediary with no links yet). */
    candidateNames: readonly string[];
    /** Display name of the provider resolved onto the case; resolutionSource says why.
     *  Empty when the name lookup failed or the provider is still unresolved. */
    resolvedProviderName: string;
    resolutionSource: ProviderResolutionSource;
  } | null;
}): HeldReason {
  const { senderDomain: domain, intermediary } = input;
  if (!intermediary) {
    return {
      noteName: 'New client',
      noteText:
        `New client — no work provider matched for sender${domain ? ` @${domain}` : ''}. ` +
        `No Case/PO has been created. Set up the work provider and confirm before EVA.`,
      auditSummary: 'New client routed to Held (no work provider matched)',
    };
  }
  const who = intermediary.name.trim()
    ? `Intermediary sender (${intermediary.name.trim()})`
    : 'Intermediary sender';
  const resolvedName = intermediary.resolvedProviderName.trim();
  if (intermediary.resolutionSource === 'instruction_content') {
    return {
      noteName: 'Held — intermediary sender',
      noteText:
        `${who}: ${
          resolvedName
            ? `the instructions identify ${resolvedName} as the provider`
            : 'the instructions identify the provider'
        }. ` +
        `No Case/PO has been created. Confirm the provider before EVA.`,
      auditSummary: 'Intermediary sender routed to Held (provider found in the instructions)',
    };
  }
  if (intermediary.resolutionSource === 'single_intermediary') {
    return {
      noteName: 'Held — intermediary sender',
      noteText:
        `${who}: This intermediary routes work to one provider` +
        (resolvedName ? `, ${resolvedName},` : ',') +
        ` which has been selected. No Case/PO has been created. Confirm the provider before EVA.`,
      auditSummary: 'Intermediary sender routed to Held (single provider selected)',
    };
  }
  const candidates = intermediary.candidateNames.map((n) => n.trim()).filter(Boolean);
  return {
    noteName: 'Held — intermediary sender',
    noteText:
      `${who}: the instructing provider could not be determined from the instruction.` +
      (candidates.length ? ` Possible providers: ${candidates.join(', ')}.` : '') +
      ` No Case/PO has been created. Pick the provider and confirm before EVA.`,
    auditSummary: 'Intermediary sender routed to Held (provider not yet confirmed)',
  };
}

/* ============================================================
   3 — POST /api/internal/cases/resolve
   Called by: orchestration caseResolve activity (plan 22 §B §A2).

   The ADR-0010 DECISION runs in the activity (shared resolveCase domain
   function). This endpoint owns the PERSIST step: creates a new case_ (for
   create/new_due_to_reference/propose_attach resolutions) or links the
   inbound_email to an existing case (for attach). Also writes the inbound_email
   row for Phase-8 triage provenance in all non-drop paths.

   409 Conflict → UNIQUE(source_message_id) backstop fired (already ingested);
   the data-api client maps 409 to ConflictError → already_ingested return.
   ============================================================ */
app.http('internalCasesResolve', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/resolve',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json()) as {
        inbound: InboundEnvelope;
        providerId?: string;
        matchState?: string;
        /** Parser-confirmed VRM from the instruction PDF — preferred over the email-body
         *  sniff (inbound.candidateVrm) when present; both are postcode/junk-filtered. */
        parserVrm?: string;
        /** Parser-extracted instruction fields, persisted FILL-IF-EMPTY (cross-cutting
         *  parser-field persistence). Absent → no-op (backward-compatible). */
        parserRef?: string;
        parserMileage?: string;
        parserMileageUnit?: 'Miles' | 'Km' | '';
        /** Parser-owned EVA fields (claimant, dates, vehicle, circumstances, VAT) — persisted
         *  fill-if-empty + constraint-guarded. Absent → no-op (backward-compatible). */
        parserEva?: ParserEvaFields;
        /** rules-engine-v2 Phase 3 (ADR-0011) — set when the SENDER matched an Image-Source
         *  intermediary (orchestration providerMatch activity) rather than a direct work
         *  provider. Forwarded to applyParserFields so a content-detected provider found
         *  among the intermediary's N:N candidates is recorded as CORROBORATED, not a bare
         *  guess. Absent when the sender matched a direct provider or nothing at all
         *  (backward-compatible no-op). */
        intermediaryImageSourceId?: string;
        intermediaryCandidateProviderIds?: string[];
        /** ADR-0021 — the orchestrator's intake case-type decision (decideCaseType over the
         *  parser case_type envelope + classifier subtype). APPLIED (case_type_code + marker
         *  mint) only behind AUDIT_CASES_ENABLED; with the gate off, fired signals are
         *  recorded as an observe-only audit_event (shadow rollout). Absent → standard
         *  (backward-compatible no-op). */
        caseType?: string;
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
      };

      const { inbound, providerId, decision } = body;
      const workProviderId = providerId ?? null;
      const intermediary = body.intermediaryImageSourceId
        ? {
            imageSourceId: body.intermediaryImageSourceId,
            candidateProviderIds: body.intermediaryCandidateProviderIds ?? [],
          }
        : null;
      // #7 — prefer the parser-extracted PDF VRM over the email-body sniff. Both have
      // already run through the canonical postcode/junk filter (extractVrm / Python sniff).
      // TKT-073: an over-length "VRM" is a junk sniff, not data — drop it (same as no VRM)
      // instead of failing the case_ INSERT with pg 22001 (the live 2026-07-02/03 outages).
      const vrmGuard = vrmOrEmpty(body.parserVrm || inbound.candidateVrm);
      if (vrmGuard.dropped) {
        ctx.warn(
          `[cases/resolve] over-length VRM candidate dropped (junk sniff > varchar(16)) for ${inbound.internetMessageId}`,
        );
      }
      const vrm = vrmGuard.value;

      // The matched provider's automation mode — the SEAM the orchestration worker reads to
      // branch intake (work-todo-spike: automation-mode). No provider (new/unknown client) =>
      // 'manual' (the safest default: do not auto-proceed). A matched provider with an
      // unreadable mode defaults to 'review_auto' (the live default).
      let providerAutomationMode: 'manual' | 'review_auto' | 'full_auto' = 'manual';
      if (workProviderId) {
        const wpMode = await query<Row>(
          'SELECT provider_automation_mode_code FROM work_provider WHERE id = $1',
          [workProviderId],
        );
        providerAutomationMode =
          automationModeCodec.toName(wpMode[0]?.provider_automation_mode_code) ?? 'review_auto';
      }

      // Attach: link inbound_email to the existing target case; no new case_.
      if (decision.resolution === 'attach' && decision.targetCaseId) {
        await upsertInboundEmail(inbound, workProviderId, decision.targetCaseId, undefined, body.parserVrm);
        // Fill-if-empty parser fields onto the EXISTING case (it may lack a ref/mileage the
        // parser found on this email); never clobbers a value already there.
        await applyParserFields(
          decision.targetCaseId,
          body.parserRef,
          body.parserMileage,
          body.parserMileageUnit,
          body.parserEva,
          workProviderId,
          intermediary,
        );
        await writeAudit({
          action: AUDIT_ACTION.case_attached,
          caseId: decision.targetCaseId,
          summary: `Email ${inbound.internetMessageId} attached to existing case`,
          after: { messageId: inbound.internetMessageId, resolution: 'attach' },
        });
        // TKT-023 — an arriving attachment satisfies any outstanding chaser on the case.
        await markOutstandingChasersResponded(decision.targetCaseId, 'dedup attach');
        return {
          status: 200,
          jsonBody: { outcome: 'attached', caseId: decision.targetCaseId, providerAutomationMode },
        };
      }

      // TKT-119 belt-and-braces: an acknowledgement / query / non_actionable (or any other
      // non-minting-category) email may NEVER create a case from THIS seam either — the
      // orchestration categoryMintsCase guard (TKT-081) is re-asserted here against the
      // message's OWN triage row, so no future caller/path can mint from an ack.
      const blockedCategory = await mintBlockedByCategory(inbound.internetMessageId);
      if (blockedCategory) {
        await writeAudit({
          action: AUDIT_ACTION.inbound_routed,
          severity: 'warning',
          summary: `Create refused — '${blockedCategory}' emails never open a case (kept in the inbox for review)`,
          after: { messageId: inbound.internetMessageId, category: blockedCategory, seam: 'cases/resolve' },
        });
        ctx.log(JSON.stringify({ evt: 'caseResolvePersist', outcome: 'refused_category', category: blockedCategory }));
        return { status: 200, jsonBody: { outcome: 'refused_category', category: blockedCategory } };
      }

      // Create: new case_ for create / new_due_to_reference / propose_attach.
      // The UNIQUE(source_message_id) constraint backstops concurrent/replayed
      // intake — a duplicate will throw PG error 23505, which the catch below
      // returns as 409 (→ ConflictError → already_ingested in the client).
      const rawStatus = decision.statusEffect as CaseStatus;
      const statusCode = caseStatusCodec.toInt(rawStatus) ?? statusToInt('new_email');
      // TKT-073: case_.case_ref is varchar(100) — clamp (with a warn trace) instead of
      // failing the INSERT with pg 22001 (the live 2026-06-30/07-01 outages).
      const caseRefGuard = clampVarchar(inbound.candidateRef, 100);
      if (caseRefGuard.clamped) {
        ctx.warn(
          `[cases/resolve] candidateRef clamped to 100 chars (was ${caseRefGuard.originalLength}) for ${inbound.internetMessageId}`,
        );
      }
      const caseRef = caseRefGuard.value;
      const subject = (inbound.subject ?? '').trim();
      const name = ([vrm || null, subject || null].filter(Boolean).join(' · ') || 'Email intake').slice(0, 100);
      const emailKindCode = intakeChannelKindCodec.toInt('email') ?? null;

      // Case-type decision (ADR-0021). Validate the wire value against the codec's names so
      // a malformed/unknown string degrades to 'standard' rather than breaking the INSERT.
      const caseType: CaseWorkType = caseTypeCodec.toInt(body.caseType as CaseWorkType) != null
        ? (body.caseType as CaseWorkType)
        : 'standard';
      const caseTypeDual = body.caseTypeDual === true;
      const caseTypeSignals = Array.isArray(body.caseTypeSignals) ? body.caseTypeSignals : [];
      const auditGateOn = gates.auditCases();

      // The create + (for a known provider) the Case/PO mint run in ONE transaction so the
      // advisory lock that serialises the per-(marker,principal,year) sequence spans both the
      // MAX+1 probe and the INSERT — no duplicate POs under concurrency (#11). A new client
      // with no matched provider mints NO PO and is routed to Held for operator setup.
      let created: {
        caseId: string;
        casePo: string | null;
        newClient: boolean;
        principalCode: string;
        mintedMarker: '' | 'A.' | 'AP.' | 'D.';
      };
      try {
        created = await tx(async (q) => {
          // rules-engine-v2 Phase 2 (ADR-0019 "mint race"): serialise this mint against a
          // concurrent /api/internal/triage/context read or /api/internal/inbound/link-reply
          // for the SAME ref/VRM — same key derivation as those two call sites
          // (api/src/lib/triage-locks.ts), so a reader that starts after this transaction
          // commits (or rolls back) always sees its result. No job-ref is available on this
          // payload (cases/resolve carries candidateRef/candidateVrm only), so only the
          // ref/vrm locks are taken here.
          await acquireTriageLocks(q, { caseref: caseRef, vrm });

          // Resolve the provider's principal code (the PO prefix + the known/new-client test).
          let principalCode = '';
          if (workProviderId) {
            const wp = await q<Row>('SELECT principal_code FROM work_provider WHERE id = $1', [workProviderId]);
            principalCode = String(wp[0]?.principal_code ?? '').trim();
          }
          const newClient = !workProviderId || !principalCode;

          // Known provider → mint Case/PO = [marker] + principal + YY + 3-digit sequence.
          // Shared advisory-locked mint (api/src/lib/case-po.ts) — identical logic to the
          // manual-intake and provider-API paths; the lock lives on this transaction's `q`.
          // The MARKER (ADR-0021) applies only when AUDIT_CASES_ENABLED: a STANDALONE
          // audit for an allowlisted principal mints from the marker's own sequence
          // (A.PCH26001…); a DUAL report+audit letter (QDOS) keeps the standard sequence
          // (its audit ID is derived at review); everything else mints exactly as today.
          const mintedMarker = auditGateOn && !newClient
            ? markerForMint(caseType, principalCode, caseTypeDual)
            : '';
          let casePo: string | null = null;
          if (!newClient) {
            casePo = await mintCasePo(q, principalCode, undefined, mintedMarker);
          }

          const cols = [
            'name', 'vrm', 'status_code',
            'intake_channel_kind_code', 'intake_channel_manual', 'source_mailbox',
            'source_message_id', 'payload_hash', 'work_provider_id',
          ];
          const vals: unknown[] = [
            name, vrm || null, statusCode,
            emailKindCode, false, inbound.sourceMailbox ?? null,
            inbound.internetMessageId ?? null,
            inbound.payloadHash ?? null,
            workProviderId,
          ];
          if (caseRef) { cols.push('case_ref'); vals.push(caseRef); }
          // TKT-128 (follow-up): the subject-sniffed reference also seeds the "Imported
          // details" overview fact, so a subject-only ref (no parsable document) still
          // populates the panel's Claim no. — fill-at-create; applyParserFields keeps its
          // own fill-if-empty for the parser's ref.
          if (caseRef) { cols.push('ov_claim_number'); vals.push(caseRef.slice(0, 100)); }
          if (casePo) { cols.push('case_po'); vals.push(casePo); }
          // case_type_code (ADR-0014/ADR-0021) — written only behind the gate (the live
          // choice_case_type rows for the new types land via the operator's DDL delta;
          // writing earlier would risk an FK violation). standard stays NULL (=standard).
          if (auditGateOn && caseType !== 'standard') {
            cols.push('case_type_code');
            vals.push(caseTypeCodec.toInt(caseType) ?? null);
          }
          // New client → Held: park on the operator safety net with a structured reason
          // (ADR-0010; never silent). on_hold routes to the Held queue; needs_review is the
          // actionReason the SPA surfaces; a note (written after commit) carries the specifics.
          if (newClient) {
            cols.push('on_hold'); vals.push(true);
            cols.push('action_reason_code'); vals.push(actionReasonCodec.toInt('needs_review') ?? null);
          }

          const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
          const rows = await q<Row>(
            `INSERT INTO case_ (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
            vals,
          );
          const caseId = rows[0]?.id as string;
          if (!caseId) throw new Error('case insert returned no id');
          return { caseId, casePo, newClient, principalCode, mintedMarker };
        });
      } catch (e: unknown) {
        if (isUniqueViolation(e)) {
          const constraint = uniqueConstraintName(e);
          // case_po collision is near-impossible (advisory lock serialises auto-mints); a
          // source_message_id collision is the expected replay backstop → already_ingested.
          if (constraint === 'uq_case_case_po') {
            ctx.error(`[cases/resolve] case_po unique collision (${constraint})`);
            return { status: 500, jsonBody: { error: 'case_po_collision' } };
          }
          return { status: 409, jsonBody: { error: 'conflict', detail: 'source_message_id already exists' } };
        }
        throw e;
      }

      const newCaseId = created.caseId;
      // Stamp the triage row + upgrade its body_vrm to the best VRM (fixes the "reg on the
      // inbox but blank on the case" split for parser-derived marks).
      await upsertInboundEmail(inbound, workProviderId, newCaseId, undefined, body.parserVrm);
      // Fill-if-empty parser fields onto the new case (case_ref takes the inbound candidateRef
      // first, so parserRef only fills when that was blank; mileage gets provenance).
      const parserFieldsResult = await applyParserFields(
        newCaseId,
        body.parserRef,
        body.parserMileage,
        body.parserMileageUnit,
        body.parserEva,
        workProviderId,
        intermediary,
      );

      const auditAction =
        AUDIT_ACTION[decision.auditAction as keyof typeof AUDIT_ACTION] ??
        AUDIT_ACTION.case_created;
      await writeAudit({
        action: auditAction,
        caseId: newCaseId,
        summary: `Case ${decision.resolution}: ${name}`,
        after: { resolution: decision.resolution, status: rawStatus, vrm, casePo: created.casePo },
      });

      // Case-type decision trail (ADR-0021 — every decision is Action-Logged, ADR-0014).
      // Three shapes: (a) gate ON + applied → info record of what was set/minted;
      // (b) gate OFF but signals fired → OBSERVE-ONLY record (the shadow-rollout evidence
      // the operator reviews before flipping AUDIT_CASES_ENABLED); (c) gate ON but the
      // provider is not allowlisted for the detected type → warning + best-effort review
      // note (mint stayed standard by design — PCH/QDOS-only for now).
      if (caseType !== 'standard') {
        const allowlisted = allowedCaseTypes(created.principalCode).includes(caseType);
        if (!auditGateOn) {
          await writeAudit({
            action: AUDIT_ACTION.case_created,
            caseId: newCaseId,
            summary: `Case-type '${caseType}' detected (observe-only — AUDIT_CASES_ENABLED off; minted standard)`,
            after: { caseType, dual: caseTypeDual, signals: caseTypeSignals, applied: false },
          });
        } else if (!allowlisted && !created.newClient) {
          await writeAudit({
            action: AUDIT_ACTION.case_created,
            caseId: newCaseId,
            severity: 'warning',
            summary: `Case-type '${caseType}' detected for non-allowlisted provider ${created.principalCode} — minted standard; review case type`,
            after: { caseType, dual: caseTypeDual, signals: caseTypeSignals, applied: false },
          });
          await query(
            `INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())`,
            [
              'Case-type review',
              newCaseId,
              'Email intake (auto)',
              `${caseType === 'diminution' ? 'Diminution' : 'Audit'} signals detected (${caseTypeSignals.join('; ') || 'see audit log'}) ` +
                `but ${created.principalCode || 'this provider'} is not in the case-type marker allowlist — ` +
                `case minted as standard. Confirm the case type.`,
            ],
          ).catch(() => { /* note is supplementary */ });
        } else {
          await writeAudit({
            action: AUDIT_ACTION.case_created,
            caseId: newCaseId,
            summary:
              `Case-type '${caseType}' applied` +
              (created.mintedMarker
                ? ` — minted ${created.casePo} from the ${created.mintedMarker} sequence`
                : caseTypeDual
                  ? ` — dual report+audit letter, standard number kept (audit ID derived at review)`
                  : ''),
            after: {
              caseType,
              dual: caseTypeDual,
              signals: caseTypeSignals,
              applied: true,
              marker: created.mintedMarker,
              casePo: created.casePo,
            },
          });
        }
      }

      if (created.newClient) {
        const domain = senderDomain(inbound.senderAddress ?? '');
        // TKT-021 reopen fix: a sender the provider-match step identified as a KNOWN
        // INTERMEDIARY must not be branded "New client" — its Held reason names the
        // intermediary + candidates explicitly (buildHeldReason above). The wire payload
        // carries ids only, so the display names are looked up here; best-effort — a
        // lookup failure degrades to name-less wording and must not block intake.
        let heldIntermediary: {
          name: string;
          candidateNames: string[];
          resolvedProviderName: string;
          resolutionSource: ProviderResolutionSource;
        } | null = null;
        if (intermediary) {
          heldIntermediary = {
            name: '',
            candidateNames: [],
            resolvedProviderName: '',
            resolutionSource: parserFieldsResult.providerResolutionSource,
          };
          try {
            const src = await query<Row>(
              'SELECT name FROM image_source WHERE id = $1',
              [intermediary.imageSourceId],
            );
            heldIntermediary.name = String(src[0]?.name ?? '').trim();
            if (intermediary.candidateProviderIds.length > 0) {
              const wps = await query<Row>(
                'SELECT display_name FROM work_provider WHERE id = ANY($1::uuid[]) ORDER BY display_name',
                [intermediary.candidateProviderIds],
              );
              heldIntermediary.candidateNames = wps
                .map((r) => String(r.display_name ?? '').trim())
                .filter(Boolean);
            }
            if (parserFieldsResult.resolvedProviderId) {
              const resolved = await query<Row>(
                'SELECT display_name FROM work_provider WHERE id = $1',
                [parserFieldsResult.resolvedProviderId],
              );
              heldIntermediary.resolvedProviderName = String(
                resolved[0]?.display_name ?? '',
              ).trim();
            }
          } catch { /* names are cosmetic — the Held note still lands without them */ }
        }
        const reason = buildHeldReason({ senderDomain: domain, intermediary: heldIntermediary });
        // Best-effort note (human-readable Held reason) — must not block intake.
        await query(
          `INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())`,
          [reason.noteName, newCaseId, 'Email intake (auto)', reason.noteText],
        ).catch(() => { /* note is supplementary */ });
        await writeAudit({
          action: AUDIT_ACTION.inbound_routed,
          caseId: newCaseId,
          severity: 'warning',
          summary: reason.auditSummary,
          after: intermediary
            ? {
                intermediary: true,
                onHold: true,
                senderDomain: domain,
                imageSourceId: intermediary.imageSourceId,
                candidateProviderIds: intermediary.candidateProviderIds,
                ...(heldIntermediary?.resolvedProviderName
                  ? { resolvedProvider: heldIntermediary.resolvedProviderName }
                  : {}),
                providerResolutionSource:
                  heldIntermediary?.resolutionSource ?? 'none',
              }
            : { newClient: true, onHold: true, senderDomain: domain },
        });
      }

      return {
        status: 200,
        jsonBody: { outcome: 'created', caseId: newCaseId, casePo: created.casePo, providerAutomationMode },
      };
    }),
});

/* ============================================================
   3b — POST /api/internal/inbound-email
   Called by: orchestration classifyInbound activity (ADR-0015). Records the
   classified triage row for EVERY email (one per arrival) with NO case yet —
   query/other stop here; receiving_work has caseResolve stamp case_id onto the
   SAME row afterwards (idempotent COALESCE upsert on source_message_id).
   ============================================================ */
app.http('internalInboundEmail', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/inbound-email',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json()) as {
        inbound: InboundEnvelope;
        providerId?: string;
        classification: InboundClassificationDto;
      };
      const inboundEmailId = await upsertInboundEmail(
        body.inbound,
        body.providerId ?? null,
        null,
        body.classification,
      );
      return { status: 200, jsonBody: { inboundEmailId } };
    }),
});

/**
 * Upsert the inbound_email triage row (one per arrival; ADR-0015). When `classification`
 * is provided the triage columns (category/subtype/confidence/signals/body_*) are written.
 * The COALESCE upsert makes the two writers order-robust: a later case_id-only stamp
 * (caseResolve) preserves an earlier classification, and a later classification preserves
 * an earlier case_id. Returns the row id, or null on a (swallowed) failure.
 *
 * rules-engine-v2 Phase 2 SCHEMA TOLERANCE: `body_jobref` (from `classification.bodyJobref`)
 * and `conversation_id` (from `inbound.conversationId`) exist only once the 2026-07-02 DDL
 * delta lands live. Orchestration sends both regardless of migration state, so this probes
 * which of the two columns actually exist (api/src/lib/schema-introspect.ts, cached — one
 * real query per Function-App cold start) and appends ONLY the present ones to the base
 * (always-present-column) INSERT/ON CONFLICT below — never a failed statement.
 */
export async function upsertInboundEmail(
  inbound: InboundEnvelope,
  workProviderId: string | null,
  caseId: string | null,
  classification?: InboundClassificationDto,
  parserVrm?: string,
  /** When set (e.g. 'routed' for a linked reply), stamps triage_state on INSERT and ON
   *  CONFLICT; when omitted, INSERT defaults to 'new' and an existing state is preserved. */
  triageState?: string,
): Promise<string | null> {
  const subject = (inbound.subject ?? '').trim();
  // TKT-073: this helper's own varchar columns, clamped so a long value degrades instead
  // of silently losing the whole triage row (the catch below swallows DB errors).
  const name = clampVarchar(`Email: ${subject || inbound.internetMessageId}`, 200).value;
  const categoryCode = classification
    ? INBOUND_CATEGORY_TO_INT[classification.category as InboundCategory] ?? null
    : null;
  const subtypeCode = classification
    ? INBOUND_SUBTYPE_TO_INT[classification.subtype as InboundSubtype] ?? null
    : null;
  // Prefer the parser-confirmed PDF VRM for the inbox triage row too (so it shows the same
  // mark the case persists), then the classifier body sniff, then the email-subject sniff.
  // body_vrm is varchar(16): an over-length sniff is junk — dropped, never truncated.
  const bodyVrm = vrmOrEmpty(parserVrm || classification?.bodyVrm || inbound.candidateVrm).value || null;
  const bodyCaseref =
    clampVarchar(classification?.bodyCaseref || inbound.candidateRef || '', 32).value || null;
  const bodyPreview = (inbound.bodyPreview ?? '') || null;
  const confidence = classification ? classification.confidence : null;
  const signals = classification ? JSON.stringify(classification.signals ?? []) : null;
  const bodyJobref = clampVarchar(classification?.bodyJobref, 64).value || null;
  const conversationId = (inbound.conversationId ?? '').trim() || null;
  try {
    // Base statement occupies $1..$18 below (unchanged from before Phase 2) — optional
    // columns, if present live, are appended starting at $19.
    const presentCols = await tableColumns('inbound_email');
    const optional = planOptionalColumns(
      'inbound_email',
      [
        { column: 'body_jobref', value: bodyJobref },
        { column: 'conversation_id', value: conversationId },
      ],
      presentCols,
      19,
    );
    const optionalColsFragment = optional.cols.length ? `, ${optional.cols.join(', ')}` : '';
    const optionalValsFragment = optional.placeholders.length
      ? `, ${optional.placeholders.join(', ')}`
      : '';
    const optionalUpdateFragment = optional.updateSets.length
      ? `${optional.updateSets.join(',\n         ')},\n         `
      : '';

    const rows = await query<{ id: string }>(
      `INSERT INTO inbound_email
         (name, source_message_id, subject, from_address, sender_domain,
          source_mailbox, received_on, has_attachments, category_code, subtype_code,
          confidence, classifier_mode, signals, triage_state, body_vrm, body_caseref,
          body_preview, case_id, work_provider_id${optionalColsFragment})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'deterministic',$12,COALESCE($18, 'new'),$13,$14,$15,$16,$17${optionalValsFragment})
       ON CONFLICT (source_message_id) DO UPDATE SET
         case_id          = COALESCE(EXCLUDED.case_id, inbound_email.case_id),
         category_code    = CASE
                              WHEN inbound_email.classifier_mode = 'human'
                                THEN inbound_email.category_code
                              ELSE COALESCE(EXCLUDED.category_code, inbound_email.category_code)
                            END,
         subtype_code     = CASE
                              WHEN inbound_email.classifier_mode = 'human'
                                THEN inbound_email.subtype_code
                              ELSE COALESCE(EXCLUDED.subtype_code, inbound_email.subtype_code)
                            END,
         confidence       = CASE
                              WHEN inbound_email.classifier_mode = 'human'
                                THEN inbound_email.confidence
                              ELSE COALESCE(EXCLUDED.confidence, inbound_email.confidence)
                            END,
         signals          = CASE
                              WHEN inbound_email.classifier_mode = 'human'
                                THEN inbound_email.signals
                              ELSE COALESCE(EXCLUDED.signals, inbound_email.signals)
                            END,
         body_vrm         = COALESCE(EXCLUDED.body_vrm, inbound_email.body_vrm),
         body_caseref     = COALESCE(EXCLUDED.body_caseref, inbound_email.body_caseref),
         body_preview     = COALESCE(EXCLUDED.body_preview, inbound_email.body_preview),
         work_provider_id = COALESCE(EXCLUDED.work_provider_id, inbound_email.work_provider_id),
         ${optionalUpdateFragment}triage_state     = CASE
                              WHEN inbound_email.triage_state IN ('actioned','dismissed')
                                THEN inbound_email.triage_state
                              ELSE COALESCE($18, inbound_email.triage_state)
                            END,
         updated_at       = now()
       RETURNING id`,
      [
        name,
        inbound.internetMessageId ?? null,
        subject || null,
        inbound.senderAddress ?? null,
        senderDomain(inbound.senderAddress ?? ''),
        inbound.sourceMailbox ?? null,
        inbound.receivedAt ?? null,
        (inbound.attachments?.length ?? 0) > 0,
        categoryCode,
        subtypeCode,
        confidence,
        signals,
        bodyVrm,
        bodyCaseref,
        bodyPreview,
        caseId,
        workProviderId,
        triageState ?? null,
        ...optional.values,
      ],
    );
    const inboundEmailId = rows[0]?.id ?? null;
    // Stamp the classifier SUGGESTION distinctly (fill-if-null) so a later staff override is
    // visible (work-todo-spike: suggested-tags). Guarded: the suggested_* columns may be
    // absent on a not-yet-migrated DB — a failure here must not block intake.
    if (inboundEmailId && classification && (categoryCode != null || subtypeCode != null)) {
      await query(
        `UPDATE inbound_email
            SET suggested_category_code = COALESCE(suggested_category_code, $2),
                suggested_subtype_code  = COALESCE(suggested_subtype_code, $3)
          WHERE id = $1`,
        [inboundEmailId, categoryCode, subtypeCode],
      ).catch(() => { /* suggested_* columns absent pre-migration — best-effort */ });
    }
    return inboundEmailId;
  } catch {
    // inbound_email is triage provenance; failure must not block primary intake.
    return null;
  }
}

/** True when the error is a PostgreSQL UNIQUE violation (code 23505). */
export function isUniqueViolation(e: unknown): boolean {
  return (
    e != null &&
    typeof e === 'object' &&
    'code' in e &&
    (e as { code: unknown }).code === '23505'
  );
}

/** The name of the violated UNIQUE constraint on a 23505 (pg `error.constraint`), if present. */
function uniqueConstraintName(e: unknown): string | undefined {
  if (e != null && typeof e === 'object' && 'constraint' in e) {
    const c = (e as { constraint: unknown }).constraint;
    return typeof c === 'string' ? c : undefined;
  }
  return undefined;
}

/* ============================================================
   POST /api/internal/cases/{id}/enrichment
   Called by: orchestration enrich activity (#1) AFTER a 200 from the enrichment
   Function (DVSA MOT + DVLA fallback). Persists the ADVISORY result onto the case's
   EVA columns — FILL-IF-EMPTY only (never clobbers a staff/parser value; enrichment
   is advisory per ADR-0006). There is no separate `make` column: make+model fold into
   the single EVA field #2 (eva_vehicle_model). Mileage + unit move as a pair (the MOT
   estimate is normalised to Miles). Returns { applied: [...] } — the fields it filled.
   ============================================================ */
app.http('internalCasesEnrichment', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/enrichment',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      const body = (await req.json()) as {
        vehicle_model?: string;
        make?: string;
        current_mileage?: number | string;
        mileage_unit?: string;
        warnings?: string[];
      };

      const cur = await query<Row>(
        'SELECT eva_vehicle_model, eva_mileage, eva_mileage_unit FROM case_ WHERE id = $1',
        [caseId],
      );
      if (!cur[0]) return { status: 404, jsonBody: { error: 'case not found' } };

      const vehicleModel = combineMakeModel(
        String(body.make ?? '').trim(),
        String(body.vehicle_model ?? '').trim(),
      );
      const mileage = body.current_mileage != null ? String(body.current_mileage).replace(/[^\d]/g, '') : '';
      const mileageUnitRaw = String(body.mileage_unit ?? '').trim();
      const mileageUnit = mileageUnitRaw === 'Miles' || mileageUnitRaw === 'Km' ? mileageUnitRaw : '';

      const applied: string[] = [];
      const sets: string[] = [];
      const vals: unknown[] = [];
      const isEmpty = (v: unknown): boolean => !String(v ?? '').trim();

      if (vehicleModel && isEmpty(cur[0].eva_vehicle_model)) {
        sets.push(`eva_vehicle_model = $${sets.length + 1}`);
        vals.push(vehicleModel.slice(0, 200));
        applied.push('vehicleModel');
      }
      // Mileage + unit are a pair: only fill when the case has no mileage yet (the parsed
      // document is authoritative — the Function already skips the estimate when the doc had it).
      if (mileage && isEmpty(cur[0].eva_mileage)) {
        sets.push(`eva_mileage = $${sets.length + 1}`);
        vals.push(mileage.slice(0, 20));
        applied.push('mileage');
        if (mileageUnit) {
          sets.push(`eva_mileage_unit = $${sets.length + 1}`);
          vals.push(mileageUnit);
          applied.push('mileageUnit');
        }
      }

      if (sets.length > 0) {
        vals.push(caseId);
        await query(
          `UPDATE case_ SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`,
          vals,
        );
        // The orchestrator runs statusEvaluate BEFORE enrich, so a readiness-required field
        // filled here (e.g. mileage/model) would otherwise leave the status stale (e.g. stuck
        // in needs_review though now ready). Recompute now that the new fields are persisted —
        // ONLY when fields were actually applied; recomputeStatus persists only on a change (#680).
        await recomputeStatus(caseId);
      }

      await writeAudit({
        action: AUDIT_ACTION.enrichment_called,
        caseId,
        summary: `Enrichment persisted: ${applied.length ? applied.join(', ') : 'no new fields'}`,
        after: { applied, warnings: body.warnings ?? [] },
      });
      ctx.log(JSON.stringify({ evt: 'internalCasesEnrichment', caseId, applied }));

      return { status: 200, jsonBody: { applied } };
    }),
});

/* ============================================================
   POST /api/internal/inbound/link-reply
   Called by: orchestration linkReply activity (#3). When the classifier flagged an
   inbound as a REPLY about existing work (is_reply, typically query_existing_work), this
   resolves it against OPEN (non-terminal) cases — Case-ref (provider ref / case_po) FIRST,
   then VRM — and links the triage row to the one matching case rather than minting a new
   one. ADR-0010: >1 candidate (or ambiguous) → NEVER auto-link; the triage row is left
   unrouted + duplicate_flagged for a human (the reply's "Held" — there is no new case).
   Returns { outcome: 'linked' | 'ambiguous' | 'no_match', caseId?, candidateCount }.
   ============================================================ */
app.http('internalInboundLinkReply', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/inbound/link-reply',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json()) as {
        inbound: InboundEnvelope;
        providerId?: string;
        ref?: string;
        vrm?: string;
        /** Provider job/claim reference — NOT a match key (the looser job-ref only drives
         *  the suggest-first ref-gate), but since TKT-101 it IS a VETO: a VRM-only hit
         *  whose case is known under a DIFFERENT reference must not auto-link. */
        jobref?: string;
      };
      const { inbound } = body;
      const workProviderId = body.providerId ?? null;
      const ref = (body.ref ?? '').trim();
      const vrm = (body.vrm ?? '').trim();
      const jobref = (body.jobref ?? '').trim();

      // Resolve candidate OPEN cases — Case-ref first (case_ref OR case_po), then VRM.
      // Cross-provider is allowed here ON PURPOSE: a reply can arrive from the claimant/
      // repairer on a different domain than the instructing provider, so we match on the
      // case identifiers, not the sender's provider.
      //
      // rules-engine-v2 Phase 2 (ADR-0019 "mint race"): the read runs inside a tx() that
      // takes the SAME advisory locks (api/src/lib/triage-locks.ts) internalCasesResolve's
      // mint transaction and /api/internal/triage/context now also take, keyed on this same
      // ref/vrm — so a concurrent mint for the SAME reference commits (or rolls back) before
      // this candidate read runs, instead of racing it. The payload's optional job-ref is
      // deliberately NOT a match key here: this lane AUTO-attaches on an unambiguous hit,
      // and the looser job-ref only ever drives the suggest-first ref-gate (triage/context).
      const { candidates, refConflict } = await tx(async (q) => {
        await acquireTriageLocks(q, { caseref: ref, vrm });

        let rows: Row[] = [];
        let vrmArm = false;
        if (ref) {
          rows = await q<Row>(
            `SELECT id, case_ref, case_po, vrm FROM case_
              WHERE (upper(case_ref) = upper($1) OR upper(case_po) = upper($1))
                AND status_code NOT IN (${TERMINAL_INT_CODES.join(',')})
              ORDER BY created_at`,
            [ref],
          );
        }
        if (rows.length === 0 && vrm) {
          vrmArm = true;
          rows = await q<Row>(
            `SELECT id, case_ref, case_po, vrm FROM case_
              WHERE vrm = $1
                AND status_code NOT IN (${TERMINAL_INT_CODES.join(',')})
              ORDER BY created_at`,
            [vrm],
          );
        }

        // TKT-101 — a VRM-only single hit is VETOED when the email cites a job/claim
        // reference the candidate case is not known under (its case_ref/case_po or the
        // job-refs of its already-linked emails). The QDOS 46533/1-vs-46671/1 wrong-link:
        // two different matters shared a junk VRM; refs differed → must never auto-link
        // (ADR-0010 rung-3 semantics applied to the link seam). Held for a human instead.
        let conflict = false;
        if (vrmArm && rows.length === 1 && (jobref || ref)) {
          const hit = rows[0];
          const sibs = await q<Row>(
            `SELECT DISTINCT body_jobref FROM inbound_email
              WHERE case_id = $1 AND body_jobref IS NOT NULL AND body_jobref <> ''`,
            [hit.id],
          );
          const known = [
            hit.case_ref as string | null,
            hit.case_po as string | null,
            ...sibs.map((s) => s.body_jobref as string | null),
          ];
          // Veto if EITHER the loose job-ref OR the strict cited reference contradicts the
          // candidate's known refs. Previously only `jobref` was checked, so a reply citing
          // a Case/PO-shaped `ref` (but no loose jobref) could still auto-link to a DIFFERENT
          // case that merely shares the VRM. (TKT-101 / PR50-D4)
          conflict = vrmLinkRefConflict(jobref, known) || vrmLinkRefConflict(ref, known);
        }
        return { candidates: conflict ? [] : rows, refConflict: conflict };
      });

      if (refConflict) {
        // Record the row unlinked (triage keeps it) + flag the collision for a human.
        await upsertInboundEmail(inbound, workProviderId, null);
        await writeAudit({
          action: AUDIT_ACTION.duplicate_flagged,
          severity: 'warning',
          summary: `Reply matched a case by registration only (vrm ${vrm}) but cites a different reference (${jobref || ref}); held for manual linking`,
          after: { vrm, jobref: jobref || ref, messageId: inbound.internetMessageId },
        });
        ctx.log(JSON.stringify({ evt: 'linkReply', outcome: 'no_match', reason: 'vrm_ref_conflict', jobref }));
        return { status: 200, jsonBody: { outcome: 'no_match', candidateCount: 0 } };
      }

      // Stamp the triage row with the matched case only on an UNAMBIGUOUS single hit, and mark
      // it 'routed' so a successfully-linked reply no longer counts as untriaged in
      // /api/inbound/counts (#753). Ambiguous / no-match leave it defaulting to 'new'.
      const linkCaseId = candidates.length === 1 ? (candidates[0].id as string) : null;
      await upsertInboundEmail(
        inbound,
        workProviderId,
        linkCaseId,
        undefined,
        undefined,
        linkCaseId ? 'routed' : undefined,
      );

      if (linkCaseId) {
        await writeAudit({
          action: AUDIT_ACTION.inbound_routed,
          caseId: linkCaseId,
          summary: `Reply linked to existing case (${ref ? `ref ${ref}` : `vrm ${vrm}`})`,
          after: { matchedBy: ref ? 'caseref' : 'vrm', messageId: inbound.internetMessageId },
        });
        // TKT-023 — a linked reply satisfies any outstanding chaser on the case.
        await markOutstandingChasersResponded(linkCaseId, 'reply linked');
        ctx.log(JSON.stringify({ evt: 'linkReply', outcome: 'linked', caseId: linkCaseId }));
        return { status: 200, jsonBody: { outcome: 'linked', caseId: linkCaseId, candidateCount: 1 } };
      }

      if (candidates.length > 1) {
        // ADR-0010: never auto-link an ambiguous reply. Flag for a human; the triage row
        // stays unrouted (its own "Held"). No new case is minted for a reply.
        await writeAudit({
          action: AUDIT_ACTION.duplicate_flagged,
          severity: 'warning',
          summary: `Reply matched ${candidates.length} open cases (${ref ? `ref ${ref}` : `vrm ${vrm}`}); held for manual linking`,
          after: { candidateCount: candidates.length, candidateIds: candidates.map((c) => c.id) },
        });
        ctx.log(JSON.stringify({ evt: 'linkReply', outcome: 'ambiguous', count: candidates.length }));
        return { status: 200, jsonBody: { outcome: 'ambiguous', candidateCount: candidates.length } };
      }

      ctx.log(JSON.stringify({ evt: 'linkReply', outcome: 'no_match' }));
      return { status: 200, jsonBody: { outcome: 'no_match', candidateCount: 0 } };
    }),
});

/* ============================================================
   POST /api/internal/triage/context
   Called by: a NEW orchestration triage-context activity (rules-engine-v2 Phase 2,
   ADR-0019/the rules_engine_v2_plan). Resolves the LIVE context `decideTriage`
   (packages/domain/src/domain/triage-policy.ts) needs before routing an inbound: open-case
   ref/job-ref/VRM matches, a cross-mailbox duplicate-delivery check, and (schema-tolerant)
   conversation siblings. READ-ONLY over case_/inbound_email — never mutates a case.

   OPEN CASE = mirrors internalInboundLinkReply's own definition just above: status_code NOT
   IN the TERMINAL_STATUSES set (eva_submitted / box_synced / error / removed). NOTE:
   linkReply's own ref match is a case-SENSITIVE `=` on case_ref/case_po; this endpoint's
   pinned contract calls for case-INSENSITIVE matching (upper(...) both sides, mirroring
   cases/resolve's own upper(case_po) convention elsewhere in this file) — a pre-existing
   inconsistency in linkReply, found but intentionally NOT changed here (out of scope for
   this slice; only the OPEN-CASE status-membership definition is mirrored verbatim).

   matchedOn priority: a case_po/caseref match beats a job_ref match beats a vrm match. The
   single SELECT below computes each returned case's OWN best matchedOn via a CASE WHEN
   ladder in the same priority order, so every case_ row appears at most once — "dedupe by
   caseId keeping the strongest matchedOn" falls out of the query shape, no separate JS pass
   needed.

   SERIALIZATION (ADR-0019 "mint race"): takes the SAME advisory locks
   (api/src/lib/triage-locks.ts) that internalCasesResolve's mint transaction and
   internalInboundLinkReply also take, keyed on the normalized ref/job-ref/VRM, so a
   concurrent mint for the same reference commits (or rolls back) before this read proceeds.

   PRE-DDL SAFE: case_.source_message_id and case_.case_po/case_ref/vrm all exist today (the
   duplicate probe reads case_ ONLY — see the note at the dup check). conversationSiblingCaseIds
   alone is schema-tolerant (hasColumn) — it is honestly [] until the 2026-07-02 DDL delta adds
   inbound_email.conversation_id.
   ============================================================ */
app.http('internalTriageContext', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/triage/context',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json().catch(() => ({}))) as {
        caseref?: string;
        jobref?: string;
        vrm?: string;
        internetMessageId?: string;
        conversationId?: string;
      };
      const caseref = (body.caseref ?? '').trim();
      const jobref = (body.jobref ?? '').trim();
      const vrm = (body.vrm ?? '').trim();
      const internetMessageId = (body.internetMessageId ?? '').trim();
      const conversationId = (body.conversationId ?? '').trim();

      // Cached catalog read (not business state) — safe outside the tx below.
      const hasConversationCol = await hasColumn('inbound_email', 'conversation_id');

      const result = await tx(async (q) => {
        await acquireTriageLocks(q, { caseref, jobref, vrm });

        let openCaseMatches: Array<{
          caseId: string;
          casePo: string;
          matchedOn: 'case_po' | 'job_ref' | 'vrm';
          status: string;
        }> = [];
        if (caseref || jobref || vrm) {
          const rows = await q<Row>(
            `SELECT id, case_po, status_code, duplicate_keys,
                    CASE
                      WHEN $1 <> '' AND (upper(case_po) = upper($1) OR upper(case_ref) = upper($1)) THEN 'case_po'
                      WHEN $2 <> '' AND (upper(case_po) = upper($2) OR upper(case_ref) = upper($2)) THEN 'job_ref'
                      WHEN $3 <> '' AND upper(vrm) = upper($3) THEN 'vrm'
                    END AS matched_on
               FROM case_
              WHERE status_code NOT IN (${TERMINAL_INT_CODES.join(',')})
                AND (
                  ($1 <> '' AND (upper(case_po) = upper($1) OR upper(case_ref) = upper($1)))
                  OR ($2 <> '' AND (upper(case_po) = upper($2) OR upper(case_ref) = upper($2)))
                  OR ($3 <> '' AND upper(vrm) = upper($3))
                )
              ORDER BY created_at`,
            [caseref, jobref, vrm],
          );
          openCaseMatches = rows
            // Drop merge-retired duplicates: a case merged INTO a survivor (status
            // linked_to_instruction carrying a mergedInto marker in duplicate_keys) is not a
            // valid link target, but linked_to_instruction is NON-terminal so the status
            // filter above keeps it. Leaving it in makes a survivor+retired pair look like
            // `multiple_open_cases`, wrongly flagging the email instead of suggesting the
            // single survivor — the exact PK20FWT-style failure. (TKT-102 / PR52-F3)
            .filter((r) => {
              const status = caseStatusCodec.toName(r.status_code as number) ?? 'error';
              return !(status === 'linked_to_instruction' && mergedIntoFrom(r.duplicate_keys));
            })
            .map((r) => ({
              caseId: r.id as string,
              casePo: (r.case_po as string | null) ?? '',
              matchedOn: r.matched_on as 'case_po' | 'job_ref' | 'vrm',
              status: caseStatusCodec.toName(r.status_code as number) ?? 'error',
            }));
        }

        let duplicateInternetMessageId = false;
        if (internetMessageId) {
          // A genuine "already received and processed" duplicate is one where a CASE was already
          // minted from this exact Internet-Message-Id. Probe ONLY case_ here — NOT inbound_email:
          // classifyInbound (intake step 1.5) upserts THIS message's own inbound_email row (keyed
          // on source_message_id) BEFORE this endpoint runs (step 1.55), and inbound_email is
          // unique per message-id (uq_inbound_email_source_message_id), so an inbound_email EXISTS
          // would self-match every arrival — making duplicateInternetMessageId true for ~100% of
          // messages (poisoning the always-on triage_decision shadow telemetry now, and dropping
          // every email as a self-duplicate the moment TRIAGE_REF_GATE_ENABLED is on). caseResolve
          // writes case_.source_message_id LATER in the same orchestration, so the case_ probe
          // cannot self-match at triage time.
          const dupRows = await q<{ found: boolean }>(
            `SELECT EXISTS (
                SELECT 1 FROM case_ WHERE source_message_id = $1
              ) AS found`,
            [internetMessageId],
          );
          duplicateInternetMessageId = Boolean(dupRows[0]?.found);
        }

        let conversationSiblingCaseIds: string[] = [];
        if (hasConversationCol && conversationId) {
          const sibRows = await q<{ case_id: string }>(
            `SELECT DISTINCT case_id FROM inbound_email
              WHERE conversation_id = $1 AND case_id IS NOT NULL`,
            [conversationId],
          );
          conversationSiblingCaseIds = sibRows.map((r) => r.case_id);
        }

        return { openCaseMatches, duplicateInternetMessageId, conversationSiblingCaseIds };
      });

      return { status: 200, jsonBody: result };
    }),
});

/* ============================================================
   POST /api/internal/triage/suggest-link
   Called by: a NEW orchestration triage-policy activity (rules-engine-v2 Phase 2,
   ADR-0019) when `decideTriage` returns 'suggest_attach' (suggestionType 'case_link') or
   'propose_cancellation' (suggestionType 'cancellation'); AND (rules-engine-v2 Phase 4,
   ADR-0019 Stage C) the gated `triage-classify.ts` activity on a non-abstain model result
   (suggestionType 'triage_category'). NEVER mutates a case or the inbound_email row —
   writes a PENDING ai_suggestion a human accepts/rejects; reviewAiSuggestion's
   promoteAcceptedSuggestion (ai-suggestions.ts) does the actual attach/relabel/no-op on
   accept.

   THREE suggestionType shapes share this one endpoint:
     - 'case_link' / 'cancellation' — suggested_value {targetCaseId?, casePo?,
       sourceMessageId?, decisionInputs} (the Stage-B ref-gate/cancellation shape, unchanged).
     - 'triage_category' — suggested_value {category, subtype} (the Stage-C LLM shape,
       rules-engine-v2 Phase 4). targetCaseId is ALWAYS absent/ignored for this type: it
       proposes a RELABEL of the message, never a case link. category/subtype are validated
       against the SAME name<->code maps `upsertInboundEmail` (above) and `reclassifyInbound`
       (inbound.ts) use (INBOUND_CATEGORY_TO_INT / INBOUND_SUBTYPE_TO_INT) — an unknown name
       is a 400, never silently written. model_version is CALLER-supplied for this type
       ('<deployment>:<modelVersion-from-response>', stamped by triage-classify.ts) rather
       than the hardcoded 'triage-policy-v1' the other two types carry (they are this
       endpoint's OWN deterministic policy output, not a separate model's).

   inboundEmailId resolution: a caller can run PRE-classifyPersist (the triage row may not
   exist yet), so when `inboundEmailId` is not given it is resolved from `sourceMessageId`;
   when that lookup also comes up empty, the suggestion is written with inbound_email_id
   NULL and sourceMessageId stashed inside suggested_value so a LATER pass could reconcile
   it onto the row once classifyPersist writes it (no such reconciliation pass exists yet —
   this is the documented gap, not a bug).

   IDEMPOTENCY (api/src/lib/mappers.ts's deriveSuggestionIdempotencyKey): a Durable
   at-least-once retry must not duplicate a suggestion the reviewer hasn't acted on — a
   PENDING row of the same suggestionType + the same subject (inbound_email_id once resolved,
   else the stashed sourceMessageId) + the same targetCaseId short-circuits to created:false.
   For 'triage_category' this collapses to "same subject" (targetCaseId is always null for
   that type), so a Durable retry of the SAME triage-classify call reuses the one PENDING row.

   PRE-DDL: the ai_suggestion table/columns are ALL already live (no dependency on the
   2026-07-02 DDL delta) — the suggestion write itself always succeeds. Only the AUDIT rows
   (inbound_link_suggested / cancellation_proposed, codes 100000035/100000038) depend on that
   delta; writeAudit's catch-all swallow degrades a pre-DDL FK violation to "no audit row",
   never a blocked caller (see audit.ts's AUDIT_ACTION comment). 'triage_category' audits via
   the pre-existing ai_suggestion_created code (100000032) — no new audit code minted.
   ============================================================ */
app.http('internalTriageSuggestLink', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/triage/suggest-link',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json().catch(() => ({}))) as {
        sourceMessageId?: string;
        inboundEmailId?: string;
        targetCaseId?: string;
        suggestionType?: string;
        rationale?: string;
        confidence?: number;
        decisionInputs?: unknown;
        // rules-engine-v2 Phase 4 (ADR-0019 Stage C) — 'triage_category' only.
        category?: string;
        subtype?: string;
        modelVersion?: string;
        // TKT-093 (DARK) — case_link only: self-accept the just-written suggestion and
        // perform the reversible attach immediately. Set by the orchestration triagePolicy
        // activity ONLY when decideTriage returned `attach_case` (gated behind
        // TRIAGE_AUTO_ATTACH_ENABLED + an exact single case_po/job_ref match — the gating
        // lives entirely upstream in @cs/domain + the orchestrator). Ignored for other types.
        autoAttach?: boolean;
      };
      const suggestionType = body.suggestionType;
      if (suggestionType !== 'case_link' && suggestionType !== 'cancellation' && suggestionType !== 'triage_category') {
        return {
          status: 400,
          jsonBody: { error: "suggestionType must be 'case_link', 'cancellation' or 'triage_category'" },
        };
      }
      const sourceMessageId = (body.sourceMessageId ?? '').trim() || null;
      // 'triage_category' never carries a target case — it relabels the message, it does
      // not link it (see the module doc above); force null regardless of what a caller sent.
      const targetCaseId =
        suggestionType === 'triage_category' ? null : (body.targetCaseId ?? '').trim() || null;
      // rationale/decisionInputs are payload/telemetry fields, not identity — accepted
      // leniently (coerced, never 400) so a minor caller-side omission cannot block a
      // suggestion the ref-gate/cancellation rung already decided to raise.
      const rationale = (body.rationale ?? '').trim() || null;
      const confidence = typeof body.confidence === 'number' ? body.confidence : null;
      const decisionInputs = body.decisionInputs ?? {};

      // 'triage_category' ONLY: validate category/subtype against the SAME name<->code maps
      // upsertInboundEmail (this file) and reclassifyInbound (inbound.ts) use — an unknown
      // name is a 400, never a silently-dropped/garbage suggested_value.
      let triageCategory: string | null = null;
      let triageSubtype: string | null = null;
      if (suggestionType === 'triage_category') {
        const cat = (body.category ?? '').trim();
        const sub = (body.subtype ?? '').trim();
        if (!cat || !(cat in INBOUND_CATEGORY_TO_INT)) {
          return { status: 400, jsonBody: { error: 'category must be a known inbound category' } };
        }
        if (!sub || !(sub in INBOUND_SUBTYPE_TO_INT)) {
          return { status: 400, jsonBody: { error: 'subtype must be a known inbound subtype' } };
        }
        triageCategory = cat;
        triageSubtype = sub;
      }

      // Resolve inbound_email_id from sourceMessageId when not given directly (see the
      // module doc above — this activity may run pre-classifyPersist).
      let inboundEmailId = (body.inboundEmailId ?? '').trim() || null;
      if (!inboundEmailId && sourceMessageId) {
        const rows = await query<Row>(
          'SELECT id FROM inbound_email WHERE source_message_id = $1',
          [sourceMessageId],
        );
        inboundEmailId = (rows[0]?.id as string | undefined) ?? null;
      }

      // Idempotency: a PENDING suggestion for the SAME (type, subject, targetCaseId) already
      // exists -> return it unchanged, created:false.
      const idemKey = deriveSuggestionIdempotencyKey({
        suggestionType,
        inboundEmailId,
        sourceMessageId,
        targetCaseId,
      });
      let existing: Row[] = [];
      if (idemKey) {
        existing =
          idemKey.subjectKind === 'inbound_email_id'
            ? await query<Row>(
                `SELECT id FROM ai_suggestion
                  WHERE suggestion_type = $1 AND review_state = 'pending' AND inbound_email_id = $2
                    AND (suggested_value->>'targetCaseId') IS NOT DISTINCT FROM $3
                  LIMIT 1`,
                [idemKey.suggestionType, idemKey.subject, idemKey.targetCaseId],
              )
            : await query<Row>(
                `SELECT id FROM ai_suggestion
                  WHERE suggestion_type = $1 AND review_state = 'pending' AND inbound_email_id IS NULL
                    AND (suggested_value->>'sourceMessageId') IS NOT DISTINCT FROM $2
                    AND (suggested_value->>'targetCaseId') IS NOT DISTINCT FROM $3
                  LIMIT 1`,
                [idemKey.suggestionType, idemKey.subject, idemKey.targetCaseId],
              );
      }
      if (existing[0]) {
        return { status: 200, jsonBody: { suggestionId: existing[0].id, created: false } };
      }

      // Best-effort enrichment: the target case's own Case/PO, so the suggestion can render
      // a human-readable reference without a second lookup. Absent when the target case has
      // no case_po yet (e.g. a Held new-client case) or no target was resolved at all
      // (always the case for 'triage_category' — targetCaseId is forced null above).
      let casePo: string | null = null;
      if (targetCaseId) {
        const caseRows = await query<Row>('SELECT case_po FROM case_ WHERE id = $1', [targetCaseId]);
        casePo = (caseRows[0]?.case_po as string | null) ?? null;
      }

      const suggestedValue =
        suggestionType === 'triage_category'
          ? {
              category: triageCategory,
              subtype: triageSubtype,
              // Carry sourceMessageId so the source_message_id-subject idempotency SELECT (used
              // when the inbound_email row isn't resolvable yet — inboundEmailId null) can match a
              // prior PENDING copy on a Durable at-least-once retry. Without it the dedup filters
              // on `suggested_value->>'sourceMessageId'`, a field this branch never wrote, so it
              // never matches and inserts a duplicate 'AI suggested category' banner.
              ...(sourceMessageId ? { sourceMessageId } : {}),
            }
          : {
              ...(targetCaseId ? { targetCaseId } : {}),
              ...(casePo ? { casePo } : {}),
              ...(sourceMessageId ? { sourceMessageId } : {}),
              decisionInputs,
            };
      // 'triage_category' stamps the CALLER's model_version ('<deployment>:<modelVersion>',
      // triage-classify.ts); the other two types are this endpoint's own deterministic
      // policy output, unchanged at 'triage-policy-v1'.
      const modelVersion =
        suggestionType === 'triage_category' ? (body.modelVersion ?? '').trim() || 'unknown' : 'triage-policy-v1';
      const inserted = await query<Row>(
        `INSERT INTO ai_suggestion
           (inbound_email_id, suggestion_type, suggested_value, rationale, confidence, model_version)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6)
         RETURNING id`,
        [inboundEmailId, suggestionType, JSON.stringify(suggestedValue), rationale, confidence, modelVersion],
      );
      const suggestionId = inserted[0]?.id as string | undefined;
      if (!suggestionId) {
        return { status: 500, jsonBody: { error: 'suggestion insert returned no id' } };
      }

      let autoAttached = false;
      if (suggestionType === 'case_link') {
        await writeAudit({
          action: AUDIT_ACTION.inbound_link_suggested,
          ...(targetCaseId ? { caseId: targetCaseId } : {}),
          summary: 'A message was suggested for linking to an existing case',
          after: { suggestionId, targetCaseId, sourceMessageId, inboundEmailId },
        });

        // TKT-093 (DARK) — auto-attach: self-accept the suggestion and perform the SAME
        // reversible attach as accepting it from the inbox (promoteAcceptedSuggestion's
        // case_link branch): FILL-IF-EMPTY link + triage_state='routed' + the case-scoped
        // inbound_linked audit (actor 'auto-attach'). Never overwrites a link a person (or
        // another path) already made. Reversible via the existing detach action.
        if (body.autoAttach === true && targetCaseId && inboundEmailId) {
          const linked = await query<Row>(
            `UPDATE inbound_email SET case_id = $2, triage_state = 'routed', updated_at = now()
               WHERE id = $1 AND case_id IS NULL RETURNING id`,
            [inboundEmailId, targetCaseId],
          );
          if (linked[0]) {
            await query<Row>(
              `UPDATE ai_suggestion SET review_state = 'accepted', reviewed_by = 'auto-attach', reviewed_at = now()
                 WHERE id = $1 AND review_state = 'pending'`,
              [suggestionId],
            );
            await writeAudit({
              action: AUDIT_ACTION.inbound_linked,
              caseId: targetCaseId,
              summary: 'Inbound email linked to case (auto-attach)',
              before: { caseId: null },
              after: { caseId: targetCaseId, inboundEmailId, suggestionId, auto: true },
              actor: 'auto-attach',
            });
            // TKT-023 — an auto-attached arrival satisfies any outstanding chaser.
            await markOutstandingChasersResponded(targetCaseId, 'auto-attach');
            autoAttached = true;
          }
        }
      } else if (suggestionType === 'cancellation') {
        await writeAudit({
          action: AUDIT_ACTION.cancellation_proposed,
          ...(targetCaseId ? { caseId: targetCaseId } : {}),
          summary: 'A message reported a case cancelled or closed — flagged for review',
          after: { suggestionId, targetCaseId, sourceMessageId, inboundEmailId },
        });
      } else {
        // 'triage_category' (rules-engine-v2 Phase 4, Stage C) — the GENERIC "an AI
        // producer created a suggestion" audit (the same code generateAiSuggestions writes
        // for every other AI-produced suggestion kind, ai-suggestions.ts). Distinct from
        // inbound_link_suggested/cancellation_proposed, which name the Stage-B ref-gate/
        // cancellation actions specifically — no new audit code minted for this one.
        await writeAudit({
          action: AUDIT_ACTION.ai_suggestion_created,
          summary: 'An AI-suggested category was proposed for a message',
          after: { suggestionId, sourceMessageId, inboundEmailId, category: triageCategory, subtype: triageSubtype },
        });
      }

      ctx.log(JSON.stringify({ evt: 'triageSuggestLink', suggestionType, suggestionId, targetCaseId, autoAttached }));
      return { status: 200, jsonBody: { suggestionId, created: true, ...(autoAttached ? { autoAttached: true } : {}) } };
    }),
});

/* ============================================================
   POST /api/internal/triage/held-pre-instruction  (TKT-084, taxonomy v3)
   Called by: the orchestration `correlatePreInstruction` activity after a case
   mints, to FIND held pre-instruction rows that appear to belong to the new case
   (the sender gave directions BEFORE the official instruction arrived). READ-ONLY:
   the caller writes the actual suggestion via the existing
   /api/internal/triage/suggest-link route (suggest-first — pre-instruction
   correlation is typically VRM-anchored, and VRM-only never auto-attaches, per the
   ADR-0019 promotion doctrine). A held row = category pre_instruction, no case
   link yet, triage_state 'new'. Matching is exact (case-insensitive) on
   body_vrm / body_caseref / body_jobref; at least one key is required (400
   otherwise). Capped at 5 newest rows — a correlation sweep, not a search API.
   ============================================================ */
app.http('internalTriageHeldPreInstruction', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/triage/held-pre-instruction',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json().catch(() => ({}))) as {
        vrm?: string;
        caseRef?: string;
        jobRef?: string;
      };
      const vrm = (body.vrm ?? '').trim();
      const caseRef = (body.caseRef ?? '').trim();
      const jobRef = (body.jobRef ?? '').trim();
      if (!vrm && !caseRef && !jobRef) {
        return { status: 400, jsonBody: { error: 'at least one of vrm, caseRef, jobRef is required' } };
      }

      const rows = await query<Row>(
        `SELECT ie.id, ie.source_message_id, ie.body_vrm, ie.body_caseref, ie.body_jobref
           FROM inbound_email ie
           JOIN choice_inbound_category c ON c.code = ie.category_code
          WHERE c.name = 'pre_instruction'
            AND ie.case_id IS NULL
            AND ie.triage_state = 'new'
            AND (
                  ($1 <> '' AND upper(ie.body_vrm) = upper($1))
               OR ($2 <> '' AND upper(ie.body_caseref) = upper($2))
               OR ($3 <> '' AND upper(ie.body_jobref) = upper($3))
            )
          ORDER BY ie.created_at DESC
          LIMIT 5`,
        [vrm, caseRef, jobRef],
      );

      const held = rows.map((r) => ({
        inboundEmailId: r.id as string,
        sourceMessageId: (r.source_message_id as string | null) ?? null,
        matchedOn:
          vrm && (r.body_vrm as string | null)?.toUpperCase() === vrm.toUpperCase()
            ? 'vrm'
            : caseRef && (r.body_caseref as string | null)?.toUpperCase() === caseRef.toUpperCase()
              ? 'case_ref'
              : 'job_ref',
      }));
      ctx.log(JSON.stringify({ evt: 'heldPreInstruction', matches: held.length }));
      return { status: 200, jsonBody: { held } };
    }),
});

/* ============================================================
   POST /api/internal/inbound/{id}/outlook-moved  (TKT-054 / 020726 E6)
   Called by: the orchestration `outlook-move` queue function reporting the
   terminal outcome of a gated Outlook filing. `moved` stamps the lifecycle AND
   marks a still-new row actioned (a filed email is handled email); `failed`
   stamps failed (the SPA offers a retry). Audited with the TKT-054 codes.
   ============================================================ */
app.http('internalInboundOutlookMoved', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/inbound/{id}/outlook-moved',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const id = req.params.id;
      const body = (await req.json().catch(() => ({}))) as {
        outcome?: unknown;
        folder?: unknown;
        detail?: unknown;
      };
      const outcome = body.outcome;
      if (outcome !== 'moved' && outcome !== 'failed') {
        return { status: 400, jsonBody: { error: "outcome must be 'moved' or 'failed'" } };
      }
      const existing = await query<Row>(
        'SELECT id, case_id FROM inbound_email WHERE id = $1',
        [id],
      );
      if (!existing[0]) return { status: 404, jsonBody: { error: 'not found' } };
      const folder = typeof body.folder === 'string' && body.folder ? body.folder : null;
      const detail = typeof body.detail === 'string' ? body.detail.slice(0, 300) : null;

      if (outcome === 'moved') {
        await query(
          `UPDATE inbound_email
              SET outlook_move_state = 'moved',
                  outlook_moved_folder = COALESCE($2, outlook_moved_folder),
                  outlook_moved_at = now(),
                  triage_state = CASE
                                   WHEN triage_state IS NULL OR triage_state = 'new' THEN 'actioned'
                                   ELSE triage_state
                                 END,
                  updated_at = now()
            WHERE id = $1`,
          [id, folder],
        );
      } else {
        await query(
          `UPDATE inbound_email
              SET outlook_move_state = 'failed', outlook_moved_at = now(), updated_at = now()
            WHERE id = $1`,
          [id],
        );
      }
      await writeAudit({
        action: outcome === 'moved' ? AUDIT_ACTION.outlook_moved : AUDIT_ACTION.outlook_move_failed,
        ...(existing[0].case_id ? { caseId: existing[0].case_id as string } : {}),
        summary:
          outcome === 'moved'
            ? `Outlook filing completed${folder ? ` -> ${folder}` : ''}`
            : 'Outlook filing failed',
        severity: outcome === 'moved' ? 'info' : 'warning',
        after: { inboundEmailId: id, ...(folder ? { folder } : {}), ...(detail ? { detail } : {}) },
        actor: 'orchestration',
      });
      ctx.log(JSON.stringify({ evt: 'outlookMoved', inboundEmailId: id, outcome, folder }));
      return { status: 204 };
    }),
});

type EvidenceBackfillCommittedOutcome = 'completed' | 'partial';

interface EvidenceBackfillCommittedResult {
  outcome: EvidenceBackfillCommittedOutcome;
  persisted: number;
  merged?: number;
  failedAttachments?: number;
  detail?: string;
}

function parseEvidenceBackfillCommittedResult(value: unknown): EvidenceBackfillCommittedResult | null {
  let candidate = value;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const row = candidate as Record<string, unknown>;
  if (row.outcome !== 'completed' && row.outcome !== 'partial') return null;
  const persisted = Number(row.persisted);
  if (!Number.isSafeInteger(persisted) || persisted < 0) return null;
  const result: EvidenceBackfillCommittedResult = { outcome: row.outcome, persisted };
  const merged = Number(row.merged);
  if (Number.isSafeInteger(merged) && merged >= 0) result.merged = merged;
  const failedAttachments = Number(row.failedAttachments);
  if (Number.isSafeInteger(failedAttachments) && failedAttachments >= 0) {
    result.failedAttachments = failedAttachments;
  }
  if (typeof row.detail === 'string' && row.detail.trim()) result.detail = row.detail.slice(0, 300);
  return result;
}

/* Validate the queued TKT-145 target before orchestration reads Graph or lands bytes.
   A merge-retired target resolves only through its verified mergedInto lineage. */
app.http('internalInboundEvidenceBackfillValidate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/inbound/{id}/evidence-backfill/validate',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json().catch(() => ({}))) as {
        targetCaseId?: unknown;
        generation?: unknown;
      };
      const targetCaseId = typeof body.targetCaseId === 'string' ? body.targetCaseId.trim() : '';
      if (!targetCaseId) return { status: 400, jsonBody: { error: 'targetCaseId is required' } };
      const suppliedGeneration = body.generation == null ? null : Number(body.generation);
      if (
        suppliedGeneration != null &&
        (!Number.isSafeInteger(suppliedGeneration) || suppliedGeneration < 1)
      ) {
        return { status: 400, jsonBody: { error: 'generation must be a positive integer' } };
      }
      const resolved = await withResolvedEvidenceBackfillTarget(
        req.params.id,
        targetCaseId,
        async (q) => {
          const rows = await q<{
            evidence_backfill_requested_generation: string | number;
            evidence_backfill_completed_generation: string | number;
            evidence_backfill_completed_result: unknown;
          }>(
            `SELECT evidence_backfill_requested_generation,
                    evidence_backfill_completed_generation,
                    evidence_backfill_completed_result
               FROM inbound_email
              WHERE id = $1`,
            [req.params.id],
          );
          const requested = Number(
            rows[0]?.evidence_backfill_requested_generation ?? suppliedGeneration ?? 1,
          );
          const completed = Number(rows[0]?.evidence_backfill_completed_generation ?? 0);
          const generation = suppliedGeneration ?? requested; // rolling compatibility for old queued jobs
          if (generation < 1 || generation > requested) {
            return { kind: 'generation_mismatch' as const, requested };
          }
          if (suppliedGeneration != null && generation < requested && completed < generation) {
            return { kind: 'superseded' as const, generation };
          }
          const committedGeneration = completed >= generation ? completed : generation;
          const committedResult = completed >= generation
            ? parseEvidenceBackfillCommittedResult(rows[0]?.evidence_backfill_completed_result)
            : null;
          return {
            kind: 'validated' as const,
            generation: committedGeneration,
            completed: completed >= generation,
            ...(committedResult ? { committedResult } : {}),
          };
        },
      );
      if (resolved.kind === 'stale') {
        return {
          status: 409,
          jsonBody: { error: 'evidence backfill target changed', code: 'evidence_backfill_target_changed' },
        };
      }
      if (resolved.value.kind === 'generation_mismatch') {
        return {
          status: 409,
          jsonBody: {
            error: 'evidence backfill generation changed',
            code: 'evidence_backfill_generation_changed',
            requestedGeneration: resolved.value.requested,
          },
        };
      }
      if (resolved.value.kind === 'superseded') {
        return {
          status: 200,
          jsonBody: {
            targetCaseId: resolved.targetCaseId,
            generation: resolved.value.generation,
            completed: false,
            superseded: true,
          },
        };
      }
      return {
        status: 200,
        jsonBody: {
          targetCaseId: resolved.targetCaseId,
          generation: resolved.value.generation,
          completed: resolved.value.completed,
          ...(resolved.value.committedResult
            ? { committedResult: resolved.value.committedResult }
            : {}),
        },
      };
    }),
});

/* ============================================================
   POST /api/internal/inbound/{id}/evidence-backfill  (TKT-145)
   Called by: the orchestration `evidence-backfill` queue consumer reporting the
   terminal outcome of a case_link evidence backfill (the outlook-moved pattern).
   `completed` → the case-scoped attachment_classified audit (the same action the
   normal classifyPersist lane writes). `failed` → the durable "Attachments to
   add" case note (the TKT-145 INVERSION of the always-note interim mitigation:
   staff are told to attach by hand ONLY when the backfill terminally failed) +
   a warning audit. The note insert is duplicate-guarded so a poison-path
   re-report never stacks identical notes.
   ============================================================ */
app.http('internalInboundEvidenceBackfill', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/inbound/{id}/evidence-backfill',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const id = req.params.id;
      const body = (await req.json().catch(() => ({}))) as {
        outcome?: unknown;
        targetCaseId?: unknown;
        persisted?: unknown;
        merged?: unknown;
        failedAttachments?: unknown;
        detail?: unknown;
        generation?: unknown;
      };
      const outcome = body.outcome;
      if (outcome !== 'completed' && outcome !== 'partial' && outcome !== 'failed') {
        return { status: 400, jsonBody: { error: "outcome must be 'completed', 'partial' or 'failed'" } };
      }
      const targetCaseId = typeof body.targetCaseId === 'string' ? body.targetCaseId.trim() : '';
      if (!targetCaseId) return { status: 400, jsonBody: { error: 'targetCaseId is required' } };
      const suppliedGeneration = body.generation == null ? null : Number(body.generation);
      if (
        suppliedGeneration != null &&
        (!Number.isSafeInteger(suppliedGeneration) || suppliedGeneration < 1)
      ) {
        return { status: 400, jsonBody: { error: 'generation must be a positive integer' } };
      }
      const requestedDetail = typeof body.detail === 'string' ? body.detail.slice(0, 300) : null;
      const requestedPersisted = typeof body.persisted === 'number' ? body.persisted : null;
      const requestedMerged = typeof body.merged === 'number' ? body.merged : null;
      const requestedFailedAttachments = typeof body.failedAttachments === 'number'
        ? Math.max(0, Math.trunc(body.failedAttachments))
        : null;

      // Every outcome reconciles the ONE source-keyed recovery note under the
      // inbound row lock. Failed/partial upsert the current actionable wording;
      // completed converts a pre-existing manual-action note to resolved wording
      // without creating a success-path note when none existed.
      const report = await tx(async (q) => {
        const locked = await q<{
          case_id: string | null;
          evidence_backfill_report_outcome: string | null;
          evidence_backfill_requested_generation: string | number;
          evidence_backfill_completed_generation: string | number;
          evidence_backfill_completed_result: unknown;
          evidence_backfill_reported_generation: string | number;
        }>(
          `SELECT case_id, evidence_backfill_report_outcome,
                  evidence_backfill_requested_generation,
                  evidence_backfill_completed_generation,
                  evidence_backfill_completed_result,
                  evidence_backfill_reported_generation
             FROM inbound_email
            WHERE id = $1
            FOR UPDATE`,
          [id],
        );
        if (!locked[0]) return { kind: 'missing' as const };
        if ((locked[0].case_id ?? null) !== targetCaseId) return { kind: 'stale' as const };
        const requestedGeneration = Number(
          locked[0].evidence_backfill_requested_generation ?? suppliedGeneration ?? 1,
        );
        const completedGeneration = Number(locked[0].evidence_backfill_completed_generation ?? 0);
        const reportedGeneration = Number(locked[0].evidence_backfill_reported_generation ?? 0);
        const generation = suppliedGeneration ?? requestedGeneration; // legacy reporter compatibility
        if (generation < 1 || generation > requestedGeneration) {
          return { kind: 'generation_mismatch' as const, requestedGeneration };
        }

        // A newer committed generation supersedes this delivery. Its own delivery (or
        // another replay) reports that generation; this older one must not reinterpret it.
        if (completedGeneration > generation) {
          return {
            kind: 'replay' as const,
            generation,
            effectiveOutcome: outcome,
            protectedCompletion: true,
          };
        }

        // Persistence truth outranks the reporter for this generation. The exact
        // completed/partial result and recovered rows commit together, so a lost report
        // replays this snapshot instead of guessing that any commit was fully completed.
        const committedResult = completedGeneration === generation
          ? parseEvidenceBackfillCommittedResult(locked[0].evidence_backfill_completed_result)
          : null;
        if (suppliedGeneration != null && completedGeneration === generation && !committedResult) {
          return { kind: 'missing_committed_result' as const, completedGeneration };
        }
        const protectedCompletion = committedResult != null && outcome !== committedResult.outcome;
        const effectiveOutcome = committedResult?.outcome ?? outcome;
        const persisted = committedResult?.persisted ?? requestedPersisted;
        const merged = committedResult?.merged ?? requestedMerged;
        const failedAttachments = committedResult?.failedAttachments ?? requestedFailedAttachments;
        const detail = committedResult?.detail ?? requestedDetail;
        if (
          suppliedGeneration != null &&
          (effectiveOutcome === 'completed' || effectiveOutcome === 'partial') &&
          completedGeneration < generation
        ) {
          return { kind: 'not_committed' as const, completedGeneration };
        }

        const rank: Record<'failed' | 'partial' | 'completed', number> = {
          failed: 0,
          partial: 1,
          completed: 2,
        };
        const currentOutcome = locked[0].evidence_backfill_report_outcome as
          | 'failed'
          | 'partial'
          | 'completed'
          | null;
        if (
          generation < reportedGeneration ||
          (generation === reportedGeneration && currentOutcome != null &&
            rank[currentOutcome] >= rank[effectiveOutcome])
        ) {
          return {
            kind: 'replay' as const,
            generation,
            effectiveOutcome,
            protectedCompletion,
          };
        }
        await writeEvidenceBackfillNote(
          { caseId: targetCaseId, inboundEmailId: id, kind: effectiveOutcome },
          q,
        );

        const updated = await q<{ id: string }>(
          `UPDATE inbound_email
              SET evidence_backfill_report_outcome = $2,
                  evidence_backfill_reported_generation = $3,
                  evidence_backfill_reported_at = now(),
                  updated_at = now()
            WHERE id = $1
              AND evidence_backfill_reported_generation <= $3
          RETURNING id`,
          [id, effectiveOutcome, generation],
        );
        if (!updated[0] && suppliedGeneration != null) {
          return { kind: 'replay' as const, generation, effectiveOutcome, protectedCompletion };
        }

        if (effectiveOutcome === 'completed') {
          await writeAudit({
            action: AUDIT_ACTION.attachment_classified,
            caseId: targetCaseId,
            summary: `Attachments added from the linked email (${persisted ?? '?'} new${
              merged ? `, ${merged} matched` : ''
            })`,
            after: {
              inboundEmailId: id,
              generation,
              persisted,
              merged,
              ...(protectedCompletion ? { protectedFromOutcome: outcome } : {}),
            },
            actor: 'orchestration',
          }, q);
        } else {
          await writeAudit({
            action: AUDIT_ACTION.graph_message_ingest_failed,
            caseId: targetCaseId,
            summary: effectiveOutcome === 'partial'
              ? 'Some attachments from the linked email could not be added'
              : 'Attachments from the linked email could not be added — staff must add them',
            severity: 'warning',
            after: {
              inboundEmailId: id,
              generation,
              ...(failedAttachments != null ? { failedAttachments } : {}),
              ...(detail ? { detail } : {}),
            },
            actor: 'orchestration',
          }, q);
        }
        return {
          kind: 'transition' as const,
          generation,
          effectiveOutcome,
          protectedCompletion,
        };
      });
      if (report.kind === 'missing') return { status: 404, jsonBody: { error: 'not found' } };
      if (report.kind === 'stale') {
        return {
          status: 409,
          jsonBody: { error: 'evidence backfill target changed', code: 'evidence_backfill_target_changed' },
        };
      }
      if (report.kind === 'generation_mismatch') {
        return {
          status: 409,
          jsonBody: {
            error: 'evidence backfill generation changed',
            code: 'evidence_backfill_generation_changed',
            requestedGeneration: report.requestedGeneration,
          },
        };
      }
      if (report.kind === 'not_committed') {
        return {
          status: 409,
          jsonBody: {
            error: 'evidence backfill persistence is not committed',
            code: 'evidence_backfill_not_committed',
            completedGeneration: report.completedGeneration,
          },
        };
      }
      if (report.kind === 'missing_committed_result') {
        return {
          status: 409,
          jsonBody: {
            error: 'evidence backfill committed result is unavailable',
            code: 'evidence_backfill_committed_result_missing',
            completedGeneration: report.completedGeneration,
          },
        };
      }
      ctx.log(
        JSON.stringify({
          evt: 'evidenceBackfillReport',
          inboundEmailId: id,
          outcome: report.effectiveOutcome,
          requestedOutcome: outcome,
          generation: report.generation,
          targetCaseId,
          replay: report.kind === 'replay',
          protectedCompletion: report.protectedCompletion,
        }),
      );
      return { status: 204 };
    }),
});

/* ============================================================
   POST /api/internal/inbound/attention  (TKT-119c / TKT-034)
   Called by: orchestration when a pipeline outcome needs a VISIBLE home on the
   email row — retroRecordFailure ('unable_to_locate': reconstruction from Outlook
   + Box history found nothing) and the images-unmatched triage rung
   ('images_no_match': an image-bearing email matched no case). Keyed on the
   message's Internet-Message-Id (the caller may not know the row id). SCHEMA
   TOLERANT: inbound_email.attention_reason lands via the 2026-07-09 DDL delta —
   before it exists this stamps nothing and says so (never a failed statement).
   The SPA renders the reason as a plain-English chip while the row is UNLINKED;
   linking the email to a case supersedes it (presentation-side).
   ============================================================ */
const ATTENTION_REASONS = new Set(['unable_to_locate', 'images_no_match']);

app.http('internalInboundAttention', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/inbound/attention',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json().catch(() => ({}))) as {
        sourceMessageId?: unknown;
        reason?: unknown;
      };
      const sourceMessageId =
        typeof body.sourceMessageId === 'string' ? body.sourceMessageId.trim() : '';
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!sourceMessageId) {
        return { status: 400, jsonBody: { error: 'sourceMessageId is required' } };
      }
      if (!ATTENTION_REASONS.has(reason)) {
        return { status: 400, jsonBody: { error: 'reason must be a known attention reason' } };
      }
      if (!(await hasColumn('inbound_email', 'attention_reason'))) {
        ctx.log(JSON.stringify({ evt: 'inboundAttention', stamped: false, reason: 'column_absent' }));
        return { status: 200, jsonBody: { stamped: false, detail: 'column_absent' } };
      }
      const rows = await query<Row>(
        `UPDATE inbound_email SET attention_reason = $2, updated_at = now()
          WHERE source_message_id = $1 RETURNING id`,
        [sourceMessageId, reason],
      );
      ctx.log(JSON.stringify({ evt: 'inboundAttention', stamped: Boolean(rows[0]), reason }));
      return { status: 200, jsonBody: { stamped: Boolean(rows[0]) } };
    }),
});

/**
 * Update image metadata on an ALREADY-persisted evidence row (the seam that lets the
 * image-extraction worker enrich an attachment that intake created without it). Only the
 * fields the caller actually supplied are written (so an intake row's defaults are never
 * clobbered). excluded + exclusion_reason move together (the schema CHECK requires a reason
 * when excluded). A database failure escapes so the surrounding evidence/status transaction
 * rolls back and the durable caller can retry. Returns the number of rows updated.
 * `whereClause` keys on $1..$N from `whereVals`.
 */
async function applyEvidenceMetadata(
  _ctx: InvocationContext,
  whereClause: string,
  whereVals: unknown[],
  row: {
    imageRole?: string;
    imageRoleCode?: number;
    registrationVisible?: boolean;
    acceptedForEva?: boolean;
    excluded?: boolean;
    exclusionReason?: string | null;
    decisionSource?: 'classifier';
    personReflection?: boolean;
    sha256?: string;
    sequenceIndex?: number;
  },
  computed: {
    imageRoleCode: number;
    registrationVisible: boolean | null;
    excluded: boolean;
    exclusionReason: string | null;
    sha256: string | null;
    sequenceIndex: number | null;
  },
  q: TxQuery = query,
): Promise<{ updated: number; readinessChanged: boolean }> {
  const changedIds = new Set<string>();
  let readinessChanged = false;

  // Autonomous image decisions are compare-and-set per field. A classifier may fill
  // an unowned field or revise its own result, but never overwrite staff/provider/
  // cleanup/legacy ownership. An omitted decisionSource is deliberately NOT granted
  // classifier authority during a rolling deployment.
  const ownedSets: string[] = [];
  const ownedChanges: string[] = [];
  const ownedVals: unknown[] = [...whereVals];
  const pushOwned = (column: string, sourceColumn: string, value: unknown): void => {
    ownedVals.push(value);
    const p = `$${ownedVals.length}`;
    const allowed = `(${sourceColumn} IS NULL OR ${sourceColumn} = 'classifier')`;
    ownedSets.push(
      `${column} = CASE WHEN ${allowed} THEN ${p} ELSE ${column} END`,
      `${sourceColumn} = CASE WHEN ${allowed} THEN 'classifier' ELSE ${sourceColumn} END`,
    );
    ownedChanges.push(
      `(${allowed} AND (${column} IS DISTINCT FROM ${p} OR ${sourceColumn} IS DISTINCT FROM 'classifier'))`,
    );
  };

  if (row.decisionSource === 'classifier' && (row.imageRoleCode != null || row.imageRole != null)) {
    pushOwned('image_role_code', 'image_role_source', computed.imageRoleCode);
  }
  if (row.decisionSource === 'classifier' && typeof row.registrationVisible === 'boolean') {
    pushOwned('registration_visible', 'registration_visible_source', computed.registrationVisible);
  }
  if (row.decisionSource === 'classifier' && typeof row.acceptedForEva === 'boolean') {
    pushOwned('accepted_for_eva', 'accepted_for_eva_source', row.acceptedForEva);
  }
  const legacyExplicitExclusion = row.decisionSource == null && row.excluded === true;
  if ((row.decisionSource === 'classifier' || legacyExplicitExclusion) && row.excluded != null) {
    ownedVals.push(computed.excluded, computed.exclusionReason);
    const excludedP = `$${ownedVals.length - 1}`;
    const reasonP = `$${ownedVals.length}`;
    const allowed = `(
      (exclusion_decision_source IS NULL OR exclusion_decision_source = 'classifier')
      AND (
        NOT ${excludedP}
        OR archive_mirror_claim_token IS NULL
        OR archive_mirror_claim_expires_at <= now()
      )
    )`;
    ownedSets.push(
      `excluded = CASE WHEN ${allowed} THEN ${excludedP} ELSE excluded END`,
      `exclusion_reason = CASE WHEN ${allowed} THEN ${reasonP} ELSE exclusion_reason END`,
      `exclusion_decision_source = CASE WHEN ${allowed} THEN 'classifier' ELSE exclusion_decision_source END`,
      `archive_mirror_decision_generation = archive_mirror_decision_generation +
        CASE WHEN ${allowed} AND excluded IS DISTINCT FROM ${excludedP} THEN 1 ELSE 0 END`,
    );
    ownedChanges.push(
      `(${allowed} AND (excluded IS DISTINCT FROM ${excludedP} OR exclusion_reason IS DISTINCT FROM ${reasonP} OR exclusion_decision_source IS DISTINCT FROM 'classifier'))`,
    );
  }

  if (ownedSets.length > 0) {
    const res = await q<ArchiveMirrorCandidate>(
      `UPDATE evidence
            SET ${ownedSets.join(', ')}, updated_at = now()
          WHERE ${whereClause}
            AND (${ownedChanges.join(' OR ')})
          RETURNING id, case_id, excluded, storage_path, box_file_id`,
      ownedVals,
    );
    for (const item of res) changedIds.add(item.id);
    if (row.decisionSource === 'classifier' && row.excluded === false) {
      for (const item of res) await requestArchiveMirrorIfEligible(q, item);
    }
    readinessChanged = res.length > 0;
  }

  const simpleSets: string[] = [];
  const simpleChanges: string[] = [];
  const simpleVals: unknown[] = [...whereVals];
  const pushSimple = (column: string, value: unknown): void => {
    simpleVals.push(value);
    const p = `$${simpleVals.length}`;
    simpleSets.push(`${column} = ${p}`);
    simpleChanges.push(`${column} IS DISTINCT FROM ${p}`);
  };
  if (typeof row.personReflection === 'boolean') pushSimple('person_reflection', row.personReflection);
  if (row.excluded == null && typeof row.exclusionReason === 'string' && row.exclusionReason.trim()) {
    pushSimple('exclusion_reason', row.exclusionReason.trim());
  }
  if (row.sha256 != null) pushSimple('sha256', computed.sha256);
  if (row.sequenceIndex != null) pushSimple('sequence_index', computed.sequenceIndex);

  if (simpleSets.length > 0) {
    const res = await q<{ id: string }>(
      `UPDATE evidence
            SET ${simpleSets.join(', ')}, updated_at = now()
          WHERE ${whereClause}
            AND (${simpleChanges.join(' OR ')})
          RETURNING id`,
      simpleVals,
    );
    for (const item of res) changedIds.add(item.id);
  }
  return { updated: changedIds.size, readinessChanged };
}

/* ============================================================
   4 — POST /api/internal/cases/{id}/evidence
   Called by: orchestration classifyPersist activity (plan 22 §B §A3) AND the
   box-webhook Function (FILE.UPLOADED → one Box evidence row).
   Body: { rows: Array<EvidenceDescriptor-ish row> } where each row is either:
     - an EMAIL/ORCHESTRATION row: { ...descriptor, blobPath, size } — bytes live
       in Blob, deduped idempotently on (case_id, storage_path);
     - a BOX row: { filename, evidenceClass, sourceMessageId:'box:file:<id>',
       boxFileId, boxFileUrl?, acceptedForEva?, sourceLabel? } — storage_path
       stays BLANK (the bytes are mirrored to Blob later, not here), deduped
       idempotently on (case_id, source_message_id) which is the durable
       box:file:<id> tag (box_file_id is a correlation/UI mirror, not the key).
   The two dedup keys never collide: an email row has no sourceMessageId/boxFileId
   and a Box row has no blobPath. Re-running either is idempotent (NOT EXISTS
   guard), so an at-least-once retry updates nothing rather than duplicating.

   TKT-133 — sha256 write-time dedup/LINK (runs BEFORE either lane INSERT, when the
   caller supplies a plausible sha256): the SAME photo arriving via the email lane
   AND its Box FILE.UPLOADED mirror used to yield TWO rows (the per-lane keys never
   collide by design). Now a same-case (case_id + sha256 — NEVER across cases)
   content twin is LINKED instead of duplicated: the incoming arrival's missing
   provenance (box_file_id/box_file_url for a Box arrival onto an email-first row;
   storage_path for an email arrival onto a Box-first row) is filled onto the
   EXISTING row (source_message_id is left alone — it is the existing lane's
   identity) and the row counts under `merged` in the response. A retry of the SAME
   identity (same box:file tag / same storage_path) deliberately falls through to
   the unchanged lane logic (NOT EXISTS no-op + metadata update-in-place). Rows
   without a sha256 behave exactly as before.
   ============================================================ */

/** A plausible sha256 hex digest — the only shape the TKT-133 dedup pass keys on. */
const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;
app.http('internalCasesEvidence', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/evidence',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      const body = (await req.json()) as {
        expectedInboundEmailId?: unknown;
        evidenceBackfillGeneration?: unknown;
        evidenceBackfillOutcome?: unknown;
        evidenceBackfillFailedAttachments?: unknown;
        evidenceBackfillDetail?: unknown;
        rows: Array<
          Partial<EvidenceDescriptor> & {
            filename: string;
            blobPath?: string;
            size?: number;
            sourceMessageId?: string;
            boxFileId?: string;
            boxFileUrl?: string;
            sourceLabel?: string;
            acceptedForEva?: boolean;
            // Image metadata — the SEAM the image-extraction worker writes (work-todo-spike:
            // pdf-image-extraction). Accept either the imageRole NAME or imageRoleCode int.
            imageRole?: string;
            imageRoleCode?: number;
            registrationVisible?: boolean;
            excluded?: boolean;
            exclusionReason?: string | null;
            /** Autonomous evidence decisions are owned by the classifier. Omitted is
             *  accepted temporarily so orchestration and API can roll independently. */
            decisionSource?: 'classifier';
            /** TKT-123: the vision classifier saw a person's reflection (advisory flag). */
            personReflection?: boolean;
            sha256?: string;
            sequenceIndex?: number;
          }
        >;
      };
      if (
        !Array.isArray(body.rows) ||
        body.rows.some(
          (row) => row.decisionSource != null && row.decisionSource !== 'classifier',
        )
      ) {
        return { status: 400, jsonBody: { error: 'unsupported evidence decision source' } };
      }

      const persistRows = async (
        q: TxQuery,
        persistCaseId: string,
      ): Promise<{ persisted: number; updated: number; merged: number; statusGeneration?: number }> => {
      let persisted = 0;
      let updated = 0;
      let merged = 0; // TKT-133: sha256 content twins linked onto an existing row instead of inserted
      let readinessChanged = false;
      for (const row of body.rows ?? []) {
        // TKT-124 kind guard: the box-webhook historically hardcoded
        // evidenceClass='image' for EVERY FILE.UPLOADED row, so PDFs/.doc/.eml/
        // .mp4 landed as image-kind and leaked into the photo orderer + EVA
        // export. When a caller claims 'image', re-derive through the shared
        // domain classifier (extension-primary, MIME fallback — the SAME table
        // intake uses) and trust the derivation. Explicit non-image classes
        // (instruction/email/engineer_report/other) are honoured as supplied.
        let suppliedClass =
          (row.evidenceClass as 'image' | 'instruction' | 'email' | 'other' | 'engineer_report') ??
          'other';
        if (suppliedClass === 'image') {
          const derived = describeEvidence(row.filename, row.contentType).evidenceClass;
          // An honest image/* MIME keeps the row an image even when the extension
          // is outside the core table (e.g. image/tiff) — the guard only corrects
          // rows whose name AND type both say "not a photo".
          const mimeIsImage = (row.contentType ?? '').toLowerCase().startsWith('image/');
          suppliedClass = derived === 'image' || mimeIsImage ? 'image' : derived;
        }
        const kindCode = evidenceKindCodec.toInt(suppliedClass) ?? null;

        // ---- image metadata (defaults match the schema: image_role_code NOT NULL DEFAULT
        // unknown(100000003); excluded NOT NULL DEFAULT false; exclusion_reason required when
        // excluded). Computed once; used for both INSERT and the existing-row UPDATE. ----
        const imageRoleCode =
          (typeof row.imageRoleCode === 'number' ? row.imageRoleCode : undefined) ??
          imageRoleCodec.toInt(row.imageRole as ImageRole | undefined) ??
          100000003;
        const registrationVisible =
          typeof row.registrationVisible === 'boolean' ? row.registrationVisible : null;
        const excluded = row.excluded === true;
        const exclusionReason = excluded
          ? (row.exclusionReason ?? '').trim() || 'Excluded' // schema CHECK: required when excluded
          : (row.exclusionReason ?? '').trim() || null;
        const personReflection = row.personReflection === true;
        const sha256 = (row.sha256 ?? '').trim() || null;
        const sequenceIndex = Number.isInteger(row.sequenceIndex)
          ? (row.sequenceIndex as number)
          : null;
        // Did the caller actually supply any image metadata (vs an intake row that has none)?
        const hasMetadata =
          row.imageRoleCode != null ||
          row.imageRole != null ||
          typeof row.registrationVisible === 'boolean' ||
          typeof row.acceptedForEva === 'boolean' ||
          row.excluded != null ||
          row.exclusionReason != null ||
          row.personReflection != null ||
          row.sha256 != null ||
          row.sequenceIndex != null;
        const hasReadinessMetadata =
          row.imageRoleCode != null ||
          row.imageRole != null ||
          typeof row.registrationVisible === 'boolean' ||
          typeof row.acceptedForEva === 'boolean' ||
          typeof row.excluded === 'boolean';
        const decisionSource = row.decisionSource === 'classifier' ? 'classifier' : null;
        // Older orchestration writers omitted decisionSource. An explicit exclusion
        // from that writer still needs visible autonomous ownership so staff can review
        // and reverse it; omitted non-exclusion fields remain deliberately unowned.
        const insertionExclusionDecisionSource =
          typeof row.excluded === 'boolean' && row.excluded
            ? (decisionSource ?? 'classifier')
            : decisionSource;

        const sourceMessageId = (row.sourceMessageId ?? '').trim() || null;
        const boxFileId = (row.boxFileId ?? '').trim() || null;
        const isBoxRow = sourceMessageId != null || boxFileId != null;

        // ---- TKT-133: sha256 write-time dedup/link — an ADDITIONAL check BEFORE the
        // lane INSERTs (all existing per-lane NOT EXISTS dedup below is unchanged).
        // Keyed STRICTLY on (case_id, sha256): identical bytes on a DIFFERENT case are
        // never deduped. Only runs when the caller supplied a plausible 64-hex sha256;
        // rows without one take exactly the pre-TKT-133 path.
        if (sha256 && SHA256_HEX_RE.test(sha256)) {
          const twin = await q<{
            id: string;
            box_file_id: string | null;
            box_file_url: string | null;
            storage_path: string | null;
            source_message_id: string | null;
          }>(
            `SELECT id, box_file_id, box_file_url, storage_path, source_message_id
               FROM evidence WHERE case_id = $1 AND sha256 = $2 LIMIT 1`,
            [persistCaseId, sha256],
          );
          const ex = twin[0];
          if (ex) {
            const sameIdentity = isBoxRow
              ? (boxFileId != null && ex.box_file_id === boxFileId) ||
                (sourceMessageId != null && ex.source_message_id === sourceMessageId)
              : row.blobPath != null && ex.storage_path === row.blobPath;
            // A content twin on the SAME case (same sha256) must NEVER produce a second row —
            // whether it's a cross-lane mirror (!sameIdentity) or an exact at-least-once retry
            // (sameIdentity, e.g. a Box FILE.UPLOADED redelivery landing on a row already merged
            // by box_file_id whose source_message_id was deliberately left NULL). BOTH branches
            // absorb any new image metadata in place against the twin's real id and `continue`.
            // Previously a sameIdentity twin fell through to the lane INSERT, trusting its
            // single-column NOT EXISTS to no-op — but a redelivery keyed on the column the merge
            // left NULL slipped through and duplicated the row for the same Box file/hash. (PR52-F1)
            //
            // Metadata absorb is gated on fields BEYOND sha256 itself (the twin's sha256 already
            // matches by definition — re-writing it alone would be a pointless UPDATE).
            const hasMergeMetadata =
              row.imageRoleCode != null ||
              row.imageRole != null ||
              typeof row.registrationVisible === 'boolean' ||
              typeof row.acceptedForEva === 'boolean' ||
              row.excluded != null ||
              row.exclusionReason != null ||
              row.personReflection != null ||
              row.sequenceIndex != null;
            if (!sameIdentity) {
              // A genuine cross-lane content twin for the SAME case: LINK provenance onto the
              // existing row, never insert a duplicate.
              if (isBoxRow && ex.box_file_id == null && boxFileId != null) {
                // Box mirror of an email-first row → fill the Box provenance. The existing
                // row's source_message_id is ITS lane's identity — deliberately left alone.
                await q(
                  `UPDATE evidence
                      SET box_file_id = $2,
                          box_file_url = COALESCE($3, box_file_url),
                          updated_at = now()
                    WHERE id = $1 AND box_file_id IS NULL`,
                  [ex.id, boxFileId, (row.boxFileUrl ?? '').trim() || null],
                );
              } else if (!isBoxRow && ex.storage_path == null && row.blobPath) {
                // Email/blob arrival of a Box-first row → fill the blob provenance.
                await q(
                  `UPDATE evidence
                      SET storage_path = $2::text, updated_at = now()
                    WHERE id = $1 AND storage_path IS NULL`,
                  [ex.id, row.blobPath],
                );
              }
              if (hasMergeMetadata) {
                const applied = await applyEvidenceMetadata(ctx, 'id = $1', [ex.id], row, {
                  imageRoleCode,
                  registrationVisible,
                  excluded,
                  exclusionReason,
                  sha256,
                  sequenceIndex,
                }, q);
                updated += applied.updated;
                readinessChanged ||= applied.readinessChanged;
              }
              merged++;
              continue; // never insert a same-case content twin (cross-lane mirror)
            }
            // sameIdentity: an exact at-least-once retry / Box redelivery of a row that already
            // exists on this case. Absorb any new metadata in place and stop — do NOT fall
            // through to the lane INSERT (whose single-column NOT EXISTS can miss a merged row).
            if (hasMergeMetadata) {
              const applied = await applyEvidenceMetadata(ctx, 'id = $1', [ex.id], row, {
                imageRoleCode,
                registrationVisible,
                excluded,
                exclusionReason,
                sha256,
                sequenceIndex,
              }, q);
              updated += applied.updated;
              readinessChanged ||= applied.readinessChanged;
            }
            continue; // idempotent: the identical row already exists on this case
          }
        }

        let inserted = false;
        if (isBoxRow) {
          // Box upload: storage_path stays NULL (bytes mirror to Blob later); dedup
          // on the durable box:file:<id> tag in source_message_id (fall back to
          // box_file_id only if the tag is absent).
          const dedupCol = sourceMessageId != null ? 'source_message_id' : 'box_file_id';
          const dedupVal = sourceMessageId ?? boxFileId;
          const result = await q<{ id: string }>(
            `INSERT INTO evidence
               (file_name, case_id, kind_code, content_type, size_bytes,
                source_message_id, box_file_id, box_file_url, accepted_for_eva, source_label,
                image_role_code, registration_visible, excluded, exclusion_reason, person_reflection, sha256, sequence_index,
                image_role_source, registration_visible_source, accepted_for_eva_source, exclusion_decision_source)
             SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                    $18, $19, $20, $21
             WHERE NOT EXISTS (
               SELECT 1 FROM evidence WHERE case_id = $2 AND ${dedupCol} = $22
             )
             RETURNING id`,
            [
              row.filename,
              persistCaseId,
              kindCode,
              row.contentType || null,
              row.size ?? null,
              sourceMessageId,
              boxFileId,
              (row.boxFileUrl ?? '').trim() || null,
              row.acceptedForEva ?? true,
              (row.sourceLabel ?? '').trim() || 'box_upload',
              imageRoleCode,
              registrationVisible,
              excluded,
              exclusionReason,
              personReflection,
              sha256,
              sequenceIndex,
              row.imageRoleCode != null || row.imageRole != null ? decisionSource : null,
              typeof row.registrationVisible === 'boolean' ? decisionSource : null,
              typeof row.acceptedForEva === 'boolean' ? decisionSource : null,
              typeof row.excluded === 'boolean' ? insertionExclusionDecisionSource : null,
              dedupVal,
            ],
          );
          inserted = result.length > 0;
          // Existing Box row + new metadata (e.g. OCR ran after the upload) -> update in place.
          if (!inserted && hasMetadata) {
            const applied = await applyEvidenceMetadata(
              ctx,
              `case_id = $1 AND ${dedupCol} = $2`,
              [persistCaseId, dedupVal],
              row,
              { imageRoleCode, registrationVisible, excluded, exclusionReason, sha256, sequenceIndex },
              q,
            );
            updated += applied.updated;
            readinessChanged ||= applied.readinessChanged;
          }
        } else {
          // Email/orchestration: idempotent on (case_id, storage_path).
          const acceptedForEva = row.acceptedForEva ?? true;
          const result = await q<{ id: string }>(
            `INSERT INTO evidence
               (file_name, case_id, kind_code, content_type, size_bytes, storage_path, source_label,
                accepted_for_eva,
                image_role_code, registration_visible, excluded, exclusion_reason, person_reflection, sha256, sequence_index,
                image_role_source, registration_visible_source, accepted_for_eva_source, exclusion_decision_source)
             SELECT $1, $2, $3, $4, $5, $6::text, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                    $16, $17, $18, $19
             WHERE NOT EXISTS (
               SELECT 1 FROM evidence WHERE case_id = $2 AND storage_path = $6::text
             )
             RETURNING id`,
            [
              row.filename,
              persistCaseId,
              kindCode,
              row.contentType || null,
              row.size ?? null,
              row.blobPath ?? null,
              (row.sourceLabel ?? '').trim() || 'auto-intake',
              acceptedForEva,
              imageRoleCode,
              registrationVisible,
              excluded,
              exclusionReason,
              personReflection,
              sha256,
              sequenceIndex,
              row.imageRoleCode != null || row.imageRole != null ? decisionSource : null,
              typeof row.registrationVisible === 'boolean' ? decisionSource : null,
              typeof row.acceptedForEva === 'boolean' ? decisionSource : null,
              typeof row.excluded === 'boolean' ? insertionExclusionDecisionSource : null,
            ],
          );
          inserted = result.length > 0;
          // Existing intake row + new image metadata -> update it in place (the seam that
          // lets the image-extraction worker enrich an already-persisted attachment).
          if (!inserted && hasMetadata && row.blobPath) {
            const applied = await applyEvidenceMetadata(
              ctx,
              'case_id = $1 AND storage_path = $2::text',
              [persistCaseId, row.blobPath],
              row,
              { imageRoleCode, registrationVisible, excluded, exclusionReason, sha256, sequenceIndex },
              q,
            );
            updated += applied.updated;
            readinessChanged ||= applied.readinessChanged;
          }
        }
        if (inserted) {
          persisted++;
          // Any newly committed evidence row can change status inputs: images affect
          // accepted-photo readiness and instruction rows affect the no-evidence branch.
          // Request durable recompute work in this SAME transaction even when an image
          // classifier did not supply metadata.
          readinessChanged = true;
          if (
            suppliedClass === 'image' &&
            hasReadinessMetadata &&
            row.decisionSource === 'classifier'
          ) readinessChanged = true;
        }
      }

      const statusGeneration = readinessChanged
        ? await requestStatusRecompute(q, persistCaseId)
        : undefined;

      return {
        persisted,
        updated,
        merged,
        ...(statusGeneration == null ? {} : { statusGeneration }),
      };
      };

      const expectedInboundEmailId = typeof body.expectedInboundEmailId === 'string'
        ? body.expectedInboundEmailId.trim()
        : '';
      if (expectedInboundEmailId) {
        const suppliedBackfillGeneration = body.evidenceBackfillGeneration == null
          ? null
          : Number(body.evidenceBackfillGeneration);
        if (
          suppliedBackfillGeneration != null &&
          (!Number.isSafeInteger(suppliedBackfillGeneration) || suppliedBackfillGeneration < 1)
        ) {
          return { status: 400, jsonBody: { error: 'evidenceBackfillGeneration must be a positive integer' } };
        }
        const suppliedBackfillOutcome = body.evidenceBackfillOutcome;
        if (
          suppliedBackfillGeneration != null &&
          suppliedBackfillOutcome !== 'completed' &&
          suppliedBackfillOutcome !== 'partial'
        ) {
          return {
            status: 400,
            jsonBody: { error: "evidenceBackfillOutcome must be 'completed' or 'partial'" },
          };
        }
        const backfillOutcome: EvidenceBackfillCommittedOutcome = suppliedBackfillOutcome === 'partial'
          ? 'partial'
          : 'completed';
        const backfillFailedAttachments = typeof body.evidenceBackfillFailedAttachments === 'number'
          ? Math.max(0, Math.trunc(body.evidenceBackfillFailedAttachments))
          : undefined;
        const backfillDetail = typeof body.evidenceBackfillDetail === 'string' && body.evidenceBackfillDetail.trim()
          ? body.evidenceBackfillDetail.slice(0, 300)
          : undefined;
        const guarded = await withResolvedEvidenceBackfillTarget(
          expectedInboundEmailId,
          caseId,
          async (q, resolvedCaseId) => {
            // Validation/classification happens before this persistence transaction.
            // If a merge redirected ownership in that window, the rows carry the old
            // case's provider policy/VRM decisions. Reject WITHOUT mutating so the queue
            // retries from validation and reclassifies against the survivor.
            if (resolvedCaseId.trim().toLowerCase() !== caseId.trim().toLowerCase()) {
              return { kind: 'reclassification_required' as const };
            }
            // Rolling deployment compatibility: the old orchestration writer did not
            // know generations or the intended terminal outcome. Persist its rows using
            // the legacy guarded path, but do NOT guess "completed" or stamp a marker;
            // its subsequent legacy partial/completed report remains authoritative.
            if (suppliedBackfillGeneration == null) {
              return {
                kind: 'persisted' as const,
                value: await persistRows(q, resolvedCaseId),
              };
            }
            const progress = await q<{
              evidence_backfill_requested_generation: string | number;
              evidence_backfill_completed_generation: string | number;
              evidence_backfill_completed_result: unknown;
            }>(
              `SELECT evidence_backfill_requested_generation,
                      evidence_backfill_completed_generation,
                      evidence_backfill_completed_result
                 FROM inbound_email
                WHERE id = $1`,
              [expectedInboundEmailId],
            );
            const requestedGeneration = Number(
              progress[0]?.evidence_backfill_requested_generation ?? suppliedBackfillGeneration ?? 1,
            );
            const completedGeneration = Number(
              progress[0]?.evidence_backfill_completed_generation ?? 0,
            );
            const backfillGeneration = suppliedBackfillGeneration ?? requestedGeneration;
            if (backfillGeneration < 1 || backfillGeneration > requestedGeneration) {
              return {
                kind: 'generation_mismatch' as const,
                requestedGeneration,
              };
            }
            if (completedGeneration >= backfillGeneration) {
              const completedResult = parseEvidenceBackfillCommittedResult(
                progress[0]?.evidence_backfill_completed_result,
              );
              if (suppliedBackfillGeneration != null && !completedResult) {
                throw new Error('evidence backfill completion marker has no durable result');
              }
              return {
                kind: 'persisted' as const,
                value: {
                  persisted: completedResult?.persisted ?? 0,
                  updated: 0,
                  merged: completedResult?.merged ?? 0,
                  backfillGeneration,
                  alreadyCompleted: true,
                  ...(completedResult ? { completedResult } : {}),
                },
              };
            }
            const value = await persistRows(q, resolvedCaseId);
            const completedResult: EvidenceBackfillCommittedResult = {
              outcome: backfillOutcome,
              persisted: value.persisted,
              merged: value.merged,
              ...(backfillFailedAttachments == null
                ? {}
                : { failedAttachments: backfillFailedAttachments }),
              ...(backfillDetail ? { detail: backfillDetail } : {}),
            };
            const marked = await q<{
              evidence_backfill_completed_generation: string | number;
              evidence_backfill_completed_result: unknown;
            }>(
              `UPDATE inbound_email
                  SET evidence_backfill_completed_generation = $2,
                      evidence_backfill_completed_result = $4::jsonb,
                      evidence_backfill_completed_at = now(),
                      updated_at = now()
                WHERE id = $1
                  AND case_id = $3
                  AND evidence_backfill_requested_generation = $2
                  AND evidence_backfill_completed_generation < $2
              RETURNING evidence_backfill_completed_generation,
                        evidence_backfill_completed_result`,
              [
                expectedInboundEmailId,
                backfillGeneration,
                resolvedCaseId,
                JSON.stringify(completedResult),
              ],
            );
            if (!marked[0]) {
              throw new Error('evidence backfill completion marker target disappeared');
            }
            return {
              kind: 'persisted' as const,
              value: {
                ...value,
                backfillGeneration,
                alreadyCompleted: false,
                completedResult,
              },
            };
          },
        );
        if (guarded.kind === 'stale') {
          return {
            status: 409,
            jsonBody: { error: 'evidence backfill target changed', code: 'evidence_backfill_target_changed' },
          };
        }
        if (guarded.value.kind === 'reclassification_required') {
          return {
            status: 409,
            jsonBody: {
              error: 'evidence backfill must be reclassified for the merged case',
              code: 'evidence_backfill_reclassification_required',
              targetCaseId: guarded.targetCaseId,
            },
          };
        }
        if (guarded.value.kind === 'generation_mismatch') {
          return {
            status: 409,
            jsonBody: {
              error: 'evidence backfill generation changed',
              code: 'evidence_backfill_generation_changed',
              requestedGeneration: guarded.value.requestedGeneration,
            },
          };
        }
        return {
          status: 200,
          jsonBody: { ...guarded.value.value, targetCaseId: guarded.targetCaseId },
        };
      }
      const result = await tx(async (q) => {
        const lockedCase = await lockCaseForMutation(q, caseId);
        if (lockedCase.kind !== 'active') return lockedCase;
        return { kind: 'persisted' as const, value: await persistRows(q, lockedCase.caseId) };
      });
      if (result.kind === 'missing') {
        return { status: 404, jsonBody: { error: 'case not found' } };
      }
      if (result.kind === 'retired') {
        return {
          status: 409,
          jsonBody: {
            error: 'case has been merged',
            code: 'case_merged',
            targetCaseId: result.mergedInto,
          },
        };
      }
      return { status: 200, jsonBody: result.value };
    }),
});

/* ============================================================
   5 — GET /api/internal/cases/{id}/archive-evidence
   Called by: orchestration boxArchiveEvidence activity.
   Returns persisted blob-backed evidence rows only, so archive mirroring follows
   the Data API's evidence truth instead of a stale in-memory intake envelope.

   TKT-089 (reopen): `excluded` rows are NEVER selected — a classifier-stamped
   non-vehicle crop, a person-reflection exclusion, or a staff/cleanup exclusion
   must not mirror into the Box case folder (ADR-0012 one-way mirror: copies
   already in Box stay, but no NEW excluded row goes over). Race-free by intake
   ordering: both persist lanes (classifyPersist + extractImages) stamp
   `excluded` in-memory BEFORE their persist call, and boxArchiveEvidence runs
   strictly after both in every orchestrator lane. A row whose classify FAILED
   persists un-excluded and stays mirror-eligible (deliberate fail-open — recall
   protection; there is no guaranteed later archive run per case, so skipping
   "still-unclassified" rows would strand genuine photos out of the archive).
   Deliberately NOT role-aware: a non-vehicle "other" classification is stored
   as role `unknown` (no choice-set row), which is indistinguishable from
   not-yet-classified — filtering on it would strand real photos after any
   transient classify failure. `excluded` is the one deliberate, auditable,
   staff-reversible discriminator (un-excluding a row makes the next archive
   run pick it up).
   ============================================================ */
app.http('internalCasesArchiveEvidence', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/archive-evidence',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      if (!caseId) return { status: 400, jsonBody: { error: 'caseId required' } };

      const result = await tx(async (q) => {
        const lockedCase = await lockCaseForMutation(q, caseId);
        if (lockedCase.kind !== 'active') return { kind: lockedCase.kind as 'missing' | 'retired' };
        const rows = await q<{
        id: string;
        filename: string;
        contentType: string | null;
        blobPath: string;
        claimToken: string;
        decisionGeneration: string | number;
      }>(
          `UPDATE evidence
              SET archive_mirror_claim_token = gen_random_uuid(),
                  archive_mirror_claimed_at = now(),
                  archive_mirror_claim_expires_at = now() + interval '30 minutes',
                  updated_at = now()
            WHERE case_id = $1
              AND storage_path IS NOT NULL
              AND box_file_id IS NULL
              AND excluded = false
              AND (
                archive_mirror_claim_token IS NULL
                OR archive_mirror_claim_expires_at <= now()
              )
          RETURNING id,
                    file_name AS filename,
                    content_type AS "contentType",
                    storage_path AS "blobPath",
                    archive_mirror_claim_token::text AS "claimToken",
                    archive_mirror_decision_generation AS "decisionGeneration"`,
          [lockedCase.caseId],
        );
        rows.sort((a, b) => a.filename.localeCompare(b.filename));
        return { kind: 'claimed' as const, rows };
      });

      return { status: 200, jsonBody: { rows: result.kind === 'claimed' ? result.rows : [] } };
    }),
});

/* ============================================================
   5b — POST /api/internal/cases/{id}/archive-evidence/stamp
   Called by: orchestration boxArchiveEvidence activity after a successful
   archive upload. Stamps the evidence row with the archive file id/link so
   purge eligibility and evidence UI state are driven from stored metadata.
   ============================================================ */
app.http('internalCasesArchiveEvidenceStamp', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/archive-evidence/stamp',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      if (!caseId) return { status: 400, jsonBody: { error: 'caseId required' } };
      const body = (await req.json()) as {
        evidenceId?: unknown;
        blobPath?: unknown;
        boxFileId?: unknown;
        boxFileUrl?: unknown;
        claimToken?: unknown;
        decisionGeneration?: unknown;
      };
      const evidenceId = typeof body.evidenceId === 'string' ? body.evidenceId.trim() : '';
      const blobPath = typeof body.blobPath === 'string' ? body.blobPath.trim() : '';
      const boxFileId = typeof body.boxFileId === 'string' ? body.boxFileId.trim() : '';
      const boxFileUrl = typeof body.boxFileUrl === 'string' ? body.boxFileUrl.trim() : '';
      const claimToken = typeof body.claimToken === 'string' ? body.claimToken.trim() : '';
      const decisionGeneration = Number(body.decisionGeneration);
      if (
        !evidenceId || !blobPath || !boxFileId || !claimToken ||
        !Number.isSafeInteger(decisionGeneration) || decisionGeneration < 0
      ) {
        return {
          status: 400,
          jsonBody: {
            error: 'evidenceId, blobPath, boxFileId, claimToken and decisionGeneration required',
          },
        };
      }

      const result = await tx(async (q) => {
        const lockedCase = await lockCaseForMutation(q, caseId);
        if (lockedCase.kind !== 'active') return { kind: lockedCase.kind as 'missing' | 'retired' };
        const updated = await q<{ id: string }>(
          `UPDATE evidence
              SET box_file_id = $4,
                  box_file_url = COALESCE($5, box_file_url),
                  archive_mirror_claim_token = NULL,
                  archive_mirror_claimed_at = NULL,
                  archive_mirror_claim_expires_at = NULL,
                  updated_at = now()
            WHERE case_id = $1
              AND id = $2
              AND storage_path = $3
              AND excluded = false
              AND archive_mirror_claim_token = $6::uuid
              AND archive_mirror_claim_expires_at > now()
              AND archive_mirror_decision_generation = $7
            RETURNING id`,
          [
            lockedCase.caseId,
            evidenceId,
            blobPath,
            boxFileId,
            boxFileUrl || null,
            claimToken,
            decisionGeneration,
          ],
        );
        return { kind: 'updated' as const, updated: updated.length > 0 };
      });
      return { status: 200, jsonBody: { updated: result.kind === 'updated' && result.updated } };
    }),
});

/* ============================================================
   6 — POST /api/internal/cases/{id}/status-evaluate
   Called by: orchestration statusEvaluate activity (plan 22 §B §A5).
   Recomputes EVA-readiness + status machine and persists when changed.
   ============================================================ */
app.http('internalCasesStatusEvaluate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/status-evaluate',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      const body = (await req.json().catch(() => ({}))) as { generation?: unknown };
      const generation = body.generation == null ? undefined : Number(body.generation);
      if (
        generation != null &&
        (!Number.isSafeInteger(generation) || generation < 1)
      ) {
        return { status: 400, jsonBody: { error: 'generation must be a positive integer' } };
      }
      const result = await recomputeStatus(caseId, generation);
      return {
        status: 200,
        jsonBody: {
          value: result.value,
          ...(result.completed == null ? {} : { completed: result.completed }),
          ...(result.pending == null ? {} : { pending: result.pending }),
        },
      };
    }),
});

app.http('internalCasesArchiveEvidenceRelease', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/archive-evidence/release',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      const body = (await req.json().catch(() => ({}))) as {
        evidenceId?: unknown;
        claimToken?: unknown;
      };
      const evidenceId = typeof body.evidenceId === 'string' ? body.evidenceId.trim() : '';
      const claimToken = typeof body.claimToken === 'string' ? body.claimToken.trim() : '';
      if (!caseId || !evidenceId || !claimToken) {
        return { status: 400, jsonBody: { error: 'caseId, evidenceId and claimToken required' } };
      }
      const released = await tx(async (q) => {
        const lockedCase = await lockCaseForMutation(q, caseId);
        if (lockedCase.kind !== 'active') return false;
        const rows = await q<{ id: string }>(
          `UPDATE evidence
              SET archive_mirror_claim_token = NULL,
                  archive_mirror_claimed_at = NULL,
                  archive_mirror_claim_expires_at = NULL,
                  updated_at = now()
            WHERE id = $1
              AND case_id = $2
              AND archive_mirror_claim_token = $3::uuid
            RETURNING id`,
          [evidenceId, lockedCase.caseId, claimToken],
        );
        return rows.length > 0;
      });
      return { status: 200, jsonBody: { released } };
    }),
});

/* ============================================================
   6b — POST /api/internal/cases/{id}/set-ingested
   Called by: orchestration setIngested activity (TKT-027).
   Transitions new_email → ingested when the intake pipeline picks up a case.
   Idempotent: no-op when status is already past new_email.
   ============================================================ */
app.http('internalCasesSetIngested', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/set-ingested',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      const ingestedCode = statusToInt('ingested');
      const newEmailCode = statusToInt('new_email');
      const updated = await query<{ id: string }>(
        `UPDATE case_ SET status_code = $1
         WHERE id = $2 AND status_code = $3
         RETURNING id`,
        [ingestedCode, caseId, newEmailCode],
      );
      if (updated.length > 0) {
        await writeAudit({
          action: AUDIT_ACTION.status_changed,
          caseId,
          summary: 'Status set to ingested (intake pipeline picked up)',
          after: { status: 'ingested' },
        });
      }
      return { status: 200, jsonBody: { updated: updated.length > 0 } };
    }),
});

/* ============================================================
   6c — POST /api/internal/cases/{id}/mark-done   (TKT-095 / ADR-0023)
   Called by: the `done` detectors — the box-webhook Function (a CE report PDF
   landed in the case's Box folder), the gated sent-email detector, and the
   gated EVA poll. Body: { signal: 'sent_email'|'box_pdf'|'eva_poll'|'manual',
   detail?: string }.
   Transitions eva_submitted → done ONLY (the WHERE guard): safe under Durable
   at-least-once, Box webhook re-delivery, and double-fires — a repeat is a
   no-op with no duplicate audit row. Never moves any other status.
   ============================================================ */
app.http('internalCasesMarkDone', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/mark-done',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      const body = (await req.json().catch(() => ({}))) as {
        signal?: string;
        detail?: string;
      };
      const signal = ['sent_email', 'box_pdf', 'eva_poll', 'manual'].includes(body.signal ?? '')
        ? (body.signal as string)
        : 'unknown';
      const updated = await tx((q) => markCaseDoneUsing(q, {
        caseId,
        signal,
        ...(body.detail ? { detail: String(body.detail) } : {}),
      }));
      return { status: 200, jsonBody: { updated } };
    }),
});

/* ============================================================
   6d — POST /api/internal/cases/lookup   (TKT-095 detector (a) / ADR-0023)
   Called by: the orchestration sent-items handler (gated dark behind
   DONE_SENT_EMAIL_ENABLED). READ-ONLY, STATUS-AGNOSTIC case lookup —
   deliberately unlike triage/context's openCaseMatches, which excludes
   terminals: the sent-email detector targets cases sitting in the TERMINAL
   `eva_submitted`, and it needs each candidate's work_provider_id to confirm
   the recipient really is that case's provider before marking done.
   Body: { caseIds?: string[], casePo?: string, vrm?: string } (any subset).
   Returns: { cases: [{ caseId, casePo, status, workProviderId, vrm }] }.
   ============================================================ */
app.http('internalCasesLookup', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/lookup',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json().catch(() => ({}))) as {
        caseIds?: string[];
        casePo?: string;
        vrm?: string;
      };
      const caseIds = (Array.isArray(body.caseIds) ? body.caseIds : [])
        .map((s) => String(s).trim())
        .filter(Boolean)
        .slice(0, 20);
      const casePo = (body.casePo ?? '').trim();
      const vrm = (body.vrm ?? '').trim();
      if (caseIds.length === 0 && !casePo && !vrm) {
        return { status: 200, jsonBody: { cases: [] } };
      }
      // id compared as text so a malformed caller id can never throw a uuid-cast
      // error; casePo matches case_po OR case_ref (the triage/context convention).
      const rows = await query<Row>(
        // The VRM arm canonicalises BOTH sides (strip spaces/punctuation): the caller passes a
        // compacted subject VRM (extractVrm -> "MX17PNL") but a stored registration may hold
        // spaces ("MX17 PNL"), so a verbatim upper() compare would miss it — the same fix the
        // search/assistant routes already use. (PR51-E2)
        `SELECT id, case_po, status_code, work_provider_id, vrm
           FROM case_
          WHERE (cardinality($1::text[]) > 0 AND id::text = ANY($1::text[]))
             OR ($2 <> '' AND (upper(case_po) = upper($2) OR upper(case_ref) = upper($2)))
             OR ($3 <> '' AND regexp_replace(upper(vrm), '[^A-Z0-9]', '', 'g') = regexp_replace(upper($3), '[^A-Z0-9]', '', 'g'))
          ORDER BY created_at DESC
          LIMIT 25`,
        [caseIds, casePo, vrm],
      );
      return {
        status: 200,
        jsonBody: {
          cases: rows.map((r) => ({
            caseId: r.id as string,
            casePo: (r.case_po as string | null) ?? '',
            status: caseStatusCodec.toName(r.status_code as number) ?? 'error',
            workProviderId: (r.work_provider_id as string | null) ?? '',
            vrm: (r.vrm as string | null) ?? '',
          })),
        },
      };
    }),
});

/* ============================================================
   6 — POST /api/internal/audit
   Called by: orchestration activities (providerMatch, classifyPersist,
   caseResolve, dispositionOne) after every significant event.
   Body: { action: string (name), caseId?, summary, severity?, before?, after? }
   The action is the NAME string (e.g. 'provider_matched'), looked up to an
   integer code via AUDIT_ACTION. Unknown names → info audit with the raw name.
   Always returns 204 — a failure must not block the calling activity.
   ============================================================ */
app.http('internalAudit', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/audit',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json()) as {
        action: string;
        caseId?: string;
        summary: string;
        severity?: 'info' | 'warning' | 'error';
        before?: unknown;
        after?: unknown;
      };

      const code = AUDIT_ACTION_BY_NAME[body.action] as number | undefined;
      await writeAudit({
        action: (code ?? AUDIT_ACTION.graph_message_ingested) as (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION],
        caseId: body.caseId,
        summary: body.summary,
        severity: body.severity ?? 'info',
        before: body.before,
        after: body.after,
      });

      return { status: 204 };
    }),
});

/* ============================================================
   7 — GET /api/internal/principals
   Called by: orchestration jobsheet-import fan-out (plan 22 §C).
   Returns: [{ principalCode }] for each active work provider — one
   fan-out branch per principal code.
   ============================================================ */
app.http('internalPrincipals', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/principals',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const rows = await query<Row>(
        'SELECT principal_code FROM work_provider WHERE active = true ORDER BY principal_code',
      );
      return {
        status: 200,
        jsonBody: rows.map((r) => ({ principalCode: r.principal_code as string })),
      };
    }),
});

/* ============================================================
   8 — GET /api/internal/disposition/due
   Called by: orchestration dispositionList activity (plan 22 §C case-disposition).
   Returns: [{ caseId }] for cases whose retention clock has expired and that are
   not under legal hold (ADR-0017, gated-off by CASE_DISPOSITION_ENABLED — the
   gate is checked in the calling activity, not here).
   ============================================================ */
app.http('internalDispositionDue', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/disposition/due',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const rows = await query<Row>(
        `SELECT id FROM case_
          WHERE retention_expires_at IS NOT NULL
            AND retention_expires_at < now()
            AND legal_hold IS NOT TRUE
          ORDER BY retention_expires_at
          LIMIT 500`,
      );
      return {
        status: 200,
        jsonBody: rows.map((r) => ({ caseId: r.id as string })),
      };
    }),
});

/* ============================================================
   9 — POST /api/internal/disposition/{id}
   Called by: orchestration dispositionOne activity (plan 22 §C).
   Anonymises the case: clears all PII fields and marks the case closed.
   Evidence rows are CASCADE-deleted via the FK when on-delete=cascade
   (or left — retention decision left to the operator per ADR-0017).
   Does NOT delete the case_ row here; a hard DELETE requires the DB
   admin role (RLS) and is an operator-gated step (docs/gated.md).
   ============================================================ */
app.http('internalDispositionCase', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/disposition/{id}',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;

      // Clear PII: all 12 EVA fields + overview fields + VRM.
      const evaCols = EVA_FIELD_ORDER.map((d) => `${EVA_COLUMN_BY_KEY[d.key]} = ''`).join(', ');
      await query(
        `UPDATE case_
            SET ${evaCols},
                vrm = '', case_ref = '', name = '[disposed]',
                ov_insured_name = NULL, ov_claimant_name = NULL,
                ov_third_party_name = NULL, ov_claim_number = NULL,
                ov_policy_reference = NULL, ov_incident_date = NULL,
                ov_insurer_name = NULL, ov_repairer_name = NULL,
                closed_at = now(), updated_at = now()
          WHERE id = $1`,
        [caseId],
      );

      await writeAudit({
        action: AUDIT_ACTION.case_disposed,
        caseId,
        summary: 'Retention disposition: PII fields cleared',
        severity: 'warning',
      });

      return { status: 204 };
    }),
});

/* ============================================================
   — GET /api/internal/box/case-by-folder/{folderId}
   Called by: the box-webhook Function (FILE.UPLOADED → resolve the case).
   Box folder id → case_.box_folder_id → the Case id. Returns { caseId: null }
   (200) when the folder resolves to no case — never guesses; the webhook then
   routes the upload to triage/Held.
   ============================================================ */
app.http('internalBoxCaseByFolder', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/box/case-by-folder/{folderId}',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const folderId = (req.params.folderId ?? '').trim();
      if (!folderId) return { status: 200, jsonBody: { caseId: null, casePo: null } };
      // casePo is ADDITIVE (TKT-095 detector (b)): the box-webhook report
      // classifier matches the upload filename against the case's Case/PO.
      // Pre-TKT-095 callers read caseId only and ignore the extra field.
      const rows = await query<Row>(
        'SELECT id, case_po FROM case_ WHERE box_folder_id = $1 LIMIT 1',
        [folderId],
      );
      const caseId = rows.length > 0 ? (rows[0].id as string) : null;
      const casePo = rows.length > 0 ? ((rows[0].case_po as string | null) ?? null) : null;
      return { status: 200, jsonBody: { caseId, casePo } };
    }),
});

/* ============================================================
   10 — GET /api/internal/box/purge-candidates
   Called by: orchestration boxPurgeList activity (plan 22 §C box-blob-purge).
   Returns: evidence rows where the bytes have been confirmed in Box
   (box_file_id IS NOT NULL) but the Azure Blob bytes have not yet been
   purged (storage_path IS NOT NULL). After purge the blob path is cleared
   by /api/internal/box/mark-purged.
   ============================================================ */
app.http('internalBoxPurgeCandidates', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/box/purge-candidates',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const rows = await query<Row>(
        `SELECT case_id, storage_path
           FROM evidence
          WHERE box_file_id IS NOT NULL
            AND storage_path IS NOT NULL
          ORDER BY created_at
          LIMIT 1000`,
      );
      return {
        status: 200,
        jsonBody: rows.map((r) => ({
          caseId: r.case_id as string,
          blobPath: r.storage_path as string,
        })),
      };
    }),
});

/* ============================================================
   11 — POST /api/internal/box/mark-purged
   Called by: orchestration boxPurgeOne activity after deleteEvidenceBytes succeeds.
   Clears storage_path on the matched evidence row so the row no longer appears
   in /api/internal/box/purge-candidates. Idempotent: clearing an already-null
   storage_path is a no-op.
   ============================================================ */
app.http('internalBoxMarkPurged', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/box/mark-purged',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json()) as { caseId: string; blobPath: string };
      await tx(async (q) => {
        const lockedCase = await lockCaseForMutation(q, body.caseId);
        if (lockedCase.kind !== 'active') return;
        await q(
          `UPDATE evidence
              SET storage_path = NULL, updated_at = now()
            WHERE case_id = $1 AND storage_path = $2`,
          [lockedCase.caseId, body.blobPath],
        );
      });
      return { status: 204 };
    }),
});

/* ============================================================
   11a — durable cleanup for failed staff-upload Blob owners (TKT-165)

   Each upload lease owns a claim-token-specific path before its Blob write. These routes
   let the wake-safe orchestration sweep claim and retire only paths whose owner
   is abandoned and which no evidence row references. Upload retries cannot
   reuse a cleanup-pending owner, and a reclaimed retry receives a new path, so a
   stale cleanup delete can never remove the winning generation's bytes.
   ============================================================ */
app.http('internalStaffUploadCleanupClaim', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/staff-upload-cleanup/claim',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const limitRaw = Number(req.query.get('limit') ?? '25');
      const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 25));
      const rows = await tx(async (q) => {
        // A process may have committed evidence but lost its response before marking
        // the owner. Reconcile that fact before considering any deletion.
        await q(
          `UPDATE staff_evidence_upload_item item
              SET state = 'complete', evidence_id = e.id,
                  upload_claim_token = NULL, upload_claim_expires_at = NULL,
                  cleanup_claim_token = NULL, cleanup_claim_expires_at = NULL,
                  cleanup_next_attempt_at = NULL, updated_at = now()
             FROM evidence e
            WHERE e.storage_path = item.blob_path
              AND item.state IN ('uploading', 'cleanup_pending')`,
        );
        // An expired request may have died while Azure was still finishing the
        // Block Blob commit. Revoke its owner now, but quarantine the path for a
        // further 15 minutes before making it deletable. Normal caught failures
        // are already cleanup_pending and can be retried immediately.
        await q(
          `UPDATE staff_evidence_upload_item item
              SET state = 'cleanup_pending',
                  upload_claim_token = NULL, upload_claim_expires_at = NULL,
                  cleanup_next_attempt_at = now() + interval '15 minutes',
                  cleanup_last_error = COALESCE(cleanup_last_error, 'upload lease expired'),
                  updated_at = now()
            WHERE item.state = 'uploading'
              AND (item.upload_claim_expires_at IS NULL OR item.upload_claim_expires_at <= now())
              AND NOT EXISTS (
                SELECT 1 FROM evidence e WHERE e.storage_path = item.blob_path
              )`,
        );
        return q<Row>(
          `WITH candidates AS (
             SELECT item.id
               FROM staff_evidence_upload_item item
              WHERE item.state = 'cleanup_pending'
                AND (item.cleanup_next_attempt_at IS NULL OR item.cleanup_next_attempt_at <= now())
                AND (item.cleanup_claim_expires_at IS NULL OR item.cleanup_claim_expires_at <= now())
                AND NOT EXISTS (
                  SELECT 1 FROM evidence e WHERE e.storage_path = item.blob_path
                )
              ORDER BY item.created_at, item.id
              LIMIT $1
              FOR UPDATE SKIP LOCKED
           )
           UPDATE staff_evidence_upload_item item
              SET state = 'cleanup_pending',
                  upload_claim_token = NULL, upload_claim_expires_at = NULL,
                  cleanup_claim_token = gen_random_uuid(),
                  cleanup_claim_expires_at = now() + interval '15 minutes',
                  cleanup_attempt_count = cleanup_attempt_count + 1,
                  updated_at = now()
             FROM candidates candidate
            WHERE item.id = candidate.id
        RETURNING item.id, item.blob_path, item.cleanup_claim_token,
                  item.cleanup_attempt_count`,
          [limit],
        );
      });
      return {
        status: 200,
        jsonBody: {
          rows: rows.map((row) => ({
            itemId: row.id as string,
            blobPath: row.blob_path as string,
            claimToken: row.cleanup_claim_token as string,
            attemptCount: Number(row.cleanup_attempt_count ?? 0),
          })),
        },
      };
    }),
});

app.http('internalStaffUploadCleanupComplete', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/staff-upload-cleanup/{id}/complete',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const itemId = (req.params.id ?? '').trim();
      const body = (await req.json()) as {
        claimToken?: string;
        outcome?: 'deleted' | 'missing' | 'failed';
        detail?: string;
      };
      const claimToken = (body.claimToken ?? '').trim();
      if (!itemId || !claimToken || !['deleted', 'missing', 'failed'].includes(body.outcome ?? '')) {
        return { status: 400, jsonBody: { error: 'cleanup claim and outcome are required' } };
      }
      const result = await tx(async (q) => {
        const items = await q<{ blob_path: string; cleanup_attempt_count: number }>(
          `SELECT blob_path, cleanup_attempt_count
             FROM staff_evidence_upload_item
            WHERE id = $1 AND state = 'cleanup_pending'
              AND cleanup_claim_token = $2::uuid
            FOR UPDATE`,
          [itemId, claimToken],
        );
        const item = items[0];
        if (!item) return { updated: false, stale: true };
        const linked = await q<{ id: string }>(
          `SELECT id FROM evidence WHERE storage_path = $1 ORDER BY created_at, id LIMIT 1 FOR UPDATE`,
          [item.blob_path],
        );
        if (linked[0]) {
          await q(
            `UPDATE staff_evidence_upload_item
                SET state = 'complete', evidence_id = $2,
                    cleanup_claim_token = NULL, cleanup_claim_expires_at = NULL,
                    cleanup_next_attempt_at = NULL, updated_at = now()
              WHERE id = $1`,
            [itemId, linked[0].id],
          );
          return { updated: true, cleaned: false, referenced: true };
        }
        if (body.outcome === 'failed') {
          const delayMinutes = Math.min(1440, 5 * (2 ** Math.min(8, item.cleanup_attempt_count)));
          await q(
            `UPDATE staff_evidence_upload_item
                SET cleanup_claim_token = NULL, cleanup_claim_expires_at = NULL,
                    cleanup_next_attempt_at = now() + make_interval(mins => $2),
                    cleanup_last_error = $3, updated_at = now()
              WHERE id = $1`,
            [itemId, delayMinutes, (body.detail ?? '').trim().slice(0, 400)],
          );
          return { updated: true, cleaned: false, retry: true };
        }
        await q(
          `UPDATE staff_evidence_upload_item
              SET state = 'cleaned', cleanup_claim_token = NULL,
                  cleanup_claim_expires_at = NULL, cleanup_next_attempt_at = NULL,
                  cleanup_last_error = NULL, updated_at = now()
            WHERE id = $1`,
          [itemId],
        );
        return { updated: true, cleaned: true };
      });
      return { status: 200, jsonBody: result };
    }),
});

/* ============================================================
   11b — GET|POST /api/internal/evidence/unclassified-box   (TKT-146)
   Called by: the orchestration `box-classify-sweep` timer. GET is the
   rolling-deploy-compatible due-row read used by the older orchestration
   build. POST atomically CLAIMS due rows for the current build.

   Both paths enumerate still-unclassified Box FILE.UPLOADED rows and the
   classifier-pending staff-upload rows. Retro archive rows use a different
   label and stay out of the sweep. Each row is returned together with its
   row's case VRM + work-provider id, so the sweep can vision-classify them
   shortly after upload (TKT-064 policy) and honour the per-provider
   ai_allowed opt-out.

   "Still unclassified" is the TKT-131 predicate: image_role_code = unknown
   AND registration_visible IS NULL. A successful classification ALWAYS
   stamps a boolean registration_visible — including the non-vehicle 'other'
   verdict, which keeps role `unknown` (no 'other' option in the choice set)
   but is stamped not-accepted — so a classified row is never re-enumerated
   and re-sweeps are idempotent. Excluded rows are never candidates. The
   The 14-day created_at window bounds FIRST Box-lane attempts only; staff-upload
   first attempts do not expire. Once any row has an attempt_count > 0, its
   persisted retry remains eligible after day 14 so a day-13 transient backoff
   cannot silently strand it. Persisted claim,
   due-time and dead-letter fields keep terminal/persistent failures OUT of
   the next capped page; a crash leaves a 30-minute lease, after which the row
   is safely retryable. Newest-first still prioritises fresh uploads, while
   Box-lane provider AI opt-outs are filtered BEFORE the LIMIT. Staff uploads
   deliberately remain claimable so the worker can give them a terminal,
   explicit manual-review disposition instead of leaving them pending forever.
   ============================================================ */
app.http('internalEvidenceUnclassifiedBox', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'internal/evidence/unclassified-box',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const limitRaw = Number(req.query.get('limit') ?? '25');
      const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 25));
      const imageKind = evidenceKindCodec.toInt('image') ?? 100000000;
      const unknownRole = imageRoleCodec.toInt('unknown' as ImageRole) ?? 100000003;
      const duePredicate = `(
              (e.box_file_id IS NOT NULL AND e.source_label LIKE 'box_upload%')
              OR (
                NULLIF(btrim(e.storage_path), '') IS NOT NULL
                AND e.source_label IN (
                  'staff_add_evidence', 'staff_manual_intake', 'staff_assistant_confirmed',
                  'staff_legacy_upload'
                )
              )
            )
            AND e.kind_code = $1
            AND e.image_role_code = $2
            AND e.registration_visible IS NULL
            AND (
              e.excluded = false
              OR (
                e.source_label IN (
                  'staff_add_evidence', 'staff_manual_intake', 'staff_assistant_confirmed',
                  'staff_legacy_upload'
                )
                AND e.excluded = true
                AND e.exclusion_decision_source = 'classifier'
                AND e.exclusion_reason = 'Image check pending'
              )
            )
            AND (
              COALESCE(e.box_classify_attempt_count, 0) > 0
              OR e.created_at > now() - interval '14 days'
              OR e.source_label IN (
                'staff_add_evidence', 'staff_manual_intake', 'staff_assistant_confirmed',
                'staff_legacy_upload'
              )
            )
            AND e.box_classify_dead_lettered_at IS NULL
            AND (e.box_classify_next_attempt_at IS NULL OR e.box_classify_next_attempt_at <= now())
            AND (e.box_classify_claim_expires_at IS NULL OR e.box_classify_claim_expires_at <= now())
            AND (
              wp.ai_allowed IS DISTINCT FROM false
              OR e.source_label IN (
                'staff_add_evidence', 'staff_manual_intake', 'staff_assistant_confirmed',
                'staff_legacy_upload'
              )
            )`;
      const rows = req.method?.toUpperCase() === 'POST'
        ? await query<Row>(
            `WITH candidates AS (
               SELECT e.id
                 FROM evidence e
                 JOIN case_ c ON c.id = e.case_id
                 LEFT JOIN work_provider wp ON wp.id = c.work_provider_id
                WHERE ${duePredicate}
                ORDER BY e.created_at DESC, e.id
                LIMIT $3
                FOR UPDATE OF e SKIP LOCKED
             ), claimed AS (
               UPDATE evidence e
                  SET box_classify_claim_token = gen_random_uuid(),
                      box_classify_claim_expires_at = now() + interval '30 minutes',
                      box_classify_attempt_count = e.box_classify_attempt_count + 1,
                      updated_at = now()
                 FROM candidates candidate
                WHERE e.id = candidate.id
               RETURNING e.*
             )
             SELECT e.id, e.case_id, e.file_name, e.content_type, e.box_file_id, e.storage_path,
                    e.source_label, e.source_message_id, e.box_classify_claim_token,
                    e.box_classify_attempt_count, c.vrm, c.work_provider_id
               FROM claimed e
               JOIN case_ c ON c.id = e.case_id
              ORDER BY e.created_at DESC, e.id`,
            [imageKind, unknownRole, limit],
          )
        : await query<Row>(
            `SELECT e.id, e.case_id, e.file_name, e.content_type, e.box_file_id, e.storage_path,
                    e.source_label, e.source_message_id, NULL::uuid AS box_classify_claim_token,
                    e.box_classify_attempt_count, c.vrm, c.work_provider_id
               FROM evidence e
               JOIN case_ c ON c.id = e.case_id
               LEFT JOIN work_provider wp ON wp.id = c.work_provider_id
              WHERE ${duePredicate}
              ORDER BY e.created_at DESC, e.id
              LIMIT $3`,
            [imageKind, unknownRole, limit],
          );
      return {
        status: 200,
        jsonBody: {
          rows: rows.map((r) => ({
            evidenceId: r.id as string,
            caseId: r.case_id as string,
            filename: (r.file_name as string | null) ?? '',
            contentType: (r.content_type as string | null) ?? null,
            boxFileId: (r.box_file_id as string | null) ?? null,
            storagePath: (r.storage_path as string | null) ?? null,
            sourceLabel: (r.source_label as string | null) ?? '',
            sourceMessageId: (r.source_message_id as string | null) ?? null,
            caseVrm: (r.vrm as string | null) ?? '',
            workProviderId: (r.work_provider_id as string | null) ?? '',
            claimToken: (r.box_classify_claim_token as string | null) ?? null,
            attemptCount: Number(r.box_classify_attempt_count ?? 0),
          })),
        },
      };
    }),
});

/* ============================================================
   11c — TKT-146 durable classification → status-recompute handoff

   The exact evidence-row UPDATE and case generation increment share one DB
   transaction. Once a classification stamp commits, requested > completed is
   durable until a successful status evaluation acknowledges that generation.
   A retry may increment again; evaluation is idempotent and the generation-aware
   acknowledgement cannot consume newer work.
   ============================================================ */
app.http('internalEvidenceBoxClassification', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/evidence/{id}/box-classification',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const evidenceId = (req.params.id ?? '').trim();
      const body = (await req.json()) as {
        caseId?: string;
        boxFileId?: string;
        storagePath?: string;
        claimToken?: string;
        failure?: {
          disposition?: 'transient' | 'terminal';
          code?: string;
          detail?: string;
        };
        imageRole?: string;
        registrationVisible?: boolean;
        acceptedForEva?: boolean;
        excluded?: boolean;
        exclusionReason?: string | null;
        decisionSource?: 'classifier';
        personReflection?: boolean;
      };
      const imageKind = evidenceKindCodec.toInt('image') ?? 100000000;
      const unknownRole = imageRoleCodec.toInt('unknown') ?? 100000003;
      const claimToken = (body.claimToken ?? '').trim();

      // A claimed worker reports a failed attempt through the SAME route. This is
      // retry metadata only: evidence bytes/visibility/role are untouched. The
      // claim-token compare-and-set prevents an expired worker changing a newer
      // claimant's schedule.
      if (body.failure != null) {
        const disposition = body.failure.disposition;
        const code = (body.failure.code ?? '').trim().toLowerCase();
        const detail = (body.failure.detail ?? '').trim().slice(0, 400);
        if (
          !evidenceId ||
          !claimToken ||
          (disposition !== 'transient' && disposition !== 'terminal') ||
          !/^[a-z0-9][a-z0-9_.:-]{0,79}$/.test(code)
        ) {
          return {
            status: 400,
            jsonBody: { error: 'claimToken and a valid failure disposition/code are required' },
          };
        }
        const terminal = disposition === 'terminal';
        const failed = await query<Row>(
          `UPDATE evidence
              SET box_classify_claim_token = NULL,
                  box_classify_claim_expires_at = NULL,
                  box_classify_last_failure_code = $3::text,
                  box_classify_next_attempt_at = CASE
                    WHEN $4::boolean THEN NULL
                    WHEN box_classify_attempt_count <= 1 THEN now() + interval '15 minutes'
                    WHEN box_classify_attempt_count = 2 THEN now() + interval '1 hour'
                    WHEN box_classify_attempt_count = 3 THEN now() + interval '6 hours'
                    ELSE now() + interval '24 hours'
                  END,
                  box_classify_dead_lettered_at = CASE WHEN $4::boolean THEN now() ELSE NULL END,
                  box_classify_dead_letter_reason = CASE
                    WHEN $4::boolean THEN left(COALESCE(NULLIF($5, ''), $3), 400)
                    ELSE NULL
                  END,
                  exclusion_reason = CASE
                    WHEN $4::boolean
                     AND $3 = 'provider_ai_opted_out_manual_review'
                     AND excluded = true
                     AND source_label IN (
                       'staff_add_evidence', 'staff_manual_intake', 'staff_assistant_confirmed',
                       'staff_legacy_upload'
                     )
                    THEN 'Image needs staff review'
                    ELSE exclusion_reason
                  END,
                  updated_at = now()
            WHERE id = $1
              AND box_classify_claim_token::text = $2
              AND kind_code = $6
              AND image_role_code = $7
              AND registration_visible IS NULL
              AND (
                excluded = false
                OR (
                  source_label IN (
                    'staff_add_evidence', 'staff_manual_intake', 'staff_assistant_confirmed',
                    'staff_legacy_upload'
                  )
                  AND excluded = true
                  AND exclusion_decision_source = 'classifier'
                  AND exclusion_reason = 'Image check pending'
                )
              )
          RETURNING box_classify_attempt_count,
                    box_classify_next_attempt_at,
                    box_classify_dead_lettered_at`,
          [evidenceId, claimToken, code, terminal, detail, imageKind, unknownRole],
        );
        const row = failed[0];
        return {
          status: 200,
          jsonBody: row
            ? {
                updated: true,
                disposition,
                attemptCount: Number(row.box_classify_attempt_count ?? 0),
                nextAttemptAt: row.box_classify_next_attempt_at ?? null,
                deadLettered: row.box_classify_dead_lettered_at != null,
              }
            : { updated: false, stale: true },
        };
      }

      const caseId = (body.caseId ?? '').trim();
      const boxFileId = (body.boxFileId ?? '').trim();
      const storagePath = (body.storagePath ?? '').trim();
      if (!evidenceId || !caseId || Boolean(boxFileId) === Boolean(storagePath)) {
        return {
          status: 400,
          jsonBody: { error: 'evidence id, caseId and exactly one file locator are required' },
        };
      }
      if (
        typeof body.registrationVisible !== 'boolean' ||
        typeof body.acceptedForEva !== 'boolean' ||
        typeof body.excluded !== 'boolean' ||
        typeof body.personReflection !== 'boolean' ||
        body.decisionSource !== 'classifier'
      ) {
        return { status: 400, jsonBody: { error: 'classification booleans are required' } };
      }

      // `other` is a valid classifier verdict but deliberately has no stored
      // image-role choice; it persists as unknown + acceptedForEva=false. Every
      // other unknown role name is a caller error, never silently coerced.
      const imageRoleCode =
        body.imageRole === 'other'
          ? unknownRole
          : imageRoleCodec.toInt(body.imageRole as ImageRole | undefined);
      if (imageRoleCode == null) {
        return { status: 400, jsonBody: { error: 'imageRole is not recognised' } };
      }
      const excluded = body.excluded === true;
      const exclusionReason = excluded
        ? (body.exclusionReason ?? '').trim() || 'Excluded'
        : null;

      const result = await tx(async (q) => {
        const lockedCase = await lockCaseForMutation(q, caseId);
        if (lockedCase.kind === 'retired') {
          return { kind: 'retired' as const, targetCaseId: lockedCase.mergedInto };
        }
        if (lockedCase.kind === 'missing') return { kind: 'missing' as const };

        // Lock the identity after its owning case. The source-aware metadata helper may revise an
        // autonomous result (including excluded -> included) but independently
        // preserves every staff/provider/cleanup/legacy-owned field.
        const current = await q<{ id: string }>(
          `SELECT id FROM evidence
            WHERE id = $1
              AND case_id = $2
              AND (
                ($3::text <> '' AND box_file_id = $3 AND source_label LIKE 'box_upload%')
                OR (
                  $4::text <> '' AND storage_path = $4
                  AND source_label IN (
                    'staff_add_evidence', 'staff_manual_intake', 'staff_assistant_confirmed',
                    'staff_legacy_upload'
                  )
                )
              )
              AND kind_code = $5
              AND ($6::text = '' OR box_classify_claim_token::text = $6)
            FOR UPDATE`,
          [evidenceId, lockedCase.caseId, boxFileId, storagePath, imageKind, claimToken],
        );
        if (!current[0]) {
          return claimToken
            ? { kind: 'stale' as const }
            : { kind: 'missing' as const };
        }

        const identityWhere = boxFileId
          ? 'id = $1 AND case_id = $2 AND box_file_id = $3'
          : 'id = $1 AND case_id = $2 AND storage_path = $3';
        const applied = await applyEvidenceMetadata(
          ctx,
          identityWhere,
          [evidenceId, lockedCase.caseId, boxFileId || storagePath],
          {
            imageRole: body.imageRole,
            registrationVisible: body.registrationVisible!,
            acceptedForEva: body.acceptedForEva!,
            excluded: body.excluded!,
            exclusionReason,
            decisionSource: 'classifier',
            personReflection: body.personReflection!,
          },
          {
            imageRoleCode,
            registrationVisible: body.registrationVisible!,
            excluded,
            exclusionReason,
            sha256: null,
            sequenceIndex: null,
          },
          q,
        );
        if (applied.updated === 0) return { kind: 'stale' as const };

        // Classification is complete for this exact row. Clear the durable work
        // lease/schedule in the same transaction as the metadata stamp. Preserve
        // no stale failure/dead-letter marker that could misdescribe a success.
        await q(
          `UPDATE evidence
              SET box_classify_attempt_count = 0,
                  box_classify_next_attempt_at = NULL,
                  box_classify_claim_token = NULL,
                  box_classify_claim_expires_at = NULL,
                  box_classify_last_failure_code = NULL,
                  box_classify_dead_lettered_at = NULL,
                  box_classify_dead_letter_reason = NULL,
                  updated_at = now()
            WHERE id = $1
              AND ($2::text = '' OR box_classify_claim_token::text = $2)`,
          [evidenceId, claimToken],
        );

        const generation = applied.readinessChanged
          ? await requestStatusRecompute(q, lockedCase.caseId)
          : null;
        return { kind: 'updated' as const, generation };
      });

      if (result.kind === 'missing') {
        return { status: 404, jsonBody: { error: 'evidence row not found' } };
      }
      if (result.kind === 'retired') {
        return {
          status: 409,
          jsonBody: { error: 'case has been merged', code: 'case_merged', targetCaseId: result.targetCaseId },
        };
      }
      if (result.kind === 'stale') {
        return { status: 200, jsonBody: { updated: false, stale: true } };
      }
      return {
        status: 200,
        jsonBody: {
          updated: true,
          ...(result.generation == null ? {} : { statusGeneration: result.generation }),
        },
      };
    }),
});

app.http('internalStatusRecomputePending', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/status-recompute/pending',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const limitRaw = Number(req.query.get('limit') ?? '25');
      const limit = Math.min(
        100,
        Math.max(1, Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 25),
      );
      const rows = await query<{
        id: string;
        status_recompute_requested_generation: string | number;
      }>(
        `SELECT id, status_recompute_requested_generation
           FROM case_
          WHERE status_recompute_completed_generation < status_recompute_requested_generation
          ORDER BY status_recompute_requested_at ASC NULLS FIRST, id
          LIMIT $1`,
        [limit],
      );
      return {
        status: 200,
        jsonBody: {
          rows: rows.map((r) => ({
            caseId: r.id,
            generation: Number(r.status_recompute_requested_generation),
          })),
        },
      };
    }),
});

app.http('internalStatusRecomputeComplete', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/status-recompute/{id}/complete',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = (req.params.id ?? '').trim();
      const body = (await req.json()) as { generation?: number };
      const generation = Number(body.generation);
      if (!caseId || !Number.isSafeInteger(generation) || generation < 1) {
        return {
          status: 400,
          jsonBody: { error: 'case id and a positive generation are required' },
        };
      }
      // Do not blindly acknowledge a generation evaluated by a prior request: a
      // mutation/terminal transition may have committed in between. Re-evaluate and
      // acknowledge under one case-row lock so completion always names a stable snapshot.
      const result = await recomputeStatus(caseId, generation);
      if (!result.found) return { status: 404, jsonBody: { error: 'case not found' } };
      return {
        status: 200,
        jsonBody: { completed: result.completed, pending: result.pending },
      };
    }),
});

/* ============================================================
   12 — GET /api/internal/cases/{id}/box-folder
   Called by: orchestration boxFolderCreate activity (intake wiring + manual
   starter — ADR-0012). Reads the case's current Box folder linkage so the
   activity SKIPS creating a second folder for a case that already has one
   (idempotency). Returns case_po too, so the caller can confirm the folder
   name. { boxFolderId: null } (200) when the case has no folder yet (or the
   case id is unknown) — never guesses.
   ============================================================ */
app.http('internalCaseBoxFolderGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/box-folder',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = (req.params.id ?? '').trim();
      if (!caseId) return { status: 200, jsonBody: { boxFolderId: null, boxFolderUrl: null, casePo: null } };
      const rows = await query<Row>(
        'SELECT box_folder_id, box_folder_url, case_po FROM case_ WHERE id = $1',
        [caseId],
      );
      const r = rows[0];
      return {
        status: 200,
        jsonBody: {
          boxFolderId: (r?.box_folder_id as string) ?? null,
          boxFolderUrl: (r?.box_folder_url as string) ?? null,
          casePo: (r?.case_po as string) ?? null,
        },
      };
    }),
});

/* ============================================================
   13 — POST /api/internal/cases/{id}/box-folder
   Called by: orchestration boxFolderCreate activity AFTER it mints the Box
   folder. FIRST-WINS idempotent stamp of box_folder_id/box_folder_url onto the
   case via a conditional UPDATE (... WHERE box_folder_id IS NULL), so a replay /
   concurrent create never relinks. Writes the box_folder_created audit ONLY when
   it actually stamps (applied:true) — no double-audit on a re-run. Returns the
   effective box_folder_id either way.
   ============================================================ */
app.http('internalCaseBoxFolderStamp', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/box-folder',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = (req.params.id ?? '').trim();
      const body = (await req.json()) as { boxFolderId?: string; boxFolderUrl?: string };
      const boxFolderId = (body.boxFolderId ?? '').trim();
      const boxFolderUrl = (body.boxFolderUrl ?? '').trim() || null;
      if (!caseId || !boxFolderId) {
        return { status: 400, jsonBody: { error: 'caseId and boxFolderId required' } };
      }
      // Conditional UPDATE → only the first stamp wins; a second matches no row.
      const stamped = await query<Row>(
        `UPDATE case_
            SET box_folder_id = $2, box_folder_url = $3, updated_at = now()
          WHERE id = $1 AND box_folder_id IS NULL
        RETURNING box_folder_id`,
        [caseId, boxFolderId, boxFolderUrl],
      );
      if (stamped.length > 0) {
        await writeAudit({
          action: AUDIT_ACTION.box_folder_created,
          caseId,
          summary: `Archive folder ${boxFolderId} linked to case`,
          after: { boxFolderId, boxFolderUrl },
        });
        return { status: 200, jsonBody: { applied: true, boxFolderId } };
      }
      // Already linked (or unknown case) — return the current value, no audit.
      const cur = await query<Row>('SELECT box_folder_id FROM case_ WHERE id = $1', [caseId]);
      return {
        status: 200,
        jsonBody: { applied: false, boxFolderId: (cur[0]?.box_folder_id as string) ?? null },
      };
    }),
});

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
 *  POST /api/internal/cases/{id}/evidence            → { persisted: number }
 *  GET  /api/internal/cases/{id}/archive-evidence    → blob-backed evidence rows for archive mirroring
 *  POST /api/internal/cases/{id}/archive-evidence/stamp → stamp archive file id/link
 *  POST /api/internal/cases/{id}/status-evaluate     → { value: string }
 *  POST /api/internal/cases/{id}/set-ingested        → { updated: boolean }
 *  POST /api/internal/audit                          → 204
 *  GET  /api/internal/principals                     → [{ principalCode }]
 *  GET  /api/internal/disposition/due                → [{ caseId }]
 *  POST /api/internal/disposition/{id}               → 204
 *  GET  /api/internal/box/case-by-folder/{folderId}  → { caseId: string | null }
 *  GET  /api/internal/box/purge-candidates           → [{ caseId, blobPath }]
 *  POST /api/internal/box/mark-purged                → 204
 *  GET  /api/internal/cases/{id}/box-folder          → { boxFolderId, boxFolderUrl, casePo }
 *  POST /api/internal/cases/{id}/box-folder          → { applied, boxFolderId } (first-wins stamp)
 *  POST /api/internal/triage/context                 → { openCaseMatches, duplicateInternetMessageId, conversationSiblingCaseIds } (rules-engine-v2 Phase 2)
 *  POST /api/internal/triage/suggest-link             → { suggestionId, created } (rules-engine-v2 Phase 2;
 *                                                         suggestionType 'triage_category' added Phase 4)
 *  POST /api/internal/inbound/{id}/outlook-moved      → 204 (TKT-054 Outlook-filing outcome report)
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import {
  EVA_FIELD_ORDER,
  TERMINAL_STATUSES,
  allowedCaseTypes,
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
import { query, tx } from '../lib/db.js';
import { mintCasePo } from '../lib/case-po.js';
import { AUDIT_ACTION, writeAudit } from '../lib/audit.js';
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
  rowToCase,
  rowToEvidence,
  type Row,
} from '../lib/mappers.js';
import { hasColumn, planOptionalColumns, tableColumns } from '../lib/schema-introspect.js';
import { acquireTriageLocks } from '../lib/triage-locks.js';

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
 * Recompute a case's status via @cs/domain statusForReviewCase and persist when it
 * changes. Returns the resulting CaseStatus name. Safe to call in any activity that
 * may change the case state.
 */
async function recomputeStatus(caseId: string): Promise<CaseStatus> {
  const rows = await query<Row>(`${CASE_SELECT} WHERE c.id = $1`, [caseId]);
  const rec = rows[0];
  if (!rec) return 'error';

  const evidenceRows = await query<Row>('SELECT * FROM evidence WHERE case_id = $1', [caseId]);
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
  };
  const next = statusForReviewCase(input);

  if (next !== full.status) {
    await query('UPDATE case_ SET status_code = $2, updated_at = now() WHERE id = $1', [
      caseId,
      statusToInt(next),
    ]);
    await writeAudit({
      action: AUDIT_ACTION.status_changed,
      caseId,
      summary: `Status ${full.status} -> ${next} (internal recompute)`,
      before: { status: full.status },
      after: { status: next },
    });
  }
  return next;
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
): Promise<void> {
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
    return;
  }

  // Read every column we might fill so each write is strictly fill-if-empty.
  const readCols = [
    'case_ref',
    'eva_mileage',
    'eva_work_provider',
    'work_provider_id',
    ...evaCandidates.map((c) => c.column),
  ];
  const cur = await query<Row>(`SELECT ${readCols.join(', ')} FROM case_ WHERE id = $1`, [caseId]);
  if (!cur[0]) return;
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
    vals.push(ref.slice(0, 200));
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

  if (sets.length === 0) return; // every candidate already populated — respect existing values

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
      const vrm = ((body.parserVrm || inbound.candidateVrm) ?? '').trim();

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
        return {
          status: 200,
          jsonBody: { outcome: 'attached', caseId: decision.targetCaseId, providerAutomationMode },
        };
      }

      // Create: new case_ for create / new_due_to_reference / propose_attach.
      // The UNIQUE(source_message_id) constraint backstops concurrent/replayed
      // intake — a duplicate will throw PG error 23505, which the catch below
      // returns as 409 (→ ConflictError → already_ingested in the client).
      const rawStatus = decision.statusEffect as CaseStatus;
      const statusCode = caseStatusCodec.toInt(rawStatus) ?? statusToInt('new_email');
      const caseRef = (inbound.candidateRef ?? '').trim();
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
      await applyParserFields(
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
        // Best-effort note (human-readable new-client tag) — must not block intake.
        await query(
          `INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())`,
          [
            'New client',
            newCaseId,
            'Email intake (auto)',
            `New client — no work provider matched for sender${domain ? ` @${domain}` : ''}. ` +
              `No Case/PO minted; set up the work provider and confirm before EVA.`,
          ],
        ).catch(() => { /* note is supplementary */ });
        await writeAudit({
          action: AUDIT_ACTION.inbound_routed,
          caseId: newCaseId,
          severity: 'warning',
          summary: 'New client routed to Held (no work provider matched)',
          after: { newClient: true, onHold: true, senderDomain: domain },
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
  const name = `Email: ${subject || inbound.internetMessageId}`;
  const categoryCode = classification
    ? INBOUND_CATEGORY_TO_INT[classification.category as InboundCategory] ?? null
    : null;
  const subtypeCode = classification
    ? INBOUND_SUBTYPE_TO_INT[classification.subtype as InboundSubtype] ?? null
    : null;
  // Prefer the parser-confirmed PDF VRM for the inbox triage row too (so it shows the same
  // mark the case persists), then the classifier body sniff, then the email-subject sniff.
  const bodyVrm = ((parserVrm || classification?.bodyVrm || inbound.candidateVrm) ?? '').trim() || null;
  const bodyCaseref = (classification?.bodyCaseref || inbound.candidateRef || '') || null;
  const bodyPreview = (inbound.bodyPreview ?? '') || null;
  const confidence = classification ? classification.confidence : null;
  const signals = classification ? JSON.stringify(classification.signals ?? []) : null;
  const bodyJobref = (classification?.bodyJobref ?? '').trim() || null;
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
      };
      const { inbound } = body;
      const workProviderId = body.providerId ?? null;
      const ref = (body.ref ?? '').trim();
      const vrm = (body.vrm ?? '').trim();

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
      const candidates: Row[] = await tx(async (q) => {
        await acquireTriageLocks(q, { caseref: ref, vrm });

        let rows: Row[] = [];
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
          rows = await q<Row>(
            `SELECT id, case_ref, case_po, vrm FROM case_
              WHERE vrm = $1
                AND status_code NOT IN (${TERMINAL_INT_CODES.join(',')})
              ORDER BY created_at`,
            [vrm],
          );
        }
        return rows;
      });

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
            `SELECT id, case_po, status_code,
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
          openCaseMatches = rows.map((r) => ({
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

/**
 * Update image metadata on an ALREADY-persisted evidence row (the seam that lets the
 * image-extraction worker enrich an attachment that intake created without it). Only the
 * fields the caller actually supplied are written (so an intake row's defaults are never
 * clobbered). excluded + exclusion_reason move together (the schema CHECK requires a reason
 * when excluded). Best-effort: a failure is logged + swallowed so one bad row never sinks the
 * batch. Returns the number of rows updated. `whereClause` keys on $1..$N from `whereVals`.
 */
async function applyEvidenceMetadata(
  ctx: InvocationContext,
  whereClause: string,
  whereVals: unknown[],
  row: {
    imageRole?: string;
    imageRoleCode?: number;
    registrationVisible?: boolean;
    acceptedForEva?: boolean;
    excluded?: boolean;
    exclusionReason?: string;
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
): Promise<number> {
  const sets: string[] = [];
  const vals: unknown[] = [...whereVals];
  const push = (col: string, v: unknown): void => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };

  if (row.imageRoleCode != null || row.imageRole != null) push('image_role_code', computed.imageRoleCode);
  if (typeof row.registrationVisible === 'boolean') push('registration_visible', computed.registrationVisible);
  if (typeof row.acceptedForEva === 'boolean') push('accepted_for_eva', row.acceptedForEva);
  if (row.excluded != null) {
    push('excluded', computed.excluded);
    push('exclusion_reason', computed.exclusionReason); // CHECK-safe: non-empty when excluded
  } else if (typeof row.exclusionReason === 'string' && row.exclusionReason.trim()) {
    push('exclusion_reason', row.exclusionReason.trim());
  }
  if (row.sha256 != null) push('sha256', computed.sha256);
  if (row.sequenceIndex != null) push('sequence_index', computed.sequenceIndex);

  if (sets.length === 0) return 0;
  try {
    const res = await query<{ id: string }>(
      `UPDATE evidence SET ${sets.join(', ')}, updated_at = now() WHERE ${whereClause} RETURNING id`,
      vals,
    );
    return res.length;
  } catch (e) {
    ctx.error(e);
    return 0;
  }
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
   ============================================================ */
app.http('internalCasesEvidence', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/evidence',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      const body = (await req.json()) as {
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
            exclusionReason?: string;
            sha256?: string;
            sequenceIndex?: number;
          }
        >;
      };

      let persisted = 0;
      let updated = 0;
      for (const row of body.rows ?? []) {
        const kindCode =
          evidenceKindCodec.toInt(
            (row.evidenceClass as 'image' | 'instruction' | 'email' | 'other' | 'engineer_report') ??
              'other',
          ) ?? null;

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
        const sha256 = (row.sha256 ?? '').trim() || null;
        const sequenceIndex = Number.isInteger(row.sequenceIndex)
          ? (row.sequenceIndex as number)
          : null;
        // Did the caller actually supply any image metadata (vs an intake row that has none)?
        const hasMetadata =
          row.imageRoleCode != null ||
          row.imageRole != null ||
          typeof row.registrationVisible === 'boolean' ||
          row.excluded != null ||
          row.exclusionReason != null ||
          row.sha256 != null ||
          row.sequenceIndex != null;

        const sourceMessageId = (row.sourceMessageId ?? '').trim() || null;
        const boxFileId = (row.boxFileId ?? '').trim() || null;
        const isBoxRow = sourceMessageId != null || boxFileId != null;

        let inserted = false;
        if (isBoxRow) {
          // Box upload: storage_path stays NULL (bytes mirror to Blob later); dedup
          // on the durable box:file:<id> tag in source_message_id (fall back to
          // box_file_id only if the tag is absent).
          const dedupCol = sourceMessageId != null ? 'source_message_id' : 'box_file_id';
          const dedupVal = sourceMessageId ?? boxFileId;
          const result = await query<{ id: string }>(
            `INSERT INTO evidence
               (file_name, case_id, kind_code, content_type, size_bytes,
                source_message_id, box_file_id, box_file_url, accepted_for_eva, source_label,
                image_role_code, registration_visible, excluded, exclusion_reason, sha256, sequence_index)
             SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
             WHERE NOT EXISTS (
               SELECT 1 FROM evidence WHERE case_id = $2 AND ${dedupCol} = $17
             )
             RETURNING id`,
            [
              row.filename,
              caseId,
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
              sha256,
              sequenceIndex,
              dedupVal,
            ],
          );
          inserted = result.length > 0;
          // Existing Box row + new metadata (e.g. OCR ran after the upload) -> update in place.
          if (!inserted && hasMetadata) {
            updated += await applyEvidenceMetadata(
              ctx,
              `case_id = $1 AND ${dedupCol} = $2`,
              [caseId, dedupVal],
              row,
              { imageRoleCode, registrationVisible, excluded, exclusionReason, sha256, sequenceIndex },
            );
          }
        } else {
          // Email/orchestration: idempotent on (case_id, storage_path).
          const acceptedForEva = row.acceptedForEva ?? true;
          const result = await query<{ id: string }>(
            `INSERT INTO evidence
               (file_name, case_id, kind_code, content_type, size_bytes, storage_path, source_label,
                accepted_for_eva,
                image_role_code, registration_visible, excluded, exclusion_reason, sha256, sequence_index)
             SELECT $1, $2, $3, $4, $5, $6::text, 'auto-intake', $7, $8, $9, $10, $11, $12, $13
             WHERE NOT EXISTS (
               SELECT 1 FROM evidence WHERE case_id = $2 AND storage_path = $6::text
             )
             RETURNING id`,
            [
              row.filename,
              caseId,
              kindCode,
              row.contentType || null,
              row.size ?? null,
              row.blobPath ?? null,
              acceptedForEva,
              imageRoleCode,
              registrationVisible,
              excluded,
              exclusionReason,
              sha256,
              sequenceIndex,
            ],
          );
          inserted = result.length > 0;
          // Existing intake row + new image metadata -> update it in place (the seam that
          // lets the image-extraction worker enrich an already-persisted attachment).
          if (!inserted && hasMetadata && row.blobPath) {
            updated += await applyEvidenceMetadata(
              ctx,
              'case_id = $1 AND storage_path = $2::text',
              [caseId, row.blobPath],
              row,
              { imageRoleCode, registrationVisible, excluded, exclusionReason, sha256, sequenceIndex },
            );
          }
        }
        if (inserted) persisted++;
      }

      return { status: 200, jsonBody: { persisted, updated } };
    }),
});

/* ============================================================
   5 — GET /api/internal/cases/{id}/archive-evidence
   Called by: orchestration boxArchiveEvidence activity.
   Returns persisted blob-backed evidence rows only, so archive mirroring follows
   the Data API's evidence truth instead of a stale in-memory intake envelope.
   ============================================================ */
app.http('internalCasesArchiveEvidence', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/archive-evidence',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      if (!caseId) return { status: 400, jsonBody: { error: 'caseId required' } };

      const rows = await query<{
        id: string;
        filename: string;
        contentType: string | null;
        blobPath: string;
      }>(
        `SELECT
           id,
           file_name AS filename,
           content_type AS "contentType",
           storage_path AS "blobPath"
         FROM evidence
         WHERE case_id = $1
           AND storage_path IS NOT NULL
           AND box_file_id IS NULL
         ORDER BY created_at ASC, file_name ASC`,
        [caseId],
      );

      return { status: 200, jsonBody: { rows } };
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
      };
      const evidenceId = typeof body.evidenceId === 'string' ? body.evidenceId.trim() : '';
      const blobPath = typeof body.blobPath === 'string' ? body.blobPath.trim() : '';
      const boxFileId = typeof body.boxFileId === 'string' ? body.boxFileId.trim() : '';
      const boxFileUrl = typeof body.boxFileUrl === 'string' ? body.boxFileUrl.trim() : '';
      if (!evidenceId || !blobPath || !boxFileId) {
        return { status: 400, jsonBody: { error: 'evidenceId, blobPath and boxFileId required' } };
      }

      const updated = await query<{ id: string }>(
        `UPDATE evidence
            SET box_file_id = $4,
                box_file_url = COALESCE($5, box_file_url),
                updated_at = now()
          WHERE case_id = $1
            AND id = $2
            AND storage_path = $3
          RETURNING id`,
        [caseId, evidenceId, blobPath, boxFileId, boxFileUrl || null],
      );
      return { status: 200, jsonBody: { updated: updated.length > 0 } };
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
      const value = await recomputeStatus(caseId);
      return { status: 200, jsonBody: { value } };
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
      if (!folderId) return { status: 200, jsonBody: { caseId: null } };
      const rows = await query<Row>(
        'SELECT id FROM case_ WHERE box_folder_id = $1 LIMIT 1',
        [folderId],
      );
      const caseId = rows.length > 0 ? (rows[0].id as string) : null;
      return { status: 200, jsonBody: { caseId } };
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
      await query(
        `UPDATE evidence
            SET storage_path = NULL, updated_at = now()
          WHERE case_id = $1 AND storage_path = $2`,
        [body.caseId, body.blobPath],
      );
      return { status: 204 };
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

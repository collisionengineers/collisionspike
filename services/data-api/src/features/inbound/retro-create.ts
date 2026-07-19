/**
 * services/data-api/src/features/inbound/retro-create.ts — the retro case CREATE handler
 * (extracted from retro-routes.ts, ADR-0022 / TKT-058).
 *
 * The get-or-create heart of the gated retro fallback: once the Box archive / Outlook rungs
 * have reconstructed the original instruction, this persists the reconstructed case under the
 * same advisory locks + uq_case_case_po / UNIQUE(source_message_id) backstops the live mint
 * takes, so a concurrent duplicate trigger LINKS instead of double-creating and conflicts are
 * outcomes, never 500s. The app.http registration stays in retro-routes.ts (the runtime
 * contract's route source); this module owns the handler body. Behaviour is byte-identical.
 *
 * INVARIANTS (the ADR-0022 contract):
 *  - NEVER FORK ARCHIVE IDENTITY: a DISCOVERED archive folder name is stored verbatim only
 *    when its principal is verified; an unresolved value lands in case_ref, NOT case_po.
 *  - TERMINAL ONLY WHEN VERIFIED: 'eva_submitted' is accepted solely with a resolved
 *    principal + discovered PO — re-asserted here, never trusting the caller alone.
 *  - NEVER RE-POINT: an inbound_email row that already carries a case_id is left alone,
 *    enforced atomically by the upsert SQL (linkEnvelopeRow / persistence.ts).
 */

import { type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import {
  allowedCaseTypes,
  markerToCaseType,
  matchPrincipalByCasePo,
  type CaseStatus,
  type CaseWorkType,
} from '@cs/domain';
import { actionReasonCodec, caseStatusCodec, caseTypeCodec, statusToInt } from '@cs/domain/codecs';
import { gates } from '../settings/gates.js';
import { query, tx } from '../../platform/db/client.js';
import { AUDIT_ACTION, writeAudit } from '../../shared/audit.js';
import { acquireTriageLocks } from './triage-locks.js';
import { type ParserEvaFields } from './parser-eva-fields.js';
import { type Row } from '../../shared/mapping/index.js';
import {
  validateRetroCreate,
  type NormalisedRetroKeys,
  type RetroKeysDto,
} from './retro-validate.js';
import { applyParserFields } from './internal/parser-fields.js';
import { isUniqueViolation } from './internal/unique-violation.js';
import { mintBlockedByCategory } from './internal/service-support.js';
import { type InboundClassificationDto, type InboundEnvelope } from './internal/inbound-identity.js';
import { clampVarchar, vrmOrEmpty } from '../../shared/validation/varchar.js';
import { findExistingCases, linkEnvelopeRow, type ExistingCaseRow } from './retro-case-lookup.js';

/** choice_intake_channel_kind code for 'retro' (deltas/2026-07-04-retro-case.sql).
 *  Literal, per the PROVIDER_API_CHANNEL_CODE precedent (provider-intake.ts / ADR-0020):
 *  the shared intakeChannelKindCodec union lags the DDL by design until the R4 widening. */
const RETRO_CHANNEL_CODE = 100000003;

/** The classification stamped on the RECONSTRUCTED ORIGINAL's inbound_email row — it is a
 *  receiving_work instruction recovered after the fact (signals mark the provenance). */
function retroOriginalClassification(keys: NormalisedRetroKeys, casePo?: string): InboundClassificationDto {
  return {
    category: 'receiving_work',
    subtype: 'existing_provider_instruction',
    confidence: 0,
    signals: ['retro_reconstructed'],
    bodyVrm: keys.vrm ?? '',
    bodyCaseref: casePo ?? keys.casePo ?? '',
    bodyJobref: keys.externalRef ?? '',
  };
}

/* ============================================================
   POST /api/internal/retro/create
   ============================================================ */
export async function runRetroCreate(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  if (!gates.retroCase()) {
    return { status: 200, jsonBody: { outcome: 'gated_off' } };
  }
  const body = (await req.json()) as {
    original: InboundEnvelope;
    trigger: InboundEnvelope;
    keys: RetroKeysDto;
    casePo?: string;
    vrm?: string;
    statusName?: string;
    onHold?: boolean;
    actionReason?: string;
    reconstructionSource?: string;
    providerId?: string;
    /** TKT-219 — the trigger sender's Image-Source intermediary match (TKT-021):
     *  lets applyParserFields corroborate a content-detected provider and use the
     *  single-candidate fallback, exactly as the live create seam does. */
    intermediary?: { imageSourceId: string; candidateProviderIds: string[] };
    parserVrm?: string;
    parserRef?: string;
    parserMileage?: string;
    parserMileageUnit?: 'Miles' | 'Km' | '';
    parserEva?: ParserEvaFields;
    caseType?: string;
    caseTypeSignals?: string[];
    boxFolder?: { id: string; url?: string };
    triggerCategory?: string;
  };
  const v = validateRetroCreate(body);
  if (!v.ok) return { status: 400, jsonBody: { error: v.code, message: v.message } };
  const { keys, casePo, reconstructionSource } = v.value;
  const { original, trigger } = body;
  const triggerProviderId = body.providerId ?? null;

  // #7-style VRM preference: parser-confirmed > caller's best > envelope sniffs.
  // TKT-073: an over-length "VRM" is junk — dropped (never truncated into the
  // correlation key) so the case_ INSERT can't die on pg 22001 (the live 2026-07-07
  // retro-create failures that lost SAB/46329/1 + DIK/JMO/46440/1).
  const vrmGuard = vrmOrEmpty(body.parserVrm || body.vrm || keys.vrm || original.candidateVrm);
  if (vrmGuard.dropped) {
    ctx.warn(
      `[retro/create] over-length VRM candidate dropped (junk sniff > varchar(16)) for ${trigger?.internetMessageId ?? 'unknown trigger'}`,
    );
  }
  const vrm = vrmGuard.value;

  // Resolve the DISCOVERED PO's principal against the corpus (read-only). The marker on
  // the archive folder name is ground truth for the case type (ADR-0021/ADR-0022) —
  // content detection never overrides it.
  let poProviderId: string | null = null;
  let principalCode = '';
  let marker: '' | 'A.' | 'AP.' | 'D.' = '';
  if (casePo) {
    const wpRows = await query<Row>(
      `SELECT id, principal_code FROM work_provider WHERE principal_code IS NOT NULL AND principal_code <> ''`,
    );
    const match = matchPrincipalByCasePo(
      casePo,
      wpRows.map((r) => String(r.principal_code ?? '')),
    );
    if (match) {
      principalCode = match.principal;
      marker = match.marker;
      poProviderId = (wpRows.find(
        (r) => String(r.principal_code ?? '').trim().toUpperCase() === match.principal,
      )?.id as string) ?? null;
    }
  }
  const principalResolved = Boolean(poProviderId);
  // TKT-219 — the dev/live Case-PO adoption split (operator decision 2026-07-16).
  // Gate ON (production, post-cutover): a principal-verified DISCOVERED archive PO is
  // adopted verbatim as case_po (the ADR-0022 never-fork behaviour). Gate OFF
  // (dev/test — Case/PO sequences are not aligned to live): the discovered PO is
  // recorded as case_ref + note only and the NORMAL allocator may mint; identity is
  // then never "verified" here, so a dev reconstruction can never land terminal.
  const adoptArchivePo = gates.retroAdoptArchivePo();
  const identityVerified = adoptArchivePo && principalResolved && Boolean(casePo);

  // DEFENCE IN DEPTH: an unverified identity may never land terminal — re-asserted
  // here regardless of what the (trusted, but never blindly) caller decided.
  let status: CaseStatus = v.value.status;
  let onHold = v.value.onHold;
  let actionReason = v.value.actionReason;
  if (!identityVerified) {
    status = 'needs_review';
    onHold = true;
    actionReason = 'needs_review';
  }

  // Case type: the archive marker wins; a content-detected type (body.caseType) is the
  // fallback. Validated against the codec so a foreign string degrades to standard.
  const contentCaseType: CaseWorkType =
    caseTypeCodec.toInt(body.caseType as CaseWorkType) != null
      ? (body.caseType as CaseWorkType)
      : 'standard';
  const caseType: CaseWorkType = marker ? markerToCaseType(marker) : contentCaseType;
  const caseTypeSignals = Array.isArray(body.caseTypeSignals) ? body.caseTypeSignals : [];
  const auditGateOn = gates.auditCases();

  // TKT-119 belt-and-braces: the envelope whose message becomes the case's SOURCE must
  // not be an acknowledgement/digest-family email — if the "reconstructed original" was
  // itself ingested and classified non_actionable (acks, case-summary digests), 'other'
  // (unidentified), 'pre_instruction' (held lane), or 'website_enquiry' (prospective
  // customer contact), refuse rather than build a case on
  // it. The retro TRIGGER family (billing/case_update/cancellation/query) is deliberately
  // NOT blocked here: a stranded update email IS the reconstruction target when no
  // instruction survives, and it lands Held needs_review (never terminal, never a PO).
  const originalCategory = await mintBlockedByCategory(original.internetMessageId);
  const blockedCategory =
    originalCategory &&
    ['non_actionable', 'other', 'pre_instruction', 'website_enquiry'].includes(originalCategory)
      ? originalCategory
      : null;
  if (blockedCategory) {
    await writeAudit({
      action: AUDIT_ACTION.inbound_routed,
      severity: 'warning',
      summary: `Retro create refused — the located original is a '${blockedCategory}' email, which never opens a case`,
      after: { messageId: original.internetMessageId, category: blockedCategory, seam: 'retro/create' },
    });
    ctx.log(JSON.stringify({ evt: 'retroCreate', outcome: 'refused_category', category: blockedCategory }));
    return { status: 200, jsonBody: { outcome: 'refused_category', category: blockedCategory } };
  }

  const subject = (original.subject ?? '').trim();
  const name = ([vrm || null, subject || null].filter(Boolean).join(' · ') || 'Retro case').slice(0, 100);
  // Future mail cites the provider's reference — that is what case_ref must hold for
  // linkReply/dedup to match; an unresolved PO-shaped token is only a fallback.
  // TKT-073: clamped to the case_ref varchar(100) column, never a failed INSERT.
  const caseRefValue = clampVarchar(
    keys.externalRef ||
      (body.parserRef ?? '').trim() ||
      (!identityVerified && casePo ? casePo : '') ||
      '',
    100,
  ).value;

  const statusCode = caseStatusCodec.toInt(status) ?? statusToInt('needs_review');

  type CreateResult =
    | { kind: 'created'; caseId: string }
    | { kind: 'existing'; rows: ExistingCaseRow[]; matchedBy: string | null };
  let result: CreateResult;
  try {
    result = await tx(async (q) => {
      await acquireTriageLocks(q, {
        caseref: casePo ?? keys.externalRef,
        jobref: casePo ? keys.externalRef : undefined,
        vrm: vrm || keys.vrm,
      });

      // GET-or-create: the ladder re-runs INSIDE the lock so a concurrent duplicate
      // trigger (or a live mint for the same ref) is seen, not raced.
      const existing = await findExistingCases(
        q,
        { ...keys, ...(casePo ? { casePo } : {}), ...(vrm ? { vrm } : {}) },
        poProviderId ?? triggerProviderId,
      );
      if (existing.rows.length > 0) {
        return { kind: 'existing', rows: existing.rows, matchedBy: existing.matchedBy };
      }

      const cols = [
        'name', 'vrm', 'status_code',
        'intake_channel_kind_code', 'intake_channel_manual', 'source_mailbox',
        'source_message_id', 'payload_hash', 'work_provider_id',
      ];
      const vals: unknown[] = [
        name, vrm || null, statusCode,
        RETRO_CHANNEL_CODE, false, original.sourceMailbox ?? null,
        original.internetMessageId ?? null,
        original.payloadHash ?? null,
        poProviderId,
      ];
      if (caseRefValue) { cols.push('case_ref'); vals.push(caseRefValue); }
      // NEVER MINT — the discovered PO is stored verbatim, and only with a verified
      // principal (uq_case_case_po backstops a race; see the catch below).
      if (identityVerified && casePo) { cols.push('case_po'); vals.push(casePo); }
      if (auditGateOn && caseType !== 'standard') {
        cols.push('case_type_code');
        vals.push(caseTypeCodec.toInt(caseType) ?? null);
      }
      if (onHold) {
        cols.push('on_hold'); vals.push(true);
        if (!identityVerified) {
          cols.push('on_hold_reason'); vals.push('provider_unresolved');
        }
        cols.push('action_reason_code');
        vals.push(actionReasonCodec.toInt(actionReason ?? 'needs_review') ?? null);
      }
      if (body.boxFolder?.id) {
        cols.push('box_folder_id'); vals.push(body.boxFolder.id);
        if (body.boxFolder.url) { cols.push('box_folder_url'); vals.push(body.boxFolder.url); }
      }

      const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
      const rows = await q<Row>(
        `INSERT INTO case_ (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
        vals,
      );
      const caseId = rows[0]?.id as string;
      if (!caseId) throw new Error('retro case insert returned no id');
      return { kind: 'created', caseId };
    });
  } catch (e: unknown) {
    if (!isUniqueViolation(e)) throw e;
    // Concurrent-duplicate rung: uq_case_case_po or UNIQUE(source_message_id) fired
    // between our ladder read and the INSERT — re-look-up and LINK, never 500.
    const rows = await query<ExistingCaseRow>(
      `SELECT id, case_po, case_ref, vrm, status_code FROM case_
        WHERE ($1::text IS NOT NULL AND upper(case_po) = upper($1))
           OR ($2::text IS NOT NULL AND source_message_id = $2)
        ORDER BY created_at`,
      [casePo ?? null, original.internetMessageId ?? null],
    );
    if (rows.length >= 1) {
      result = { kind: 'existing', rows: [rows[0]], matchedBy: 'conflict_backstop' };
    } else {
      ctx.error('[retro/create] unique violation with no re-lookup hit');
      return { status: 500, jsonBody: { error: 'retro_conflict_unresolved' } };
    }
  }

  if (result.kind === 'existing') {
    if (result.rows.length > 1) {
      await writeAudit({
        action: AUDIT_ACTION.duplicate_flagged,
        severity: 'warning',
        summary: `Retro create matched ${result.rows.length} existing cases (${result.matchedBy}); held for manual linking`,
        after: { candidateCount: result.rows.length, keys, casePo, candidateIds: result.rows.map((r) => r.id) },
      });
      return { status: 200, jsonBody: { outcome: 'ambiguous', candidateCount: result.rows.length } };
    }
    const hit = result.rows[0];
    await linkEnvelopeRow(trigger, triggerProviderId, hit.id);
    if (reconstructionSource !== 'minimal') {
      // The reconstruction DID recover the original — attach it to the existing case
      // too (the row upsert is keyed on source_message_id, so this is idempotent).
      await linkEnvelopeRow(original, poProviderId, hit.id, retroOriginalClassification(keys, casePo));
    }
    // A locked get-or-create hit is still a replay seam, not a terminal no-op. The
    // first attempt may have created or linked the case before parser fields/provider
    // recovery completed, so re-apply the retained reconstruction idempotently.
    const parserFieldsResult = await applyParserFields(
      hit.id,
      body.parserRef,
      body.parserMileage,
      body.parserMileageUnit,
      body.parserEva,
      poProviderId,
      body.intermediary ?? null,
      {
        caseType: auditGateOn ? caseType : 'standard',
        caseTypeDual: false,
        // TKT-219: with archive-PO adoption OFF (dev/test) the NORMAL allocator may
        // mint even though a folder/PO was discovered (recorded as case_ref only).
        allowCasePoMint: adoptArchivePo ? !casePo && !body.boxFolder?.id : true,
        // Adoption OFF also acknowledges the stamped archive folder: the discovered
        // identity is noted in the audit/note by design, so the archive-folder mint
        // guard must not hold the case for a fork that mode can never make.
        archiveIdentityAcknowledged: !adoptArchivePo,
      },
    );
    const effectiveCasePo =
      parserFieldsResult.casePo ?? (String(hit.case_po ?? '').trim() || null);
    await writeAudit({
      action: AUDIT_ACTION.retro_case_linked,
      caseId: hit.id,
      summary: `Retro: reconstruction found existing case (${result.matchedBy}); linked instead of creating`,
      after: { matchedBy: result.matchedBy, keys, casePo, messageId: trigger.internetMessageId },
    });
    const linkedResolvedProviderId =
      parserFieldsResult.resolvedProviderId ?? poProviderId ?? undefined;
    return {
      status: 200,
      jsonBody: {
        outcome: 'already_exists_linked',
        caseId: hit.id,
        casePo: effectiveCasePo,
        ...(linkedResolvedProviderId ? { resolvedProviderId: linkedResolvedProviderId } : {}),
        providerRecovery: parserFieldsResult.providerRecovery?.outcome ?? 'not_needed',
      },
    };
  }

  const caseId = result.caseId;
  // Link the reconstructed original first (it owns source_message_id on the case), then
  // the trigger. A synthetic 'minimal' anchor is NOT a real email — no original row.
  if (reconstructionSource !== 'minimal') {
    await linkEnvelopeRow(original, poProviderId, caseId, retroOriginalClassification(keys, casePo));
  }
  await linkEnvelopeRow(trigger, triggerProviderId, caseId);

  const parserFieldsResult = await applyParserFields(
    caseId,
    body.parserRef,
    body.parserMileage,
    body.parserMileageUnit,
    body.parserEva,
    poProviderId,
    body.intermediary ?? null,
    {
      caseType: auditGateOn ? caseType : 'standard',
      caseTypeDual: false,
      // A discovered historical PO/folder is never forked WHEN ADOPTION IS ON.
      // Outlook-only recovery has neither, so a provider resolved from its
      // instruction may complete normally. TKT-219: adoption OFF (dev/test) always
      // permits the normal allocator — the discovered PO lives in case_ref only.
      allowCasePoMint: adoptArchivePo ? !casePo && !body.boxFolder?.id : true,
      // Adoption OFF also acknowledges the stamped archive folder: the discovered
      // identity is noted in the audit/note by design, so the archive-folder mint
      // guard must not hold the case for a fork that mode can never make.
      archiveIdentityAcknowledged: !adoptArchivePo,
    },
  );
  const effectiveCasePo =
    parserFieldsResult.casePo ?? (identityVerified ? (casePo ?? null) : null);
  const effectiveProviderId = parserFieldsResult.resolvedProviderId ?? poProviderId;
  const effectivePrincipalResolved = Boolean(effectiveProviderId);
  const effectiveIdentityVerified = effectivePrincipalResolved && Boolean(effectiveCasePo);
  const effectiveOnHold = parserFieldsResult.providerRecovery?.holdCleared === true
    ? false
    : onHold;

  await writeAudit({
    action: AUDIT_ACTION.retro_case_created,
    caseId,
    summary: `Case reconstructed retroactively (${reconstructionSource}): ${name}`,
    after: {
      casePo: effectiveCasePo,
      // The archive folder's own Case/PO, distinct from the (possibly dev-minted)
      // casePo above — the reconciliation query key for dev-mode reconstructions.
      discoveredArchivePo: casePo ?? null,
      status,
      onHold: effectiveOnHold,
      reconstructionSource,
      boxFolderId: body.boxFolder?.id ?? null,
      keys,
      triggerCategory: body.triggerCategory ?? null,
      triggerMessageId: trigger.internetMessageId,
    },
  });

  if (caseType !== 'standard') {
    // ADR-0021 decision trail. The marker case diverges from the mint path ON PURPOSE:
    // an archive marker is a historical fact, honoured even off the mint allowlist —
    // but only ever WRITTEN behind AUDIT_CASES_ENABLED (FK safety + shadow rollout).
    await writeAudit({
      action: AUDIT_ACTION.retro_case_created,
      caseId,
      summary: auditGateOn
        ? `Case-type '${caseType}' applied from ${marker ? `archive marker ${marker}` : 'content detection'}`
        : `Case-type '${caseType}' detected (observe-only — AUDIT_CASES_ENABLED off)`,
      after: {
        caseType,
        marker,
        signals: caseTypeSignals,
        applied: auditGateOn,
        allowlisted: allowedCaseTypes(principalCode).includes(caseType),
      },
    });
  }

  if (!effectiveIdentityVerified) {
    // TKT-219: three honest shapes — dev-mint mode with a genuinely discovered PO
    // (adoption gated off), an unmatched PO-shaped token, and no discovered PO at all.
    // The dev-mode wording says "noted", not "recorded as the case reference": case_ref
    // usually holds keys.externalRef (the caseRefValue chain above), so the PO's durable
    // home is this note + the retro_case_created audit's discoveredArchivePo field.
    const noteText =
      casePo && !adoptArchivePo && principalResolved
        ? `Archive folder Case/PO ${casePo} noted — archive-PO adoption is off in this environment (dev/test), so the case number was minted by the normal allocator. Confirm the details before any further processing.`
        : (casePo
            ? `Reference ${casePo} is Case/PO-shaped but matches no known work-provider principal — stored as the case reference, no Case/PO set. `
            : `No Case/PO could be discovered for this reconstruction. `) +
          `Confirm the provider and Case/PO before any further processing.`;
    await query(
      `INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())`,
      ['Retro reconstruction', caseId, 'Retro reconstruction (auto)', noteText],
    ).catch(() => { /* note is supplementary */ });
    await writeAudit({
      action: AUDIT_ACTION.inbound_routed,
      caseId,
      severity: 'warning',
      summary: 'Retro case held — identity unverified (principal/Case-PO)',
      after: {
        principalResolved: effectivePrincipalResolved,
        casePoKnown: Boolean(effectiveCasePo),
        onHold: effectiveOnHold,
      },
    });
  }

  ctx.log(JSON.stringify({
    evt: 'retroCreate',
    outcome: 'created',
    caseId,
    casePo: effectiveCasePo,
    reconstructionSource,
  }));
  return {
    status: 200,
    jsonBody: {
      outcome: 'created',
      caseId,
      casePo: effectiveCasePo,
      newClient: !effectivePrincipalResolved,
      ...(effectiveProviderId ? { resolvedProviderId: effectiveProviderId } : {}),
      providerRecovery: parserFieldsResult.providerRecovery?.outcome ?? 'not_needed',
    },
  };
}

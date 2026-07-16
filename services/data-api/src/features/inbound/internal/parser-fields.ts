/** parser-fields — cohesive Data API module. */

import { normaliseExtractedEvaMileage } from '@cs/domain';
import { reviewStateCodec, sourceTypeCodec } from '@cs/domain/codecs';
import { tx, type TxQuery } from '../../../platform/db/client.js';
import { AUDIT_ACTION, writeAudit } from '../../../shared/audit.js';
import { corpusWorkProviderCandidate, isEngineerReportLayoutSentinel, isUnknownWorkProviderSentinel, matchWorkProviderByContentString, selectParserEvaCandidates, type ParserEvaFields, type WorkProviderContentMatchRecord } from '../parser-eva-fields.js';
import { type Row } from '../../../shared/mapping/index.js';
import { completeProviderRecoveryUsing, type ProviderRecoveryResult } from '../../providers/recovery.js';
import { requestProviderArchive } from '../../providers/archive-outbox.js';
import { type ApplyParserFieldsResult, type ProviderRecoveryContext, type ProviderResolutionSource } from './service-support.js';

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
  recoveryContext?: ProviderRecoveryContext,
): Promise<ApplyParserFieldsResult> {
  return tx((q) => applyParserFieldsUsing(
    q,
    caseId,
    parserRef,
    parserMileage,
    parserMileageUnit,
    parserEva,
    workProviderId,
    intermediary,
    recoveryContext,
  ));
}

export async function applyParserFieldsUsing(
  q: TxQuery,
  caseId: string,
  parserRef?: string,
  parserMileage?: string,
  parserMileageUnit?: string,
  parserEva?: ParserEvaFields,
  workProviderId?: string | null,
  intermediary?: { imageSourceId: string; candidateProviderIds: readonly string[] } | null,
  recoveryContext?: ProviderRecoveryContext,
): Promise<ApplyParserFieldsResult> {
  let providerResolutionSource: ProviderResolutionSource = 'none';
  let resolvedProviderId: string | undefined;
  let effectiveCasePo = '';
  let providerRecovery: ProviderRecoveryResult | undefined;
  const result = (): ApplyParserFieldsResult => ({
    providerResolutionSource,
    ...(resolvedProviderId ? { resolvedProviderId } : {}),
    ...(effectiveCasePo ? { casePo: effectiveCasePo } : {}),
    ...(providerRecovery ? { providerRecovery } : {}),
  });
  const ref = (parserRef ?? '').trim();
  const mileageRaw = parserMileage != null ? String(parserMileage).trim() : '';
  const mileage = normaliseExtractedEvaMileage(mileageRaw) ?? '';
  const unitRaw = (parserMileageUnit ?? '').trim();
  const unit = unitRaw === 'Miles' || unitRaw === 'Km' ? unitRaw : '';
  const evaCandidates = selectParserEvaCandidates(parserEva);
  const explicitClaimantConflicts = (parserEva?.claimant_conflicts ?? [])
    .map((candidate) => ({
      value: String(candidate?.value ?? '').trim().slice(0, 200),
      sourceType: 'email_text' as const,
      sourceLabel: 'From email body',
      sourceReference: String(candidate?.source_reference ?? parserEva?.source_reference ?? '')
        .trim()
        .slice(0, 400),
    }))
    .filter((candidate) => Boolean(candidate.value));
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
    explicitClaimantConflicts.length === 0 &&
    !mightFillWorkProviderFromCorpus &&
    !mightMatchWorkProviderIdFromContent &&
    !singleIntermediaryCandidate
  ) {
    return result();
  }

  // Read every column we might fill so each write is strictly fill-if-empty.
  const readCols = Array.from(new Set([
    'case_ref',
    'ov_claim_number',
    'eva_mileage',
    'eva_work_provider',
    'work_provider_id',
    'case_po',
    'eva_claimant_name',
    ...evaCandidates.map((c) => c.column),
  ]));
  const cur = await q<Row>(
    `SELECT ${readCols.join(', ')} FROM case_ WHERE id = $1 FOR UPDATE`,
    [caseId],
  );
  if (!cur[0]) return result();
  effectiveCasePo = String(cur[0].case_po ?? '').trim();
  const isEmpty = (v: unknown): boolean => !String(v ?? '').trim();

  const sets: string[] = [];
  const vals: unknown[] = [];
  let mileageFilled = false;
  // Fields filled this run → provenance row each (source type varies by origin).
  const provenance: Array<{
    field: string;
    value: string;
    sourceType: 'pdf_extraction' | 'email_text' | 'corpus';
    sourceLabel: string;
    sourceReference?: string;
  }> = [];
  const claimantConflicts: Array<{
    value: string;
    sourceType: 'pdf_extraction' | 'email_text' | 'corpus';
    sourceLabel: string;
    sourceReference: string;
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
        sourceType: cand.sourceType ?? 'pdf_extraction',
        sourceLabel: cand.sourceLabel ?? 'From instructions',
        sourceReference: String(parserEva?.source_reference ?? '').trim().slice(0, 400),
      });
    } else if (
      cand.provenanceField === 'claimantName' &&
      String(cur[0][cand.column] ?? '').trim().toLocaleLowerCase('en-GB') !==
        cand.value.trim().toLocaleLowerCase('en-GB')
    ) {
      // TKT-150: a later retained source must never silently disappear when it names a
      // different claimant. Keep the current case value, retain the candidate as an
      // unresolved conflict row, and let canonical readiness hold the case for review.
      claimantConflicts.push({
        value: cand.value,
        sourceType: cand.sourceType ?? 'pdf_extraction',
        sourceLabel: cand.sourceLabel ?? 'From instructions',
        sourceReference: String(parserEva?.source_reference ?? '').trim().slice(0, 400),
      });
    }
  }

  const selectedClaimant = evaCandidates.find(
    (candidate) => candidate.provenanceField === 'claimantName',
  )?.value ?? '';
  const effectiveClaimant = String(cur[0].eva_claimant_name ?? '').trim() || selectedClaimant;
  const seenConflictKeys = new Set(
    claimantConflicts.map((candidate) => candidate.value.trim().toLocaleLowerCase('en-GB')),
  );
  for (const candidate of explicitClaimantConflicts) {
    const key = candidate.value.toLocaleLowerCase('en-GB');
    if (
      key === effectiveClaimant.toLocaleLowerCase('en-GB') ||
      seenConflictKeys.has(key)
    ) continue;
    seenConflictKeys.add(key);
    claimantConflicts.push(candidate);
  }

  for (const conflict of claimantConflicts) {
    const sourceCode = sourceTypeCodec.toInt(conflict.sourceType) ?? 100000001;
    const conflictCode = reviewStateCodec.toInt('conflict') ?? 100000003;
    const inserted = await q<{ id: string }>(
      `INSERT INTO field_level_provenance
         (name, case_id, field_name, value, source_type_code, source_label, source_reference,
          review_state_code)
       SELECT $1, $2, 'claimantName', $3, $4, $5, NULLIF($6, ''), $7
       WHERE NOT EXISTS (
         SELECT 1
         FROM field_level_provenance
         WHERE case_id = $2
           AND field_name = 'claimantName'
           AND lower(btrim(COALESCE(value, ''))) = lower(btrim($3))
           AND COALESCE(source_reference, '') = $6
       )
       RETURNING id`,
      [
        `${caseId}:claimantName:conflict`,
        caseId,
        conflict.value,
        sourceCode,
        `${conflict.sourceLabel} — differs from the saved claimant`,
        conflict.sourceReference,
        conflictCode,
      ],
    );
    if (inserted.length > 0) {
      await writeAudit({
        action: AUDIT_ACTION.parser_called,
        caseId,
        severity: 'warning',
        summary: 'A retained source names a different claimant — kept the saved claimant for review',
        before: { claimantName: cur[0].eva_claimant_name },
        after: { candidateClaimantName: conflict.value, provenanceId: inserted[0].id },
      }, q);
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
  // TKT-150: this function now owns the complete provider-recovery transaction. A
  // provider fill/confirmation can clear only a machine-owned `provider_unresolved`
  // hold; the shared advisory-locked allocator, durable status generation and audit
  // run on this same `q`. Staff/manual holds remain untouched.
  if (mightMatchWorkProviderIdFromContent) {
    const providerRows = await q<Row>(
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
          }, q);
        }
      } else if (existingWorkProviderId === contentMatch.workProviderId) {
        // Replay/late-document agreement is still a resolved-provider signal: an older
        // run may have filled the FK and crashed before completing the provider hold.
        providerResolutionSource = 'instruction_content';
        resolvedProviderId = contentMatch.workProviderId;
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
        }, q);
      }
    }
    // 'ambiguous' / 'unmatched' — never guess; the free-text eva_work_provider candidate
    // above (or the corpus fallback below) still carries the human-readable string either way.
  }

  let alreadySettingWorkProviderId = sets.some((s) => s.startsWith('work_provider_id ='));

  // A direct sender-domain match is the conservative fallback when content did not
  // resolve the provider. Create-time already uses this id; attach/replay must also be
  // able to fill an older Held case instead of leaving identity split across e-mail/case.
  const existingWorkProviderId = String(cur[0].work_provider_id ?? '').trim();
  if (matchedProviderId && !resolvedProviderId && !alreadySettingWorkProviderId) {
    if (!existingWorkProviderId) {
      const wpRows = await q<Row>(
        'SELECT display_name FROM work_provider WHERE id = $1 AND active = true',
        [matchedProviderId],
      );
      if (wpRows[0]) {
        sets.push(`work_provider_id = $${sets.length + 1}`);
        vals.push(matchedProviderId);
        providerResolutionSource = 'sender_domain';
        resolvedProviderId = matchedProviderId;
        provenance.push({
          field: 'workProviderId',
          value: matchedProviderId,
          sourceType: 'corpus',
          sourceLabel: 'Matched sender domain',
        });
        alreadySettingWorkProviderId = true;
      }
    } else if (existingWorkProviderId === matchedProviderId) {
      providerResolutionSource = 'sender_domain';
      resolvedProviderId = matchedProviderId;
    }
  }

  // 1c (TKT-065) — single-candidate intermediary fallback for work_provider_id. Runs when the
  // above content-match did NOT set work_provider_id this run (audit case: the parsed
  // instruction was the audited EVA report, so content is empty/denylisted) and the FK is still
  // empty. A single-provider intermediary link is unambiguous → fill it (fill-if-empty), with an
  // audit trail. >1 candidate is left for a human.
  if (singleIntermediaryCandidate && !alreadySettingWorkProviderId && isEmpty(cur[0].work_provider_id)) {
    // Resolve the candidate's row and REQUIRE it active — the intermediary N:N
    // (candidateProviderIds) is NOT itself active-filtered (the image_source join in the
    // provider-match-records route), so a stale link to a deactivated provider must not
    // resolve, exactly as the direct-domain and content-match paths only match active rows.
    const wpRows = await q<Row>(
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
      }, q);
    }
  } else if (
    singleIntermediaryCandidate &&
    !resolvedProviderId &&
    existingWorkProviderId === singleIntermediaryCandidate
  ) {
    providerResolutionSource = 'single_intermediary';
    resolvedProviderId = singleIntermediaryCandidate;
  }

  if (mightFillWorkProviderFromCorpus && isEmpty(cur[0].eva_work_provider)) {
    const wpRows = await q<Row>(
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

  if (sets.length > 0) {
    vals.push(caseId);
    await q(
      `UPDATE case_ SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`,
      vals,
    );
  }

  // Provenance (mirror the manual-create field_level_provenance shape). Written only for
  // fields actually filled this run. Claimant provenance is part of the claimant write's
  // atomic contract: if it cannot be recorded, fail the transaction rather than commit a
  // source-less claimant. Older non-claimant fields retain their best-effort behaviour.
  if (mileageFilled) {
    provenance.unshift({
      field: 'mileage',
      value: mileage.slice(0, 20),
      sourceType: 'pdf_extraction',
      sourceLabel: 'From instructions',
      sourceReference: String(parserEva?.source_reference ?? '').trim().slice(0, 400),
    });
  }
  const pdfSourceTypeCode = sourceTypeCodec.toInt('pdf_extraction') ?? 100000001;
  const emailSourceTypeCode = sourceTypeCodec.toInt('email_text') ?? 100000002;
  const corpusSourceTypeCode = sourceTypeCodec.toInt('corpus') ?? 100000003;
  for (const p of provenance) {
    const sourceTypeCode =
      p.sourceType === 'corpus'
        ? corpusSourceTypeCode
        : p.sourceType === 'email_text'
          ? emailSourceTypeCode
          : pdfSourceTypeCode;
    const insertProvenance = () => q(
      `INSERT INTO field_level_provenance
         (name, case_id, field_name, value, source_type_code, source_label, source_reference)
       VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''))`,
      [
        `${caseId}:${p.field}`,
        caseId,
        p.field,
        p.value,
        sourceTypeCode,
        p.sourceLabel,
        p.sourceReference ?? '',
      ],
    );
    if (p.field === 'claimantName') {
      await insertProvenance();
      continue;
    }

    // PostgreSQL marks a transaction failed after an error, so a catch alone is
    // insufficient for the optional best-effort fields; contain each write in a savepoint.
    await q('SAVEPOINT parser_provenance_write');
    try {
      await insertProvenance();
      await q('RELEASE SAVEPOINT parser_provenance_write');
    } catch (error) {
      await q('ROLLBACK TO SAVEPOINT parser_provenance_write');
      await q('RELEASE SAVEPOINT parser_provenance_write');
      console.warn('[applyParserFields] non-claimant provenance write failed', {
        caseId,
        field: p.field,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (resolvedProviderId && recoveryContext) {
    providerRecovery = await completeProviderRecoveryUsing(q, {
      caseId,
      resolvedProviderId,
      ...(recoveryContext.caseType ? { caseType: recoveryContext.caseType } : {}),
      caseTypeDual: recoveryContext.caseTypeDual === true,
      allowCasePoMint: recoveryContext.allowCasePoMint !== false,
    });
    if (providerRecovery.outcome === 'identity_ready') {
      // Intake and retro reconstruction share this transaction. Register the
      // remote Archive continuation before commit so a lost Durable instance is
      // recovered by the singleton outbox monitor and merge/remove can see the
      // entire remote-create/stamp window as busy.
      await requestProviderArchive(q, caseId);
    }
    effectiveCasePo = providerRecovery.casePo ?? effectiveCasePo;
  }
  return result();
}

/**
 * services/data-api/src/features/inbound/retro-routes.ts — retro case reconstruction routes (ADR-0022 / TKT-058).
 *
 * The Data-API half of the gated retro fallback: when an inbound billing / case_update /
 * cancellation / query email matches NO case, the orchestration retroCaseOrchestrator
 * (services/orchestration/src/workflows/retro/retro-case.ts) first asks this surface whether the
 * case exists ANYWHERE (any status, INCLUDING terminals — the gap linkReply deliberately
 * leaves), then — once the Box archive / Outlook rungs have reconstructed the original
 * instruction — persists the reconstructed case here.
 *
 * Routes (service-token auth, same withServiceAuth as internal.ts):
 *  POST /api/internal/retro/resolve-existing → { outcome: linked|ambiguous|none|gated_off, caseId?, candidateCount }
 *  POST /api/internal/retro/create           → { outcome: created|already_exists_linked|ambiguous|gated_off, caseId?, casePo?, newClient? }
 *
 * INVARIANTS (the ADR-0022 contract):
 *  - HONEST REFUSAL: both routes no-op with outcome 'gated_off' while RETRO_CASE_ENABLED
 *    is not 'true' — defence in depth on top of the orchestration-side gate, so the gate
 *    must be set on BOTH cespk-api-dev and cespk-orch-dev.
 *  - NEVER FORK ARCHIVE IDENTITY: a DISCOVERED archive folder name is stored verbatim only
 *    when its principal is verified; an unresolved value lands in case_ref, NOT case_po.
 *    An Outlook reconstruction with no historical Case/PO or folder may use the normal
 *    provider-recovery allocator after the instruction itself resolves the provider.
 *  - GET-OR-CREATE under the SAME advisory locks the live mint takes (triage-locks.ts) +
 *    the uq_case_case_po / UNIQUE(source_message_id) backstops: a concurrent duplicate
 *    trigger links instead of double-creating; conflicts are outcomes, never 500s.
 *  - TERMINAL ONLY WHEN VERIFIED: 'eva_submitted' is accepted solely with a resolved
 *    principal + discovered PO (re-asserted here — the domain decideRetroStatus already
 *    guarantees it, but this route never trusts the caller alone).
 *  - NEVER RE-POINT: an inbound_email row that already carries a case_id is left alone —
 *    enforced ATOMICALLY by the upsert SQL itself (persistence.ts's ON CONFLICT keeps
 *    inbound_email.case_id first: COALESCE(inbound_email.case_id, EXCLUDED.case_id)), so
 *    the pre-flight reads here are fast-path courtesies, not the guarantee; callers
 *    compare the RETURNING'd linkedCaseId to detect a lost link race.
 */

import { app } from '@azure/functions';
import {
  allowedCaseTypes,
  markerToCaseType,
  matchPrincipalByCasePo,
  type CaseStatus,
  type CaseWorkType,
} from '@cs/domain';
import { actionReasonCodec, caseStatusCodec, caseTypeCodec, sourceTypeCodec, statusToInt } from '@cs/domain/codecs';
import { gates } from '../settings/gates.js';
import { query, tx, type TxQuery } from '../../platform/db/client.js';
import { AUDIT_ACTION, writeAudit } from '../../shared/audit.js';
import { acquireTriageLocks } from './triage-locks.js';
import { type ParserEvaFields } from './parser-eva-fields.js';
import { type Row } from '../../shared/mapping/index.js';
import {
  validateRetroBackfillFields,
  validateRetroCreate,
  validateRetroResolveExisting,
  type NormalisedRetroKeys,
  type RetroKeysDto,
} from './retro-validate.js';
import { applyParserFields, applyParserFieldsUsing } from './internal/parser-fields.js';
import { isUniqueViolation } from './internal/unique-violation.js';
import { mintBlockedByCategory, withServiceAuth } from './internal/service-support.js';
import { insertPendingSuggestion } from './suggestion-write.js';
import { upsertInboundEmail } from './persistence.js';
import {
  type InboundClassificationDto,
  type InboundEnvelope,
} from './internal/inbound-identity.js';
import { clampVarchar, vrmOrEmpty } from '../../shared/validation/varchar.js';

/** choice_intake_channel_kind code for 'retro' (deltas/2026-07-04-retro-case.sql).
 *  Literal, per the PROVIDER_API_CHANNEL_CODE precedent (provider-intake.ts / ADR-0020):
 *  the shared intakeChannelKindCodec union lags the DDL by design until the R4 widening. */
const RETRO_CHANNEL_CODE = 100000003;

/** TKT-231 — per-trigger cap on ambiguous-resolution case_link suggestions (rows ordering,
 *  i.e. oldest case first). A wildly ambiguous key (6 live rows today, but unbounded in
 *  principle) must not carpet the banner queue. */
const RETRO_AMBIGUOUS_SUGGESTION_CAP = 5;

/** TKT-231 — plain business language for the banner rationale (never internal tokens). */
const MATCHED_BY_LABEL: Record<string, string> = {
  case_po: 'its Case/PO reference',
  external_ref: 'the provider reference',
  vrm: 'the vehicle registration',
};

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

interface ExistingCaseRow extends Row {
  id: string;
  case_po: string | null;
  case_ref: string | null;
  vrm: string | null;
  status_code: number;
}

/**
 * The ANY-STATUS existence ladder (the whole point of this surface — linkReply matches
 * open cases only): probe the strongest present key first, falling to the next only on
 * ZERO hits. Reference keys probe case_po AND case_ref (either may hold the token); the
 * VRM probe is provider-scoped when a provider is known (ADR-0010: never auto-link
 * across providers on a registration alone) and single-hit-only either way.
 */
async function findExistingCases(
  q: TxQuery,
  keys: NormalisedRetroKeys,
  providerId: string | null,
): Promise<{ rows: ExistingCaseRow[]; matchedBy: 'case_po' | 'external_ref' | 'vrm' | null }> {
  const SELECT = 'SELECT id, case_po, case_ref, vrm, status_code FROM case_';
  for (const [token, matchedBy] of [
    [keys.casePo, 'case_po'],
    [keys.externalRef, 'external_ref'],
  ] as const) {
    if (!token) continue;
    const rows = await q<ExistingCaseRow>(
      `${SELECT} WHERE (upper(case_po) = upper($1) OR upper(case_ref) = upper($1)) ORDER BY created_at`,
      [token],
    );
    if (rows.length > 0) return { rows, matchedBy };
  }
  if (keys.vrm) {
    const rows = providerId
      ? await q<ExistingCaseRow>(`${SELECT} WHERE vrm = $1 AND work_provider_id = $2 ORDER BY created_at`, [
          keys.vrm,
          providerId,
        ])
      : await q<ExistingCaseRow>(`${SELECT} WHERE vrm = $1 ORDER BY created_at`, [keys.vrm]);
    if (rows.length > 0) return { rows, matchedBy: 'vrm' };
  }
  return { rows: [], matchedBy: null };
}

/** The trigger row's presence + current case link, MAILBOX-QUALIFIED to the dedup key
 *  (source_mailbox, source_message_id) — an eml-arm anchor can share an Internet-Message-Id
 *  with the live delivery in a real mailbox, and an unqualified read would see the wrong
 *  row (NEVER RE-POINT guard + the exists probe for classification preservation). */
async function currentInboundLink(
  internetMessageId: string,
  sourceMailbox: string,
): Promise<{ exists: boolean; caseId: string | null }> {
  const rows = await query<Row>(
    `SELECT case_id FROM inbound_email WHERE source_message_id = $1 AND source_mailbox = $2`,
    [internetMessageId, (sourceMailbox ?? '').trim().toLowerCase()],
  );
  return { exists: rows.length > 0, caseId: (rows[0]?.case_id as string | null) ?? null };
}

/** Link one envelope's inbound_email row to a case ('routed'). The upsert SQL enforces
 *  first-link-wins atomically; true means THIS case holds the link (pre-existing or
 *  stamped now) — a lost race to another case, or a swallowed upsert failure, is false. */
async function linkEnvelopeRow(
  envelope: InboundEnvelope,
  providerId: string | null,
  caseId: string,
  classification?: InboundClassificationDto,
): Promise<boolean> {
  const existing = await currentInboundLink(envelope.internetMessageId, envelope.sourceMailbox);
  if (existing.caseId) return existing.caseId === caseId;
  const { linkedCaseId } = await upsertInboundEmail(
    envelope, providerId, caseId, classification, undefined, 'routed',
  );
  return linkedCaseId === caseId;
}

/* ============================================================
   POST /api/internal/retro/resolve-existing
   ============================================================ */
app.http('internalRetroResolveExisting', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/retro/resolve-existing',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      if (!gates.retroCase()) {
        return { status: 200, jsonBody: { outcome: 'gated_off', candidateCount: 0 } };
      }
      const body = (await req.json()) as {
        trigger: InboundEnvelope;
        keys: RetroKeysDto;
        providerId?: string;
        triggerCategory?: string;
      };
      const v = validateRetroResolveExisting(body);
      if (!v.ok) return { status: 400, jsonBody: { error: v.code, message: v.message } };
      const { keys } = v.value;
      const providerId = body.providerId ?? null;

      // NEVER RE-POINT: a trigger already linked (staff or an earlier run) short-circuits.
      const already = await currentInboundLink(
        body.trigger.internetMessageId,
        body.trigger.sourceMailbox,
      );
      if (already.caseId) {
        return {
          status: 200,
          jsonBody: { outcome: 'linked', caseId: already.caseId, candidateCount: 1 },
        };
      }

      // Same lock keys the live mint / linkReply / triage-context take for this ref/vrm, so
      // this any-status read serialises against a concurrent mint instead of racing it.
      const { rows, matchedBy } = await tx(async (q) => {
        await acquireTriageLocks(q, {
          caseref: keys.casePo ?? keys.externalRef,
          jobref: keys.casePo ? keys.externalRef : undefined,
          vrm: keys.vrm,
        });
        return findExistingCases(q, keys, providerId);
      });

      if (rows.length === 1) {
        const hit = rows[0];
        const statusName = caseStatusCodec.toName(hit.status_code) ?? String(hit.status_code);
        const { linkedCaseId } = await upsertInboundEmail(
          body.trigger, providerId, hit.id, undefined, undefined, 'routed',
        );
        if (linkedCaseId && linkedCaseId !== hit.id) {
          // Lost link race: a concurrent path stamped the trigger onto ANOTHER case between
          // the pre-flight read and the upsert (first-link-wins kept that link). The honest
          // resolution is the case that actually holds the row — no retro_case_linked audit
          // for a link this run did not make.
          ctx.log(JSON.stringify({
            evt: 'retroResolveExisting', outcome: 'linked', caseId: linkedCaseId, lostRaceTo: linkedCaseId,
          }));
          return {
            status: 200,
            jsonBody: { outcome: 'linked', caseId: linkedCaseId, candidateCount: 1 },
          };
        }
        await writeAudit({
          action: AUDIT_ACTION.retro_case_linked,
          caseId: hit.id,
          // 'removed' is matched ON PURPOSE (a soft-removed case must still swallow its
          // mail rather than let a duplicate be reconstructed) but staff should see it.
          severity: statusName === 'removed' ? 'warning' : 'info',
          summary: `Retro: ${body.triggerCategory ?? 'update'} email linked to existing ${statusName} case (${matchedBy})`,
          after: {
            matchedBy,
            keys,
            status: statusName,
            messageId: body.trigger.internetMessageId,
          },
        });
        ctx.log(JSON.stringify({ evt: 'retroResolveExisting', outcome: 'linked', caseId: hit.id, matchedBy }));
        return { status: 200, jsonBody: { outcome: 'linked', caseId: hit.id, candidateCount: 1 } };
      }

      if (rows.length > 1) {
        await writeAudit({
          action: AUDIT_ACTION.duplicate_flagged,
          severity: 'warning',
          summary: `Retro: ${body.triggerCategory ?? 'update'} email matched ${rows.length} cases (${matchedBy}); held for manual linking`,
          after: { candidateCount: rows.length, matchedBy, keys, candidateIds: rows.map((r) => r.id) },
        });
        // TKT-231 — "held for manual linking" now has a staff-visible surface: one pending
        // `case_link` suggestion per candidate (capped, rows ordering) feeding the EXISTING
        // "Attach to case" banner + review routes. Passive by design — autoAttach is NEVER
        // set (never auto-mint; a human picks the right case). Idempotent per
        // (inbound_email, target case): a re-run mints zero new rows. Best-effort: a
        // suggestion hiccup never changes the ambiguous outcome. Known v1 limitation: the
        // banner renders the FIRST pending suggestion per row, so multiple candidates
        // surface sequentially — a picker UI is a follow-up.
        try {
          // The trigger's inbound_email row exists by now on the orchestrated path
          // (classifyInbound upserted it earlier in the same run); a missing row degrades
          // to the sourceMessageId-subject idempotency key inside the shared writer.
          const trig = await query<Row>(
            `SELECT id FROM inbound_email WHERE source_message_id = $1 AND source_mailbox = $2`,
            [
              body.trigger.internetMessageId,
              (body.trigger.sourceMailbox ?? '').trim().toLowerCase(),
            ],
          );
          const inboundEmailId = (trig[0]?.id as string | undefined) ?? null;
          const candidateIds = rows.map((r) => r.id);
          let written = 0;
          for (const candidate of rows.slice(0, RETRO_AMBIGUOUS_SUGGESTION_CAP)) {
            const suggestion = await insertPendingSuggestion({
              suggestionType: 'case_link',
              inboundEmailId,
              sourceMessageId: body.trigger.internetMessageId ?? null,
              targetCaseId: candidate.id,
              rationale: `This email matched more than one case by ${MATCHED_BY_LABEL[matchedBy ?? ''] ?? 'its reference'}; choose the right one`,
              confidence: null,
              decisionInputs: { matchedBy, keys, candidateIds, source: 'retro_ambiguous' },
            });
            if (suggestion.created) written++;
          }
          ctx.log(JSON.stringify({
            evt: 'retroAmbiguousSuggestions',
            candidates: rows.length,
            capped: Math.min(rows.length, RETRO_AMBIGUOUS_SUGGESTION_CAP),
            written,
          }));
        } catch (e) {
          ctx.warn(`[retro/resolve-existing] ambiguous case_link suggestions failed (best-effort): ${String(e)}`);
        }
        ctx.log(JSON.stringify({ evt: 'retroResolveExisting', outcome: 'ambiguous', count: rows.length }));
        return { status: 200, jsonBody: { outcome: 'ambiguous', candidateCount: rows.length } };
      }

      ctx.log(JSON.stringify({ evt: 'retroResolveExisting', outcome: 'none' }));
      return { status: 200, jsonBody: { outcome: 'none', candidateCount: 0 } };
    }),
});

/* ============================================================
   POST /api/internal/retro/link-related  (TKT-222)
   ============================================================ */
/** Per-run cap on NEW related-email links. The caller sends EVERY corroborated candidate
 *  (uncapped since the F12 fix); this route walks them all but only the first
 *  RELATED_LINK_CAP rows that would create a NEW link actually link. alreadyLinked rows
 *  never consume cap, so a re-run advances past the previous run's links instead of
 *  re-counting them. */
const RELATED_LINK_CAP = 25;

app.http('internalRetroLinkRelated', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/retro/link-related',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      if (!gates.retroCase()) {
        return { status: 200, jsonBody: { outcome: 'gated_off', linked: 0, skipped: 0 } };
      }
      const body = (await req.json()) as { caseId?: string; rows?: InboundEnvelope[] };
      const caseId = (body.caseId ?? '').trim();
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!caseId || rows.length === 0) {
        return { status: 400, jsonBody: { error: 'invalid_body', message: 'caseId and rows[] required' } };
      }
      let linked = 0;
      let skipped = 0;
      let skippedByCap = 0;
      // TKT-225 — identify WHICH rows are ingest-eligible (additive; count consumers
      // unchanged): freshly linked rows, plus rows ALREADY linked to THIS case so a
      // force re-run can heal the TKT-222 v1 pile (row-links without evidence).
      const linkedIds: string[] = [];
      const alreadyLinkedIds: string[] = [];
      for (const row of rows) {
        const imid = (row?.internetMessageId ?? '').trim();
        if (!imid) {
          skipped++;
          continue;
        }
        // NEVER RE-POINT: a row already linked anywhere (this case included — idempotent
        // replays) is left alone. Mailbox-qualified: the same Internet-Message-Id may
        // exist under another mailbox's row.
        const existing = await currentInboundLink(imid, row.sourceMailbox);
        if (existing.caseId) {
          if (existing.caseId === caseId) alreadyLinkedIds.push(imid);
          skipped++;
          continue;
        }
        if (linked >= RELATED_LINK_CAP) {
          skippedByCap++;
          continue;
        }
        // Preserve an EXISTING row's triage classification: only a row this run INSERTS
        // gets the retro_related tuple — persistence's COALESCE(EXCLUDED.category_code, …)
        // then leaves an already-triaged row's category/subtype untouched while the
        // case link still lands.
        const classification: InboundClassificationDto | undefined = existing.exists
          ? undefined
          : {
              category: 'case_update',
              subtype: 'retro_related',
              confidence: 0,
              signals: ['retro_related_linked'],
              bodyVrm: '',
              bodyCaseref: '',
              bodyJobref: '',
            };
        const { linkedCaseId } = await upsertInboundEmail(
          row,
          null,
          caseId,
          classification,
          undefined,
          'routed',
        );
        if (linkedCaseId === caseId) {
          linkedIds.push(imid);
          linked++;
        } else {
          // A lost first-link race (the row went to another case) or a swallowed upsert
          // failure — either way THIS case gained no mail, so the row must not feed
          // linkedIds (ingest eligibility stays honest).
          skipped++;
        }
      }
      if (linked > 0) {
        await writeAudit({
          action: AUDIT_ACTION.retro_case_linked,
          caseId,
          summary: `Retro: ${linked} related email(s) linked from mailbox history`,
          after: { linked, skipped, skippedByCap, seam: 'retro/link-related' },
        });
      }
      if (skippedByCap > 0) {
        ctx.log(JSON.stringify({
          evt: 'retroLinkRelatedCapped', caseId, cap: RELATED_LINK_CAP, skippedByCap,
        }));
      }
      ctx.log(JSON.stringify({ evt: 'retroLinkRelated', caseId, linked, skipped, skippedByCap }));
      return {
        status: 200,
        jsonBody: { linked, skipped, skippedByCap, linkedIds, alreadyLinkedIds },
      };
    }),
});

/* ============================================================
   POST /api/internal/retro/backfill-fields  (TKT-225)
   ============================================================ */
app.http('internalRetroBackfillFields', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/retro/backfill-fields',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      if (!gates.retroCase()) {
        return { status: 200, jsonBody: { outcome: 'gated_off' } };
      }
      const body = (await req.json()) as {
        caseId?: string;
        sourceInternetMessageId?: string;
        parserVrm?: string;
        parserRef?: string;
        parserMileage?: string;
        parserMileageUnit?: 'Miles' | 'Km' | '';
        parserEva?: ParserEvaFields;
      };
      const v = validateRetroBackfillFields(body);
      if (!v.ok) return { status: 400, jsonBody: { error: v.code, message: v.message } };
      const { caseId, sourceInternetMessageId } = v.value;

      // TKT-073 junk guard: an over-length "VRM" is junk — dropped, never truncated into
      // the correlation key.
      const vrmGuard = vrmOrEmpty(body.parserVrm);
      if (vrmGuard.dropped) {
        ctx.warn(
          `[retro/backfill-fields] over-length VRM candidate dropped (junk sniff > varchar(16)) for case ${caseId}`,
        );
      }
      const parserVrm = vrmGuard.value;

      const { applied, vrmFilled } = await tx(async (q) => {
        if (parserVrm) {
          // Same lock key the live mint takes for this VRM, so the fill serialises
          // against a concurrent mint/link instead of racing it.
          await acquireTriageLocks(q, { vrm: parserVrm });
        }
        const before = await q<Row>(`SELECT to_jsonb(c) AS snapshot FROM case_ c WHERE id = $1`, [
          caseId,
        ]);
        if (!before[0]) return { applied: false, vrmFilled: false };

        // VRM fill-if-empty — the one case_ field applyParserFields doesn't own. Strictly
        // conditional on an empty column (never an overwrite), with provenance + audit.
        let filledVrm = false;
        if (parserVrm) {
          const filled = await q<Row>(
            `UPDATE case_ SET vrm = $1, updated_at = now()
              WHERE id = $2 AND (vrm IS NULL OR btrim(vrm) = '') RETURNING id`,
            [parserVrm, caseId],
          );
          if (filled.length > 0) {
            filledVrm = true;
            await q(
              `INSERT INTO field_level_provenance
                 (name, case_id, field_name, value, source_type_code, source_label, source_reference)
               VALUES ($1, $2, 'vrm', $3, $4, $5, NULLIF($6, ''))`,
              [
                `${caseId}:vrm`,
                caseId,
                parserVrm,
                sourceTypeCodec.toInt('pdf_extraction') ?? 100000001,
                'From related correspondence',
                sourceInternetMessageId,
              ],
            );
            await writeAudit({
              action: AUDIT_ACTION.parser_called,
              caseId,
              summary: 'Retro related ingest: registration filled from related correspondence',
              after: { vrm: parserVrm, sourceMessageId: sourceInternetMessageId },
            }, q);
          }
        }

        // D1/D7 — the shared fill-gaps engine, deliberately with NO sender-domain provider,
        // NO intermediary and NO recoveryContext: strictly fill-if-empty, no Case/PO mint,
        // no provider-recovery completion from a related email. Only the parser's
        // content-detected provider may fill work_provider_id (fill-if-empty; a mismatch is
        // audit-only, per ADR-0011). Note the create seam passes `body.intermediary ?? null`
        // — this route intentionally does not.
        await applyParserFieldsUsing(
          q,
          caseId,
          body.parserRef,
          body.parserMileage,
          body.parserMileageUnit,
          body.parserEva,
          /* workProviderId */ null,
          /* intermediary */ null,
          /* recoveryContext */ undefined,
        );

        const after = await q<Row>(`SELECT to_jsonb(c) AS snapshot FROM case_ c WHERE id = $1`, [
          caseId,
        ]);
        return {
          applied:
            JSON.stringify(before[0]?.snapshot ?? null) !==
            JSON.stringify(after[0]?.snapshot ?? null),
          vrmFilled: filledVrm,
        };
      });

      if (applied) {
        await writeAudit({
          action: AUDIT_ACTION.parser_called,
          caseId,
          summary: 'Retro related ingest: parsed details filled gaps on the case',
          after: { sourceMessageId: sourceInternetMessageId, vrmFilled, seam: 'retro/backfill-fields' },
        });
      }
      ctx.log(JSON.stringify({
        evt: 'retroBackfillFields', caseId, outcome: applied ? 'applied' : 'noop', vrmFilled,
      }));
      return {
        status: 200,
        jsonBody: { outcome: applied ? 'applied' : 'noop', ...(vrmFilled ? { vrmFilled } : {}) },
      };
    }),
});

/* ============================================================
   POST /api/internal/retro/create
   ============================================================ */
app.http('internalRetroCreate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/retro/create',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
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
    }),
});

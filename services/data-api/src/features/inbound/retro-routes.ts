/**
 * services/data-api/src/features/inbound/retro-routes.ts — retro case reconstruction routes
 * (ADR-0022 / TKT-058). The registrar + the read/link routes of the gated retro fallback.
 *
 * The Data-API half of the gated retro fallback: when an inbound billing / case_update /
 * cancellation / query email matches NO case, the orchestration retroCaseOrchestrator
 * (services/orchestration/src/workflows/retro/retro-case.ts) first asks this surface whether the
 * case exists ANYWHERE (any status, INCLUDING terminals — the gap linkReply deliberately
 * leaves), then — once the Box archive / Outlook rungs have reconstructed the original
 * instruction — persists the reconstructed case via runRetroCreate (retro-create.ts).
 *
 * Routes (service-token auth, same withServiceAuth as internal.ts):
 *  POST /api/internal/retro/resolve-existing → { outcome: linked|ambiguous|none|gated_off, caseId?, candidateCount }
 *  POST /api/internal/retro/link-related     → { linked, skipped, skippedByCap, linkedIds, alreadyLinkedIds } (TKT-222/225)
 *  POST /api/internal/retro/backfill-fields  → { outcome: applied|noop|gated_off, vrmFilled? } (TKT-225)
 *  POST /api/internal/retro/create           → { outcome: created|already_exists_linked|ambiguous|gated_off, ... } (runRetroCreate)
 *
 * The four app.http registrations live here (the runtime contract's route source); the CREATE
 * handler body lives in retro-create.ts and the shared existence/link primitives in
 * retro-case-lookup.ts. Behaviour + public surface are unchanged by that split.
 *
 * INVARIANTS (the ADR-0022 contract):
 *  - HONEST REFUSAL: every route no-ops with outcome 'gated_off' while RETRO_CASE_ENABLED
 *    is not 'true' — defence in depth on top of the orchestration-side gate, so the gate
 *    must be set on BOTH cespk-api-dev and cespk-orch-dev.
 *  - GET-OR-CREATE under the SAME advisory locks the live mint takes (triage-locks.ts) +
 *    the uq_case_case_po / UNIQUE(source_message_id) backstops: a concurrent duplicate
 *    trigger links instead of double-creating; conflicts are outcomes, never 500s.
 *  - NEVER RE-POINT: an inbound_email row that already carries a case_id is left alone —
 *    enforced ATOMICALLY by the upsert SQL itself (persistence.ts's ON CONFLICT keeps
 *    inbound_email.case_id first: COALESCE(inbound_email.case_id, EXCLUDED.case_id)), so
 *    the pre-flight reads here are fast-path courtesies, not the guarantee; callers
 *    compare the RETURNING'd linkedCaseId to detect a lost link race.
 */

import { app } from '@azure/functions';
import { caseStatusCodec, sourceTypeCodec } from '@cs/domain/codecs';
import { gates } from '../settings/gates.js';
import { query, tx } from '../../platform/db/client.js';
import { AUDIT_ACTION, writeAudit } from '../../shared/audit.js';
import { acquireTriageLocks } from './triage-locks.js';
import { type ParserEvaFields } from './parser-eva-fields.js';
import { type Row } from '../../shared/mapping/index.js';
import {
  validateRetroBackfillFields,
  validateRetroResolveExisting,
  type RetroKeysDto,
} from './retro-validate.js';
import { applyParserFieldsUsing } from './internal/parser-fields.js';
import { withServiceAuth } from './internal/service-support.js';
import { insertPendingSuggestion } from './suggestion-write.js';
import { upsertInboundEmail } from './persistence.js';
import {
  type InboundClassificationDto,
  type InboundEnvelope,
} from './internal/inbound-identity.js';
import { vrmOrEmpty } from '../../shared/validation/varchar.js';
import { currentInboundLink, findExistingCases } from './retro-case-lookup.js';
import { runRetroCreate } from './retro-create.js';

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
  handler: (req, ctx) => withServiceAuth(req, ctx, () => runRetroCreate(req, ctx)),
});


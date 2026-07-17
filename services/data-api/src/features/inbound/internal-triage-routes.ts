/** internal-triage-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { caseStatusCodec } from '@cs/domain/codecs';
import { query, tx } from '../../platform/db/client.js';
import { AUDIT_ACTION, writeAudit } from '../../shared/audit.js';
import { INBOUND_CATEGORY_TO_INT, INBOUND_SUBTYPE_TO_INT, mergedIntoFrom, type Row } from '../../shared/mapping/index.js';
import { hasColumn } from '../../platform/db/schema-introspection.js';
import { acquireTriageLocks } from './triage-locks.js';
import { insertPendingSuggestion } from './suggestion-write.js';
import { markOutstandingChasersResponded, TERMINAL_INT_CODES, withServiceAuth } from './internal/service-support.js';

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

      // The idempotency check, Case/PO enrichment, INSERT and type-specific audit live in
      // the SHARED writer (suggestion-write.ts) — TKT-231 extracted them so the retro
      // ambiguous-resolution seam mints identical case_link suggestions.
      const written = await insertPendingSuggestion({
        suggestionType,
        inboundEmailId,
        sourceMessageId,
        targetCaseId,
        rationale,
        confidence,
        decisionInputs,
        triageCategory,
        triageSubtype,
        modelVersion: (body.modelVersion ?? '').trim() || undefined,
      });
      if (written.suggestionId && !written.created) {
        return { status: 200, jsonBody: { suggestionId: written.suggestionId, created: false } };
      }
      const suggestionId = written.suggestionId;
      if (!suggestionId) {
        return { status: 500, jsonBody: { error: 'suggestion insert returned no id' } };
      }

      let autoAttached = false;
      if (suggestionType === 'case_link') {
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
      }
      // (The cancellation / triage_category audits ride the shared writer above.)

      ctx.log(JSON.stringify({ evt: 'triageSuggestLink', suggestionType, suggestionId, targetCaseId, autoAttached }));
      return { status: 200, jsonBody: { suggestionId, created: true, ...(autoAttached ? { autoAttached: true } : {}) } };
    }),
});

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

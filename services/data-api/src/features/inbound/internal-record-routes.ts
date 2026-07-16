/** internal-record-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { tx } from '../../platform/db/client.js';
import { AUDIT_ACTION, writeAudit } from '../../shared/audit.js';
import { type Row } from '../../shared/mapping/index.js';
import { acquireTriageLocks } from './triage-locks.js';
import { vrmLinkRefConflict } from './link-guards.js';
import { type InboundClassificationDto, type InboundEnvelope } from './internal/inbound-identity.js';
import { markOutstandingChasersResponded, TERMINAL_INT_CODES, withServiceAuth } from './internal/service-support.js';
import { upsertInboundEmail } from './persistence.js';

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
      // takes the SAME advisory locks (services/data-api/src/features/inbound/triage-locks.ts) internalCasesResolve's
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

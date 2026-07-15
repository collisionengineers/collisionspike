/** activity-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { casePoSequenceRegex, casePoYear, formatCasePo, type NextCasePoResult, type RemoveCaseResult } from '@cs/domain';
import { statusToInt } from '@cs/domain/codecs';
import { withRole } from '../../platform/auth/staff-auth.js';
import { query } from '../../platform/db/client.js';
import { casePoFloor } from './case-po.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../../shared/audit.js';
import { gates } from '../settings/gates.js';
import { listBoxFolderNames } from '../../platform/http/service-client.js';
import { maxCasePoSeqFromNames, rowToActivityEvent, rowToEvidence, type Row } from '../../shared/mapping/index.js';
import { loadCaseLite } from './case-support.js';

app.http('imagesForCase', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases/{id}/images',
  handler: withRole('CollisionSpike.User', async (req) => {
    const id = req.params.id;
    const rows = await query<Row>(
      // Automatic exclusions stay visible in the REVIEW list so staff can recover a false
      // positive. Non-classifier exclusions stay hidden. Every returned excluded
      // row remains acceptedForEva=false and therefore cannot affect readiness/order/export.
      "SELECT * FROM evidence WHERE case_id = $1 AND kind_code = (SELECT code FROM choice_evidence_kind WHERE name = 'image') AND (excluded = false OR exclusion_decision_source = 'classifier' OR person_reflection = true) ORDER BY sequence_index NULLS LAST, created_at",
      [id],
    );
    return { status: 200, jsonBody: rows.map(rowToEvidence) };
  }),
});

app.http('recentActivity', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'activity',
  handler: withRole('CollisionSpike.User', async () => {
    const rows = await query<Row>('SELECT * FROM audit_event ORDER BY occurred_at DESC LIMIT 200');
    return { status: 200, jsonBody: rows.map(rowToActivityEvent) };
  }),
});

app.http('activityForCase', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases/{id}/activity',
  handler: withRole('CollisionSpike.User', async (req) => {
    const id = req.params.id;
    const rows = await query<Row>(
      'SELECT * FROM audit_event WHERE case_id = $1 ORDER BY occurred_at DESC',
      [id],
    );
    return { status: 200, jsonBody: rows.map(rowToActivityEvent) };
  }),
});

app.http('removeCase', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'cases/{id}',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const id = req.params.id;
    const body = (await req.json().catch(() => ({}))) as {
      acknowledgeArchiveFolderHandled?: boolean;
      reason?: string;
    };
    const actor = actorFromClaims(claims);

    const existing = await loadCaseLite(id);
    if (!existing) return { status: 404, jsonBody: { error: 'not found' } };

    // Idempotent: a re-close is a no-op success (never errors on an already-closed case).
    if (existing.status === 'removed') {
      const done: RemoveCaseResult = {
        id,
        status: 'removed',
        alreadyRemoved: true,
        ...(existing.boxFolderUrl ? { boxFolderUrl: existing.boxFolderUrl } : {}),
      };
      return { status: 200, jsonBody: done };
    }

    const before = {
      status: existing.status,
      vrm: existing.vrm,
      casePo: existing.casePo ?? null,
      provider: existing.provider,
    };

    // Close: status -> 'removed' (terminal), hold cleared, closed_at stamped.
    // NOTHING is blanked — the record keeps its details for the file.
    const closed = await query<{ id: string }>(
      `UPDATE case_
          SET status_code = $2, on_hold = false, on_hold_reason = NULL,
              closed_at = now(), updated_at = now()
        WHERE id = $1
          AND on_hold_reason IS DISTINCT FROM 'provider_archive_pending'
          AND provider_archive_completed_generation >= provider_archive_requested_generation
      RETURNING id`,
      [id, statusToInt('removed')],
    );
    if (!closed[0]) {
      return {
        status: 409,
        jsonBody: {
          error: 'Archive folder work is still finishing for this case. Try again shortly.',
        },
      };
    }

    await writeAudit({
      action: AUDIT_ACTION.case_removed,
      caseId: id,
      summary: `Case closed: ${before.vrm || before.casePo || id}`,
      before,
      after: {
        status: 'removed',
        // The archive tickbox is an INTENT FLAG only — no automated Box deletion (ADR-0017).
        archiveFolderAcknowledged: body.acknowledgeArchiveFolderHandled === true,
        boxFolderId: existing.boxFolderId ?? null,
        boxFolderUrl: existing.boxFolderUrl ?? null,
        ...(typeof body.reason === 'string' && body.reason.trim() ? { reason: body.reason.trim() } : {}),
      },
      ...(actor ? { actor } : {}),
    });

    const result: RemoveCaseResult = {
      id,
      status: 'removed',
      alreadyRemoved: false,
      ...(existing.boxFolderUrl ? { boxFolderUrl: existing.boxFolderUrl } : {}),
    };
    return { status: 200, jsonBody: result };
  }),
});

app.http('nextCasePo', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases/next-po',
  handler: withRole('CollisionSpike.User', async (req, ctx) => {
    const principalRaw = (req.query.get('principal') ?? '').trim();
    if (!principalRaw) return { status: 400, jsonBody: { error: 'principal is required' } };
    const principal = principalRaw.toUpperCase();
    // Leading-alpha provider code, alphanumeric, ≤ 8 (matches work_provider.principal_code).
    if (!/^[A-Z][A-Z0-9]{0,7}$/.test(principal)) {
      return { status: 400, jsonBody: { error: 'invalid principal code' } };
    }
    const yearParam = (req.query.get('year') ?? '').trim();
    const yy = /^\d{2}$/.test(yearParam)
      ? yearParam
      : /^\d{4}$/.test(yearParam)
        ? yearParam.slice(-2)
        : casePoYear();
    const prefix = `${principal}${yy}`;

    // 1) DB history (authoritative). Strip the prefix by length so the contiguous year digits
    //    are not swept into the sequence (e.g. "CCPY26050" -> 050, not 26050).
    const seqRows = await query<{ max_seq: string | number }>(
      `SELECT COALESCE(MAX(SUBSTRING(upper(case_po) FROM length($3) + 1)::int), 0) AS max_seq
         FROM case_
        WHERE upper(case_po) LIKE $1 AND upper(case_po) ~ $2`,
      [`${prefix}%`, casePoSequenceRegex(principal, yy), prefix],
    );
    let maxSeq = Number(seqRows[0]?.max_seq ?? 0);
    let source: 'db' | 'box' | 'floor' = 'db';

    // 2) Box fallback — ONLY when the DB has no history for this (principal, year) AND Box is on.
    if (maxSeq === 0 && gates.boxApi() && gates.boxFolderRootId() && process.env.BOX_FN_URL) {
      try {
        const names = await listBoxFolderNames(gates.boxFolderRootId());
        const boxMax = maxCasePoSeqFromNames(names, principal, yy);
        if (boxMax > 0) {
          maxSeq = boxMax;
          source = 'box';
        }
      } catch (e) {
        ctx.error(`[next-po] Box fallback failed: ${String(e)}`); // best-effort; fall back to seq 1
      }
    }

    // 3) ADR-0022 cutover floor — the seeded real-world maximum outranks both baselines, so
    //    the PREVIEW matches what mintCasePo will actually allocate.
    const floor = await casePoFloor(query, prefix);
    if (floor > maxSeq) {
      maxSeq = floor;
      source = 'floor';
    }

    const nextSeq = maxSeq + 1;
    const casePo = formatCasePo(principal, yy, nextSeq);
    const result: NextCasePoResult = {
      principal,
      yy,
      seq: String(nextSeq).padStart(3, '0'),
      nextSeq,
      evaLower: casePo.toLowerCase(),
      boxUpper: casePo,
      source,
    };
    return { status: 200, jsonBody: result };
  }),
});

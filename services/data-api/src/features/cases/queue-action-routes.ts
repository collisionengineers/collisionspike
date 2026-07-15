/** queue-action-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { canonicalizeVrm, isRetiredMerged, type QueueName } from '@cs/domain';
import { withRole } from '../../platform/auth/staff-auth.js';
import { query, tx } from '../../platform/db/client.js';
import { ifMatch, versionToken } from '../../platform/http/concurrency.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../../shared/audit.js';
import { gates } from '../settings/gates.js';
import { ensureActiveBoxFileRequest } from '../archive/file-request-outbox.js';
import { associateOutstandingImageChasersWithFileRequest, imageChaserRequiresUploadLink } from './image-chasers.js';
import { CASE_SELECT, TWIN_TERMINAL, filterQueue, rowToCase, type Row } from '../../shared/mapping/index.js';
import { loadAllCases, nowParam, rowToChaser } from './case-support.js';

app.http('casesForQueue', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'queues/{name}/cases',
  handler: withRole('CollisionSpike.User', async (req) => {
    const name = req.params.name as QueueName;
    const now = nowParam(req);
    const all = await loadAllCases(now);
    return { status: 200, jsonBody: filterQueue(all, name) };
  }),
});

app.http('openVrmTwins', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases',
  handler: withRole('CollisionSpike.User', async (req) => {
    const exclude = req.query.get('exclude') ?? undefined;

    // Case/PO branch: an EXACT, unique handle (uq_case_case_po). The assistant attach flow uses
    // this when a handler names the case by its Case/PO ("add these to CCPY26050") and no
    // registration is present — so the confirm card can resolve the target without a manual
    // registration lookup. Same non-terminal filter as the VRM path (never a removed/finalised
    // case). Case-insensitive match on the stored code.
    const casePo = (req.query.get('case_po') ?? '').trim();
    if (casePo) {
      const rows = await query<Row>(`${CASE_SELECT} WHERE upper(c.case_po) = $1`, [
        casePo.toUpperCase(),
      ]);
      const matches = rows
        .map((r) => rowToCase(r))
        .filter((c) => !TWIN_TERMINAL.has(c.status) && c.id !== exclude);
      return { status: 200, jsonBody: matches };
    }

    const vrm = canonicalizeVrm(req.query.get('vrm') ?? '');
    if (!vrm) return { status: 200, jsonBody: [] };
    // Canonicalise BOTH sides (upper, alnum-only) so a spaced/lower-case query ("YT13 UTV")
    // matches the compacted stored mark ("YT13UTV") — the shared canonicalizeVrm rule, mirrored
    // in SQL. (Small dataset; an expression index on the canonical form is a later optimisation.)
    const rows = await query<Row>(
      `${CASE_SELECT} WHERE regexp_replace(upper(c.vrm), '[^A-Z0-9]', '', 'g') = $1`,
      [vrm],
    );
    const twins = rows
      .map((r) => rowToCase(r))
      // TKT-141: a retired merged duplicate (linked_to_instruction + mergedInto) is
      // resolved work — never an open twin, exactly like the terminal set.
      .filter((c) => !TWIN_TERMINAL.has(c.status) && !isRetiredMerged(c) && c.id !== exclude);
    return { status: 200, jsonBody: twins };
  }),
});

app.http('setOnHold', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/hold',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const id = req.params.id;
    const body = (await req.json()) as { onHold: boolean };
    if (typeof body.onHold !== 'boolean') {
      return { status: 400, jsonBody: { error: 'onHold must be a boolean' } };
    }
    const actor = actorFromClaims(claims);
    const outcome = await tx(async (q) => {
      const current = await q<Row>(
        'SELECT updated_at FROM case_ WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!current[0]) return { kind: 'missing' as const };
      const currentVersion = versionToken(current[0].updated_at);
      const expected = ifMatch(req);
      if (expected != null && expected !== '' && expected !== currentVersion) {
        return { kind: 'stale' as const, currentVersion };
      }
      const updated = await q<Row>(
        `UPDATE case_
            SET on_hold = $2,
                on_hold_reason = CASE WHEN $2 THEN 'manual' ELSE NULL END,
                updated_at = now()
          WHERE id = $1
          RETURNING updated_at`,
        [id, body.onHold],
      );
      await writeAudit({
        action: AUDIT_ACTION.status_changed,
        caseId: id,
        summary: body.onHold ? 'Case put on hold' : 'Case taken off hold',
        after: { onHold: body.onHold },
        ...(actor ? { actor } : {}),
      }, q);
      return { kind: 'updated' as const, version: versionToken(updated[0]?.updated_at) };
    });
    if (outcome.kind === 'missing') return { status: 404, jsonBody: { error: 'not found' } };
    if (outcome.kind === 'stale') {
      return { status: 409, jsonBody: { error: 'stale', currentVersion: outcome.currentVersion } };
    }
    return {
      status: 204,
      headers: { ETag: `"${outcome.version}"`, 'Access-Control-Expose-Headers': 'ETag' },
    };
  }),
});

app.http('logChase', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/chase',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const id = req.params.id;
    const body = (await req.json().catch(() => ({}))) as {
      channel?: unknown;
      templateLabel?: unknown;
      note?: unknown;
    };

    // --- validation: all 400s decided BEFORE any DB write ---
    const channel = body.channel;
    if (channel !== 'email' && channel !== 'whatsapp') {
      return { status: 400, jsonBody: { error: "channel must be 'email' or 'whatsapp'" } };
    }
    if (typeof body.templateLabel !== 'string' || !body.templateLabel.trim()) {
      return { status: 400, jsonBody: { error: 'templateLabel is required' } };
    }
    const templateLabel = body.templateLabel.trim();
    if (templateLabel.length > 200) {
      return { status: 400, jsonBody: { error: 'templateLabel must be 200 characters or fewer' } };
    }
    if (body.note !== undefined && typeof body.note !== 'string') {
      return { status: 400, jsonBody: { error: 'note must be a string' } };
    }
    if (typeof body.note === 'string' && body.note.length > 2000) {
      return { status: 400, jsonBody: { error: 'note must be 2000 characters or fewer' } };
    }
    const note = typeof body.note === 'string' ? body.note.trim() : '';

    const actor = actorFromClaims(claims);
    const needsUploadLink = imageChaserRequiresUploadLink(templateLabel);
    let fileRequest: { folderId: string; id: string; url: string } | undefined;
    if (needsUploadLink) {
      if (!gates.boxApi() || !gates.boxFileRequest() || !gates.boxFileRequestTemplateId().trim()) {
        return {
          status: 503,
          jsonBody: {
            error: 'An upload link is required before this image chase can be logged.',
            retryable: true,
          },
        };
      }
      const ensured = await ensureActiveBoxFileRequest(
        id,
        gates.boxFileRequestTemplateId().trim(),
        actor,
      );
      if (ensured.kind === 'missing') return { status: 404, jsonBody: { error: 'not found' } };
      if (ensured.kind === 'retired') {
        return { status: 409, jsonBody: { error: 'case has been merged' } };
      }
      if (ensured.kind === 'folder_not_ready') {
        return {
          status: 409,
          jsonBody: {
            error: 'The case archive folder is not ready yet. Try again shortly.',
            retryable: true,
          },
        };
      }
      if (ensured.kind !== 'ok') {
        return {
          status: 503,
          jsonBody: {
            error: 'The upload link could not be prepared. Try again.',
            retryable: true,
          },
        };
      }
      fileRequest = {
        folderId: ensured.folderId,
        id: ensured.fileRequestId,
        url: ensured.fileRequestUrl,
      };
    }
    const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : 'email';
    // chaser.name = the queue summary (varchar(400)); mirrors the SPA's "Chased via …"
    // wording so the persisted summary reads identically to the old client-state note.
    const summary = `Chased via ${channelLabel} — ${templateLabel}.`.slice(0, 400);
    // The chase target: the work provider (the party chased for missing items) — the
    // read's default targetType. target_name = the provider display name (varchar(200)).
    const outcome = await tx(async (q) => {
      const locked = await q<Row>(
        `${CASE_SELECT} WHERE c.id = $1 FOR UPDATE OF c`,
        [id],
      );
      if (!locked[0]) return { kind: 'missing' as const };
      const existing = rowToCase(locked[0]);
      if (isRetiredMerged(existing)) return { kind: 'retired' as const };
      if (
        fileRequest &&
        String(locked[0].box_folder_id ?? '').trim() !== fileRequest.folderId
      ) return { kind: 'file_request_changed' as const };
      if (fileRequest) {
        // A replacement/reactivation can change the durable link after an older
        // image draft was created. Keep every still-outstanding image chaser on
        // this case aligned before inserting the newly logged row.
        await associateOutstandingImageChasersWithFileRequest(
          q,
          id,
          fileRequest.id,
          fileRequest.url,
        );
      }
      const currentVersion = versionToken(locked[0].updated_at);
      const expected = ifMatch(req);
      if (expected != null && expected !== '' && expected !== currentVersion) {
        return { kind: 'stale' as const, currentVersion };
      }
      const rows = await q<Row>(
        `INSERT INTO chaser
           (name, case_id, target_type_code, target_name, channel_code, template_used,
            box_file_request_id, box_file_request_url, drafted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         RETURNING *`,
        [
          summary,
          id,
          100000002,
          existing.provider.slice(0, 200),
          channel === 'whatsapp' ? 100000001 : 100000000,
          templateLabel,
          fileRequest?.id ?? null,
          fileRequest?.url ?? null,
        ],
      );
      const created = rows[0];
      if (!created) throw new Error('chaser insert returned no row');
      if (note) {
        await q(
          'INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())',
          ['Chase note', id, actor ?? 'Staff', note],
        );
      }
      const updated = await q<Row>(
        'UPDATE case_ SET updated_at = now() WHERE id = $1 RETURNING updated_at',
        [id],
      );
      await writeAudit({
        action: AUDIT_ACTION.chaser_sent,
        caseId: id,
        summary: `Chase logged (${channel} · ${templateLabel})`,
        after: {
          chaserId: created.id,
          channel,
          templateLabel,
          ...(fileRequest ? {
            boxFileRequestId: fileRequest.id,
            fileRequestUrl: fileRequest.url,
          } : {}),
          ...(note ? { note } : {}),
        },
        ...(actor ? { actor } : {}),
      }, q);
      return {
        kind: 'created' as const,
        value: rowToChaser(created),
        version: versionToken(updated[0]?.updated_at),
      };
    });
    if (outcome.kind === 'missing') return { status: 404, jsonBody: { error: 'not found' } };
    if (outcome.kind === 'retired') return { status: 409, jsonBody: { error: 'case has been merged' } };
    if (outcome.kind === 'file_request_changed') {
      return {
        status: 409,
        jsonBody: {
          error: 'The case archive folder changed. Prepare the upload link again.',
          retryable: true,
        },
      };
    }
    if (outcome.kind === 'stale') {
      return { status: 409, jsonBody: { error: 'stale', currentVersion: outcome.currentVersion } };
    }
    return {
      status: 201,
      jsonBody: outcome.value,
      headers: { ETag: `"${outcome.version}"`, 'Access-Control-Expose-Headers': 'ETag' },
    };
  }),
});

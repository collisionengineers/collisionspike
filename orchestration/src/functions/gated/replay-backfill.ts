/**
 * orchestration/src/functions/gated/replay-backfill.ts
 *
 * Replay backfill driver (TKT-059 / GO_LIVE_SPRINT_PLAN P1+P3).
 *
 * Re-ingests the full intake mailbox history through the live pipeline after a wipe &
 * rebuild — OR, in dry-run mode, walks the same corpus read-only and emits a classification
 * manifest (the P1 learning artifact + the P3 verification ground truth). Two modes, one
 * driver:
 *   - dryRun (default, READ-ONLY): collect → classify each via the parser's stateless
 *     /classify-email route → write an NDJSON manifest to Blob. No DB or mailbox writes.
 *   - live: collect → start `intakeOrchestrator` per message as a SUB-orchestrator under a
 *     fresh `replay-<epoch>-<safeId>` instance namespace. This deliberately sidesteps the
 *     live `intake-<msgId>` namespace: the Durable task hub survives the DB wipe, so the old
 *     Completed instances would make an intake-queue replay silently no-op (intake-starter
 *     skips non-Failed instances). Chronological across all three mailboxes so instruction
 *     emails precede their replies (linkReply + the triage ref-gate depend on it).
 *
 * Determinism: the orchestrator is pure over its checkpointed input — mailbox config is
 * resolved in the HTTP starter (not the orchestrator body), all network/paging happens in
 * activities, and the merge/sort is a pure string compare. `continueAsNew` bounds the live
 * run's history (heavy sub-orchestrators) and makes it resumable from the last batch.
 *
 * Gated `REPLAY_BACKFILL_ENABLED` (default off) AND function-key protected on both surfaces.
 */

import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { createHash } from 'node:crypto';
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { intakeMailboxes } from '../../lib/subscriptions.js';
import {
  listMessagesSince,
  resolveInboxSubtreeFolderIds,
  getMessageWithAttachments,
  getMessageHeaders,
} from '../../lib/graph.js';
import { callClassifyEmail } from '../../lib/functions-client.js';
import { uploadEvidenceBytes } from '../../lib/blob.js';
import { compareByReceived, mergeChronological, tallyByCategory } from '../../lib/replay-manifest.js';

const retry = new df.RetryOptions(5_000, 3);
/** continueAsNew cadence for the LIVE processing loop (sub-orchestrators are heavy). */
const PROCESS_BATCH = 25;
/** Parallel fan-out width for the read-only DRY-RUN classify pass (keep the FC1 parser sane). */
const DRYRUN_CHUNK = 6;
const BODY_CAP = 20_000;

interface ResolvedMailbox {
  mailbox: string;
  sinceIso: string;
}
interface ReplayInput {
  epoch: string;
  until?: string;
  mailboxes?: string[];
  dryRun?: boolean;
}
/** Lightweight per-message manifest carried in orchestrator state (bounded). */
interface LightItem {
  mailbox: string;
  messageId: string;
  internetMessageId: string;
  receivedDateTime: string;
}
/** One dry-run manifest row (prediction, no side effects). */
interface ManifestRow {
  mailbox: string;
  internetMessageId: string;
  receivedDateTime: string;
  subject: string;
  from: string;
  category: string;
  subtype: string;
  confidence?: number;
  signals?: string[];
  bodyVrm?: string;
  bodyCaseref?: string;
  bodyJobref?: string;
  isReply?: boolean;
  hasAttachments: boolean;
  attachmentKinds: string[];
}
interface ReplayState {
  epoch: string;
  untilIso: string;
  dryRun: boolean;
  resolved: ResolvedMailbox[];
  manifest?: LightItem[];
  idx: number;
  failures?: string[];
}

/* ============================================================
   HTTP starter — POST /api/replay-backfill
   ============================================================ */
app.http('replay-backfill-start', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'replay-backfill',
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!gates.replayBackfill()) {
      ctx.log('[replay-backfill] skipped — REPLAY_BACKFILL_ENABLED off');
      return { status: 200, jsonBody: { skipped: true, reason: 'REPLAY_BACKFILL_ENABLED off' } };
    }
    const body = (await req.json().catch(() => ({}))) as ReplayInput;
    if (!body.epoch || !/^[A-Za-z0-9_-]{1,40}$/.test(body.epoch)) {
      return { status: 400, jsonBody: { error: 'epoch (slug [A-Za-z0-9_-]{1,40}) required' } };
    }

    // Resolve mailbox config HERE (not in the orchestrator) so the orchestrator stays pure
    // over its input. `until` defaults to now = the T0 split; live PUSH owns [T0, ∞).
    const cfg = intakeMailboxes();
    const chosen =
      body.mailboxes && body.mailboxes.length
        ? cfg.filter((m) => body.mailboxes!.includes(m.mailbox))
        : cfg;
    if (!chosen.length) {
      return { status: 400, jsonBody: { error: 'no matching intake mailboxes configured' } };
    }
    const untilIso = body.until ?? new Date().toISOString();
    const resolved: ResolvedMailbox[] = chosen.map((m) => ({
      mailbox: m.mailbox,
      sinceIso: m.minIntakeDate,
    }));

    const client = df.getClient(ctx);
    const instanceId = `replay-drive-${body.epoch}`;
    let existing;
    try {
      existing = await client.getStatus(instanceId);
    } catch {
      existing = undefined; // 404 = first run
    }
    const runtimeStatus = existing?.runtimeStatus as string | undefined;
    if (runtimeStatus && runtimeStatus !== 'Failed' && runtimeStatus !== 'Terminated') {
      // Completed/Running/Pending for this epoch → don't re-run; a fresh run uses a fresh epoch.
      ctx.log(`[replay-backfill] instance ${instanceId} already ${runtimeStatus} — not restarted`);
      return { status: 200, jsonBody: { instanceId, deduped: true, runtimeStatus } };
    }

    const input: ReplayState = {
      epoch: body.epoch,
      untilIso,
      dryRun: body.dryRun !== false, // default TRUE (safe)
      resolved,
      idx: 0,
    };
    await client.startNew('replayBackfillOrchestrator', { instanceId, input });
    ctx.log(
      `[replay-backfill] started ${instanceId} (dryRun=${input.dryRun}, mailboxes=${resolved.length}, until=${untilIso})`,
    );
    return client.createCheckStatusResponse(req, instanceId);
  },
});

/* ============================================================
   Driver orchestrator
   ============================================================ */
df.app.orchestration('replayBackfillOrchestrator', function* (ctx) {
  const s = ctx.df.getInput() as ReplayState;

  // --- Phase 1: collect + chronological merge (once; persisted via continueAsNew) ---
  if (!s.manifest) {
    const lists = (yield ctx.df.Task.all(
      s.resolved.map((m) =>
        ctx.df.callActivityWithRetry('replayCollectMailbox', retry, {
          mailbox: m.mailbox,
          sinceIso: m.sinceIso,
          untilIso: s.untilIso,
        }),
      ),
    )) as LightItem[][];
    const merged = mergeChronological(lists);
    ctx.df.setCustomStatus({ phase: 'collected', total: merged.length });
    ctx.df.continueAsNew({ ...s, manifest: merged, idx: 0 });
    return;
  }

  const total = s.manifest.length;

  // --- Phase 2a: DRY-RUN (read-only) — classify all, write manifest, done ---
  if (s.dryRun) {
    const rows: ManifestRow[] = [];
    for (let i = 0; i < total; i += DRYRUN_CHUNK) {
      const chunk = s.manifest.slice(i, i + DRYRUN_CHUNK);
      const res = (yield ctx.df.Task.all(
        chunk.map((it) => ctx.df.callActivityWithRetry('replayClassifyOne', retry, it)),
      )) as ManifestRow[];
      rows.push(...res);
      ctx.df.setCustomStatus({ phase: 'dry-run', done: rows.length, total });
    }
    const manifestBlobPath = (yield ctx.df.callActivityWithRetry('replayWriteManifest', retry, {
      epoch: s.epoch,
      rows,
    })) as string;
    return {
      epoch: s.epoch,
      mode: 'dry-run',
      total,
      manifestBlobPath,
      byCategory: tallyByCategory(rows),
    };
  }

  // --- Phase 2b: LIVE — start intakeOrchestrator per message, batched + resumable ---
  const failures = s.failures ?? [];
  const end = Math.min(s.idx + PROCESS_BATCH, total);
  for (let i = s.idx; i < end; i++) {
    const it = s.manifest[i];
    // Durable instance IDs are capped at 100 chars and must be unique. A raw
    // internetMessageId (a) blows past that cap and (b) collides once punctuation is
    // stripped (`a.b` vs `ab`). A bounded hash of mailbox+messageId is collision-safe and
    // fixed-width: `replay-` (7) + epoch (≤40) + `-` (1) + 32 hex = ≤80 chars.
    const safeId = createHash('sha256')
      .update(`${it.mailbox} ${it.internetMessageId || it.messageId}`)
      .digest('hex')
      .slice(0, 32);
    const childId = `replay-${s.epoch}-${safeId}`;
    const resource = `users/${it.mailbox}/messages/${it.messageId}`;
    try {
      yield ctx.df.callSubOrchestratorWithRetry(
        'intakeOrchestrator',
        retry,
        { messageId: it.messageId, resource, receivedAt: it.receivedDateTime },
        childId,
      );
    } catch (e) {
      // Per-message failure (e.g. the un-wrapped enrich tail) must not abort the run.
      failures.push(it.internetMessageId || it.messageId);
    }
  }
  const nextIdx = end;
  ctx.df.setCustomStatus({ phase: 'live', done: nextIdx, total, failures: failures.length });
  if (nextIdx < total) {
    ctx.df.continueAsNew({ ...s, idx: nextIdx, failures });
    return;
  }
  return { epoch: s.epoch, mode: 'live', total, failures, done: true };
});

/* ============================================================
   Activities (all read-only except the intakeOrchestrator sub-run)
   ============================================================ */

/** Page a mailbox over [sinceIso, untilIso), keeping only messages in the Inbox subtree. */
df.app.activity('replayCollectMailbox', {
  handler: async (
    input: { mailbox: string; sinceIso: string; untilIso: string },
    ctx: InvocationContext,
  ): Promise<LightItem[]> => {
    const subtree = await resolveInboxSubtreeFolderIds(input.mailbox);
    const out: LightItem[] = [];
    let pageUrl: string | undefined;
    let pages = 0;
    do {
      const { items, nextLink } = await listMessagesSince(
        input.mailbox,
        input.sinceIso,
        input.untilIso,
        pageUrl,
      );
      for (const m of items) {
        // Whole-mailbox list also returns Sent/Deleted/Junk/Drafts — keep Inbox subtree only.
        if (m.parentFolderId && !subtree.has(m.parentFolderId)) continue;
        out.push({
          mailbox: input.mailbox,
          messageId: m.id,
          internetMessageId: m.internetMessageId ?? m.id,
          receivedDateTime: m.receivedDateTime,
        });
      }
      pageUrl = nextLink;
      pages++;
    } while (pageUrl);
    out.sort(compareByReceived);
    ctx.log(
      JSON.stringify({ evt: 'replayCollectMailbox', mailbox: input.mailbox, pages, collected: out.length }),
    );
    return out;
  },
});

/** Classify ONE message read-only (no DB, no Blob) — the parser /classify-email route. */
df.app.activity('replayClassifyOne', {
  handler: async (it: LightItem, _ctx: InvocationContext): Promise<ManifestRow> => {
    // getMessageWithAttachments is a Graph GET (it does NOT upload — that is fetchMessage's job).
    const { message, attachments } = await getMessageWithAttachments(it.mailbox, it.messageId);
    const headers = await getMessageHeaders(it.mailbox, it.messageId);
    const from = message.from?.emailAddress?.address ?? '';
    const senderDomain = from.includes('@') ? from.split('@')[1]!.toLowerCase() : '';
    const attachmentKinds = attachments.map((a) => a.contentType);
    const attachmentFilenames = attachments.map((a) => a.name);
    const cls = await callClassifyEmail({
      subject: message.subject ?? '',
      body: (message.body?.content ?? message.bodyPreview ?? '').slice(0, BODY_CAP),
      from,
      senderDomain,
      attachmentKinds,
      attachmentFilenames,
      hasAttachments: attachments.length > 0,
      inReplyTo: headers['in-reply-to'] ?? '',
      references: headers['references'] ?? '',
    });
    return {
      mailbox: it.mailbox,
      internetMessageId: it.internetMessageId,
      receivedDateTime: it.receivedDateTime,
      subject: message.subject ?? '',
      from,
      category: cls.category,
      subtype: cls.subtype,
      confidence: cls.confidence,
      signals: cls.signals,
      bodyVrm: cls.body_vrm,
      bodyCaseref: cls.body_caseref,
      bodyJobref: cls.body_jobref,
      isReply: cls.is_reply,
      hasAttachments: attachments.length > 0,
      attachmentKinds,
    };
  },
});

/** Write the dry-run manifest as NDJSON to Blob (overwrite-idempotent per epoch). */
df.app.activity('replayWriteManifest', {
  handler: async (
    input: { epoch: string; rows: ManifestRow[] },
    _ctx: InvocationContext,
  ): Promise<string> => {
    const ndjson = input.rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
    const up = await uploadEvidenceBytes(
      'replay-manifest',
      `${input.epoch}.ndjson`,
      Buffer.from(ndjson, 'utf8'),
      'application/x-ndjson',
    );
    return up.blobPath;
  },
});

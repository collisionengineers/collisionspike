/**
 * orchestration/src/functions/gated/retro-case.ts — retro case reconstruction
 * (ADR-0022 / TKT-058).
 *
 * The SECONDARY, gated fallback behind the primary intake: when a billing /
 * case_update / cancellation / query email matches NO case (linkReply is
 * open-cases-only and non-replies never even try), this sub-orchestration runs
 * the reconstruction ladder:
 *
 *   rung 1  retroResolveExisting — ANY-status existence check (incl. terminals)
 *           via the Data API; a hit LINKS the trigger email and stops.  [R1 — live]
 *   rung 2  Box archive — content-search the read-only archive root(s) by the
 *           email's keys, discover the Case/PO from the folder name, download +
 *           parse the original instruction.                    [R2 — not built yet]
 *   rung 3  Outlook $search — find the original instruction in the 3 scoped
 *           mailboxes.                                         [R3 — not built yet]
 *   bottom  nothing found → audit retro_reconstruction_failed; the triage row is
 *           left exactly as today.
 *
 * Gates: RETRO_CASE_ENABLED — read INSIDE the activities (never the orchestrator
 * body; the parse/enrich/boxFolderCreate convention) so the decision is recorded
 * in Durable history and stays replay-safe. Gate off → every activity returns an
 * honest { skipped } and the chain is a cheap no-op. The Data API enforces the
 * same gate server-side (set it on BOTH apps).
 *
 * Triggers: (1) the intake orchestrator (the two unmatched non-receiving_work
 * returns) via callSubOrchestratorWithRetry; (2) the keyed manual HTTP starter —
 * the operator's drain lever for the EXISTING pile of un-linked triage rows
 * (input = the row's source_message_id + source_mailbox; the orchestrator
 * re-fetches + re-classifies so the run is identical to a live arrival).
 *
 * Never blocks or reorders the primary intake: invoked AFTER every existing
 * activity in its lane, try/catch-wrapped at the call site, additive result key.
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { decideRetro, type InboundCategory, type RetroKeys } from '@cs/domain';
import { dataApi } from '../../lib/data-api.js';
import { findMessageByInternetMessageId } from '../../lib/graph.js';
import type { InboundClassification } from '../activities/classifyInbound.js';

export interface RetroCaseInput {
  /** Sub-orchestrator form (intake path): the checkpointed envelope + routing facts. */
  trigger?: unknown;
  category?: InboundCategory;
  subtype?: string;
  keys?: RetroKeys;
  providerId?: string;
  /** Manual-starter form (operator drain): locate the message, then re-derive the rest.
   *  `internetMessageId` + `mailbox` = inbound_email.source_message_id + source_mailbox. */
  internetMessageId?: string;
  mailbox?: string;
}

const retry = new df.RetryOptions(5_000, 3);
retry.backoffCoefficient = 2;
retry.maxRetryIntervalInMilliseconds = 60_000;

/* ============================================================
   Manual starter — the operator drain lever (authLevel 'function': this lever
   drives Graph reads + case writes for a caller-supplied message, so it is
   keyed, unlike the box-folder starter whose input is a bare caseId).
   ============================================================ */
app.http('retro-case-start', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'retro-case',
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!gates.retroCase()) {
      ctx.log('[retro-case] skipped — RETRO_CASE_ENABLED off');
      return { status: 200, jsonBody: { skipped: true, reason: 'gated off' } };
    }
    const input = (await req.json()) as RetroCaseInput;
    if (!input.internetMessageId || !input.mailbox) {
      return { status: 400, jsonBody: { error: 'internetMessageId and mailbox required' } };
    }
    const client = df.getClient(ctx);
    // Deterministic instance id (the intake-starter pattern) so a re-triggered drain of the
    // same email resumes/dedupes instead of double-running.
    const safeId = String(input.internetMessageId).replace(/[^A-Za-z0-9_-]/g, '');
    const instanceId = `retro-${safeId}`;
    let existing;
    try {
      existing = await client.getStatus(instanceId);
    } catch {
      existing = undefined; // 404 = first run
    }
    const runtimeStatus = existing?.runtimeStatus as string | undefined;
    if (runtimeStatus && runtimeStatus !== 'Failed' && runtimeStatus !== 'Terminated') {
      ctx.log(`[retro-case] instance ${instanceId} already ${runtimeStatus} — not restarted`);
      return { status: 200, jsonBody: { instanceId, deduped: true, runtimeStatus } };
    }
    await client.startNew('retroCaseOrchestrator', { instanceId, input });
    return client.createCheckStatusResponse(req, instanceId);
  },
});

/* ============================================================
   The reconstruction ladder orchestrator
   ============================================================ */
df.app.orchestration('retroCaseOrchestrator', function* (ctx) {
  const input = ctx.df.getInput() as RetroCaseInput;

  let trigger = input.trigger;
  let category = input.category;
  let keys = input.keys;
  let providerId = input.providerId;

  // Manual-drain form: locate + fetch + classify the trigger so the run is identical to a
  // live arrival (same activities, same triage-row upsert, same decideRetro eligibility).
  if (!trigger) {
    if (!input.internetMessageId || !input.mailbox) {
      return { outcome: 'bad_input', reason: 'trigger envelope or internetMessageId+mailbox required' };
    }
    const located = (yield ctx.df.callActivityWithRetry('retroFindTrigger', retry, {
      internetMessageId: input.internetMessageId,
      mailbox: input.mailbox,
    })) as { skipped?: string; found?: boolean; messageId?: string; resource?: string };
    if (located.skipped) return { outcome: 'skipped', reason: located.skipped };
    if (!located.found) return { outcome: 'trigger_not_found' };

    trigger = yield ctx.df.callActivityWithRetry('fetchMessage', retry, {
      messageId: located.messageId,
      resource: located.resource,
    });
    const provider = (yield ctx.df.callActivityWithRetry('providerMatch', retry, trigger)) as {
      workProviderId?: string;
      matchState?: string;
    };
    providerId = provider.workProviderId;
    const classification = (yield ctx.df.callActivityWithRetry('classifyInbound', retry, {
      inbound: trigger,
      workProviderId: providerId,
      matchState: provider.matchState,
    })) as InboundClassification;
    category = classification.category;

    // Pure over checkpointed values (replay-safe — the decideCaseType/triage-assist
    // convention). No linkReplyOutcome here: the reply lane never ran on this path; the
    // resolve-existing rung below provides the same link-first/ambiguity protection.
    const env = trigger as { candidateRef?: string; candidateVrm?: string };
    const decision = decideRetro({
      category: classification.category,
      bodyCaseref: classification.bodyCaseref,
      bodyJobref: classification.bodyJobref,
      bodyVrm: classification.bodyVrm,
      candidateRef: env.candidateRef,
      candidateVrm: env.candidateVrm,
      isReply: classification.isReply,
    });
    if (!decision.attempt) {
      return { outcome: 'not_eligible', reasons: decision.reasons };
    }
    keys = decision.keys;
  }

  if (!keys || (!keys.casePo && !keys.externalRef && !keys.vrm)) {
    return { outcome: 'not_eligible', reasons: ['no_usable_key'] };
  }

  // Rung 1 — ANY-status existence check + link (the billing fix). A hit ends the ladder.
  const resolved = (yield ctx.df.callActivityWithRetry('retroResolveExisting', retry, {
    trigger,
    keys,
    providerId,
    triggerCategory: category,
  })) as { skipped?: string; outcome?: string; caseId?: string; candidateCount?: number };
  if (resolved.skipped) return { outcome: 'skipped', reason: resolved.skipped };
  if (resolved.outcome === 'gated_off') return { outcome: 'skipped', reason: 'api_gate_off' };
  if (resolved.outcome === 'linked') return { outcome: 'linked', caseId: resolved.caseId };
  if (resolved.outcome === 'ambiguous') {
    return { outcome: 'ambiguous', candidateCount: resolved.candidateCount };
  }

  // Rungs 2 (Box archive) + 3 (Outlook $search) land in R2/R3 — see the module doc.
  // Bottom of the ladder: record the attempt so ops can see it; the triage row is left
  // exactly as today (case_id NULL, staff triage).
  yield ctx.df.callActivityWithRetry('retroRecordFailure', retry, {
    trigger,
    keys,
    triggerCategory: category,
    rungsTried: ['resolve_existing'],
  });
  return { outcome: 'no_source' };
});

/* ============================================================
   Activities (gate read INSIDE each — the parse/enrich convention)
   ============================================================ */

df.app.activity('retroFindTrigger', {
  handler: async (
    input: { internetMessageId: string; mailbox: string },
    ctx,
  ): Promise<{ skipped?: string; found?: boolean; messageId?: string; resource?: string }> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    const hit = await findMessageByInternetMessageId(input.mailbox, input.internetMessageId);
    if (!hit) {
      ctx.log(JSON.stringify({ evt: 'retroFindTrigger', found: false, mailbox: input.mailbox }));
      return { found: false };
    }
    return {
      found: true,
      messageId: hit.id,
      resource: `users/${input.mailbox}/messages/${hit.id}`,
    };
  },
});

df.app.activity('retroResolveExisting', {
  handler: async (
    input: {
      trigger: unknown;
      keys: RetroKeys;
      providerId?: string;
      triggerCategory?: InboundCategory;
    },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    const result = await dataApi.retroResolveExisting({
      trigger: input.trigger,
      keys: input.keys,
      providerId: input.providerId,
      triggerCategory: input.triggerCategory,
    });
    ctx.log(JSON.stringify({ evt: 'retroResolveExisting', outcome: result.outcome, caseId: result.caseId }));
    return result;
  },
});

df.app.activity('retroRecordFailure', {
  handler: async (
    input: {
      trigger: unknown;
      keys: RetroKeys;
      triggerCategory?: InboundCategory;
      rungsTried: string[];
    },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    const env = input.trigger as { internetMessageId?: string; subject?: string };
    await dataApi.recordAudit({
      action: 'retro_reconstruction_failed',
      severity: 'warning',
      summary: `Retro: no case found or reconstructable for ${input.triggerCategory ?? 'update'} email (${
        input.keys.casePo ?? input.keys.externalRef ?? input.keys.vrm ?? 'no key'
      })`,
      after: {
        keys: input.keys,
        rungsTried: input.rungsTried,
        messageId: env.internetMessageId,
        subject: env.subject,
      },
    });
    ctx.log(JSON.stringify({ evt: 'retroRecordFailure', keys: input.keys, rungsTried: input.rungsTried }));
    return { recorded: true };
  },
});

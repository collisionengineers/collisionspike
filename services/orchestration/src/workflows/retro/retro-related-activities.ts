/** Durable activities for the retro related-correspondence rung (TKT-222 / TKT-225):
 *  link the case's related mail, then backfill fields from an ingested related email.
 *  Gate read INSIDE each activity — the parse/enrich convention. */
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { type RetroKeys } from '@cs/domain';
import { dataApi, type ParserEvaFields } from '../../adapters/data-api.js';
import type { ProviderMatchRecordsResult } from '../../adapters/data-api-contracts.js';
import { getMessageIdentity, kqlPhrase, searchMessages } from '../../adapters/graph.js';
import { intakeMailboxes } from '../../platform/subscriptions.js';
import { refSearchVariants, senderProviderAgrees, type RetroTriggerIdentity } from './retro-envelope.js';
import { hashPayload, type InboundEnvelope } from '../intake/fetchMessage.js';
import { senderProviderIds, triggerProviderIdsOf } from './retro-provider-corroboration.js';

/** TKT-222 bounds: per-(mailbox × variant) search top for the related sweep. The
 *  25-new-links per-case cap moved SERVER-SIDE (PR-review fix): the link route caps
 *  new links itself (already-linked rows don't consume it) and reports `skippedByCap`,
 *  so the activity no longer pre-caps candidates before identity resolution. */
const RELATED_SEARCH_TOP = 50;
/** TKT-225 — per-case cap on the rows offered to the related-INGEST child
 *  (truncation logged, never silent). */
const RELATED_INGEST_CAP = 25;

/** TKT-225 — one ingest-eligible related row as the child orchestrator consumes it. */
interface RelatedIngestRow {
  internetMessageId: string;
  /** Graph message id. */
  messageId: string;
  /** users/<mailbox>/messages/<id> — the fetchMessage resource form. */
  resource: string;
  mailbox: string;
  receivedAt: string;
}

df.app.activity('retroLinkRelated', {
  handler: async (
    input: {
      caseId: string;
      keys: RetroKeys;
      excludeInternetMessageIds?: string[];
      /** PR-review fix (3×P1) — the checkpointed trigger identity for weak-key
       *  corroboration of third-party candidates. Optional; unknown fails closed. */
      trigger?: RetroTriggerIdentity;
    },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    if (!gates.retroOutlookSearch()) return { skipped: 'outlook_gate_off' };
    const mailboxes = intakeMailboxes().map((m) => m.mailbox);
    if (mailboxes.length === 0) return { skipped: 'no_intake_mailboxes' };
    const keyList = [
      input.keys.casePo,
      input.keys.externalRef,
      input.keys.vrm,
      input.keys.claimant,
    ].filter((k): k is string => Boolean(k));
    if (keyList.length === 0) return { skipped: 'no_keys' };
    // PR-review fix — key strength split: a subject carrying ONLY a weak key (vrm /
    // claimant) is not a licence to link third-party mail on its own.
    const strongKeys = [input.keys.casePo, input.keys.externalRef].filter(
      (k): k is string => Boolean(k),
    );
    const weakKeys = [input.keys.vrm, input.keys.claimant].filter((k): k is string => Boolean(k));

    const norm = (v: string): string => v.trim().toUpperCase().replace(/\s+/g, '');
    const exclude = new Set((input.excludeInternetMessageIds ?? []).map((v) => v.trim()));

    // Sweep every key across every mailbox; own-mailbox senders are INCLUDED on purpose —
    // our filed replies and chasers belong to the case too (ADR-0022, TKT-222 directive).
    const seen = new Set<string>();
    const candidates: Array<{
      mailbox: string;
      id: string;
      subject: string;
      from: string;
      weakOnly: boolean;
    }> = [];
    for (const key of keyList) {
      const variants = key === input.keys.claimant ? [key] : refSearchVariants(key);
      for (const mailbox of mailboxes) {
        for (const variant of variants) {
          try {
            const hits = await searchMessages(
              mailbox,
              kqlPhrase(variant),
              RELATED_SEARCH_TOP,
              // PR-review fix — the locate sweep's "no silent caps" doctrine applies to
              // the related sweep too: a truncated page run is surfaced, never swallowed.
              (message) => ctx.warn(`[retroLinkRelated] ${message}`),
            );
            for (const h of hits) {
              const k = `${mailbox}\u0000${h.id}`;
              if (seen.has(k)) continue;
              seen.add(k);
              // Conservative v1 corroboration: the SUBJECT must carry one of the case keys
              // ($search relevance alone is not a licence to link).
              const subjectNorm = norm(h.subject);
              const strongInSubject = strongKeys.some((ck) => subjectNorm.includes(norm(ck)));
              const weakInSubject = weakKeys.some((ck) => subjectNorm.includes(norm(ck)));
              if (strongInSubject || weakInSubject) {
                candidates.push({
                  mailbox,
                  id: h.id,
                  subject: h.subject,
                  from: h.from,
                  weakOnly: !strongInSubject,
                });
              }
            }
          } catch (e) {
            ctx.warn(
              `[retroLinkRelated] $search failed on ${mailbox} (variant ${JSON.stringify(variant)}; continuing): ${String(e)}`,
            );
          }
        }
      }
    }

    // PR-review fix (3×P1) — weak-subject-only candidates need provenance: our OWN filed
    // mail (from-address ∈ the configured intake mailboxes) or a sender whose provider
    // identity corroborates the trigger's ('agreed'/'same_domain' — the retroOutlookLocate
    // rule). Third-party weak-only mail is otherwise SKIPPED and counted (never silent);
    // an unknown trigger identity fails those candidates closed. Corpus loaded lazily,
    // ONCE, only when a third-party weak-only candidate actually appears.
    const ownMailboxes = new Set(mailboxes.map((m) => m.trim().toLowerCase()));
    const triggerFrom = (input.trigger?.senderAddress ?? '').trim();
    const triggerIds = triggerProviderIdsOf(input.trigger);
    let corpus: ProviderMatchRecordsResult | null | undefined;
    let weakUncorroborated = 0;
    const corroborated: typeof candidates = [];
    for (const c of candidates) {
      if (!c.weakOnly || ownMailboxes.has(c.from.trim().toLowerCase())) {
        corroborated.push(c);
        continue;
      }
      if (corpus === undefined && (triggerFrom || triggerIds.length > 0)) {
        try {
          corpus = await dataApi.providerMatchRecords();
        } catch (e) {
          corpus = null;
          ctx.warn(
            `[retroLinkRelated] provider corpus load failed (weak-only candidates fail closed): ${String(e)}`,
          );
        }
      }
      const verdict = senderProviderAgrees({
        candidateFrom: c.from,
        candidateProviderIds: senderProviderIds(c.from, corpus ?? null),
        triggerFrom,
        triggerProviderIds: triggerIds,
      });
      if (verdict === 'agreed' || verdict === 'same_domain') {
        corroborated.push(c);
        continue;
      }
      weakUncorroborated += 1;
    }
    if (weakUncorroborated > 0) {
      ctx.log(JSON.stringify({
        evt: 'retroLinkRelated', caseId: input.caseId,
        reason: 'weak_key_uncorroborated', weakUncorroborated,
      }));
    }

    const rows: InboundEnvelope[] = [];
    // TKT-225 — retain the (mailbox, Graph-id, receivedAt) behind each posted row so the
    // route's linkedIds/alreadyLinkedIds can be mapped back into ingest-eligible rows.
    // PR-review fix — NO activity-side pre-cap: identities resolve for EVERY corroborated
    // candidate and all surviving rows go to the link route (the route caps new links at
    // 25 itself and reports `skippedByCap`; already-linked rows don't consume the cap).
    const byInternetMessageId = new Map<string, { messageId: string; mailbox: string; receivedAt: string }>();
    for (const c of corroborated) {
      // PR-review fix — per-candidate salvage: one Graph 429/5xx on the identity read
      // must not discard the rows already accumulated (the per-mailbox catch's twin).
      let identity: Awaited<ReturnType<typeof getMessageIdentity>>;
      try {
        identity = await getMessageIdentity(c.mailbox, c.id);
      } catch (e) {
        ctx.warn(
          `[retroLinkRelated] identity read failed on ${c.mailbox}/${c.id} (continuing): ${String(e)}`,
        );
        continue;
      }
      if (!identity || exclude.has(identity.internetMessageId.trim())) continue;
      byInternetMessageId.set(identity.internetMessageId.trim(), {
        messageId: c.id,
        mailbox: c.mailbox,
        receivedAt: identity.receivedDateTime,
      });
      rows.push({
        messageId: c.id,
        internetMessageId: identity.internetMessageId,
        conversationId: '',
        subject: identity.subject,
        senderAddress: identity.from,
        receivedAt: identity.receivedDateTime,
        sourceMailbox: c.mailbox,
        payloadHash: hashPayload(identity.subject, identity.from, []),
        candidateVrm: '',
        candidateRef: '',
        body: '',
        bodyPreview: '',
        inReplyTo: '',
        references: '',
        attachments: [],
      } as InboundEnvelope);
    }
    if (rows.length === 0) {
      ctx.log(JSON.stringify({ evt: 'retroLinkRelated', caseId: input.caseId, linked: 0, scanned: candidates.length, weakUncorroborated }));
      return { linked: 0, scanned: candidates.length, weakUncorroborated };
    }
    const persisted = await dataApi.retroLinkRelated({ caseId: input.caseId, rows });
    ctx.log(JSON.stringify({
      evt: 'retroLinkRelated', caseId: input.caseId,
      linked: persisted.linked, skippedRows: persisted.skipped, scanned: candidates.length,
      skippedByCap: persisted.skippedByCap ?? 0, weakUncorroborated,
    }));
    const result: {
      linked: number;
      skippedRows: number;
      scanned: number;
      skippedByCap: number;
      weakUncorroborated: number;
      ingestRows?: RelatedIngestRow[];
    } = {
      linked: persisted.linked,
      skippedRows: persisted.skipped,
      scanned: candidates.length,
      skippedByCap: persisted.skippedByCap ?? 0,
      weakUncorroborated,
    };
    // TKT-225 — the checkpointed gate decision: `ingestRows` is present ONLY when the
    // ingest gate is on (the orchestrator branches purely on this activity result).
    // Newly linked rows AND rows already linked to THIS case are eligible — the latter
    // heals the TKT-222 v1 pile (row-links without evidence) on a force re-run; rows
    // linked to a DIFFERENT case were never returned by the route (NEVER RE-POINT).
    if (!gates.retroRelatedIngest()) {
      ctx.log(JSON.stringify({ evt: 'retroLinkRelated', caseId: input.caseId, ingest: 'gate_off' }));
      return result;
    }
    // Dedupe: a cross-mailbox twin (same Internet-Message-Id landing in two intake
    // mailboxes) can appear in linkedIds via one copy and alreadyLinkedIds via the other.
    const eligible = [...new Set([...(persisted.linkedIds ?? []), ...(persisted.alreadyLinkedIds ?? [])])];
    const ingestRows = eligible
      .map((imid): RelatedIngestRow | undefined => {
        const hit = byInternetMessageId.get(imid);
        return hit
          ? {
              internetMessageId: imid,
              messageId: hit.messageId,
              resource: `users/${hit.mailbox}/messages/${hit.messageId}`,
              mailbox: hit.mailbox,
              receivedAt: hit.receivedAt,
            }
          : undefined;
      })
      .filter((r): r is RelatedIngestRow => Boolean(r))
      // Oldest first: the earliest correspondence fills gaps first (fill-if-empty means
      // first-writer-wins); id tiebreak for determinism.
      .sort((a, b) =>
        a.receivedAt !== b.receivedAt
          ? (a.receivedAt < b.receivedAt ? -1 : 1)
          : a.internetMessageId.localeCompare(b.internetMessageId),
      );
    if (ingestRows.length > RELATED_INGEST_CAP) {
      ctx.warn(
        `[retroLinkRelated] ${ingestRows.length} ingest-eligible rows capped at ${RELATED_INGEST_CAP} for case ${input.caseId} — re-run to pick up the remainder`,
      );
    }
    result.ingestRows = ingestRows.slice(0, RELATED_INGEST_CAP);
    return result;
  },
});

df.app.activity('retroBackfillFields', {
  handler: async (
    input: {
      caseId: string;
      sourceInternetMessageId: string;
      parserVrm?: string;
      parserRef?: string;
      parserMileage?: string;
      parserMileageUnit?: string;
      parserEva?: ParserEvaFields;
    },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    if (!gates.retroRelatedIngest()) return { skipped: 'ingest_gate_off' };
    const result = await dataApi.retroBackfillFields(input);
    ctx.log(JSON.stringify({
      evt: 'retroBackfillFields', caseId: input.caseId,
      outcome: result.outcome, vrmFilled: result.vrmFilled ?? false,
    }));
    return result;
  },
});

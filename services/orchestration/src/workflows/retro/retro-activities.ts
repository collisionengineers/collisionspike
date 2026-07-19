/** Durable activities for retroactive Case reconstruction. */
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import {
  type InboundCategory,
  type RetroKeys,
  type RetroReconstructionSource,
} from '@cs/domain';
import { dataApi, type ParserEvaFields } from '../../adapters/data-api.js';
import type { ProviderMatchRecordsResult } from '../../adapters/data-api-contracts.js';
import {
  findMessageByInternetMessageId,
  kqlPhrase,
  searchMessages,
} from '../../adapters/graph.js';
import { intakeMailboxes } from '../../platform/subscriptions.js';
import {
  classifyArchiveFile,
  rankOutlookOriginals,
  refSearchVariants,
  senderProviderAgrees,
  type OutlookSearchCandidate,
  type RetroTriggerIdentity,
} from './retro-envelope.js';
import type { InboundEnvelope } from '../intake/fetchMessage.js';
import { senderProviderIds, triggerProviderIdsOf } from './retro-provider-corroboration.js';
// The Box-archive and related-correspondence rungs live in sibling modules that
// self-register their activities on import (side-effect modules — the durable host
// resolves activities by name, exactly as before the split).
import './retro-box-activities.js';
import './retro-related-activities.js';

/* ============================================================
   Activities (gate read INSIDE each — the parse/enrich convention)
   ============================================================ */

df.app.activity('retroFindTrigger', {
  handler: async (
    input: { internetMessageId: string; mailbox: string },
    ctx,
  ): Promise<{ skipped?: string; found?: boolean; messageId?: string; resource?: string; mailbox?: string }> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    // TKT-230 (item 5) — multi-mailbox fallback: the stored source_mailbox may no longer
    // hold the message (moved/filed cross-mailbox twins), which stranded 61 drain rows as
    // terminal trigger_not_found. Probe the stored mailbox FIRST, then every other
    // configured intake mailbox (the retroOutlookLocate per-mailbox try/catch idiom).
    // Bounded (3 mailboxes × 1 $filter), read-only, same Mail.Read scope. The additive
    // `mailbox` return field is informational; downstream fetchMessage consumes `resource`.
    const configured = intakeMailboxes().map((m) => m.mailbox);
    const primary = input.mailbox.trim().toLowerCase();
    const ordered = [
      input.mailbox,
      ...configured.filter((m) => m.trim().toLowerCase() !== primary),
    ];
    for (const mailbox of ordered) {
      try {
        const hit = await findMessageByInternetMessageId(mailbox, input.internetMessageId);
        if (hit) {
          return {
            found: true,
            messageId: hit.id,
            resource: `users/${mailbox}/messages/${hit.id}`,
            mailbox,
          };
        }
      } catch (e) {
        ctx.warn(`[retroFindTrigger] probe failed on ${mailbox} (continuing): ${String(e)}`);
      }
    }
    ctx.log(JSON.stringify({ evt: 'retroFindTrigger', found: false, mailboxesTried: ordered.length }));
    return { found: false };
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

/** TKT-219 — per (mailbox × variant) total-result bound for the retro `$search` sweep.
 *  500 = two 250-result pages: deep enough to reach OLD originals behind recurring refs
 *  (the documented `$search` ceiling is 1,000, sent-date-sorted) while keeping a junk-ish
 *  key's worst case at two sequential Graph calls. Truncation is logged, never silent. */
const RETRO_SEARCH_TOTAL_LIMIT = 500;

df.app.activity('retroCreatePersist', {
  handler: async (
    input: {
      original: InboundEnvelope;
      trigger: unknown;
      keys: RetroKeys;
      casePo?: string;
      vrm?: string;
      statusName: 'eva_submitted' | 'needs_review';
      onHold: boolean;
      actionReason?: 'needs_review';
      reconstructionSource: RetroReconstructionSource;
      providerId?: string;
      /** TKT-219 — the trigger sender's Image-Source intermediary match (TKT-021). */
      intermediary?: { imageSourceId: string; candidateProviderIds: string[] };
      parserVrm?: string;
      parserRef?: string;
      parserMileage?: string;
      parserMileageUnit?: string;
      parserEva?: ParserEvaFields;
      caseType?: string;
      caseTypeSignals?: string[];
      boxFolder?: { id: string; url?: string };
      triggerCategory?: InboundCategory;
      otherFiles?: Array<{ boxFileId: string; filename: string; size?: number }>;
    },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    const result = await dataApi.retroCreate({
      original: input.original,
      trigger: input.trigger,
      keys: input.keys,
      casePo: input.casePo,
      vrm: input.vrm,
      statusName: input.statusName,
      onHold: input.onHold,
      actionReason: input.actionReason,
      reconstructionSource: input.reconstructionSource,
      providerId: input.providerId,
      intermediary: input.intermediary,
      parserVrm: input.parserVrm,
      parserRef: input.parserRef,
      parserMileage: input.parserMileage,
      parserMileageUnit: input.parserMileageUnit,
      parserEva: input.parserEva,
      caseType: input.caseType as 'standard' | 'audit' | 'audit_total_loss' | 'diminution' | undefined,
      caseTypeSignals: input.caseTypeSignals,
      boxFolder: input.boxFolder,
      triggerCategory: input.triggerCategory,
    });

    // Register the archive folder's OTHER files as byte-less Box evidence (link-only;
    // acceptedForEva=false so a retro backfill never pollutes the EVA image rules).
    // Best-effort: an evidence hiccup never unwinds the created/linked case.
    const caseId = result.caseId;
    if (caseId && (result.outcome === 'created' || result.outcome === 'already_exists_linked')) {
      const rows = (input.otherFiles ?? []).map((f) => ({
        filename: f.filename,
        boxFileId: f.boxFileId,
        boxFileUrl: `https://app.box.com/file/${encodeURIComponent(f.boxFileId)}`,
        size: f.size,
        evidenceClass: classifyArchiveFile(f.filename),
        acceptedForEva: false,
        sourceLabel: 'retro_box_archive',
      }));
      if (rows.length > 0) {
        try {
          const persisted = await dataApi.registerBoxEvidence(caseId, rows);
          ctx.log(JSON.stringify({ evt: 'retroCreatePersist', evidenceRows: persisted.persisted }));
        } catch (e) {
          ctx.warn(`[retroCreatePersist] archive evidence registration failed (best-effort): ${String(e)}`);
        }
      }
    }

    ctx.log(JSON.stringify({ evt: 'retroCreatePersist', outcome: result.outcome, caseId: result.caseId, casePo: result.casePo }));
    return result;
  },
});

df.app.activity('retroOutlookLocate', {
  handler: async (
    input: { keys: RetroKeys; trigger?: RetroTriggerIdentity },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    if (!gates.retroOutlookSearch()) return { skipped: 'outlook_gate_off' };
    const mailboxes = intakeMailboxes().map((m) => m.mailbox);
    if (mailboxes.length === 0) return { skipped: 'no_intake_mailboxes' };

    // PR-review fix (3×P1) — the trigger's checkpointed sender identity, corroborating
    // weak-keyed candidates below. The corpus is loaded lazily, ONCE per invocation, and
    // only when a gated rung actually has candidates; a load failure fails weak keys
    // CLOSED (drop) and external_ref OPEN ('unknown' — same_domain still works corpus-free).
    const triggerFrom = (input.trigger?.senderAddress ?? '').trim();
    const triggerIds = triggerProviderIdsOf(input.trigger);
    const triggerIdentityKnown = Boolean(triggerFrom) || triggerIds.length > 0;
    let corpus: ProviderMatchRecordsResult | null | undefined;
    const loadCorpus = async (): Promise<ProviderMatchRecordsResult | null> => {
      if (corpus === undefined) {
        try {
          corpus = await dataApi.providerMatchRecords();
        } catch (e) {
          corpus = null;
          ctx.warn(`[retroOutlookLocate] provider corpus load failed (weak keys fail closed): ${String(e)}`);
        }
      }
      return corpus;
    };

    // Key ladder, strongest-first; a decisive earlier key skips the noisier later
    // sweeps. Each mailbox searched independently — one failing mailbox (throttle,
    // RBAC cache) must not sink the rung. TKT-219: claimant is the weakest rung.
    const ladder: Array<{ key: string; matchedKey: string }> = [];
    if (input.keys.externalRef) ladder.push({ key: input.keys.externalRef, matchedKey: 'external_ref' });
    if (input.keys.casePo) ladder.push({ key: input.keys.casePo, matchedKey: 'case_po' });
    if (input.keys.vrm) ladder.push({ key: input.keys.vrm, matchedKey: 'vrm' });
    if (input.keys.claimant) ladder.push({ key: input.keys.claimant, matchedKey: 'claimant' });

    for (const rung of ladder) {
      // TKT-139 — Graph $search tokenization: a compact ref (PHA5007) does not match
      // the spaced form (PHA 5007) and vice versa. Issue EVERY variant (compact +
      // spaced at the alpha/digit boundaries) per mailbox and UNION the hits,
      // deduped by (mailbox, message id), before the single ranked pick. A claimant
      // NAME is already a natural phrase — compact/spaced ref variants would be
      // nonsense, so it searches as given only.
      const variants = rung.matchedKey === 'claimant' ? [rung.key] : refSearchVariants(rung.key);
      const candidates: OutlookSearchCandidate[] = [];
      const seen = new Set<string>();
      for (const mailbox of mailboxes) {
        for (const variant of variants) {
          try {
            // TKT-219: the retro original is by definition OLD mail and `$search`
            // results are SENT-date-sorted — sweep deep (bounded; pages sequential
            // inside searchMessages) instead of one 25-newest page, and surface a
            // truncated sweep instead of silently missing older matches.
            const hits = await searchMessages(
              mailbox,
              kqlPhrase(variant),
              RETRO_SEARCH_TOTAL_LIMIT,
              (message) => ctx.warn(`[retroOutlookLocate] ${message}`),
            );
            for (const h of hits) {
              const k = `${mailbox}\u0000${h.id}`;
              if (seen.has(k)) continue;
              seen.add(k);
              candidates.push({ ...h, mailbox });
            }
          } catch (e) {
            ctx.warn(
              `[retroOutlookLocate] $search failed on ${mailbox} (variant ${JSON.stringify(variant)}; continuing): ${String(e)}`,
            );
          }
        }
      }
      // PR-review fix (3×P1) — provider corroboration per rung, BEFORE ranking:
      //   vrm / claimant (weak)  → the candidate's sender must corroborate the trigger's
      //     provider identity ('agreed' or 'same_domain'), else it is DROPPED; an unknown
      //     trigger identity drops ALL weak candidates (the retroBoxLocate
      //     weak_key_uncorroborated rule applied to the mailbox — never link across
      //     providers on a registration or a person's name alone);
      //   external_ref → only a POSITIVE 'mismatch' drops; 'unknown' passes through and
      //     is surfaced as `providerCorroboration` for the audit trail;
      //   case_po → exempt (the PO names the case — self-corroborating).
      const weakRung = rung.matchedKey === 'vrm' || rung.matchedKey === 'claimant';
      const refRung = rung.matchedKey === 'external_ref';
      let gated = candidates;
      const verdicts = new Map<OutlookSearchCandidate, ReturnType<typeof senderProviderAgrees>>();
      if ((weakRung || refRung) && candidates.length > 0) {
        if (weakRung && !triggerIdentityKnown) {
          gated = [];
          ctx.log(JSON.stringify({
            evt: 'retroOutlookLocate', matchedKey: rung.matchedKey,
            reason: 'weak_key_uncorroborated', dropped: candidates.length,
          }));
        } else if (triggerIdentityKnown) {
          const loaded = await loadCorpus();
          gated = candidates.filter((c) => {
            const verdict = senderProviderAgrees({
              candidateFrom: c.from,
              candidateProviderIds: senderProviderIds(c.from, loaded),
              triggerFrom,
              triggerProviderIds: triggerIds,
            });
            verdicts.set(c, verdict);
            return weakRung
              ? verdict === 'agreed' || verdict === 'same_domain'
              : verdict !== 'mismatch';
          });
          if (gated.length < candidates.length) {
            ctx.log(JSON.stringify({
              evt: 'retroOutlookLocate', matchedKey: rung.matchedKey,
              reason: weakRung ? 'weak_key_uncorroborated' : 'provider_mismatch',
              dropped: candidates.length - gated.length,
            }));
          }
        }
        // refRung with an unknown trigger identity: nothing can positively mismatch —
        // every candidate passes as 'unknown' (no corpus load needed).
      }
      const ranked = rankOutlookOriginals(gated, { intakeMailboxes: mailboxes });
      const pick = ranked[0];
      if (pick) {
        ctx.log(JSON.stringify({
          evt: 'retroOutlookLocate', found: true, mailbox: pick.mailbox,
          matchedKey: rung.matchedKey, candidates: candidates.length,
        }));
        return {
          found: true,
          messageId: pick.id,
          mailbox: pick.mailbox,
          resource: `users/${pick.mailbox}/messages/${pick.id}`,
          matchedKey: rung.matchedKey,
          // PR-review fix — external_ref surfaces the pick's provider corroboration so
          // the orchestrator can stamp `outlook_provider:<value>` into caseTypeSignals.
          ...(refRung
            ? {
                providerCorroboration: (verdicts.get(pick) ?? 'unknown') as
                  | 'agreed'
                  | 'same_domain'
                  | 'unknown',
              }
            : {}),
          // TKT-219 follow-up — the ranked SHORTLIST so the orchestrator can fall back to
          // the next candidate when a pick is refused (blocked-family) or uncorroborated.
          candidates: ranked.slice(0, 3).map((c) => ({
            messageId: c.id,
            mailbox: c.mailbox,
            resource: `users/${c.mailbox}/messages/${c.id}`,
          })),
        };
      }
    }
    ctx.log(JSON.stringify({ evt: 'retroOutlookLocate', found: false }));
    return { found: false };
  },
});

df.app.activity('retroRecordFailure', {
  handler: async (
    input: {
      trigger: unknown;
      keys: RetroKeys;
      triggerCategory?: InboundCategory;
      rungsTried: string[];
      ambiguousFolders?: number;
      /** TKT-219 follow-up — located candidates the create seam refused (blocked-family
       *  classification): staff must see a candidate EXISTS and what blocks it. */
      refusedOriginals?: Array<{ internetMessageId: string; category: string }>;
      /** PR-review fix (CHANGE 2) — the trigger row's source mailbox so the attention
       *  stamp's UPDATE can scope to (source_message_id, source_mailbox). Optional —
       *  omitted when unknown; the trigger envelope's own sourceMailbox is the fallback. */
      sourceMailbox?: string;
    },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    const env = input.trigger as {
      internetMessageId?: string;
      subject?: string;
      sourceMailbox?: string;
    };
    const refused = input.refusedOriginals ?? [];
    await dataApi.recordAudit({
      action: 'retro_reconstruction_failed',
      severity: 'warning',
      summary:
        `Retro: no case found or reconstructable for ${input.triggerCategory ?? 'update'} email (${
          input.keys.casePo ?? input.keys.externalRef ?? input.keys.vrm ?? 'no key'
        })` +
        (refused.length > 0
          ? ` — a possible original WAS found but its classification ('${refused[0].category}') blocks it; review and reclassify that email, then re-run`
          : ''),
      after: {
        keys: input.keys,
        rungsTried: input.rungsTried,
        ...(input.ambiguousFolders ? { ambiguousFolders: input.ambiguousFolders } : {}),
        ...(refused.length > 0 ? { refusedOriginals: refused } : {}),
        messageId: env.internetMessageId,
        subject: env.subject,
      },
    });
    // TKT-119c — give the failure a VISIBLE home: stamp the trigger email's triage row
    // so staff see "Unable to locate" on the inbox row instead of a silent nothing.
    // Best-effort (schema-tolerant server-side) — the audit above is the durable record.
    if (env.internetMessageId) {
      try {
        // PR-review fix (CHANGE 2) — forward the known mailbox so the route can scope
        // its UPDATE; optional (omitted when neither the caller nor the envelope has it).
        const sourceMailbox = (input.sourceMailbox ?? env.sourceMailbox ?? '').trim();
        await dataApi.markInboundAttention({
          sourceMessageId: env.internetMessageId,
          reason: 'unable_to_locate',
          ...(sourceMailbox ? { sourceMailbox } : {}),
        });
      } catch (e) {
        ctx.warn(`[retroRecordFailure] attention stamp failed (best-effort): ${String(e)}`);
      }
    }
    ctx.log(JSON.stringify({ evt: 'retroRecordFailure', keys: input.keys, rungsTried: input.rungsTried }));
    return { recorded: true };
  },
});

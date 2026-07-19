/**
 * Provider corroboration plumbing (PR-review fix, 3×P1).
 *
 * The two sides of the retro weak-key corroboration rule, shared by the Outlook locate
 * rung (retro-activities.ts) and the related-linking rung (retro-related-activities.ts):
 * resolve a candidate sender to work-provider ids exactly as intake does, and read the
 * trigger's checkpointed provider identity. Both feed `senderProviderAgrees`
 * (retro-envelope.ts) so a registration or a person's name alone never links across
 * providers (ADR-0010 applied to the archive/mailbox).
 */
import { matchSenderIdentity } from '@cs/domain';
import type { ProviderMatchRecordsResult } from '../../adapters/data-api-contracts.js';
import type { RetroTriggerIdentity } from './retro-envelope.js';

/** Resolve a sender address to work-provider ids exactly as intake's providerMatch does
 *  (`matchSenderIdentity` over the SAME provider-match corpus): a direct match yields
 *  that one id; an ambiguity yields the colliding ids; an Image-Source intermediary
 *  yields its candidate ids; none/unparseable (or no corpus) yields []. */
export function senderProviderIds(
  from: string,
  corpus: ProviderMatchRecordsResult | null,
): string[] {
  if (!from || !corpus) return [];
  const identity = matchSenderIdentity(from, corpus.providers, corpus.imageSources);
  if (identity.kind === 'provider') {
    if (identity.result.outcome === 'matched' && identity.result.workProviderId) {
      return [identity.result.workProviderId];
    }
    return identity.result.ambiguousProviderIds ?? [];
  }
  if (identity.kind === 'intermediary') return [...identity.candidateProviderIds];
  return [];
}

/** The trigger side of the corroboration: the checkpointed providerMatch facts
 *  (direct provider id and/or intermediary candidate ids), deduped. */
export function triggerProviderIdsOf(trigger: RetroTriggerIdentity | undefined): string[] {
  const ids = [
    ...(trigger?.providerId ? [trigger.providerId] : []),
    ...(trigger?.intermediaryCandidateProviderIds ?? []),
  ];
  return [...new Set(ids.map((v) => v.trim()).filter(Boolean))];
}

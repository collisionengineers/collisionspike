/** Read-only Microsoft Graph message-link resolution for TKT-009. */
import { normalizeOutlookWebLink, type OutlookMessageLinkResolution } from '@cs/domain';
import { graphFetch, odataQuote } from '../adapters/graph.js';

interface LinkMessage {
  id?: string;
  webLink?: string;
}

export function classifyOutlookReadError(error: unknown): OutlookMessageLinkResolution {
  const detail = error instanceof Error ? error.message : String(error ?? '');
  if (/→\s*404\b|ErrorItemNotFound|ResourceNotFound/i.test(detail)) return { status: 'not_found' };
  if (/→\s*403\b|ErrorAccessDenied|Access is denied/i.test(detail)) return { status: 'not_accessible' };
  return { status: 'unavailable' };
}

function available(message: LinkMessage | null | undefined): OutlookMessageLinkResolution {
  const outlookWebLink = normalizeOutlookWebLink(message?.webLink);
  return outlookWebLink ? { status: 'available', outlookWebLink } : { status: 'unavailable' };
}

/** Resolve/check one current message using the immutable Graph id stored at intake. */
export async function readMessageLinkByImmutableId(
  sourceMailbox: string,
  graphMessageId: string,
): Promise<OutlookMessageLinkResolution> {
  const mailbox = sourceMailbox.trim();
  const id = graphMessageId.trim();
  if (!mailbox || !id) return { status: 'missing_identity' };
  try {
    const path =
      `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(id)}` +
      `?$select=id,webLink`;
    const message = await graphFetch<LinkMessage>(path, {
      headers: { Prefer: 'IdType="ImmutableId"' },
    });
    return available(message);
  } catch (error) {
    return classifyOutlookReadError(error);
  }
}

export type StoredLinkLookup =
  | { status: 'resolved'; graphMessageId: string; outlookWebLink: string }
  | { status: 'not_found' | 'not_accessible' | 'ambiguous' | 'unavailable'; reason: string };

/**
 * Read-only recovery for a missing stored link. The RFC Internet-Message-Id is qualified by mailbox,
 * Graph is asked for immutable ids, and >1 exact hit abstains instead of guessing.
 */
export async function findStoredMessageLink(
  sourceMailbox: string,
  internetMessageId: string,
): Promise<StoredLinkLookup> {
  const mailbox = sourceMailbox.trim();
  const messageId = internetMessageId.trim();
  if (!mailbox || !messageId) return { status: 'not_found', reason: 'missing_source_identity' };
  try {
    const filter = encodeURIComponent(`internetMessageId eq ${odataQuote(messageId)}`);
    const path =
      `/users/${encodeURIComponent(mailbox)}/messages` +
      `?$filter=${filter}&$select=id,webLink&$top=2`;
    const response = await graphFetch<{ value?: LinkMessage[] }>(path, {
      headers: { Prefer: 'IdType="ImmutableId"' },
    });
    const hits = response.value ?? [];
    if (hits.length === 0) return { status: 'not_found', reason: 'message_not_found' };
    if (hits.length > 1) return { status: 'ambiguous', reason: 'multiple_exact_matches' };
    const graphMessageId = hits[0]?.id?.trim() ?? '';
    const outlookWebLink = normalizeOutlookWebLink(hits[0]?.webLink);
    if (!graphMessageId || !outlookWebLink) {
      return { status: 'unavailable', reason: 'incomplete_graph_result' };
    }
    return { status: 'resolved', graphMessageId, outlookWebLink };
  } catch (error) {
    const classified = classifyOutlookReadError(error);
    if (classified.status === 'not_found') return { status: 'not_found', reason: 'message_not_found' };
    if (classified.status === 'not_accessible') return { status: 'not_accessible', reason: 'mailbox_not_accessible' };
    return { status: 'unavailable', reason: 'graph_read_failed' };
  }
}

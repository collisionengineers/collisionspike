/**
 * Read-only bridge from the staff-authenticated Data API to the orchestration app,
 * which alone owns the Exchange-scoped Graph credential. The caller supplies the
 * immutable identity read from Postgres; browser input is never forwarded.
 */
import { normalizeOutlookWebLink, type OutlookMessageLinkResolution } from '@cs/domain';

const TIMEOUT_MS = 10_000;

export async function resolveCurrentOutlookLink(input: {
  sourceMailbox: string;
  graphMessageId: string;
}): Promise<OutlookMessageLinkResolution> {
  const url = (process.env.OUTLOOK_LINK_RESOLVER_URL ?? '').trim();
  const key = (process.env.OUTLOOK_LINK_RESOLVER_KEY ?? '').trim();
  if (!url || !key) return { status: 'unavailable' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-functions-key': key,
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!response.ok) return { status: 'unavailable' };
    const payload = (await response.json().catch(() => ({}))) as Partial<OutlookMessageLinkResolution>;
    if (payload.status === 'available') {
      const outlookWebLink = normalizeOutlookWebLink(payload.outlookWebLink);
      return outlookWebLink ? { status: 'available', outlookWebLink } : { status: 'unavailable' };
    }
    if (
      payload.status === 'not_found' ||
      payload.status === 'not_accessible' ||
      payload.status === 'missing_identity' ||
      payload.status === 'unavailable'
    ) {
      return { status: payload.status };
    }
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

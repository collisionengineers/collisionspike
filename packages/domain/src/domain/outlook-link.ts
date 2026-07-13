/* ============================================================
   Outlook message-open targets (TKT-009).

   Microsoft Graph's message.webLink is the authoritative browser target for an
   Outlook message. The SPA must never assemble a mailbox URL from a subject,
   Internet-Message-Id, or any other untrusted mail content. This helper is shared
   by the API mapper and SPA so only HTTPS links on the two Microsoft 365 Outlook
   hosts used for work/school mail can reach a rendered external action.
   ============================================================ */

/** Exact hosts Microsoft Graph uses for work/school Outlook-on-the-web links. */
export const OUTLOOK_WEB_LINK_HOSTS = [
  'outlook.office365.com',
  'outlook.office.com',
] as const;

const OUTLOOK_WEB_LINK_HOST_SET = new Set<string>(OUTLOOK_WEB_LINK_HOSTS);

/**
 * Return a canonical safe Outlook-on-the-web link, or undefined when the value
 * is absent/untrusted. User info and explicit ports are rejected as well as a
 * non-HTTPS scheme or an unexpected host.
 */
export function normalizeOutlookWebLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const raw = value.trim();
  if (!raw || raw.length > 4_096) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return undefined;
    if (url.username || url.password || url.port) return undefined;
    if (!OUTLOOK_WEB_LINK_HOST_SET.has(url.hostname.toLowerCase())) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

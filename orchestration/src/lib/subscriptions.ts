/**
 * orchestration/src/lib/subscriptions.ts
 *
 * Microsoft Graph change-notification subscription create/manage helper (plan 22 §A.2/§A.5/§A.6).
 *
 * One subscription per shared intake mailbox (the project has three — domain model).
 * `resource` = users/<mailbox>/mailFolders('Inbox')/messages; changeType `created`;
 * `includeResourceData:false` so the Outlook `message` max lifetime is 10,080 minutes
 * (< 7 days) and no encryption certificate is needed — the notification carries only the
 * message id and the webhook fetches the body/attachments via Graph (plan 22 §A.2).
 *
 * Mailbox + watermark config comes from the GRAPH_INTAKE_MAILBOXES app-setting:
 *   a JSON array of { mailbox, minIntakeDate } (the two flow params IntakeMailbox + MinIntakeDate,
 *   plan 22 §A). Seeding each mailbox's watermark to its MinIntakeDate at create time keeps a
 *   freshly-subscribed mailbox from ingesting historical backlog.
 */

import { graphFetch } from './graph.js';

/** Target lifetime margin: now + 6 days 23 h — a safe margin under the 10,080-min max. */
export const RENEWAL_MARGIN_MS = (6 * 24 + 23) * 3_600_000;

const SUBSCRIPTIONS_PATH = '/subscriptions';

export interface IntakeMailboxConfig {
  /** The shared intake mailbox UPN/address (flow param IntakeMailbox). */
  mailbox: string;
  /** Go-live watermark — never ingest messages before this (flow param MinIntakeDate). */
  minIntakeDate: string;
}

export interface GraphSubscription {
  id: string;
  resource: string;
  notificationUrl: string;
  lifecycleNotificationUrl?: string;
  expirationDateTime: string;
  clientState?: string;
}

/** Read the per-mailbox intake config from app-settings (honest-empty on absence). */
export function intakeMailboxes(): IntakeMailboxConfig[] {
  const raw = process.env.GRAPH_INTAKE_MAILBOXES;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as IntakeMailboxConfig[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function resourceFor(mailbox: string): string {
  return `users/${mailbox}/mailFolders('Inbox')/messages`;
}

function nextExpiration(): string {
  return new Date(Date.now() + RENEWAL_MARGIN_MS).toISOString();
}

function baseUrl(): string {
  // e.g. https://cespk-orch-dev.azurewebsites.net  (app-setting; falls back to WEBSITE_HOSTNAME)
  const explicit = process.env.ORCH_PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const host = process.env.WEBSITE_HOSTNAME;
  if (host) return `https://${host}`;
  throw new Error('missing ORCH_PUBLIC_BASE_URL / WEBSITE_HOSTNAME for notificationUrl');
}

/**
 * Create one subscription for a mailbox (plan 22 §A.2). Idempotent-friendly: callers
 * (lifecycle `subscriptionRemoved`, renewal 404) recreate by calling this again.
 */
export async function createSubscription(mailbox: string): Promise<GraphSubscription> {
  const url = baseUrl();
  return graphFetch<GraphSubscription>(SUBSCRIPTIONS_PATH, {
    method: 'POST',
    body: JSON.stringify({
      changeType: 'created',
      notificationUrl: `${url}/api/graph-webhook`,
      lifecycleNotificationUrl: `${url}/api/graph-lifecycle`,
      resource: resourceFor(mailbox),
      expirationDateTime: nextExpiration(),
      clientState: requireClientState(),
      includeResourceData: false,
    }),
  });
}

/** PATCH-renew a subscription's expiration forward (plan 22 §A.5). */
export async function renewSubscription(subscriptionId: string): Promise<GraphSubscription> {
  return graphFetch<GraphSubscription>(`${SUBSCRIPTIONS_PATH}/${subscriptionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ expirationDateTime: nextExpiration() }),
  });
}

/** List the subscription ids this app owns — filtered by our notificationUrl host. */
export async function listOurSubscriptions(): Promise<GraphSubscription[]> {
  const url = baseUrl();
  const res = await graphFetch<{ value: GraphSubscription[] }>(SUBSCRIPTIONS_PATH);
  return (res.value ?? []).filter((s) => (s.notificationUrl ?? '').startsWith(url));
}

/** Resolve the mailbox a subscription is scoped to (parse the `resource`). */
export function mailboxOfResource(resource: string): string {
  // users/<mailbox>/mailFolders('Inbox')/messages
  const m = /^users\/([^/]+)\//.exec(resource ?? '');
  return m ? m[1] : '';
}

function requireClientState(): string {
  const cs = process.env.GRAPH_CLIENT_STATE;
  if (!cs) throw new Error('missing GRAPH_CLIENT_STATE');
  if (cs.length > 128) throw new Error('GRAPH_CLIENT_STATE exceeds 128 chars');
  return cs;
}

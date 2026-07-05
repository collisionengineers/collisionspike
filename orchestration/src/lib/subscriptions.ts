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

/** DELETE a Graph subscription (204 → undefined). Used by the maintenance prune step to
 *  retire a subscription for a mailbox removed from GRAPH_INTAKE_MAILBOXES. */
export async function deleteSubscription(subscriptionId: string): Promise<void> {
  await graphFetch(`${SUBSCRIPTIONS_PATH}/${subscriptionId}`, { method: 'DELETE' });
}

/** Minimal logger shape shared by the timer / HTTP / durable-activity callers. */
export interface MaintenanceLog {
  log: (m: string) => void;
  warn: (m: string) => void;
  error: (m: string) => void;
}

export interface MaintenanceSummary {
  created: string[];
  renewed: Array<{ subId: string; next?: string }>;
  recreated: string[];
  /** Mailboxes whose subscription was DELETED because they left GRAPH_INTAKE_MAILBOXES. */
  pruned: string[];
  errors: string[];
}

/**
 * Bootstrap-create any missing intake subscriptions, then PATCH-renew every existing one
 * (plan 22 §A.2/§A.5). The single shared routine behind the graph-renew timer (backstop), the
 * graph-renew HTTP route, and the durable subscriptionMonitor — so renewal no longer depends on
 * the Flex scale-to-zero timer that never fires (the timer trigger is not woken at a scheduled
 * tick; durable timers and HTTP ARE). Idempotent + best-effort: a per-mailbox / per-subscription
 * failure is logged and collected, never thrown (one bad mailbox must not stop the rest).
 */
export async function runSubscriptionMaintenance(logger: MaintenanceLog): Promise<MaintenanceSummary> {
  const summary: MaintenanceSummary = { created: [], renewed: [], recreated: [], pruned: [], errors: [] };
  const subs = await listOurSubscriptions();
  const configured = intakeMailboxes();
  const configuredMailboxes = new Set(configured.map((c) => c.mailbox));
  const subbed = new Set(subs.map((s) => mailboxOfResource(s.resource)).filter(Boolean));

  // BOOTSTRAP — ensure every configured intake mailbox has a subscription (create if missing).
  for (const cfg of configured) {
    if (subbed.has(cfg.mailbox)) continue;
    try {
      const created = await createSubscription(cfg.mailbox);
      summary.created.push(cfg.mailbox);
      logger.log(JSON.stringify({ evt: 'graph-subscription-created', subId: created.id, mailbox: cfg.mailbox, next: created.expirationDateTime }));
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      summary.errors.push(`create ${cfg.mailbox}: ${m}`);
      logger.error(`[subscription-maintenance] bootstrap ${cfg.mailbox} failed (is the mailbox Exchange-RBAC-scoped?): ${m}`);
    }
  }

  // RENEW — PATCH every existing subscription forward; 404 (gone) → recreate for the same mailbox.
  for (const sub of subs) {
    // PRUNE — a subscription whose mailbox is no longer in GRAPH_INTAKE_MAILBOXES is retired
    // (was previously renewed forever, so a de-scoped mailbox like digital@ had to be deleted by
    // hand). Guarded: only prune when the config is non-empty (never wipe every sub on a config
    // glitch) AND the mailbox parsed cleanly (never delete a subscription we cannot attribute).
    const mbx = mailboxOfResource(sub.resource);
    if (configured.length > 0 && mbx && !configuredMailboxes.has(mbx)) {
      try {
        await deleteSubscription(sub.id);
        summary.pruned.push(mbx);
        logger.log(JSON.stringify({ evt: 'graph-subscription-pruned', subId: sub.id, mailbox: mbx }));
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        summary.errors.push(`prune ${sub.id} (${mbx}): ${m}`);
        logger.error(`[subscription-maintenance] prune ${sub.id} (${mbx}) failed: ${m}`);
      }
      continue;
    }
    try {
      const renewed = await renewSubscription(sub.id);
      summary.renewed.push({ subId: sub.id, next: renewed.expirationDateTime });
      logger.log(JSON.stringify({ evt: 'graph-renewal-success', subId: sub.id, next: renewed.expirationDateTime }));
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m.includes('→ 404')) {
        const mailbox = mailboxOfResource(sub.resource);
        logger.warn(`[subscription-maintenance] subscription ${sub.id} gone — recreating for ${mailbox}`);
        if (mailbox) {
          try {
            const rc = await createSubscription(mailbox);
            summary.recreated.push(mailbox);
            logger.log(JSON.stringify({ evt: 'graph-renewal-success', subId: rc.id, recreated: true, next: rc.expirationDateTime }));
          } catch (e2) {
            const m2 = e2 instanceof Error ? e2.message : String(e2);
            summary.errors.push(`recreate ${mailbox}: ${m2}`);
            logger.error(`[subscription-maintenance] recreate ${mailbox} failed: ${m2}`);
          }
        }
      } else {
        summary.errors.push(`renew ${sub.id}: ${m}`);
        logger.error(`[subscription-maintenance] PATCH ${sub.id} failed: ${m}`);
      }
    }
  }

  if (subs.length === 0 && configured.length === 0) {
    logger.warn('[subscription-maintenance] no managed subscriptions and no configured intake mailboxes');
  }
  return summary;
}

/** Resolve the mailbox a subscription is scoped to (parse the `resource`). */
export function mailboxOfResource(resource: string): string {
  // users/<mailbox>/mailFolders('Inbox')/messages — Graph change notifications echo the
  // path with varying casing (e.g. "Users/<mbx>/Messages/<id>"), so match case-insensitively.
  const m = /^users\/([^/]+)\//i.exec(resource ?? '');
  return m ? m[1] : '';
}

/**
 * True when a parsed mailbox reads as a real address (local@domain). Graph change
 * notifications canonicalise `resource` to `Users/<object-id-GUID>/Messages/<id>`, so
 * `mailboxOfResource` on a NOTIFICATION yields the mailbox GUID — which must not be
 * persisted as source_mailbox provenance (TKT-054: every inbox chip read "Other source").
 */
export function looksLikeMailboxAddress(value: string): boolean {
  return /^[^@\s]+@[^@\s]+$/.test(value ?? '');
}

/** subscriptionId → mailbox UPN, memoised for the process lifetime (subs live < 7 days). */
const subscriptionMailboxCache = new Map<string, string>();

/**
 * Resolve the mailbox a notification belongs to via its subscription: the subscription we
 * CREATED carries the UPN in `resource` (unlike the notification's canonicalised GUID form),
 * and GET /subscriptions/{id} is readable with the app's own token (same grant that lists
 * them for renewal). Never throws — intake must never block on provenance; returns '' on
 * any failure (callers fall back to the parsed notification value, backfillable later).
 */
export async function resolveSubscriptionMailbox(subscriptionId: string): Promise<string> {
  if (!subscriptionId) return '';
  const hit = subscriptionMailboxCache.get(subscriptionId);
  if (hit) return hit;
  try {
    const sub = await graphFetch<GraphSubscription>(`${SUBSCRIPTIONS_PATH}/${subscriptionId}`);
    const mailbox = mailboxOfResource(sub.resource ?? '');
    if (!looksLikeMailboxAddress(mailbox)) return '';
    subscriptionMailboxCache.set(subscriptionId, mailbox);
    return mailbox;
  } catch {
    return '';
  }
}

/** Test seam: drop memoised subscription→mailbox entries. */
export function clearSubscriptionMailboxCache(): void {
  subscriptionMailboxCache.clear();
}

function requireClientState(): string {
  const cs = process.env.GRAPH_CLIENT_STATE;
  if (!cs) throw new Error('missing GRAPH_CLIENT_STATE');
  if (cs.length > 128) throw new Error('GRAPH_CLIENT_STATE exceeds 128 chars');
  return cs;
}

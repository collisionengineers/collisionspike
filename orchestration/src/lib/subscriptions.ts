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

import { gates } from '@cs/domain/gates';
import { graphFetch } from './graph.js';

/** Target lifetime margin: now + 6 days 23 h — a safe margin under the 10,080-min max. */
export const RENEWAL_MARGIN_MS = (6 * 24 + 23) * 3_600_000;

const SUBSCRIPTIONS_PATH = '/subscriptions';
export const IMMUTABLE_ID_MARKER = 'idType=immutable-v1';

/**
 * The two mail folders this app subscribes to (TKT-095 detector (a) added SentItems):
 *  - 'Inbox'     — the live intake pipeline (always, per configured mailbox);
 *  - 'SentItems' — the gated sent-email-to-provider `done` detector; created ONLY while
 *    DONE_SENT_EMAIL_ENABLED is true, pruned by maintenance whenever it is false.
 */
export type SubscriptionFolder = 'Inbox' | 'SentItems';

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

function resourceFor(mailbox: string, folder: SubscriptionFolder = 'Inbox'): string {
  return `users/${mailbox}/mailFolders('${folder}')/messages`;
}

/**
 * Parse the mail folder out of a SUBSCRIPTION resource (the form we created it with —
 * `users/<mbx>/mailFolders('<Folder>')/messages`). Returns '' for the canonicalised
 * NOTIFICATION form (`Users/<GUID>/Messages/<id>`), which carries no folder — only
 * subscription objects (list/GET) are folder-attributable.
 */
export function folderOfResource(resource: string): string {
  const m = /mailFolders\('([^']+)'\)/i.exec(resource ?? '');
  return m ? m[1] : '';
}

/** True when a subscription resource is scoped to Sent Items (TKT-095 detector (a)). */
export function isSentItemsResource(resource: string): boolean {
  return folderOfResource(resource).toLowerCase() === 'sentitems';
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
 *
 * `folder` (TKT-095 detector (a)): 'Inbox' (default — byte-identical to the pre-TKT-095
 * behaviour) or 'SentItems'. A SentItems subscription routes to the SEPARATE
 * /api/graph-webhook-sent + /api/graph-lifecycle-sent endpoints so a sent-message
 * notification can NEVER enter the intake pipeline, and so the existing Inbox
 * graph-lifecycle handler (whose subscriptionRemoved arm recreates INBOX subscriptions)
 * never has to disambiguate a folder it cannot see on the notification form.
 */
export async function createSubscription(
  mailbox: string,
  folder: SubscriptionFolder = 'Inbox',
): Promise<GraphSubscription> {
  const url = baseUrl();
  const sent = folder === 'SentItems';
  const notificationPath = sent ? 'graph-webhook-sent' : 'graph-webhook';
  const lifecyclePath = sent ? 'graph-lifecycle-sent' : 'graph-lifecycle';
  return graphFetch<GraphSubscription>(SUBSCRIPTIONS_PATH, {
    method: 'POST',
    // Change notifications inherit the requested Outlook id type at CREATE time.
    // PATCH renewal cannot convert a legacy subscription. Conversion belongs to the
    // separately approved durable cutover runbook; routine maintenance never rotates it.
    headers: { Prefer: 'IdType="ImmutableId"' },
    body: JSON.stringify({
      changeType: 'created',
      notificationUrl: `${url}/api/${notificationPath}?${IMMUTABLE_ID_MARKER}`,
      lifecycleNotificationUrl: `${url}/api/${lifecyclePath}?${IMMUTABLE_ID_MARKER}`,
      resource: resourceFor(mailbox, folder),
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
  /** Mailboxes bootstrapped this pass. SentItems entries carry a `sentitems:` prefix
   *  (TKT-095 detector (a)); bare entries are Inbox, as before. */
  created: string[];
  renewed: Array<{ subId: string; next?: string }>;
  recreated: string[];
  /** Subscriptions DELETED this pass: a mailbox that left GRAPH_INTAKE_MAILBOXES, or a
   *  `sentitems:`-prefixed entry pruned because DONE_SENT_EMAIL_ENABLED is off (TKT-095). */
  pruned: string[];
  /** Kept for response-shape compatibility. Routine maintenance never rotates subscriptions. */
  rotated: string[];
  /** Legacy subscriptions renewed in place pending the blocked, durable cutover runbook.
   *  SentItems entries carry a `sentitems:` prefix. */
  rotationRequired: string[];
  errors: string[];
}

export function isImmutableIdSubscription(subscription: GraphSubscription): boolean {
  return (subscription.notificationUrl ?? '').includes(IMMUTABLE_ID_MARKER);
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
  const summary: MaintenanceSummary = {
    created: [], renewed: [], recreated: [], pruned: [], rotated: [], rotationRequired: [], errors: [],
  };
  const subs = await listOurSubscriptions();
  const configured = intakeMailboxes();
  const configuredMailboxes = new Set(configured.map((c) => c.mailbox));
  // TKT-095 detector (a): SentItems subscriptions exist ONLY while the gate is on.
  // With the gate OFF (the live default) and no SentItems subscriptions present, every
  // step below is byte-identical to the pre-TKT-095 routine.
  const sentGateOn = gates.doneSentEmail();
  // Graph rejects a second subscription for the same changeType + resource with 409,
  // regardless of callback URL. A legacy subscription therefore counts as PRESENT here:
  // routine maintenance renews it and reports controlled rotation as required. It must
  // never attempt create-before-delete or auto-delete a live delivery path.
  const inboxReady = new Set(
    subs.filter((s) => !isSentItemsResource(s.resource))
      .map((s) => mailboxOfResource(s.resource)).filter(Boolean),
  );
  const sentReady = new Set(
    subs.filter((s) => isSentItemsResource(s.resource))
      .map((s) => mailboxOfResource(s.resource)).filter(Boolean),
  );

  // BOOTSTRAP — ensure every configured intake mailbox has an Inbox subscription (create if missing).
  for (const cfg of configured) {
    if (inboxReady.has(cfg.mailbox)) continue;
    try {
      const created = await createSubscription(cfg.mailbox);
      inboxReady.add(cfg.mailbox);
      summary.created.push(cfg.mailbox);
      logger.log(JSON.stringify({ evt: 'graph-subscription-created', subId: created.id, mailbox: cfg.mailbox, next: created.expirationDateTime }));
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      summary.errors.push(`create ${cfg.mailbox}: ${m}`);
      logger.error(`[subscription-maintenance] bootstrap ${cfg.mailbox} failed (is the mailbox Exchange-RBAC-scoped?): ${m}`);
    }
  }

  // BOOTSTRAP SentItems (TKT-095 detector (a)) — gate ON only: one SentItems subscription
  // per configured intake mailbox, feeding /api/graph-webhook-sent (never the intake queue).
  if (sentGateOn) {
    for (const cfg of configured) {
      if (sentReady.has(cfg.mailbox)) continue;
      try {
        const created = await createSubscription(cfg.mailbox, 'SentItems');
        sentReady.add(cfg.mailbox);
        summary.created.push(`sentitems:${cfg.mailbox}`);
        logger.log(JSON.stringify({ evt: 'graph-subscription-created', subId: created.id, mailbox: cfg.mailbox, folder: 'SentItems', next: created.expirationDateTime }));
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        summary.errors.push(`create sentitems:${cfg.mailbox}: ${m}`);
        logger.error(`[subscription-maintenance] SentItems bootstrap ${cfg.mailbox} failed (is the mailbox Exchange-RBAC-scoped?): ${m}`);
      }
    }
  }

  // RENEW — PATCH every existing subscription forward; 404 (gone) → recreate for the same mailbox.
  for (const sub of subs) {
    // PRUNE — a subscription whose mailbox is no longer in GRAPH_INTAKE_MAILBOXES is retired
    // (was previously renewed forever, so a de-scoped mailbox like digital@ had to be deleted by
    // hand). Guarded: only prune when the config is non-empty (never wipe every sub on a config
    // glitch) AND the mailbox parsed cleanly (never delete a subscription we cannot attribute).
    const mbx = mailboxOfResource(sub.resource);
    const isSent = isSentItemsResource(sub.resource);
    if (configured.length > 0 && mbx && !configuredMailboxes.has(mbx)) {
      try {
        await deleteSubscription(sub.id);
        summary.pruned.push(isSent ? `sentitems:${mbx}` : mbx);
        logger.log(JSON.stringify({ evt: 'graph-subscription-pruned', subId: sub.id, mailbox: mbx, ...(isSent ? { folder: 'SentItems' } : {}) }));
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        summary.errors.push(`prune ${sub.id} (${mbx}): ${m}`);
        logger.error(`[subscription-maintenance] prune ${sub.id} (${mbx}) failed: ${m}`);
      }
      continue;
    }
    // PRUNE SentItems on gate OFF (TKT-095 detector (a)) — a gate flip fully self-reconciles:
    // OFF retires every SentItems subscription the ON state created (the same semantics as the
    // mailbox prune above; folder attribution comes from the subscription's own resource, so
    // this can never touch an Inbox subscription). No config guard needed: this prune is
    // gate-driven, not config-driven, and a SentItems subscription must not outlive its gate.
    if (isSent && !sentGateOn) {
      try {
        await deleteSubscription(sub.id);
        summary.pruned.push(`sentitems:${mbx || sub.id}`);
        logger.log(JSON.stringify({ evt: 'graph-subscription-pruned', subId: sub.id, mailbox: mbx, folder: 'SentItems', reason: 'gate_off' }));
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        summary.errors.push(`prune sentitems ${sub.id} (${mbx}): ${m}`);
        logger.error(`[subscription-maintenance] SentItems prune ${sub.id} (${mbx}) failed: ${m}`);
      }
      continue;
    }
    // A subscription's id type is fixed at creation. Routine maintenance deliberately
    // does NOT rotate legacy subscriptions: Graph forbids create-before-delete (409),
    // while delete-before-create needs a controlled, bounded catch-up window. Report it
    // and renew below. The future cutover needs a durable one-mailbox operation ledger,
    // persisted delta checkpoint, proven queue drain and idempotent outbox before it can run.
    if (mbx && !isImmutableIdSubscription(sub)) {
      const label = isSent ? `sentitems:${mbx}` : mbx;
      summary.rotationRequired.push(label);
      logger.warn(JSON.stringify({
        evt: 'graph-subscription-rotation-required',
        subId: sub.id,
        mailbox: mbx,
        ...(isSent ? { folder: 'SentItems' } : {}),
        action: 'follow_blocked_cutover_runbook',
      }));
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
            // Recreate in the SAME folder the dead subscription covered (Inbox pre-TKT-095
            // behaviour unchanged; a gone SentItems sub recreates as SentItems).
            const rc = await createSubscription(mailbox, isSent ? 'SentItems' : 'Inbox');
            summary.recreated.push(isSent ? `sentitems:${mailbox}` : mailbox);
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

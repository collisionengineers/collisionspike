/** *
 * READ-ONLY Graph feasibility probe over the intake mailboxes' DELETED ITEMS —
 * evidence for the "can Deleted Items reconstitute cases?" decision memo. It
 * measures, it never mutates: no message is moved, copied, flagged or deleted,
 * and nothing is written anywhere (the caller records the JSON).
 *
 * POST /api/retro-deleted-probe   (function key)
 *   body: { keys?: string[] }   — sample refs/VRMs/claimants to search for
 * Returns per mailbox:
 *   - deletedItems.totalItemCount (folder property — the volume the TKT-059
 *     dry-run deliberately excluded),
 *   - per key: hit counts in the Deleted Items scope vs the WHOLE-mailbox
 *     $search scope (which per Microsoft Learn user-list-messages already
 *     includes Deleted Items — the retro Outlook rung therefore already reaches
 *     deleted mail; this probe quantifies how much of the recoverable material
 *     lives ONLY there).
 *
 * Gated on RETRO_CASE_ENABLED (it rides the retro machinery's Mail.Read scope);
 * keyed because it drives Graph reads for caller-supplied terms.
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { gates } from '@cs/domain/gates';
import { graphFetch, kqlPhrase, searchMessages } from '../../adapters/graph.js';
import { intakeMailboxes } from '../../platform/subscriptions.js';

interface KeyProbe {
  key: string;
  deletedScopeHits: number;
  wholeMailboxHits: number;
  sample: Array<{ subject: string; receivedDateTime: string }>;
}

app.http('retro-deleted-probe', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'retro-deleted-probe',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!gates.retroCase()) {
      return { status: 200, jsonBody: { skipped: true, reason: 'RETRO_CASE_ENABLED off' } };
    }
    const body = (await req.json().catch(() => ({}))) as { keys?: unknown };
    const keys = (Array.isArray(body.keys) ? body.keys : [])
      .map((k) => String(k ?? '').trim())
      .filter(Boolean)
      .slice(0, 25); // a probe, not a sweep

    const mailboxes = intakeMailboxes().map((m) => m.mailbox);
    const result: Array<{
      mailbox: string;
      deletedTotalItemCount: number | null;
      inboxTotalItemCount: number | null;
      keys: KeyProbe[];
      error?: string;
    }> = [];

    for (const mailbox of mailboxes) {
      const u = encodeURIComponent(mailbox);
      const entry: (typeof result)[number] = {
        mailbox,
        deletedTotalItemCount: null,
        inboxTotalItemCount: null,
        keys: [],
      };
      try {
        const deleted = await graphFetch<{ totalItemCount?: number }>(
          `/users/${u}/mailFolders/deleteditems?$select=totalItemCount`,
        );
        entry.deletedTotalItemCount = deleted.totalItemCount ?? null;
        const inbox = await graphFetch<{ totalItemCount?: number }>(
          `/users/${u}/mailFolders/Inbox?$select=totalItemCount`,
        );
        entry.inboxTotalItemCount = inbox.totalItemCount ?? null;

        for (const key of keys) {
          const probe: KeyProbe = { key, deletedScopeHits: 0, wholeMailboxHits: 0, sample: [] };
          try {
            const phrase = encodeURIComponent(kqlPhrase(key));
            const deletedHits = await graphFetch<{
              value?: Array<{ subject?: string; receivedDateTime?: string }>;
            }>(
              `/users/${u}/mailFolders/deleteditems/messages?$search=${phrase}` +
                `&$select=subject,receivedDateTime&$top=10`,
            );
            probe.deletedScopeHits = deletedHits.value?.length ?? 0;
            probe.sample = (deletedHits.value ?? []).slice(0, 3).map((m) => ({
              subject: m.subject ?? '',
              receivedDateTime: m.receivedDateTime ?? '',
            }));
            const whole = await searchMessages(mailbox, kqlPhrase(key), 10);
            probe.wholeMailboxHits = whole.length;
          } catch (e) {
            ctx.warn(`[retro-deleted-probe] key '${key}' on ${mailbox} failed: ${String(e)}`);
          }
          entry.keys.push(probe);
        }
      } catch (e) {
        entry.error = e instanceof Error ? e.message : String(e);
      }
      result.push(entry);
    }

    ctx.log(JSON.stringify({ evt: 'retroDeletedProbe', mailboxes: result.length, keys: keys.length }));
    return { status: 200, jsonBody: { probedAt: new Date().toISOString(), keys, mailboxes: result } };
  },
});

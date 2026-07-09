# Feasibility memo — reconstructing cases from Outlook Deleted Items (TKT-119d)

**Date:** 2026-07-09 · **Method:** READ-ONLY Graph probe (`retro-deleted-probe`, keyed HTTP route on
`cespk-orch-dev`; zero mailbox mutations — folder property reads + `$search` reads only).
**Raw data:** [`deleted-items-probe-2026-07-09.json`](./deleted-items-probe-2026-07-09.json).

## Question

The TKT-059 dry-run pager deliberately excluded Deleted Items (7-9k messages per mailbox vs ~117 live
inbox), which is why a mailbox-sourced rebuild was ruled non-viable. Filtered by ref/VRM/claimant,
can Deleted Items reconstitute cases — and does reaching them need a build?

## Findings

1. **Volumes confirmed.** Deleted Items per intake mailbox: info@ **7,146**, engineers@ **9,508**,
   desk@ **7,155** — vs Inbox 44 / 66 / 42. The recoverable history overwhelmingly lives in Deleted
   Items, exactly as the TKT-059 numbers suggested.

2. **No build is needed to reach it — the live retro Outlook rung already searches Deleted Items.**
   `retroOutlookLocate` uses `GET /users/{mailbox}/messages?$search=…` (graph.ts `searchMessages`),
   and per Microsoft Learn (user-list-messages) that whole-mailbox surface **includes Deleted
   Items**. The probe proves it live: every deleted-scope hit below was also returned by the
   whole-mailbox search.

3. **Filtered recovery works.** Sample keys drawn from real `retro_reconstruction_failed` audits:

   | key | where found | scope |
   |---|---|---|
   | `PHA 5007` (the TKT-119 ref, as written) | engineers@ — "Our ref: PHA 5007 - Reg: MT25 FXW" | **Deleted Items** (2 hits) |
   | `573387` / `WG16SGZ` | info@ — "573387 WG16SGZ" thread | Deleted Items (9/3 hits) |
   | `46671/1` / `46533/1` (TKT-101) | desk@ | Deleted Items (1 each) |
   | `261622SA` | engineers@ | Deleted Items (1) |
   | `330.86` (tractable.ai lead ref) | nowhere | not recoverable |

   Live proof of the end-to-end path: the PHA5007 retro drain run this session **reconstructed a
   Held case (87e79f62-…) via the Outlook rung** from material that exists only in Deleted Items.

4. **One measured caveat — Graph `$search` tokenization.** The collapsed token `PHA5007` returned
   **0 hits** everywhere while the as-written `PHA 5007` hit — KQL tokenizes on the space. The retro
   key ladder searches the normalised (collapsed) token, so a space-separated provider ref can be
   missed by the ref key and only rescued by a secondary key (here the VRM). Recommended follow-up
   (small, code-only): when a ref key looks like `LETTERS+DIGITS`, ALSO try the spaced variant
   (`PHA5007` → `"PHA 5007"`) in `retroOutlookLocate`'s ladder.

## Decision

- **Do NOT build a Deleted-Items-specific pager/scoping.** The retro Outlook rung's whole-mailbox
  `$search` already covers Deleted Items; the TKT-059 exclusion applied to the *replay pager*
  (Inbox-subtree filtered by design), not to retro reconstruction.
- **Do drain the un-linked backlog through the existing retro machinery** (`POST /api/retro-case`
  per stranded triage row) now that (a) the Outlook rung is live, (b) acknowledgement-subtype
  emails are retro-eligible (this wave), and (c) failures land visibly as "Unable to locate".
- **Follow-up ticket candidates:** the spaced-ref search variant (finding 4); a bulk drain sweep
  over `inbound_email WHERE case_id IS NULL` (already listed as a TKT-058 out-of-scope follow-up).

*No mailbox was modified at any point; the probe is repeatable via
`POST /api/retro-deleted-probe` (function key) with a `keys` array.*

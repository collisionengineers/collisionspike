# TKT-140 dry-run summary — retro backlog drain feasibility (NO WRITES)

**Executed:** 2026-07-10 (~09:20–09:30Z) · **Method:** read-only Postgres enumeration
(one transient-firewall window, Entra admin → `SET ROLE csadmin`, SELECT-only —
[`enumeration.sql`](./enumeration.sql)) + the read-only keyed
`POST /api/retro-deleted-probe` on `cespk-orch-dev` driven over every un-cased backlog key
([`drive-probe.mjs`](./drive-probe.mjs), raw responses in [`probe-raw.jsonl`](./probe-raw.jsonl)).
**Zero mailbox mutations, zero DB writes, zero deploys, zero app-setting changes.** The
`POST /api/retro-case` starter was **not** called. Gates observed live at run time:
`RETRO_CASE_ENABLED=true`, `RETRO_OUTLOOK_SEARCH_ENABLED=true`, `RETRO_BOX_ARCHIVE_ROOT_IDS`
**absent** (canonical values: the registry, docs/operations/live-environment.md).

## The numbers

| Measure | Value |
|---|---|
| inbound_email rows (total / un-cased `case_id IS NULL`) | 867 / 281 |
| Retro-eligible un-cased rows (decideRetro categories) | 138 (20 carry **no usable key** → never attempt) |
| Eligible rows carrying ≥1 key | **118** |
| Distinct key strings enumerated | **107** (109 key/kind pairs: 10 case_po · 35 external_ref · 64 vrm) |
| Would **LINK** at rung 1 (a case already matches — excluded from probe) | **19** |
| Backlog keys probed (un-cased) | **88** (149 search variants, live `refSearchVariants` fidelity) |
| **Locatable** (≥1 whole-mailbox `$search` hit — the live ladder's surface) | **75 (85.2%)** |
| — of which **trustworthy** (specific hits, <20) | **62** |
| — of which **high-noise / junk keys** (≥20 hits, cap-saturated) | **13** |
| **Unlocatable** (ladder would land "Unable to locate") | **13** (7 have Deleted-Items-scope hits only; 6 nowhere) |
| **Would-mint** (ladder behaviour) / **recommended mint scope** (noise excluded) | **75 / 62** |
| Probe calls / call errors / per-mailbox errors → **error rate** | 15 / 0 / 0 → **0.0%** |
| Locatable keys with Deleted-Items-scope hits | 70/75 (the history lives in Deleted Items, per the TKT-119 memo) |
| Deleted Items totals at probe time (info@ / engineers@ / desk@) | 7,173 / 9,546 / 7,180 (vs Inbox 42 / 83 / 32) |

Hit counts are summed across variants + mailboxes, each individual search capped at `$top=10`
(probe) — ≥20 total therefore means cap saturation, i.e. the key matches indiscriminately.

## Per-rung picture under the CURRENT live config

- **Rung 1 (resolve-existing):** `none` for all 88 probed keys **by construction** — the
  enumeration mirrors `findExistingCases` (upper `case_po`/`case_ref` equality for refs; `vrm`
  equality incl. a conservative loose compare). The 19 excluded keys would **link, not mint**
  (22 `retro_case_linked` events already recorded live since 2026-07-06).
- **Rung 2 (Box archive):** **skips** — `RETRO_BOX_ARCHIVE_ROOT_IDS` is absent live
  (`no_archive_roots`), `BOX_API_ENABLED=true` notwithstanding.
- **Rung 3 (Outlook $search):** the decisive rung — 75/88 hit. Because rung 2 never discovers a
  Case/PO, **every drain mint is Outlook-sourced → lands Held `needs_review` + `on_hold`,
  never terminal, never a minted Case/PO** (`decideRetroStatus` with `casePoKnown=false`; the
  create route leaves `case_po` NULL). Exactly the acceptance's "creates Held cases".
- **Bottom:** the 13 unlocatable keys → `retro_reconstruction_failed` audit + the
  `unable_to_locate` attention stamp (3 rows already carry it live today).

## Mint guards — evidence they hold

1. **Live refusal on record:** `audit_event` 2026-07-09T11:00:32Z — *"Retro create refused — the
   located original is a 'other' email, which never opens a case"* (see
   [`enum-context.txt`](./enum-context.txt)). The `mintBlockedByCategory` guard
   (`POST /api/internal/retro/create`, blocks `non_actionable`/`other`/`pre_instruction`
   originals) has **fired in production**; the orchestrator falls through to the visible
   failure record.
2. **Link-before-mint proven live:** 22 `retro_case_linked` + 63 `retro_case_created` + 46
   `retro_reconstruction_failed` events since 2026-07-05 ([`enum-retro-audit-events.csv`](./enum-retro-audit-events.csv)) —
   the ladder already links/refuses/records on live arrivals; the drain reuses the identical seam.
3. **Ack keys cannot become case sources:** the 3 ack-only-trigger keys (KAD/41981/1, HW20VOO,
   M238JPE — flagged `mintGuardExposure` in the ledger) may trigger locate, but if the located
   original is the ingested ack itself the create seam returns `refused_category` → Unable to
   locate. `case_summary` digests are excluded from triggering at all (`decideRetro`).
4. **No terminal, no PO:** all drain mints are Outlook-sourced Held cases (above) — the PHA5007
   precedent (Held case `87e79f62…`, `source: outlook`, no Case/PO) is the live template.
5. **Idempotent re-runs:** the starter dedupes on `instanceId retro-<messageId>`; the create is
   get-or-create under the live mint's advisory locks + `uq_case_case_po` / unique
   `source_message_id` backstops.

## The one big finding — 13 junk keys would mint garbage; exclude them

`2025/09`, `768.00` (external_ref) and `AT850, CL500, KW20VEH, MAY2026, ON10, ON16, ON2, ON23,
ON27, ON29, RTA2` (vrm) saturate the search cap. These are sniff artifacts — dates (`MAY2026`,
`2025/09`), money amounts (`768.00`), vehicle models (`CL500`), and prose fragments whose
**spaced variant** matches ordinary text (`ON10` → `"ON 10"` matches "on 10/05/2026…"). The
Outlook rung's corroboration (key-in-text on whitespace-collapsed haystack) **passes** on such
matches, so a blind drain could mint Held cases from unrelated emails. **Recommendation: the
drain excludes the 13 `highNoise` keys** (ledger field `recommendedForDrain=false`); the 12
trigger rows whose only keys are junk go to staff triage instead. (Follow-up candidate: key
hygiene in the VRM/ref sniffers.)

## Recommended drain shape (for the operator-approved window)

- **Scope:** per trigger ROW via `POST /api/retro-case` (`internetMessageId` + `source_mailbox`
  from [`enum-backlog-rows.csv`](./enum-backlog-rows.csv)). Of 118 rows: **99 drainable** (≥1
  trustworthy-locatable or R1-linkable key), **12 junk-noise-only + 6 unlocatable-only + 1
  mixed withheld** for staff triage (note: the drain re-fetches + re-classifies live, so
  persisted keys slightly under-represent; withheld rows can be revisited).
- **Batch size / pacing:** **batches of 10 rows, sequential within a batch** (start the next
  only after the previous durable instance reaches a terminal status via its
  `statusQueryGetUri`), ~5s between starts, operator outcome review between batches. Expected
  outcomes per row: `linked` / `created` (Held) / `refused_category→no_source` / `no_source`.
- **Pilot:** first batch = 10 rows drawn from trustworthy 1–3-hit keys (41 keys in that band).
- **Duration estimate:** 99 rows ≈ 60–90 min operator-paced. **Graph budget is a non-issue:**
  the probe issued ~900 sequential `$search` reads in ~5 min with **zero 429s**; a drain row
  costs ≤ ~27 searches.
- **Safety inherited:** read-only archive rung skipped; Held-only mints; idempotent instance
  ids; failures land visibly (`unable_to_locate`).

## Go/no-go criteria (from the dispatch)

| Criterion | Result |
|---|---|
| Error rate < 5% | **0.0%** ✓ |
| Mint guards evidenced | **Yes** (live refusal audit + link-before-mint + Held-only + ack flags) ✓ |
| Would-mint ≤ 500 | **75** (ladder) / **62** (recommended scope) ✓ |

**All three criteria satisfied. Recommend GO for a staged drain of the 99 drainable rows with
the 13 high-noise keys / 19 withheld rows excluded as above.**

## Anomalies & follow-up candidates (observed, NOT acted on)

1. **Junk-key noise** (above) — sniff hygiene / drain denylist.
2. **Whole-mailbox `$search` missed Deleted-Items material for 7 keys** (`deletedScopeHits>0`
   but `wholeMailboxHits=0`: IMAGE492049, IMAGE747974, 30230-01, 46458/1, 900.62,
   DIK/JMO/46440/1, BV72YVB). The TKT-119 memo's "whole-mailbox includes Deleted Items" holds
   for 70/75 locatable keys but is **not universal at the margin**. A `deleteditems`-scoped
   fallback search in `retroOutlookLocate` would lift recovery by up to +5 real keys (incl. two
   cancellations).
3. **Own-sender filter can miss Exchange-DN senders:** the TKT-139 pair's hits return `from` as
   an `/O=EXCHANGELABS/...` DN, not SMTP — `selectOutlookOriginal`'s own-mailbox drop compares
   SMTP strings, so our own filed replies could be picked as "the original".
4. **Search-index lag race:** TG/ND/45430/1 failed the live ladder 21s after its trigger
   arrived (2026-07-10 08:00:20Z audit) yet probes locatable now — on-arrival retro can race
   the Exchange search index; the drain, running later, will succeed where arrival-time retro
   failed. (Delayed-retry candidate.)
5. **20 eligible rows carry no usable key** — permanently un-drainable via the ladder; staff
   triage as today.

## TKT-139 live proof (saved separately)

[`tkt139-search-pair.json`](./tkt139-search-pair.json) — the same ref searched **compact
`"PHA5007"` → 0 hits** and **spaced `"PHA 5007"` → 2 hits** over the same whole mailbox
(engineers@), raw Graph responses verbatim, call shape identical to the live
`retroOutlookLocate` rung. This is the KQL tokenization behaviour TKT-139's
`refSearchVariants` union fixes. The dry-run itself corroborates the union working at scale
(10 probed keys hit only via a variant), while also showing the spaced variant is the junk-key
noise amplifier (finding 1).

## Files

`enumeration.sql` (the SQL used) · `enum-context.txt` (session transcript: totals, category
distribution, audit history, mint-guard refusal) · `enum-backlog-rows.csv` (118 rows) ·
`enum-backlog-keys.csv` (109 key/kind, R1 flags) · `enum-retro-audit-events.csv` ·
`drive-probe.mjs` (the driver; key sourced via `az functionapp keys list` into a scratchpad
file outside the repo, deleted after the run) · `probe-run-log.txt` · `probe-raw.jsonl` (15 raw
probe responses) · `probe-summary.json` · `dryrun-ledger.jsonl` (**107 rows — one per key**:
kind, mailboxes, per-rung outcome, locatable, would-mint, `highNoise`, `recommendedForDrain`) ·
`tkt139-search-pair.json`.

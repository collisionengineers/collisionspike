# Root roadmap cleanup research

## Ticket

Source stub: `docs/plans/work-todo-spike/docs-cleanup/root-roadmap.md`

The stub is empty. Based on the surrounding cleanup folder, this is a ticket to reconcile root planning/status docs with the live registry and stop the root docs from carrying stale operational state.

## Summary

`ROADMAP.md` should be the single forward worklist, not a second live registry. `CURRENT_STATUS.md` should be a current snapshot/changelog. `README.md` should help a reader start in the right place. Live counts, mailbox state, function counts, gates, subscriptions, and resource details should point to `docs/architecture/live-environment.md` and `LIVE_FACTS.json`.

Right now, several root and near-root docs duplicate live state and have drifted. The most visible drift is around Graph PUSH email intake and Box: the live registry says production mailbox cutover and Box JWT Server Auth are live, while root docs still describe two test subscriptions, `digital@`, unresolved renewal, and CCG/gated Box work.

## Intended document roles

The repo already defines the split:

- `ROADMAP.md` is the forward worklist / phased checklist. Evidence: `CLAUDE.md:94-96`, `CLAUDE.md:129-133`, `docs/MAINTENANCE.md:143-146`.
- `CURRENT_STATUS.md` is the live snapshot/changelog. Evidence: `docs/MAINTENANCE.md:144`, `CURRENT_STATUS.md:6-8`.
- `docs/gated.md` is the list of operator-only blockers. Evidence: `CLAUDE.md:132-133`, `docs/TODOS.md:5-10`.
- `LIVE_FACTS.json` and `docs/architecture/live-environment.md` are the live numbers/state registry. Evidence: `docs/MAINTENANCE.md:12-24`, `docs/README.md:6-10`, `docs/architecture/live-environment.md:3-8`.
- Detailed phase plans live under `docs/plans/<phase>/README.md`, not in the root roadmap. Evidence: `docs/plans/README.md:22-37`.

## Current drift

Root and near-root docs no longer agree with the live registry:

- `ROADMAP.md:21-24` says its live registry is `CURRENT_STATUS.md`; current practice should point live facts to `LIVE_FACTS.json` and `docs/architecture/live-environment.md`.
- `ROADMAP.md:9` is dated 2026-06-27, while `LIVE_FACTS.json:2-8` and `docs/architecture/live-environment.md:5-8` are verified 2026-06-29.
- `ROADMAP.md:114-126` says production mailbox scoping is pending, there are two subscriptions expiring 2026-07-05, and `graph-renew` is failing. `docs/architecture/live-environment.md:33`, `docs/architecture/live-environment.md:42`, and `docs/architecture/live-environment.md:91-108` say production `info@`, `engineers@`, and `desk@` are cut over, three push subscriptions exist, `digital@` was removed, and durable renewal is resolved.
- `ROADMAP.md:145-146`, `ROADMAP.md:384-436`, and `ROADMAP.md:514` retain CCG / business-account live-test / gates-off Box wording. `docs/handoff/02-box-activation.md:6-11` and `docs/handoff/02-box-activation.md:122-136` say Box JWT Server Auth is live, with remaining work around File Request template, `FILE.UPLOADED` webhook, and scope-lock decisions.
- `ROADMAP.md:520-526` says M1 still depends on deploying orchestration and mailbox scoping; that is stale after the live Graph PUSH cutover.
- `CURRENT_STATUS.md:3` says last updated 2026-06-27, but `CURRENT_STATUS.md:25-44` includes a 2026-06-28 update.
- `CURRENT_STATUS.md:21-23` says automated intake is not yet running, while later material and the live registry say Graph PUSH intake is live.
- `README.md:27-31`, `CLAUDE.md:58-65`, and `AGENTS.md:26-48` still carry the older "2 subscriptions / engineers@ + digital@ / info@ + desk@ not scoped / expiry 2026-07-05" story.
- `docs/README.md:80-82` and `docs/activation/README.md:5-7` describe live intake as delta-poll, while `docs/architecture/live-environment.md:69-88` describes Graph PUSH.
- `docs/architecture/microsoft-stack.md:13-23` says orchestration is delta-poll and built/not deployed, conflicting with `docs/architecture/live-environment.md:40-45` and `docs/architecture/live-environment.md:69-88`.
- `docs/plans/README.md:20`, `docs/plans/README.md:74-82`, and `docs/plans/README.md:108-110` are stale around Phase 7 and Box.

## Deleted or renamed planning surfaces

- `README.md:64`, `CURRENT_STATUS.md:172`, `docs/handoff/03-api-hardening.md:1`, `docs/handoff/02-box-activation.md:113`, and `docs/plans/phases-1-7-sweep-report.md:7` still reference `OPEN_ITEMS.md`, which is gone or merged.
- The replacement should be `ROADMAP.md` for forward work, `docs/gated.md` for operator-gated blockers, and `docs/plans/work-todo-spike/**/research/*.md` for newly researched ticket context.

## Why it is happening

The root docs were updated incrementally during the migration. They still embed dates, mailbox names, subscription counts, gate states, and deployment status that changed quickly during the Azure cutover. Because those facts are copied into multiple docs, each new live change creates several stale sources.

The root roadmap also still carries a large historical Power Platform checklist. That is useful as a record, but it makes the file harder to use as the current execution list and increases the chance that a future agent treats a retired task as current.

## What changes would resolve it

1. Rewrite `ROADMAP.md` top matter:
   - State that live facts come from `LIVE_FACTS.json` and `docs/architecture/live-environment.md`.
   - Keep `CURRENT_STATUS.md` as a human-readable snapshot, not canonical live registry.
   - Keep `ROADMAP.md` focused on forward work.

2. Refresh `ROADMAP.md` Now / Next / Later from the 2026-06-29 registry:
   - Keep Pay-As-You-Go upgrade as the top operational blocker.
   - Mark production mailbox cutover done.
   - Keep remaining intake work as end-to-end live verification, `EVIDENCE_BLOB_CONNECTION`, orchestration managed-identity app role, heartbeat alerts, unattended renewal proof, and stale subscription pruning.
   - Keep staff app-role assignment and API auth hardening.
   - Update Box to JWT-live with the remaining Box-side work only.

3. Shrink the historical section in root `ROADMAP.md`:
   - Keep a short banded pointer to `docs/HISTORICAL/`, `docs/plans/README.md`, and ADRs.
   - Move detailed prior-era phase lists out of the active roadmap path, or clearly mark them as historical record only.

4. Patch root and near-root start-here docs so they point to the live registry instead of embedding live counts:
   - `README.md`
   - `CLAUDE.md`
   - `AGENTS.md`
   - `CURRENT_STATUS.md`
   - `docs/README.md`
   - `docs/activation/README.md`
   - `docs/plans/README.md`
   - `docs/gated.md`
   - `docs/handoff/02-box-activation.md`
   - `docs/handoff/03-api-hardening.md`
   - `docs/architecture/microsoft-stack.md`

5. Replace `OPEN_ITEMS.md` references:
   - Use `ROADMAP.md` for forward roadmap links.
   - Use `docs/gated.md` for operator-only blockers.
   - Use ticket research packs for context, not as the canonical roadmap.

6. Run verification after any doc edits:
   - `node scripts/check-doc-links.mjs`
   - `VERIFY_LIVE=1 node verify-all.mjs` only when Azure auth is available and live verification is intended.

## Suggested atomic tickets

- `DOC-ROOT-001`: Repoint root live-state references to `LIVE_FACTS.json` and `docs/architecture/live-environment.md`.
- `DOC-ROOT-002`: Refresh `ROADMAP.md` Now / Next / Later to 2026-06-29 live facts.
- `DOC-ROOT-003`: Update `CURRENT_STATUS.md` to remove the "automated intake not yet running" contradiction.
- `DOC-ROOT-004`: Replace stale mailbox/subscription text in `README.md`, `CLAUDE.md`, and `AGENTS.md`.
- `DOC-ROOT-005`: Replace `OPEN_ITEMS.md` references with `ROADMAP.md` or `docs/gated.md`.
- `DOC-ROOT-006`: Fix `docs/README.md`, `docs/activation/README.md`, and `docs/architecture/microsoft-stack.md` from delta-poll wording to Graph PUSH wording.
- `DOC-ROOT-007`: Collapse historical Power Platform checklist detail in root `ROADMAP.md` behind a clearly banded archive pointer.


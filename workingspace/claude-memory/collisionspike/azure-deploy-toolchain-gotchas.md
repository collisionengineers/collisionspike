---
name: azure-deploy-toolchain-gotchas
description: "Deploy Function Apps via WINDOWS func (WSL func can't find node). (RESOLVED 2026-07-08: the two azure-* agents' non-dispatch was a malformed-frontmatter YAML bug, now fixed — see body.)"
metadata: 
  node_type: memory
  type: reference
  originSessionId: f238089c-8237-42f4-9c91-8da5f73391c5
---

Two environment gotchas that cost churn (2026-07-08 session), both about *how* to ship, not what:

**1. Deploy Function Apps from WINDOWS, not WSL.** `wsl -e bash -lc 'func azure functionapp publish …'`
fails with `exec: node: not found` — WSL's node is nvm-installed (`~/.nvm/versions/node/*/bin/node`)
and NOT on PATH in a non-interactive `-lc` shell, and the `func` wrapper needs node. The Windows
toolchain has everything: `func 4.12`, `node`, **and `az` is logged in on Windows too** (not only WSL).
So run the deploy from the Bash tool (Git Bash) on Windows: `cd deploy/orch && func azure functionapp
publish cespk-orch-dev --javascript` (orch/api; bundle built first by `node build-orch.cjs`), and
`cd functions/parser && func azure functionapp publish cespike-parser-dev-x7xt3d5ovhi7y --build remote
--python` (Python fns, Oryx remote build). `az` management-plane ops (appsettings set, functionapp
show/list) also work on Windows. Read-only Postgres/Graph still go via WSL per CLAUDE.md, but **func
deploys = Windows**. See [[live-postgres-connect-path]].

**2. The `azure-*` project agents' non-dispatch — FIXED 2026-07-08 (was a frontmatter bug, NOT a namespace
collision).** `azure-integration-engineer.md` and `azure-diagnostician.md` failed to register as Agent-tool
types because their YAML frontmatter `description:` contained an unquoted `Typical triggers: "…"` — the
`: ` (colon-space) inside a plain scalar is invalid YAML, so the frontmatter didn't parse. It only broke
these two (not `ticket-verifier`, which has the same colon-space) because they also had **CRLF** line
endings — colon-space **and** CRLF together was the trigger; the working files had at most one. Fix: reworded
to `Typical triggers include "…"` (matching eva/box/fluent, which never used the colon), verified with
`python -c "import yaml"` strict-parse → OK. **Caveat:** agent types register at session **startup**, so the
two won't appear until the NEXT session (see [[ticket-orchestration-layer]] point 1); until then, route
Azure work to **`ticket-implementer`** or do it inline. General lesson: keep agent `description:` frontmatter
free of `: ` colon-space (quote it, or use an em-dash / "include").

**Bonus CI gotcha:** git doesn't track empty dirs, so moving every ticket out of a status folder (e.g.
`docs/tickets/now/`) makes `scripts/check-tickets.mjs` fail in a fresh CI checkout ("missing status
directory") while passing locally (the dir still exists on disk). Fix: a tracked `.gitkeep` in the
emptied status dir (check-tickets skips non-directory entries).

**3. FC1 Flex-Consumption quirk (2026-07-10, hit twice):** `az functionapp show --query state -o tsv`
returns EMPTY on the FC1 apps (`cespk-api-dev`/`cespk-orch-dev`) — use ARM
`az rest … providers/Microsoft.Web/sites/<app>?api-version=…` and read `properties.state`, or curl the
hostname (200 = up). Also FC1 plain NCRONTAB timers don't wake a scaled-to-zero app — missed ticks run
as past-due catch-up on the next wake (intake push / durable monitor); "every 5 min" timers are
best-effort-while-awake.

**4. Pre-commit doc gate × pathspec commits (2026-07-10, hit three times):** while ANOTHER party's
folder renames sit staged (e.g. the orchestrator's ticket-move output), `git commit -- <paths>` that
excludes half the rename crashes the doc-gate hook with ENOENT (temp-index/worktree mismatch). Either
commit plain (letting the staged moves ride, disclosed in the message) or land the tickets subtree
atomically — don't fight it with pathspecs.

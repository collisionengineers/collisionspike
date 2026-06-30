# MAINTENANCE — documentation freshness protocol

This is the human protocol that keeps the docs honest. It is **enforced** by three artefacts
(all created in the doc-hygiene pass, 2026-06-28):

- `scripts/check-doc-links.mjs` — broken-link / orphan / live-number-leakage gate (zero npm deps).
- `scripts/check-tickets.mjs` — ticket-frontmatter validator for [`docs/tickets/`](./tickets/README.md)
  (frontmatter present; `status`/`priority` enums valid; `research-link` resolves; ids unique). Zero npm
  deps. Run it alongside the link checker.
- `verify-all.mjs` → the `verify-live` gate — re-queries live Azure/Graph and diffs vs the registry.
- `scripts/hooks/pre-commit` + `.github/workflows/docs.yml` — run the above at commit time and in CI.

---

## 1. The one rule: live numbers live ONLY in the registry

**Volatile live numbers — function counts, Postgres corpus counts, the mailbox set, Graph
subscription/RBAC state, feature-gate values, `httpsOnly` — live in exactly two files:**

1. **`LIVE_FACTS.json`** (repo root) — the machine-readable source of truth, with provenance
   (`sourceCommand`, `verifiedAt`, `verified`) per fact.
2. **`docs/architecture/live-environment.md`** — the human-readable mirror of the same numbers.

**Every other doc must LINK the registry, not re-embed the number.** The replacement phrasing is:

> see [the live registry](architecture/live-environment.md) (single source: [LIVE_FACTS.json](../LIVE_FACTS.json))
> — *(adjust the relative depth per file)*

`memory/**` is exempt (auto-memory may carry facts). The link-checker's **leakage** check fails the
build if any other doc embeds a volatile number (e.g. `"42 functions"`, `"work_provider 390"`,
`"174 confirmed + 2035 suggested"`).

> **Why.** Numbers duplicated across a dozen docs drift the moment the stack changes. Centralising
> them means one edit (the registry) + an automated gate that catches the stragglers.

---

## 2. After any live Azure change

When you deploy, flip a gate, scope a mailbox, rotate a secret, or change anything the registry
records:

1. **Update `LIVE_FACTS.json`** — correct the changed `value`, refresh its `verifiedAt`, and **bump
   the top-level `lastVerified`**. Mirror the same number into `docs/architecture/live-environment.md`.
   (Stage both together — the pre-commit hook warns if you stage the mirror without `LIVE_FACTS.json`.)
2. **Re-run the live gate** to confirm the registry now matches reality:
   ```sh
   az login                       # if not already logged in
   VERIFY_LIVE=1 node verify-all.mjs
   ```
   It re-queries function counts, Graph subscriptions, per-mailbox RBAC (200/403), feature gates, and
   `httpsOnly`, and **FAILS on any drift**, printing exactly what changed. Entries marked
   `verified:false` in `LIVE_FACTS.json` (e.g. `postgresCounts`, blocked by the PG firewall) are
   skipped, not failed.
   - Offline / no `az login`? The gate **skips cleanly** — `node verify-all.mjs` stays green without
     `VERIFY_LIVE=1` and an Azure login. It never touches the network unless explicitly opted in.
3. **Never print secrets.** The gate mints its Graph token from Key Vault
   (`cespk-pg-kv-dev/graph-client-secret`) and never echoes the secret or the bearer token.

---

## 3. Activate the hook

`.git/hooks` is **not tracked**, so the tracked hook lives in `scripts/hooks/` and you point git at it
**once per clone**:

```sh
git config core.hooksPath scripts/hooks
```

After that, every `git commit` runs `node scripts/check-doc-links.mjs` and **blocks** on failure, and
**warns** (non-blocking) if you stage `docs/architecture/live-environment.md` without `LIVE_FACTS.json`.
Bypass for a deliberate WIP commit with `git commit --no-verify`.

---

## 4. The link checker

```sh
node scripts/check-doc-links.mjs              # all three checks
node scripts/check-doc-links.mjs --quiet      # failures + summary only
node scripts/check-doc-links.mjs --only=links     # broken relative links
node scripts/check-doc-links.mjs --only=orphans   # docs/**.md unreachable from CLAUDE.md + docs/README.md
node scripts/check-doc-links.mjs --only=leakage   # volatile live numbers outside the registry
```

It scans every git-tracked `*.md` (excluding `node_modules`, `.venv`, `.git`, `dist`, and
`.claude/`) and exits non-zero if any selected check fails. Tunables live at the top of the script:
`ORPHAN_ALLOWLIST` (dirs whose unlinked docs are intentional) and `LEAKAGE_PATTERNS` (the
volatile-number regexes — extend these as new phrasings appear).

### Documented exemptions (keep MINIMAL — every non-exempt orphan must be wired with a real link)

The gate is deliberately conservative about what it skips. The only standing exemptions are:

- **`.claude/` — excluded from the scan entirely.** It is agent/skill tooling, not project
  documentation, so its files are neither scanned for broken links nor treated as orphans. (Links
  *into* `.claude/` from real docs are still checked — a dead skill reference still fails.)
- **`docs/HISTORICAL/**` — FROZEN ARCHIVE: exempt from the broken-link, orphan, AND leakage checks.**
  It is archived point-in-time material; its internal links were valid at the original pre-move paths
  and we deliberately do not rewrite them, and its embedded numbers are last-known-at-archival. It
  stays reachable via the **Historical index in `docs/README.md`** (do not break that link).
- **`docs/plans/phase-ux-design-lab/directions*/**` (the per-direction `seed`/`a11y`/`direction`/
  `scorecard` files) and `phase-ux-design-lab/leaderboard*.md` — exempt from the ORPHAN check only.**
  These are ephemeral generated design-candidate artefacts. The real index for the lab is
  `phase-ux-design-lab/design-brief.md`, which **is** wired from `docs/plans/README.md` (not exempt).

### Known-absent backlog (surfaced, NON-failing)

Links that resolve into intentionally-removed or out-of-band trees are reported under a separate
**`links-backlog`** line (printed, `INFO`, does **not** fail the gate). These are pre-existing rot in
superseded phase docs, surfaced rather than hidden. Governed by `KNOWN_ABSENT_PREFIXES` /
`KNOWN_ABSENT_PATTERNS`:

- `raw/` — the gitignored PII dropzone (never tracked).
- `dataverse/` and `flows/` — decommissioned Power-Platform solution + flow artefacts removed in the
  Azure migration.
- `research/automationsresearch/` — a separate research repo, not vendored into this tree.
- `mockup-app/src/contracts/*.parity.test.ts` — moved contract-parity test paths.

When one of these trees is genuinely restored (or a doc citing it is retired), remove the dead link or
the prefix rather than letting the backlog grow silently.

---

## 5. Precedence hierarchy (when docs disagree)

A higher tier **wins**; reconcile the lower/older doc up to it:

1. **Binding review** — `docs/reviews/<DDMMYY>/` (authoritative for the areas it covers; superseded
   only by a later review).
2. **ADRs** — `docs/adr/0001–0018`.
3. **Architecture / requirements** specs — `docs/architecture/**`, `docs/requirements/**`.
4. **Plans** — `docs/plans/**`.

Orthogonal to the above, for **live numbers** the registry (`LIVE_FACTS.json` +
`live-environment.md`) is the single source — every tier links it rather than re-stating it.

---

## 6. Where things live (information architecture)

| Need | Doc |
|---|---|
| What the project is + read-first map | `CLAUDE.md`, `README.md` |
| Live numbers (authoritative) | `LIVE_FACTS.json` · `docs/architecture/live-environment.md` |
| What's live now (narrative changelog) | `CURRENT_STATUS.md` |
| Forward work backlog | `ROADMAP.md` |
| Atomic work items (tickets + board) | `docs/tickets/` (README + BOARD; validated by `scripts/check-tickets.mjs`) |
| What needs the operator | `docs/gated.md` |
| Operator handoff pack | `docs/handoff/` (start: `OPERATOR-CHECKLIST.md`) |
| How the system is built | `docs/architecture/` (canonical registry = `live-environment.md`) |
| Decisions | `docs/adr/` (0001–0018) |
| Binding manual reviews | `docs/reviews/` |
| Business rules / domain | `docs/requirements/` |
| Azure task playbooks | `docs/azure/` |
| Decommissioned / superseded | `docs/HISTORICAL/` (nothing here is current) |
| Point-in-time audits | `docs/_audit/` |

> The docs index is `docs/README.md`; the read-first map is in `CLAUDE.md`.

---

<!-- SNIPPET FOR CLAUDE.md -->
<!--
  Ready-to-paste section for CLAUDE.md. The fact-reconciler (or whoever owns CLAUDE.md) should
  insert the markdown below as a new `## Doc maintenance protocol` section — do NOT let it embed a
  live number (it deliberately points at the registry instead). Keep it short; the detail is in
  docs/MAINTENANCE.md.
-->

```markdown
## Doc maintenance protocol

**Live numbers live in ONE place.** Function counts, Postgres corpus counts, the mailbox set, Graph
subscription/RBAC state, feature-gate values, and `httpsOnly` live **only** in
[`LIVE_FACTS.json`](./LIVE_FACTS.json) (machine-readable source of truth) mirrored in
[`docs/architecture/live-environment.md`](./docs/architecture/live-environment.md) (human mirror).
**Every other doc links the registry — never re-embed the number.** `memory/**` is exempt.

After any live Azure change: update `LIVE_FACTS.json` (bump `lastVerified`) + the mirror, then run
`VERIFY_LIVE=1 node verify-all.mjs` to confirm reality matches (it skips cleanly offline). The
`scripts/check-doc-links.mjs` gate (broken links / orphans / live-number leakage) runs in the
pre-commit hook and CI. Activate the hook once: `git config core.hooksPath scripts/hooks`.

Full protocol + precedence hierarchy: [`docs/MAINTENANCE.md`](./docs/MAINTENANCE.md).
```

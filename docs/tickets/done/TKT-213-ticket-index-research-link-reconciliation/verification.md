# Verification — TKT-213: Reconcile tickets, indexes, plans and research links

## Verdict
TESTED (offline)

## Correction (2026-07-19)
This ticket first verified against the PLAN-006-era snapshot of the ticket tree
(**207 tickets, six plans**). Since then PLAN-007 through PLAN-012 landed on `main`
(their members and plan files were merged), so the reconciled tree is now larger.
Per acceptance **A9**, that earlier figure is not silently overwritten: it was the
correct count at PLAN-006 close-out and remains recoverable from Git history. The
evidence below is a fresh re-verification against the current tree
(**267 tickets, 12 plans**). The acceptance is a parity *invariant*, not a fixed
count — the invariant still holds at the larger size, which is what re-verification
confirms.

## Evidence
Commands run from the repository root on branch `plan006/closeout`, 2026-07-19.

- **A1 / A3 / A8** — `npm run check:tickets`:
  `scanned 267 ticket(s); 12 plan(s); 0 failure(s), 0 warning(s). OK`.
  Each id resolves to exactly one status folder whose name/frontmatter/id/slug agree;
  BOARD, README/index and plan-progress views are generated from the specs and are not
  stale (the check re-runs `ticket-generate.mjs` and fails on drift). Zero status,
  artifact, membership, research-link, evaluation-manifest or generated-view failures,
  and zero membership/status warnings.
- **A2** — Every ticket carries required frontmatter and a resolving `research-link`
  (`check-tickets.mjs` fails any spec whose `research-link` does not resolve), plus
  `changes.md` and `verification.md`. TKT-213's own `research-link` resolves to
  `docs/tickets/done/TKT-213-ticket-index-research-link-reconciliation/evidence/operator-note.md`.
- **A4** — `docs/tickets/plans/PLAN-006-repository-structure-documentation-reset.md`
  frontmatter `tickets:` list is exactly
  `[TKT-020, TKT-207, TKT-208, TKT-209, TKT-210, TKT-211, TKT-212, TKT-213, TKT-214, TKT-215]`
  and all ten are in `done`; plan/member links are bidirectional (check-tickets
  enforces membership + generated progress). `PLAN-004-production-readiness.md` includes
  `TKT-216` in its `tickets:` list and its body preserves TKT-216 ownership of the EVA
  submission-route defect.
- **A5** — TKT-213's research dependency is ticket-local
  (`evidence/operator-note.md`), not a retired or deleted planning tree.
- **A6** — Ticket links in the evaluation manifest
  (`scripts/evaluation/email/manifest.json`), docs indexes and ADRs resolve;
  `check-tickets.mjs` validates each manifest item ticket path and `check-doc-links.mjs`
  validates every relative link.
- **A7** — `npm run check:docs`: sections A–D all `PASS` across 1440 tracked markdown
  files — zero broken relative links, zero orphaned docs, zero live-fact leakage, zero
  authority leakage. No allowlist hides a link because a cleanup target was deleted.
- **A9** — See the correction note above: the completed-close-out figure (207/6) is not
  rewritten to claim new proof; it is explicitly superseded by a dated re-verification
  citing current command output and Git history, and active acceptance points only to
  the current tree.
- **A10** — Reconciliation touched repository artifacts only; no generator was run in
  `--write`, no live/cloud/database/mailbox write occurred, and this re-verification is
  read-only.

## Supporting check output (2026-07-19)
- `check:tickets` — 267 tickets, 12 plans, 0 failures, 0 warnings.
- `check:docs` — PASS links / orphans / leakage / authority; 1440 markdown files.
- `check:adapters` — adapter parity passed for 15 roles and 10 skills.
- `check:inventory` — inventory current: 1110 directories, 3671 files.
- `check:reconciliation` — passed: 3268 baseline / 3669 final files, 0 unexplained.
- `check:forbidden` — 2957 files scanned, no forbidden signatures matched.

## Pending / gaps
- Regenerate views after any later verifier-owned status move.
- Remote CI runs the same gates; local re-verification above stands in until then.

## How to re-verify
Run `node scripts/maintenance/ticket-generate.mjs` (no `--write`; it reports the count
and leaves the tree clean when views already match), then `npm run check:tickets` and
`npm run check:docs` from the current checkout. Expect the current tree's count
(267 tickets, 12 plans as of 2026-07-19 — this is an invariant check, not a fixed
target; the count grows as later plans land) with zero failures and zero warnings.

# Verification

## Verdict

**DONE (2026-07-20) — all 6 phases complete and verified.**

## Phase 1 — filter-repo extraction + reconciliation

- Byte-for-byte diff between the newly extracted canonical source and the previously vendored copy:
  empty except the 2 files already excluded by the old `VENDOR_LOCK.json` and the 3 wording-normalized
  files, each proven AST-equal (docstrings/comments only) before reconciling.
- Full engine pytest: 450 passed, 7 skipped.
- `ci_eval.py` against the carried-over baseline: overall exact-match 0.9651 (baseline floor 0.9571) —
  PASS, once run hermetically. The apparent 0.5 regression on `vehicle_model`/`vin` seen on the first
  bare-CLI run was traced to this exact machine's real, pre-existing local CE Document Mapper desktop
  install contaminating the run (see evidence/merge-notes.md) — fixed at the source (`ci_eval.py`'s CLI
  now defaults to a fresh temp `app_data_dir`), not worked around.

## Phase 2 — parser cutover

- Full parser pytest: 383 passed, 19 skipped (two vendor-pin-only tests removed; `test_fingerprint.py`
  updated and still green against the new `ENGINE_FINGERPRINT.json`).
- `parser_parity_emitter.py` run directly against the real corpus: all six vector groups resolve.
- `@cs/domain parser-parity` and `@cs/orchestration triage-parity` vitest guards: 4/4 passed each.

## Phase 3 — OCR wiring

- Full OCR pytest: 40 passed (38 pre-existing + 2 new), including a new real-engine-path test that
  exercises the actual vendored package against a real one-page PDF with nothing monkeypatched.
- Container build itself is **not** verified — Docker is unavailable in this environment. Confirmed by
  inspection that `.dockerignore`/`.funcignore` don't exclude the new directory and `COPY .
  /home/site/wwwroot` already handles it per the Dockerfile's own pre-existing comment.

## Phase 4 — vendor-pin retirement

- `check-engine-materialized.py`: passes clean, and confirmed (by hand-editing a materialized file and
  re-running) that it genuinely fails on real drift, then passes again once restored.
- `gh api` confirms `main` has no branch protection rules and no rulesets, so deleting the
  `parser-vendor-source` CI job cannot leave a permanently-pending required check.
- `gh secret list` confirms `CEDOCUMENTMAPPER_DEPLOY_KEY` still exists and is now unused — flagged for
  removal by someone with org-admin access, not removed here.

## Phase 5 — ADR + docs

- `node scripts/checks/check-doc-links.mjs`: 0 broken links, 0 orphans, 0 leakage, 0 authority issues,
  after staging (the check only scans git-tracked files, so this was re-run post-stage to be
  meaningful).
- `node scripts/checks/check-guard-register.mjs`: confirmed `check-engine-materialized.py` doesn't need
  registration (it isn't tied to a `plan-kind: consolidation` plan), so ADR-0033 was correctly left
  untouched rather than having a guard mode force-fitted onto it.

## Phase 6 — sibling repository remainder

- Diffed the real local desktop install's `providers.json` against the canonical seed before
  archiving: all 29 providers present in both, no unique local customisation found, only provider-config
  schema evolution with byte-identical underlying detection content — see evidence/merge-notes.md. No
  reconciliation was actually needed.
- Ported `cedocumentmapper_v2.0`#6 (16 open, non-blocking classifier/reader precedence findings)
  verbatim to TKT-288 before archiving; commented on and closed the sibling issue.
- Confirmed zero live deploy dependencies: `gh secret list`, `.../environments`, `.../deployments`,
  `.../hooks` all empty; zero open PRs.
- Pushed a retirement banner (`AGENTS.md`, `README.md`) directly to the sibling repository's `main`,
  then archived it via `gh repo archive`; confirmed `isArchived: true`.

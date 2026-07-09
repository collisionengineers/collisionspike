# Changes — TKT-081: acknowledgement emails misclassified (blank case)

**Commits (branch `fix/email-misclass-batch-081-083-093`):** `1d7947e` (classifier), `1462872` (mint guard).

## Root cause
The four live acks were mislabelled because `_is_bare_acknowledgement`
(`functions/parser/cedocumentmapper_v2/rules/email_classifier.py`) keyed on the raw FIRST
line (≤40 chars): a greeting ("Good morning,"/"Hi Ed") or a Teams "reacted to your message"
notice preceded the thanks, so the ack was never seen → the inherited-subject ref/VRM routed
the reply to `query` (Rule 4b). The severe sample-2 was an **automated** "Thank you for your
email" whose auto-reply markers weren't recognised, so it promoted to `receiving_work`
(Rule 2, images + boilerplate "new claim" + a false VRM) and **minted a blank case**.

## Fix
- **Classifier** (Stage A, vendored engine; re-vendored to sibling `engine-v2.7`): greeting- /
  auto-reply-preamble- / reaction-notice-aware ack detection; a greeting-relaxed length cap
  (40 → 60 only after a salutation is skipped, so a terse greeting-less one-liner stays a
  linkable query); first-sentence judging for a long automated ack line; a new **Rule-0
  auto-acknowledgement** branch (auto-reply + gratitude opener → acknowledgement, else other).
  Three automated-email markers added to `triage-rules.json`.
- **Mint guard** (belt-and-braces): the primary-path mint is now the explicit, tested
  `CASE_MINTING_CATEGORIES` / `categoryMintsCase` domain constant (`@cs/domain`), wired into
  `intakeOrchestrator.ts`. The retro seam already excluded `non_actionable`.

## Deploy
- **Parser DEPLOYED 2026-07-07** (`cespike-parser-dev-x7xt3d5ovhi7y`, remote build, 4 fns).
- **Orch DEPLOYED 2026-07-07** (`cespk-orch-dev`, 67 fns) — the mint guard.

## Pending
- **Blank-case data fix** (the one open item) — see verification.md §4.

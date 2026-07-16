# Changes — TKT-043: Images-received / report-chaser email misrouted (images-on-existing-case)

## Status
verify — code complete + deployed to `cespk-orch-dev` (orch 67 functions, unchanged); offline
proof green; awaiting live proof on a real open-case-ref chaser (see `verification.md`).

## PR #45 review follow-up — 2026-07-08 (blocking bug found + fixed)

Automated + agent review of PR #45 found that the first pass **did not actually meet the "no new case
is minted" acceptance live**, plus an edge-case mislabel. Adjudicated against the code/az/deploy and
fixed:

- **Finding B (VALID, blocking, was live-active):** `intakeOrchestrator` decided minting on
  `classification.category` (Stage-A `receiving_work`) and only early-returned for `drop_duplicate`, so
  an `attach_case` email (auto-attach is LIVE, `TRIAGE_AUTO_ATTACH_ENABLED=true`) was linked to the
  matched case **and still fell through to mint a duplicate**. **Fix:** a new `attach_case` non-minting
  branch persists the email/images as evidence on `triage.targetCaseId` + archives + re-evaluates status,
  then returns — no mint (`intakeOrchestrator.ts`).
- **Finding C (VALID, TS + Python):** `deliveredImagesOnly`/`_delivered_images_only` returned true on the
  all-image KIND fast-path **before** the signature filter, so a signature-logo-only reply could read as
  `images_received`. **Fix:** drop signatures first, require ≥1 non-signature file before the fast-path —
  `triagePolicy.ts` + vendored `email_classifier.py`, kept in lockstep. Tests added both sides.
- **Finding A (VALID as a proof-gap, not a wiring bug):** the live relabel is `decideTriage`'s job
  (orchestration owns the open-case lookup, ADR-0019), so the classifier's `open_case_ref_match` is dormant/
  forward-supported — the eval proved the classifier layer, not the live path. The real live correctness
  is Finding B's fix; the domain triage-policy tests + orch tests are the proof. (No orchestrator Durable
  test harness exists in the repo — a candidate follow-up.)
- **Finding D (VALID):** the sibling `engine-v2.8`/`engine-v2.9` refs are now **pushed** to
  `collisionengineers/cedocumentmapper_v2.0` (branch + both annotated tags) — PROVENANCE reproducible.
- **Finding E (REFUTED, environmental):** `@cs/domain` declares + resolves `zod`/`zod-to-json-schema`;
  `verify-all` Domain passes — the reviewer sandbox lacked `npm install`.

Redeployed: **orch** `cespk-orch-dev` (67 fns, Fix B + C) and **parser** `cespike-parser-dev-x7xt3d5ovhi7y`
(engine-v2.9, Fix C). Tests green: orch 170 / domain 954 / parser-classifier suite; eval `--check` no
movement. **Acceptance "no new case is minted" is now actually met** (Finding B fixed + deployed);
behavioural live proof (a real open-case-ref chaser attaches with no mint) remains verify-stage.

## Commits
- `6f69dfa` (branch `fix/tkt043-images-on-existing-case`, PR #45) — parsing/email/orch: route an
  open-case-ref chaser to `case_update`/`images_received` (the whole change; see Files touched).
- PR#45 review fixes (same branch) — Finding B (orch non-mint branch) + Finding C (signature-aware
  images-only, orch + parser) + PROVENANCE `engine-v2.9` pin; orch + parser redeployed.
- sibling `cedocumentmapper_v2.0` `b30e382` (tag **`engine-v2.8`**, branch
  `feat/tkt043-open-case-ref-context`) — the authoring-source classifier edit, re-vendored
  here (ADR-0018 edit-in-sibling-first). *Committed locally; push before relying on it in CI.*

## Files touched
- `services/functions/parser/cedocumentmapper_v2/rules/email_classifier.py` — re-vendored from
  engine-v2.8: (a) new `open_case_ref_match` (one|none|ambiguous) request field — a
  ORCHESTRATION-RESOLVED context signal the classifier is told exactly like `provider_match_state`
  (the open-Case lookup stays in orchestration, ADR-0019); when one/ambiguous + an existing
  ref + new non-report evidence, the fresh-work promotion (Rules 1-3) is suppressed so a
  work-shaped delivery on a ref resolved to an OPEN case routes to the `case_update`
  lane. Default absent = today's behaviour EXACTLY. (b) `_delivered_images_only` (factored
  `_is_image_evidence_file`) gains a FILENAME tier so a photos-in-a-PDF (`images - cvd.pdf`)
  the extension-derived kind reads as `instruction` is still `images_received`.
- `services/functions/parser/cedocumentmapper_v2/PROVENANCE.md` — engine-v2.8 pin + history entry.
- `services/functions/parser/tests/test_email_classifier.py` — 3 pins (flip on `one`; kill-switch on
  default/`none`; `ambiguous` suppresses fresh work).
- `scripts/evaluation/email/run_eval.py` — pass `open_case_ref_match` through `_FIELD_TO_PARAM`.
- `scripts/evaluation/email/manifest.json` — `tkt043-images-existing-case` gains
  `context.open_case_ref_match: "one"` + rationale; `sample-p1-5-bakercoleman` label
  reconciled to `images_received` (image-advertising PDF; untracked/unscored).
- `scripts/evaluation/email/baseline-v2.json` — regenerated; only the tkt043 row moved (`--check` clean).
- `packages/domain/src/domain/triage-policy.test.ts` — 2 assertions on the real tkt043 shape:
  `suggest_attach`/`attach_case` → `case_update`/`images_received`, `case_link`, targetCaseId
  (the TKT-093 reversible-attach lane; no decideTriage code change — it already did this).
- `services/orchestration/src/workflows/intake/triagePolicy.ts` (+ `.test.ts`) —
  `deriveAttachmentSignals` `imagesOnly` gains a FILENAME tier (`deliveredImagesOnly`), kept
  in lockstep with the classifier's `_delivered_images_only`, so the LIVE path yields
  `images_received` for a photos-in-a-PDF. No new function trigger (orch count 67 unchanged).
- `.artifacts/deploy/orchestration/main.cjs` — rebuilt esbuild bundle deployed to `cespk-orch-dev`.

## Summary
The sample is a report chaser delivering damage photos (as `images - cvd.pdf`) on the
already-open case `Ref 160404`. Its sender-written body is genuinely WORK-shaped ("engineers
report is required on the following case … 160404" + an instruction PDF from a known provider),
so Stage-A text-classification correctly reads `receiving_work` — only the OPEN-case lookup can
tell it apart from a fresh instruction. Per the rules-engine-v2 Phase-2 precedence rule
(open-case-ref + new evidence → `case_update`; ADR-0019), the relabel is driven by resolved
open-case context: the deployed `@cs/domain decideTriage` already does it live (relabel →
`case_update`, suggest-first, and — with `TRIAGE_AUTO_ATTACH_ENABLED` — the reversible
TKT-093 `inbound_linked` attach; `case_update` is non-minting so no new Case is opened). This
ticket (1) proves it offline by feeding the classifier the same resolved signal
(`open_case_ref_match`, mirroring `provider_match_state`) so the eval item flips
`receiving_work`→`case_update`/`images_received` (`category_correct` true, `--check` clean, no
hard-code), (2) makes both Stage-A and the orchestrator recover `images_received` for a
photos-in-a-PDF, and (3) redeploys the orch. No new gate (rides the existing
`TRIAGE_REF_GATE_ENABLED` / `TRIAGE_CASE_UPDATE_ENABLED` / `TRIAGE_IMAGES_ROUTING_ENABLED` /
`TRIAGE_AUTO_ATTACH_ENABLED`, all live). Evidence: `evidence/offline-eval-delta.md`.

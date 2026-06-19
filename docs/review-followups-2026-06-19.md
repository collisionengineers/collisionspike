# Architecture review — verified follow-ups (2026-06-19)

Output of a multi-agent **ultracode** review of the M1 live deployment (5 dimensions, each finding
adversarially verified against the live repo/Azure state). **Overall verdict: `ship-with-followups`.**

| Dimension | Verdict |
|---|---|
| Azure architecture & resource efficiency | minor-concerns |
| Power Apps Code App | **solid** |
| Power Automate flows / orchestration | minor-concerns |
| Dead code & drift | (no old implementations left) |
| UI / UX | **solid** |

The reviewers **confirmed**: architecture is sound, resources are **not** needlessly used (FC1 ~£0 idle,
ACA scale-to-zero, workspace-based App Insights, identity-based storage; `evavalidation`/`evasentry`
correctly **not** deployed), **no old implementations left lying around** (the raw-fetch parser path is
gone, fixtures are test-only, no mock data), code follows Azure + Power Apps best practices, and the
UI/UX is solid. The items below are the residue.

## Must-fix
1. **OCR host not actually serving** — _DONE this session._ Corrected the premature "deployed/live"
   claims in `live-environment.md`, `CURRENT_STATUS.md`, `ROADMAP.md`; image is built+pushed, host
   deploy is honestly marked pending (revision provisioning expired 3×). Failed-deploy scaffolding
   cleaned up (ACR + image kept).
2. **Live parser default function key is committed in git** — the working `functionKeys.default` for
   `cespike-parser-dev-…` is in `docs/activation/email-intake-activation.md:30` (labelled "Non-sensitive
   dev key") and `plans/code-audit-cleanup.md:27`, and persists in history via the deleted
   `parser-config.ts`. Endpoint is internet-reachable. **Recommendation (operator):** rotate the key
   (rotation, not just doc-scrub, is the real fix since it's in history), replace both occurrences with a
   placeholder, add a secret-scan pre-commit gate. _Left for the operator per the standing "these keys
   are non-sensitive, don't fuss" instruction — surfaced here so the decision is explicit._

## Follow-ups (verified, mostly latent/gated)
1. **Deploy the anchored exact-domain provider match to the LIVE intake BEFORE seeding provider domains.**
   The live ON `CS Intake` still runs the **unanchored** `contains(cr1bd_knownemaildomains, '@domain')`
   substring filter (the repo `intake.definition.json` already has the `Filter_exact_domain` fix, but it
   is not the deployed definition). A substring collision resolving to exactly one provider binds the
   **wrong** provider → wrong Case/PO + Box prefix. Low blast radius today (≈377/392 domains empty), but
   seeding (`15-seed-emaildomains.ps1`) is the exact trigger that grows it. Make this the **top item** of
   the flow-chain activation (`docs/activation/m1-flow-chain-activation.md`). Also add an intake-specific
   substring check to `flows/validate-flows.mjs` (check 8a only covers `provider-match`).
2. **`finalize-eva-box` Box upload corrupts the archive (gated OFF, latent).** `finalize-eva-box.definition.json:123`
   passes `cr1bd_storagepath` (a Blob reference **string**) as the Box `CreateFile` body, which expects
   file **content** (cf. `classify-persist:90` which correctly passes `@base64ToBinary(...contentBytes)`).
   Each Box file would hold the path text, not the photo. **Before activating finalize:** bind
   `cr1bd_evidenceblob` into finalize, insert an Azure Blob `GetFileContent` inside `Upload_photos_in_eva_order`,
   pass its body to Box; run the drag-drop==API parity test.
3. **Redeploy the enrichment Function from its current bicep** to clear committed-but-not-deployed IaC
   drift: live `cespkenrich-ai` binds an auto-created managed Log Analytics workspace in a separate
   `ai_*_managed` RG (predates the `eb2a79a` workspace fix) — telemetry still flows, so RG sprawl not data
   loss. Same redeploy applies `allowSharedKeyAccess:false` to `cespkenrichst…`. Separately, add
   `allowSharedKeyAccess:false` to the **parser** storage bicep + redeploy (both already use identity-based
   storage, so it's safe defense-in-depth).
4. **Document the ADR-0010 VRM dedup-ladder deferral as a known M1 limitation** + turn **`CS Case Resolve`
   OFF** in live (it is ON-but-orphaned — no trigger invokes it). Live intake dedups on **Message-ID only**;
   rules 2–4 (VRM/reference cross-arrival correlation) live only in `case-resolve.definition.json`. Correct
   for the slice (VRM/ref known only post-parse, parse is OFF live), but state it plainly + add the to-do to
   invoke `case-resolve` with `candidateVrm`/`candidateRef` once parse confirms them.
5. **OCR EVA map omits the two B2 fields.** `ocr/ocr_pdf_adapter.py` `EVA_KEY_FROM_PARSER_KEY` omits
   `claimant_telephone`/`claimant_email` that `functions/parser/parser_adapter.py` includes, despite the
   comment asserting the maps are identical. The OCR container runs the same engine (emits both), so a
   scanned doc's phone/email would be silently dropped. Add the two keys + a parser/OCR map-equality sync
   test (mirror `functions/parser/tests/test_schema_vendored_in_sync.py`). _Latent until OCR is wired._
6. **Generated-service hand-edit (maintenance hazard, dead at runtime).** `mockup-app/src/generated/services/Cr1bd_evidencesService.ts:74-91`
   stub-replaces the non-existent `uploadFileToRecord` (absent on `@microsoft/power-apps` 1.0.3). Add a
   DEPLOY-RUNBOOK re-apply note + an `uploadFileToRecord` grep gate; regenerate cleanly at SDK ≥1.0.4.
7. **OCR ACA host deploy (the deferred deploy).** Use a pre-granted **user-assigned MI** for AcrPull
   (2-step: create identity + AcrPull role, let it propagate, then deploy the site referencing it via
   `siteConfig.acrUserManagedIdentityID`) — this beats the system-assigned-MI same-deploy RBAC race that
   most likely caused the 20-min revision-provision timeout — or inspect ACA revision logs to rule out an
   ingress health-probe/port mismatch.
8. _Optional:_ consolidate the four per-Function Log Analytics workspaces into one shared workspace
   (marginal saving in a dev sandbox; reasonable to defer — noted so it isn't mistaken for intentional standard).

## Non-issues confirmed by the review
- The `React.createElement … undefined` console error is **not in the app source** (all imports/icons/exports
  resolve; the PowerProvider fix didn't clear it) → SDK/host console noise. Do not edit app components.
- The `[RESERVED-FOR-USER]` flow-activation boundary is the **right** call (do not force an API swap on the
  working digital@ webhook).

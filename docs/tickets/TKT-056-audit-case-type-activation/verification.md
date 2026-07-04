# TKT-056 — verification

> `done` means **live and proven**. **ACTIVATED 2026-07-04** (user-instructed go-live): deltas
> applied, all four surfaces deployed, `AUDIT_CASES_ENABLED=true` on both apps — see "Activation
> record" below. Only the step-6 live probe (a real inbound audit email) remains before `done`.

## Activation record (2026-07-04)

- **D9 applied — verified NO-OP.** Pre-check + broad `ILIKE '%eva%'` sweep: **0 rows** — the live
  `work_provider` corpus never held an EVA row (the "EVA (Engineers)" mislabel was entirely the
  parser layout-name fallback + free-text `eva_work_provider`, both code-fixed). `UPDATE 0`×2.
- **D10 applied.** `choice_case_type` → 4 rows (`standard`/`audit`/`audit_total_loss`/`diminution`);
  `choice_evidence_kind` 100000007 `engineer_report` present. Applied BEFORE the gate flip, per the
  delta's deploy-order warning.
- **Deploys (commit `aafeba1`):** parser `cespike-parser-dev-x7xt3d5ovhi7y` (`--build remote`,
  3 functions re-verified — engine-v2.6); api `cespk-api-dev` (77 re-verified); orch `cespk-orch-dev`
  (53 re-verified); SPA `cespk-spa-dev` (carries the `16e152c` dashboard fix; CSP header re-verified
  live). Both bundles smoke-loaded locally before publish (no `import.meta.url` 0-function crash).
- **Gate:** `AUDIT_CASES_ENABLED=true` set and re-read `true` on **both** apps. The shadow-review
  window was **explicitly waived by the user** ("flip things to true now").
- Transient PG firewall rule added + removed (only `AllowAzureServices` remains).

## Proven offline (2026-07-03 session)

- **Sibling engine suite** (`cedocumentmapper_v2.0`): 324 passed, 4 skipped — including the new
  marker-taxonomy matrix, `detect_case_type_signals`, engineer_report fallback suppression, and
  the triage-rules parity snapshot (238 → 255 across the two commits).
- **Vendored parser Function suite** (`functions/parser`): 263 passed, 2 skipped (the 2
  `test_multiformat_extraction` failures are PRE-EXISTING on this box — they fail identically on
  the unmodified tree; environment-dependent .doc reader, not this change) — including both
  vendored-sync drift guards (byte-mirror restored).
- **Domain suite** (`packages/domain`): 780 passed — including new `case-type.test.ts`
  (decideCaseType/markerForMint matrix incl. SBL-audit→no-marker, QDOS-dual→standard) and the
  marker sequence-independence pins in `case-po.test.ts`.
- **API + orchestration**: `parser-eva-fields.test.ts` 24 passed (sentinel blocks EVA/CNX; PCH/
  QDOS still match); `parse.test.ts` 22 passed (multi-doc ordering/selection); full orch suite
  119 passed; `tsc --noEmit` clean on domain/api/orchestration/mockup-app.

## Local parser probe — REAL corpus (2026-07-03, vendored engine post-re-cut)

| Sample | work_provider | case_type (dual) | key point proven |
|---|---|---|---|
| TKT-051 `Inspection Request - Audit Report.DOC` | `PCH` | `audit` (false) | instruction extracts provider + audit signals |
| TKT-051 `_EHR102814_Plus_Report_.pdf` (EVA report) | `''` (was **"EVA (Engineers)"**) | — | the leak is dead at the engine |
| A.PCH261339 instruction .DOC | `PCH` | `audit` (false) | second real sample consistent |
| QDOS261608 / 261572 / 261530 letters | `QDOS` | `audit` (**dual=true**, all 3) | dual report+audit template detected |
| D.PCH26190 diminution .docx | UNKNOWN | `diminution` | `D.` ref marker + "diminution in value" phrase both fire |

**Probe-driven fixes applied in the same session** (the probe caught two inversions before they
shipped): the real audit instruction .DOC content-types as `report` (title wording) while the EVA
report types as `instruction` — so (a) `selectInstructionIndex` now ranks the extraction's own
`work_provider` FIRST (engineer-report layouts yield `''` by design) with typing second, and
(b) the classifyPersist `engineer_report` override keys on the typing's LAYOUT name
(`isEngineerReportLayoutName` — EVA/CNX), never on `doc_type`. Both pinned by new unit tests.

## Eval harness — no regressions

`python scripts/eval-email/run_eval.py` (52 items): **identical mismatch list before vs after**
the engine change (9 pre-existing, all known deferred tickets — TKT-032/034/041/043 etc.);
A.PCH261269/272 pass in both runs.

## Environment note

`verify-all.mjs` shows `Function parser — pytest` FAIL on this Windows box: the 2
`test_multiformat_extraction` failures are **pre-existing** (they fail byte-identically with the
vendored tree stashed to its pre-change state — environment-dependent `.doc` extraction, passes on
the WSL2 setup) — not caused by this ticket.

## Still to prove (live)

- Post-deploy shadow audit_events; post-flip live probe (see ticket steps 4–6).

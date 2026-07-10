# TKT-056 — verification

## Verdict
VERIFIED-LIVE

Final certification (ticket-verifier, 10-07-26, after the W4 data pass):
- **Steps 1–5:** gate re-read true on both apps; D10 rows re-confirmed (4 case types +
  engineer_report kind).
- **Step 6 / PCH lane — all four sub-expectations proven live:** A.PCH sequence at volume; **112
  A.-marked rows since the flip, ALL case_type=audit, zero mistyped**; 8/8 sampled A.PCH rows
  principal PCH (leak dead, corroborated by the identity stems + Box listing); engineer_report
  evidence **71 rows / 67 cases**.
- **Step 6 / QDOS dual lane:** letters mint standard QDOS26xxx numbers at intake; 12/12 sampled
  A.QDOS rows are review-derived audit IDs sharing the parent number (all created after the
  parent) — the corpus/operator-note outcome. **Honest deviation named, not buried:** the parent
  standard row does NOT itself carry case_type=audit (Q4=0) — the audit typing rides the derived
  A. row, which matches the operator's nested-deliverable note but not ADR-0021 D3's mint-time
  wording as literally written.
- Pipeline health: mint path 110×200/0-failed, no case-type exceptions.
- 37 unmarked audit-typed rows are non-QDOS prefixes — the allowlist/no-marker design, not a defect.

**Follow-up for the loop (one caveat):** reconcile ADR-0021 D3 / spec wording with the live
review-derived pairing model + the operator's nested-deliverable note, and confirm intake-time
dual-detection behavior. Non-blocking: Q5 re-run with display_name; channel attribution stays
sampling-limited.

Verified by: ticket-verifier dispatch, 10-07-26. Findings:
- **Step 5 re-verified live:** AUDIT_CASES_ENABLED=true on BOTH apps (fresh az read).
- **Step 6 marker-mint half PROVEN persisted-live:** per-marker sequences running exactly per
  ADR-0021 D2 — A.PCH26001…26038(+) independent of standard PCH26001–26021; A.QDOS26001…26068
  independent of QDOS26001–26078 (same-day live-DB artifact). No AP./D. rows yet — expected
  (review-time-only / review-first by design).
- **Provider on A.-cases (leak dead):** A.PCH stems carry the resolved principal (TKT-143
  VERIFIED-LIVE); Box folders minted under marker names; no "EVA (Engineers)" anywhere in today's
  data (corroborated by TKT-065's certification).
- **Gate-on mint path firing clean (KQL, 48h):** internalCasesResolve 110×200/0 failed; the whole
  intake ladder 0-failed; only known residuals in exceptions.
- **Why KQL can't finish:** case-type outcomes are DB audit_event rows, not log lines — the
  remaining sub-lines (case_type_code=audit on marked rows; engineer_report evidence rows persisted;
  the QDOS-dual rule incl. the systematic QDOS/A.QDOS pairing question) are Postgres-only → queued
  Q1–Q7 for the W4 pass.
- Interesting observation for the operator: the CSV shows systematic QDOS26NNN/A.QDOS26NNN PAIRS
  (…44, …55, …56, …57, …68) — consistent with review-derived audit IDs sharing the parent number
  (the D3 dual rule + the nested-folder note in docs/tickets/to-distill/audits/) — Q4b decides.

> Activation record (2026-07-04) follows below.

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

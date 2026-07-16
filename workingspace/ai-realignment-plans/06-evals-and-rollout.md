# 06 — Evals, rollout sequence, and the operator decision register

**Status:** DRAFT working plan (2026-07-16). Part of [ai-realignment-plans](./README.md).
The method here is [model-evaluation-plan](../model-evaluation-plan.md)'s (retained wholesale)
plus aifirstplan's acceptance gates, sequenced into stages with named gates. Nothing flips
without its stage's evidence.

## 1. First: make the model matrix interpretable (it is not, yet)

The committed `scripts/eval-email/model-matrix-summary.json` cannot support any conclusion:

- **Partner models drowned in 429s** (~80% of calls for cohere/deepseek/llama rows) —
  single-unit eval deployments; the run measured quota, not models.
- **All three `gpt-5` / `gpt-5-mini` / `gpt-5-nano` rows: 0 valid outputs, 0 429s** — and the
  runner sets `max_completion_tokens: 128` on `reasoning-strict` profiles. Reasoning models
  spend completion tokens on reasoning before emitting text; 128 starves them to empty/invalid
  outputs. The gpt-5.4-nano/mini scores that *did* return (well under the 87.9% deterministic
  baseline) are contaminated by the same cap.
- **Price meters are null** → no cost ranking; llama emitted out-of-taxonomy labels that were
  counted `valid: true` — the scorer must treat out-of-taxonomy as abstention (the plan already
  says so; the runner doesn't).

**Fix list (one ticket):** per-model completion-token budget (≥ the reasoning floor; verify
via the probe stage), explicit `reasoning_effort` where supported, capacity or removal for
partner deployments (don't burn corpus calls into a 1-unit deployment), run the gpt-5 control
+ deploy gpt-5-mini (404 today), pin price meters, out-of-taxonomy ⇒ abstention, and re-run
per the plan's phases (probe → matrix → scoring → policy replay). Only then pick the primary
model ([02 §7](./02-agent-harness-architecture.md)).

**Honest possibility to keep on the table:** the deterministic baseline (87.9% exact; 100%
on cancellation/billing/acknowledgement) is strong. If the *fixed* matrix still shows models
below it on parse-fed inputs, the realignment does **not** die — it narrows: the
understanding call earns its place on the *context failures* (query recall 54.5%, the
document-blind categories) and the residue loop, not on wholesale replacement. The eval
decides the split; doctrine invariant 10.

## 2. Corpus: 58 → 200+, powered by emailevals

- **Today:** 67 labelled entries / 58 runnable (`manifest.json`), baseline pinned
  (`baseline-v2.json`). Weakest link: query recall 54.5%; several categories have tiny support.
- **The growth engine is the sibling repo `collisionsuite/emailevals/`** — AI-sorted,
  human-reviewed real emails with work-log audit trails. Graduation flow:
  1. a batch is sorted + human-corrected there (the work-log is the adjudication record);
  2. graduated items become manifest entries — tracked ticket-evidence `.eml` where committable,
     or the **local overlay** (`eval-overlay.json` pattern) for PII-heavier items that stay
     off-repo;
  3. each entry gets `expected_v1`/`expected_v2` labels + the `provider_match_state` judgment,
     per the harness README's rules.
- **Targets** (aifirstplan): ≥200 adjudicated items; ≥20 per mutating route (auto-associate,
  mint, duplicate-drop); deliberate coverage of quoted chains, misleading filenames,
  report-vs-instruction, scanned/photos-in-PDF, conflicting VRMs, repeated registrations,
  **prompt-injection fixtures**, and the new R4/R5 signals (claimant-name variants,
  incident-date pairs) which need labelling work of their own.
- **Every live human correction is corpus fuel:** `inbound_email` already stores
  `suggested_*` vs chosen `category_code`/`subtype_code` + `classifier_mode` — a periodic
  export of human-overridden rows into the adjudication queue closes the loop.
- PII rules: unchanged and non-negotiable (`scripts/eval-email/README.md` — aggregate numbers
  + closed labels in committed artifacts; raw content gitignored/local).

## 3. Eval layers

| Layer | What | Gate it protects |
|---|---|---|
| L0 | Engine pytest + `run_eval.py --check` regression pins (exists) | any engine/vendor change |
| L1 | Fixed model matrix (§1) | primary/escalation model choice |
| L2 | **Hybrid system A/B** — OLD (Stage A+B) vs NEW (V2 understanding + context-v2 + action table) over the full corpus, `run_ab.py` pattern; 3 uncached trials on mutating items | `AI_TRIAGE_V2_ENABLED` |
| L3 | Tier-2 loop evals — residue fixtures with tool-call traces scored for tool selection, budget respect, and correct abstention (Foundry's agent evaluators optional here; deterministic scoring first) | `AGENT_LOOP_ENABLED` |
| L4 | Safety/XPIA — injection fixtures must produce zero out-of-policy verdicts; local indirect-attack evaluators | every stage |
| L5 | Live inspection — first 50 acting decisions manually reviewed (no shadow period — the offline A/B carries the burden of proof; kill switches + suggest-first stages are the net) | each promotion |

**Merge/enable criteria for L2** (aifirstplan, verbatim where possible): zero wrong
target-case associations; zero false mints; zero actionable duplicate-drops; mutating
decisions stable across all trials; ≥95% exact category+subtype; ≥90% query recall; no
currently-correct item regresses unadjudicated; every unverified AI identifier rejected by
the deterministic validator.

## 4. Rollout stages (each = its own gate + evidence; no stage flips automatically)

| Stage | Ships | Gate(s) | Evidence to pass |
|---|---|---|---|
| S0 | Substrate: model gateway + prompt registry + registry `surfaces` + tool hardening ([03 §6](./03-agent-tool-contracts.md)) | none (pure refactor) | offline suite green; behaviour byte-identical |
| S1 | Fixed matrix + model choice | none (eval only, £-capped) | §1 done; L1 report |
| S2 | Parse-early reorder + `analyzeInboundV2` + `resolveTriageV2` **built dark**; agent_run table + agent log read UI (read-only, can ship early) | `AI_TRIAGE_V2_ENABLED` off | offline suite green |
| S3 | L2 A/B gate run + Q1 sign-off | — | L2 criteria met; §6a DPIA line recorded |
| S4 | **Enable V2 in suggestion-parity mode** — verdicts act only where today's ladder already acts; all new powers surface as suggestions/notes | `AI_TRIAGE_V2_ENABLED` on | L5 first-50 review clean |
| S5 | Promote behaviours one at a time (e.g. unique-VRM auto-attach after the Q2 ADR amendment; new-category actions) | one gate per behaviour (`AUTO_ATTACH_UNIQUE_VRM_ENABLED`, …) | per-behaviour corpus + live-confirmation evidence (ADR-0019 §4) |
| S6 | Tier-2 residue loop | `AGENT_LOOP_ENABLED` | L3 + L4 green |
| S7 | Case sweep (deterministic phase, then AI phase) | `AGENT_SWEEP_ENABLED`, `AGENT_SWEEP_AI_ENABLED` | dry-run report reviewed; anti-nag rules verified |
| S8 | DocIntel unknown-provider fallback (+ Content Understanding bake-off) | `DOCINTEL_FALLBACK_ENABLED` | side-by-side extraction report on held new-client samples |

Stage-independent: taxonomy additions ride their own category-set deltas + engine tags in the
decided deploy order, when corpus counts justify them (doctrine Q5).

## 5. Operator decision register (candidates for gated.md)

1. **PAYG (A1)** — precedes any new deployment/capacity work; everything above is provisional
   until it lands.
2. **Q1 raw-content egress** sign-off (§6a line) — blocks S3→S4.
3. **Q2 unique-VRM auto-attach** ADR amendment — blocks that S5 promotion only.
4. **Model + capacity:** approve the chosen primary; deploy it (+ gpt-5-mini or the winner);
   dedicated triage deployment vs shared gpt-5; TPM raise. Prompt Shields / content-filter
   config on the deployments.
5. **TKT-088/112 image-writer decision** (and fix the ticket-state drift) — blocks vision
   consolidation, not the email path.
6. **Eval spend cap** (default £20/run stands) + partner-model data-processing authority if
   partner models stay in the matrix.
7. **Sweep cadence + note visibility** — nightly? which queues? are agent notes
   staff-visible from day one (recommended: yes)?
8. **emailevals batch cadence** — who stages batches, who reviews work-logs.

## 6. Ticket candidates (mint under a new PLAN-NNN when adopted)

Small, ordered, one concern each — statuses/numbering assigned when minted:

1. eval: fix + complete the model matrix (§1) — the go/no-go input for everything.
2. substrate: model gateway module + migrate `triage-classify` to it (first consumer).
3. substrate: prompt registry + version stamping.
4. registry: `surfaces` dimension + invariant tests.
5. parser: per-document signals + bounded text return (sibling-first, ADR-0018, engine tag).
6. api: `triage/context-v2` multi-signal lookup (+ advisory-lock serialization).
7. domain: claimant-name variant matcher + incident-date extractor (R4/R5) + tests.
8. orch: parse-early reorder + `analyzeInboundV2` + `resolveTriageV2` + Durable V2 versioning (dark).
9. eval: L2 hybrid A/B harness + report (the S3 gate).
10. schema+api+SPA: `agent_run` + `/api/agent/runs` + dashboard panel + CaseDetail activity surface.
11. orch: tier-2 `agentLoop` sub-orchestration + budgets (dark).
12. orch: `caseSweepOrchestrator` (deterministic phase; AI phase behind its own gate).
13. functions: `docintel_layout_extract` fallback + template-candidate report (dark).
14. docs: ADR for the V2 triage architecture (amends 0015/0019; records Q1–Q5 outcomes);
    reconcile TKT-088/112 record drift; corpus-growth protocol doc in `scripts/eval-email/`.

Dependencies: 1 → (2..8 parallelisable) → 9 → flip S4 → 10..13 in any order → S5+ per
evidence. Ticket 10 has no model dependency and can land any time after S0.

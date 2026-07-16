# 00 — The AI estate today: inventory + disjointure findings

**Status:** DRAFT working plan (2026-07-16). Part of [ai-realignment-plans](./README.md).
Live gate **values**, deployments and quota live only in the registry
([live-environment.md](../../docs/operations/live-environment.md) / [LIVE_FACTS.json](../../LIVE_FACTS.json));
this file names the surfaces and their *shape*, not their numbers.

The instinct behind this plan set — "we have some AI usage, but it is quite disjointed" — is
half right. The estate is **large and mostly live**, but it grew as parallel lanes, each with its
own model plumbing, and the *planning* layer is scattered across five strata. The realignment is
consolidation and promotion of existing seams, not a greenfield build.

## 1. Every AI (and AI-adjacent) surface

| # | Surface | Where | Model / engine | Trust tier ([01](./01-doctrine-and-invariants.md)) | State |
|---|---|---|---|---|---|
| 1 | **Deterministic email classifier** (Stage A) | `functions/parser/cedocumentmapper_v2/rules/email_classifier.py` via `POST /api/classify-email`; invoked by `classifyInbound` | Pure rules — "no datastore, no network, no LLM" | — | Live, always-on, $0. 9 categories / 16 subtypes (`packages/domain/src/dto/index.ts`) |
| 2 | **Triage policy** (Stage B) | `packages/domain/src/domain/triage-policy.ts` `decideTriage`, invoked by the `triagePolicy` activity over `POST /api/internal/triage/context` | Deterministic | — | Live and **acting** (the `TRIAGE_*` behaviour gates — registry) + an always-on all-gates-on shadow decision in telemetry |
| 3 | **LLM triage second-opinion** (Stage C) | `orchestration/src/functions/gated/triage-classify.ts` → `lib/aoai.ts` | gpt-5 (Foundry `digital-3339-resource`, MI/keyless) | T2, suggestion-only | Live (`EMAIL_AI_ENABLED`) — runs **only** for abstain/`uncorroborated_*` rows, PII-scrubbed, writes `ai_suggestion` (`triage_category`), never routes |
| 4 | **Image role classifier** (auto-writer) | `orchestration/src/lib/image-classify.ts`, called from `extractImages` / `classifyPersist` / `box-classify-sweep` | gpt-5 vision | T2, **auto-writes** `evidence.image_role_code` / `registration_visible` / `person_reflection` | Live (`IMAGE_ROLE_CLASSIFY_ENABLED`) — the one model output that writes without suggestion (pre-dates the ladder; see finding F2) |
| 5 | **Image-analysis producer** | `api/src/lib/image-analysis*.ts` via `POST /api/cases/{id}/image-analysis/generate` | gpt-5 vision staged sequence + fast-alpr reg-OCR | T2/T1, suggestion-only | Live (`IMAGE_ANALYSIS_ENABLED`); every output an `ai_suggestion` |
| 6 | **Plate OCR / scanned-PDF OCR** | `ocr/` container app (`/api/plate-ocr`, `/api/ocr-pdf`) | fast-alpr (local ONNX) or Document Intelligence `prebuilt-read` | — | Live (`PLATE_OCR_ENABLED`, `OCR_SCANNED_PDF_ENABLED`); TKT-017's verdict: **no VLM egress for registrations** |
| 7 | **Location assist** | `functions/location-suggest/` (Computer Vision OCR + Azure Maps + `ai_reasoning.py`) | gpt-5 vision reasoning | T2, suggestion-only | Live (`LOCATION_ASSIST_AI_ENABLED`) |
| 8 | **In-app assistant** (chat + read tools) | `api/src/functions/assistant.ts` + `lib/aoai-chat.ts`; registry-driven toolset | gpt-5 | T1 | Live (`AI_CHAT_ENABLED`, `ASSISTANT_TOOLSET_V2`) |
| 9 | **Assistant write tier** | `propose_action` + `ConfirmActionCard` ([ADR-0024](../../docs/adr/0024-assistant-write-tier-confirmation-protocol.md)) | gpt-5 | T1, propose→confirm→execute | Flipped (`ASSISTANT_WRITE_TIER_ENABLED`); behavioural witness pending |
| 10 | **AI suggestion lifecycle** | `ai_suggestion` table (`160_ai_suggestion.sql`) + `POST /api/ai-suggestions/{id}/review` + `AiAssistPanel` | — (the shared output surface) | — | Live (`AI_ASSIST_ENABLED`); accept/reject with `review_state`, `model_version`, `classifier_mode` attribution |
| 11 | **MCP server** (external agents) | `api/src/functions/mcp.ts` (`POST /api/mcp`) | — | T3, read-only | Live (`MCP_SERVER_ENABLED`, Flow A PKCE app-reg); image-ingest lane dark ([mcp-image-ingestion.md](../../docs/architecture/mcp-image-ingestion.md)) |
| 12 | **Capability registry** | `packages/domain/src/capabilities/` ([ADR-0025](../../docs/adr/0025-shared-capability-registry.md)) | — | — | Built; feeds assistant toolset + MCP; **the natural home for the triage agent's tools** ([03](./03-agent-tool-contracts.md)) |
| 13 | **AI usage ledger** | `ai_usage_ledger` (`185_ai_usage_ledger.sql`) + `api/src/lib/ai-usage.ts` | — | — | Live; per `(usage_day, actor, surface)`; `actor` accepts service/agent identities |
| 14 | **PII pre-scrub** | `packages/domain/src/domain/pii-scrub.ts` | — | — | Acting before Stage C model calls; precision-over-recall pre-scrub, not de-identification |
| 15 | **Embedding prior** | `ai_suggestion.embedding double precision[]` + deployed `text-embedding-3-large` | — | — | **DDL + deployment only — no writer/reader.** Dormant seam |
| 16 | **Agent identity substrate** | `api/src/lib/auth.ts` (`CollisionSpike.Agent`, `authorizeAgentCapability`, reserved `agent_read`/`agent_write` audit codes) | — | T3 design | Designed + coded, not wired to any live write ([ADR-0023](../../docs/adr/0023-mcp-server-hosting-and-auth.md)) |
| 17 | **Eval harness + baselines** | `scripts/eval-email/` (`run_eval.py`, `run_ab.py`, `manifest.json`, `baseline-v2.json`) | — | — | Live yardstick: 67 labelled entries / 58 runnable; baseline **87.9%** exact, query recall **54.5%** (committed artifact) |
| 18 | **Model matrix runner** | `scripts/eval-email/run_model_matrix.py` + `model-matrix.json` + `model-matrix-summary.json` | 14-model matrix on Foundry | — | **Partially run, not yet interpretable** (finding F5) |
| 19 | **emailevals corpus repo** | sibling repo `collisionsuite/emailevals/` (own README/AGENTS + work-logs) | AI-sorted, human-reviewed | — | Active; the corpus-growth + taxonomy workshop feeding [06](./06-evals-and-rollout.md) |
| 20 | **Parser LLM-assist** | sibling `cedocumentmapper_v2.0` extraction orchestrator + offline LLM-assist | desktop/dev-only | — | Deliberately **NOT on the cloud path** (ADR-0018) — unchanged by this plan |

Also relevant non-AI machinery the agent will lean on: enrichment Function (DVSA/DVLA,
[vehicle-data.md](../../docs/architecture/vehicle-data.md)), the chaser system (draft persists;
**outbound send is a stub** — `orchestration/src/functions/gated/chaser.ts` only audits
`chaser_sent`), the `note` table (`100_note.sql`, `source_key` idempotency, system-authored
notes already written by `api/src/functions/internal.ts`), the ActivityEvent feed
(`GET /api/activity`, `GET /api/cases/{id}/activity`, SPA `/logs`), and the retro-case ladder.

## 2. The five planning strata (why it *feels* disjointed)

1. **The ADR line** — 0009 → 0010 → 0015 (+ its updates) → 0019 → 0023/0024/0025: binding, coherent, but spread across six files and two eras.
2. **[PLAN-001](../../docs/tickets/plans/PLAN-001-ai-mcp-hardening.md)** — the assistant/MCP/vision programme (largely delivered); it deliberately does **not** cover the triage pipeline's evolution.
3. **The rules-engine-v2 plan** (all phases complete; the plan file was retired in the PLAN-006 reset) — delivered Stages A/B/C and the eval harness.
4. **The four `docs/workingspace/` drafts** — the *next* wave (parse-fed reorder → AI-first → small-model ladder → model matrix), mutually referencing, partially contradictory, partially executed. Verdicts in [01 §verdicts](./01-doctrine-and-invariants.md).
5. **The emailevals repo + the operator's scratch notes** — the newest thinking (taxonomy tree, corpus growth, and the *agent-with-tools* concept this plan set formalises).

There is no single AI plan-of-record spanning all five. **This folder is that plan-of-record
(as a working draft) until its pieces graduate into ADRs + tickets.**

## 3. Disjointure findings (what the realignment actually fixes)

- **F1 — Four-plus independent model-call implementations.** `orchestration/lib/aoai.ts`,
  `orchestration/lib/image-classify.ts`, `api/lib/aoai-chat.ts`, `api/lib/aoai-suggestions.ts`,
  `api/lib/image-analysis*.ts`, plus Python `location-suggest/ai_reasoning.py` — each hand-rolls
  auth, request shape, retry, abstain mapping and telemetry. No shared prompt registry, no
  uniform gen-ai telemetry spans, ledger writes wired per-surface. → the **model gateway**
  ([02 §substrate](./02-agent-harness-architecture.md)).
- **F2 — Two image writers with different constitutions.** The live auto-writer (surface 4)
  pre-dates the suggest-first ladder; the suggestion producer (surface 5) follows it. The
  TKT-088/TKT-112 reconciliation decision is still open — and the ticket state itself has
  drifted (TKT-112 sits in `done/` while PLAN-001 §build-status and gated.md §F still say
  blocked). Reconcile the record, then the writers.
- **F3 — The conversation/thread signal is captured but under-used.** `conversation_id` is
  persisted; `linkReply` fires only for non-`receiving_work` replies; the chain signal the
  operator calls "very strong but not 100%" has no unified rung in the link ladder
  ([04 §ladder](./04-triage-decision-model.md)).
- **F4 — Claimant-name exists as an *extraction* but not as a *matching signal*.**
  `supplement-parse.ts` extracts claimant names defensively; nothing matches name variants
  (J Smith / Mr John Smith) against open cases, even as corroboration ([04 §identifiers](./04-triage-decision-model.md)).
- **F5 — The model matrix run is not yet evidence.** Partner-model rows are ~80% HTTP 429
  (single-unit eval deployments); all three `gpt-5`/`-mini`/`-nano` rows have 0 valid outputs with
  0 429s and the runner caps `max_completion_tokens` at 128 on reasoning profiles — consistent
  with reasoning-token starvation, so the low scores for `gpt-5.4-nano`/`-mini` (far below the
  87.9% deterministic baseline) cannot be read as model capability yet. Fix + finish per
  [06 §1](./06-evals-and-rollout.md) before *any* model conclusion — including "small models
  are enough" *and* "AI beats the rules".
- **F6 — Taxonomy vs the emailevals tree.** The human-reviewed tree names leaves the live 9/16
  taxonomy cannot express (amendment-request, disputes, post-report report-chase,
  payment-received, autoreply/out-of-office/undeliverable). Append-only growth path in
  [04 §taxonomy](./04-triage-decision-model.md).
- **F7 — Doc/checkout drift.** [aifirstplan](../aifirstplan.txt) cites another machine's
  checkout (`collisionspike-ui-readiness`) and a newer engine pin than this tree; the eval
  README's corpus counts were already flagged stale by [model-evaluation-plan](../model-evaluation-plan.md).
  Working drafts should cite repo-relative paths + pinned artifacts only.
- **F8 — The suggestion→action promotion seam is real but unexercised.** The code deliberately
  blocks acting on Stage C output (`intakeOrchestrator.ts` §1.55b); promotion criteria exist
  (ADR-0019 §4) but no behaviour has yet been promoted from `llm` suggestions. The agent plan
  rides this seam rather than inventing a new one.
- **F9 — Chaser outbound send is a stub.** Sweep-mode remediation ([05](./05-sweep-notes-agent-log.md))
  can *draft* chasers today; sending remains gated future work (`CHASER_SEND_ENABLED` + the
  Graph sendMail wiring).
- **F10 — The dormant embedding seam.** Deployed embedding model + `ai_suggestion.embedding`
  column with no reader/writer: either wire it (near-duplicate detection, provider-drift
  clustering — [07](./07-extensions.md)) or drop the column at the next schema tidy; don't
  leave it ambiguous.

## 4. What the operator's asks already have homes for

| Scratch-note ask | Existing substrate |
|---|---|
| "agent equipped with all our existing classifiers as tools" | Capability registry (ADR-0025) + the three triage seams + parser/OCR/enrichment routes ([03](./03-agent-tool-contracts.md)) |
| "leave a note on the case" | `note` table with `source_key` idempotency + system-authored precedent |
| "dashboard agent log / recent agent actions" | ActivityEvent feed + `/logs` screen + audit trail + `ai_usage_ledger` — needs an agent actor + one new panel ([05](./05-sweep-notes-agent-log.md)) |
| "call a vision model for images if necessary" | Surfaces 4/5/6/7 — already live; the agent *orchestrates* them, it doesn't add a new vision lane |
| "new providers via Document Intelligence as auto fallback" | DI resource live for OCR; the layout-extract fallback is the one genuinely **new** tool ([03 §docintel](./03-agent-tool-contracts.md)) |
| "examine waiting cases (e.g. missing mileage → DVLA)" | Enrichment Function + readiness checklist + on-hold/attention reasons — needs the sweep loop ([05](./05-sweep-notes-agent-log.md)) |
| "not just dumping things to an AI model" | ADR-0019's whole architecture agrees — the gap is unifying it under one harness with tools ([02](./02-agent-harness-architecture.md)) |

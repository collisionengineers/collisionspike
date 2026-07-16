# 01 — AI doctrine: the invariants every AI feature must honour

**Status:** DRAFT working plan (2026-07-16). Part of [ai-realignment-plans](./README.md).
Nothing here changes live behaviour; on adoption the *new* decisions distil into ADR
amendments + tickets, and this file becomes the checklist they are reviewed against.

This is the constitution extracted from the binding decisions that already exist
(ADR-0010/0015/0019/0023/0024/0025, the reviews, and the four prior working plans), so that
future AI work stops re-deriving it — and so the new **triage agent** ([02](./02-agent-harness-architecture.md))
is designed inside it rather than around it.

## The twelve invariants

1. **AI proposes; deterministic code disposes.** A model output is evidence, never an action.
   Stage C is "a suggestion writer, never an actor" ([ADR-0019 §3](../../docs/adr/0019-triage-policy-stage-split.md));
   the assistant write tier is propose → confirm → execute ([ADR-0024](../../docs/adr/0024-assistant-write-tier-confirmation-protocol.md));
   and the triage agent's mutating "tools" are verdict fields a deterministic executor honours
   ([03 §act tools](./03-agent-tool-contracts.md)). **AI never selects a case ID directly** — it
   nominates identifiers + evidence; the server resolves them ([aifirstplan](../aifirstplan.txt)).
2. **Abstain on ambiguity; nothing is silently dropped.** Every email is categorised (spam lands
   `other`, not a pre-filter — [ADR-0015](../../docs/adr/0015-email-triage-inbox-management.md));
   uncorroborated promotion is a bug (the 2026-06-29 corroboration gate); ambiguous matches go
   to a human, never a guess ([ADR-0010](../../docs/adr/0010-dedup-reference-disambiguated-no-time-window.md)).
3. **Identifier discipline.** One VRM canonicaliser ([ADR-0025](../../docs/adr/0025-shared-capability-registry.md));
   a model-proposed identifier is usable **only** when it exactly normalises to text extracted
   deterministically from the claimed source; an unverified model identifier may support manual
   review but never automatic association ([aifirstplan §2](../aifirstplan.txt)).
4. **Suggest-first promotion ladder.** Every new behaviour ships behind its own default-off gate,
   starts suggestion-only, and is promoted to an automatic action only on eval-corpus results
   plus live staff confirmations ([ADR-0019 §4](../../docs/adr/0019-triage-policy-stage-split.md)).
   VRM-only matches are never promoted past suggestion without an explicit ADR-0010 amendment
   (see open question **Q2** below).
5. **Authorization is enforced at the Data API, never at an AI layer.** Registry flags are
   advisory; `withRole`/RLS/audit are the enforcers ([ADR-0023](../../docs/adr/0023-mcp-server-hosting-and-auth.md),
   [ADR-0025](../../docs/adr/0025-shared-capability-registry.md)).
6. **Three trust tiers, never conflated** (see table below). A guarantee earned in one tier
   (e.g. the in-app human confirm) does not transfer to another.
7. **Per-provider consent + global kill switch.** `work_provider.ai_allowed` and the provider
   automation modes are honoured by every model call; one global kill switch stops all of it
   ([ADR-0019 §3](../../docs/adr/0019-triage-policy-stage-split.md), `CONTEXT.md` → Provider Automation Mode).
8. **Email and attachment content is data, never instructions.** The untrusted-content rule from
   the eval corpus governs production too: content goes to the model in the low-trust/document
   channel with Prompt Shields + indirect-attack filtering on the deployment, closed-enum
   structured outputs only, and no free-form action strings ([02 §injection](./02-agent-harness-architecture.md)).
9. **Honest PII posture.** `scrubPii` is a precision-over-recall **pre-scrub**, not
   de-identification ([ADR-0024](../../docs/adr/0024-assistant-write-tier-confirmation-protocol.md));
   any widening of raw-content egress (whole-email understanding, PDF/image bytes) is its own
   per-gate DPIA/E2/G5 sign-off line in
   [data-protection.md §6a](../../docs/architecture/data-protection.md) — never inherited from a
   neighbouring gate (see **Q1**).
10. **Evidence before enablement.** Frozen corpus + baseline, paired per-item comparison, and
    stability trials for every mutating route, per
    [model-evaluation-plan](../model-evaluation-plan.md); mutating decisions must be identical
    across repeat trials before a gate flips. Live numbers live only in the registry
    ([live-environment.md](../../docs/operations/live-environment.md)).
11. **Intake never blocks on AI.** Model timeout / refusal / content-filter / invalid schema
    degrades along a defined ladder — retry → frozen deterministic classifier → review queue —
    and a valid low-confidence model result routes to review rather than being overridden by
    fallback rules ([aifirstplan §3](../aifirstplan.txt)). Model versions are frozen per
    workflow (no auto-upgrade); a new version re-qualifies on the corpus first.
12. **Every decision is attributable and replayable.** `classifier_mode`
    (`deterministic | llm | human`) is already first-class; every model-informed decision stamps
    model + prompt + schema + policy versions and evidence anchors, lands in the audit trail /
    decision telemetry, and its cost lands in the `ai_usage_ledger`
    ([05](./05-sweep-notes-agent-log.md)).

## The three trust tiers

| Tier | Surface | Who confirms | Write path | Status (registry is canonical) |
|---|---|---|---|---|
| **T1 — in-app assistant** | `/api/assistant/chat` + read tools + write tier | A staff human, per action | Propose → confirm → execute; ETag/If-Match; destructive = human-only, never proposable ([ADR-0024](../../docs/adr/0024-assistant-write-tier-confirmation-protocol.md)) | Live (chat, toolset v2, write tier flipped) |
| **T2 — pipeline automation** | Intake orchestration (Stage A/B/C today → **triage agent** tomorrow) | Nobody at runtime — so the *promotion ladder* is the confirmation, per behaviour, in advance | Model verdict → deterministic action table → existing gated branches; suggestion-only until promoted | Stage C live suggestion-only (`EMAIL_AI_ENABLED`); `TRIAGE_*` behaviours acting |
| **T3 — external agents** | MCP (`POST /api/mcp`) | No human — hence read-only | Reads only (Flow A); autonomous writes deferred behind the ADR-0023 bar (agent app-role + signed commit token + ETag) | Read-only live; image-ingest lane dark ([mcp-image-ingestion.md](../../docs/architecture/mcp-image-ingestion.md)) |

**The email triage agent is T2.** It is *our* service code calling a model inside the
orchestrator — not an autonomous external agent — so it inherits Stage C's constitutional
position (suggestion-first, promotion per behaviour), not ADR-0023's Flow-B bar. Conversely it
never gets T1's write-by-human-confirm shortcut: at T2 the "human confirm" happened earlier, as
eval evidence + an operator gate flip.

## Verdicts on the four prior working plans

These four documents are a lineage, not alternatives. This plan set reconciles them:

| Doc | Verdict | What carries forward | What does not |
|---|---|---|---|
| [proposedparserchanges.md](../proposedparserchanges.md) — parse-fed unified triage | **Superseded in direction, absorbed in parts** | Parse-early for doc-bearing email; per-document signals (not just the selected doc); the offline A/B backtest pattern; TKT-102 lane collapse | Expanding the rules classifier with more semantic branches (`attachment_content_typings` refinement rules) — the rules engine is **frozen as fallback**, not grown |
| [aifirstplan.txt](../aifirstplan.txt) — AI-first understanding + deterministic resolution | **Adopted as the core** of [02](./02-agent-harness-architecture.md) | `EmailUnderstandingV1` (whole-message structured call); single `triage/context-v2` lookup; the action table; versioned V2 Durable sequence; fallback ladder; two kill switches; corpus-to-200 targets | Single-call-only shape (extended with a bounded tool loop for the residue, a sweep mode, notes and the agent log); "remove Case/PO from inbound lookup entirely" (see **Q3**); raw-content-without-sign-off (see **Q1**) |
| [smallmodels.md](../smallmodels.md) — extraction-first + nano/mini ladder | **Absorbed into model strategy** | Extraction-first input contract; escalation ladder concept; strict-schema + verbatim-identifier rule; vision only after native extraction + OCR fail | "Nano-first" as a default — the (impaired) matrix run so far has nano/mini-class **far below** the deterministic baseline; the primary model is chosen by the completed eval, not assumed ([06](./06-evals-and-rollout.md)) |
| [model-evaluation-plan.md](../model-evaluation-plan.md) — 14-model matrix | **Retained as the live eval workplan — must be fixed before it can decide anything** | The whole method: frozen corpus, PII rules, probe → matrix → policy replay → finalist trials → lexicographic ranking | Nothing discarded; but the current partial run is **not interpretable** (throttled partner deployments, likely reasoning-token starvation, missing gpt-5/gpt-5-mini controls, null price meters — [06 §1](./06-evals-and-rollout.md)) |

## Open doctrine questions (operator decisions — candidates for gated.md)

- **Q1 — Raw-content egress posture for triage understanding.** Live Stage C pre-scrubs
  (`pii-scrub`, acting). [aifirstplan](../aifirstplan.txt) assumes raw subject/body/attachment
  content (and PDF bytes) go to the model "per the chosen posture". That posture must be signed
  off as its own §6a line (like the 2026-07-08 vision sign-off) **before** the V2 understanding
  call ships — or V2 keeps the pre-scrub and accepts the accuracy cost. Recommendation: sign it
  off; parse-fed extraction already sends document *text*, and the understanding call is
  worthless blind.
- **Q2 — Provider-scoped unique-VRM auto-attach.** aifirstplan proposes amending the ADR-0010/0019
  "VRM-only never auto" rung to: *exact single same-provider VRM match with no conflicting
  identifier may auto-associate*. This is a real ADR amendment (0010 + 0019 §4), gated on the
  eval's zero-wrong-association evidence and its own kill switch (`AUTO_ATTACH_UNIQUE_VRM_ENABLED`).
  Recommendation: adopt, evidence permitting — this is where most manual attach volume is.
- **Q3 — Case/PO as an inbound signal.** aifirstplan removes it entirely; [ADR-0015 §5](../../docs/adr/0015-email-triage-inbox-management.md)
  ranks it first. Reconciliation in [04 §ladder](./04-triage-decision-model.md): keep Case/PO as
  an *opportunistic exact rung* (it appears in reply threads to our own outbound and is ours,
  therefore unambiguous) while never *relying* on it as the inbound key (fresh provider email
  won't carry it — the user-observed reality). No contract needs to drop it; the ref-gate
  already matches it.
- **Q4 — Incident date in dedup.** Incident date becomes a **disambiguation signal**
  (different dates on the same VRM ⇒ evidence *for* "distinct claim"; similar dates corroborate
  an attach *suggestion*) — never an auto-merge key, preserving ADR-0010's no-time-window rule.
  Needs incident-date extraction + labelling in the corpus before it can be scored.
- **Q5 — Taxonomy growth.** The emailevals tree names real leaves the live 9/16 taxonomy cannot
  express (amendment-request, disputes, post-report report-chase, payment-received,
  autoreply/out-of-office/undeliverable as distinct meta-genres). Additions are append-only
  category-set changes with the ADR-0015 deploy-order discipline, adopted when adjudicated corpus
  counts justify each leaf ([04 §taxonomy](./04-triage-decision-model.md)).

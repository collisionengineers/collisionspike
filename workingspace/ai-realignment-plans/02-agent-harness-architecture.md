# 02 — The agent harness: one substrate, one triage agent, three entry modes

**Status:** DRAFT working plan (2026-07-16). Part of [ai-realignment-plans](./README.md).
Core adopted from [aifirstplan](../aifirstplan.txt) (see verdicts in
[01](./01-doctrine-and-invariants.md)); grounded against the live pipeline mapped in
[00](./00-ai-estate-inventory.md).

## 1. Thesis

Build **one agent harness** with two layers:

- **The substrate** — shared plumbing every AI surface uses (model gateway, prompt registry,
  registry-derived tools, usage ledger, telemetry). This is the direct fix for finding F1
  (four-plus hand-rolled model clients).
- **The triage agent** — a T2 pipeline automation ([01 §tiers](./01-doctrine-and-invariants.md))
  with a system prompt, tools, and a strict output contract, entered three ways:
  1. **Intake triage** — every inbound email (replacing/absorbing Stage C, upgrading Stage A/B's blind spots);
  2. **Case sweep** — scheduled pass over waiting/held/incomplete cases ([05](./05-sweep-notes-agent-log.md));
  3. **On-demand** — a staff member (or the T1 assistant) asks "re-triage this email / why is this case stuck".

The agent follows **graduated autonomy** — deterministic first, one structured model call for
meaning, a bounded tool loop only for the residue:

```
tier 0  deterministic pre-pass        every email      $0        (exists today)
tier 1  whole-message understanding   every non-trivial email    ONE structured call
tier 2  bounded tool loop             residue only (~10-20%)     ≤6 tool calls, budgeted
        (ambiguity, unknown provider, missing-field remediation, vision checks, sweep)
```

Tier 0 alone already handles duplicates and the trivial meta-genres; tier 1 replaces "dumping
things to an AI model" with a context-rich, schema-locked call; tier 2 is what makes it an
*agent* — and it is deliberately the exception, not the rule, for cost, latency and
eval-stability reasons (mutating decisions must be reproducible across trials —
[06](./06-evals-and-rollout.md)).

## 2. The substrate

### 2.1 Model gateway (new shared module, both apps)

One TypeScript module (mirrored thinly in the Python location/OCR functions where needed)
that owns:

- **Auth + endpoint** — MI/keyless token mint to the Foundry account, deployment selection by
  logical role (`understanding | escalation | vision | embedding`), never by hard-coded name.
- **Request shape** — strict structured outputs (`json_schema`, `strict: true`) everywhere;
  the **Responses API** for calls that need PDF/file input (aifirstplan's whole-document path);
  chat/completions retained where already proven. Reasoning-model params handled centrally
  (no `temperature`; a sane completion-token floor — the exact bug that impaired the matrix run,
  finding F5).
- **Failure taxonomy** — one closed enum: `timeout | http_429 | http_5xx | refusal |
  content_filter | invalid_schema | abstain`; retry policy (2× with 60s budget) and the
  degrade ladder (below) implemented once.
- **Ledger + telemetry** — every call writes `ai_usage_ledger` (per `(day, actor, surface)`)
  and emits a gen-ai telemetry span/customEvent with model + prompt-hash + token counts, so
  App Insights KQL and (optionally, later) Foundry's continuous-evaluation onboarding see one
  consistent shape.
- **Safety config** — the deployment content filter carries Prompt Shields (user-prompt +
  indirect/document attack) with annotate-then-block posture; the gateway packs email/attachment
  content into the low-trust channel (§6).
- **Version pinning** — model version frozen per workflow; prompt + schema + policy versions
  stamped into every result (invariant 12).

Refactor order: new call-sites use the gateway from day one; the six existing clients migrate
opportunistically (each migration is a small ticket; no big-bang rewrite).

### 2.2 Prompt registry

Prompts live in-repo, versioned and hashed (the system prompt in
[04 §prompt](./04-triage-decision-model.md) is `triage-agent@v1`). A stable ≥1k-token shared
prefix exploits automatic prompt caching. No prompt text in app-settings.

### 2.3 Tools

All agent tools are **capability-registry descriptors** (ADR-0025) — same zod schemas, same
safety flags, one new `surfaces` dimension so a capability can be visible to the assistant,
the triage agent, and/or MCP independently. Full catalogue: [03](./03-agent-tool-contracts.md).

## 3. The intake-triage sequence (V2, versioned)

Adopting aifirstplan's shape onto the real orchestrator (activity names from
`orchestration/src/functions/intakeOrchestrator.ts`):

```
fetchMessage                     (unchanged: evidence landed immutably, sha256, .eml captured)
providerMatch                    (unchanged: domain/address → provider, intermediary resolution)
duplicate preflight              (unchanged: internetMessageId / payload-hash → drop, record)
parse (moved EARLY, doc-bearing only, best-effort)      ← absorbed from proposedparserchanges
analyzeInboundV2                 tier 1: deterministic extraction + ONE structured model call
                                 → EmailUnderstandingV1 (no DB writes, no case IDs)
[agentLoop]                      tier 2, ONLY if understanding returns ambiguity/low band/
                                 unknown-provider/missing-required — bounded tool loop
resolveTriageV2                  ONE context lookup (triage/context-v2) + the deterministic
                                 action table (04 §5) → decision
persist + execute                idempotent persist of classification, decision, versions,
                                 evidence anchors; existing downstream branches unchanged
                                 (caseResolve, boxFolderCreate, classifyPersist, extractImages,
                                  statusEvaluate, enrich)
```

Key properties, all inherited from the existing build or aifirstplan:

- **Durable versioning:** V2 applies to new instances only; legacy instances replay the exact
  V1 activity sequence; extension-bundle minimum raised per aifirstplan. Old activity
  registrations retained one release.
- **Bytes never enter Durable history** — activities receive blob paths + hashes.
- **Idempotency** — instance id keyed on `internetMessageId` (exists); `analyzeInboundV2`
  results content-hash-cached so replays and re-deliveries don't re-bill.
- **`EmailUnderstandingV1`** (strict schema): category + subtype from the closed taxonomy;
  `confidenceBand: high|medium|low`; per-attachment role
  (`instruction | audit_instruction | engineer_report | images | invoice | remittance |
  irrelevant | unknown`); candidate identifiers (`provider_job_ref | vrm | case_po |
  claimant_name | incident_date`) each with source anchors; closed ambiguity/reason codes;
  short evidence anchors; **no case IDs, no actions**. Supports an **array of case verdicts**
  (one email can carry several instructions).
- **Fallback ladder (invariant 11):** model failure → retry ×2 → the **frozen** Stage A
  classifier as semantic fallback → Stage B policy as today. A *valid* low-confidence model
  result goes to review and is never overridden by the fallback. Kill switches:
  `AI_TRIAGE_V2_ENABLED` (whole sequence) + per-behaviour gates ([06 §3](./06-evals-and-rollout.md)).
- Stage C (`triageClassify`) is **absorbed**: V2's understanding call covers every email, so
  the abstain-only second-opinion lane retires with V2 (its `ai_suggestion` output contract
  and `EMAIL_AI_ENABLED` posture carry into the new call).

## 4. The tier-2 agent loop

A Durable sub-orchestration (`agentLoop`) — model call and each tool call are activities, so
the loop is replay-safe and its history is an audit artifact.

- **Entry criteria** (any): understanding `confidenceBand=low` or ambiguity code; unknown
  provider with an instruction-class document; parser missing-required fields; conflicting
  identifiers; sweep mode; on-demand request.
- **Budget:** ≤6 tool calls, ≤2 additional model turns, 90s wall clock, token cap enforced via
  the ledger. On budget exhaustion → `flag_for_review` with everything gathered so far (that is
  a *success* outcome, not an error).
- **Tool set:** read + extract capabilities only ([03](./03-agent-tool-contracts.md));
  mutations remain verdict-mediated. The loop *narrows* the verdict; it never acts.
- **Loop model:** same primary model as tier 1; escalation to the stronger deployment is a
  harness decision (one retry of the whole reasoning with the escalation model when the primary
  returns `low` twice), not a model-visible tool.

## 5. Platform decision: in-app loop now; Foundry Agent Service is a later option

| Option | Verdict | Why |
|---|---|---|
| **In-app agent loop** (orchestration app, Durable activities, gateway → Foundry model deployments) | **Chosen** | Strict structured outputs (not available via Agent Service/Assistants); tools are in-process registry dispatches — no public tool surface to stand up; MI/keyless + RLS + audit posture unchanged; offline replay/eval trivially (the whole loop is functions + fixtures); zero new billable services |
| Foundry **prompt agent** + OpenAPI tool onto the Data API | Later option | Managed threads/tracing/versioning, but no strict schema outputs, a new resource/project type, and our tool auth model (Entra roles at the Data API) would need an OpenAPI-facing surface — exactly what ADR-0023 deferred |
| **Hosted agent / Microsoft Agent Framework** | Not now | Framework is .NET/Python only (no TS); hosted agents add a container runtime; the Durable-extension bridge is interesting only if a Python sidecar becomes desirable |
| **Foundry evals / continuous evaluation / red-teaming** | Adopt selectively | Cloud evals + OTel onboarding compose with our App Insights discipline; the AI Red Teaming Agent is region-gated away from uksouth today — use the local XPIA evaluators instead ([06 §4](./06-evals-and-rollout.md)) |

Revisit triggers: Agent Service gains strict structured outputs; multi-agent orchestration
genuinely needed; post-PAYG capacity/scale forces hosted tooling; Agent Framework ships TS.

## 6. Untrusted-input defence (the agent reads attacker-writable text)

Layered, per the platform guidance and invariant 8:

1. **Channel separation** — subject/body/attachment text and OCR output are packed as
   low-trust *documents* (spotlighting-style delimiters + explicit "data, never instructions"
   framing); the system prompt is the only instruction source.
2. **Deployment guardrails** — Prompt Shields user-prompt + document-attack detection on the
   Foundry deployment (annotate first, block after soak); detections land in telemetry and
   flag the email for review rather than silently proceeding.
3. **Contract lock** — strict closed-enum schemas; no free-text action fields; tool args
   zod-validated server-side; unknown tool / out-of-policy call refused without execution
   (same defence-in-depth as the MCP dispatcher).
4. **Deterministic executor** — even a fully hijacked model can only emit a verdict that the
   action table + identifier re-verification (invariant 3) will refuse.
5. **Eval + monitoring** — XPIA/indirect-attack items in the corpus (the injection fixtures
   smallmodels.md already calls for); injection-attempt rate on the ops dashboard.
6. **Upstream** — Defender for Office 365 now performs inbound prompt-injection inspection on
   Exchange mail flow (tenant-level; note for the operator, no config in this repo).

## 7. Model strategy

- **Roles, not names:** `understanding` (primary, every email), `escalation` (hard residue),
  `vision` (existing lanes), `embedding` (dormant seam). The registry maps roles → deployments.
- **Primary is chosen by the completed matrix** ([06 §1](./06-evals-and-rollout.md)) under
  [model-evaluation-plan](../model-evaluation-plan.md)'s gates — cheapest model that clears
  safety/contract/quality; escalation only if it corrects real primary failures. Until then the
  only safe default is the proven live gpt-5 deployment (aifirstplan's assumption).
- **Tool-calling requirement:** the tier-2 loop needs native tool calling + strict outputs —
  which the Phi family lacks (text-only, no tool calling); small-model candidates for the
  *loop* are therefore the mini/nano GPT class; Phi-class models remain candidates only for
  the tier-1 classify-only call.
- **Capacity is an operator item:** everything shares one gpt-5 deployment today (the
  registry's quota headroom section is canonical); the matrix's eval deployments were
  single-unit (hence the 429 wall). PAYG (gated.md A1) precedes any new deployment; a
  dedicated triage deployment + a TPM raise is part of the rollout asks
  ([06 §5](./06-evals-and-rollout.md)).
- **UK data posture:** Global Standard deployments process globally / rest in-geo — already
  signed off for vision/assist (data-protection §6a, 2026-07-08); the email-understanding
  posture is Q1 in [01](./01-doctrine-and-invariants.md).

## 8. Cost envelope (order-of-magnitude, not a live number)

Tier 1 on a mini-class model at parse-fed input sizes (~4–8k input / ≤1k structured output)
prices per-email in hundredths of a penny; tier 2 multiplies a *minority* of emails by ~3–5
calls; the sweep is a small nightly batch. At the observed low-thousands-of-emails/month
volume the whole harness is single-digit pounds/month on a mini-class primary — the escalation
model and vision passes dominate cost, which is exactly what the ledger's per-surface rows
make visible. Hard controls: ledger caps per surface/day + the £-bounded eval protocol.

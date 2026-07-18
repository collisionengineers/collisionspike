---
name: ai-realignment-plans-authored
description: 2026-07-16 authored docs/workingspace/ai-realignment-plans/ (9 docs) — the AI plan-of-record draft; supersedes the 4 older workingspace AI notes; key facts + open Q1–Q5
metadata: 
  node_type: memory
  type: project
  originSessionId: 69294a34-d780-4d5f-8b4f-b6265ee17282
---

On 2026-07-16 the operator asked for a unified AI plan ("email triage agent with tools",
sweep, notes, dashboard agent log) and I authored **`docs/workingspace/ai-realignment-plans/`**
(README + 00-inventory, 01-doctrine, 02-architecture, 03-tools, 04-decision-model,
05-sweep/notes/log, 06-evals+rollout, 07-extensions), linked from `docs/README.md`
(check-doc-links passes). Ticket batch NOT yet minted (candidates in 06 §6, needs a new
PLAN-NNN; PLAN-001..005 exist on main, PLAN-006 rides PR #100).

**Why:** it is the plan-of-record draft reconciling five strata: the ADR line
(0010/0015/0019/0023/0024/0025), PLAN-001 (assistant/MCP/vision — mostly LIVE, not dark),
the completed rules-engine-v2 plan, the four older workingspace drafts
(aifirstplan/smallmodels/model-evaluation-plan/proposedparserchanges — verdicts in 01), and
the `collisionsuite/emailevals` corpus repo.

**How to apply:** treat 01's twelve invariants + trust tiers as the frame for any AI work;
key empirical facts to not re-derive: deterministic baseline 87.9% exact / query recall 54.5%
(`scripts/eval-email/baseline-v2.json`); the committed model-matrix run is **uninterpretable**
(partner rows ~80% HTTP 429 on 1-unit deployments; gpt-5* rows 0-valid from
`max_completion_tokens:128` reasoning starvation; llama out-of-taxonomy counted valid) — fix
before any model conclusion. Parse-fed reorder (TKT-201..204 from proposedparserchanges) was
never built. Chaser outbound send is a stub. `ai_suggestion.embedding` + text-embedding-3-large
are a dormant seam. TKT-112 folder says done while PLAN-001/gated.md say blocked (drift).
Operator open questions Q1–Q5 (raw-content egress DPIA, unique-VRM auto-attach ADR amendment,
Case/PO inbound rung, incident-date-as-discriminator, taxonomy growth) gate the rollout stages.
Related: [[plan-001-vision-family-built-dark]] (that family has since gone LIVE 2026-07-08 —
registry is canonical).

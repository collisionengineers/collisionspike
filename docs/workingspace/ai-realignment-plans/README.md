# AI realignment plans — one harness for all of it

**Status:** DRAFT working plan set (2026-07-16), authored from the operator's scratch notes +
a full estate survey. Nothing here changes live behaviour. On adoption, the new decisions
distil into ADR amendments + a ticket batch ([06 §6](./06-evals-and-rollout.md)) and these
files are the record they're reviewed against. Live values live only in the registry
([live-environment.md](../../architecture/live-environment.md)).

## Thesis (one paragraph)

CollisionSpike's AI is bigger and more live than "disjointed" suggests — a deterministic
classifier + acting triage policy, a gated LLM second-opinion, live vision lanes, a live
assistant with a dark-to-flipped write tier, read-only MCP, a capability registry, a usage
ledger and a real eval harness — but it grew as parallel lanes with five separate planning
strata and no plan-of-record. The realignment: **one agent harness** — a shared substrate
(model gateway, prompt registry, registry-native tools, ledger, telemetry) carrying **one
triage agent** (system prompt + tools + strict verdicts) entered three ways (intake triage,
case sweep, on-demand), governed by the doctrine the ADRs already imply: *AI proposes,
deterministic code disposes; abstain over guess; suggest-first, promote on evidence.*

## The documents

| Doc | What it settles |
|---|---|
| [00 — AI estate inventory](./00-ai-estate-inventory.md) | Every AI surface today (20 of them), the five planning strata, ten disjointure findings |
| [01 — Doctrine & invariants](./01-doctrine-and-invariants.md) | The twelve invariants, three trust tiers, verdicts on the four prior plans, open questions Q1–Q5 |
| [02 — Agent harness architecture](./02-agent-harness-architecture.md) | Substrate + graduated-autonomy agent; V2 intake sequence; platform trade study (in-app loop over Foundry Agent Service, with revisit triggers); model strategy; injection defence |
| [03 — Agent tool contracts](./03-agent-tool-contracts.md) | The tool catalogue as capability-registry descriptors — what exists, what's extended, the one genuinely new tool (DocIntel fallback); hardening checklist |
| [04 — Triage decision model](./04-triage-decision-model.md) | The operator's Q1/Q2 filter formalised; identifier rules R1–R5; the link-confidence ladder; the action table; taxonomy alignment; the system-prompt draft; worked examples |
| [05 — Sweep, notes, agent log](./05-sweep-notes-agent-log.md) | Waiting-case sweep (deterministic-first), agent notes via the `note` table, the `agent_run` spine + dashboard/case surfaces |
| [06 — Evals & rollout](./06-evals-and-rollout.md) | Fix the model matrix first; corpus 58→200 via emailevals; stages S0–S8 with per-stage gates; operator decision register; 14 ticket candidates |
| [07 — Extensions](./07-extensions.md) | Twelve follow-ons, each doctrine-shaped |

Reading order: 01 → 02 → 04 are the core; 00 grounds them; 03/05/06 make them buildable.

## From the scratch notes to the plan (traceability)

| Operator note | Where it landed |
|---|---|
| Q1 who is it from → provider | [04 §1](./04-triage-decision-model.md) (exists — deterministic) |
| Q2a/b/c attachments / body / chain ("strong but not 100%") | [04 §2](./04-triage-decision-model.md); chain = ladder rung L3, outranked by fresh identifiers |
| VRM both formats | [04 §3 R1](./04-triage-decision-model.md) — one canonicaliser already exists |
| Claimant-name variants (J Smith / Mr John Smith…) | [04 §3 R4](./04-triage-decision-model.md) — new matcher, corroboration-only |
| External reference (theirs, not our Case/PO) | [04 §3 R2/R3](./04-triage-decision-model.md) + doctrine Q3 |
| Incident date as dedup discriminator | [04 §3 R5](./04-triage-decision-model.md) + doctrine Q4 (reconciled with ADR-0010) |
| "Dumping things to an AI model isn't great — proper agent, system prompt, tools" | [02](./02-agent-harness-architecture.md) + [04 §7](./04-triage-decision-model.md) |
| Existing classifiers as callable tools, hardened | [03](./03-agent-tool-contracts.md) (registry-native) + hardening checklist |
| Category / needs-parse / duplicates via tools | Tiers 0–2 in [02 §1](./02-agent-harness-architecture.md); action table [04 §5](./04-triage-decision-model.md) |
| New providers via Document Intelligence, auto fallback on missing fields | [03 §3 `docintel_layout_extract`](./03-agent-tool-contracts.md), stage S8 |
| Examine waiting cases (missing mileage → DVLA, "should be automatic") | [05 §1](./05-sweep-notes-agent-log.md) — deterministic remediation first, agent for the residue |
| Leave a note on the case | [05 §3](./05-sweep-notes-agent-log.md) — the `note` table already fits |
| Vision model for images if necessary | [00 §4](./00-ai-estate-inventory.md) — the lanes are live; the agent orchestrates them |
| Dashboard "recent agent actions" log | [05 §4](./05-sweep-notes-agent-log.md) |
| Ways to extend | [07](./07-extensions.md) |

## Relationship to everything else

- **Supersedes/absorbs** the four earlier `docs/workingspace/` drafts — per-doc verdicts in
  [01 §verdicts](./01-doctrine-and-invariants.md); the originals stay in place as records.
- **Builds on, never contradicts:** ADR-0010/0015/0019/0023/0024/0025 (amendment candidates
  are explicit — Q1–Q5), [PLAN-001](../../tickets/plans/PLAN-001-ai-mcp-hardening.md), the
  completed [rules-engine-v2 plan](../../plans/rules_engine_v2_plan_9ba034c4.plan.md), and the
  `scripts/eval-email/` harness ([README](../../../scripts/eval-email/README.md)).
- **Feeds on** the sibling corpus repo `collisionsuite/emailevals/` (taxonomy + adjudicated
  corpus growth — [06 §2](./06-evals-and-rollout.md)).

## Immediate next actions

1. Operator: read [01](./01-doctrine-and-invariants.md) and rule on Q1–Q5 (they gate the
   stages, not the start of work).
2. Fix + complete the model matrix ([06 §1](./06-evals-and-rollout.md)) — the one eval that
   picks the primary model, currently uninterpretable.
3. Mint the ticket batch ([06 §6](./06-evals-and-rollout.md)) under a new PLAN-NNN; S0
   substrate work and the agent-log read UI can start immediately — neither depends on a
   model decision.

# 07 — Extensions: where the harness goes next

**Status:** DRAFT working plan (2026-07-16). Part of [ai-realignment-plans](./README.md).
Deliberately un-committed ideas — each becomes real only via the doctrine
([01](./01-doctrine-and-invariants.md)): its own gate, suggestion-first, eval evidence.
Ordered roughly by (value ÷ effort) given the seams that already exist.

1. **Chaser drafting → sending.** The sweep already drafts chasers ([05 §1](./05-sweep-notes-agent-log.md));
   the natural next rung is agent-*composed* chaser text (provider-appropriate tone via the
   `ce-house-style` skill's conventions) behind human-approve, then `CHASER_SEND_ENABLED`
   with Graph sendMail (closing finding F9). Outbound email is the highest-blast-radius
   surface in the company — it stays human-approved longest.
2. **Review-queue prioritisation.** The agent already produces confidence bands + blocked_on
   diagnoses; a queue ordering (and "reason facets") derived from them makes the human review
   loop faster without any new model calls. Pure consumer of existing verdicts.
3. **Photo-set QA before EVA export.** Compose the existing vision stamps
   (`image_role_code`, `registration_visible`, `person_reflection`) into a pre-export
   checklist verdict: two-preview ordering satisfied, overview shows the plate, reflections
   excluded. Mostly deterministic over already-stored columns; the agent narrates failures.
4. **Provider-drift + template mining.** Weekly job over `agent_run`/`ai_suggestion`/parse
   outcomes: new sender domains for known providers, rising parse-miss rates per provider,
   DocIntel-fallback successes clustering by sender → a **template-candidate report** for a
   human to author in the sibling engine (ADR-0018 intact). This is also the natural first
   *writer* for the dormant `ai_suggestion.embedding` column (cluster by content similarity)
   — or the trigger to finally drop it (finding F10).
5. **Daily ops digest.** One morning note/email: intake counts by category, agent actions,
   escalations, cost, oldest waiting cases. Deterministic aggregation + one small model call
   for the narrative paragraph. (Digest *email* waits on the outbound rung.)
6. **Anomaly / spoof flagging.** The provider-match machinery already knows what a provider's
   mail looks like; flag near-domain lookalikes, first-seen senders claiming known providers,
   and Prompt-Shield-flagged content as an `attention_reason`. Cheap, defensive, and reuses
   the T2 suggestion surface.
7. **Case copilot (RAG over notes + emails + docs).** The T1 assistant grows retrieval over
   the case corpus ("what did the repairer say about the wheel?"). Needs the embedding seam
   for real + a retrieval index decision (pgvector is the documented-not-enabled path) — a
   proper mini-programme, not a ticket.
8. **`ask_triage_agent` as an assistant tool.** T1 ↔ T2 composition: staff ask the assistant,
   the assistant invokes the triage agent on-demand and renders its verdict + evidence. One
   registry descriptor once on-demand mode exists.
9. **MCP exposure of the triage tools.** The read tools ([03 §2](./03-agent-tool-contracts.md))
   are registry-native, so exposing them to external agents (Flow A read-only) is a flag change
   per tool — useful for e.g. a Claude-side ops assistant. Writes stay behind the ADR-0023
   Flow-B bar, unchanged.
10. **Valuation evidence (M3).** When valuation work arrives (Phase 5c), it lands as
    harness tools (comparables lookup, Companion-Report summarisation) — not a new AI stack.
    The prior-art connectors live in `collisionsuite/connectors/` (gateway/valuation).
11. **Multi-agent split.** If the sweep/on-demand load ever justifies it, the natural split is
    triage-agent vs case-worker-agent sharing the registry — and *that* is the moment to
    re-evaluate Foundry Agent Service / connected agents ([02 §5](./02-agent-harness-architecture.md)
    revisit triggers), not before.
12. **The learning loop as a habit.** Human corrections (`suggested_*` vs chosen, suggestion
    reject reasons, emailevals work-logs) reviewed monthly → corpus items → re-run L1/L2 →
    prompt/policy version bump. The realignment is only "done" when this loop, not a plan
    document, is what improves the system.

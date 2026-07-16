# 05 — Case sweep, agent notes, and the agent log

**Status:** DRAFT working plan (2026-07-16). Part of [ai-realignment-plans](./README.md).
Covers the operator's three asks beyond intake triage: *"examine waiting cases"*, *"leave a
note on the case"*, and *"the dashboard would need an agent log"*.

## 1. Case sweep mode

**Principle first (the operator's own parenthetical): what can be automatic should not be
agentic.** Missing mileage → re-run enrichment is a `WHERE` clause + an idempotent function
call; the agent's value is the *residue* — explaining stuck cases, spotting cross-signal
oddities, and composing the human-facing narrative.

**Shape:** a timer-triggered Durable orchestration (`caseSweepOrchestrator`, nightly + an
on-demand trigger), three phases:

1. **Deterministic remediation (no model).** Query the waiting population — `missing_images`,
   `missing_required_fields`, aged `needs_review`, `on_hold` with expiring reasons,
   `attention_reason` set — and apply the rule map:
   - missing mileage / vehicle data → `request_enrichment` (idempotent via
     `vehicle_lookup_run.idempotency_key`; skip if a recent run exists);
   - missing images past the chase cadence → `draft_chaser` (draft-only — send is a stub,
     finding F9) + note;
   - inspection-address undecided with suggestions available → surface the existing
     suggestion (never auto-decide — ADR-0013);
   - stale `provider_archive_pending` / holding states → escalation entry in the report.
2. **Agent pass over the residue (tier 2, budgeted).** Only cases the rule map couldn't move:
   the agent gets the case detail, missing checklist, linked emails, activity — and produces a
   *diagnosis verdict*: `blocked_on` (closed enum: provider / repairer / images / fields /
   internal / unknown), a recommended next action (from the same closed action set), and a
   case-note draft. Hard caps: N cases per night (config), per-case tool budget, ledger cap.
3. **Report.** One sweep summary (counts by outcome, escalations, cost) → ops note +
   telemetry event + the agent log.

**Idempotency / anti-nag rules:** at most one agent note per case per condition per cadence
window (`note.source_key = 'agent-sweep:<case>:<condition>:<window>'`); a re-run never
duplicates remediation already in flight; a human's dismissal of a suggestion suppresses that
suggestion's re-issue (the `ai_suggestion.review_state=rejected` signal is honoured).

Gate: `AGENT_SWEEP_ENABLED` (new, default off), with phase 1 (deterministic) separately
gateable from phase 2 (model) — `AGENT_SWEEP_AI_ENABLED`.

## 2. On-demand mode

Same agent, same tools, invoked for one target: a dashboard/inbox action ("re-triage this
email", "why is this case stuck?") and — later — a T1 assistant tool (`ask_triage_agent`) so
staff can invoke it conversationally. On-demand runs are attributed to the requesting staff
actor *and* the agent (requester recorded in the run row).

## 3. Agent notes

- **Mechanism exists:** the `note` table (first-class, `100_note.sql`) with `source_key`
  idempotency and system-authored precedent (`internal.ts` retro/link-reply notes).
- **Authoring:** `note.author = 'Triage Agent'`; `source_key` carries the run id; note text
  follows the style pinned in the system prompt ([04 §7](./04-triage-decision-model.md)) —
  concise, factual, evidence-anchored, one incident per note.
- **When:** every *acting* decision (link, mint, enrichment request, chaser draft) leaves a
  note; suggestions do **not** (they already surface in `AiAssistPanel` — double-surfacing is
  noise); sweep diagnoses leave one note per case per window.
- Notes render today in CaseDetail's Notes tab with zero SPA work; an author chip
  distinguishing agent notes is a nice-to-have.

## 4. The agent log (run spine + surfaces)

**Storage — one new slim table `agent_run`** (numbered schema file + RLS/grants in the
`900_constraints` pattern, mirroring `160_ai_suggestion.sql`):

```
agent_run(
  id uuid pk,
  mode            text  -- intake_triage | case_sweep | on_demand
  trigger_ref     text  -- inbound_email id / case id / requester
  case_id         uuid null, inbound_email_id uuid null,
  status          text  -- completed | fallback | budget_exhausted | error
  verdict         jsonb -- EmailUnderstandingV1 / sweep diagnosis (scrubbed per PII rules)
  tool_trace      jsonb -- [{seq, tool, args_digest, outcome, ms}] — digests, not raw args
  model, prompt_version, policy_version,
  input_tokens, output_tokens, cost_estimate,
  started_at, finished_at
)
```

Why a table and not just telemetry: App Insights retention on this stack is short and
variable — **the DB is the durable layer** (established operational lesson); the dashboard
feed needs a queryable source; and the run row is the correlation spine that `ai_suggestion`
rows, audit events (`agent_read`/`agent_write` family with `autonomous:true`), `note.source_key`
and ledger rows all reference.

**Existing rails reused, not duplicated:**
- Audit: every executed action already lands in `audit_event` via the executor paths; agent
  attribution rides the reserved action-code family.
- Cost: `ai_usage_ledger` rows with `actor='triage-agent'`, `surface='email_ai'|'sweep'`.
- Telemetry: gateway spans/customEvents per call; a `triage_decision`-style event per run.

**API:** `GET /api/agent/runs?limit=…` (recent, cross-case) and
`GET /api/cases/{id}/agent-runs` — same `withRole` staff auth as everything else; added to
`rest-client.ts` per its existing pattern (`safe()`-wrapped gate read; mutations none).

**SPA surfaces (fluent-spa-designer work, spec-level here):**
1. **Dashboard — "Agent activity" panel**: the recent-runs feed (mode, one-line outcome, case
   link, cost chip), following the `Panel`/`QueueCard` composition on `Dashboard.tsx`. The
   existing `ActivityEvent` shape fits (add an `agent` kind or filter by actor) — the feed can
   even ship *before* `agent_run` by filtering `/api/activity`, then upgrade.
2. **Case detail — "Agent activity"**: surface `activityForCase` (endpoint already exists,
   currently unsurfaced) as a tab or sidebar panel next to `AiAssistPanel`, showing this
   case's runs, notes and suggestions with a **"why" drill-down** — the verdict, evidence
   anchors and tool trace from `agent_run`. Trust is built by showing the working.
3. **`/logs` ActionLogs**: agent actor rows appear automatically once audit attribution lands;
   add an actor filter chip.
4. **Admin**: per-surface spend (ledger) + injection-detection and fallback-rate counters.

## 5. KQL starters (ops)

- Run outcomes: `customEvents | where name == 'agent_run_completed' | summarize count() by tostring(customDimensions.status), bin(timestamp, 1d)`
- Fallback rate: fallback/error runs ÷ total per day (alert if > threshold).
- Injection flags: `customEvents | where name == 'prompt_shield_flag'` (annotate mode) by mailbox/sender.
- Cost: ledger table is canonical; App Insights only for shape-of-day.

# 03 — Agent tool contracts (capability-registry-native)

**Status:** DRAFT working plan (2026-07-16). Part of [ai-realignment-plans](./README.md).

The operator's ask — *"all our rules and classifying and parsing can be callable tools"* — is
satisfied by extending the **shared capability registry**
([ADR-0025](../../adr/0025-shared-capability-registry.md)), not by a bespoke toolset. One
descriptor + one zod schema per tool; the assistant, the triage agent and (read-only) MCP each
see the slice their surface allows. That is the whole unification move: **one tool layer,
three consumers.**

## 1. Conventions

- **Descriptor extension:** add `surfaces: ('assistant'|'agent'|'mcp')[]` to the descriptor
  (registry invariant tests extend accordingly: MCP ⊆ read ∧ ¬humanOnly ∧ ¬destructive, as
  today; `agent` surface additionally excludes every direct-write capability — see §4).
- **Args/results:** zod-validated both directions; results are compact structured JSON with
  `source` anchors (message id / blob path / row id) so verdict evidence is traceable.
- **Harness policies (enforced outside the model):** per-run tool-call budget; per-tool
  timeout; idempotency keys where a tool is re-invocable; PII-redaction of tool *logs* (the
  tool result itself may carry PII in-process — logs and telemetry may not); every call
  auto-recorded to the run trace ([05](./05-sweep-notes-agent-log.md)) — the model never has
  to "remember to log".
- **Failure shape:** every tool returns `ok | not_found | ambiguous | error(code)` rather than
  throwing into the loop; the agent is prompted to treat `ambiguous` as a first-class answer.

## 2. Read / context tools

| Tool | Backing today (state) | Notes |
|---|---|---|
| `get_inbound_context` | `fetchMessage` envelope + `providerMatch` result + duplicate-preflight outcome (all exist) | **Pre-assembled into the tier-1 prompt, not model-invoked** — the operator's Q1/Q2 filter answered up-front ([04 §2](./04-triage-decision-model.md)) |
| `lookup_provider` | `matchProviderByDomain` + `image_source` intermediary N:N (exists) | Returns provider, automation mode, `ai_allowed`, ref-pattern hints |
| `find_case_candidates` | **Extend** `POST /api/internal/triage/context` → the single `triage/context-v2` lookup (aifirstplan §2) | Accepts multiple *validated* signals (job-ref, VRM, case_po, conversation, claimant+date corroboration); returns per-signal matches, eligible-status flags, conflicts. Never accepts a bare case ID from the model |
| `get_conversation_thread` | `inbound_email.conversation_id` + `linkReply` machinery (exists, under-used — finding F3) | Prior messages + any linked case; flagged *strong-not-authoritative* |
| `get_case_detail` / `emails_for_case` / `case_activity` / `vrm_twins` | Assistant read tools (live, registry-driven) | Reused verbatim — same descriptors gain the `agent` surface |
| `get_missing_checklist` | Readiness/`statusEvaluate` contract (exists) | The sweep's primary read ([05](./05-sweep-notes-agent-log.md)) |
| `archive_lookup` | box-webhook facade, read-only roots (live) | Suggest-only archive correlation |

## 3. Extraction tools

| Tool | Backing today (state) | Notes |
|---|---|---|
| `classify_email_rules` | Parser `POST /api/classify-email` (live, $0) | The **frozen** Stage A engine: fallback + cheap signal source (refs, VRM, thread-scope, corroboration flags). Frozen ≠ deleted (invariant 11) |
| `parse_documents` | Parser `POST /api/parse` via the early-parse step (live) | **Extend:** per-document signals for *every* attachment (not just the selected doc) + optional bounded text return — the smallmodels.md contract |
| `ocr_document` / `ocr_plate` | `POST /api/ocr-pdf` / `POST /api/plate-ocr` (live) | Local-first (Tesseract / fast-alpr), DI Read behind config; no VLM for registrations (TKT-017) |
| `analyze_images` | `POST /api/cases/{id}/image-analysis/generate` + `image-classify` lane (live) | The agent *orchestrates* the existing vision lanes; it adds no new vision egress |
| `docintel_layout_extract` | **NEW** — the one genuinely new tool. DI `prebuilt-layout` on an instruction-class document | The unknown-provider fallback: when `parse_documents` misses required fields, layout-extract + a schema-locked mapping call produce a *draft* EVA-12 field set, `low` confidence, suggestion-only. Azure **Content Understanding** is the managed alternative — bake-off, not default ([06 §6](./06-evals-and-rollout.md)). Repeated success for one sender accumulates a **template-candidate report** for a human to author a real template in the sibling engine (ADR-0018 stays intact — no auto-generated templates) |
| `extract_identifiers` | Engine regexes (`CASEREF_RE`, `_job_reference`, VRM canon/filter, `supplementClaimantNameFromBody`) — all exist | Exposed as one deterministic sweep over subject/body/filenames/parsed text; the *only* source of identifiers the executor will trust (invariant 3) |

## 4. Action tools — verdict-mediated, never direct writes

The agent's mutations are **fields of its verdict**, executed by the deterministic
action table ([04 §5](./04-triage-decision-model.md)) through the *existing* gated branches.
In tool form (so the model reasons in actions, and the sweep/on-demand modes can propose them):

| Tool | Executor path (exists) | Constitution |
|---|---|---|
| `propose_case_link` | ref-gate / `triageSuggestLink` / `linkReply` → `ai_suggestion` or auto-attach where promoted | Takes `basis + evidence` (never a bare case id); server re-resolves + re-verifies; ambiguity → suggestion |
| `propose_new_case` | `caseResolve` mint path | Only with instruction evidence + the corroboration rules; unknown-provider mints stay held (`provider_unresolved`) |
| `propose_cancellation` | Stage B cancellation proposal lane | Always staff-confirmed (never auto-close) |
| `propose_hold_or_review` | triage_state / attention_reason / on_hold lanes | The safe default; budget exhaustion lands here |
| `request_enrichment` | Enrichment Function (live at intake) | Sweep-mode re-invoke for missing mileage etc. — idempotent via `vehicle_lookup_run.idempotency_key` |
| `draft_chaser` | Chase suggestion + draft lanes (live; **send remains a stub** — finding F9) | Draft-only until `CHASER_SEND_ENABLED` work lands |
| `add_case_note` | `note` table, `source_key` idempotent, system-author precedent | The operator's "leave a note for anything it does" — see [05 §3](./05-sweep-notes-agent-log.md) for the note format + actor |
| `record_suggestion` | `ai_suggestion` lifecycle (live) | The catch-all output for anything not yet promotable |

Registry flags for all of the above: `kind:'write'`, `humanOnly:false`, `destructive:false`,
each with its own `gateLabel`; **the `agent` surface maps them to verdict fields, not to the
T1 propose→confirm card and not to MCP** (which continues to see no writes at all). Anything
`destructive`/`humanOnly` (merge, remove, forced status) is *unrepresentable* in the verdict
schema — closed enums, not filtered lists.

## 5. Identity, audit and authorization

- The agent runs under the orchestration app's managed identity but records a **first-class
  agent actor** — the substrate ADR-0023 already reserved: audit rows via the
  `agent_read`/`agent_write` action-code family with the agent name + `autonomous:true`;
  `ai_usage_ledger.actor = 'triage-agent'`; `note.author = 'Triage Agent'` (display) with the
  run id in `source_key`.
- Authorization stays at the Data API (invariant 5): the internal routes the executor calls
  are the same service-auth routes the pipeline already uses; `authorizeAgentCapability`
  gates any future externally-reachable agent surface.
- Per-provider `ai_allowed=false` short-circuits tiers 1–2 for that provider's mail
  (deterministic path only), exactly as Stage C behaves today.

## 6. Hardening checklist for the existing components ("hardened and improved")

Before the agent leans on them, each backing component gets a contract test + these specific
upgrades (each a small ticket in [06 §7](./06-evals-and-rollout.md)):

1. `parse_documents`: per-document signal array + bounded text return; password-protected /
   corrupt / nested `.msg`/`.eml` attachments covered by tests (explode-eml exists).
2. `find_case_candidates`: the context-v2 request (multi-signal, one lookup, conflicts
   surfaced; advisory-lock serialization already decided in ADR-0019).
3. `extract_identifiers`: add claimant-name variant normalisation ([04 §3](./04-triage-decision-model.md))
   and incident-date extraction (new, needed for Q4).
4. `classify_email_rules`: freeze — regression pins on `baseline-v2.json`; no new semantic
   branches (deterministic extraction helpers may still be extended).
5. Vision lanes: resolve the two-writer question first (TKT-088/112 — finding F2).
6. `docintel_layout_extract`: build behind `DOCINTEL_FALLBACK_ENABLED` (new, default off),
   suggestion-only, with per-day ledger cap.

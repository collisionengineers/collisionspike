---
id: PLAN-001
title: Harden and enhance AI features plus MCP
status: active
tickets: [TKT-066, TKT-069, TKT-067, TKT-072, TKT-107, TKT-068, TKT-111, TKT-110, TKT-064, TKT-088, TKT-112, TKT-113, TKT-016, TKT-017, TKT-018, TKT-015, TKT-060]
---

# PLAN-001 — Harden & enhance all AI features + build MCP (in-app assistant + external agents)

## Context

Collisionspike has **two** live-ish AI surfaces that are easy to conflate:

- **The read-only assistant (TKT-060)** — `POST /api/assistant/chat`, MI-token gpt-5 on Foundry
  `digital-3339-resource`, **3 SELECT-only tools** (`lookup_case`, `count_cases_by_status`,
  `search_inbound`). `AI_CHAT_ENABLED=true` — **it is live**. TKT-066/067/068/069 all extend *it*
  and are all **backlog / not-started**.
- **The AI suggestion layer (TKT-015)** — accept/reject `ai_suggestion` rows; its model call
  (`callModelForSuggestions`) is a **dormant `return []` stub** except the live email-triage lane.

The ask: **fully harden and enhance every AI feature, implement the full AI ticket family, and build
MCP so an AI — both the in-app assistant and external agents — can do every job a human can.** Four
decisions were locked by the user: **(1)** build the full AI family; **(2)** unify writes (assistant
gains write capability; external agents write via MCP); **(3)** Azure-native MCP with its own Entra
app-reg forwarding an Entra bearer to `cespk-api-dev`; **(4)** build dark → gate-off → flip on operator
sign-off.

An adversarial review (verified against code) found the naive form of (2)/(3) **unbuildable/unsafe**:
MCP-layer write guardrails are cosmetic because authorization is enforced at the Data API by `withRole`,
which only knows `CollisionSpike.User`/`.Superuser`; an MCP-own-app-reg bearer fails the API audience
check; OBO is impossible for autonomous agents; `set_case_status` contradicts the terminal-locked
computed state machine; and the vision work collides with an **already-live** TKT-064 auto-classifier.
**The destination is unchanged; the route is re-sequenced** so guardrails live at the Data API and
autonomous writes sit behind a designed prerequisite bar. Full workflow that produced this: Explore ×3 →
Plan → adversarial `claude` review (6 Critical / 12 Major / 7 Minor) → Plan revise.

## Guiding principles (from the review)

- **Authorization is enforced at the Data API, never at the MCP layer.** MCP/registry flags are
  advisory; the API route is the enforcer (RLS `app.role=staff` + `withRole` + append-only audit).
- **The model never issues a write.** In-app: model *proposes* → SPA renders a structured-diff card over
  **independently re-fetched** DB state → human confirms → SPA calls the existing route. This is an
  *in-app* guarantee that does **not** transfer to autonomous MCP agents (no human) — so autonomous
  writes are deferred behind a hard prerequisite bar.
- **Every flip is a gate that defaults off; no flip is automatic.** New model egress (esp. image bytes
  to a GlobalStandard, non-UK-pinned gpt-5) needs a DPIA + per-gate E2/G5 sign-off.
- **One shared capability registry**, env-free, in `@cs/domain`; both surfaces derive tools from it.

## The shared capability registry (new)

Single descriptor table both adapters consume. Lives in `@cs/domain`, **env-free / I/O-free** (a gate is
a bare label string resolved elsewhere).

- `packages/domain/src/capabilities/registry.ts` — descriptor array + types.
- `packages/domain/src/capabilities/schemas.ts` — **zod** schemas for write DTOs (single runtime source;
  JSON-schema for tool `parameters` derived via `zod-to-json-schema` at build — replaces the unachievable
  "parity test on hand DTOs"). Add `zod` + `zod-to-json-schema` to `@cs/domain` (ajv stays for choicesets).
- `packages/domain/src/domain/vrm-canon.ts` — the **one** canonicalizer
  `canonicalizeVrm(s) = s.toUpperCase().replace(/[^A-Z0-9]/g,'')` (alnum-only). Re-point the three
  divergent call-sites: `orchestration/src/lib/image-classify.ts:171`, `packages/domain/src/domain/vrm-filter.ts`,
  and `openVrmTwins` (`api/src/functions/cases.ts`, add a normalized comparison / expression index).

Descriptor: `{ name, kind:'read'|'write', destructive, humanOnly, gateLabel|null, minRole, route{method,path}, inputSchema?:Zod }`.
Rules baked in: **no `set_case_status`** (contradicts `case-status.ts:199-222` terminal-lock);
`merge_cases` + `remove_case` are `destructive:true, humanOnly:true` (filtered from agents AND rejected
by the API for agent principals — defense in depth). Two adapters: the in-app **read handler** (refactored
`execTool`) and the MCP **GET-forwarder**.

## Phase 1 — Ship-now read value (low-risk, high-value)

Tickets: **TKT-066** (foundation), **TKT-069** (6 read tools), **TKT-067** (New-chat), **TKT-072**
(global search), **TKT-107** (archive read). All behind flags with regression pins over the live assistant.

- **Precondition — doc-drift reconciliation:** fix `docs/tickets/BOARD.md` (TKT-064 is *built + live*, not
  "unbuilt"); correct the stale `api/src/functions/ai-suggestions.ts` header; add `IMAGE_ROLE_CLASSIFY_ENABLED`
  to `LIVE_FACTS.json` + `docs/architecture/live-environment.md` (keep `disableLocalAuth:false` honest).
- **TKT-066:** route the 3 tools' VRM/Case-PO handling through `canonicalizeVrm` (spaced VRMs currently
  can't match compacted storage); in `api/src/lib/aoai-chat.ts::runChat` add `ctx.warn` on caught tool
  exceptions + `toolErrors` in the result + **one retry** (Postgres cold-connect). **Refactor safety
  (M7):** flag `ASSISTANT_TOOLSET_V2` (default off) selects the registry-driven read adapter; `execTool`
  stays as fast rollback. Add regression tests pinning current tool outputs **before** refactoring.
- **TKT-069:** six SELECT-only tools via the read adapter — `get_case_detail`, `case_activity`,
  `vrm_twins` (reuse `openVrmTwins`), `list_queue_cases`, `emails_for_case`, `aging_exceptions`;
  handler-language queue labels. **Read guarantee:** provision a **read-only Postgres role/connection**
  for the read-tool path (don't rely on a brittle `^\s*SELECT` regex).
- **TKT-067:** New-chat button in `mockup-app/src/components/AssistantDrawer.tsx` (clears `turns`/`input`,
  disabled while sending; SPA-only).
- **TKT-072:** new `api/src/functions/search.ts` `GET /api/search?q=` across `case_` / `inbound_email` /
  `work_provider` using `canonicalizeVrm`, honest-empty, group caps, short-query guard — **behind
  `GLOBAL_SEARCH_ENABLED`** (default off) for a soak. Wire `AppShell.tsx` SearchBox → `/search` results
  view with same-VRM grouping.
- **TKT-107:** archive lookups call the **box-webhook facade** (enforces `BOX_READONLY_ROOT_IDS`, a
  box-webhook Python env var — *not* a `@cs/domain` gate); suggest-only, never mints.
- **New gates (off):** `ASSISTANT_TOOLSET_V2`, `GLOBAL_SEARCH_ENABLED`. No new DB. No new model egress.

## Phase 2 — In-app write tier, dark (gate: Phase 1 soaked)

The **propose→confirm→execute** protocol, in-app only. Model emits a `ProposedAction`; the SPA
**re-fetches the target row independently**; `mockup-app/src/components/ConfirmActionCard.tsx` renders the
**structured route + params the SPA will POST** (never model prose) **diffed against the re-fetched state**
with destructive/field changes highlighted; human confirms; SPA POSTs to the existing write route.

- **Optimistic concurrency (M9):** re-fetch captures `updated_at`; confirm POST carries it as an ETag; the
  write routes in `api/src/functions/cases.ts` / `inbound.ts` / `inspection.ts` verify and 409 on mismatch.
- **Write capabilities** (all map to existing `withRole('CollisionSpike.User')` routes): `edit_case_fields`
  (zod from `CaseUpdateInput`), `set_on_hold`, `log_chase`, `save_inspection_decision`, `create_case`,
  `reclassify_inbound`, `set_triage_state`. `merge_cases` = human-confirm only, **never** an agent tool.
- **Deliberately excluded:** `set_case_status` (no route; terminal-locked — forced status is a separate
  human-only Superuser feature); **AI-driven byte upload** (breaks the "user routes never write bytes"
  invariant; needs AV + `Storage Blob Data Contributor` on `cespkevidstdev01`; prefer the existing
  service-auth out-of-band path `api/src/functions/internal.ts:1990`). TKT-068's *attach UX* may ship, but
  the **model gets no upload capability**.
- **New gate (off):** `ASSISTANT_WRITE_TIER_ENABLED`. Surface DPIA line-items; stop calling `scrubPii`
  output "de-identified" (it is a precision-over-recall pre-scrub).

## Phase 3 — MCP server, READ-ONLY first (gate: PAYG done + Phase 2 landed + agent-authz design approved)

- **Host on the existing `cespk-api-dev` Function App** (stateless Streamable-HTTP MCP) — **no Container
  App / ACR** for the spike (minReplicas:0 reintroduces cold-start; :1 burns trial credit/quota). Revisit
  post-PAYG under load. New `api/src/functions/mcp.ts` registers tools from the registry's `kind:'read'`
  descriptors → GET-forwarder; reuses the Phase-1 read-only DB role.
- **Two auth flows, documented separately (ADR-0023):** **Flow A** — interactive MCP clients
  (Claude Desktop/API) via OAuth Auth-Code + PKCE, *delegated user* (`scp`, real `oid`, OBO feasible) —
  the near-term path that works with the single assigned staff principal. **Flow B** — autonomous
  client-credentials agents (app-only `roles`, no user, OBO impossible) hit a **dedicated agent-scoped
  Data-API surface**; MCP calls with its own MI and **stamps the agent identity into audit**.
- **Agent authorization is DESIGNED here as the write prerequisite (not shipped):** extend `withRole`
  (or add `withCapability`) in `api/src/lib/auth.ts` to enforce a **capability/route allowlist** keyed on
  the descriptor + a real agent app-role (`CollisionSpike.Agent`); destructive routes reject agent
  principals; agent writes get an explicit server-validated actor (name + SP `oid` + `autonomous:true`) via
  a **new `AUDIT_ACTION` family** (next codes from `100000049` in `api/src/lib/audit.ts`) — never a silent
  MI fallback.
- **Ships:** read-only MCP (Flow A). **New gate (off):** `MCP_SERVER_ENABLED`.
- **Phase 3b (later, separate rung) — autonomous MCP writes:** only after the agent-authz above is
  *implemented*, plus a **KeyVault-signed commit token** (MCP MI signs; replay defense via single-use
  `jti`/nonce; the **Data API** — not just MCP — verifies) + ETag optimistic concurrency; destructive ops
  excluded.

## Phase 4 — Vision family, its own program (gate: reconcile + benchmark + capacity + residency)

Tickets: TKT-064/088, TKT-016/017/018, TKT-015 case+vision consumers.

- **Reconcile the two image writers FIRST (precondition):** TKT-064's `orchestration/src/lib/image-classify.ts`
  already auto-writes `evidence.image_role_code`/`registration_visible` at intake (live, gate on), while
  `promoteAcceptedSuggestion`'s image branches (`api/src/functions/ai-suggestions.ts:189-210`) are dead.
  Pick **one** model (keep auto-write, *or* suggestion-gate it) — never both. **Unblock TKT-088** (the
  operator decision that determines which).
- **Capacity plan (hard gate):** model aggregate tokens across live assistant + wired classifier +
  email-AI + location-AI + WS5's per-image passes on the single 50K-TPM gpt-5. Lever: uksouth quota is
  50/1000 K TPM → raise capacity or stand up a vision-dedicated deployment, or a queue with backpressure.
  Add `ai_usage_ledger` (new numbered schema file + RLS/grants in `900_constraints.sql`, mirroring
  `160_ai_suggestion.sql`); enforce via **atomic `INSERT … ON CONFLICT (actor,day) DO UPDATE … RETURNING`**
  (best-effort, one-call overshoot accepted — not a hard ceiling).
- **Residency/DPIA (hard gate):** GlobalStandard gpt-5 may infer in any region; image bytes bypass
  `scrubPii`. Add an explicit image-egress residency item to `docs/gated.md`; DPIA + per-gate sign-off
  before any vision flip.
- **Then:** TKT-016 staged VLM producer, TKT-017 reg-OCR **benchmark** (a flip precondition), TKT-018
  total-loss (P3), TKT-015 real `callModelForSuggestions`. New per-consumer gates, default off.

## Critical files

- `api/src/functions/assistant.ts` (route, tools, refactor to registry read adapter)
- `api/src/lib/aoai-chat.ts` (tool-failure logging, retry, budget/observability hooks)
- `api/src/lib/auth.ts` (agent authz / `withCapability`), `api/src/lib/audit.ts` (agent action-code family)
- `packages/domain/src/capabilities/{registry,schemas}.ts` + `packages/domain/src/domain/vrm-canon.ts` (new)
- `packages/domain/src/gates.ts` (new gates), `packages/domain/src/contracts/case-status.ts` (why no set_case_status)
- `mockup-app/src/components/AssistantDrawer.tsx` + new `ConfirmActionCard.tsx`; `mockup-app/src/components/AppShell.tsx`
- `api/src/functions/search.ts` (new), `api/src/functions/mcp.ts` (new)
- `orchestration/src/lib/image-classify.ts` (reuse), `api/src/functions/ai-suggestions.ts` (reconcile + wire)
- Migration pattern: `migration/assets/schema/160_ai_suggestion.sql` + `900_constraints.sql`
- Reference MCP template (do not modify): `../../connectors/evaconnector`, `../../connectors/mcp-gateway`

## What we deliberately DON'T build this pass (and why)

- **Autonomous MCP writes** — no human; blocked until Data-API agent authz + coherent auth model +
  agent-SP program + KeyVault-signed-commit-token + ETag all exist. Read-only MCP first.
- **`set_case_status`** — contradicts the terminal-locked computed state machine; forced status is a
  human-only Superuser concern.
- **AI-driven byte upload** — invariant break + no AV; upload stays human-only if built at all.
- **Reviving the suggestion-gated image path** — until TKT-064 (live auto-write) vs suggestion is
  reconciled and TKT-088 unblocked.
- **Container App + ACR for MCP** — deferred until load justifies it post-PAYG.

## Operator asks (surface in `docs/gated.md`)

1. **A1 — PAYG upgrade FIRST** (~30-day Free-Trial kill blocks everything downstream).
2. Phase-1 flips: `ASSISTANT_TOOLSET_V2` then `GLOBAL_SEARCH_ENABLED` after soak.
3. Phase-3: create the MCP **Entra app-registration** (delegated scopes for Flow A; app-roles for Flow B);
   per-agent SP provisioning program (Flow B) — only one staff principal is assigned today.
4. Per-gate **E2/G5 sign-off + DPIA** for every write/vision/global-model flip; explicit **image-egress
   residency** item.
5. **TKT-088 unblock** (image-writer decision) before Phase 4.
6. `disableLocalAuth` flip (D6#5) is optional — MI-token path works regardless.

## Documentation deliverables

- **ADR-0023** MCP hosting + auth (Function-App-first trade-off; Flow A/B; Data-API-enforced agent roles).
- **ADR-0024** assistant write-tier / confirmation protocol (structured-diff card, ETag, destructive
  exclusion, in-app-vs-MCP asymmetry, admin-pool/RLS invariant).
- **ADR-0025** shared capability registry + zod schemas (env-free descriptors, no `set_case_status`,
  one VRM canonicalizer).
- `LIVE_FACTS.json` + mirror updates; new tickets (MCP read-only server; assistant write-tier; reconcile
  image-writers; `ai_usage_ledger`); per-ticket `changes.md`/`verification.md`; **BOARD.md reconciliation**
  (TKT-064 status fix is a Phase-1 precondition).

## Verification strategy

- **Offline (blocks each commit):** `node verify-all.mjs`, `scripts/check-tickets.mjs`,
  `scripts/check-doc-links.mjs`. Per-tool unit tests; `vrm-canon` pin test (three call-sites agree);
  regression pins on pre-refactor `execTool`; `aoai-chat` retry + `toolErrors` tests; card-diff +
  409-on-stale-version tests; ledger reject-at-cap; registry read/write/humanOnly invariants.
- **Live probes (per ticket verification.md proof classes):** spaced-VRM lookup (`YT13 UTV`) resolves;
  tool-failure App Insights trace; six-question read-tool matrix vs SPA screens; `/api/search` with/without
  token (JSON + 401) + same-VRM grouping; write tier propose→confirm→execute with a concurrent-edit 409;
  read-only invariant audit (deployed `TOOLS` execute no write).
- **MCP:** client smoke (Claude connects Flow A, lists + calls a read tool); negative/auth probes
  (foreign-app-reg token → 401 [C2]; agent-role token cannot reach any write/destructive route [C1]; agent
  read audit carries agent identity not MI [C6]); RLS staff-scoping proof.
- **Vision (Phase 4):** TKT-017 benchmark accuracy is itself a flip precondition; capacity soak under
  aggregate load; residency sign-off recorded in `gated.md`.

## Dependency ordering (each arrow is a hard gate; every gate defaults off; no flip automatic)

PAYG (A1) → **P1** doc-reconcile + VRM-canon + zod + read tools/search (flagged, soaked) → **P2** in-app
write tier dark (card + ETag) → **P3** read-only MCP on Function App + agent-authz *design* → *(P3b
autonomous writes, only after agent-authz impl + signed-commit-token + ETag)* → **P4** vision program
(TKT-064 reconcile + TKT-088 unblock + TKT-017 benchmark + capacity plan + residency sign-off).

## Build status (2026-07-07)

Phases 1–4 are **built dark and merged behind default-off gates** — nothing is flipped live. Branch
`feat/plan-001-ai-mcp-hardening`, commits `7bdcb94` (P1) · `754c38a` (P2) · `3f7ffc7` (P3) · `6208361`
(P4) · `18a9da4` (ADRs 0023/0024/0025). Offline gates green (only the pre-existing environmental parser
pytest fails). The operator flips for every new gate are registered in
[gated.md](../../gated.md) (§F — PLAN-001).

| Ticket | State | Gate (default off) |
|---|---|---|
| TKT-066 assistant lookup + observability | `verify` | `ASSISTANT_TOOLSET_V2` |
| TKT-069 six read tools | `verify` | `ASSISTANT_TOOLSET_V2` |
| TKT-067 New-chat | `verify` | (SPA-only, no gate) |
| TKT-072 global search | `verify` | `GLOBAL_SEARCH_ENABLED` |
| TKT-107 read-only archive assist | `verify` | (Box read already live) |
| TKT-111 assistant write tier | `verify` | `ASSISTANT_WRITE_TIER_ENABLED` (+ DPIA) |
| TKT-068 attach evidence | `verify` (LIVE-DEPLOYED 2026-07-08) | SPA attach UX built (`3f011fb`) + deployed; no model upload tool (TKT-060 intact); live 401 probe captured; upload E2E + render pending one operator/SPA action |
| TKT-110 read-only MCP server | `verify` | `MCP_SERVER_ENABLED` (+ MCP Entra app-reg) |
| TKT-113 AI usage ledger | `verify` | (schema apply + deploy) |
| TKT-064 image classifier | `done` (pre-existing, live) | — |
| TKT-060 read-only assistant | `done` (pre-existing, live) | — |
| TKT-088 image-role check · TKT-112 image-writer reconcile | `blocked` | operator decision |
| TKT-017 reg-OCR benchmark | `done` (2026-07-08) | research/bench deliverable; recommendation = local fast-alpr / DI Read, no VLM egress for reg |
| TKT-016 image-analysis producer | `verify` (LIVE 2026-07-08) | **`IMAGE_ANALYSIS_ENABLED=true`** on `cespk-api-dev` (DDL applied + flipped, readback-proven); additive/suggestion-only, offline-proven + live fail-closed (401); behavioral `{generated:N}` proof pending an authenticated call |
| TKT-015 generic model call | `verify` (LIVE 2026-07-08) | **`AI_ASSIST_ENABLED=true`** on `cespk-api-dev` (flipped, readback-proven); `callModelForSuggestions` live, offline-proven + live fail-closed; behavioral proof pending an operator/SPA Generate |
| TKT-018 total-loss (P3) | `backlog` | deferred |

**Vision-family GO-LIVE (2026-07-08, merged to `main a06d2dc`):** the Phase-4 vision family was built dark
(commits `ab06ee2` TKT-017 · `0dbe31f` TKT-016 · `4fc8580` TKT-015 · `3f011fb` TKT-068), then **taken LIVE on
operator instruction** with the operator's **DPIA + UK data-residency sign-off confirmed 2026-07-08**
([data-protection.md §6a](../../architecture/data-protection.md#6a-per-gate-production-sign-off--log)). Merged
to `main`; **DDL delta applied** (`SET ROLE csadmin`; audit code `100000052`); **api+orch+SPA redeployed**
(api 86 / orch 67 fns; SPA 200); **`AI_ASSIST_ENABLED` + `IMAGE_ANALYSIS_ENABLED` flipped `true`** on
`cespk-api-dev` (readback-proven). Live routes fail-closed (401 without a staff token). **What remains before
`done`:** the behavioral E2E (`{generated:N}` + pending rows; TKT-068 upload render) is one operator/SPA
Generate/attach action away (`az` can't mint an API-audience staff token) — so these stay `verify`. TKT-016 is
additive/suggestion-only — it does **not** touch the live TKT-064 auto-writer, so the `TKT-088`/`TKT-112`
image-writer reconciliation is still the (blocked) operator decision but is **not** forced by this go-live.
**Provisional:** PAYG (A1) still outstanding — the stack can disable at the trial boundary; gpt-5 is the shared
50K-TPM deployment (capacity watch-item).

The plan stays `active` until the vision family behavioral E2E is proven live (operator/SPA action) and the
deferred `blocked` items land.


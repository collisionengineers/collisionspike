# Deep code quality review — collisionspike (whole codebase)

**Scope:** Full-repo maintainability audit (not a PR diff). Branch: `main` clean.
**Lens:** Strict structural review — code judo, spaghetti growth, boundary cleanliness, file-size, wrong-layer logic. Behaviour correctness is assumed unless structure makes correctness hard to preserve.
**Date:** 2026-07-20

---

## Verdict

**Do not rubber-stamp this codebase as structurally healthy.**

It is a serious, domain-rich system with unusually strong governance (ADRs, pure `@cs/domain`, gate doctrine, parity guards, ticket discipline). Recent PLAN-007 work (`@cs/server-runtime`) is real leverage already landed. That is not the same as a clean architecture.

The system has **grown by additive special-case branches and parallel lanes** (intake triage stages, retro, outbox triples, dual SPA contracts, dual parser-EVA shapes). Much of that was ticketed deliberately under “suggest-first / dark gates / no behaviour change.” The maintainability bill is now due: **complexity is accumulating faster than it is being deleted.**

**Approval bar (code-review skill):** fails on several presumptive blockers if this were one PR:

| Bar | Status |
| --- | --- |
| No structural regression | N/A (baseline) — **debt is already structural** |
| No missed dramatic simplification | **Fail** — clear judo in intake + SPA contract + outbox |
| No unjustified 1k-line files | **Pass** on owned TS/TSX (largest ~790); **fail** on vendored parser Python |
| No spaghetti branching | **Fail** — `intakeOrchestrator` is the exhibit |
| No wrong-layer / dual-source drift | **Fail** — `DataAccess`/`DataAccessExt`, dual `ParserEvaFields` |
| Canonical helpers reused | **Partial** — server-runtime landed; PLAN-008 incomplete |

---

## Size map (owned production source, tests excluded)

| Area | Files | Lines |
| --- | ---: | ---: |
| `services/functions` (incl. vendored parser) | 129 | ~31k |
| `services/data-api/src` | 139 | ~29k |
| `apps/web/src` | 125 | ~25k |
| `services/orchestration/src` | 85 | ~15k |
| `packages/domain/src` | 37 | ~6.8k |
| `packages/server-runtime/src` | 8 | ~0.6k |

**Largest owned modules (non-test):**

| Lines | Path | Note |
| ---: | --- | --- |
| 2879 | `services/functions/parser/cedocumentmapper_v2/rules/engine.py` | Vendored; 1k+ rule applies with caveats |
| 1607 | `…/email_classifier.py` | Vendored |
| 791 | `orchestration/.../retro/retro-reconstruct.ts` | Near 1k; second intake universe |
| 783 | `functions/box-webhook/function_app.py` | Surface area |
| 772 | `packages/domain/src/dto/index.ts` | God DTO bag + `DataAccess` |
| 768 | `orchestration/.../intake/intakeOrchestrator.ts` | **Primary structural finding** |
| 758 | `apps/web/.../case-list.controller.tsx` | SPA controller bulk |
| 691 | `data-api/.../mcp-image-ingestion.ts` | Multi-role file |
| 660 | `apps/web/.../case-detail.controller.tsx` | Partially split; still heavy |
| ~11k | `data-api/src/features/cases/*` (50 src files) | **Feature bag, not a module** |

Feature density: `data-api/cases` alone is larger than all of orchestration intake + retro combined.

---

## What is already strong (do not “fix” away)

1. **Boundary story is real.** SPA → Data API → DB; orchestration does not own case authority; `@cs/domain` stays browser-safe; `@cs/server-runtime` is server-only (ADR-0031) with graph-enforced exclusion from the SPA.
2. **Domain purity is a genuine asset.** Status, triage policy, VRM, case-PO, readiness live in pure functions with parity tests — rare and valuable.
3. **Reliability primitives are intentional.** Status generation counters, outbox + acknowledge, fill-if-empty provenance, dark gates via `LIVE_FACTS` — not accidental complexity.
4. **Recent code judo already landed.** Managed-identity mint, Data-API HTTP core, focused-function client, status-recompute-core, durable-monitor lifecycle, case-detail view/controller split — evidence the team can delete duplication without behaviour change.
5. **Colocated tests and anti-drift guards** (`check:runtime-contract`, vendored-in-sync, code-table parity) reduce silent divergence risk.

A cleanup that flattens gates or merges domain into services would be a regression.

---

## Findings (priority order)

### F1 — BLOCKER: `intakeOrchestrator` is a branching history log, not a model

**Where:** `services/orchestration/src/workflows/intake/intakeOrchestrator.ts` (~768 lines, **~68 type casts**).

**What is wrong**

The durable intake generator is the system’s most important control flow. It has become a linear narrative of ticket appendices:

- Stage A classify → Stage B triage policy → early exits (`drop_duplicate`, `attach_case`)
- Additive Stage C LLM assist (always scheduled for a subset; gate inside activity)
- `route_images_unmatched` side effect
- Non-minting lane with reply-link + **duplicated** evidence pipeline + retro
- PDF-VRM side lane + second retro block (near-copy of reply retro)
- Minting lane continues below

The same post-attach pipeline appears at least twice (attach_case and linked reply):

`classifyPersist` → `extractImages` (try/catch log) → `boxArchiveEvidence` (try/catch log) → `statusEvaluate` → return shape

The same retro sub-orchestrator call is copy-pasted for reply vs non-reply with only small input differences. Inbound is threaded as `unknown` then recast dozens of times (`inbound as { candidateVrm?: string }`, etc.).

**Why this fails the review bar**

- Spaghetti growth of special-case branches into one already-busy flow
- Missed code judo: the model should be **decision → case disposition → evidence pipeline**, not N ticket-shaped `if`s
- Cast soup papers over a missing typed `InboundEnvelope` checkpoint contract
- Comment density (multi-paragraph ticket archaeology) substitutes for structure — readers hold ticket IDs instead of a state machine

**Code judo (preferred remedy)**

1. Introduce a **typed inbound envelope** produced by `fetchMessage` (or a pure normalizer activity) so the orchestrator never casts.
2. Extract `yield* attachEvidenceAndEvaluate(ctx, { caseId, inbound, … })` for the shared classifyPersist/extract/archive/status path.
3. Extract `yield* maybeRetro(ctx, decideRetroInput)` for the twin retro blocks.
4. Express routing as an explicit **disposition enum** (from `triage` + `classification` + reply eligibility) with a single switch/table — not nested historical ifs. Gates stay inside activities; the orchestrator only switches on checkpointed values.
5. Move ticket narratives to ADR/ticket docs; keep one-line “why this branch exists” comments.

**Do not** “just extract functions” while preserving the same nested narrative. Reframe so whole branches disappear into disposition + shared steps.

---

### F2 — BLOCKER: SPA contract dual-world (`DataAccess` + `DataAccessExt`)

**Where:**

- `packages/domain/src/dto/index.ts` — frozen `DataAccess` (~30 methods) + 770-line DTO dump
- `apps/web/src/data/rest-client.types.ts` — `DataAccessExt` additive seam
- Widespread `getDataAccess() as DataAccessExt` / `data as DataAccessExt` in controllers and panels

**What is wrong**

The “canonical” shared contract is a fiction the UI must cast past. Every new staff capability lands as:

1. optional method on domain `DataAccess`, or
2. only on `DataAccessExt`, plus
3. implementation on rest-client, fixture-source, empty-source

That is architecture drift institutionalized. Feature logic does not “leak into shared paths” — **the shared path is half-abandoned**.

**Code judo**

- Make **one** SPA-facing interface the truth (`DataAccess` versioned, or `StaffDataAccess` in domain / a thin `apps/web` contract package).
- Delete the Ext cast pattern: `getDataAccess(): StaffDataAccess`.
- Split `dto/index.ts` by capability (cases, inbound, dashboard, assistant, capture) so the god file stops absorbing every ticket’s types.
- Keep server DTOs that are pure types in domain; stop treating a 2010-style repository interface as the permanent product surface if REST resources already are the real contract.

---

### F3 — HIGH: data-api `features/cases` is a dumping ground (~11k lines, 50 modules)

**Where:** `services/data-api/src/features/cases/*` — capture, merge, MCP image ingest, status recompute, archive holding, dashboard, manual intake, evidence delete, inspection, queue actions, internal ops/resolution/maintenance…

**What is wrong**

“cases” is not a cohesive bounded context; it is **every HTTP surface that touches a case id**. Internal registration alone fans four `internal-*-routes` modules under cases plus archive/evidence/inbound siblings (~3.4k lines of internal routes). New work will keep landing here because the folder name invites it.

This is not one file over 1k — it is **worse**: a directory that crossed the complexity budget without a ownership boundary.

**Code judo**

Re-slice by **capability**, matching product language and existing subfolders that already want to exist:

| Capability | Candidates to move out of `cases/` |
| --- | --- |
| Capture | `capture-*.ts` |
| Merge / held | `merge-*`, `archive-holding*` |
| Status | `status-recompute*`, terminal transition |
| MCP image ingest | `mcp-image-ingestion*` (already self-contained) |
| Staff case CRUD/read | `read-edit-routes`, `create-routes`, search, queue |
| Maintenance / internal ops | the four `internal-*` case modules |

PLAN-008 step 3 (consolidate internal MSI surface) is the right *route* lever; this finding is the *module ownership* lever. Do both.

---

### F4 — HIGH: Outbox / monitor pattern still stamped 3× (known, unfinished judo)

**Where:**

- Data API: `mirror-outbox*`, `provider-outbox*`, `file-request-outbox*`
- Orchestration: `archive-mirror-monitor`, `provider-archive-monitor`, `box-maintenance-monitor` (+ classification split)
- Narrow adapters: `archive-mirror-api`, `provider-archive-api`, `box-maintenance-api`

**Progress already made:** `platform/durable-monitor.ts` shares client-side ensure/read for some monitors; adapters use `@cs/server-runtime` HTTP core.

**Remaining debt:** each lane still owns nearly identical list → process → acknowledge choreography. PLAN-008 step 4 explicitly targets generalising the drain. Until that lands, every reliability fix must be applied N times (drift risk the architecture-simplification series correctly called out).

**Remedy:** one drain registry + lane config (table, claim SQL, process activity, ack). **Behaviour-neutral only** — ADR-0030 generation semantics stay authoritative.

---

### F5 — HIGH: Dual `ParserEvaFields` shapes across the service boundary

**Where:**

- Orchestration: `workflows/intake/parser-eva-fields.ts` — **builds** required string fields + body supplements
- Data API: `features/inbound/parser-eva-fields.ts` — **validates/maps** optional fields to columns/provenance

Same name, different types, different ownership. Contract is implicit JSON over HTTP.

**Why it matters**

A field rename or source override (`sources`, `claimant_conflicts`) can desync without a shared schema. This is exactly the kind of dual definition the domain package exists to prevent.

**Code judo**

- Put the **wire shape** in `@cs/domain` (or `contracts/`) as the single type + zod/json schema if needed.
- Orchestration builds that type; Data API consumes and maps. Keep constraint-guard SQL mapping server-side if it must touch columns — but do not re-declare the payload type.

---

### F6 — MEDIUM-HIGH: Retro is a second intake system (~3.1k lines)

**Where:** `services/orchestration/src/workflows/retro/*` especially `retro-reconstruct.ts` (791 lines).

Retro is justified by ADR-0022 and deliberately additive. Structurally it is still a **parallel universe** of parse/match/provider recovery/box, with twin call sites from intake.

**Risk:** every intake reliability improvement must be consciously mirrored, or retro drifts into a second-class buggy path.

**Remedy (incremental, not a rewrite)**

- Shared pure “keys + disposition” already partly in domain (`decideRetro`) — good.
- Push more shared steps (evidence attach, archive, status evaluate) through the **same helpers** F1 introduces.
- Cap growth: new retro features must extend shared primitives or get a ticket that explicitly shrinks duplication.

---

### F7 — MEDIUM: Web case surfaces still controller-heavy

**Where:** `case-detail.controller.tsx` (~660), `case-list.controller.tsx` (~758), `manual-intake.controller.tsx` (~618), `ConfirmActionCard.tsx` (~665).

Partial MVC-ish splits exist (view/styles/types/workspace). Controllers still accumulate:

- label maps
- readiness deep-link mapping
- toast/error policy
- multi-hook orchestration
- duplicated file headers (case-detail has **double** banner comments / DataAccessExt import notes — hygiene smell)

**Remedy:** continue extraction toward pure session modules (already started with `case-edit-session.ts`, `evidence-review.ts`) and presentational props. Prefer **deleting** controller state when the server already owns truth (If-Match edit sessions are the right pattern — lean harder into them).

---

### F8 — MEDIUM: `functions-client` vs `service-client` — half-finished consolidation

**Progress:** both call `focusedFnRequest` from `@cs/server-runtime/focused-function-client` (TKT-262). Error contracts correctly remain service-specific (body retained vs status-only).

**Remaining:** two façades, overlapping route wrappers (parser/OCR), dual env naming, dual mental models. PLAN-008 step 2 not fully closed.

**Remedy:** one module exporting named operations; error-policy injected once per service entrypoint — not two parallel client files forever.

---

### F9 — MEDIUM: Comment archaeology and duplicate headers as cognitive load

Widespread multi-page module docs restating ticket IDs and ADRs inside generators (especially intake/retro). Some files have copy-pasted banner blocks twice (`case-detail.controller.tsx`, `rest-client.ts`).

**This is not “documentation quality.”** It is a symptom that **structure is insufficient**, so prose is carrying invariants.

**Remedy:** one-line purpose + link to ADR; delete duplicate banners; put ticket narratives only in tickets.

---

### F10 — ACCEPTED DEBT (manage, don’t pretend it’s fine): vendored parser megamodules

`engine.py` (~2.9k) and `email_classifier.py` (~1.6k) violate the 1k-line smell hard. Vendor-lock + drift guards make this a **deliberate** constraint (ADR-0018). Cross-language re-expression of VRM/case-type/EVA rules is mitigated by parity tests — incomplete coverage remains a drift surface (PLAN-011 direction).

**Do not** start an in-repo rewrite of the vendor engine as “code quality cleanup.” **Do** keep parity tests expanding when TS domain rules change.

---

## Cross-cutting themes

### Spaghetti vs deliberate complexity

| Kind | Examples | Stance |
| --- | --- | --- |
| Deliberate product complexity | Triage stages, dark gates, generation counters, fill-if-empty | Keep; document in ADRs |
| Incidental structural complexity | Cast-heavy orchestrator, dual SPA contract, triple outbox, cases bag | **Delete with judo** |
| Historical complexity | Ticket-comment essays, Ext casts, twin retro call sites | Refactor when touching |

### Type / boundary hygiene

- Orchestration intake: `unknown` + casts instead of envelope types
- SPA: `as DataAccessExt` instead of one interface
- Parser EVA: dual interfaces
- Server-runtime: good error-neutral cores — keep that pattern; do not invent magic generic “do everything” clients that hide contracts

### File size

No production TS file currently blows past 1k (good). **Directory-level** and **control-flow** complexity are the real bombs. Treat ~700-line orchestrators with 60+ casts as **past the health line** even under 1k.

---

## Recommended work sequence (net-negative structure)

Align with existing architecture-simplification / PLAN-007–011; **do not open a parallel mega-refactor.** Prefer ticketed, behaviour-neutral slices:

| Priority | Move | Deletes / simplifies | Gate |
| ---: | --- | --- | --- |
| 1 | **Intake disposition + shared evidence/retro helpers** (F1) | Casts, twin pipelines, twin retro | Durable replay tests + intake fixtures |
| 2 | **Single SPA data contract** (F2) | All `as DataAccessExt` | Web typecheck + fixture parity |
| 3 | **Shared ParserEvaFields wire type** (F5) | Dual interfaces | Runtime contract / unit tests |
| 4 | **Outbox drain generalisation** (F4 / PLAN-008) | 2 of 3 near-copies | ADR-0030 + monitor tests |
| 5 | **cases/ capability re-home** (F3) | Import maze | register + runtime-contract |
| 6 | **Finish focused-fn façade** (F8) | One client file | Existing fn client tests |
| 7 | Continuous: controller extraction + comment diet (F7, F9) | LOC without behaviour | UI tests |

Avoid big-bang “rewrite intake as X framework.” Prefer **delete duplication first**.

---

## What not to do

- Do not merge `@cs/domain` and `@cs/server-runtime`.
- Do not treat dark/gated lanes as dead code to remove.
- Do not “simplify” by inlining domain rules into services or the SPA.
- Do not refactor CarClaims or live cloud state under a code-quality banner.
- Do not rewrite vendored `cedocumentmapper_v2` in-tree for style.
- Do not mint wrappers that only re-export without deleting a caller.

---

## Sampling method (audit trail)

- Owned source line census (excluding venv/node_modules/tests)
- Architecture docs + ADR-0031; `workingspace/architecture-simplification/*` (non-binding but high-signal)
- Deep read: intake orchestrator, data-api cases/status-recompute, server-runtime, both fn clients, domain dto/DataAccess, web rest-client/case-detail
- Parallel-name search (triage, outlook-link, parser-eva, archive-holding, status-recompute)
- Cast density on hottest files

---

## Bottom line

This codebase **earns** its domain and reliability complexity. It **does not earn** the incidental complexity of:

1. a cast-heavy intake generator that reimplements the same attach pipeline and retro block,
2. a dual SPA data contract,
3. a cases feature bag that absorbs every new capability,
4. unfinished multi-copy outbox/fn-client consolidation after the server-runtime foundation already proved the pattern.

The ambitious path is not “more abstractions.” It is **fewer concepts**: one disposition, one evidence attach path, one staff data interface, one wire type per payload, one outbox drain, capability-sliced modules.

**Reviewer stance:** push hard for those deletions on every future PR that touches intake, SPA data access, or outbox lanes. Working code that enlarges those structural debts should not merge without a judo plan.

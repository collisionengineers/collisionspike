# 03 — Target architecture (end state)

The Azure topology after cutover. Everything lives in the **existing `rg-collisionspike-dev`, UK South**
— in the **same Free Trial subscription** that already holds the 6 Functions (Q1 in
[`02`](./02-decisions-and-open-questions.md) is settled: provision in-place, no second sub; the one Free
Static Web App control-plane region is `westeurope`).

## Topology

```
                         Entra ID (workforce tenant) ── MSAL sign-in
                                   │ id/access token
                                   ▼
  staff ──HTTPS──> Azure Static Web Apps (Free)         [SPA: the preserved React app]
                         │  fetch + Bearer token
                         ▼
                   Data API Function App (Flex Consumption, TS/Node)  [NEW — the BFF]
                         │  validates JWT · owns status-machine / dedup / audit
                         ├──────────────► Azure DB for PostgreSQL Flexible Server B1ms  [system of record]
                         │                     ▲  (RLS by app role)
                         │                     │
   shared mailbox        │                     │
   (Outlook/M365)        │                     │
        │ Graph delta-poll (Exchange RBAC)     │
        ▼                                       │
  Orchestration Function App (Flex, TS/Node)    │            [NEW — Durable + delta-poll]
        │  timer delta-poll ─> Storage Queue ─> Durable orchestrator
        │  (push subscription + renewal + lifecycle = optional upgrade — see 22 §A)
        │  orchestrator activities call ───────┤ (the Data API for all DB writes)
        │                                       │
        ▼  calls (function key / managed identity)
  Existing Functions [UNCHANGED]: parser · enrichment(DVSA/DVLA) · evavalidation · evasentry(gated)
                                   · box-webhook(gated) · location-suggest · ocr(ACA)
        │
        ▼
  External [UNCHANGED]: EVA Sentry · Box · DVSA/DVLA · Azure Vision/Maps · postcode.io
                                   │
  Key Vault (cespkenrichkvgi62sd populated; eva/box vaults gated)  ◄── KV references / MI
  App Insights + Log Analytics (shared)   Blob cespkevidstdev01 (evidence bytes)   ACR (ocr image)
```

## Component contracts

| Component | Responsibility | Talks to | Auth |
|---|---|---|---|
| **SPA** `cespk-spa-dev` (Static Web Apps, Free) | Render the app; no business logic; no secrets in the bundle | Data API | MSAL → Entra; sends Bearer token |
| **Data API** `cespk-api-dev` (Function App, BFF) | The `DataAccess` contract (~29 methods); status state-machine; dedup; audit writes; gate reads | Postgres; (read) the existing Functions where needed | Validates Entra JWT; app-role authz |
| **Orchestration** `cespk-orch-dev` (Function App) | Graph **delta-poll** of Exchange-RBAC-scoped mailboxes (push subscription + renewal + lifecycle retained as an optional upgrade, [`22` §A](./22-orchestration-migration.md)); queue; Durable intake pipeline; chasers; EVA/Box (gated) | Data API (all DB writes); parser/enrichment/eva/box Functions | **No Entra Graph permission** — authorised by **Exchange RBAC for Applications** (resource-scoped mailbox roles, **no Global Admin**); function keys / MI to call Functions |
| **Postgres B1ms** `cespk-pg-dev` (DB `collisionspike`) | System of record; 12 tables; choiceset lookup tables; FKs + 4 cascade; `UNIQUE(sourcemessageid)`; RLS | — | Entra or password auth from the two Function Apps only |
| **Existing 6 Functions** | Unchanged — parse, enrich, validate, EVA submit (gated), Box (gated), location-suggest; + OCR ACA | External APIs; KV | Function key / MI |

## Invariants carried over from the Power Platform build

- **Dataverse was authoritative → Postgres is authoritative.** No component treats Box or any
  external store as the source of truth.
- **No secret reaches the browser.** The SPA holds only an Entra token; every credential stays in
  the API/orchestration apps + Key Vault (the old CSP `connect-src 'none'` intent, preserved as a
  server-side boundary).
- **Feature gates still gate.** The 28 env-vars (20 Boolean `*_ENABLED` gates + 6 String config + 2
  Secret) survive as app-settings the API + orchestration read (see [`10`](./10-settings-migration.md));
  `HOLD_NEW_CASES_BY_DEFAULT` is the one runtime-writable gate (DB-backed); `BOX_*` stay off through migration.
- **EVA integer codes are sacred.** Choiceset→enum migration preserves them (R4).
- **Dedup is reference-disambiguated + human-confirmed** (ADR-0010) — enforced by the API logic plus
  the Postgres `UNIQUE(sourcemessageid)` backstop, not a time window.

## What is NEW vs what moved

- **New build:** the Data API (BFF), the Graph **delta-poll** intake over Exchange-RBAC-scoped mailboxes
  (push subscription + webhook receiver + renewal kept as an optional upgrade), the Durable
  orchestrations, the Postgres schema + RLS, the MSAL wiring.
- **Moved/rewired:** the React data seam (→ REST client), the 28 gates (→ app-settings), KV refs
  (repointed), the corpus (reseeded).
- **Untouched:** the 6 Functions, the vendored parser engine, ~11.5k LOC of the React app, all
  external integrations, Blob/ACR/observability.

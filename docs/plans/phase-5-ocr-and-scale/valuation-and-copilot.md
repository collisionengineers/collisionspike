# Valuation enrichment + Copilot Studio assistant (ROADMAP 5c, M2/M3+)

> **Status:** planning / decision document. Read-only research (Microsoft Learn MCP). No code, infra,
> flows, or Dataverse changed. Deep dive behind **ROADMAP §5c "Valuation & Copilot (M2 / M3+)"** — the two
> checkboxes: **(1)** staff-triggered valuation (`valuationbot`, gated `VALUATION_ENABLED`) with a
> Companion-Report PDF attached as Evidence; **(2)** a Copilot Studio agent over Dataverse (gated
> `COPILOT_ENABLED`). Pairs with [phase-2-implementation.md](../m2-umbrella-enrichment-to-scale.md) §10/§11 (M2.G),
> ADR-0006 (REST-wrapper pattern), ADR-0008 (tool boundary ends at the EVA handoff),
> [docs/architecture/integrations.md](../../../docs/architecture/integrations.md),
> [docs/architecture/microsoft-stack.md](../../../docs/architecture/microsoft-stack.md) §9. Author date
> **2026-06-18**. Facts cited inline; verified-live facts from GROUND TRUTH + live-environment.md.

---

## 0. TL;DR decision

**Two independent, lowest-priority, both-gated-OFF features — neither on the M1 critical path, both
following patterns the repo already runs.**

1. **Valuation:** **a thin direct-REST-wrapper Azure Function** (the *exact* ADR-0006 pattern the DVSA
   enrichment Function uses now the Cloud Run gateway is retired) that, **on staff demand only**
   (total-loss / disputed), fetches comparable-advert evidence and returns a **Companion Report PDF**,
   which the flow attaches as **`Evidence(kind=valuation)`** (the kind already exists in the schema). It
   is **staff-triggered, not automatic** (ADR-0008: the tool's job ends at the EVA handoff; valuation is
   an *evidence-gathering aid*, never an auto-submitted figure), and gated by **`VALUATION_ENABLED`
   (default false)** + a new **`VALUATION_API_BASE`** string. `valuationbot`/the OAuth gateway are
   **prior-art** (repo-constellation.md); M2 may reuse direct Entra auth, mirroring DVSA.

2. **Copilot Studio assistant:** **an optional Copilot Studio agent grounded on Dataverse tables as a
   knowledge source** for staff Q&A / guided intake over the Case corpus — **not** in the automated
   pipeline. Gated **`COPILOT_ENABLED` (default false)**. Microsoft Learn pins the two hard prerequisites:
   **Dataverse search must be ON** in the environment, and the agent's auth must be **"Authenticate with
   Microsoft"** (Entra) — *No authentication* and *Authenticate manually* are **not supported** for
   Dataverse knowledge ([Add Dataverse tables as a knowledge source](https://learn.microsoft.com/microsoft-copilot-studio/knowledge-add-dataverse)).
   Billing is **Copilot-Credit metered** (a generative message = ~2 credits; $200/mo = 25,000 credits or
   PAYG $0.01/credit — microsoft-stack.md §9, [billing-licensing](https://learn.microsoft.com/microsoft-copilot-studio/billing-licensing)),
   so it is a **deliberate inclusion decision**, not a free add-on.

**Both honour ADR-0008:** they assist staff; they do **not** extend the tool past the EVA/Box handoff and
they never auto-decide. Both are **M2/M3+**; M1 ships without either.

---

## 1. Boundary legend

| Tag | Meaning | Who |
|---|---|---|
| **[BUILD]** | Authored + verified **offline** (valuation Function code, Bicep, OpenAPI, pytest with the upstream mocked; the Copilot agent's *design* + table list + descriptions). Zero tenant/Azure/upstream contact. | Claude |
| **[DEPLOY-WITH-LOGIN]** | Deploy the valuation Function, import its connector, set `VALUATION_API_BASE`; **author the Copilot agent in Copilot Studio**, add Dataverse knowledge, turn on Dataverse search; read-only GETs. No secret values; no prod gate flip. | Operator (Claude may draft steps + run read-only GETs) |
| **[RESERVED-FOR-USER]** | Inject the valuation upstream creds into Key Vault, bind the connection, **flip `VALUATION_ENABLED` / `COPILOT_ENABLED` true**, **publish** the Copilot agent to a channel, run live valuations / live agent chats over real data. | **Operator only** |

**CSP (AGENTS.md truth #1):** the Code App reaches the valuation Function **only via the
`cr1bd_valuation` connector** (or a flow, server-side). The Copilot agent is a Copilot Studio resource,
not a Code App `fetch`. **Flow-webhook (truth #2):** the valuation flow is `Request`/child-triggered
(staff action) — not a connection-webhook trigger — so no designer re-publish dance.

---

## 2. Valuation — what it is and is not (ADR-0008 discipline)

| | Valuation in §5c |
|---|---|
| **Trigger** | **Staff, on demand** — total-loss or disputed-value cases only (intake-workflow.md "Valuationbot integration — potential; comparable-advert valuation + evidence PDF"). **Never** part of the automatic intake→EVA pipeline. |
| **Job** | Fetch **comparable adverts** + **capture advert pages**, produce a **Companion Report PDF** as *evidence*. The figure is an **input to the human engineer**, not an EVA field and not an auto-decision (ADR-0008: tool boundary ends at the EVA handoff). |
| **Where it lands** | `Evidence(kind=valuation)` on the Case — bytes in the **File column / Blob** via `storagePath`, **never inlined** (the graph-intake invariant; `evidence.json` description). An `AuditEvent` records `valuation_called`. |
| **Gate** | `VALUATION_ENABLED` (exists, default **false**) + new `VALUATION_API_BASE` (string, per-env, like `ENRICHMENT_API_BASE`). Per-provider toggles (`cr1bd_enrichmentallowed`) are modelled-deferred. |
| **Not** | Not auto-run, not an EVA payload field, not a pricing oracle, not in M1. |

---

## 3. Valuation — the build (mirror the DVSA enrichment Function exactly)

ADR-0006's chosen pattern, already live for DVSA/DVLA: **thin Azure Function → Power Platform custom
connector → Dataverse env-var gate, direct Entra auth, secrets as Key Vault refs.** Valuation reuses it
verbatim.

| Artifact | Shape | Notes |
|---|---|---|
| `functions/valuation/function_app.py` | `POST /api/valuation/companion-report` body `{ vrm, make?, model?, mileage?, derivative? }` → `{ valuationLow, valuationHigh, comparables:[…], reportPdfBase64, transport:"valuation_rest", warnings:[] }`. Function-key auth; **gate-at-edge** re-check of `VALUATION_ENABLED` (defence in depth, like evasentry). | Returns the PDF as base-64 for the flow to persist to Blob as `Evidence(kind=valuation)`. |
| `functions/valuation/valuation_client.py` | Upstream call (comparables + page capture). **Auth:** direct Entra `client_credentials` if the chosen upstream supports it (mirrors `functions/enrichment/dvsa_client.py`); otherwise an API-key, **Key Vault reference** only. 401 → refresh once → retry. **No secret literal anywhere.** | The OAuth gateway / `valuationbot` MCP is **prior-art fallback** (repo-constellation.md), not the M2 path unless the upstream forces it. |
| `functions/valuation/infra/main.bicep` | Flex Consumption Function + Storage + App Insights + Key Vault + system-assigned MI (`Key Vault Secrets User`). Mirror `functions/enrichment/infra/main.bicep`. | No secret literals; KV refs. |
| `functions/valuation/openapi/valuation-connector.json` | OpenAPI 2.0, one op `CompanionReport`, `x-functions-key`, **no OAuth**. → `cr1bd_valuation`. | Imported like enrichment. |
| `flows/definitions/valuation.definition.json` (new) | Staff-triggered child flow: read `VALUATION_ENABLED`; call `cr1bd_valuation/CompanionReport`; on success **upload the PDF to Blob** + create `Evidence(kind=valuation)` + `AuditEvent valuation_called`; on gate-off or soft-fail, write a skipped audit and change nothing. | Imported **`state=off`** like every other flow. |

**Soft-fail like enrichment:** a malformed request → `400`; an upstream/auth failure → `200` with
`warnings` (advisory), so the staff action never hard-errors — the engineer just doesn't get a report.

---

## 4. Copilot Studio assistant — what it is and is not

| | Copilot in §5c |
|---|---|
| **What** | A **Collision Engineers staff assistant** in Copilot Studio, grounded on **Dataverse tables as a knowledge source** (Case, WorkProvider, Repairer, AuditEvent, …) for Q&A ("what's the status of CCPY26050?", "which repairers serve QCL?") and guided intake help. (microsoft-stack.md §9.) |
| **What it is NOT** | **Not** in the automated intake→EVA pipeline; **not** an approver; **not** an EVA/Box actor (ADR-0008). It reads/answers; it does not submit. A **deliberate, optional** inclusion (microsoft-stack.md open question 4: "confirm it's wanted for the spike vs deferred"). |
| **Knowledge model** | Dataverse knowledge source: **up to 15 tables per source** (classic mode 2 sources × 15 tables; generative mode unlimited tables). Add **synonyms + glossary** to lift answer quality ([knowledge-add-dataverse](https://learn.microsoft.com/microsoft-copilot-studio/knowledge-add-dataverse)). |
| **Hard prerequisites** | **(a)** **Dataverse search ON** for the environment (else tables can't be added — [configure Dataverse search](https://learn.microsoft.com/power-platform/admin/configure-relevance-search-organization)); **(b)** agent auth = **"Authenticate with Microsoft"** (Entra) — *No auth* / *Manual* are **unsupported** for Dataverse knowledge. With Entra user auth, the agent only surfaces rows the **asking user** can see (row-level security respected). |
| **Gate** | `COPILOT_ENABLED` (exists, default **false**). The Code App may surface the agent (embed/link) only when true. |
| **Billing** | Copilot-Credit metered: $200/mo = 25,000 credits **or** PAYG $0.01/credit; a generative answer ≈ 2 credits; light staff use ≈ $0–30/mo (microsoft-stack.md §9). **An inclusion = a spend decision.** |

---

## 5. Copilot Studio assistant — the build

Copilot Studio agents are **authored in the Copilot Studio maker portal**, not in this repo's code — so
§5c's Claude-buildable part is the **design**, and the operator's part is the **authoring + activation**.

**[BUILD] (offline — design artifacts in `docs/` or the plan, no tenant):**
- The **table list** (which Dataverse tables are knowledge: Case, WorkProvider, Repairer, ImageSource,
  InspectionAddress, AuditEvent — pick the ≤15 most query-worthy), each with a **clear description** (it
  drives generative orchestration) + **synonyms/glossary** (e.g. "principal" = WorkProvider, "yard" =
  Repairer, "VRM"/"reg" = registration) so the agent speaks CE's language.
- The **answer-scope rules** (read-only; no actions that mutate Dataverse or call EVA/Box — ADR-0008),
  the **auth choice** (Authenticate with Microsoft), and a **test-question set** for verification.

**[DEPLOY-WITH-LOGIN] (operator, in Copilot Studio):**
- Create the agent in the **`Collision Engineers - Dev`** environment; **turn on Dataverse search**; add
  the Dataverse knowledge source with the §5-designed tables + synonyms/glossary; set auth =
  **Authenticate with Microsoft**; keep it **unpublished** while testing.

**[RESERVED-FOR-USER]:**
- **Flip `COPILOT_ENABLED=true`**; **publish** the agent to a channel (Teams / the Code App embed); run
  live staff chats over real Cases. (Publishing + live data = the live-services boundary.)

> **Optional (later):** the Dataverse **MCP server** in Copilot Studio (natural-language "show me the
> tables", "how many open Cases") is an alternative/addition to the knowledge-source approach
> ([Dataverse MCP in Copilot Studio](https://learn.microsoft.com/power-apps/maker/data-platform/data-platform-mcp-copilot-studio)).
> Note it as an M3 enhancement; the knowledge-source path is the simpler M2 default.

---

## 6. Dependency + priority

- **Both are independent and lowest-priority** (phase-2 §3 graph: M2.G valuation + the Copilot item run
  parallel to everything, after the EVA/Box spine). Neither blocks, nor is blocked by, EVA REST,
  enrichment, address-matching, or image AI.
- **Valuation** needs a Case with a VRM + (ideally) make/model — i.e. post-parse/enrich. **Copilot** needs
  the Dataverse corpus populated (more useful after Phase-1b incorporation) + Dataverse search on.
- **Recommended order:** ship valuation first (it's the DVSA pattern again, fully Claude-buildable code),
  Copilot last (an optional, credit-metered, operator-authored convenience pending the inclusion
  decision).

---

## 7. Verification

**Valuation — offline (Claude):**
- `cd functions/valuation && python -m pytest -q` — green: malformed body → 400 (no upstream call);
  gate-at-edge no-op when `VALUATION_ENABLED=false`; upstream 401 → refresh once → retry; **no
  secret/PDF-bytes in logs**; the response carries a base-64 PDF + comparables.
- `az bicep build functions/valuation/infra/main.bicep` → no errors; no secret literals.
- `node -e "require('./functions/valuation/openapi/valuation-connector.json')"` → `swagger:2.0`,
  function-key, no OAuth.
- `node flows/validate-flows.mjs` includes `valuation.definition.json`; it is **`state=off`**.

**Valuation — live (operator; Claude read-only GETs):**
- Staff-trigger a valuation on a real total-loss Case → `Evidence(kind=valuation)` with the Companion PDF
  in Blob (via `storagePath`, **not** inlined), `valuation_called` audit. With `VALUATION_ENABLED=false`,
  the action writes a skipped audit and **no** Evidence.
- Auth boundary: Function without key → 401; bad body → 400; valid + gate-off → 200 + warning.

**Copilot — design + live (operator):**
- Offline: the table list + descriptions + synonyms/glossary review against the schema (no invented
  tables; ≤15 per source).
- Live: with Dataverse search ON + Entra auth, the test-question set returns grounded answers citing real
  Cases; **row-level security** verified (a user sees only their permitted rows). With `COPILOT_ENABLED=false`,
  the Code App does **not** surface the agent.

---

## 8. Open questions / uncertainties

1. **Valuation upstream choice + auth.** `valuationbot`/the MCP gateway are **prior-art**; the real M2
   upstream (and whether it supports direct Entra `client_credentials` like DVSA, or only an API key) is
   **unconfirmed**. **Verify** before building `valuation_client.py`; default to the simplest auth the
   upstream supports, secrets as KV refs only.
2. **Companion Report format ownership.** Does the upstream return a finished PDF, or must CE **render**
   one from comparables (e.g. a templated report)? If the latter, add a render step (the
   `collision-engineers-design` skill owns the A4 letterhead/report layout) — a larger build than a thin
   wrapper. **Confirm** with the product owner.
3. **Copilot inclusion is an open product decision** (microsoft-stack.md Q4) — confirm it's wanted for the
   spike vs deferred, given the **Copilot-Credit** spend. If deferred, §5c ships valuation only and leaves
   `COPILOT_ENABLED` off.
4. **Which Dataverse tables + how many** as Copilot knowledge — ≤15/source forces a curation choice;
   confirm the staff query patterns to pick the right set (likely Case + WorkProvider + Repairer +
   AuditEvent first).
5. **Pricing not pinned.** Valuation upstream cost + Copilot credit burn at real staff volume are
   unmodelled here on purpose; capture both in Cost Management once live and feed back the inclusion call.
6. **ADR-0008 guard.** Keep both strictly assistive — no Copilot *action* that submits to EVA/Box or
   mutates a governed corpus row; no valuation auto-write to an EVA field. Re-affirm in review.

---

## 9. Decision summary (one line)

**Valuation is a staff-triggered, `VALUATION_ENABLED`-gated thin direct-REST-wrapper Azure Function
(the DVSA/ADR-0006 pattern reused) that attaches a Companion-Report PDF as `Evidence(kind=valuation)` in
Blob — an evidence aid for the human engineer, never an auto-decision (ADR-0008); the Copilot Studio
agent is an optional, `COPILOT_ENABLED`-gated, Copilot-Credit-metered staff assistant grounded on ≤15
Dataverse tables (requires Dataverse search ON + Entra "Authenticate with Microsoft") for read-only Q&A,
not a pipeline actor. Both are M2/M3+, both ship gated-OFF, neither is on the M1 path, and the only real
unknowns (valuation upstream + Copilot inclusion) are flagged for operator confirmation.**

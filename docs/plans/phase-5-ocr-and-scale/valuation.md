# Valuation enrichment (ROADMAP 5c, M3)

> **Status:** planning / decision document. Read-only research (Microsoft Learn MCP). No code, infra,
> flows, or Dataverse changed. Deep dive behind **ROADMAP §5c "Valuation (M3)"** — staff-triggered
> valuation (`valuationbot`, gated `VALUATION_ENABLED`) with a Companion-Report PDF attached as Evidence.
> Pairs with [m2-umbrella-enrichment-to-scale.md](../m2-umbrella-enrichment-to-scale.md) §10/§11 (M2.G),
> ADR-0006 (REST-wrapper pattern), ADR-0008 (tool boundary ends at the EVA handoff),
> [docs/architecture/integrations.md](../../../docs/architecture/integrations.md). Author date
> **2026-06-18**. Facts cited inline; verified-live facts from GROUND TRUTH + live-environment.md.

---

## 0. TL;DR decision

**A single, lowest-priority, gated-OFF feature — not on the M1 critical path, following a pattern the
repo already runs.**

1. **Valuation:** **a thin direct-REST-wrapper Azure Function** (the *exact* ADR-0006 pattern the DVSA
   enrichment Function uses now the Cloud Run gateway is retired) that, **on staff demand only**
   (total-loss / disputed), fetches comparable-advert evidence and returns a **Companion Report PDF**,
   which the flow attaches as **`Evidence(kind=valuation)`** (the kind already exists in the schema). It
   is **staff-triggered, not automatic** (ADR-0008: the tool's job ends at the EVA handoff; valuation is
   an *evidence-gathering aid*, never an auto-submitted figure), and gated by **`VALUATION_ENABLED`
   (default false)** + a new **`VALUATION_API_BASE`** string. `valuationbot`/the OAuth gateway are
   **prior-art** (repo-constellation.md); M2 may reuse direct Entra auth, mirroring DVSA.

**This honours ADR-0008:** it assists staff; it does **not** extend the tool past the EVA/Box handoff and
it never auto-decides. It is **M2/M3+**; M1 ships without it.

---

## 1. Boundary legend

| Tag | Meaning | Who |
|---|---|---|
| **[BUILD]** | Authored + verified **offline** (valuation Function code, Bicep, OpenAPI, pytest with the upstream mocked). Zero tenant/Azure/upstream contact. | Claude |
| **[DEPLOY-WITH-LOGIN]** | Deploy the valuation Function, import its connector, set `VALUATION_API_BASE`; read-only GETs. No secret values; no prod gate flip. | Operator (Claude may draft steps + run read-only GETs) |
| **[RESERVED-FOR-USER]** | Inject the valuation upstream creds into Key Vault, bind the connection, **flip `VALUATION_ENABLED` true**, run live valuations over real data. | **Operator only** |

**CSP (AGENTS.md truth #1):** the Code App reaches the valuation Function **only via the
`cr1bd_valuation` connector** (or a flow, server-side). **Flow-webhook (truth #2):** the valuation flow
is `Request`/child-triggered (staff action) — not a connection-webhook trigger — so no designer
re-publish dance.

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

## 4. Dependency + priority

- **Valuation is lowest-priority** (phase-2 §3 graph: M2.G valuation runs parallel to everything, after
  the EVA/Box spine). It neither blocks, nor is blocked by, EVA REST, enrichment, address-matching, or
  image AI.
- **Valuation** needs a Case with a VRM + (ideally) make/model — i.e. post-parse/enrich.

---

## 5. Verification

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

---

## 6. Open questions / uncertainties

1. **Valuation upstream choice + auth.** `valuationbot`/the MCP gateway are **prior-art**; the real M2
   upstream (and whether it supports direct Entra `client_credentials` like DVSA, or only an API key) is
   **unconfirmed**. **Verify** before building `valuation_client.py`; default to the simplest auth the
   upstream supports, secrets as KV refs only.
2. **Companion Report format ownership.** Does the upstream return a finished PDF, or must CE **render**
   one from comparables (e.g. a templated report)? If the latter, add a render step (the
   `collision-engineers-design` skill owns the A4 letterhead/report layout) — a larger build than a thin
   wrapper. **Confirm** with the product owner.
3. **Pricing not pinned.** Valuation upstream cost at real staff volume is unmodelled here on purpose;
   capture it in Cost Management once live.
4. **ADR-0008 guard.** Keep valuation strictly assistive — no auto-write to an EVA field. Re-affirm in
   review.

---

## 7. Decision summary (one line)

**Valuation is a staff-triggered, `VALUATION_ENABLED`-gated thin direct-REST-wrapper Azure Function
(the DVSA/ADR-0006 pattern reused) that attaches a Companion-Report PDF as `Evidence(kind=valuation)` in
Blob — an evidence aid for the human engineer, never an auto-decision (ADR-0008). It is M2/M3+, ships
gated-OFF, is not on the M1 path, and the only real unknown (the valuation upstream) is flagged for
operator confirmation.**

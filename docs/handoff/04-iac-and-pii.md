# 04 — IaC config-capture layer + PII pre-scrub helper

_Author: **iac-capturer** (board task #5) · Date: **2026-06-28** · Mode: **authoring only — NO live Azure mutation, nothing committed/deployed**_
_Scope: `rg-collisionspike-dev` (uksouth), sub `e6076573-23a5-46a8-acef-7e22d264e5db`._

**TL;DR.** Two independent deliverables, both done and verified locally:
- **(A) IaC config-capture** of the live, hand-applied Azure config → `infra/config-capture/`
  (3 bicep + README). Captures app-settings, MI RBAC, gates, and KV-reference wiring as reviewable
  IaC — **secrets as Key-Vault references / names only, never literal values**. All three `az bicep build`
  clean (zero warnings). **No deploy / no what-if** was run against live (capture task).
- **(B) PII pre-scrub helper** → `packages/domain/src/domain/pii-scrub.ts` (+ test). A pure,
  framework-free UK-context redactor the gated AI paths reuse before sending text to an AI service.
  **50 new tests pass; full `@cs/domain` suite 540/540 green.** Wired into nothing live — reusable helper only.

---

## (A) IaC config-capture layer

### What it captures

Live config read on 2026-06-28 (read-only `az`), authored as `existing`-referencing bicep so the
**config surface** is version-controlled without recreating the hand-built infra under it.

| File | Resource | Captured |
|---|---|---|
| `infra/config-capture/api.bicep` | `cespk-api-dev` (Data API) | 16 app-settings, `cespk_app` Postgres wiring, `PGPASSWORD` KV ref, gates; 2 role assignments. |
| `infra/config-capture/orch.bicep` | `cespk-orch-dev` (orchestration) | 25 app-settings (Graph intake, retained-fn URLs + KV-ref keys, evidence blob, gates); **5** role assignments (widest MI). |
| `infra/config-capture/spa.bicep` | `cespk-spa-dev` (SWA) | Free SKU, host, and the fact it has **no** SWA app-settings (MSAL config is in-app + Entra). |
| `infra/config-capture/README.md` | — | Live mapping, RBAC table, KV layout, apply procedure, gaps. |

`cespkbox-fn-v76a47` (box-fn) is **already** captured by
[`functions/box-webhook/infra/main.bicep`](../../functions/box-webhook/infra/main.bicep) — not duplicated.

### Key facts recorded (so they leave tribal knowledge)

- **Two Key Vaults:** `cespk-pg-kv-dev` (`cespk-app-password`, `graph-client-secret`, `parser-fn-key`,
  `enrich-fn-key`, `boxwebhook-fn-key`) and `cespkboxkvv76a47` (Box secrets, in the box template).
- **Both KV-reference forms preserved as-found** — `SecretUri=…` and `VaultName=…;SecretName=…`.
- **RBAC (all MIs SystemAssigned), captured verbatim** — full table in the README. Notable: the orch MI
  holds **Storage Blob Data Contributor on the live evidence store `cespkevidstdev01`**.
- **Gate state captured post-fix:** `BOX_API_ENABLED` / `BOX_FOLDER_AT_INTAKE_ENABLED` /
  `BOX_FILEREQUEST_ENABLED` = `true` (box-activator, task #3); `PDF_MAPPER_ENABLED` /
  `ENRICHMENT_ENABLED` = `true`. P0 DB-security recorded: API connects as non-owner `cespk_app`,
  `PGAPPROLE=staff`, password a KV ref.

### How to apply later (NOT done here)

- Each Function-App template has `param applyAppSettings bool = false` (capture-safe default = **no
  mutation**). Setting it `true` writes the settings — a **full REPLACE** of the app-settings collection,
  so confirm the captured list is complete-vs-live first.
- RBAC role-assignment resources use `guid(...)` names → idempotent re-apply. Per
  `docs/azure/identity-rbac.md`, grant via the **ARM/bicep deployment** (the `az role assignment` verb
  500s `MissingSubscription` here).
- The App Insights connection string is a `@secure()` empty-default param — pass at deploy time.
- Validate via `az deployment group what-if` before any real apply. Full steps in the README.

### Gaps — what could NOT be captured (operator-owned)

1. **Exchange-RBAC mailbox grant** for live intake — not an ARM/bicep surface (Exchange admin PowerShell).
2. **Live evidence store `cespkevidstdev01` store-hardening** (soft-delete/versioning) — **not in any IaC**;
   only the orch MI *role* to it is captured. Hardening the store stays an operator step (Phase-9 G6).
3. **Secret VALUES** — by design; names + reference structure only.
4. **Staff Entra app-role assignment** — directory action, not RG IaC (one principal assigned; others 403).
5. **SWA MSAL config** — in `staticwebapp.config.json` + Entra, not SWA app-settings.
6. **Underlying infra topology** (plan SKU, storage/KV hardening flags) — referenced as `existing`; the
   per-function `functions/*/infra/` + `ocr/infra/` bicep remain the authoring source. `httpsOnly` /
   `minTlsVersion` came back `null` from the live query and are not asserted.

---

## (B) PII pre-scrub helper

### Location & shape

`packages/domain/src/domain/pii-scrub.ts` (exported via the `@cs/domain` domain barrel) — chosen because
that is the shared, pure, framework-free domain package both the API and orchestration tiers already
import. No prior scrub/redaction utility existed (the only "PII" reference in the tree is the
retention-anonymise path in `api/src/functions/internal.ts`, a different concern), so this is net-new and
non-duplicative.

API:
- `scrubPii(input, opts?) → { text, redactions: [{kind,count}], totalRedactions }`
- `scrubPiiText(input, opts?) → string` · `containsPii(input, opts?) → boolean`
- `opts`: `redactVrm` (default **false**), `redactNames` (default **true**), `placeholders` override.

### What it redacts (conservatively, UK context)

Typed placeholders `[EMAIL] [PHONE] [POSTCODE] [ADDRESS] [NINO] [NAME] [VRM]`:
- **email**, **UK phone** (`+44`/`0`-prefixed, 10–11 digits, loose separators), **UK postcode**,
  **UK street address** (house-no + words + street-type suffix), **UK National Insurance number**,
  **title-anchored names** (Mr/Mrs/Ms/Miss/Dr/Prof + name or initials).
- **VRM redaction is OFF by default** — a vehicle registration is the domain key (vehicle-identity),
  **not** claimant PII; `redactVrm:true` opts in where the reg is used as a person's identifier.
- **Conservative by design (precision > recall):** free-standing names and unanchored addresses are
  **not** attempted (needs NLP) — documented as a limitation so callers don't assume full coverage.
- The `redactions` summary carries **counts only, never the matched values** → safe to log for telemetry.

### Test results

`packages/domain` · `npx vitest run`:
- `src/domain/pii-scrub.test.ts` — **50 passed** (email, phone incl. negative Case/PO + short-ref cases,
  postcode, address, NINO, names incl. disable + over-redaction guards, VRM opt-in/default-off, a realistic
  multi-line email body, custom placeholders, empty/non-string input, determinism/no-lastIndex-leak).
- **Full suite: 540 passed (22 files)** — no regression; `tsc -b` clean.

### Intended consumers (not wired here)

The gated AI paths in OPEN_ITEMS: **Phase-8 LLM email classifier** (`EMAIL_AI_ENABLED`, behind Phase-9 G5
sign-off) and **Phase-4a vision/geocode** assist. They call `scrubPii(...)` on free text **before** any
external AI call. No live path imports it yet — that wiring is a later step when those gates open.

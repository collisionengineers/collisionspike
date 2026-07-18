---
name: box-pivot-phase7-committed
description: Phase 7 Box-centric intake pivot is BUILT + MERGED to main (PR #13, 2026-06-22) after a Codex review pass; Dataverse schema live (gates OFF), Code App deployed, Function/connector/flows deferred to the business-account phase.
metadata:
  type: project
  originSessionId: 5e5bd268-e0d6-4dfb-9c9c-c735a3b9d76e
---

The full **Phase 7 Box pivot** (ADR-0012, additive hybrid — Dataverse stays system-of-record, Box is a
one-way mirror, evidence is **linked not embedded**) was built on `feat/phase-7-box-integration`, then
went through an exhaustive **Codex PR review (#13)**. All review findings were adjudicated against the
codebase + **live Dataverse (az)** + a multi-agent verify pass, every valid one fixed, and **PR #13 was
MERGED to main 2026-06-22** (fix commit `3204dfe`, merge `751d7cc`). Code App **redeployed live** from
main (`pac code push`, app `da7ba7af`). Added [[docs/roles-and-permissions]] (`docs/roles-and-permissions.md`).

**Key review fixes (the ones that matter later):**
- **Webhook receiver** now processes the Dataverse fan-out **ON the request path** and returns **503 on a
  transient failure so Box retries** — the old fire-and-forget-after-202 daemon thread DROPPED uploads
  (Box does NOT retry after a 2xx). Durable dedup = the `box:file:<id>` tag in `cr1bd_sourcemessageid`
  (NOT `cr1bd_boxfileid`, which is a correlation/UI mirror the webhook now also writes).
- Webhook also writes `cr1bd_boxfileid` + `cr1bd_acceptedforeva=true`; binds via **`cr1bd_Caseid`
  (capital C)**; audit uses the canonical `cr1bd_name`/`occurredat`/`action`/`after` (there is **NO
  `cr1bd_detail`** column); `_gated_off` returns **503**.
- Flows: `box-blob-purge` purges **only archived (accepted, non-excluded) images** (was deleting
  un-archived evidence → data loss); finalize stamps `cr1bd_boxsyncedat`; clear-storagepath only on a
  confirmed delete; duplicate-submit resets `cr1bd_submitrequested`; `box-file-request-copy` guards both
  folderId+templateId. Also fixed a latent lowercase `cr1bd_caseid` bind in `chaser-draft`.
- The **ListFolder reconciliation sweep is DOCUMENTED-but-NOT-BUILT** (a deferred backstop) — Box's own
  503-retry is the primary recovery. Earlier docs that called it "the proven fallback" were corrected.

**Live state (verified via az, gates stay OFF):**
- **Dataverse schema APPLIED LIVE** — all `BOX_*` env-vars (5 gates default `false` + 2 config vars empty),
  **9** new `cr1bd_case` columns (incl. `cr1bd_boxsyncedat`, `cr1bd_boxfolderurl`, the submit-signal
  columns, `cr1bd_evapayload12`) + `cr1bd_boxfileid`/`cr1bd_boxfileurl` on evidence; 3 audit options.
  Applied via `dataverse/.build/25-box-schema.ps1`; `06-verify-live.ps1` → ALL LIVE CHECKS PASSED.
  `cr1bd_ENRICHMENT_ENABLED` default reconciled to **false** (Dev currentValue=`true` — enrichment live).
- **Code App** ships Box surfacing **DORMANT** (gates off → `getBoxGates` all-false; main.tsx Box wiring
  is a commented deploy recipe, not executed). UI renders "Archive" not "Box".
- **NOT deployed** (business-account phase): the `box-webhook` Azure Function, the `cr1bd_box_rest`
  connector, the Box flows.

Gates after the fixes: **verify-all 7/7**, **box-webhook pytest 73**, **flow linter 154/154**, **vitest 256**.

**PINNED:** parallel custom **`cr1bd_box_rest`** (CCG minted in `functions/box-webhook`; api_key=Function
host key) for folder/File-Request/shared-link/webhook; first-party **`cr1bd_box` RETAINED** for the byte
path. Code App calls copy/shared-link via **direct connector ops** (no flow under CSP); finalize is a
**Dataverse submit-signal**. At activation the direct chaser transport must persist
`cr1bd_boxfilerequestid`/url.

**Deferred to the operator + BUSINESS-account phase (docs/gated.md item 5):** register + Admin-authorize
the Box Platform app (CCG); inject `client_secret` + webhook signature keys to Key Vault (HYPHENATED secret
names `box-client-secret`/`box-webhook-primary-key`/`box-webhook-secondary-key` → UPPER_SNAKE app
settings); deploy the bicep; import the connector + bind connections; hand-build the ONE template File
Request; run the **BLOCKING `FILE.UPLOADED` live-test**; flip the `BOX_*` gates per phase. Floor = **base
Box Business** (folders+File Requests+webhooks+CCG); **Business Plus** only for the optional metadata field.
The free throwaway account can't do CCG — see [[box-test-account]].

Related: [[box-integration-pivot-findings]], [[intake-repo-trails-live]], [[live-services-boundary]],
[[codeapp-csp-use-connectors]].

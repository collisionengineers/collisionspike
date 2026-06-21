# Box-integration pivot — build plans

Section build plans for the **Box-centric intake pivot** (Option 2, additive hybrid — approved
2026-06-21). Research base: the [`box-integration-pivot/`](../) dossier
([04-target-architecture.md](../04-target-architecture.md) +
[07-flaws-risks-and-open-questions.md](../07-flaws-risks-and-open-questions.md)); treat its findings as
settled. Each section is Claude-buildable offline except the explicit operator-gated items (Box Platform
app, `client_secret`, `frame-src` CSP edit, live confirms — Claude never holds a Box credential).

| # | Plan | One-liner |
|---|---|---|
| **00** | [**00-BUILD-PLAN.md**](./00-BUILD-PLAN.md) | **Start here.** The ordered master plan: dependency-ordered Waves 0–5, the cross-section reconciliations, the critical path, the consolidated operator checklist, and the risks/gaps/unverified roll-up. |
| 01 | [01-docs.md](./01-docs.md) | Docs edits + additions booked into the precedence ladder: ADR-0012, architecture §Box, the `phase-3-box-integration/` plan folder, gated.md rows, and reconciling the old box-archival-pipeline.md down. |
| 02 | [02-app-and-files.md](./02-app-and-files.md) | Code App changes: the `BoxGates` read, the chaser→File-Request→clipboard flow, the real `finalize-eva-box` submit invocation, "Open in Box" deep link + optional Box Embed iframe — all CSP-safe via connectors. |
| 03 | [03-azure-cloud.md](./03-azure-cloud.md) | Azure unlock: the custom Box REST connector (API-key + Function-minted CCG token), the webhook-receiver FC1 Function (HMAC + replay + dedup), Key Vault secret, and the status-driven Blob purge. |
| 04 | [04-power-automate-flows.md](./04-power-automate-flows.md) | Flow-by-flow build: new `box-folder-create` / `box-file-request-copy` / `box-blob-purge` children + intake / case-resolve / status-evaluate edits, all gated by the four BOX_* env-vars. |
| 05 | [05-dataverse.md](./05-dataverse.md) | Schema slice: 5 Boolean gates + 2 String config vars, 3 `cr1bd_box*` columns on `cr1bd_case`, 3 additive audit-action options; Evidence + case-status unchanged. Owns the BOX_* schema names. |
| 06 | [06-box-integration.md](./06-box-integration.md) | Box-tenant setup: plan/licence, Platform app + scopes + Admin authorization, the hand-built template File Request + metadata template, folder root + naming, webhook subscription, shared-link/embed, governance/AI (later). |

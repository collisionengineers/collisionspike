# 00 — Master Workflow (the runbook)

The ordered, dependency-sequenced sequence for the whole migration. Each phase lists its
**precondition gate**, what it **produces**, the **plan file** that details it, and the **tools**
used. `‖` marks work that can run in parallel. Do not start a phase until its gate is green.

> This is an **operator + agent runbook**, not an unattended script. Several steps are
> operator-only (Azure subscription choice, Entra admin consent, irreversible deletes). Agents
> author code/DDL/IaC and draft commands; a human runs the provisioning and teardown commands.

## Phase map

```
P0 Decide & baseline ─┬─> P1 Provision substrate ‖ rewrite CLAUDE/AGENTS
                      │        └─> P2 Schema & settings ─> P3 Backend API ─┬─> P4 Orchestration ─┐
                      │                                                     └─> P5 Frontend+auth ─┤
                      └────────────────────────────────────────────────────────> (both) ────────┴─> P6 Verify ─> P7 Cutover ─> P8 Deprovision ─> P9 Docs finalize
```

---

## P0 — Decide & baseline

**Gate:** none (entry point).
**Do:**
- Confirm decisions **D1–D10 + Q1** in [`02`](./02-decisions-and-open-questions.md) — all resolved.
  Q1 is settled: the sub already holding `rg-collisionspike-dev` **is itself an Azure Free Trial**
  (`e6076573-…`, quotaId `FreeTrial_2014-09-01`), so it already qualifies for **12-months-free**
  Postgres B1ms — provision **in-place**, no second subscription. The only residual is the operator
  **action** (not a fork): with ~£0/mo spend the operator has **~4 weeks of runway** (the deadline is
  the trial's calendar 30-day expiry, not credit burn), so **provision now on the trial** and **upgrade
  to Pay-As-You-Go before day 30** — see [`02` Q1](./02-decisions-and-open-questions.md) +
  [`40`](./40-costing-and-servicing.md).
- Snapshot the current state **for reference only** (these exports are inputs to authoring, not
  things we keep):
  - `pac auth create --environment https://collisionengineers-dev.crm11.dynamics.com`
  - `pac solution export --name CollisionSpike --path ./_baseline/CollisionSpike.zip --managed false`
  - `pac solution export --name CollisionSpikeFlows --path ./_baseline/CollisionSpikeFlows.zip --managed false`
  - `pac code list` (capture the Code App id `da7ba7af-…`)
  - `az resource list -g rg-collisionspike-dev -o table > ./_baseline/azure-keepset.txt`
- The repo already contains the authoritative source for the schema (`dataverse/schema/`,
  `dataverse/choicesets/`, `dataverse/relationships.json`) and the gates
  (`dataverse/environment-variables.json`) — these, not the live env, drive P2.

**Produces:** confirmed decisions (no open fork); a `_baseline/` reference snapshot (kept out of git,
deleted at P9).
**Tools:** `pac`, `az`.

---

## P1 — Provision the Azure substrate ‖ rewrite `CLAUDE.md`/`AGENTS.md`

**Gate:** P0 decisions confirmed (Q1 settled — provision in-place on the Free Trial sub; the PAYG
upgrade is a deadline, not a precondition).
**Do (provision, all in `rg-collisionspike-dev`, UK South).** The idempotent
[`assets/iac/provision.sh`](./assets/iac/provision.sh) (az-show-guarded, `DRY_RUN=1` supported, asserts
the FreeTrial sub + existing RG) stands up the whole substrate without touching the 6 existing Functions,
ACR, Blob, observability, or the EVA/Box/enrich vaults:
- **Postgres** `cespk-pg-dev` + DB `collisionspike` — `az postgres flexible-server create` (B1ms, 32 GB,
  PG 16, `--public-access None`, Entra + password auth). Exact flags in [`20`](./20-data-and-schema-migration.md).
- **Data API Function App** `cespk-api-dev` (storage `cespkapistdev01`) — new Flex Consumption
  **TypeScript/Node 20** app (D10). See [`21`](./21-backend-api-build.md).
- **Orchestration Function App** `cespk-orch-dev` (storage `cespkorchstdev01`, `always-ready durable=1`)
  — second Flex **TS/Node 20** app for the Durable + webhook-receiver workload. See [`22`](./22-orchestration-migration.md).
- **Static Web App** `cespk-spa-dev` — Free tier for the SPA (control-plane region `westeurope`; the
  app itself fronts the UK South API). See [`30`](./30-frontend-preservation.md).
- **Break-glass DB vault** `cespk-pg-kv-dev` — holds the generated Postgres admin password (never echoed). See [`11`](./11-secrets-and-keyvault.md).
- **Entra app registrations** (3) — SPA (public client / SPA redirect), API (exposes a scope +
  app roles), and the Graph daemon `cespk-graph-intake` (application `Mail.Read` for the shared
  mailbox, tenant-admin consent + ApplicationAccessPolicy scoping). See [`31`](./31-auth-migration.md) + [`22` §A.1](./22-orchestration-migration.md).
- **Confirm Key Vault reuse** — the populated `cespkenrichkvgi62sd` (DVSA/DVLA) stays; grant the new
  apps' managed identities **Key Vault Secrets User** (role GUID `4633458b-…`). See [`11`](./11-secrets-and-keyvault.md).

**Do (docs, in parallel — this is risk R6):** rewrite the top-level `CLAUDE.md` and `AGENTS.md`
**now**, before any agent-assisted build, so P2–P5 agents don't act on stale "Power Apps + Dataverse
+ Power Automate" instructions. Full rewrite scope in [`91`](./91-documentation-rewrite-delete.md).

**Produces:** empty target topology + Azure-accurate agent instructions.
**Tools:** `az`, editor; **mslearn** to confirm every SKU/flag before running.

---

## P2 — Schema & settings migration

**Gate:** P0 (DB choice), P1 (Postgres up).
**Do:**
- Generate Postgres DDL into `assets/schema/` from `dataverse/schema/*.json`,
  `dataverse/choicesets/*.json`, `dataverse/relationships.json`. Translate choicesets to enums/lookup
  tables **preserving the EVA integer codes**; relationships to FKs with `ON DELETE CASCADE` where the
  Dataverse cascade is `Cascade`; the inbound-email dedup alternate key to a `UNIQUE` constraint.
- Map the 28 environment variables (**20 Boolean gates + 6 String config + 2 Secret**) to Function
  app-settings, with the frozen Dev defaults (`PDF_MAPPER_ENABLED=true`, `ENRICHMENT_ENABLED=true`,
  rest off/empty). The lone exception is `HOLD_NEW_CASES_BY_DEFAULT`, the one **runtime-writable** gate —
  it becomes a DB-backed `app_setting` row read+written through an Admin-guarded endpoint, **not** an
  app-setting. See [`10`](./10-settings-migration.md).
- Reseed the reference corpus (work providers, repairers, image sources, inspection addresses, email
  domains) from `dataverse/.build/` seed sources — **not** from live rows.
- Port a parity check mirroring `dataverse/verify-parity.mjs` / `dataverse/case-status.parity.test.ts`.

**Produces:** live schema + seeded corpus + flag config + a passing parity check.
**Tools:** `az`, `psql`; `pac` only if a seed CSV is stale and needs a one-off export.

---

## P3 — Backend API build (the BFF)

**Gate:** P2 (schema live).
**Do:** implement the API that mirrors the `DataAccess` interface
(`mockup-app/src/data/types.ts:373`) — every query/write/gate-read method — and that owns the logic
Dataverse + flows gave for free: the **status state machine**, **dedup**, and **audit** writes.
Validate the Entra JWT on every call. Detail + endpoint list in [`21`](./21-backend-api-build.md).

> **R3 — freeze the contract.** Once the `DataAccess`→REST endpoint mapping in [`21`](./21-backend-api-build.md)
> is agreed, freeze it. P4 and P5 both build against it; churn here ripples into both.

**Produces:** the API the SPA and orchestration call.
**Tools:** `func`, `az`; **mslearn** (Functions HTTP trigger; Entra token validation).

---

## P4 — Orchestration migration ‖ P5

**Gate:** P3 contract frozen.
**Do:** rebuild the **17 flow definitions** (`flows/definitions/*.json`) as Durable Functions + queues —
the **7-flow M1 intake chain** (of which only 3 are activated in the live tenant; `flow-state.json`
ships all `off`) + its per-inbox `intake-shared-mailbox` variant + the **9 gated/offline** flows — and
replace the Outlook intake trigger with a **Microsoft Graph change-notification subscription** on each
shared mailbox → HTTPS webhook receiver → queue → Durable orchestrator. Build the **renewal timer**
(Outlook `message` subscriptions expire in **under 7 days** — 10,080 min without resource data; renew
every 12 h) and handle **lifecycle notifications** (`reauthorizationRequired` / `subscriptionRemoved` /
`missed`), plus the mandatory **heartbeat alert** (the run-history UI is gone). Full design in
[`22`](./22-orchestration-migration.md).

**Produces:** the intake pipeline running on Azure.
**Tools:** `az`, `func`; **mslearn** (Graph change notifications for Outlook; Durable Functions).

---

## P5 — Frontend preservation + auth ‖ P4

**Gate:** P3 contract frozen; P1 (SWA exists).
**Do:** rewrite the ~2.6k-LOC data seam behind `DataAccess` into a single `rest-client.ts` calling
the P3 API; wire MSAL sign-in; strip the Power Platform deps/plugin/config; deploy to SWA. The
~11.5k LOC of screens/components/theme/contracts/domain is untouched. Detail in
[`30`](./30-frontend-preservation.md) + [`31`](./31-auth-migration.md).

**Produces:** the preserved SPA on Static Web Apps behind Entra.
**Tools:** `npm`, `az staticwebapp` / `swa`; **mslearn** (MSAL React; SWA auth).

---

## P6 — Integration & verification

**Gate:** P3, P4, P5 complete.
**Do:** run the end-to-end + parity checks in [`99`](./99-verification-and-cutover.md) on the target:
schema/flag parity, the `DataAccess` contract test, frontend build + load, an intake e2e
(email → Graph webhook → Durable → Case in Postgres), dedup, and EVA-readiness parity.

**Produces:** the go/no-go evidence pack.
**Tools:** `psql`, `func`, `npm`, browser.

---

## P7 — Hard cutover

**Gate:** P6 green.
**Do:** in **one change window**, create/enable the live Graph subscriptions on the production shared
mailboxes (one per intake inbox) **and** turn the old Power Automate intake flows OFF (the `intake` +
`intake-shared-mailbox` triggers) — a single-consumer switch. The Postgres `UNIQUE(sourcemessageid)`
constraint is the backstop against any brief double-read (R2).

**Produces:** the new pipeline is the sole live consumer.
**Tools:** `az`, Power Automate (disable).

---

## P8 — Deprovision Power Platform

**Gate:** P7 green and observed healthy for the agreed soak period.
**Do:** execute [`90`](./90-deprovision-power-platform.md) — flows off → Code App → connectors →
flows solution → final cold export (archived off-repo) → schema solution → connections → **delete the
Dev sandbox**. **Keep** the Azure RG and its full end-state: the 6 existing Functions, the 2 new
Function Apps (`cespk-api-dev`/`cespk-orch-dev`), Postgres `cespk-pg-dev`, SWA `cespk-spa-dev`, all
Key Vaults (the 3 existing + `cespk-pg-kv-dev`), App Insights/LAW, Blob, ACR.

**Produces:** zero Power Platform footprint; the Azure keep-set intact.
**Tools:** `pac`, Power Platform admin center.

---

## P9 — Documentation finalize (archive off-repo, then delete)

**Gate:** P8 (docs must describe the real end-state).
**Do:** execute [`91`](./91-documentation-rewrite-delete.md): archive the to-be-deleted Power Platform
docs/ADRs/skills off-repo, delete them from the working tree, finish the in-place rewrites, add
**ADR-0019** (the migration decision), then **delete `migration/` itself** once the grep gate in
[`99`](./99-verification-and-cutover.md) passes.

**Produces:** a clean, Azure-only repo with no legacy bloat.
**Tools:** editor, `git`.

---

## Risk register (carried from the blueprint)

| ID | Risk | Mitigation |
|---|---|---|
| **R1** | Data/logic loss — Dataverse/flows are the only source of schema + corpus + status/dedup logic until P2/P3 reproduce them | Never run P8 before P6/P7 green; keep the `_baseline/` export until P9 |
| **R2** | Double-processing — old flow + new webhook both read the mailbox during overlap | Hard cutover in one window; `UNIQUE(sourcemessageid)` backstop |
| **R3** | Contract churn — `DataAccess`→API drift breaks P4 and P5 | Freeze the mapping in [`21`](./21-backend-api-build.md) before P4/P5 |
| **R4** | EVA parity — choiceset→enum loses the EVA integer codes | Preserve codes; port `verify-parity` (P2) and run it in P6 |
| **R5** | Graph renewal lapse — intake silently stops if the subscription expires un-renewed | Renewal timer + lifecycle-notification handling + a heartbeat alert ([`22`](./22-orchestration-migration.md)) |
| **R6** | Doc-rewrite timing — agents act on stale Power Platform instructions during the build | Rewrite `CLAUDE.md`/`AGENTS.md` at P1; finalize the rest at P9 |

# Live environment

This is the readable view of [LIVE_FACTS.json](../../LIVE_FACTS.json), last verified there on
2026-07-21. The JSON registry wins if values differ (this date is derived from `LIVE_FACTS.lastVerified`
and checked by `check:live-facts`). Verify live before making a decision that depends on current state.

## Core resources

| Surface | Resource | Source |
| --- | --- | --- |
| Staff web app | `cespk-spa-dev` | `apps/web` |
| Data API | `cespk-api-dev` | `services/data-api` |
| Orchestration | `cespk-orch-dev` | `services/orchestration` |
| PostgreSQL | `cespk-pg-dev` / `collisionspike` | `database` |
| Parser | `cespike-parser-dev-x7xt3d5ovhi7y` | `services/functions/parser` |
| Vehicle enrichment | `cespkenrich-fn-gi62sd` | `services/functions/vehicle-enrichment` |
| EVA Sentry | `cespkeva-fn-ufa3ci` | `services/functions/eva-sentry` |
| EVA validation | `cespkeval-fn-6c6fxd` | No repository source; retirement is separate production work |
| OCR | `cespkocr-fn-dev-glju3v` | `services/functions/ocr` |
| Archive events | `cespkbox-fn-v76a47` | `services/functions/box-webhook` |
| Location assistance | `cespkloc-fn-a7tzj2` | `services/functions/location-assist` |

The resource group is `rg-collisionspike-dev`; the primary region is UK South and the web app is in
West Europe.

## Active paths

- The web app authenticates staff with Microsoft Entra ID and calls the Data API over REST.
- The Data API validates the bearer audience and enforces `CollisionSpike.User` or
  `CollisionSpike.Superuser` before setting PostgreSQL request context.
- Mail intake is re-scoped for the PLAN-015 alpha (2026-07-21) to the single dedicated mailbox
  `instructions@collisionengineers.co.uk` (staff forward provider emails into it — see the
  [staff forwarding guide](../product/staff-forwarding-guide.md)). The three legacy mailbox
  subscriptions were pruned at cutover; the mailboxes stay Exchange-RBAC-readable for the local
  shadow instance's poller. See [alpha testing](./alpha-testing.md).
- The Graph application has no tenant-wide Microsoft Graph application role or delegated grant, and no
  delegated consent. Its entire mailbox permission comes from Exchange Online RBAC for Applications.
  **Corrected 2026-07-21 — this bullet previously said the boundary was read-only; it is not.** The app
  holds both `Application Mail.Read` **and `Application Mail.ReadWrite`**, each assigned under two custom
  recipient scopes (`CollisionSpike-Intake-Prod` → `info@`/`engineers@`/`desk@`; `CS-Intake-EngDigital` →
  `engineers@`). `Test-ServicePrincipalAuthorization` reports `Mail.ReadWrite` `InScope=true` for all three
  intake mailboxes. Because the Entra side is empty, `az`/Graph queries of the app registration return
  nothing and imply read-only — verify with `Test-ServicePrincipalAuthorization`, not with `az`.
- Outlook mutation is disabled in both the Data API and orchestration by `OUTLOOK_MOVE_ENABLED=false`.
  That gate, plus the absence of any delete/purge/send code, is what protects the mailboxes — **not** the
  permission grant. The only mutating mail calls in the repository are `moveMessage` and
  `ensureInboxChildFolder` (`services/orchestration/src/adapters/graph.ts:585,600`), reachable solely from
  `services/orchestration/src/workflows/mailbox/outlook-move.ts` behind that gate. The write grant
  currently has no consumer; removing it is a live mailbox-permission write and needs operator authority.
- A durable monitor renews mail subscriptions.
- PostgreSQL uses the non-owner `cespk_app` login with row-level security enabled and forced.
- Document parsing, vehicle enrichment, OCR, Archive filing, location assistance, mail triage, and the
  approved AI/assistant capabilities listed in `LIVE_FACTS.json` are enabled.
- EVA REST submission and valuation lookup remain deliberately unavailable.
- Guided public capture, individual image deletion, capture cleanup, MCP image ingestion and on-demand
  image analysis are deployed but dark — switched off (back off, for the gates found on during the
  TKT-159 audit) at the 2026-07-21 PLAN-015 alpha cutover, which also closed the TKT-200 capture-ingress
  exposure. The guided-photos staff panel is removed from the deployed web app for the alpha (TKT-300).
- The EVA validation resource remains running but had no repository caller, caller configuration, or
  request telemetry in the focused 90-day read-only audit on 2026-07-15. Its duplicate repository
  implementation was removed; the shared domain readiness evaluator remains canonical.

## Deployment validation — 2026-07-16

- The staff web app returned 200 at its existing production URL after deployment.
- The Data API, orchestration, Archive and EVA function hosts were Running with 144, 101, 16 and one
  registered functions respectively.
- The development database had 78 public base tables. All 22 numeric code tables matched the repository,
  including the corrected `evidence_added` audit action; the new capture, Archive-holding, MCP image,
  evidence-deletion and provider-idempotency tables had forced row-level security and policies.
- Post-recovery telemetry from 00:08 UTC contained no API or orchestration exception, failed request or 5xx.
- The Archive function remained locked to the approved test folder. EVA, public capture, image deletion,
  capture cleanup and MCP image ingestion remained off. No Outlook write, EVA submission, Archive write or
  live cutover was used as deployment proof.

## Estate re-verification — 2026-07-19

- A read-only ARM resource inventory of `rg-collisionspike-dev` reconciled this registry (TKT-257,
  PLAN-009). Every deployable resource is present; the estate is unchanged in shape.
- The subscription offer is pay-as-you-go (the earlier Free Trial upgrade is complete); `LIVE_FACTS.json`
  is corrected accordingly.
- The orchestration host registered 105 functions — up from the 2026-07-16 reading of 101 after the
  2026-07-17 `d6ee70de` deploy; the API remains 144. The current counts live in `LIVE_FACTS.json`.
- The EVA-validation resources (`cespkeval-fn-6c6fxd` and its plan/storage) remain deployed. Their live
  retirement is operator-gated (TKT-252) and has not been performed; the app stays as the rollback guard.

## PLAN-015 alpha cutover — 2026-07-21

- Executed per [alpha testing](./alpha-testing.md) (~14:00–15:00Z; full dated record in TKT-302's
  evidence). The Data API and orchestration hosts were redeployed dark from `main` — orchestration
  now registers **109** functions (+3 ship-dark PLAN-015 functions); the API is unchanged (146 raw →
  144 reconciled). The `eva-shadow-submit` queue was created.
- The Exchange RBAC recipient scope was extended to the alpha mailbox (verified
  `Test-ServicePrincipalAuthorization` InScope=true for all four mailboxes); the legacy
  subscriptions were pruned at 14:02:42Z. The alpha mailbox's own subscription bootstrap was still
  returning Graph 403 at the time of this record (RBAC propagation lag) with an automatic retry
  running — see `LIVE_FACTS.mailIntake.status` for the definitive state.
- Backups banked before any deletion: an RLS-complete `pg_dump --role=csadmin` (79 TABLE DATA
  entries) plus a verified-complete blob download (12,930/12,930 blobs, case-collision and
  post-scan stragglers reconciled to zero). The database was wiped and rebuilt from
  `database/baseline` + seeds: **66** base tables, RLS enabled+forced spot-checked, 390 providers
  (QDOS active), zero cases/emails, 27 Case/PO continuity floors (QDOS26 continues at 812). The
  evidence blob container was then cleared.
- Gate changes (all on `cespk-api-dev`): the three capture gates OFF (closing the TKT-200
  exposure; verified 404 on the public routes), `DELETE_CASE_IMAGE_ENABLED` OFF,
  `MCP_IMAGE_INGEST_ENABLED` OFF, `IMAGE_ANALYSIS_ENABLED` OFF. `MCP_SERVER_ENABLED` deliberately
  stays on. The staff SPA was redeployed (guided-photos panel removed).
- EVA shadow gates (`EVA_API_ENABLED`, `EVA_SHADOW_AUTOSUBMIT_ENABLED`) remain OFF pending the
  vendor UAT credentials (runbook Phase 6).

## Parse-fed unified triage deploy — 2026-07-21

- PLAN-014 (TKT-296) deployed the parse-fed unified triage stack live: the parser
  (`cespike-parser-dev-x7xt3d5ovhi7y`, Slice 1 D4 + Slice 2 `/classify-email` validation), the OCR
  container (`cespkocr-fn-dev-glju3v`, new engine-materialized image), and the orchestration host
  (`cespk-orch-dev`, the `triageUnified` activity + parse hoisted before triage).
- The orchestration host now registers **106** functions — up from the 2026-07-19 reading of 105; the
  +1 is the new `triageUnified` activity (the superseded `classifyInbound`/`triagePolicy` activities are
  retained but no longer called by the intake path, so no function was removed). The API remains 144.
- `TRIAGE_PARSE_FED_ENABLED` was flipped from its ship-dark default to `true` @ 2026-07-21T04:27:50Z.
  Read-only post-deploy verification (azure-diagnostician, 04:45Z) found the host Running, the cutover
  wired, and 0 exceptions / 0 sev≥3 traces / 0 Failed or Terminated Durable instances. Behavioural
  proof of the enabled path on a live arrival is not yet banked (no inbound since the flip) — tracked as
  TKT-296's residual follow-up; the gate is trivially reversible if a regression surfaces.

## Operating constraints

- The subscription is on the pay-as-you-go tier (the earlier Free Trial upgrade is complete).
- Keep proof of unattended mail-subscription renewal.
- New staff accounts need an explicit application-role assignment before they can use the app.
- Legal and data-protection records remain open ticketed work; do not infer completion from enabled code.

## Registry integrity

The governed numeric facts in `LIVE_FACTS.json` are backed by a committed, secret-free evidence snapshot
and field map at [`live-facts.evidence.json`](./live-facts.evidence.json). `LIVE_FACTS.json` records that
file's path and SHA-256 under `authority.machineEvidence`.

- **Offline** — `npm run check:live-facts` (in `verify-all.mjs` and CI) validates the snapshot schema,
  the digest, that the snapshot's capture time matches `LIVE_FACTS.lastVerified`, that every governed
  function/table count maps to and equals the snapshot, and that this page's "last verified" date is
  derived from the registry. It never contacts Azure and is not live verification.
- **Credential-gated (read-only)** — `npm run compare:live-facts` (the CI `verify-live` job) runs
  read-only `az functionapp function list` probes, compares every ARM-probable governed count with both
  the committed evidence and the registry, and fails closed on any query failure or drift. Without
  credentials it prints an explicit skip that is not live verification. It performs no writes and emits
  only a sanitised counts-only artifact.

The repository-tree ledger checks (`check:inventory`, `check:reconciliation`) remain the canonical,
separate governance ledgers; this integrity check does not reimplement them.

Decision of record: [ADR-0027](../adr/0027-ship-dark-gate-model.md).

No secrets, tokens, object IDs, subscription GUIDs, transient URLs, or connection strings belong on this
page.

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
- Mail intake is live for `info@`, `engineers@`, and `desk@` using Microsoft Graph push notifications.
- The Graph application has no tenant-wide Microsoft Graph application role or delegated grant. Mail reads
  use the existing Exchange-scoped application boundary. Outlook mutation is disabled in both the Data API
  and orchestration.
- A durable monitor renews mail subscriptions.
- PostgreSQL uses the non-owner `cespk_app` login with row-level security enabled and forced.
- Document parsing, vehicle enrichment, OCR, Archive filing, location assistance, mail triage, and the
  approved AI/assistant capabilities listed in `LIVE_FACTS.json` are enabled.
- EVA REST submission and valuation lookup remain deliberately unavailable.
- Guided public capture, individual image deletion, capture cleanup and MCP image ingestion are deployed but
  remain deliberately dark until their ticket-specific security and designated-test evidence is complete.
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
- The orchestration host now registers 106 functions — up from the 2026-07-16 reading of 101 after the
  2026-07-17 `d6ee70de` deploy; the API remains 144. The current counts live in `LIVE_FACTS.json`.
- The EVA-validation resources (`cespkeval-fn-6c6fxd` and its plan/storage) remain deployed. Their live
  retirement is operator-gated (TKT-252) and has not been performed; the app stays as the rollback guard.

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

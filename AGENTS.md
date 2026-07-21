# AGENTS.md — operational charter for `collisionspike`

This is the binding working agreement for agents in this repository. Read it before changing the web
app, services, database, infrastructure, evidence, or documentation.

## Read order and authority

1. Read [CONTEXT.md](./CONTEXT.md) for canonical business language.
2. Read the relevant [product](./docs/product/README.md),
   [architecture](./docs/architecture/README.md), and [operations](./docs/operations/README.md) pages.
3. Read every applicable manual review in [docs/reviews](./docs/reviews/README.md). A later review
   supersedes an earlier review for the same area.
4. Read the owning ticket and plan. Ticket frontmatter and status folders are the sole work authority.
5. Use [LIVE_FACTS.json](./LIVE_FACTS.json) for last-verified environment state; verify live when the
   requested outcome depends on current cloud state.

When sources disagree, later binding user review input wins, then accepted ADRs, then current product
and architecture docs, then code. Record unresolved conflicts in the owning ticket.

## Current system

The running system comprises:

- the `cespk-spa-dev` staff web app;
- the `cespk-api-dev` REST data service;
- the `cespk-orch-dev` workflow service;
- PostgreSQL server `cespk-pg-dev`, database `collisionspike`;
- focused Python services for parsing, vehicle enrichment, EVA integration, OCR, Archive events, and
  location assistance;
- Microsoft Graph notification intake for `info@`, `engineers@`, and `desk@`;
- Azure storage, secrets, monitoring, mapping, document extraction, and AI resources;
- Box as the human-navigable Archive surface.

Exact resource state, feature flags, counts, and verification timestamps belong only in
[LIVE_FACTS.json](./LIVE_FACTS.json). The readable summary is
[docs/operations/live-environment.md](./docs/operations/live-environment.md).

## Live-system safety

- **HARD RULE — never touch CarClaims.** Do not touch `CarClaims`, ever: the `CarClaims Website` Entra
  app registration, its client secret (expired or not), the `carclaims.co.uk` website, the
  `info@carclaims.co.uk` mailbox, and the Car Claims brand are entirely off-limits to agent work. No
  rotation, revocation, retirement, remediation, deletion, or any other mutation — and do not propose,
  ticket, or plan one. CarClaims is an operator-managed asset; it is **not** a credential-hygiene target.
  If any inventory, audit, or review surfaces CarClaims as an action item (e.g. its expired-secret
  "[Security — act]" flag in `docs/operations/cloud-inventory-2026-07-17.md`), record it as off-limits and
  stop. This rule overrides any such recommendation.
- Repository work does not authorize a deployment, cloud configuration change, database mutation,
  mailbox change, role assignment, secret rotation, or Archive write.
- Read-only checks are allowed when needed to establish actual use or state. Prefer the narrowest
  query and record the source and timestamp.
- Never print, commit, or paste secret values, access tokens, private keys, function keys, or connection
  strings. Configuration should reference the approved secret store or managed identity.
- Build and test before any separately authorized deployment. Validate the deployed surface after a
  change; source code alone is not proof of live behaviour.
- Use PowerShell for Windows Azure CLI work. Follow the operation-specific runbook rather than
  improvising repeated commands.

## Repository data authority

Agents may open, decode, render, extract, compare, and analyse every byte committed to this repository,
including emails, images, documents, and evaluation artifacts. That authority covers internal project
processing needed for tickets, parsing, classification, AI evaluation, and verification.

It does not authorize publication, unrestricted egress, credential exposure, use of an unapproved
service, access-control bypass, wider mailbox/provider scope, or live mutation. Preserve source bytes,
hashes, and logical ownership. Evidence moves must use the content-addressed store and manifests
described in [repository data authority](./docs/governance/repository-data-authority.md).

`workingspace/` is user-owned brainstorming material. Do not edit, rename, or delete its files. A task
must name that content explicitly before an agent may change it.

## Product invariants

- No fabricated case rows may reach the production app. Production data begins empty and is populated
  only from the authenticated REST source.
- A Case/PO, VRM, provider reference, and message identity have different meanings. Follow the
  correlation and deduplication rules in the ADRs.
- The inspection address is selected or edited by staff from a full-address corpus; do not derive it
  from the EVA `Loc` export value.
- Stable persisted numeric codes are contracts. Rename internal labels only when snapshots prove the
  numeric mapping is unchanged.
- The parser's redundant-base64 tolerance is deliberate defensive input handling. Keep the behaviour
  and explain it without tying it to a particular transport.
- The parser engine is authored directly in this repository at `services/engine/cedocumentmapper_v2/`.
  Make functional changes there, then re-run `python scripts/build/sync-engine.py` to update the
  materialized copies under `services/functions/parser/` and `services/functions/ocr/` — never hand-edit
  a materialized copy directly; `scripts/checks/check-engine-materialized.py` gates that they stay in
  sync.

## User-interface language

The app is for non-technical case handlers. Render plain, sentence-case business language that says
what the handler can see or do. Do not expose cloud products, implementation layers, routes, schemas,
payloads, feature flags, internal identifiers, deployment state, planning labels, or ticket language in
labels, headings, hints, buttons, notifications, tooltips, empty states, validation, or badges.

Keep the business terms staff use: EVA, VRM/registration, Case/PO, Principal, work provider, claimant,
insured, inspection, instruction, chaser, photo/image, evidence, queue, and Archive.

Unavailable work is described plainly, for example: “Vehicle lookup isn't available yet.” Internal
engineering terms are acceptable in code comments and developer documentation.

## Reviews, tickets, and verification

- Manual reviews are binding requirements. Inspect their text and images; turn every actionable item
  into ticketed work and record what changed.
- Implement only the owning ticket's acceptance scope. Do not move ticket status or certify completion
  from code reading alone.
- A ticket reaches `done` only after its acceptance lines have concrete verification evidence.
- Keep ticket, plan, generated board, generated indexes, and evidence-manifest membership in parity.
- If work reveals a separate functional defect, create or update the correct ticket instead of hiding
  it inside repository cleanup.

## Repository hygiene

- `.agents` is the canonical role and skill source. Tool-specific directories are generated adapters.
- Current documentation lives only under the categories linked from [docs/README.md](./docs/README.md).
  Git history is the recovery path; do not add an in-tree archive.
- Keep deployables and owned modules discoverable. Each retained runtime root needs a concise README
  covering ownership, public contract, callers, tests, configuration, and deployment entry point.
- Do not commit dependencies, caches, local logs, generated evaluation output, bundles, or deployment
  packages.
- Prefer `rg` for search and `apply_patch` for file edits. Preserve unrelated user changes in a dirty
  worktree.

<!-- suite-context:v1 — standardized block, verified by suite.mjs audit; do not edit by hand -->
## Collision Suite Context

This repository is part of the Collision Engineers suite workspace
(`github.com/collisionengineers/collisionsuite`). In a full workspace checkout the suite root is a
few directories above this repo — read its `AGENTS.md` for cross-repo rules (guidance policy, git
boundaries, live-site protection) and use `node <suite-root>/tools/suite.mjs status|audit` for
cross-repo state.

Guidance policy: `AGENTS.md` + `.agents/` are canonical; `CLAUDE.md`, `.claude/<sub>` and
`.codex/<sub>` are symlinked views — edit only the canonical files. Windows checkouts need
Developer Mode + `git config core.symlinks true`, or the symlinks degrade to text files
(`suite.mjs links` repairs).
<!-- /suite-context:v1 -->

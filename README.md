# CollisionSpike

CollisionSpike is Collision Engineers' staff-facing case-intake system. It receives instructions and
evidence, assembles a case, helps staff review and complete it, sends the finished record to EVA, and
maintains the Archive copy.

The running system is a React/Vite web app backed by TypeScript services, Python processing services,
and PostgreSQL on Azure. Mail intake uses Microsoft Graph notifications. Staff sign in with Microsoft
Entra ID, and the data service enforces application roles and row-level database policies.

## Start here

| Need | Source |
| --- | --- |
| Product language and business rules | [CONTEXT.md](./CONTEXT.md) and [docs/product](./docs/product/README.md) |
| System shape and contracts | [docs/architecture](./docs/architecture/README.md) |
| Current environment state | [LIVE_FACTS.json](./LIVE_FACTS.json) and [live environment](./docs/operations/live-environment.md) |
| Operational procedures | [docs/operations](./docs/operations/README.md) |
| Active and completed work | [docs/tickets](./docs/tickets/README.md) |
| Binding user review input | [docs/reviews](./docs/reviews/README.md) |
| Repository rules | [AGENTS.md](./AGENTS.md) and [docs/governance](./docs/governance/README.md) |
| All documentation | [docs/README.md](./docs/README.md) |

Tickets and their plans are the sole work-status authority. `LIVE_FACTS.json` is the machine-readable
environment authority. Do not create another roadmap or hand-maintained status ledger.

## Repository map

| Path | Responsibility |
| --- | --- |
| [`apps/web`](./apps/web/README.md) | Staff web application |
| [`services/data-api`](./services/data-api/README.md) | Authenticated REST data service |
| [`services/orchestration`](./services/orchestration/README.md) | Mail intake and long-running workflows |
| [`services/functions`](./services/functions/README.md) | Focused Python processing and integration services |
| [`packages/domain`](./packages/domain/README.md) | Shared domain contracts and rules |
| [`contracts`](./contracts/README.md) | External contract schemas |
| [`database`](./database/README.md) | Baseline schema, ordered changes, seeds, tests, and operations |
| [`infrastructure`](./infrastructure/README.md) | Azure resource definitions and deployment configuration |
| [`tests`](./tests/README.md) | Test entry points, content-addressed evidence, and evaluation fixtures |
| [`scripts`](./scripts/README.md) | Build, verification, database, evaluation, and maintenance automation |
| [`tools`](./tools/README.md) | Small scoped integration utilities |
| [`docs`](./docs/README.md) | Current product, architecture, operations, decisions, design, governance, reviews, and tickets |
| [`workingspace`](./workingspace/) | User-owned brainstorming material; do not edit its contents |

## Local verification

Use Node.js 20 or later. From the repository root:

```powershell
npm run verify
```

The fail-closed gate performs a clean dependency install, all package builds and tests, deployment-bundle
smoke loads, retained Python suites, database and runtime-contract checks, evidence integrity, and
documentation/ticket parity checks. Generated deployment files belong under ignored
`.artifacts/deploy/`; never commit build output or dependency trees.

## Non-negotiable rules

- The application renders real records only. Fabricated examples belong in test fixtures.
- Preserve public REST routes, request/response contracts, database names, and persisted numeric codes
  unless a separately approved change explicitly alters them.
- Never make a live write merely to validate repository work. Live mutation requires explicit scope and
  the relevant operational procedure.
- Treat sibling repositories as reference material, not dependencies or authority.

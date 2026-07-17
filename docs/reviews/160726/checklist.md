# Review 160726 — reconciliation checklist

## (a) ADR reconciliation

| Requirement | File | Mechanism | State |
|---|---|---|---|
| D6 temporary registration identity, suffix decision, eliminators built-vs-decided | `docs/adr/0002-vrm-open-case-correlation.md` | Superseding rewrite | done 2026-07-17 |
| D5 rewording, asymmetric time rule | `docs/adr/0010-dedup-reference-disambiguated-no-time-window.md` | Superseding rewrite | done 2026-07-17 |
| D2 role overlap matrix, "the client" caution | `docs/adr/0011-work-provider-intermediary-garage-roles.md` | Superseding rewrite | done 2026-07-17 |
| D4 confirmed-delivery boundary | `docs/adr/0008-tool-boundary-ends-at-eva-handoff.md` | Superseding rewrite (slug kept by design) | done 2026-07-17 |
| Five receipt channels, guided-capture Direction, no "intake" wording | `docs/adr/0007-receipt-of-images.md` | Rename + superseding rewrite | done 2026-07-17 |
| D1/D1b/D1c/D1d audit shapes, derived id, marker refinement | `docs/adr/0014-audit-case-type-second-inspection.md` | Superseding rewrite | done 2026-07-17 |
| D15 live vocabulary, adopted additions, taxonomy authority | `docs/adr/0015-email-triage-inbox-management.md` | Superseding rewrite | done 2026-07-17 |
| D11 address-policy-first, Loc retired, 2026-07-08 amendment preserved | `docs/adr/0013-loc-export-artifact-no-runtime-address-matching.md` | Superseding rewrite (slug kept) | done 2026-07-17 |
| D7 tiered access model, shipped write lane, separate surfaces | `docs/adr/0023-mcp-server-hosting-and-auth.md` | Superseding rewrite; status → Accepted | done 2026-07-17 |
| D17 mileage precedence + DVSA flag | `docs/adr/0006-vehicle-enrichment-service-boundary.md` | Dated amendment | done 2026-07-17 |
| D16 engines named, presence-flag answer, model-change gate | `docs/adr/0009-image-processing-suggestion-first.md` | Dated amendment | done 2026-07-17 |
| D14 subset-merge rule | `docs/adr/0016-inspection-address-corpus-eva-export.md` | Dated amendment | done 2026-07-17 |
| D10 retro cross-link | `docs/adr/0004-parser-as-azure-function-inline.md` | Clarification clause | done 2026-07-17 |
| D9 template required, gate cited | `docs/adr/0012-box-centric-intake-additive-hybrid.md` | Clarification clause | done 2026-07-17 |
| Separate surfaces note; Status line ticket ref removed | `docs/adr/0020-provider-api-intake-channel.md` | Clarification clause | done 2026-07-17 |
| Invariant rescoped to delegated staff surface; status → Accepted | `docs/adr/0025-shared-capability-registry.md` | Clarification; status promotion | done 2026-07-17 |
| D1b one-clause source-material rule; Rationale added | `docs/adr/0021-case-po-marker-taxonomy.md` | Clarification clause | done 2026-07-17 |
| Pointer confirmed at 0023's tiered model; Rationale added; status → Accepted | `docs/adr/0024-assistant-write-tier-confirmation-protocol.md` | Clarification; status promotion | done 2026-07-17 |
| D8 withdrawal | `docs/adr/0017-data-retention-erasure-pii-lifecycle.md` | Delete; unlinked Withdrawn README row | done 2026-07-17 |
| Index rows, conventions block, back-links | `docs/adr/README.md`, `CONTEXT.md`, `docs/architecture/integrations.md`, `docs/architecture/system-overview.md`, `docs/architecture/eva-sentry-api.md` | Phase 4 pass | done 2026-07-17 |
| Untouched by design | `0001`, `0003`, `0005`, `0018`, `0019`, `0022` | — | confirmed |

## (b) Follow-up tickets

Minted in `docs/tickets/backlog/` with `research-link` → this review. IDs assigned at mint after a
fresh status-folder rescan.

| Plan id | Ticket | Scope |
|---|---|---|
| T1 | TKT-238 | Corpus subset-address merge (platform) |
| T2 | TKT-239 | `-002`/`-003` registration suffix for concurrent image-first cases (intake; relates TKT-193/172/177) |
| T3 | TKT-240 | Incident-date + principal eliminators (intake; realignment R5) |
| T4 | TKT-241 | Odometer vision reader + DVSA cross-check (enrichment; activates the TKT-152 tier) |
| T5 | TKT-242 | Network-drive VRM scan channel (intake) |
| T6 | TKT-243 | Code/docs hygiene: `dedup.ts` header, ADR-0023 mis-citations, `A.`/`AP.` comments, PCH `AP.` allowlist, `locValue` residue |
| T7 | TKT-244 | Triage vocabulary code additions (email; behaviours live in TKT-188/184/186) |
| T8 | TKT-245 | Service-trust seam: decide/harden `withServiceAuth` (platform/security) |
| T9 | TKT-246 | Platform ADR backfill 0026–0030 as one ticket (operator drafts/approves the decisions) |

Already existing, deliberately not re-minted: TKT-068 (assistant attach), TKT-154/218 (MCP lane),
TKT-057 (`A.`/`AP.` flow — D1b ruling recorded), TKT-162 (nested audit folder), TKT-219/220/221/222
(retro).

## (c) TKT-206 riders — dangling ADR-0017 citations

ADR-0017 is deleted by this review; its number citations remain in code, infrastructure, and ticket
records **by design** (no `done/` ticket record is ever edited). TKT-206 must sweep them when it drops
the retention architecture:

- `apps/web/src/.../case-detail.controller.tsx:462`
- `services/data-api/src/.../activity-routes.ts:117`
- `packages/domain/src/dto/index.ts:138`
- six `services/functions/*/infra/main.bicep` retention parameters
- `docs/architecture/data-protection.md` — rework the two-clock section; **rider: the rework must
  RETAIN the DSAR cross-store coverage list** (PostgreSQL, source/transient bytes, Archive, mail
  references, File Request links, identifier strings) — after 0017's deletion it is the only home of
  that enumeration
- ticket records citing 0017: TKT-160, TKT-217 (leave as history; TKT-206 notes them)

## (d) Verification state

| Gate | State |
|---|---|
| `npm run check:docs` (links, BFS reachability, leakage) | done 2026-07-17 |
| `npm run check:tickets` | done 2026-07-17 |
| `npm run check:inventory` + reconcile check mode | done 2026-07-17 |
| `npm run check:line-endings` | done 2026-07-17 |
| `npm run check:layout` | done 2026-07-17 |
| `npm run check:data-authority` | done 2026-07-17 |
| `npm run check:forbidden` | done 2026-07-17 |
| Rendered-markdown eyeball: ADR README, reviews README, this register | done 2026-07-17 (escape-aware table-structure check, all reshaped tables) |
| Full `node verify-all.mjs` | 2026-07-17: 33/34 pass; the single failure was a stale reconciliation ledger from regeneration order, fixed and both ledger checks verified at the committed fixed point (a full re-run was stopped early; re-run before push) |
| Push / PR | operator-gated; not part of this change set |

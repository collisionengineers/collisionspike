# Phase 1 — Intake & Case Tracking (M1 vertical slice)

**Goal:** an email (or manual upload) becomes a tracked Dataverse **Case**, parsed into the 12 EVA
fields with provenance, visible in the Code App — with flows imported (off) ready for activation.

**Status:** 🟡 **Built; live email intake + the downstream flow chain are operator-gated.** The parser
Function, Dataverse schema, corpus, and Code App are live; the digital@ intake webhook is live-verified
(one mailbox). See [../../../CURRENT_STATUS.md](../../../CURRENT_STATUS.md).

## Implementation checklist (by feature, in build order)

**1a · Parser** — [parser/fix-parser-and-provider-match.md](./parser/fix-parser-and-provider-match.md)
1. [x] Parser engine **vendored** into the FC1 Function package (PDF/DOCX/DOC/EML/MSG)
2. [x] **Parser Function live** (Flex Consumption, function-level auth, ≈£0 idle)
3. [x] **12-field EVA extraction** live-verified; adapter maps legacy → EVA keys
4. [x] **Parser custom connector** created + bound; Code App parse routed through it (CSP-safe)
5. [x] **B2** — claimant telephone/email extracted (parser redeployed 2026-06-19)

**1b · Dataverse schema**
6. [x] 11 tables, 19 choice sets, 15 relationships, 3 alt keys, 18 env-vars (M1 froze 11; +VALUATION/AZURE_VISION +Phase-7 BOX_* gates) (solution `CollisionSpike`)

**1b.1/1b.2 · Provider corpus** — [corpus/dataverse-corpus-incorporation.md](./corpus/dataverse-corpus-incorporation.md)
7. [x] Initial seed + provider/garage/location analysis (`raw/.../outputs/`)
8. [x] Corpus incorporation — scripts 10–14 + verify passed. _(The original 2026-06-20 interim load — an 871-row InspectionAddress set — was later superseded by the ADR-0016 full-replace corpus; **live counts now live only in the registry** [../../architecture/live-environment.md](../../architecture/live-environment.md), single source [../../../LIVE_FACTS.json](../../../LIVE_FACTS.json).)_ **37 over-length principal codes deferred** → [../../gated.md](../../gated.md)

**1b.3 · Clarifying-info** — [corpus/clarifying-info-ingestion.md](./corpus/clarifying-info-ingestion.md)
9. [ ] 🔒 Five operator worklists (code reconciliation, CONSIDER seeding, addresses→yards, garage↔provider, intermediaries) → [../../gated.md](../../gated.md)

**1c · Code App** — [code-app/ui-redesign.md](./code-app/ui-redesign.md) · [code-app/logo-fix-findings.md](./code-app/logo-fix-findings.md)
10. [x] Deployed + live, wired to Dataverse; manual-intake (upload → parse → Case) works
11. [x] Logo / brand fonts / nav fixed; **UI/UX review 190626 actioned** (see `docs/reviews/190626/`)
12. [ ] **Delete / remove case** — confirmed-delete action on `CaseDetail` (or queue context menu); hard-deletes the Case and cascades Evidence rows; for junk/duplicate cases only. Complement to the `junk-case-cleanup` CLI skill. Must write an `AuditEvent` on delete. If Box is live (`BOX_API_ENABLED`), prompt for manual Box-folder archival first — Box is never deleted automatically (ADR-0017).

**1d · Flows (imported OFF)** — also covered by [phase-1-operational.md](./phase-1-operational.md) (bridge 1→2)
13. [x] 17 flows (state=off except case-resolve); intake `MinIntakeDate` + attachment guards; Message-ID dedup + merge-by-registration case-resolve (ADR-0010)
14. [ ] 🔒 Activate the downstream chain (classify-persist / parse / status-evaluate) — see **Phase 2**

## Plans in this phase

Implementation: [phase-1-intake-and-case-tracking-implementation.md](./phase-1-intake-and-case-tracking-implementation.md) ·
Bridge to activation: [phase-1-operational.md](./phase-1-operational.md) ·
features: `parser/` · `code-app/` · `corpus/`.

## Needs the operator

Live email intake, the downstream flow-chain activation, the clarifying-info worklists, per-provider
sender domains, and the residual over-length principal codes are all in [../../gated.md](../../gated.md).

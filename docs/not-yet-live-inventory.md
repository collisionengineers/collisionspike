# What's not fully live — full inventory

A single consolidated map of everything in `collisionspike` that is not fully live end-to-end:
work waiting on a human, code shipped but switched off, gates that are *on* while the code
underneath is still a stub, work that's only roadmapped, proposed-but-not-accepted ADRs, and
things deliberately parked by design. Assembled by cross-reading `docs/gated.md`, `ROADMAP.md`,
`CURRENT_STATUS.md`, `docs/tickets/BOARD.md`, `LIVE_FACTS.json` /
[architecture/live-environment.md](./architecture/live-environment.md), `docs/plans/**`, and
`docs/adr/**`, plus a grep of `api/`, `orchestration/`, and `mockup-app/src` for gate reads and
TODO/stub markers.

> **Live numbers.** This page states gate states qualitatively (on/off/stub) for orientation
> only — the current authoritative value of any gate is
> [`LIVE_FACTS.json`](../LIVE_FACTS.json) / [architecture/live-environment.md](./architecture/live-environment.md).
> Full operator steps for every item in §1 live in **[gated.md](./gated.md)** — this page doesn't
> repeat those steps, only indexes them alongside the other four categories gated.md doesn't cover.
>
> _Point-in-time snapshot — 2026-07-03. Re-derive from the sources above if this drifts._
>
> **Cutover supersession (2026-07-13):** TKT-178 is the authority for production
> Archive/EVA/Case-PO work. No item in this older snapshot independently permits a root retarget, Archive
> write or EVA production flip. The signed/checksummed spreadsheet, authenticated contract-verified
> production EVA API and exact approved production Archive root/write scope are all mandatory.

## 1. Operator-blocked (needs a human to act)

Full detail and step-by-step instructions: **[gated.md](./gated.md)**. Summary of what's open:

- Azure Free-Trial → Pay-As-You-Go upgrade (hard ~30-day deadline) — gated.md A1.
- Staff app-role assignment incomplete — only one principal assigned, rest get 403 — gated.md C1.
- TKT-178 Graph-renewal certification telemetry is missing: current shared trace text does not identify
  durable vs manual/timer origin; the source-bearing custom event remains an engineering hard gate — gated.md §B.
- `EVIDENCE_BLOB_CONNECTION` unset, orch MI not app-role-granted on the Data API, Monitor heartbeat alerts not wired — gated.md B3.
- Outlook "real move" filing (TKT-054) — needs `Mail.ReadWrite` Exchange-RBAC grant + gate flip + manual live test — gated.md B4.
- EVA REST remains blocked; test credentials are only an early prerequisite. Production activation also
  requires every TKT-178 global gate and named window — gated.md D1.
- Box test-scope artifacts may be prepared within the current mirror, but production webhook targeting and
  any `BOX_ALLOWED_ROOT_ID`/`BOX_FOLDER_ROOT_ID` retarget remain blocked by TKT-178. The current facade cannot
  pre-stage outside the mirror root, treats a missing scope lock as lifted and writes synchronously;
  missing-value fail-closed behavior, exact-target staging and durable Box-event buffering are hard gates.
  Never clear the scope lock — gated.md D2 /
  [azure/box-activation.md](./azure/box-activation.md).
- Missing provider email domains (DFD, Fairway, Regent, Castle, Stallion, Relay, NETWORK HD UK, YM Law) — gated.md D3/D4.
- Rules-engine-v2 activation chain: sibling PR merge/tag, taxonomy DDL delta apply, identification seed delta apply, `EMAIL_AI_ENABLED` production flip (blocked also on an unimplemented `work_provider.ai_allowed` check), Foundry keyless-auth sign-off, live PII export approval — gated.md D6/D7/D8.
- Parser Function key rotation (old key scrubbed from source but remains in git history) — gated.md D5.
- Evidence-store hardening (Blob soft-delete/versioning/retention, Key Vault purge-protection) required before any disposition/purge job runs — gated.md E1.
- Data-governance policy/legal inputs: retention period, anonymise-vs-delete policy, lawful basis, legal-hold rule, ICO registration, per-AI-gate sign-off — gated.md E2 / ADR-0017.
- Ticket-level blockers: **TKT-004** is now subordinate to TKT-178's complete three-input cutover gate (a
  root id alone is insufficient); **TKT-010** needs `Superuser` assignment for delete-case; **TKT-032**
  needs an operator routing decision — [tickets/BOARD.md](./tickets/BOARD.md).

## 2. Feature-gated-off (built + deployed, default-off flag)

| Gate | State | Controls | Notes |
|---|---|---|---|
| `EVA_API_ENABLED` | off | EVA Sentry REST direct submit | Real code exists; gated pending Minotaur's vendor patch (single-principal-code limit), no ETA — ADR-0005 |
| `VALUATION_ENABLED` | off | Valuation/Companion-Report evidence | M3, planned only, zero call sites |
| `AZURE_MAPS_ENABLED` | off | Postcode/geocode upgrade | Falls back to postcode.io |
| `OUTLOOK_MOVE_ENABLED` | off | Move triaged email into an Outlook folder | Full path deployed dark, pending Exchange RBAC re-consent (gated.md B4) |
| `EMAIL_AI_ENABLED` / `AI_MODEL_ENDPOINT` / `AI_MODEL_DEPLOYMENT` | absent | AOAI triage-classify assist | Foundry models deployed (`gpt-5`, embeddings) but nothing wired live (gated.md D6.3) |
| `TRIAGE_*` (ref-gate, cancellation, images-routing) | off | Stage-B triage-policy actions | Deployed dormant; shadow-decision telemetry only, acting path stays `proceed_default` |
| `OCR_SCANNED_PDF_ENABLED` / `PLATE_OCR_ENABLED` | off | OCR host wiring | Host deployed, connector wiring + flip remain |
| `FULL_AUTO_ENABLED` | not implemented | Aggressive provider full-automation mode | Named only in a code comment (`intakeOrchestrator.ts`); no accessor/env-read anywhere |

> **Removed 2026-07-03:** `COPILOT_ENABLED`, `BOX_EMBED_ENABLED`, and `BOX_METADATA_ENABLED` were
> deleted from code (not merely left off) — the Copilot Studio agent, Box-embed, and Box-metadata
> options are formally dropped, not planned features awaiting a future flip.

## 3. Gate is ON but the code underneath is a stub

These look live from the flag but return a hard-coded no-op:

- **`BOX_FILEREQUEST_ENABLED`** is on, but `caseBoxCopyFileRequest` (`api/src/functions/cases.ts:1046-1079`) always returns `gated_off` — "the box-fn copy bridge is not yet wired."
- **`caseBoxFinalize`** (`api/src/functions/cases.ts:1081-1097`) — hard-coded `gated_off` regardless of `EVA_API_ENABLED`/`BOX_API_ENABLED` state.
- **AI-suggestions model call** (`api/src/functions/ai-suggestions.ts:445-465`) — `callModelForSuggestions()` is dormant, returns `[]` unconditionally (TKT-015 follow-up to wire a real model call).
- **Inspection-decision durable write** (`api/src/functions/inspection.ts:184-187`) — silently no-ops (`persisted:false`) when the write path isn't wired.
- **Image role-tagging / person-reflection classification** (`orchestration/src/functions/activities/extractImages.ts:6-9`) — explicitly deferred to M2; MVP only extracts + OCRs.
- **Unmatched-image routing lane** (`intakeOrchestrator.ts:177-180`) — `route_images_unmatched` triage action is a documented follow-up, not built (ADR-0015 §5).
- **Location-assist confirmed-provenance save** (`mockup-app/src/screens/CaseDetail.tsx:747-755`) — UI captures state for a future `InspectionAddress` save path that doesn't exist yet.
- **Admin "Assisted import" preview** (`mockup-app/src/screens/Admin.tsx:855-874`) — UI present, disabled, "not available yet."
- **`CollisionSpike.Engineer` app role** — defined in Entra, zero enforcement/assignment; reserved for future assessment functionality.

## 4. Planned / roadmapped, no code yet

- **M3 milestone entirely** — Valuation, WhatsApp bulk-media import (ADR-0007).
- **Phase 5b — image classification & reflection exclusion** (ADR-0009), still not built.
- **Phase 8b/8c** — Inbox/Triage SPA screen, gated LLM-assist stage.
- **Phase 9 — data governance/retention/erasure build** — schema + purge flow authored offline, not deployed; DSAR/DPIA docs authored, policy inputs pending (see §1).
- **API intake channel** (providers POST work directly over HTTP) — no phase plan authored yet.
- **Parser custom container** (LibreOffice for legacy `.doc`) — blocked on migrating the parser off FC1 Flex Consumption.
- **Box `ListFolder` reconciliation sweep** (webhook-miss backstop) — documented, not built.
- **Box permanent per-sender drop-boxes** (Phase 7 B3) — not built.
- Ticket backlog with no code yet: **TKT-018, 022, 024, 026, 034, 035, 044, 052** — [tickets/BOARD.md](./tickets/BOARD.md).

## 5. Proposed (not-accepted) ADRs

Per [adr/README.md](./adr/README.md), ADRs 0015–0019 are still **Proposed**, not Accepted:

- **ADR-0015** — email triage taxonomy; partially realised by Phase 8, continued as ADR-0019.
- **ADR-0016** — inspection-address corpus regen; core replace done live, proximity-ordering helper (#2b) still deferred.
- **ADR-0017** — retention/erasure/PII lifecycle; most items deferred pending operator/legal (see §1 E2).
- **ADR-0018** — parser-engine vendoring hardening; needs the sibling repo to commit/tag a release first.
- **ADR-0019** — triage Stage A/B/C split; realised by the not-yet-fully-deployed Rules Engine v2 (gated.md D6-D8).

## 6. Deferred/reserved by design (not gaps — intentional)

- Box embed iframe — formally dropped, gate removed from code 2026-07-03.
- Box Metadata-Query — formally dropped, gate removed from code 2026-07-03. Box Governance retention / AI Units remain tier-gated placeholders.
- No automated deletion from Box, ever — standing principle.
- Inspection-address runtime matcher — removed on purpose per ADR-0013, not coming back.
- `CollisionSpike.Engineer` role — deliberately unassigned pending future scope.
- React Native companion app — explicitly future-only, out of scope for the current responsive-web-first design.
- `SILVER 100` / `GGP→GG` / `ZEN==ZENITH` provider-code merges — deferred to the clarifying-info phase.
- Non-image transient Blob bytes retained by `box-blob-purge` — deferred follow-up.
- The entire prior Power-Platform-era operator backlog (see gated.md's "Historical" section) — decommissioned, not pending.

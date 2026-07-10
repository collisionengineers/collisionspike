# Changes — TKT-021: Resolve Connexus claims-manager to the real provider (PCH/SBL)
## Status
now — Image-Source intermediary resolution code deployed live 2026-07-02 (rules-engine-v2 Phase 3);
activates once the D8 seed delta (Connexus → PCH/SBL) is applied — see [verification.md](./verification.md).

## 2026-07-10 — Reopen fix: explicit intermediary/unresolved-principal Held reason

**Why.** The 2026-07-10 verify-sweep (W5) proved acceptance arms 1–2 live but failed arm 3 as
written: the Held lane in `api/src/functions/internal.ts` (cases/resolve `newClient` branch) wrote
the generic *"New client — no work provider matched for sender @connexus.co.uk"* note + *"New client
routed to Held (no work provider matched)"* audit for EVERY unmatched sender — branding a
known-intermediary sender (Connexus) as a new client, the exact misframing this ticket removes.
Scope per [evidence/reopen-followup-100726.md](./evidence/reopen-followup-100726.md): wording fix
only, forward-only (the 9 existing cases' notes stay as-is).

**What.**
- New exported pure function `buildHeldReason` in `api/src/functions/internal.ts` (placed above the
  cases/resolve route) — display names in, staff-plain strings out. Three shapes:
  - **True unknown sender** (no intermediary match) → the existing New-client note/audit wording
    **verbatim** (unchanged).
  - **Known intermediary, principal unresolved** → note "Held — intermediary sender": *"Intermediary
    sender (Connexus): the instructing provider could not be determined from the instruction.
    Candidates: Performance Car Hire, SBL. No Case/PO minted; pick the provider and confirm before
    EVA."* + audit *"Intermediary sender routed to Held (principal unresolved)"*. Empty-tolerant: a
    missing display name or an empty candidate list degrades the wording (never throws, never falls
    back to "New client").
  - **Known intermediary, provider already resolved from the instruction content**
    (applyParserFields' content match runs before the note is written — acceptance arm 2) → the note
    must not claim "unresolved": *"…the instructions identify Performance Car Hire as the
    provider…"* + audit *"…(provider identified from the instructions)"*.
- The Held seam now branches on the request's intermediary match (`intermediaryImageSourceId` +
  candidates, already on the wire payload) and resolves display names by id (`image_source.name`,
  `work_provider.display_name`, and the case's post-applyParserFields provider) inside a best-effort
  try/catch — a lookup failure degrades to name-less intermediary wording and never blocks intake.
  No hardcoded Connexus strings. The intermediary audit `after` carries
  `intermediary: true` + `imageSourceId` + `candidateProviderIds` (+ `resolvedProvider` when set)
  instead of `newClient: true`.
- Unit tests: 6 new cases in `api/src/functions/apply-parser-fields.test.ts`
  (`buildHeldReason` describe) pinning BOTH branches' exact strings, the resolved-provider shape,
  the no-domain/new-client edge, empty-candidates tolerance, and name-lookup-failure degradation.

**Files.**
- `api/src/functions/internal.ts` — `buildHeldReason` + `HeldReason` (new, above the cases/resolve
  route block); the `created.newClient` note/audit seam rewritten to branch + name-lookup.
- `api/src/functions/apply-parser-fields.test.ts` — header note + new `buildHeldReason` describe
  block (6 tests).

**Gates run (Windows).**
- `npm --prefix api run build` — clean.
- `npm --prefix api run test` — 40 files / **421 passed** (415 pre-existing + 6 new).
- `node verify-all.mjs` — 11 passed, 1 failed, 9 skipped; the single FAIL is the known
  environmental parser-pytest gate on this box (root cause `No module named 'fitz'` — PyMuPDF absent
  from `functions/parser/.venv`; 3 tests fail with that one import error vs the memory-baselined 1 —
  venv drift, Python-side, unreachable by this TS-only diff).

**Deploy (cespk-api-dev, 2026-07-10).**
- `node build-api.cjs` → "api bundle OK"; `npm install --prefix deploy/api --omit=dev` (node_modules
  shipped); smoke `node -e "require('./main.cjs')"` → test-mode listing of **96** registered
  functions (no `import.meta.url` crash).
- `func azure functionapp publish cespk-api-dev --javascript` from **Windows** (per memory; WSL func
  broken on this box) — publish succeeded, function invoke-URL listing returned.
- Post-deploy: live function count **96** (= LIVE_FACTS.json api count, unchanged); ARM
  `properties.state` = **Running** (via `az resource show`; `az functionapp show --query state` FC1
  quirk avoided); no-auth probe `GET /api/activity` → **401** (healthy auth-gated response).

**Exit.** Back to verify (PENDING) — the live wording proof lands on the next unresolved Connexus
arrival (note "Held — intermediary sender" + audit "…principal unresolved" on the new case).
## Commits
- `3a772d1` — feat(identification): Image-Source intermediary resolution + parser-string →
  work_provider_id mapping (ADR-0011). `matchSenderIdentity` now resolves address-level provider >
  intermediary > domain-level provider, and provider-match records carry the intermediary `image_source`
  + its N:N provider candidates. The Connexus→{PCH,SBL} seed row itself rides the operator-gated D8 delta
  ([`2026-07-02-rules-engine-v2-identification.sql`](../../../../migration/assets/schema/deltas/2026-07-02-rules-engine-v2-identification.sql)),
  not yet applied live.
## Summary
Captures the operator's ask to treat Connexus as an intermediary and resolve the
underlying principal (PCH or SBL) from the email/attachment. Related to TKT-001
(provider matching at intake) and to TKT-028 (work_provider not populating). The resolution code is
deployed; the Connexus intermediary row + PCH/SBL join is data (D8), not yet live.

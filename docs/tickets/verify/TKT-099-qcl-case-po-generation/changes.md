# Changes — TKT-099: QCL cases not generating Case/PO correctly

## Status
Root-caused + fixed live (2026-07-09, PLAN-003 intake-correctness wave). The fix is a DATA fix (the
operator-confirmed domain seed) — the allocator code was never broken.

## Root cause (data-traced)

QCL's corpus row (`d6cf7197…`, principal `QCL`) knew ONLY `qc-law.co.uk`. Every
`vd@complexreports.com` instruction therefore failed providerMatch → the case was created as a
**new client → Held, NO Case/PO minted, NO Box folder** (the mint is a one-time decision inside the
create transaction). The parser's content-match then filled `work_provider_id = QCL` AFTER create —
which is exactly why the operator saw "a case under QCL without a Case/PO": the post-create
fill-if-empty deliberately never mints (the documented HELD/on_hold behaviour in
`api/src/functions/internal.ts` `applyParserFields`). 25 complexreports emails and 11 Held QCL
cases (case_refs `226059.TA`…`226085.TA`) carried this shape at investigation time.

## Fix shipped

- **Delta `deltas/2026-07-09-intake-wave-data-fixes.sql` §A (APPLIED LIVE, backup-first):**
  `complexreports.com` appended to QCL's `known_email_domains` (operator-confirmed 2026-07-08:
  "This email sender is always for QCL at present"). Post-check: the row now reads
  `qc-law.co.uk` + `complexreports.com`. From the NEXT complexreports intake, providerMatch resolves
  QCL at case-create → the advisory-locked mint issues `QCL26NNN` → the Box folder follows
  (boxFolderCreate keys off the returned casePo).
- The QCL duplicate pair (226070.TA ×2) was merged under TKT-092's data fix (same delta, §C).
- Regression coverage: the allocator path itself is already pinned by the existing mint/dedup
  suites; this wave adds the dedup-ladder regression tests (`packages/domain/src/domain/dedup.test.ts`)
  that include a QCL-shaped ref/vrm fixture, and the TKT-073 clamps ensure a QCL create can no
  longer die on an over-length ref/VRM.

## Deploy + data state
Data delta applied live 2026-07-09 (backup table `backup_20260709_intake_wave`, work_provider row
snapshotted). No code deploy was required for THIS ticket's fix; the wave's api/orch deploys are
recorded in the registry.

## Remainders (honest)
- **The 11 existing Held QCL cases keep no Case/PO** — by design (Held new-client cases need staff
  confirm; nothing retro-mints a PO for an already-created case). Staff can use the Set-Case/PO edit
  (TKT-058 mechanism) or confirm/re-drive each. Flagged for the operator rather than auto-minted.
- Live proof of the end-to-end mint (`QCL26001…` + Box folder) needs the NEXT real complexreports
  intake — verifier item.

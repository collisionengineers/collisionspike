# Changes — TKT-220: Close the remaining retro-vs-intake parity gaps

## Status
verify — implemented 2026-07-16 (same branch as TKT-219, PR #102); offline-tested; rides the next
orchestration + data-api deploy.

## What changed

- **G3** — `retro-case.ts` `finishPersisted`: after the Outlook-arm folder ensure succeeds, the
  WRITABLE folder gets `boxArchiveEvidence` (best-effort; the Box/combined arms still skip it —
  their archive folder is read-only by design).
- **G4** — no change needed: TKT-219's unified `finishPersisted` already runs the post-create
  chain for `created` AND `already_exists_linked` on every arm.
- **G5** — `mapRetroParse` prefers `parseResult.resolvedWorkProvider` (cross-document provider)
  over the chosen envelope's extraction, mirroring intake exactly.
- **G6** — `LandedAttachment.sha256` carried from `uploadEvidenceBytes` at all three Box-rung
  landing sites (raw .eml, exploded attachments, document) so TKT-133 (case_id, sha256) dedup
  matches Box-rung retro evidence.
- **G7** — a rung-1 any-status link now runs classifyPersist + extractImages + statusEvaluate for
  the TRIGGER's own attachments (best-effort; boxArchiveEvidence deliberately absent — the linked
  case's folder may be under the read-only archive roots).
- Manual drain carries `classification.subtype` into `decideCaseType` (classifier corroboration
  restored on drain runs).
- A contradicted corroboration no longer forwards the suspect parser fields into the demoted
  Held anchor (`parserEva`/`parserVrm`/`parserRef`/mileage blanked).
- `retro-routes.test.ts` exercises the `refused_category` branch with the guard deciding
  (mockResolvedValue('non_actionable') → refused + warning audit + no insert).

## Gates run
orchestration build ✓ test 510 ✓ · data-api build ✓ test 1000 ✓.

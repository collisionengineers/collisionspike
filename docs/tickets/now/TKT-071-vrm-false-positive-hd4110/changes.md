# Changes — TKT-071: Job references like HD4110 wrongly captured as a vehicle registration

## Status
not started

## PLAN-003 classifier wave — 2026-07-09

**Root cause (confirmed):** the TS filter's LOOSE dateless anchor was document-wide — any
"vehicle"/"registration" anywhere in a letter of instruction licensed every loose token, so the
subject job ref `HD4110` (postcode-area letters + digits) read as a mark. The Python sniff already
used a ±30-char window, so this family was TS-side.

**Shipped:**
- `packages/domain/src/domain/vrm-filter.ts` — proximity anchoring (±40 chars) replaces the
  document-wide test; a postcode-area-headed candidate (HD, LS, …, any digit count — new
  `isPostcodeAreaHead`) now needs the anchor IMMEDIATELY preceding it (`TIGHT_ANCHOR`, 16-char
  lookbehind); month/day + function-word denylists added in lockstep with the engine.
- Python mirror (sibling-first per ADR-0018, commit `8e7f2f7`, tag **engine-v2.10**, re-vendored):
  `_canonical_body_vrm` gains the same tight-anchor rule for postcode-area heads
  (`_loose_alpha_head_is_postcode_area` + `_VRM_TIGHT_ANCHOR_RE`); `vrm_candidate_is_bad` carries the
  shared denylists.
- Fixtures: `vrm-filter.test.ts` 22→36 (HD4110 subject → `''` even with "vehicle" elsewhere;
  `registration HD4110` → accepted; every prior fixture unchanged); sibling suite +tight-anchor tests.

**Data fix (audited, backup-first):** delta `2026-07-09-vrm-junk-cleanup.sql` applied live — see
[evidence/data-fix-2026-07-09.md](./evidence/data-fix-2026-07-09.md) for every cleared value
(case_ 2 rows, inbound_email 9 rows incl. the HD4110 row; post-check 0 junk remaining; backup table
`backup_20260709_vrm_junk`). Devnote item 5 checked: the `YM Law/ NETWORK HD UK` (YML) provider row
exists + active but `known_email_domains` is EMPTY — operator-reviewable corpus add, NOT applied.

**Deploys/probes:** parser republished at engine-v2.10 (`--build remote`); orch republished (the
intake sniff imports the fixed `@cs/domain` filter). Live `POST /api/classify-email` on the HD4110
subject shape returned `body_vrm: ""` (probe 4, 2026-07-09).

**Remainders:** verification.md stays PENDING — the "live intake replay" + "recall guard on a real
inbound" proof classes are for the verifier (the live probe covers the classify surface, not a full
e2e intake).

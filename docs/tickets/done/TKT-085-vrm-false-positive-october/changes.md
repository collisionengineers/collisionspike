# Changes — TKT-085: Registration on A.PCH26003 logged as OCTOBER (VRM false positive)

## Status
not started

## PLAN-003 classifier wave — 2026-07-09

**Root cause (ESTABLISHED, not assumed):** "OCTOBER" appears NOWHERE in the source email (raw .eml
grep = 0 hits; the message is the TKT-093 forwarded Audatex email from pch-ltd.com). It entered via
the **/parse VRM path**: `caseResolve` stamps the parser VRM onto BOTH `case_.vrm` AND
`inbound_email.body_vrm` (`services/data-api/src/features/` — "upgrade its body_vrm to the best VRM").
The live FC1 parse of the attached Audatex PDF surfaced the month word; a local engine-v2.10 re-parse
of the SAME PDF returns the real plate `BE57JDS`. The accepting hole: NO layer rejected an all-alpha
"mark" — the format check (`[A-Z0-9]{2,8}`) passes OCTOBER, provider label rules have no digit
requirement, and `_is_suspicious_value` had no all-alpha guard. Full trail:
[TKT-071/evidence/data-fix-2026-07-09.md](../TKT-071-vrm-false-positive-hd4110/evidence/data-fix-2026-07-09.md).

**Shipped (sibling-first, commit `8e7f2f7`, tag engine-v2.10, re-vendored):**
- `rules/engine.py` — `_VRM_MONTH_DAY_WORDS` denylist in `vrm_candidate_is_bad`; `_is_suspicious_value`
  VRM branch now rejects ANY all-alphabetic value (`compact.isalpha()` — every real UK mark carries a
  digit), so the junk is blanked and the digit-bound fallback (which finds BE57JDS) wins.
- `packages/domain/src/domain/vrm-filter.ts` — the mirrored `MONTH_DAY_WORDS` denylist + fixtures
  ("registration OCTOBER" → `''`; real mark next to a date word still extracts).
- Dual-suite fixtures: 19 month/day words parametrised in the sibling suite; 4 in vitest.

**Data fix:** `A.PCH26003.vrm` (OCTOBER) cleared + audited; the corpus sweep found ONE other
month/day-word VRM home (`inbound_email.body_vrm` on the source email) — also cleared; post-check 0
month/day-word VRMs remain anywhere.

**Deploys:** parser (engine-v2.10) + api + orch republished 2026-07-09.

**Remainders:** the correct plate for A.PCH26003 (`BE57JDS` per local re-parse) was NOT written back —
the fix clears junk only (never guesses); staff set it from the documents. NEW-TICKET CANDIDATE
(adjacent, reproduced): the same case's `case_ref` = `RIGERANT R1234YF` — the /parse
`_fallback_reference` captured a fragment of "REFRIGERANT R1234YF" from the Audatex PDF; the TKT-103
money guard covers the classifier ref path, not /parse `_fallback_reference`.

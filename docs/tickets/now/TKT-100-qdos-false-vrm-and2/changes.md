# Changes — TKT-100: QDOS false VRM "AND2"

## Status
not started

## PLAN-003 classifier wave — 2026-07-09

**Root cause (confirmed on all four samples):** "AND2" is a prose fragment of the QDOS signature
footer — "C/O Higsons Chartered Accountants, Offices 1 **and 2**, 1A King Street…". The PYTHON sniff
never extracted it (all four samples return `body_vrm: ""` under the engine, proven by direct runs) —
the false positive came from the **TS intake sniff** (`extractVrm` in
`packages/domain/src/domain/vrm-filter.ts`), whose loose-shape anchor was document-wide (any
"vehicle" in the email licensed "and 2" → AND2). Same defect family as TKT-071.

**Shipped:**
- TS filter: proximity anchoring (±40) + a `LOOSE_ALPHA_STOPWORDS` function-word head denylist
  (AND/THE/FOR/NOT/BUT/ARE/WAS/OUR/YOU/ALL/ANY/HAS/HAD/PER/VIA — function words nobody buys as a
  plate head; real dateless heads like VAN/JET deliberately NOT listed). QDOS-footer fixture + 3
  prose fixtures pinned in `vrm-filter.test.ts`.
- Python mirror (engine-v2.10): `_VRM_LOOSE_ALPHA_STOPWORDS` in `vrm_candidate_is_bad` +
  `_is_suspicious_value`; sibling unit tests pin `AND 2`/`THE 4` rejection and the QDOS footer shape.
- Eval pin: manifest item `tkt100-qdos-lead` (the Barry Pavlou sample,
  `receiving_work/existing_provider_instruction`) keeps the QDOS layout covered — the scorer asserts
  labels, so the VRM-absence pin itself lives in both unit suites.

**Data fix (audited):** `QDOS26056.vrm` (AND2) cleared + audited; 4 QDOS `inbound_email.body_vrm`
AND2 rows cleared (delta `2026-07-09-vrm-junk-cleanup.sql`, backup table retained; post-check 0).

**Deploys/probes:** parser engine-v2.10 + orch (TS sniff) republished. Eval `--check` clean at 87.9%.

**Remainders:** the four QDOS samples classify receiving_work/case_update per their attachment mix —
the QDOS handling lane itself is TKT-101/TKT-102 territory, untouched here.

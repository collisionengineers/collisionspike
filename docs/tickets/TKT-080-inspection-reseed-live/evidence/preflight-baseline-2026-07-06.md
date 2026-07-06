# Preflight baseline — live `inspection_address` (2026-07-06, pre-reseed)

Read from live `cespk-pg-dev` as the Entra admin + `SET ROLE csadmin` (RLS-bypass). This is the
**pre-reseed** baseline for the TKT-080 before/after diff. `LIVE_FACTS.json` recorded
`inspection_address: null` ("not re-counted") — the table is in fact populated (2210 rows), re-seeded
after the clean-slate reset.

## Totals
| bucket | n |
|---|---|
| **total** | **2210** |
| suggested (`source_label LIKE 'suggested%'`) — to be REPLACED | **2035** |
| NOT suggested (confirmed/other) — to be PRESERVED | **175** |

## By source_label
| source_label | n | fate |
|---|---|---|
| `suggested:eva_export` | 2035 | replaced by the corrected 920 seed |
| `(null)` | 136 | preserved (postcode-only `XX -- PC` rows, decision_mode 100000000) |
| `storage` | 36 | preserved (non-suggested; likely non-corpus artifact) |
| `repairer` | 2 | preserved |
| `confirmed:corpus` | 1 | preserved (hand-curated) |

## By decision_mode_code
| code | n | meaning |
|---|---|---|
| 100000003 | 2035 | Unknown/suggested (DDL default) |
| 100000000 | 174 | confirmed/manual |
| 100000001 | 1 | corpus-confirmed |

`confirmed rows to preserve = 175` (everything not `suggested%`). The 920 replace seed must leave all
175 byte-identical.

## Provider tokens today (from the label prefix `PROVIDER · address`) — the BAD naive parse
Top: OAK 323, RJS 180, MP 149, BLACK 146, QCL 140, FW 94, SWAN 84, DFD 82, GGP 70, BC 62, KBS 61,
SS 56, YML 55, WLS 40, ACSP 39, … plus single-letter tokens `R` 20, `D` 2.

**Evidence of the parse bug (the reason for TKT-075):** the two smoke-matrix providers **QDOS and PCH
are absent from the top 50** — QDOS/QCL/PCH work was mis-attributed to marker/single-letter tokens
(`a.qdos…`→`A`, `ap.qdos…`→`AP`) or scattered. QCL (140) and FW (94) survive intact. `RJS` (180) is the
mis-token flagged in TKT-090. After the TKT-075 rebuild, the provider breakdown should show real codes
(QDOS, PCH, QCL, FW, …) with QDOS/PCH prominent.

## Acceptance hook for TKT-080
Post-reseed: total stays ~2210±(dedup delta on suggested rows only); the 175 non-suggested rows are
unchanged (checksum); provider tokens become correct (QDOS/PCH present); every suggested row carries a
`provider=<CODE>` `source_note` token (today only 1 row has one).

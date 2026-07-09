# Circumstances coverage report — live Postgres, 2026-07-09 (PLAN-003)

Read-only measurement per the ticket's scope note ("measure circumstances coverage across
live cases so the residual gap is known"). Run as the Entra admin (`SET ROLE csadmin`,
RLS bypass needed for a cross-case read) over ACTIVE cases (terminal statuses
100000008-100000011 excluded). "Populated" = `eva_accident_circumstances` longer than 40
chars (a real narrative); "short" = 1-40 chars (suspect fragment).

## Overall (348 active cases)

| active cases | empty | short (1-40) | populated (>40) | populated % |
|---|---|---|---|---|
| 348 | 167 | 3 | 178 | 51.1% |

## By provider (descending case count)

| provider | cases | empty | short | populated | % populated |
|---|---|---|---|---|---|
| QDOS | 128 | 26 | 2 | 100 | 78.1 |
| Performance Car Hire (PCH) | 50 | 46 | 0 | 4 | 8.0 |
| AX | 35 | 0 | 0 | 35 | 100.0 |
| (no provider) | 16 | 16 | 0 | 0 | 0.0 |
| Oakwoods Solicitors | 13 | 6 | 1 | 6 | 46.2 |
| BlackStone | 12 | 12 | 0 | 0 | 0.0 |
| QCL | 11 | 11 | 0 | 0 | 0.0 |
| Knightsbridge (KBS) | 10 | 2 | 0 | 8 | 80.0 |
| Robert James Solicitors | 9 | 4 | 0 | 5 | 55.6 |
| Fairway Solicitors | 8 | 7 | 0 | 1 | 12.5 |
| Smart Business Link | 8 | 1 | 0 | 7 | 87.5 |
| Montreal Prestige | 8 | 8 | 0 | 0 | 0.0 |
| (blank provider name) | 6 | 6 | 0 | 0 | 0.0 |
| Auto Logistic Solutions Ltd | 6 | 5 | 0 | 1 | 16.7 |
| Swan | 5 | 5 | 0 | 0 | 0.0 |
| YM Law / NETWORK HD UK | 5 | 0 | 0 | 5 | 100.0 |
| Baker Coleman | 4 | 4 | 0 | 0 | 0.0 |
| DFD / Also Car Claims | 4 | 0 | 0 | 4 | 100.0 |
| KMR | 2 | 2 | 0 | 0 | 0.0 |
| Accident Specialists (Direct jobs) | 2 | 1 | 0 | 1 | 50.0 |
| Kerr Brown Partnership | 2 | 2 | 0 | 0 | 0.0 |
| Woodlands | 1 | 1 | 0 | 0 | 0.0 |
| Abrahams Solicitors | 1 | 0 | 0 | 1 | 100.0 |
| Savas & Savage | 1 | 1 | 0 | 0 | 0.0 |
| QCL (variant name) | 1 | 1 | 0 | 0 | 0.0 |

## Reading the residual (named follow-up candidates)

- **The dropped sample (Oakwood .DOC + carrier .eml) contains NO circumstances narrative
  at source** — verified 2026-07-09: the RTF-in-.DOC instruction letter carries only
  `Accident: <date>` and the carrier email only a vehicle-status advisory (total loss /
  unroadworthy). Correct extraction is EMPTY; pinned as the sibling `OAK_RTF_01` fixture
  so junk can never fill it. Part of Oakwood's 6/13 empty is therefore a SOURCE gap, not
  a parser gap.
- **Performance Car Hire (PCH) 46/50 empty** is the largest single residual — the PCH
  instruction templates need the same anchored-sample treatment (follow-up ticket
  candidate; no failing PCH sample is on file in this ticket's evidence).
- **BlackStone 12/12, QCL 11/11 (+1), Montreal Prestige 8/8, Swan 5/5, Baker Coleman 4/4
  empty** — per-layout follow-up candidates; need one dropped sample each to anchor.
- **(no provider) 16 + blank-name 6** — provider-resolution gaps, not circumstances
  extraction (the identification lane).
- QDOS 26 empty out of 128 — QDOS emails/letters that genuinely carry no narrative
  (the "New completed lead" family typically has none) mixed with possible layout
  misses; needs sampling before a ticket is cut.

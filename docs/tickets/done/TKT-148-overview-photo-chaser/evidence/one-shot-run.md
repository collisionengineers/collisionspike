# TKT-148 one-shot run — 2026-07-10

SQL-parity admin-window pass (WSL Entra-admin + `SET ROLE csadmin`, transient firewall rule
trap-deleted — post-run rule list = `AllowAzureServices` only). Single transaction; the
candidate backup CSV was written BEFORE any INSERT. Driven this way because the deployed
`/api/internal/cases/{id}/status-evaluate` seam needs an API-audience token the workstation
cannot mint (az CLI AADSTS65001) — the SQL reproduces the deployed detector's predicate,
guard, row values and audit shape exactly (single deliberate delta: the audit `after` JSON
carries `"oneShot":"TKT-148"` so these rows are distinguishable from organic detector mints).

## Numbers

| Measure | Value |
|---|---|
| Candidate cases found (predicate + guard) | **31** |
| Suggested chases minted (all status `drafted`) | **31** |
| Per-case `chaser_sent` audit rows written | **31** |
| Candidates remaining after the pass (idempotency re-check) | **0** |

Recon ~25 min earlier found 27 candidates; the 4 extra (ALS26007, A.QDOS26042, QDOS26072,
QDOS26073) were overview-less cases then still holding still-unclassified photos — the
TKT-146 classify sweep drained them in the interim, exactly the hold-off guard working.

- [one-shot-backup-candidates.csv](./one-shot-backup-candidates.csv) — the 31 candidates
  (case id, Case/PO, VRM, status, provider, counts) captured BEFORE minting.
- [one-shot-minted.csv](./one-shot-minted.csv) — chaser id per case.

## The acceptance case — A.QDOS26029

Case `ac34fae6-1b6f-4af6-b296-660d53631577` (VRM SB09XZS, status `missing_images`,
8 accepted photos, all damage close-ups, zero overview-role, zero unclassified, no prior
chasers). Chaser row (full-column capture, every field the case-detail read consumes):

```
id               | 93dfcb3a-695e-421c-ba44-143e27ddce3c
name             | Suggested chase — ask for a photo of the whole vehicle showing the registration plate clearly.
case_id          | ac34fae6-1b6f-4af6-b296-660d53631577
target_type_code | 100000002        (work provider)
target_name      | QDOS
channel_code     | 100000000        (email)
template_used    | Overview photo request
status_code      | 100000000        (drafted)
sent_by          | (null)
sent_at          | (null)
drafted_at       | 2026-07-10 12:15:03.883029+00
```

Paired audit event:

```
name        | Chase suggested (Overview photo request) — drafted for staff to send
actor       | (null — system pass, matching the internal detector seam)
action_code | 100000023 (chaser_sent)
after       | {"oneShot": "TKT-148", "chaserId": "93dfcb3a-695e-421c-ba44-143e27ddce3c",
               "suggested": true, "templateLabel": "Overview photo request", "acceptedImages": 8}
```

`rowToChaser` (the unchanged case-detail read mapper) renders this row as
`{ targetType: 'work_provider', targetName: 'QDOS', channel: 'email', templateUsed:
'Overview photo request', status: 'drafted', summary: 'Suggested chase — …' }` — the
mapping is pinned offline in `services/data-api/src/features/cases/overview-chase.test.ts` +
`services/data-api/src/features/cases/chase-route.test.ts` (shared-mapper contract).

## Negative control

A.PCH26008 (6 accepted photos, **4 overview candidates**): predicate false → **0 chaser
rows** after the pass. Also: the whole terminal/linked set and every case with fewer than
5 accepted photos or any unclassified photo was excluded by construction (see the backup
CSV's counts columns).

## Post-deploy smoke (the api deploy that carries the detector)

- `func azure functionapp publish cespk-api-dev --javascript` succeeded; function count
  **96** (unchanged — no new routes), ARM `properties.state = Running`.
- No-auth probe `GET /api/queues/triage/cases` → 401 (host serving, auth intact).
- App Insights (`cespk-api-dev` component, 15 min post-deploy): 94×200 + 5×204,
  **zero exceptions**.

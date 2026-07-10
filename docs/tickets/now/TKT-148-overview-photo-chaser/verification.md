# Verification — TKT-148: Targeted overview-photo chaser for cases whose photo sets genuinely lack a vehicle overview

## Verdict
PENDING

## Evidence
- Offline: `api/src/lib/overview-chase.test.ts` — 17 tests (predicate boundaries at N=5,
  zero-overview / zero-unclassified legs, terminal/retired exclusion, mint row shape +
  audit, lost-guard idempotency, advisory never-throws, handler-plain copy); api suite
  39 files / 412 tests green; `tsc -b` green.
- Live (DB layer): [evidence/one-shot-run.md](./evidence/one-shot-run.md) — 31 candidates,
  31 drafted chases + 31 audit rows minted 2026-07-10, 0 candidates remaining;
  **A.QDOS26029 chaser `93dfcb3a-695e-421c-ba44-143e27ddce3c`** (drafted, template
  "Overview photo request"); negative control A.PCH26008 (4 overview candidates) has 0
  chaser rows. Backup CSV captured before minting.
- Deploy: cespk-api-dev publish 2026-07-10, 96 functions, Running, no-auth 401,
  App Insights zero exceptions in the 15-min post-deploy window.

## Pending / gaps
- **Acceptance line 2 ("A.QDOS26029 surfaces one (live)") is proven at the DB + mapper
  layer, not yet through the deployed JSON read seam** — the workstation cannot mint an
  API-audience token (AADSTS65001), so `GET /api/cases/ac34fae6-…` / the SPA Chasers
  surface needs a signed-in check (verifier with SPA access, or the operator).
- The deployed detector has not yet been observed minting ORGANICALLY (the one-shot
  pre-empted the whole current corpus — by design). The next genuinely-new overview-less
  case (or a sweep-drained one) is the organic proof.

## How to re-verify
1. As a signed-in staff user (or ticket-verifier via the SPA/chrome-devtools): open case
   A.QDOS26029 (`ac34fae6-1b6f-4af6-b296-660d53631577`) — case JSON `chasers[]` contains
   one `status: 'drafted'`, `templateUsed: 'Overview photo request'` row with summary
   "Suggested chase — ask for a photo of the whole vehicle showing the registration plate
   clearly."; the case list "Last update" shows the chase activity.
2. DB spot-check (WSL Entra-admin + `SET ROLE csadmin`, transient firewall rule):
   `SELECT count(*) FROM chaser WHERE template_used = 'Overview photo request'` → 31 (or
   more, if the deployed detector has minted organically since);
   `... audit_event WHERE action_code = 100000023 AND after LIKE '%"oneShot": "TKT-148"%'`
   → exactly 31 (one-shot rows only).
3. Idempotency live: POST a no-op edit / re-run status-evaluate on A.QDOS26029 — no second
   suggestion row appears (guard: template exists).
4. Negative control: A.PCH26008 (`cd9b6a97-aa6e-426a-be17-91d0d3a0e066`) still has 0
   chaser rows unless staff logged one manually.
5. Organic-path watch: App Insights (cespk-api-dev) — audit writes with summary
   "Chase suggested (Overview photo request)" WITHOUT the oneShot marker = the deployed
   detector firing.

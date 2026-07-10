# Verification — TKT-090: Evidence filenames carry a wrong RJS provider prefix and UnknownVRM

## Verdict
PENDING

Verified by: ticket-verifier dispatch, 10-07-26 (verdict block transcribed 1:1 below). The generator
is proven fixed LIVE (behavioral probe of the active parser deployment, both shapes); the decisive
remaining artifact is the forward-clean Postgres sweep (Q1–Q3, queued for the W2 data pass) plus a
Box case-folder spot-check (outside the verifier's root-only Box allowlist).

## Ticket-verifier verdict (transcribed 1:1, dispatch of 2026-07-10)

### Verdict
PENDING

(Nothing failed — the deployed naming path is directly proven clean by a live compute-only probe; the
one decisive outstanding artifact is the Postgres forward-clean sweep, queued because the workstation
is not in the cespk-pg-dev firewall and adding a rule is a mutation. The forward window is NOT too
short — see materiality.)

### Evidence
- **Deploy record:** ARM deployment history for cespike-parser-dev-x7xt3d5ovhi7y shows three
  2026-07-09 deploys: 08:50:11Z (engine-v2.11 lifecycle-wave republish), 14:24:37Z, and 15:51:33Z
  (ACTIVE — the TKT-143 final-wave build, vendored engine v2.11). No parser deploy since; the active
  build is the one probed. Orch: TKT-143 threading live from 2026-07-09T14:16Z.
- **Acceptance line 1 (no wrong provider token; unresolved → clean names) — live probe, deployed
  parser, compute-only:** POSTed the repo CVD sample (1,100,062 bytes) to the live /extract-images as
  LtrtoEngineerIn.pdf. Neutral call → `img_1_1.jpeg … img_2_5.jpeg` — no RJS, no UnknownVRM (the
  exact fields={} shape that used to brand every live extraction). With provider=QDOS, vrm=AB12CDE →
  `QDOS_AB12CDE_img_1_1.jpeg …` (TKT-143 identity plumbing live at the parser layer). The population
  half = queued SQL Q1/Q2.
- **Acceptance line 2 (literal RJS fallback removed + regression test) — VERIFIED:** vendored
  service.py extraction path clean (remaining RJS/UnknownVRM literals are only the documented
  non-cloud desktop surfaces + the genuine "RJS Solicitors" seed);
  test_extracted_names_carry_no_placeholder_identity + the TKT-143 identity tests exist and are
  green; live behavior confirms.
- **Acceptance line 3 (re-parse yields correct names in evidence and Box) — PARTIAL:** the
  deployed-parser re-parse returns correct names (probe); evidence-row half = queued Q3; Box-folder
  half needs an orchestrator/operator pass (root-only allowlist).
- **Acceptance line 4 (rename-or-leave recorded) — VERIFIED as a record:** changes.md §2026-07-09
  records LEAVE for the 5,693 historical rows with ADR-0012/0017 rationale + an opt-in-relabel
  follow-up path.
- **Materiality of the forward window:** parser extract_images requests 66 on 07-09 + 92 on 07-10,
  all 2xx; orch extractImages events after the strict cutoff include batches of 48/32/23/70/61/41
  images — ample forward rows to sweep.

### Pending / gaps
Real gaps (queued, decisive for done): (1) the forward-clean Postgres sweep — Q1 banded bad-pattern
counts (expect strict_window_bad=0; all_time ~5,693 LEAVE backlog), Q2 forward-window offender detail
(wrongful RJS stem or UnknownVRM after 08:51Z, banded on the three deploy times), Q3 healthy-sample
newest extraction rows (expect clean or identity stems — doubles as TKT-143's live proof);
(2) the Box-folder half of line 3. Expected absences: TKT-089's 2026-07-08 observations predate the
07-09 deploy (LEAVE backlog); identity stems can only appear post-15:52:47Z on resolved cases.

### How to re-verify
The queued Q1–Q3 (full SQL preserved in the W2 section below); deploy history via ARM (trim trailing
HTML before JSON-parsing); KQL with `--offset 7d` (the CLI default 24h window silently empties older
results); the parser probe (compute-only POST with x-functions-key, bare + provider/vrm shapes).

### Confidence + unread surfaces
High confidence the generator is fixed live. Unread: live Postgres (queued); Box case folders
(root-only allowlist); Kudu logs that would pin which 07-09 deploy first carried engine-v2.11
(bounded with banded windows instead).

## Orchestrator data-pass W2 — pending

Q1 (banded bad-pattern counts), Q2 (forward-window offender detail with provider join), Q3 (healthy
sample, newest 30 extraction-lane rows) run in the W2 batched window; results appended here. Per the
verifier: strict_window_bad=0 + clean Q3 ⇒ the sweep requirement is met (Box spot-check remains the
only other artifact).

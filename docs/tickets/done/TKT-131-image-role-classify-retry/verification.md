# Verification — TKT-131: Classify the role-unknown evidence images — retry the backfill residue so cases can reach Ready for EVA

## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26 (verdict block transcribed 1:1 below).
Confirmatory (not load-bearing) SQL Q1–Q5 rides the orchestrator W2 data pass.

## Ticket-verifier verdict (transcribed 1:1, dispatch of 2026-07-10)

### Verdict
VERIFIED-LIVE

### Evidence

**Acceptance line 1 — all classifiable images carry a role; residual list enumerated with causes:**
- Evidence-pack audit (exact): `evidence/backup-evidence-classification-before.csv` = 6,700 data rows
  (claimed 6,700), schema matches live DDL; recomputing the enumeration predicate inside it
  (`image_role_code=100000003 AND registration_visible='' AND excluded=f`) yields **2,002 rows across
  142 distinct cases — exactly the claimed enumeration**; all 4 residual ids present in the pre-state
  target set. `evidence/backfill-residuals.csv` enumerates the 4 residuals with cause (AOAI 400
  content-safety refusal; 2× A.PCH26013, 2× A.PCH26010) — the residual-list requirement satisfied
  verbatim.
- Verifier's own live KQL (workspace cespike-parser-law-dev, AppRequests): the run's Box-facade byte
  lane — **1,989 `download_file` requests on cespkbox-fn-v76a47, 2026-07-09 00:36:41Z→13:54:42Z, ALL
  ResultCode 200, zero non-200, sum(ItemCount)=1989 (no sampling loss)** — the claimed 1,852 facade
  fetches at scale with 0 fetch failures (the ~137 surplus is same-day TKT-133 dedup traffic). Splits
  internally consistent: 260+752+585+401=1,998; +4 residuals=2,002; lanes 1,852+150=2,002.
- Registry (LIVE_FACTS.json, lastVerified 2026-07-10T11:35Z) records the run 1:1 (1,998/2,002, 4
  content-safety residuals, $4.72).
- Independent disconfirmation-resistance: TKT-146 (done, VERIFIED-LIVE) reuses the TKT-131 predicate
  and found only a 242-row POST-enumeration box-lane backlog (not ~2,000); its W1 pass read
  `classified_box_rows_locked_out=2116` — 2,116 box-lane rows carrying non-null registration_visible
  can only exist if this backfill's 1,852 box-lane stamps landed.

**Acceptance line 2 — A.QDOS26029 (or an equivalent) passes the image rule IF its photos genuinely
contain an overview:**
- Conditional resolved honestly: its 28 images = 23 damage-closeups (2 with readable reg, but on
  closeups — not accepted as overview), 1 additional, 3 non-vehicle, 1 reflection-excluded →
  genuinely no overview → `missing_images` is CORRECT. The "or an equivalent" leg is satisfied:
  **4 cases flipped missing_images → ready_for_eva (23→27)**.
- Live corroboration (TKT-148, done/VERIFIED-LIVE): the deployed SPA renders A.QDOS26029 as Missing
  images with readiness item "no overview with a visible registration" (derived from THIS ticket's
  role stamps), and the W1 DB pass confirmed its overview chaser 93dfcb3a… — TKT-148's 31 candidates
  were computed live over this ticket's classification data.

**Acceptance line 3 — case-status movement recorded:**
- Recorded in changes.md + BOARD + the registry narrative: missing_images→ready_for_eva 4,
  needs_review→missing_required_fields 6, linked_to_instruction→needs_review 3; 108 cases now pass
  the EVA image rule; post-TKT-133 re-eval +2; final point-in-time distribution needs_review 142 /
  missing_images 108 / missing_required_fields 78 / ready_for_eva 27 / error 2 / removed 2. Per-case
  attachment_classified (100000002) audits claimed — DB confirmation queued (Q4).

**Scope addendum (reflection backfill folded in):** backup pre-state shows person_reflection true on
only 2/6,700 rows — the pass then stamped 337 with the domain exclusion reason (registry-corroborated);
TKT-146's live row proves the same policy stamping person_reflection→excluded in production. Count
confirmation queued (Q5).

### Pending / gaps
Expected absences (not bugs): the JSONL run ledger (per-call usage → $4.72, the lane splits) is not
committed under evidence/ (not acceptance lines); the case-status snapshot backup named in changes.md
step 1 is not in evidence/ (only the evidence-classification backup); the 150 blob-lane fetches ran
over a read-only SAS (no App Insights surface by design); the 4 residuals do not appear in TKT-146's
still_enumerable=1 — benign candidates (non-box_upload source_label / human classification since /
14-day window) — Q2 resolves their present state; pre-TKT-123 already-role-stamped rows keep
unstamped reflection flags (explicitly out of scope). No real bugs found; nothing read contradicts any
claim.

### How to re-verify
Queued SQL Q1–Q5 (role-unknown by lane, expect ~5; the 4 residuals' state now; case-status
distribution, ready_for_eva ≥ ~27; the 2026-07-09 attachment_classified audit trail ≥142 cases;
person_reflection count ≥337) — run in the W2 batched window; results appended below. KQL re-run
inside retention: `AppRequests | where Name has "download_file" | summarize rows=count(),
est=sum(ItemCount) by ResultCode, AppRoleName` over 2026-07-09 (note: `first`/`last` are unusable
KQL aliases — use t_min/t_max).

### Confidence + unread surfaces
High. Unread this pass: live Postgres itself (Q1–Q5 queued, confirmatory not load-bearing); the
AOAI-side call records and the JSONL ledger (spend/split on the implementer's + registry's word); the
blob-lane byte fetches (no telemetry surface exists for SAS reads).

## Orchestrator data-pass W2 (run 2026-07-10, transient window trap-deleted)

- **Q1 (role-unknown IMAGES now, kind=image):** 4, all box lane — exactly the residual class. (The
  un-filtered variant also counts non-image rows carrying the default role code — kind filter
  matters.)
- **Q2 (the 4 content-safety residuals):** aeebd5ce + 1945c9bd still active role-unknown
  (auto-intake lane, awaiting human roles as changes.md predicted); 76672ecf + 02c490f4 now
  excluded=t (box_upload lane). Benign dispositions. ✓
- **Q3 (case-status distribution, after today's drain):** needs_review 237 / missing_images 150 /
  missing_required_fields 94 / **ready_for_eva 32** / error 3 / removed 2 — ≥27 as expected. ✓
- **Q4 (2026-07-09 attachment_classified audits):** 359 events / 242 distinct cases (≥142). ✓
- **Q5 (person_reflection count):** 517 (≥337; grown via the TKT-146 sweep). ✓

Verdict stands: VERIFIED-LIVE.

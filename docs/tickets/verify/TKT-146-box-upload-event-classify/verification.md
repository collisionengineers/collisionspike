# Verification — TKT-146: Classify images at Box-upload event time (the FILE.UPLOADED lane has no classify path)

## Verdict
PENDING

(Implementer-gathered live evidence below is complete for both acceptance lines; the verdict is
left PENDING for the dispatching loop / ticket-verifier to certify — the implementer does not
self-certify.)

## Evidence (implementer-gathered, 2026-07-10)

**Acceptance line 1 — a Box-uploaded vehicle image carries a role + registration_visible shortly
after upload (live proof on the test area):**
- [evidence/upload-receipt.json](./evidence/upload-receipt.json) — facade `upload_file` into the
  test area (`All Files / test folder 392761581105 / A.PCH26036 398564730902`): file
  `TKT146-liveproof-112816.jpg`, Box file id **2338959990817**, `outcome: created`,
  2026-07-10T11:28:16Z. (Bytes = the case's own classified overview 2338884169413 with a 16-byte
  tail appended so the TKT-133 sha dedup could not absorb the upload; case VRM SP23OBX.)
- [evidence/stamped-row.txt](./evidence/stamped-row.txt) — evidence row
  `37bbb92a-262c-488c-8347-8e2b0a968324`: registered 11:28:19Z as role `unknown(100000003)` /
  `registration_visible NULL`; stamped **`image_role_code=100000000 (overview)` +
  `registration_visible=true`** at `updated_at` 11:30:09Z — **stamp latency 00:01:50** (≤ one
  5-min sweep period). The row also carries `person_reflection=true → excluded=true /
  accepted_for_eva=false` — the TKT-064 person-reflection domain rule acting on this photo, not a
  failure.
- [evidence/kql-sweep.txt](./evidence/kql-sweep.txt) — orch App Insights
  `boxClassifySweep.stamped` trace for that evidenceId (`role: overview,
  registrationVisible: true`) plus the first sweep summary
  `enumerated:25 classified:25 stamped:25 failed:0 casesReEvaluated:6 ms:189199` and the
  backlog draining (242 → 227 across the proof window).

**Acceptance line 2 — failures fall back to role unknown without blocking registration:**
- Registration is untouched by design: the row was registered by the box-webhook BEFORE any
  classify (pre-state captured in stamped-row.txt / upload-receipt.json) and the sweep only ever
  UPDATEs metadata via the evidence route's update-in-place path.
- Offline pins (orchestration vitest, 284/284 green): `box-classify-sweep.test.ts` case (c) — a
  classify null AND a facade throw each leave their row unstamped (role unknown) while the rest of
  the sweep completes; case (d) — enumeration failure warns and returns; the sweep never throws.
- Live corroboration: first sweep summary `failed:0`; 0 exceptions / 0 5xx on both App Insights
  components in the 30-min post-deploy window.

## Pending / gaps
- Verifier certification of the two acceptance lines against the evidence above.
- The 242-row backlog was mid-drain at proof time (227 at last read) — a later read should show it
  near 0 (minus any persistent AOAI content-safety refusals, which age out of the 14-day window).
- FC1 caveat (recorded): a scaled-to-zero orch app defers the tick to its next wake (past-due
  catch-up); intake push traffic + the durable monitor's ~6h wake bound this in practice.

## How to re-verify
1. Upload a vehicle image via the Box facade `upload_file` op into a case folder under root
   392761581105 whose case has a VRM (mutate bytes if cloning an existing file, or use a fresh
   photo).
2. Within ~5 min (app awake), check the evidence row (WSL Entra-admin psql + `SET ROLE csadmin`,
   transient FW rule, trap-delete after):
   `SELECT image_role_code, registration_visible, accepted_for_eva, excluded, updated_at - created_at
    FROM evidence WHERE box_file_id = '<new box file id>';`
   — expect a role code + boolean registration_visible.
3. KQL (orch component `7c7ea68a…`):
   `traces | where message contains "boxClassifySweep" | where message !contains "Found the following functions" | order by timestamp desc`
   — expect `.stamped` lines + per-sweep summaries with `failed` staying low/0.
4. Idempotency: re-run the sweep window — an already-stamped row (boolean registration_visible)
   must never be re-enumerated (the route's `registration_visible IS NULL` predicate).

# Changes — TKT-087: Box report 409 upload conflicts - investigate duplicate archive attempts

## Status
Investigated + small fix built (2026-07-09, PLAN-003 lifecycle wave) — verdict reached;
targeted fix on `feat/lifecycle-wave`; deploy + live re-check pending.

## Reconciliation note (2026-07-07) — stays backlog, rescoped to investigation-only
The idempotent-409 behaviour this ticket contemplates **already exists server-side**: the Box archive path
treats a 409 name-conflict as an idempotent reuse — `services/orchestration/src/workflows/archive/boxArchive.ts`
("Idempotent: a Box 409 name-conflict is …") and `services/orchestration/src/adapters/functions-client.ts`
("409 name-conflict is an idempotent reuse server-side, so a replayed archive …"). So there is **no fix to
build**; the outstanding work is purely the **forensic verdict** on the 18×409 in the operator's Box report
(2026-07-03): confirm they are benign replay/idempotency vs a double-processing vector, correlating with
**TKT-092** (PCH duplicate cases). Rescope to investigation-only.

## Investigation verdict (2026-07-09, read-only App Insights correlation)
All 18 × 409 were attributed (timestamp → orch operation → case + Box folder). **Neither Durable
replay nor TKT-092 double-processing.** Every 409 came from a *distinct, legitimate later email*
archiving into a case folder that already held a file of the same name — because the raw MIME and
the body-instruction text archived under the **generic names `message.eml` / `email-body.txt`**.
Any case receiving a second email (dedup `attach` / `linkReply linked`) was guaranteed to 409 on
those names. Full attribution table + KQL in [verification.md](./verification.md).

Two real defects surfaced:
1. **Mis-linkage on blind reuse** — on 409 the facade returned the EXISTING file id, so the later
   email's evidence row was stamped with the EARLIER email's Box file id; the later `.eml`/body
   bytes never reached Box ("Open in Box" points at the wrong file).
2. **One archive casualty** — case `ae1c0c84-…` (folder 396125774315, 2026-07-03 14:14): 4/4
   uploads got facade 502s (cold-start/worker death), archive completed `uploaded 0/4`, never
   re-archived. Repair lever: keyed `POST /api/box-archive {"caseId":"ae1c0c84-…"}` on
   `cespk-orch-dev` AFTER the fix deploys.

## Fix (small + obvious, per the wave's investigation-only-unless rule)
Prevention (orchestration — names unique per message, stable across replays so a genuine replay's
409 stays a CORRECT reuse):
- NEW `services/orchestration/src/platform/evidence-names.ts` — `messageFileToken` (8-hex SHA-256 of the
  internetMessageId) + `rawEmlFileName` / `bodyInstructionFileName`; unit-tested
  (`evidence-names.test.ts`, 7 tests green).
- `services/orchestration/src/workflows/intake/fetchMessage.ts` — raw MIME lands as
  `message-<token>.eml` (was `message.eml`).
- `services/orchestration/src/workflows/evidence/classifyPersist.ts` — body-only instruction lands as
  `email-body-<token>.txt` (was `email-body.txt`).
- Classification is extension/content-type-keyed (`.eml`/`message/rfc822`, `.txt`), so renamed
  stems classify identically; no code consumer parses these literal names (verified by grep).

Cure (box-webhook facade — reuse only when it is REALLY the same bytes):
- `services/functions/box-webhook/box_client.py` `upload_file` — on 409, verify the conflicting file's
  `sha1` (from `context_info.conflicts`, else a best-effort `GET /2.0/files/{id}?fields=sha1`)
  against `sha1(content)`:
  - match → `outcome='reused'` (info trace, as before);
  - **mismatch → re-upload ONCE under `<stem>-<sha1[:8]>.<ext>`** (warn trace,
    `outcome='created'` under the disambiguated name) — no more mis-linkage;
  - unverifiable → earlier reuse at WARN level (never block an archive on a missing hash).
  Helpers `_conflict_entry` / `_disambiguate_filename`; `_conflict_id` now delegates.
- Tests: `services/functions/box-webhook/tests/test_box_client.py` — same-content reuse, mismatch →
  disambiguated re-upload (asserts the second POST + name), unverifiable-sha1 fallback.
  **30 passed.**

## Remaining (deploy phase, dispatcher-owned)
1. Deploy orch + the box-webhook Function.
2. Re-archive `ae1c0c84` via the keyed lever; verify its 4 evidence rows gain Box linkage.
3. Live re-check window: post-fix 409s only on genuine replays (sha1-match reuses).

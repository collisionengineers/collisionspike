# TKT-058 — verification

## Live activation record (2026-07-04 — user-instructed "apply this delta — deploy anything necessary")

- **Delta applied live**: `2026-07-04-retro-case.sql` via transient FW rule → Entra
  `digital@` psql → `SET ROLE csadmin` → `\i` → VERIFY footer returned the 3
  `retro_*` audit actions + `choice_intake_channel_kind` 100000003 `retro`; rule deleted
  (only AllowAzureServices remains).
- **All four surfaces deployed at `d91c185`** (`func azure functionapp publish` from the
  restored WSL toolchain): api **79** fns (+2 retro routes), orch **62** (+starter,
  orchestrator, 7 activities — all visible in the publish listing), box-webhook **12**
  (+`box/search`, +`box/files/{id}/content`), parser **4** (+`explode_eml`). Counts
  re-verified via `az functionapp function list`.
- **Gate flipped**: `RETRO_CASE_ENABLED=true` on BOTH apps (readback `true`/`true`).
  `RETRO_BOX_ARCHIVE_ROOT_IDS` / `BOX_READONLY_ROOT_IDS` / `RETRO_OUTLOOK_SEARCH_ENABLED`
  deliberately unset — Box + Outlook rungs honest-skip (gated.md D11).
- **Smoke**: `POST /api/internal/retro/resolve-existing` (no auth) → **401**;
  `POST /api/retro-case` (no key) → **401**. Both fail closed.
- **Still pending**: a live-occurrence probe (the next real billing/update email citing an
  existing case should produce `retro_case_linked` or, unmatched, a
  `retro_reconstruction_failed` audit); the drain of the existing un-linked pile (step 4
  below); the D11 Box-rung inputs incl. the **Case/PO sequence-alignment fix**.

## Offline (every phase — done for R1, 2026-07-04)

- `node verify-all.mjs` green (domain/api/orch tsc + vitest incl. `retro-case.test.ts`
  49 cases + `retro-validate.test.ts`; SPA build; parser/box pytest untouched in R1).
- Pinned invariants: `ambiguous` linkReply outcome never fires retro; `non_actionable`/
  `other`/`receiving_work` never trigger; `RTA135983.001`/`AB123456` rejected,
  `CCPY26050`/`A.PCH261269`/`QDOS261253` accepted by the PO shape; longest-prefix principal
  match (`CC` never swallows `CCPY26050`); marker strip `AP.` before `A.`; landing status
  whitelist `{eva_submitted, needs_review}`; terminal only with resolved principal +
  discovered PO; billing+minimal is Held, never terminal.

## Live smoke (operator — after the R2 deploy; steps 1–5 already meaningful after R1)

1. Apply `migration/assets/schema/deltas/2026-07-04-retro-case.sql` (D7/D8 runbook:
   transient firewall rule → AAD token → psql → `SET ROLE csadmin` → `\i` → drop rule); run
   its VERIFY footer.
2. Deploy api + orch bundles (`docs/azure/deploy.md`). Leave `RETRO_CASE_ENABLED` unset —
   confirm intake behaves exactly as before (ships dark).
3. Flip `RETRO_CASE_ENABLED=true` on **both** `cespk-api-dev` and `cespk-orch-dev`.
4. **Rung-1 smoke (R1 scope):** pick an un-linked billing/update `inbound_email` row whose
   `body_jobref`/`body_caseref` matches an EXISTING case (any status — ideally a terminal
   one). `POST /api/retro-case` on the orch app (function key) with
   `{ "internetMessageId": "<source_message_id>", "mailbox": "<source_mailbox>" }`. Expect:
   the triage row's `case_id` stamped + `triage_state='routed'`, an audit_event
   `retro_case_linked` naming the matched key, and NO new `case_` row.
5. **Negative:** repeat with a row whose keys match nothing → audit
   `retro_reconstruction_failed`, triage row untouched, no case row.
6. **R2 smoke (Box reconstruction — after R2 ships):** set `BOX_READONLY_ROOT_IDS` (box-webhook
   app) + `RETRO_BOX_ARCHIVE_ROOT_IDS` (orch) to the operator-supplied archive root id(s);
   grant the Box service account Viewer on those roots. Read-only probe: `POST box/search`
   facade with a known historical claim ref → resolves the right case folder; verify an
   UPLOAD into that folder is REFUSED (the RO scope lock). Then drain one real un-linked
   billing email whose case is only in the archive: expect a `case_` row (PO = folder name
   verbatim, `intake_channel_kind_code=100000003`, status per decideRetroStatus), BOTH
   `inbound_email` rows linked (original + trigger), evidence rows, `box_folder_id` = the
   ARCHIVE folder id, **no new folder under the live root**, audit `retro_case_created`.
7. **Race/idempotency:** send a second live email citing the same reference → expect
   `retro_case_linked` (link, not a second case).

## Verdict update — 2026-07-08

FAILED (live) — operator-supplied evidence, 2026-07-08 workstream report: Retro case-create not working on ref PHA5007; acknowledgement emails still ending in new cases. Reopened verify->now; the fix is co-dispatched with TKT-119 (retro root-cause + ack-mint hardening + Unable to Locate).

Verified by: operator report transcribed by the orchestrating session, 2026-07-08.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. Both operator failure reports resolved: the retro lever is field-proven twice live (PHA5007 -> 87e79f62 via Deleted Items; 46671/1 -> 6cd60114), and the ack-classified trigger produced a locate-and-reconstruct (Held, no PO minted) — never a mint. Provenance chip renders. Scope notes (not failures): the Box rung stays dark pending D11 sequence alignment; the rung-1 LINK outcome has no live occurrence yet (both drains ended in creates); the bulk backlog drain is TKT-140.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.

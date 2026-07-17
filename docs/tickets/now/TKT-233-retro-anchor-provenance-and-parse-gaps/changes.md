# TKT-233 — changes

## U1 — anchor rows hidden from triage, kept on the case

- `services/data-api/src/features/inbound/routes.ts` — exported
  `INBOUND_RETRO_ANCHOR_EXCLUSION_SQL` applied to the triage list slice only, covering all
  three `retro-envelope.ts` builder variants: `source_message_id NOT LIKE 'retro:box:%'`
  (doc-arm, minimal-anchor, and eml-arm without its own Message-ID),
  `source_mailbox IS DISTINCT FROM 'box-archive'`, and the persisted
  `retro_reconstructed` signal marker (eml-arm anchors that carry a REAL Message-ID and a
  real historic To-address). All predicates NULL-safe. New optional `?caseId=<uuid>` query
  param returns the case-scoped slice WITH anchors (400 on malformed caseId).
- `packages/domain/src/dto/index.ts` — `InboundFacet.caseId?`.
- `apps/web/src/data/rest-client.ts`, `data/hooks.ts`, `__fixtures__/fixture-source.ts` —
  thread `caseId` to `GET /api/inbound?caseId=`.
- `apps/web/src/shared/ui/LinkedEmailsPanel.tsx` — the case Emails tab requests the
  case-scoped slice, so anchors remain visible on the case while the triage list (and its
  derived mailbox chips) never sees them. No chip code change needed — the "Other source"
  chip dissolves with its rows.

## U2 — own-domain claimant-contact exclusion (sibling-first)

- Sibling `cedocumentmapper_v2.0` commit `83164e6`, annotated tag **engine-v2.25**, pushed:
  `rules/engine.py` gains module-level `_OWN_EMAIL_DOMAINS = ("collisionengineers.co.uk",)`;
  `_is_non_claimant_email` rejects any candidate at an own domain or subdomain. New
  `tests/test_contact_extraction.py` (4 tests: live shape, claimant-context, subdomain,
  genuine claimant email still wins). Telephones left alone — no CE phone number exists in
  any parser config to guard against (verified).
- Vendored mirror: `services/functions/parser/cedocumentmapper_v2/rules/engine.py` (same
  executable AST; wording-normalisation preserved) + the same four tests in
  `services/functions/parser/tests/test_contact_extraction.py`.
- `cedocumentmapper_v2/VENDOR_LOCK.json` re-authored for engine-v2.25 @ `83164e6…` with the
  sanctioned three-file `normalisedFiles` list (schema 2); each normalised file re-proved
  AST-identical after docstring strip; `PROVENANCE.md` updated (release, commit, both
  digests). `verify_vendor_pin.py` → PASS (immutable tag verified);
  `test_engine_vendored_in_sync.py` → 3/3.
- NEW `database/operations/tkt233-clear-own-domain-claimant-emails.sql` — pre-check listing,
  scoped UPDATE (`eva_claimant_email ILIKE '%@collisionengineers.co.uk'` → NULL), post-check
  count 0. Authored per the tkt230 idiom; run under separate authorization.

## U4 — .msg support in explode-eml

- `services/functions/parser/function_app.py` — `/explode-eml` detects `.msg` by OLE magic
  (`D0 CF 11 E0 A1 B1 1A E1`) or filename and maps via `extract_msg.Message` to the identical
  `explode_eml_v1` shape (headers, body with stripped-HTML fallback, attachments through the
  shared size/cap discipline; embedded Outlook items re-emitted as `.msg` bytes or skipped
  `unsupported_part`; corrupt OLE → the same graceful 422, typed `msg_unreadable`).
  `extract-msg` was already pinned in requirements.txt.
- NEW `tests/test_explode_msg.py` + genuine synthetic OLE fixture
  `tests/fixtures/SYNTHETIC_RETRO_MSG_01.msg` (+ documented one-off generator
  `tests/fixtures/make_synthetic_msg.py`). `.eml` regression covered.

## U3 — diagnosis lane

Open — tracked in the ticket body (local re-parse of the PCH document; provider-profile
extension sibling-first if fields prove extractable; AC14ACE before/after banked in
verification.md after the ops SQL runs).

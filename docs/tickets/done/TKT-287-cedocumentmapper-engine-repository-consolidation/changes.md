# Changes made

All work landed on branch `engine/cedocumentmapper-merge` in worktree `collisionspike-engine-merge`,
as a sequence of phase commits (mirroring the plan's own phasing):

1. **Filter-repo extraction + reconciliation** — `git filter-repo` extraction of the engine subset
   (56 commits) from `collisionengineers/cedocumentmapper_v2.0` into
   `services/engine/cedocumentmapper_v2/`, merged with `--allow-unrelated-histories`. Reconciliation
   commit: dropped the 6 CLI/extraction/LLM-assist-only test files and 2 already-excluded resource
   schemas, reconciled the 3 wording-normalized files to collisionspike's current wording (proven
   AST-equal), brought in the small `docs/testing/testjsons/` fixtures + harness docs actually
   referenced by tests, pruned the desktop-only `pyproject.toml` entries, and made `ci_eval.py`'s CLI
   hermetic by default (see evidence/merge-notes.md).
2. **Parser cutover** — `scripts/build/sync-engine.py` materializes
   `services/functions/parser/cedocumentmapper_v2/` from the canonical source; removed the two
   vendor-pin governance files; updated the live `/api/fingerprint` route and its test to a new
   content-identity `ENGINE_FINGERPRINT.json` instead of `VENDOR_LOCK.json`; deleted the now-obsolete
   `test_engine_vendored_in_sync.py`.
3. **OCR wiring** — materialized the same canonical source into
   `services/functions/ocr/cedocumentmapper_v2/`, activating its long-dormant engine-present seam;
   added the engine's real runtime deps to `requirements.txt`; added a genuine real-engine-path test.
4. **Vendor-pin machinery retirement** — deleted `verify_vendor_pin.py`,
   `.cursor/rules/parser-sibling.mdc`, and the `parser-vendor-source` CI job; added
   `scripts/checks/check-engine-materialized.py` and wired it into `verify-all.mjs`, the hygiene CI
   job, and a new dedicated `engine` CI job running the engine's own pytest suite.
5. **ADR supersession + docs** — new ADR-0035 superseding ADR-0018; amended ADR-0032's now-false
   vendor-lock claim; rewrote vendoring prose in `AGENTS.md`, `.cursor/rules/collisionspike-core.mdc`,
   `docs/governance/repository-map.md`, `services/functions/parser/README.md`, and
   `scripts/checks/parser-domain-parity.md`; filed this ticket.
6. **Sibling repository remainder** — reconciled the real local desktop install's provider catalog
   against the canonical seed (found no unique customisation to preserve), ported the sibling's one
   open tracking issue to TKT-288, confirmed zero live deploy dependencies, then pushed a retirement
   banner and archived `cedocumentmapper_v2.0` via `gh repo archive`.

No functional/behavioral change to parsing, classification, or extraction logic anywhere in this
ticket — every phase's diff was verified byte-identical or test-covered where new integration
surface (OCR) was activated for the first time.

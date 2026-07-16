# Lane E — Python functions & vendor pin

**Scope:** `functions/` → `services/functions` move + the vendored `cedocumentmapper_v2` engine (ADR-0018).
**Verdict:** the parser move + vendor pin are sound and provably valid; the material items are a documented EVA
service retirement and two vendor-boundary integrity concerns. 4 issues + verified-sound.

### E1 — [LOW · CONFIRMED-intentional] `functions/evavalidation/` (14 files) dropped
`functions/evavalidation/{validation.py, function_app.py, openapi/…, tests/…}` exist on main; nothing under
`services/functions/` on the branch matches `evavalidation`/`validation.py`/`parity`. Function inventory 7→6.
Because the tests left with it, **no gate fails** — the class of silent loss this review hunts. **However,
verified intentional:** `TKT-215` ("Audit live use and disposition of the EVA validation service") dispositions
it for retirement — read-only audit found no repo caller, no config, no request in the 90-day telemetry window;
the removal is registered as approved delta (route `POST /api/validate-case`, see Lane D). *Residual:* the live
Azure resource stays Running (tracked as separate deferred production work per TKT-215 A5). Downgraded from
suspected-silent-loss to disclosed-and-justified.

### E2 — [MEDIUM · CONFIRMED] Vendored engine files edited in-repo, changing the pin contract
`services/functions/parser/cedocumentmapper_v2/{detection/attachment_typing.py (R098),
rules/email_classifier.py (R097), rules/engine.py (R099)}` were edited; `VENDOR_LOCK.json` bumped
schemaVersion 1→2 and `PROVENANCE.md` rewritten. Diffed all three: **comment/docstring wording only**
(retired-platform nouns → the current "orchestration"/"workflow service"/"code tables" vocabulary); `TAXONOMY_VERSION=4`,
regexes, constants, decorators, annotations unchanged — **AST-equal, no functional drift**. But this edits
vendored files *in collisionspike* rather than edit-in-sibling-then-re-vendor per **ADR-0018**, and introduces a
"wording-normalisation" pin mode where the worktree intentionally diverges from the pinned `engine-v2.24` tag
bytes. Legitimate-looking, but a real vendor-boundary contract change riding silently in a reset.

### E3 — [MEDIUM · CONFIRMED] `PROVENANCE.md` contradicts its own machine lock
`PROVENANCE.md:20-22` states a "one-file normalisation list" + checked-out digest `C47775FB…`, but
`VENDOR_LOCK.json` records **three** `normalisedFiles` and `contentSha256 DF943A1F…` (neither matches C47775).
`verify_vendor_pin.py._verify_worktree` only greps PROVENANCE for the `ref`+`commit[:7]`, never the prose
digest/count — so it passes despite the mismatch. The human-auditable provenance record is stale/wrong.

### E4 — [LOW/INFO · CONFIRMED] Parser wrapper lost `openapi/` (net −13 files); `ocr/` relocated to `services/functions/ocr/`
Dropped `openapi/*-connector.json` specs + ocr consolidation read as intentional prior-platform-connector
cleanup, not move breakage.

### Verified sound (non-findings)
- **Vendored tree integrity:** 33/36 files pure `R100` rename; the other 3 docstring-only (AST-equal); count 36 intact.
- **Pin internally valid on the branch:** ran `verify_vendor_pin.py` read-only → `PASS engine-v2.24 @ e9cec4a…
  (36 files; offline lock verified)`, exit 0. The moved script's path math tracks the new depth correctly — the
  move did not break the path the pin reads.
- **Parser pytest layout intact post-move**; `conftest.py`, fixtures, `test_*.py` present + 5 new
  `test_email_classifier*.py` suites. `verify-all` Python parser suite passed.
- Other retained functions (`box-webhook`→archive-webhook, `eva-sentry`, `location-assist`, `ocr`,
  `vehicle-enrichment`) each landed with a `tests/` dir; renames preserve structure.

**Bottom line:** parser move + pin sound; the vendored-file docstring edits (ADR-0018) + stale PROVENANCE are the
integrity items to reconcile; `evavalidation` removal is disclosed/intentional.

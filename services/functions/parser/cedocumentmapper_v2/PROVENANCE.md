# Parser engine provenance

## Immutable source

- Repository: `collisionengineers/cedocumentmapper_v2.0`
- Release: `engine-v2.25`
- Commit: `83164e6352ba16759e3f52a378992cf7871d21e3`
- Source root: `src/cedocumentmapper_v2`
- Vendored files: 36

`VENDOR_LOCK.json` is the machine-readable authority for this boundary. The
authoring release digest is
`394498A46A87148008EB396532434AC4B167B62C7E7866740C69187886F73080`.

## Repository wording normalisation

`detection/attachment_typing.py`, `rules/email_classifier.py`, and
`rules/engine.py` have documentation-only wording normalisation so the checked-out
repository describes the current system. Their executable Python structures are
unchanged. Lock schema 2 records both the immutable source digest and the checked-out
digest, `E0E53B883BBC7FC031E18C236C8B7ECD8A86FF542356B5046F5414681F7F42F9`, together
with the exact three-file normalisation list.

The verifier resolves `engine-v2.25`, proves the source aggregate, requires the
source/worktree drift set to equal that list, and compares Python ASTs after
removing docstrings. Any executable, decorator, annotation, default-value, or
non-docstring literal change fails the check.

## Known exception: `rules/email_classifier.py` + `detection/attachment_typing.py` (PLAN-014 D4/D5, TKT-291)

`rules/email_classifier.py` carries one deliberate, real executable change beyond wording
normalisation: an additive `attachment_content_typings` parameter and its refinement rule
(content-typed `report`/`junk` corroborating or withdrawing the filename-derived
instruction/report signals — `unknown` alone deliberately does NOT withdraw, since it is the
detector's own safe abstain default, not a confident negative — see the function's own
inline comment at the change site). `detection/attachment_typing.py` carries one narrow,
real fix discovered by the same PLAN-014 D5 backtest: a dual report+audit commissioning
letter's own heading legitimately contains the "audit report" title phrase without the
letter itself being a report — a title hit riding on that dual-commissioning phrase now
needs the same corroboration Rule 1b already requires (see the inline comment at the change
site; `rules/engine.py`'s own `dual_report_audit_phrases` signal already recognises this
exact phrasing as an instruction, so this is not a new judgement call, just extending an
existing one to a sibling rule).

Both are direct, in-repo edits, **not** authored in `cedocumentmapper_v2.0` first — the
authoring repository is archived (read-only) independent of the still-open
engine-repository-consolidation PR that would otherwise retire this vendor-then-tag
mechanism entirely. `VENDOR_LOCK.json`'s `contentSha256` reflects both edits; `ref`/`commit`/
`sourceContentSha256` remain at the last real sync point (`engine-v2.25`) since no new tag
was cut. A `--sibling` run of `verify_vendor_pin.py` against the archived repo's tag will
now correctly FAIL these two files' AST-equality check — that is expected and intentional,
not a regression: both files have genuinely diverged from wording-only, and the always-on
offline lock (which CI actually runs) is the load-bearing check going forward. Both changes
are parity-tested (absent/unaffected input is byte-for-bit identical to prior output) and
the D4 change was proven against the real 67-item eval corpus (`run_ab_parsefed.py`, PLAN-014
Slice 3/TKT-293) with zero regressions after this fix.

## Deployment boundary

The parser service deploys this package with `providers.json`. Desktop entry
points, UI modules, evaluation code, and authoring schemas listed in the lock are
outside the service bundle. Runtime request and response contracts are owned by
`services/functions/parser/function_app.py`, `parser_adapter.py`, and the root
`contracts/` schemas.

## Verification

From the repository root:

```powershell
python services/functions/parser/scripts/verify_vendor_pin.py
python -m pytest -q services/functions/parser/tests/test_engine_vendored_in_sync.py
```

A normal engine update starts in the authoring repository, uses a committed and
pushed annotated `engine-vX.Y` tag, re-vendors the exact source, and runs:

```powershell
python services/functions/parser/scripts/verify_vendor_pin.py --write --ref engine-vX.Y
```

That command requires exact source equality and writes an empty
`normalisedFiles` list.

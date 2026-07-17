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

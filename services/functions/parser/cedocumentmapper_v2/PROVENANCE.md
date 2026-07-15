# Parser engine provenance

## Immutable source

- Repository: `collisionengineers/cedocumentmapper_v2.0`
- Release: `engine-v2.24`
- Commit: `e9cec4acb8f1f49fb81c4d279d3a31cc82356d84`
- Source root: `src/cedocumentmapper_v2`
- Vendored files: 36

`VENDOR_LOCK.json` is the machine-readable authority for this boundary. The
authoring release digest is
`CD088959629F0A5FB07EB24C1F2D187B2AE4335B71C86E3AB11E52D0795B6358`.

## Repository wording normalisation

`rules/email_classifier.py` has documentation-only wording normalisation so the
checked-out repository describes the current system. Its executable Python
structure is unchanged. Lock schema 2 records both the immutable source digest
and the checked-out digest,
`C47775FBAFA3D66B5F1279193A2573C9017AC9E28E7E68CEDECD134BF6F396CA`, together
with the exact one-file normalisation list.

The verifier resolves `engine-v2.24`, proves the source aggregate, requires the
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


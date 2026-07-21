# v1-wins regression fixtures

This directory holds "v1-wins" regression fixtures: cases where the comparison
report (`docs/plans/comparisonreport.md`) recorded that v1 returned a non-blank
value and v2 returned blank. They are the regression net for parity work.

## Layout

Same shape as `tests/fixtures` (validates against
`docs/contracts/expected-fixture.schema.json`):

```text
v1_wins/
  expected/<id>.expected.json
  instructions/<source document>
```

These fixtures are scored by the comparator harness
(`cedocumentmapper_v2.eval.comparator`) and exercised by
`tests/test_comparator.py`. They are deliberately kept OUT of the
`tests/fixtures/expected/` tree so the existing `tests/test_regression.py`
acceptance gate is not affected.

## Status / limitation (logged)

The v1-wins fields named in the comparison report (`vrm`, `incident_date`,
`claimant_name`, `reference`, `vehicle_model`, `inspection_address`,
`inspection_date`, `instruction_date`, `vat_status`) were re-checked against the
**current** v2 engine over the in-repo `docs/Instructions` corpus during this
wave. The specific examples the report calls out (e.g. "ALISON PDFs: v1 extracts
`incident_date` and `inspection_address`; v2 blanks both") are now extracted
correctly by v2 - the Wave 1 parity fixes (`single_label` -> same-line-or-next,
fixed-line behavior, presence negatives, fallback extractors) closed them.

For the residual v1-wins fields, the **true expected value cannot be asserted
without v1 present**: v1 lives in a separate repository and is not available in
this repo, and several of the report's example documents genuinely contain no
such field (e.g. `ALISON PDF 01.pdf` has no vehicle model in its text, so v2
blanking it is correct, not a v1 loss). Authoring a fixture with a fabricated
expected value would be a false regression assertion.

`v1_wins_placeholder.expected.json` is therefore a clearly-marked PLACEHOLDER.
`tests/test_comparator.py` skips it with a reason that records this limitation.
To activate it: run v1 on the source document, paste the true expected values,
remove the `__placeholder__` marker, and drop the matching source file into
`instructions/`.

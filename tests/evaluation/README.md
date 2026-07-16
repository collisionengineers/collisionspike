# Evaluation tests

Evaluation definitions and executable runners live in [`scripts/evaluation/`](../../scripts/evaluation/)
because they are invoked as repository tooling. Their immutable source inputs resolve through
[`tests/fixtures/manifests/evidence.json`](../fixtures/manifests/evidence.json).

The deterministic email-classifier regression is part of the offline gate. Model-backed or billed runs
require their own explicit authorization and write generated output only under `.artifacts/evaluation/`.

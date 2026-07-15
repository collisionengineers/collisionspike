# Email classification evaluation

This directory measures the deterministic inbound-email classifier against a hand-labelled corpus.
It is separate from the parser's focused rule tests in
[`services/functions/parser/tests`](../../../services/functions/parser/tests).

## Inputs and ownership

- `manifest.json` identifies each logical sample and its SHA-256 evidence blob.
- `baseline-v1.json` and `baseline-v2.json` are redacted reference results.
- Raw email bytes live once in the
  [content-addressed evidence store](../../../tests/fixtures/manifests/evidence.json).
- `model-matrix.json` and `model-eval-prompt.md` configure the optional model comparison.
- `local/` is ignored and is the only permitted location for raw run output, model responses, and a
  locally approved `eval-overlay.json`.

The raw corpus contains real personal data. Default output is limited to item IDs, closed-vocabulary
labels, and aggregate scores. Do not commit full reports, normalized messages, model responses, or
extracted signals. The repository's [data authority](../../../docs/governance/repository-data-authority.md)
permits internal evaluation; it does not permit publication or unrestricted egress.

## Deterministic evaluation

Install the parser's development requirements before running the corpus so `.msg` support and the
vendored engine dependencies are available:

```powershell
python scripts/evaluation/email/run_eval.py
python scripts/evaluation/email/run_eval.py `
  --check scripts/evaluation/email/baseline-v2.json
```

The evaluator resolves every tracked sample by SHA-256. Missing tracked evidence is an operational
failure. A mismatch is a measured product result; it is not silently relabelled to make the run pass.

## Local overlay

`local/eval-overlay.json` may add explicitly approved local samples using the same `items` shape as
`manifest.json`. Each item points to a local file and supplies the classification context that cannot be
derived from message bytes. The overlay and its source files must remain untracked.

## Optional model comparison

Preparing inputs is local and makes no network request:

```powershell
python scripts/evaluation/email/prepare_parsefed_inputs.py
python scripts/evaluation/email/run_model_matrix.py
```

The matrix runner is dry-run by default. A billed run requires the documented privacy/cost preflight,
an approved deployment, a signed-in operator, and `--confirm-billed-run`. Raw inputs and responses stay
under `local/`. Generate a shareable ID-and-label aggregate only when a ticket needs it:

```powershell
python scripts/evaluation/email/score_model_matrix.py `
  --out .artifacts/evaluation/email/model-summary.json
```

`run_ab.py` is the smaller deterministic-versus-model smoke harness. It is not part of CI and must not
be invoked with model access unless the task explicitly authorizes the call.

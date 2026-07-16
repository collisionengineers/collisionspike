# Local evaluation overlay

No repository command exports live messages into the evaluation corpus.

When an owning ticket explicitly authorizes adding staff-corrected samples, prepare them locally under
`scripts/evaluation/email/local/` and list them in `eval-overlay.json`. Preserve the original source
bytes, record the approved classification context, and keep both the messages and normalized output
untracked. `run_eval.py` merges the overlay automatically.

A future reusable export capability must be implemented and reviewed under its own ticket. It must
preserve exact source bytes, prove the lawful data scope, and produce content-addressed evidence rather
than reconstructing messages from truncated database fields.

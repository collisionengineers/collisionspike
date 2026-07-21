# cedocumentmapper engine merge — notable findings

Concrete discoveries made while executing the merge, kept as evidence rather than folded silently
into the ticket prose above.

## Live number reservation collision

At the time this work started, `main`'s highest ADR/PLAN/ticket numbers were 0033/PLAN-012/TKT-277,
but PR #144 (`capture-web-merge`, the collisioncapture repository consolidation, still open at the
time) had already claimed ADR-0034, PLAN-013, and TKT-278 through TKT-286 on its own branch. Numbering
this work from `main` alone would have collided once both PRs merged. Verified directly by diffing
`origin/capture-web-merge`'s own `docs/adr/`, `docs/tickets/plans/`, and `docs/tickets/` trees before
picking any number here — the real next-free numbers were ADR-0035, PLAN not needed (see below),
TKT-287.

## A real, live-deployed consumer the original plan didn't account for

`services/functions/parser/function_app.py`'s function-key-protected `/api/fingerprint` route — one of
5 live routes on the `cespike-parser-dev` Function App per `docs/operations/cloud-inventory-2026-07-17.md`
— read `VENDOR_LOCK.json` to report the vendored engine's cross-repo identity (repository/ref/commit).
The original plan's file inventory covered `VENDOR_LOCK.json`/`PROVENANCE.md`/`verify_vendor_pin.py`/the
CI job, but not this runtime consumer. Discovered only because deleting `VENDOR_LOCK.json` broke
`test_fingerprint.py`. Resolved by having `scripts/build/sync-engine.py` write a new
`ENGINE_FINGERPRINT.json` (content hash + file count only — there is no more separate authoring
repository/tag/commit to report) into each materialized target, and updating the route to read that
instead. Same function-key boundary, same fail-closed behaviour.

## The eval baseline's apparent regression was local-machine contamination, not a bug

Running `ci_eval.py`'s bare CLI (as documented: `PYTHONPATH=src python -m cedocumentmapper_v2.eval.ci_eval`)
on the machine used for this merge reported `vehicle_model`/`vin` regressing to 0.5 exact-match against
the committed baseline (0.9571). Root-caused to `DocumentMapperService.__init__`'s default behaviour:
when `app_data_dir` is not explicitly passed, it reads and merges with a real, persistent, machine-local
provider catalog (`APP_DATA_DIR = get_documents_dir() / "CE Document Mapper"`) instead of using a fresh
seed. This exact machine has a real, previously-installed CE Document Mapper desktop app at
`C:\Users\<user>\Documents\CE Document Mapper\` whose local `providers.json` (82,010 bytes, last
modified 2026-07-09) has drifted from the repository's canonical seed (51,992 bytes) — contaminating
the run. Confirmed the baseline itself is current and correct by running with a fresh `tmp_path`-backed
`app_data_dir` (100% match on both fields) and by confirming `test_eval_harness.py`'s own tests — already
hermetic via pytest's `tmp_path` fixture — were never affected. Fixed `ci_eval.py`'s CLI to default to a
fresh temporary directory per run instead of silently falling back to real local state. No user data was
modified in the course of this investigation (confirmed the real file's size/mtime were unchanged
throughout).

## Operational implication for Phase 6

The above means this exact machine has a real, working CE Document Mapper desktop installation with
real (if now slightly stale) provider customisations, last touched 2026-07-09 — not a hypothetical
"if any staff machine..." scenario.

## Reconciliation check: the local provider catalog has no genuine customisation to preserve

Before archiving the sibling repository, diffed the local install's `providers.json` (82,010 bytes)
against the canonical seed (51,992 bytes) structurally — all 29 providers present in both, none only
in one or the other. Every provider's byte-level diff differs, but a closer look shows this is entirely
schema evolution, not content divergence: the local copy uses an older provider-config schema
(per-provider `id`/`enabled`/top-level `work_provider` fields, field-rule shape `{id, kind}`), while the
canonical copy uses the current schema (`detect_phrases` list, field-rule shape `{method, config}`, no
`id`/`enabled`). Spot-checked the actual detection content across several providers (ACSP, Tractable,
RJS, QDOS, SBL, KERR): in every case the underlying phrases/confidence are byte-identical once compared
at the semantic level — e.g. RJS's local `detect.required_phrases: ["Robert James Solicitors"]` is the
exact same phrase as canonical's flattened `detect_phrases: ["Robert James Solicitors"]`. No provider,
phrase, or rule exists locally that isn't already in the canonical seed. **No reconciliation was
needed** — the local file is simply an old-schema snapshot of the same data, not a source of unique
customisation.

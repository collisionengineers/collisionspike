# ADR-0018 — `cedocumentmapper_v2` is a standalone dual-target product; collisionspike vendors the headless engine-core (pinned to a committed ref, mirror-only)

- **Status:** Accepted and implemented (2026-07-12)
- **Deciders:** operator · document-parser-engineer · azure-integration-engineer
- **Extends:** [ADR-0004](0004-parser-as-azure-function-inline.md) (parser is an in-process Azure Function).
  Complements the vendoring mechanics in `functions/parser/cedocumentmapper_v2/PROVENANCE.md` and the
  [repo-constellation](../architecture/repo-constellation.md) entry.

> **Implementation note (2026-07-12):** the deployed copy is pinned to annotated tag
> `engine-v2.16` / commit `8dd4ba862500e2fbcd9e809523301e16e23eb9d8`; that lineage is now on the
> sibling's default `main`. `VENDOR_LOCK.json` plus the always-on CI verifier validates the immutable
> tag/SHA, both-direction boundary, complete vendored digest, and provider seed without depending on
> the sibling's checked-out branch.

## Context

`cedocumentmapper_v2.0` (the active sibling at `../cedocumentmapper_v2.0`) is **not** prior-art like `ccc` /
`collisioncc`. It is a **live, standalone product** and the **authoring source of truth** for the
document-parser engine this repo runs in production. As of 2026-06-24 it is **dual-target**:

1. **Desktop** — a single-user review GUI: a React/Vite frontend in `frontend/`, hosted by a `pywebview`
   shell (`src/cedocumentmapper_v2/ui/host.py`), packaged as a **portable Windows executable** by `build.ps1`
   (PyInstaller; bundles Python, the built frontend, `providers.json`, a trimmed Tesseract).
2. **Cloud** — the **headless engine-core** (no UI, no CLI), imported **in-process** by collisionspike's FC1
   parser Azure Function (`functions/parser/`, `/api/parse`) per ADR-0004. The engine-core is **vendored**
   (copied) into `functions/parser/cedocumentmapper_v2/`, not pip-installed — FC1's Oryx remote build resolves
   it as a top-level importable package with no private-registry auth.

Both targets share one engine-core and one EVA contract. The sibling advanced substantially on 2026-06-23
(branch `feat/audit-case-type-detection`): audit case-type detection, an opt-in **extraction orchestrator**,
**offline LLM-assist** (review-only), an **eval harness**, native preview rendering, and the frontend rework.

**The problem this ADR resolves.** The current vendoring has three structural weaknesses, now biting:

- **Non-reproducible pin.** `PROVENANCE.md` records the cut as "`4824136` **plus the sibling's uncommitted
  working tree** as of 2026-06-23." A pin that references an uncommitted working tree cannot be reproduced —
  that state ceases to exist the moment the sibling keeps working.
- **Drift accumulating against a moving target.** `test_engine_vendored_in_sync.py` byte-compares the vendored
  copy against the sibling's **live working tree**. On 2026-06-24 it is **RED** for 8 engine-core modules
  (`config/__init__.py`, `config/migration.py`, `detection/__init__.py`, `domain/__init__.py`,
  `exporters/eva_json.py`, `readers/doc.py`, `readers/email.py`, `readers/pdf.py`), so `verify-all.mjs` fails
  on any box where the sibling is checked out.
- **Bidirectional fork.** Reconciliation #1 (ROADMAP-B2 claimant contact extraction) is **vendored-only** and
  must be hand-re-applied after every re-cut; the audit / image-based features are "converged" by **parallel
  hand-authoring** in both repos. Every re-cut risks silently dropping or diverging these.

## Decision

Keep the **vendored-copy** model (the right fit for FC1, already instrumented with provenance + a drift
guard), but harden it so the two repos reconcile **deterministically and one-directionally**:

1. **Pin to a committed, immutable sibling ref — never a working tree.** The operator commits the sibling's
   in-flight engine-core work and tags an **engine release** (e.g. `engine-vX.Y`). The vendored copy and
   `PROVENANCE.md` pin to that **tag/SHA**. The drift guard then compares against a fixed ref — the pin is
   reproducible and the guard is green-able.

2. **A declared boundary: "engine-core" is vendored; the "product surface" is sibling-only.**
   - **Vendored (cloud engine-core):** `domain/`, `readers/`, `detection/`, `rules/`, `normalization/`,
     `exporters/`, `config/`, `application/`, `ui/paths.py` (path helpers only).
   - **NOT vendored (desktop / dev / opt-in — off the cloud path):** `ui/host.py`, `frontend/`, `build.ps1`,
     `cli.py`, `__main__.py`, **`extraction/` (orchestrator)**, **`eval/` (harness)**, **LLM-assist**, and
     `resources/` (the cloud path projects EVA via `parser_adapter`, not the exporter's bundled schema).
   - The deployed Function is the **deterministic rule engine** only. The desktop GUI, the eval harness, and
     the opt-in orchestrator / LLM-assist never cross the boundary into the deployed Function.

3. **Collapse the bidirectional fork.** **Upstream the B2 claimant-contact extraction** into the sibling so
   re-cuts become a **pure mirror** (no hand-patching). Once upstreamed, the target number of vendored-copy
   reconciliations is **zero**, and "converged-by-parallel-authoring" features become "vendored-from-sibling"
   (single author, one source).

4. **Keep the drift guard in the gate; define the re-vendor trigger.**
   `scripts/verify_vendor_pin.py` runs directly in CI and through
   `test_engine_vendored_in_sync.py`. It always validates the self-contained lock and, when the sibling
   clone exists, reads the locked Git commit rather than its working tree. **Re-vendor when the sibling tags
   a new engine release that touches the engine-core** — not when only the GUI / orchestrator / eval /
   frontend changes. The verifier compares the boundary in both directions with no reconciliation
   exclusions and includes the provider seed.

5. **Awareness rules (restated, unchanged):** never call the sibling at **runtime** (ADR-0004 — the engine is
   in-process, not a service); never **hand-edit** the vendored copy; cross-link both repos' docs so the
   boundary stays visible.

## Consequences

**Positive.** A reproducible pin; a green, meaningful drift guard; a crisp desktop-vs-cloud boundary that
keeps the GUI and dev tooling out of the deployed Function; the fork's most fragile leg removed.

**Negative / cost.** The operator must commit + tag the sibling before each re-vendor (it cannot be done
from collisionspike — the sibling is never modified from here), then regenerate the machine-readable lock.
The private sibling requires a dedicated read-only deploy key because CollisionSpike's default Actions token
cannot read another private repository. Pushes and same-repository PRs run the full private-source proof;
fork PRs receive only the offline lock check and must be re-run from a trusted branch before merge.

**Not chosen.**
- *pip-install from a git tag / wheel* — FC1's Oryx remote build would need private-repo auth and the sibling
  would need to publish wheels; deferred, but becomes viable once B2 is upstreamed (the fork is what blocks it).
- *git submodule* — incompatible with the vendored-only B2 divergence and with FC1's build model.

## Operator / cross-repo prerequisites

Completed: the claimant-contact reconciliation is upstream, `engine-v2.16` is committed/tagged and on
the sibling's `main`, and the cloud boundary is a pure mirror. For each future engine release:

1. Commit the sibling's engine-core work and create a pushed, annotated **engine release tag**.
2. Re-vendor `functions/parser/cedocumentmapper_v2/` against that tag (engine-core only).
3. Regenerate `VENDOR_LOCK.json`; its writer must prove the tag SHA, both-direction boundary, provider seed,
   and complete content match before it will update the lock.

## Related

- [ADR-0004](0004-parser-as-azure-function-inline.md) — parser is an in-process Azure Function, not a service.
- [ADR-0014](0014-audit-case-type-second-inspection.md) — parser-level `A.` audit detection lives in the
  sibling; the Dataverse / Code App audit workflow is collisionspike's.
- `functions/parser/cedocumentmapper_v2/PROVENANCE.md` — the cut record, reconciliations, and re-vendor command.
- [repo-constellation](../architecture/repo-constellation.md) · [integrations](../architecture/integrations.md).

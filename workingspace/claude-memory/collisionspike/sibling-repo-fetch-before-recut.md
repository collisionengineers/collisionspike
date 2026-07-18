---
name: sibling-repo-fetch-before-recut
description: The cedocumentmapper_v2.0 sibling checkout can be stale/behind the vendored copy — git fetch + fast-forward main before any sibling-first edit or re-cut
metadata: 
  node_type: memory
  type: project
  originSessionId: 7f57740f-6365-4681-81b7-b3bca016ae92
---

The parser sibling repo (`collisionsuite/active/cedocumentmapper_v2.0`, ADR-0018 "authoring source
of truth") can sit on a **stale local checkout**: on 2026-07-03 it was on an old feature branch
last fetched 2026-06-25, missing the engine-v2.3..v2.5 work entirely, which made the vendored copy
look hand-edited. After `git fetch origin --tags` + fast-forwarding `main`, only 2 files were truly
divergent (vendored-ahead classifier hardening — upstreamed in sibling commit `6fc03cb`).

**Why:** ADR-0018's sibling-first discipline silently breaks if the checkout is behind — you'd
either duplicate upstream work or wrongly conclude the mirror is broken.

**How to apply:** before any sibling-first engine edit or re-cut, run `git fetch origin --tags`
in the sibling, fast-forward `main`, THEN diff against the vendored tree
(`functions/parser/cedocumentmapper_v2`). The drift-guard test
(`functions/parser/tests/test_engine_vendored_in_sync.py`) needs the sibling checkout current to
be meaningful. Related: [[windows-parser-test-preexisting-failures]].

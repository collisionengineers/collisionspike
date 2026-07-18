---
name: windows-parser-test-preexisting-failures
description: "On the Windows (non-WSL2) box, the parser pytest baseline DRIFTS (1→3 failures within one day, fitz/venv-rooted) — never trust a remembered count; diff against a same-day baseline; verify-all's parser gate is red there by default"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7f57740f-6365-4681-81b7-b3bca016ae92
---

On the Windows PowerShell environment (as opposed to the WSL2 setup the repo was onboarded on),
the parser pytest suite has pre-existing environmental failures **whose count drifts with the
`functions/parser/.venv` state — never trust a remembered number**. Observed baselines:
2026-07-03 → 2 failures; 2026-07-10 morning (TKT-147 run) → 1 (`test_multiformat_extraction[ALS_doc]`,
281 passed); **2026-07-10 evening (TKT-021 run) → 3** (`[ALS_doc]`, `[OAK_doc]`,
`test_eml_extracts_provider_and_identity`), all one root cause: `No module named 'fitz'` — PyMuPDF
had gone missing from the venv between the two same-day runs. Consequently `node verify-all.mjs`'s
"Function parser — pytest" gate shows FAIL on this box even when nothing is wrong.

**Why:** avoids burning time re-diagnosing them as regressions after engine edits.

**How to apply:** before attributing parser failures to a change on this box, run the suite on the
PRE-change tree (or check `pip show pymupdf` in `functions/parser/.venv`) and diff failure LISTS,
not counts — fitz-import failures are venv drift, not regressions. `pip install pymupdf` in the venv
restores the gate if needed. Related: [[sibling-repo-fetch-before-recut]].

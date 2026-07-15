# Regression follow-up — 2026-07-11

PR 55 review found that the reusable write-window SQL claims parity with the case-status contract
but does not preserve merge-retired cases. Reusing the script against a population containing a
merged row could reopen it.

## Acceptance

- The write-window status calculation applies the merge-retired lock before other status rules.
- A merged case remains `linked_to_instruction` after the script's status pass.
- The script documents and tests parity with the runtime contract.

## Implementation

- The reusable write-window SQL safely parses earlier `duplicate_keys` and applies the nonblank
  `mergedInto` retirement rung before every ordinary readiness rule.
- A merge-retired case therefore remains `linked_to_instruction`; unrelated rows continue through the
  existing status calculation.

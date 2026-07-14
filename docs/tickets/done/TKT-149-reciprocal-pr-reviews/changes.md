# Changes — TKT-149: Retire mandatory reciprocal Claude and Codex PR reviews

## Status

Removal implemented; merge/default-branch verification pending.

## Changes

- Disabled GitHub workflow id `311669369` (`Reciprocal AI review markers`) immediately.
- Deleted `.github/workflows/reciprocal-ai-review-markers.yml` and its evaluator/tests.
- Deleted the shared reciprocal runner/tests and both Codex/Claude hook adapters.
- Removed the reciprocal `PreToolUse` entries while preserving Azure/Box guards.
- Removed `test:pr-review-hooks` from `package.json` and from the default test chain.
- Retired the active guard guide and reciprocal-marker requirements in PLAN-004 and dependent ticket
  verification text.

No Azure runtime, database, EVA, Outlook, Graph subscription or Archive state was changed.

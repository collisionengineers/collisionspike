# Changes — TKT-209: Migrate repository paths and remove generated output

## Status
verify — mechanical monorepo relocation and generated-output policy are implemented; final clean-checkout
install/build/package proof is being completed by the root task.

## Commits
- a57720d9 — relocate the immutable workingspace.
- b224c54b — move runtime roots into the monorepo layout.

## Files touched
- apps/web
- services/data-api
- services/orchestration
- services/functions
- database
- infrastructure
- tests/fixtures
- scripts and root workspace/build configuration

## Summary
Runtime, database, infrastructure, fixture and script roots now match PLAN-006. Workspaces, imports,
test discovery, build/package scripts, documentation and editor/CI consumers use the new paths.
Regenerable deployment output is ignored under .artifacts rather than tracked.

# Changes — TKT-212: Establish one agent and skill source with generated adapters

## Status
verify — `.agents` is canonical, required tool adapters are generated deterministically, and the two Stage-1
gaps (A2 versioned manifest, A5 controlled parity fixtures) are now closed.

## Commits
- PLAN-006 implementation following the mechanical move commits.
- Closeout: versioned adapter manifest, manifest-driven generator with distinct parity messages, and a
  controlled-fixture parity test.

## Files touched
- `.agents/agents/roles.json` — canonical 15-role source.
- `.agents/skills/*/SKILL.md` — canonical 10-skill source.
- `.agents/adapter-manifest.json` — NEW. Versioned manifest (A2): per canonical source, the adapter target
  paths, `generatorVersion`, `transformation`, minimal `wrapper`, and intentional `toolSpecificMetadata`.
- `scripts/maintenance/generate-agent-adapters.mjs` — now loads the manifest as its source of targets/version,
  exports a testable `generateAdapters({ root, checkOnly })`, guards CLI execution with a main check, and
  reports missing / stale-or-hand-edited / extra adapters distinctly with source and target paths (A5). Render
  output is unchanged (byte-for-byte parity preserved).
- `scripts/maintenance/generate-agent-adapters.test.mjs` — NEW. Controlled-fixture test (A5) proving clean
  parity + byte-determinism and each failure mode: missing role adapter, missing skill adapter, stale, extra,
  and hand-edited.
- `.claude` / `.codex` / `.cursor` generated adapter surfaces — unchanged (still pass `check:adapters`).

## Summary
Fifteen roles and ten skills have one human-authored source under `.agents`. `.agents/adapter-manifest.json`
now records, per canonical source, every adapter path plus generator version, transformation, and intentional
tool-specific metadata, and the generator consumes it. The parity check distinguishes and reports missing,
stale, extra, and hand-edited adapters with source and target paths, and a committed fixture test proves every
failure mode. `check:adapters` remains byte-for-byte green (15 roles, 10 skills); `test:checks` now runs the
new fixtures in CI.

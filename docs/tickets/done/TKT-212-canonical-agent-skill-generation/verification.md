# Verification — TKT-212: Establish one agent and skill source with generated adapters

## Verdict
TESTED (offline)

## Per-criterion evidence
- **A1 (single canonical source + ownership index).** `.agents/agents/roles.json` holds all 15 roles and
  `.agents/skills/*/SKILL.md` holds all 10 skills; `.agents/adapter-manifest.json` indexes every canonical
  source and its adapter targets. `AGENTS.md:115` states `.agents` is the canonical role and skill source.
  Ownership is resolvable from `.agents` without opening an adapter.
- **A2 (versioned manifest).** RESOLVED. `.agents/adapter-manifest.json` (`manifestVersion` 1,
  `generatorVersion` "1.0.0") maps each canonical source to every required adapter path and records, per
  adapter, its `transformation` and `toolSpecificMetadata` (Claude/Cursor `model: inherit` frontmatter; Codex
  `developer_instructions` TOML key) and the minimal `wrapper`. The generator now loads this manifest as its
  source of targets and versions (`scripts/maintenance/generate-agent-adapters.mjs` `loadManifest`), so the
  manifest is load-bearing rather than dead documentation — a malformed or absent manifest fails generation.
- **A3 (deterministic, no source mutation).** `npm run check:adapters` -> "Adapter parity passed for 15 roles
  and 10 skills." (exit 0), byte-for-byte against the committed adapters. The new test
  `scripts/maintenance/generate-agent-adapters.test.mjs` case "clean generation passes parity and is
  byte-deterministic" runs the generator twice in a temp tree and asserts identical bytes and clean re-check.
- **A4 (no independently authored adapter content; wrappers declared and non-overriding).** Every adapter is
  rendered by `generate-agent-adapters.mjs` from the canonical bytes plus the minimal wrapper declared in the
  manifest (`wrapper` / `toolSpecificMetadata`). Any deviation is reported by the parity check as
  "Stale or hand-edited …", so an adapter cannot silently carry its own guidance (see A5 fixtures).
- **A5 (parity check + controlled fixtures for every failure mode).** RESOLVED. The parity check now reports
  each mode distinctly, with both source and target paths:
  `Missing generated adapter: <target> (canonical source: <source>)`,
  `Stale or hand-edited generated adapter: <target> (canonical source: <source>)`,
  `Extra generated adapter (no canonical source): <target>`, and the skill-adapter equivalents.
  `scripts/maintenance/generate-agent-adapters.test.mjs` proves each mode against controlled fixtures (the real
  committed manifest driving a minimal canonical tree): missing role adapter, missing skill adapter, stale
  (canonical changed), extra (orphan), and hand-edited (bytes changed in place) — 6 tests, all passing.
- **A6 (prohibited wording cannot reappear via generation).** `npm run check:forbidden` scans all tracked
  files including the `.agents` canonical sources and the generated `.claude`/`.cursor`/`.codex` adapters ->
  "No forbidden signatures matched." (exit 0). Because adapters are byte-derived from canonical bytes, removed
  wording cannot re-enter through a cached or copied adapter without failing parity.
- **A7 (entry docs).** `AGENTS.md:115` (canonical source), `docs/governance/repository-map.md:93-94`
  (regeneration command), and `docs/governance/documentation.md:31` (update workflow: regenerate tool adapters)
  describe the canonical source, generation command, and update path; drift recovery is "run the generator,
  or `npm run check:adapters` to detect drift", enforced by the pre-commit hook.
- **A8 (CI regenerates and compares in a clean checkout).** `.github/workflows/ci.yml:177-178` runs
  `npm run check:adapters` on a clean CI checkout (byte-for-byte parity, no cache committed), and
  `ci.yml:172` runs `npm run test:checks`, which now includes the adapter fixture test. No generated cache is
  committed by the check.
- **A9 (discovery/invocation intact; no live write).** Roles and skills remain discoverable through the
  generated adapters, each of which resolves back to the canonical source (agents embed the canonical pointer;
  skill adapters link to `../../../.agents/skills/<name>/SKILL.md`). The generator performs filesystem-only
  repository writes with no deployment or live call.

## Command output (offline)
- `node scripts/maintenance/generate-agent-adapters.mjs --check` -> exit 0,
  "Adapter parity passed for 15 roles and 10 skills."
- `node --test scripts/maintenance/generate-agent-adapters.test.mjs` -> 6 pass, 0 fail.
- `node --test scripts/checks/*.test.mjs scripts/maintenance/*.test.mjs` (test:checks) -> 46 pass, 0 fail.
- `check:docs`, `check:tickets`, `check:inventory`, `check:reconciliation`, `check:forbidden`, `check:layout`
  all exit 0.

## Pending / gaps
- Independent live invocation of a role and a skill inside each supported tool is offline-reasoned rather than
  observed live; the verdict stays TESTED (offline) pending that live confirmation.

## How to re-verify
Run `node scripts/maintenance/generate-agent-adapters.mjs --check` (expect byte-for-byte pass), then
`node --test scripts/maintenance/generate-agent-adapters.test.mjs` (expect all failure-mode fixtures to fail
parity as designed). Inspect `.agents/adapter-manifest.json` for the source→target/version/transformation map.

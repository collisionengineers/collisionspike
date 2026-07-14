# Changes — TKT-205: Make ticketed worktrees and offline checks the repository workflow

## Status
built — offline dependency installation needs a clean Windows retry before the full verifier can run

## Changes made

- Added the ticket worktree lifecycle command, direct-main pre-push guard, draft-PR template,
  retained-reference lifecycle note and read-only hygiene report.
- Added root offline-verification and hygiene commands, public local SPA settings, and an unconditional
  CI offline-verification job; removed the stale nested SPA lockfile.
- Declared TKT-205's tooling lane and TKT-206's runtime/schema lanes and component setup metadata.

## Validation note

The ticket/documentation checks, authority tests, syntax checks and `worktree doctor TKT-205` pass.
`npm ci` in this newly-created Windows worktree hit an `ENOTEMPTY` cleanup failure under generated
`node_modules/@fluentui/react-icons`; therefore the build/test portion remains pending rather than
being represented as passing.

The first GitHub Actions run also showed npm omitting Rollup's Linux optional package after the stale
nested lockfile was removed. The unconditional offline job now installs that platform package explicitly
after root `npm ci`; the nested lockfile remains removed.

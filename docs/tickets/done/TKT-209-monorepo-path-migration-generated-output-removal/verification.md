# Verification — TKT-209: Migrate repository paths and remove generated output

## Verdict
TESTED (offline)

## Evidence
- Commit b224c54b records the runtime-root relocation independently from later content changes.
- Root workspaces resolve @cs/domain, @cs/api, @cs/orchestration and @cs/web from the target layout.
- Database baseline, migrations, seeds, tests and operations have distinct owners under database/.
- Tracked-output checks reject dependency trees, caches, bundles, deployment packages, local logs and
  generated evaluation output; build bundles target ignored .artifacts/deploy/.
- The four package suites passed offline with 554, 772, 470 and 525 tests respectively. Retained Python
  suites passed 860 tests with nine intentional parser skips, and database parity passed for 22 code tables.
- The current-path runtime contract snapshot passes for 158 HTTP routes, 49 exported domain DTO
  declarations, seven JSON schemas, 52 PostgreSQL baseline tables, 13 registered resource/database
  names and 22 numeric code tables. The approval record limits baseline departures to the TKT-215
  route removal and PLAN-006 compatibility-alias removal.
- Documentation and ticket validation resolve the new paths without tolerated dead links.
- The final aggregate began with a fresh `npm ci`, rebuilt every workspace from an output-free state,
  built and smoke-loaded both ignored deployment bundles, and completed 34 stages with zero failures.
- No deployment, cloud configuration change or live data write was performed.

## Pending / gaps
- Remote CI and the final independent clean-checkout sample remain pending.

## How to re-verify
From a clean checkout, run npm ci, npm run build, npm test, npm run bundle and node verify-all.mjs.
Confirm bundles exist only under ignored .artifacts/deploy and run npm run check:runtime-contract before
moving the ticket beyond verify.

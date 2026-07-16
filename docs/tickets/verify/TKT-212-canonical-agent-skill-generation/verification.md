# Verification — TKT-212: Establish one agent and skill source with generated adapters

## Verdict
TESTED (offline)

## Evidence
- .agents contains the canonical role/skill definitions and role manifest.
- node scripts/maintenance/generate-agent-adapters.mjs --check passes for 15 roles and 10 skills.
- Generation is deterministic and the parity tests reject missing, stale, extra and hand-edited views.
- Root and repository guidance identify .agents as canonical and describe regeneration.
- The purge gate scans both canonical sources and generated views, preventing removed wording from
  returning through generation.
- Adapter generation is repository-only and performs no deployment or live write.

## Pending / gaps
- Remote CI and independent discovery/invocation checks in each supported tool remain pending.

## How to re-verify
Run the generator twice from a clean checkout, require an empty second diff, then run it with --check
and execute the adapter fixture tests. Independently discover and invoke one role and one skill through
each supported tool before moving beyond verify.

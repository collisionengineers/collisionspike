# Changes — TKT-212: Establish one agent and skill source with generated adapters

## Status
verify — .agents is canonical and required tool adapters are generated deterministically; independent
discovery verification remains pending.

## Commits
- Current PLAN-006 implementation following the mechanical move commits.

## Files touched
- .agents/agents
- .agents/skills
- .agents/agents/roles.json
- .claude, .codex and .cursor generated adapter surfaces
- scripts/maintenance/generate-agent-adapters.mjs
- Root agent entry guidance

## Summary
Fifteen roles and ten skills now have one human-authored source. The role manifest and generator
produce thin tool-specific views; parity checking rejects missing, stale, extra or hand-edited adapters.

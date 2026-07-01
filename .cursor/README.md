# Cursor configuration — collisionspike

This folder is the **Cursor-native entry point** for the repo. Deeper context lives in
[CLAUDE.md](../CLAUDE.md) and [AGENTS.md](../AGENTS.md).

## Layout

| Path | Purpose |
|------|---------|
| [rules/](rules/) | Project rules (`.mdc`) — `collisionspike-core` always applies |
| [agents/](agents/) | 16 custom subagents (Azure, Box, EVA, design-lab, SPA, parser, docs) |
| [hooks.json](hooks.json) | Agent hooks — Azure routing, churn guard, Box scope, SPA deploy reminder |
| [hooks/](hooks/) | Cursor adapter scripts (shared logic in [.claude/hooks/](../.claude/hooks/)) |

## Skills

Domain skills live in [.agents/skills/](../.agents/skills/) — not duplicated here:

- `box-rest-api`, `eva-sentry-api`, `collision-engineers-design`, `grill-with-docs`, `ui-ux-pro-max`

## Parallel tooling

| Tool | Config |
|------|--------|
| Claude Code | [.claude/settings.json](../.claude/settings.json), [.claude/agents/](../.claude/agents/) |
| Codex | [.codex/hooks.json](../.codex/hooks.json) |
| Git pre-commit | [scripts/hooks/pre-commit](../scripts/hooks/pre-commit) — separate from Cursor hooks |

Hook **logic** is shared via `.claude/hooks/*.mjs`; Cursor adapters only translate stdin/stdout shape.

## Activation

1. **Cursor hooks** — reload window or save `hooks.json`; verify in **Hooks** output channel.
2. **Git doc gate** (once per clone): `git config core.hooksPath scripts/hooks`
3. **Workspace settings** — [.vscode/settings.json](../.vscode/settings.json) (tracked)

## Subagents (16)

**Operations:** azure-integration-engineer, azure-diagnostician, box-integration-architect,
eva-sentry-integration, document-parser-engineer, spa-architect, docs-maintainer

**Production UI:** fluent-codeapp-designer

**Design lab:** ux-architect, ui-visual-designer, ui-ux-pro-max-specialist, stitch-prototyper,
mobile-ux-designer, accessibility-engineer, design-critic, motion-demo-designer

## Smoke tests (manual)

```bash
# Azure route hint
echo '{"command":"az functionapp show --name test"}' | node .cursor/hooks/cursor-azure-route-guard.mjs

# SPA deploy reminder
echo '{"command":"swa deploy"}' | node .cursor/hooks/spa-deploy-guard.mjs

# Offline verification gate
node verify-all.mjs
```

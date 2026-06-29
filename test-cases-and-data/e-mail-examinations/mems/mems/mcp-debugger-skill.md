---
name: mcp-debugger-skill
description: Structure and intentional design choices of the mcp-debugger skill in the a-skills repo
metadata: 
  node_type: memory
  type: project
  originSessionId: de5e7314-c5a9-445e-b435-77abba5ed9c6
---

The `mcp-debugger/` skill (in the a-skills repo) is a client-agnostic MCP debugging skill.
Layout: lean SKILL.md (table-of-contents + decision table), references/ for depth
(clients, claude-desktop, claude-code, protocol-and-transport, remote-and-auth,
mcpinspector, debugging, tool-resource-prompt-checks), scripts/ (claude_desktop_diagnostics.py,
mcp_http_probe.py), and evals/evals.json.

`agents/openai.yaml` is an **intentional** OpenAI/Codex packaging shim (the repo packages
skills into Codex plugins per AGENTS.md), not a stray file — do not "clean it up". It sits
outside the standard Agent Skills layout (SKILL.md + references/ + scripts/ + assets/) by
design.

Spec facts in the references are stamped to MCP stable revision 2025-11-25 with a
"reconciled 2026-06-24, verify upstream" note; re-reconcile periodically since the spec and
MCP Inspector (~0.22.x) move fast. The probe/diagnostics scripts are stdlib-only Python and
redact secrets by key marker AND value shape.

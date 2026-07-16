# CLAUDE.md

This file is a thin tool adapter. Repository policy is deliberately not duplicated here.

Before working:

1. Read [AGENTS.md](./AGENTS.md).
2. Read [CONTEXT.md](./CONTEXT.md).
3. Follow the task map in [docs/README.md](./docs/README.md).
4. Read the owning ticket, its plan, applicable ADRs, and every relevant manual review.
5. Use [LIVE_FACTS.json](./LIVE_FACTS.json) only as a dated environment snapshot; verify live when
   current cloud state is material.

Canonical agent and skill definitions live under `.agents/`. Generated tool-specific copies must match
that source.

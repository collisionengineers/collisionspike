# Activation playbooks (operator)

Operator activation playbooks for email intake.

> **Note:** these describe the **prior** `digital@` / V3-trigger Power-Platform path. **Live** intake is the
> Azure orchestration **Graph PUSH change-notification / Exchange-RBAC** path (NOT delta-poll), now **live on
> the production mailbox set info@ + engineers@ + desk@** — see [docs/azure/entra-graph.md](../azure/entra-graph.md)
> + [docs/gated.md](../gated.md). Treat the playbooks below as domain reference, not the live mechanism.

- [`email-intake-activation.md`](./email-intake-activation.md) — single-inbox email-intake activation.
- [`m1-flow-chain-activation.md`](./m1-flow-chain-activation.md) — the M1 flow-chain activation.
- [`multi-inbox-activation.md`](./multi-inbox-activation.md) — scaling to multiple inboxes.

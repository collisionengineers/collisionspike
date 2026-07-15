# Roles and permissions

The product uses two enforced staff roles:

| Role | Intended access |
| --- | --- |
| `CollisionSpike.User` | Normal case intake, review, evidence, chaser, and approved assistant actions |
| `CollisionSpike.Superuser` | User access plus provider, corpus, configuration, and exceptional repair actions |

`CollisionSpike.Engineer` is reserved but is not currently enforced. Do not build assumptions on it until
a separate accepted decision defines its scope.

Authentication proves identity; authorization is enforced again at the data service and database. UI
visibility is not a security boundary. Every write route checks the caller's role, and row-level database
policies fail closed when request context is absent.

Destructive or high-impact actions remain human-only and require explicit confirmation. Assistant writes
follow propose, re-read, confirm, and execute; stale versions fail instead of overwriting newer work.

Exact assignments are dated environment state and belong in [LIVE_FACTS.json](../../LIVE_FACTS.json).

# Identity and access

## Staff access

The web app uses Microsoft Entra workforce sign-in. The Data API accepts only tokens issued for its own
audience and requires an enforced application role:

- `CollisionSpike.User` for normal case work;
- `CollisionSpike.Superuser` for privileged corpus, provider, configuration, and repair actions.

The reserved Engineer role has no enforced product meaning yet. UI visibility is not authorization;
every route and PostgreSQL transaction enforces the caller again.

## Service access

Prefer managed identity and narrowly scoped role assignments. Where a provider requires a credential,
store it in the approved secret store and expose only a reference to the application. Mail access is
limited to the approved production mailbox scope.

## Safe assignment procedure

1. Confirm the requested person/service and least-privilege role in the ticket.
2. Read current assignments and detect an existing equivalent assignment.
3. Obtain explicit authority for the role write.
4. Apply one assignment through the approved Azure procedure.
5. Read it back and run a positive and negative authorization probe.
6. Record principal, role, timestamp, evidence, and rollback owner without copying sensitive tokens.
7. Refresh `LIVE_FACTS.json`.

Removing or widening a role is also a live write and follows the same approval discipline.

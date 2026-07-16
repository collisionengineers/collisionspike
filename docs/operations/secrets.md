# Secrets

Secrets never belong in source, documentation, manifests, test fixtures, logs, command history, or model
prompts.

## Preferred order

1. Managed identity with least-privilege Azure role.
2. Workload identity or delegated user identity where the provider supports it.
3. Secret-store reference for unavoidable provider credentials.

Application settings may contain a secret reference, not the resolved value. Local templates contain
names and placeholders only.

## Rotation

Rotation is a production write and requires explicit scope. Use overlap when the provider supports dual
keys, update the secret store, read back metadata without exposing values, restart only components that
require it, probe the capability, retire the previous value, and record evidence in the ticket and
`LIVE_FACTS.json`.

If a value appears in Git, logs, output, or a ticket, treat it as exposed: stop printing it, notify the
operator, rotate it through the approved path, and remove the checked-out-tree reference without claiming
Git history was rewritten.

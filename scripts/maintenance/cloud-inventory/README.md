# Cloud inventory runbook

Read-only collection scripts that produce the tenant/subscription inventory in
[`docs/operations/cloud-inventory-2026-07-17.md`](../../../docs/operations/cloud-inventory-2026-07-17.md).

## What it does

Enumerates the live Azure and Microsoft Graph estate and writes one JSON snapshot per dataset, each with a
provenance envelope (`command`, `startedUtc`, `ok`, `recordCount`, `error`). Nothing is mutated.

## Safety

- **Read-only.** Only list/show/GET calls and Cost Management *query* reads.
- **No secret values.** `00-common.ps1` holds a hard block-list refusing any key/secret/connection-string
  command, sanitises app settings and connection strings in memory to `{name, classification}` before they
  touch disk, and redacts embedded secrets from raw ARM dumps. `04-redact-sweep.ps1` is the final gate:
  it fails the run if any secret-shaped string is found in the snapshots or the report.
- Snapshots are regenerable and are **not** committed; the report and its manifest carry the provenance.

## Ownership, callers, configuration

- **Owner:** operations. Run manually during an inventory review; not part of CI or any deploy.
- **Callers:** none — invoked by hand.
- **Configuration:** none. Uses the signed-in Azure CLI context (`az login`). No app settings, no secrets.
- **Tests:** the redaction sweep (`04`) is the verification step; it must exit 0 before a report is
  published.

## How to run

```powershell
$dir = "$env:TEMP\cloud-inventory"          # any working directory outside the repo
& ./01-collect-arm.ps1   -RunDir "$dir/run" # ARM: session, ground truth, per-family, governance
& ./02-collect-graph.ps1 -RunDir "$dir/run" # Entra ID / Microsoft 365 via Microsoft Graph
& ./03-collect-cost.ps1  -RunDir "$dir/run" # cost (best effort)
& ./04-redact-sweep.ps1  -RunDir "$dir/run" # MUST exit 0
& ./05-digest.ps1        -RunDir "$dir/run" # condense snapshots -> digest.md for report authoring
```

Scripts are resumable: a re-run skips datasets whose snapshot already succeeded and retries only failures.
Requires Azure CLI with the `resource-graph` extension; uses the CLI's Python entry point directly so that
`&`-bearing REST URLs pass through cleanly on Windows.

## Deployment entry point

None — this is an operational read-only tool, not a deployable.

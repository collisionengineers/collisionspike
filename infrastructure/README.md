# Infrastructure

This directory owns shared Azure resource configuration. Deployable-specific infrastructure remains
beside the owning service so callers, tests, configuration, and deployment inputs stay discoverable.

- [`config-capture/`](./config-capture/) contains reviewable Bicep for shared application settings and
  identities.
- [`../database/operations/`](../database/operations/) contains database provisioning helpers.
- [`../docs/operations/deployment.md`](../docs/operations/deployment.md) defines the approval and
  verification process.

Repository validation is offline. No template or generated artifact is permission to mutate live state.

# Regression follow-up — 2026-07-11

PR 55 review found that the Held explanation derives its wording from the populated
`work_provider_id`, not from the provider-resolution source. A single-candidate intermediary
fallback can therefore produce the false statement that the instructions identified the provider.

## Acceptance

- Explicit provider evidence may say that the instructions identify the provider.
- A single-candidate intermediary fallback uses neutral, accurate wording and audit detail.
- Regression tests cover both resolution sources.

## Implementation

- Provider resolution now carries its source into the held-case explanation instead of inferring it
  from the populated provider id.
- Explicit instruction evidence keeps the direct wording; a single-candidate intermediary fallback
  uses neutral wording and records the fallback source in the audit detail.
- Added regression coverage for both resolution paths (`77d0478`).

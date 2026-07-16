# Documentation

This directory contains current, navigable project knowledge. Git history is the recovery path for
superseded material; there is no documentation archive in the checked-out tree.

## Choose the right source

| Area | Purpose |
| --- | --- |
| [Product](./product/README.md) | Business scope, workflow, case rules, corpora, and access model |
| [Architecture](./architecture/README.md) | Current system shape, data model, integrations, and contracts |
| [ADRs](./adr/README.md) | Accepted or proposed hard-to-reverse decisions |
| [Operations](./operations/README.md) | Current environment and safe operating procedures |
| [Operator actions](./operations/operator-actions.md) | Generated view of current blocked and explicitly operator-owned ticket actions |
| [Design](./design/README.md) | Production interaction, language, accessibility, and visual rules |
| [Governance](./governance/README.md) | Repository map, documentation rules, evidence authority, and precedence |
| [Reference](./reference/README.md) | Current external contracts and extracted reference material |
| [Reviews](./reviews/README.md) | Binding user review input; later review wins for the area it covers |
| [Tickets](./tickets/README.md) | Sole work-status authority and ticket plans |

Root entry points are [README.md](../README.md), [AGENTS.md](../AGENTS.md), the domain
[glossary](../CONTEXT.md), and the machine-readable [live facts](../LIVE_FACTS.json).

## Information rules

- Put unfinished work in a ticket, not in architecture or product prose.
- Put exact live values only in `LIVE_FACTS.json`; summarize them in operations docs.
- Put a hard-to-reverse decision in an ADR and link the affected current docs.
- Keep manual reviews intact and authoritative.
- Store source evidence by hash and express its logical uses through manifests.
- Delete superseded prose after extracting enduring rules; do not add history folders or pointer stubs.

# Documentation maintenance

## Authority

- Ticket files and ticket plans are the sole work-status authority.
- `LIVE_FACTS.json` is the sole exact environment-state registry.
- Later binding user reviews supersede earlier reviews for the same area.
- Accepted ADRs govern hard-to-reverse decisions.
- Product and architecture pages describe current behaviour, not aspirations or history.

## Where information belongs

| Information | Location |
| --- | --- |
| Business rules and scope | `docs/product` |
| Current system design and contracts | `docs/architecture` |
| Exact live state | `LIVE_FACTS.json` |
| Procedures | `docs/operations` |
| Hard-to-reverse decisions | `docs/adr` |
| UI and interaction rules | `docs/design` |
| Repository/evidence policy | `docs/governance` |
| External contracts and extracted source references | `docs/reference` |
| User review input | `docs/reviews` |
| Work, blockers, research, and implementation evidence | `docs/tickets` |

## Change protocol

1. Update the owning ticket when scope or acceptance changes.
2. Update `LIVE_FACTS.json` only from dated read-only evidence after a live change.
3. Update affected current docs and ADRs in the same change as code.
4. Regenerate ticket board, plan progress, repository inventory, and tool adapters.
5. Run link, orphan, ticket, inventory, evidence, and forbidden-reference checks.
6. Delete superseded prose once enduring rules and unfinished work have an owner.

Known-broken-link allowlists are not permitted. Every canonical document must be reachable from an index.
There is no in-tree archive and no placeholder page pointing at deleted material.

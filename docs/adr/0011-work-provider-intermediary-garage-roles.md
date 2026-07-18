# ADR-0011 — Provider, intermediary, Repairer, and Image Source are distinct roles that one party may combine

**Status:** Accepted; rewritten 2026-07-16 per [Review 160726](../reviews/160726/decisions.md).

## Decision

Model the roles separately, and record which role each party holds on each Case. The roles are
functions, not organisations: one organisation may hold more than one role on the same Case.

| Party | Instructs and pays | Routes work | Holds the vehicle | Supplies images |
|---|---|---|---|---|
| Work Provider | yes | sometimes | no | sometimes |
| Intermediary | no | yes | no | often |
| Repairer | no | no | often | often |
| Claimant / insured individual | no | no | sometimes | sometimes |

The Work Provider is whoever instructs and pays. The Image Source records who actually supplied images —
which may be the provider, an intermediary, the repairer, or an individual. Intermediary sender domains
may serve several providers, so provider identity is resolved primarily from the instruction content;
sender identity is authoritative only for a direct, unambiguous provider.

Never model or label a party as "the client". The phrase is ambiguous — it can mean the provider's
client, the insured, or the claimant — and each of those is a different role with different handling.

## Rationale

Collapsing these roles breaks both the EVA Principal identity and routing/chasing. The party sending an
email or images is often not the party instructing and paying for the work, and treating the sender as
the provider mis-books the Case.

## Consequences

The model keeps separate corpora and many-to-many relationships. Chasers target the actual source while
the Case retains the correct Work Provider. Role assignment is per-Case, so the same organisation can be
provider on one Case and image source on another.

# ADR-0011 — Provider, intermediary, Repairer, and Image Source are distinct roles

**Status:** Accepted (2026-06-18).

## Decision

Model the Work Provider separately from an intermediary that routes work and from a Repairer that may
hold the vehicle or images. An Image Source role records which provider, repairer, intermediary, or
individual supplied images for a Case.

Provider-owned sender domains belong only to the Work Provider. Intermediary domains belong to the Image
Source and may relate to several providers. Provider identity is therefore resolved primarily from the
instruction content; sender identity is authoritative only for a direct unambiguous provider.

## Rationale

Combining these roles breaks both the EVA Principal identity and routing/chasing. The party sending an
email or images is not always the party instructing and paying for the work.

## Consequences

The model has separate corpora and many-to-many relationships. Chasers target the actual source while the
Case retains the correct Work Provider.

# Provider and address corpora

## Work Providers

A Work Provider is the organisation that instructs and pays for the assessment. Its directory entry
holds the Principal Code, own sender domains, provider-specific requirements, and automation policy.

An intermediary is not a Work Provider. One intermediary may send work for several providers, so sender
domain alone cannot resolve provider identity in that case. Document content is primary; direct provider
sender identity is supporting evidence.

Principal Codes are canonical identifiers, at most eight characters. A name-like value exported in the
Principal field is not automatically a code. Recurring businesses need a deliberately assigned short
code; individual claimants remain VRM-keyed and do not receive a fabricated Principal Code. The corpus
review identified five active businesses awaiting canonical codes: Whiteline, Blackline, Silverline,
Proactive Hybrid Corporate Ltd, and Watermans. Silverstone remains an explicit operator decision.

Sender domains come only from observed evidence. A domain shared by more than one active provider is
ambiguous and must route to review until ownership is resolved. Corpus updates are keyed by the canonical
Principal Code so repeated loads update the same provider rather than creating duplicates.

## Repairers and Image Sources

Repairers are reusable businesses with addresses, contacts, and figures status. Providers and repairers
have a many-to-many relationship.

Image Source is a role filled by a provider, repairer, intermediary, or individual. It records how images
arrive and whom to chase. It does not replace the Work Provider identity.

## Inspection addresses

The corpus contains reusable, full-address suggestions from validated business material. Staff choose or
edit a full address. Partial postcodes and free-text fragments are not promoted into the corpus.

When no physical inspection address applies, staff deliberately choose “Image Based Assessment” and
record the reason. The EVA `Loc` value is an export artifact and must not be used to derive an address at
runtime.

Corpus changes are additive by default. Deactivation preserves history; destructive deletion requires a
separately approved data-governance action.

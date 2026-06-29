# Work provider, intermediary, and garage are distinct sourcing roles

**Status:** Accepted (2026-06-18).

The party that requests and pays for the work and goes on EVA — the **Work Provider** — is modelled
separately from the **intermediary** that sometimes routes the instruction/images on its behalf, and
from the **garage/repairer** that sometimes holds the images. Not every provider uses an intermediary;
images may come from the provider directly, an intermediary, the garage, or be chased — and which one
is provider-dependent.

Decisions:

- **`WorkProvider.knownEmailDomains` holds only the provider's *own* sender domains.** An intermediary
  is an `ImageSource` with `kind=intermediary` carrying its own `emailDomain`, **many-to-many with
  WorkProvider** (one intermediary serves several providers). Intermediary domains are therefore not
  WorkProvider domains — which is why a sender domain that maps to more than one provider
  (e.g. `hackneysolutions.co.uk` → LEX + QCL) is an **intermediary**, not an ambiguous WorkProvider
  collision.

- **The work provider is resolved primarily from the document content** (the parser's provider
  `detect_phrases`), because an intermediary's sender domain cannot uniquely identify the work provider
  (the intermediary→provider relationship is one-to-many). The sender domain is a *secondary*
  confirmation signal — authoritative only for direct (non-intermediary) providers.

- **Image sourcing is recorded per case** via `Case.imageSourceId`
  (`kind ∈ provider_direct | repairer | intermediary | individual`); the per-provider *expectation* of
  where images come from lives in `WorkProvider.imagesSourceNotes` and drives the **chaser**, which
  targets the garage/repairer (ADR-0001) when images come from there, or the intermediary/provider
  otherwise.

Trade-off: three corpora — WorkProvider (own domains), ImageSource (intermediaries / WhatsApp /
individuals), and Repairer (garages) — plus their N:N joins, instead of one flat provider list.
Accepted because folding intermediary or garage domains into the work provider breaks **both** the EVA
identity (who pays / who appears on EVA) **and** sender-domain matching. Builds on ADR-0001 (Repairer
first-class), ADR-0002 (VRM open-case correlation), and ADR-0007 (WhatsApp intake manual).

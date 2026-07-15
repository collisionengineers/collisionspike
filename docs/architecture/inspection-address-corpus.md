# Inspection-address corpus

The inspection-address corpus provides reusable full-address suggestions that staff can choose and edit.
It is not a runtime address matcher and it does not transform the EVA `Loc` export value into an address.

## Record rules

- Store a complete display address and normalized postcode.
- Keep provenance, provider/repairer relationships, active state, and verification metadata.
- Accept only full addresses from approved sources; partial postcodes and fragments remain review input.
- Prefer additive updates and deactivation so past case choices remain intelligible.
- Preserve `Image Based Assessment` as a deliberate case-level decision with a reason, not as a corpus
  address inferred by code.

## Selection

The app may rank suggestions using the selected provider, repairer, image source, and normalized search
text. Staff make the final choice and may edit the result. A search miss leaves the field unresolved; it
does not promote a partial candidate.

## Ownership

Reference-data scripts load and validate the corpus under `database/seeds` and `database/tests`. Runtime
reads go through the Data API. Changes to matching/ranking rules require fixtures covering ambiguous and
no-match cases.

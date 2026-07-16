# Case and evidence rules

## Case identity

A Case represents one assessment engagement for one damaged vehicle. Multiple cases may share a VRM
over time or even on the same day. A VRM therefore narrows candidates but does not prove identity.

The Case/PO is an internal reference. Provider references, claim references, message identifiers, and
VRMs are separate keys and retain their original values.

## Correlation ladder

1. An exact message identity or byte hash repeat is a duplicate and is not processed twice.
2. A matching Case/PO is the strongest case link.
3. A provider-scoped external reference may establish the link.
4. A unique compatible open-case VRM match may suggest or permit the documented link.
5. Ambiguous matches go to staff review; the system never merges solely because the VRM and arrival
   time are close.

Merges are human-confirmed, auditable, and reversible. Evidence is re-linked without altering its source
bytes or original identity.

## Evidence

Evidence includes source messages, instructions, attachments, photographs, engineer reports, and files
added by staff. Original bytes are immutable. Derived text, classifications, fields, and thumbnails are
separate products with their own source links.

At least two acceptable images are required for EVA readiness: an overview showing the registration and
a damage close-up. Additional provider rules may add requirements. A staff member can review and
override only through an explicit, audited action.

## Case types

Supported case types are standard, audit, audit total loss, and diminution. Case type is independent of
case status. An audited third-party report is evidence for comparison, never the instruction and never a
source for overwriting the instructed case.

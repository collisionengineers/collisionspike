# CollisionSpike domain glossary

This file defines business language only. Architecture, live state, tickets, and deployment history do
not belong here.

## Terms

**Work Provider**

The organisation that instructs and pays Collision Engineers for a case. Use “provider” as shorthand.

**Principal Code**

The provider's short code used in a Case/PO. The same characters render lowercase for EVA and uppercase
for the Archive.

**Case**

One assessment work item for one damaged vehicle. Instructions and evidence may arrive separately and
are assembled into the same case only under the correlation rules.

**Case/PO**

The internal case reference: optional case-type marker, principal code, two-digit year, and a
provider-and-marker sequence. EVA uses lowercase and the Archive uses uppercase.

**Work Provider Reference**

The reference assigned by the instructing provider. It is not the Case/PO and may not be unique outside
that provider.

**VRM / Registration**

The vehicle registration mark. It is a strong correlation signal but not, by itself, proof that two
arrivals belong to the same claim. For a case that begins with photographs alone, the registration is
the case's temporary identity until the instruction arrives.

**Repairer**

A garage or bodyshop that repairs vehicles and may supply images or figures. It is a reusable directory
entity and may work with several providers.

**Figures**

The repair-cost estimate. “Figures = Yes” means the repairer supplies its own figures; otherwise
Collision Engineers prepares them.

**Inspection Address**

The full location recorded for EVA. It may be a repairer, storage location, claimant address, or the
deliberate “Image Based Assessment” choice.

**Image Source**

The provider, repairer, intermediary, or individual that supplies case images. It carries the contact
channel and match keys used for routing and chasing.

**Instruction**

The source document or message asking Collision Engineers to undertake the assessment. It is evidence
for a Case, not a synonym for the Case.

**Evidence**

A source email, document, image, report, or staff-supplied file attached to a Case. Original bytes and
their source identity are preserved.

**EVA Readiness**

The state reached when required EVA fields, image rules, inspection-address decision, and any
provider-specific requirements are satisfied or explicitly overridden.

**Missing**

The unsatisfied items preventing EVA readiness. Missing items form the chase list.

**Chaser**

An assisted, tracked request for missing information. Email may be sent through the approved mail
channel; WhatsApp content is prepared for a staff member to send manually.

**Note**

A free-text staff entry on a Case. Notes sit alongside structured chaser and audit records.

**Case Update**

New evidence or information for an existing Case. A matching reference plus new evidence is an update;
a question without new evidence remains a query.

**Cancellation**

An inbound notice that work was cancelled or closed. It creates a staff-confirmed proposal and never
closes a Case automatically.

**Retroactive Case**

A Case reconstructed after the fact for real work the system did not originally capture. Its Case/PO is
discovered from authoritative material, never invented by the reconstruction path. Reconstruction
locates and proposes; the result joins the live case record only through a gated staff adoption step.

**Case Type**

The kind of assessment: standard, audit, audit total loss, or diminution. It is independent of case
status and evidence composition.

**Audit**

A second independent inspection that audits another engineer's report. The audited organisation is not
the Work Provider; its report is separate evidence and is never treated as the instruction.

**Audit Total Loss**

An audit of a report whose original engineer's verdict is total loss. That verdict is always stated in
the original engineer's report — recording repairable versus total loss is one of the report's core
purposes — so the marker is read from the report, never inferred from our audit's outcome.

**Diminution**

A diminution-in-value engagement. It is its own case type, not an audit subtype.

**Triage request**

An early request to make an initial call on a vehicle — repairable or total loss, roadworthy or not —
before, and often instead of, a full case. It is recorded work in its own right. Distinct from message
triage, the classification every inbound email passes through.

**Archive**

The staff-facing Box folder structure holding case material. The Archive is a one-way operational copy;
the relational case record remains authoritative.

**File Request**

An account-free upload link issued from the operator-maintained template against a Case's Archive
folder, so a claimant or repairer can supply photos without an account.

**Guided Capture**

A structured photo flow that walks the person at the vehicle through taking the required photos. It is
under evaluation as a channel; File Requests carry the need today.

# Repairer is a first-class entity, distinct from Inspection Address

A repairer/garage is modelled as its own directory entity (name, address, contacts, "Figures"
status), **many-to-many with Work Provider**, rather than as a label on a per-case Inspection
Address. Chosen because the job sheet's `Garages` list is a reusable business directory that
Collision Engineers chase images and figures from, one garage serves multiple providers, and
contact details + Figures status must persist and be reused across cases. A Case's Inspection
Address *references* a Repairer (or holds an ad-hoc location / the `Image Based Assessment` marker).
Trade-off: an extra entity + join versus a single labelled address — accepted for fidelity and reuse.

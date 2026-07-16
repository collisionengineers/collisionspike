# Data protection

Collision Engineers is the controller for case intake and handling. External hosting, mail, Archive,
vehicle, mapping, document, and AI services process only the data needed for their explicit purpose.

## Principles

- Minimize outbound fields and bytes.
- Keep source evidence immutable and derived data traceable.
- Enforce identity, application roles, row-level database policy, and append-only audit.
- Keep secrets outside source and logs.
- Treat AI output as a suggestion unless an explicit, human-confirmed capability applies it.
- Record the lawful basis, processor terms, retention rule, and sign-off for each sensitive capability.

## Two-clock retention model

Retention has a default minimization expiry and a legal/evidential-hold exemption. A disposition action
may run only after the expiry and only when no hold applies. The policy window, hold criteria, and
anonymize-versus-delete choice require operator/legal approval and are tracked by tickets.

Automated deletion from the Archive is prohibited. Cross-store erasure is a human-governed procedure that
must cover PostgreSQL, transient storage, the Archive, mail references, file-request links, and external
identifiers. A valid legal hold pauses erasure and records the reason.

## AI and images

Text sent for AI processing is minimized and scrubbed before transmission. Image analysis may contain
vehicle plates and incidental people or reflections, so it requires an explicit approved purpose and
recorded data-protection posture. Model deployment geography and processing geography are separate facts
and must be stated accurately.

## Required governance records

Outstanding lawful-basis, DPIA, ICO, data-use, processor-agreement, retention, legal-hold, and erasure
decisions remain ticketed operator/legal work. Architecture prose must not mark them complete without the
filed evidence.

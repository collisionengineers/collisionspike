# Changes — TKT-170: Classify website contact forms as Website enquiries

## Status
Implemented on `codex/tkt-170-website-enquiry`; deployment and live read-only verification remain.

## Changes made
- Added the append-only `website_enquiry` category (`100000008`) and
  `website_general_enquiry` subtype (`100000015`) across the canonical choiceset,
  database baseline/delta, DTO/codecs, API maps/counts, assisted-classifier vocabulary,
  and inbox labels/filters.
- Added a taxonomy-v4 deterministic parser rule which requires the exact webform mailbox
  and domain, a recipient-stamped aligned DMARC/Exchange authentication result, and at
  least two independent subject/body form markers. RFC mailbox parsing uses the actual
  address rather than a display name; a missing or failed authentication result is safe.
- Gave that rule precedence over reference, registration, attachment, work, query and
  case-update wording; the supplied `.eml` is an executable corpus fixture.
- Added explicit negative tests for an external sender, failed authentication, a one-marker
  message, a similar display name and an address placed only in the display name.
- Added a dedicated triage-policy rung and both primary/retro case-mint guards so website
  enquiries cannot create, update or attach to a case even when their free text contains
  an open-case reference or registration.
- Excluded the category from the older reply-link/retro lane as well, so an unexpected
  threading header cannot attach the form to a case outside the triage-policy path.
- Routed the optional filing suggestion to `Inbox/Queries/Enquiries` without moving mail.
- Added handler-facing “Website enquiry” / “Website enquiries” labels and a dedicated
  inbox category/filter. Website enquiries are not preselected as ordinary Queries in
  the manual reclassification dialog.
- Bumped deterministic decision telemetry to `triage-policy-v2` and centralised that
  version token between the domain policy and API suggestion persistence.
- Upstreamed the shared classifier change first in
  `collisionengineers/cedocumentmapper_v2.0` PR 10, merged after exact-head Claude and
  Codex PASS; tagged the reviewed commit as immutable `engine-v2.24`, re-cut the cloud
  mirror, and regenerated/verified the vendor lock.


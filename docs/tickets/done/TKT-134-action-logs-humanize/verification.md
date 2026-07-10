# Verification — TKT-134: Action-logs humanization

## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26. Findings:
- **Acceptance 1 (no snake_case/enum/GUID on primary lines): PASS live** — deployed /logs page,
  signed-in session, ALL 200 rendered rows scanned programmatically for `_`, `->|→`, GUIDs,
  `key=value`: **primaryViolations: []**. 18 unique primaries, all handler-plain from the ONE map;
  today's spread confirmed (retro reconstruction, the TKT-141 16:20 status rows, chaser family,
  duplicate flagged). Screenshots ss_0966too5c / ss_6319a34dr / ss_5982s2fuy / ss_2268o3ym5
  (in-session ids).
- **Acceptance 2 (ONE label map, no second table): PASS** — mappers.ts:523-551 always uses
  auditActionLabel from last-activity.ts (fallback 'Updated'); the old raw fallback is gone;
  ActionLogs.tsx renders server description/detail only (its KIND_LABELS maps the badge union, not
  audit codes). Live wording matches the map verbatim incl. code-map-only entries; underscored raw
  summaries render with NO detail line (plainDetail withholding live).
- **Acceptance 3 (verified live on the deployed SPA): PASS** (this session; /api/activity →
  recentActivity, the same rowToActivityEvent serving case-detail + assistant).
- **Deliberate post-ship divergence (recorded, not a failure):** the "Technical details" disclosure
  shipped in D1 was REMOVED by the PR47-52 review fix (PR52-F5: a click-to-reveal body still renders
  engineering language, banned by the AGENTS.md hard rule). Live: 0 disclosure buttons; the API
  still emits `technical`, the SPA never renders it. The acceptance never required the disclosure —
  prior BOARD/verification wording was stale and is superseded by this record.
- **Secondary-line residuals (pass the letter; follow-up ticket material):** (1) the TKT-141
  re-retire delta stamped audit_event.actor with `delta:2026-07-10-tkt141-re-retire-merged` which
  renders on the actor caption (humanActorName guards GUID/'system'/UPN only); (2) plainDetail
  filters token shape not vocabulary — engineering-flavoured details pass ("provider-match
  matched/unmatched", "Enrichment persisted: mileage, mileageUnit", "triage other/other (conf
  0.3)", bare Box folder ids); (3) actor "auto-attach" renders as a name-like tag.
- Expected absences: evidence_added / Chase-suggested / duplicate_dropped rows sat beyond the
  200-row feed window this session; unmapped codes degrade to "Updated" + badge fallback — graceful,
  never raw.

Queued SQL (informational, next data pass): delta-stamp actor leak census; the TKT-148
chase-suggested rows beyond the UI window; rows on unmapped codes.

**Re-verify:** /logs as signed-in staff — scan primaries for `_`/`->`/GUID/key=value (none);
underscored-summary rows carry no detail line; no "Technical details" disclosure anywhere (PR52-F5).

## Evidence
- Offline: `last-activity.test.ts` `plainDetail` suite pins the three live sightings
  (`box_upload_received: …`, `Status duplicate_risk -> missing_required_fields …`,
  `Case propose_attach: …`) as withheld; `mappers.test.ts` pins the humanized primary
  line + detail/technical split + GUID-actor guard. api suite 352 passed.
- Deployed: api republished (94 functions re-verified) + SPA redeployed
  (200 + strict CSP header re-verified) 2026-07-09.

## Pending / gaps
- **Live render proof outstanding** (the ticket's Acceptance requires it): an operator/
  verifier session must load `/logs` on the deployed SPA and confirm no
  snake_case/enum/GUID on any primary line, detail lines plain, and the raw summary only
  behind "Technical details".

## How to re-verify
Sign in to the SPA → Admin → Action logs. Scan the primary lines of the first ~50 rows
for `_`, `->`, GUIDs, or `key=value` tokens (there must be none); expand "Technical
details" on a `box_upload_received`-era row and confirm the raw summary lives there.

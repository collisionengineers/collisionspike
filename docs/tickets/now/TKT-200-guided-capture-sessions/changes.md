# Changes — TKT-200: Add secure guided photo capture sessions

## Status

The PR #83 implementation was merged into the PR #100 reconciliation and deployed on 2026-07-16. Its
schema, staff/API routes and SPA are present, but public capture and cleanup remain default-off pending
abuse-control, designated-test-session and physical-device evidence. No Archive write or live public
cutover was used as deployment proof.

TKT-200 replaces the conflicting provisional TKT-171 number. TKT-171 belongs exclusively to the
four-digit Case/PO sequence ticket in the contiguous TKT-171–199 operator drop.

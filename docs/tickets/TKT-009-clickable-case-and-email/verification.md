# Verification — TKT-009: Make associated emails clickable + view-full-email link

## Verdict
VERIFIED-LIVE (data linkage)

## Evidence
Both live `inbound_email` rows carry the correct `case_id`:
- case `dc307411` (partial) — email linked to its case.
- case `ca3acf21` = `QDOS26001` (full) — its `inbound_email` also carries `work_provider_id` (`fd5d4720…`); triage routed correctly.
The clickable UI is in the live SPA bundle and now has linked data to act on. Live state in the registry
[live-environment.md](../../architecture/live-environment.md).

## Pending / gaps
A final manual click-through in the live SPA (open a case → click an associated email → "view full
email") is the only remaining confidence step.

## How to re-verify
In the deployed SPA, open a case, confirm the associated emails are clickable and that "view full email"
opens the full message.

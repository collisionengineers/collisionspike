# Verification — TKT-072: The search box doesn't search — global search across cases, emails, providers

## Verdict
TESTED (offline)

## Evidence
- `api/src/functions/search.test.ts` — query shaping, short-query guard, per-group caps, honest-empty.
- SPA build + suite green; `node verify-all.mjs` API + SPA gates green.

## Pending / gaps
- Built DARK: `GLOBAL_SEARCH_ENABLED` defaults **off**; the route 404s and the SPA view is unreachable
  until flipped.
- **Not deployed.** Live proof (`/api/search?q=` with a valid token returns grouped JSON; without a token
  → 401; same-VRM grouping visible in the SPA) is pending the operator flip in
  [docs/gated.md](../../../gated.md) (§F) after a soak.

## How to re-verify
Offline: `npm --prefix api test`, `npm --prefix mockup-app test`. Live (after flip): call `/api/search?q=<vrm>`
with and without a bearer token; exercise the SPA search box and confirm same-VRM grouping.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

FAILED narrowly — the core is LIVE AND WORKING (spaced/compact VRM grouping "3 cases share registration PK20FWT"; Case/PO/claimant/provider/email searches grouped + capped; 401 fail-closed; honest empty + too-short states; case rows open the case; independent openVrmTwins cross-check agrees; terminal/removed scope code-confirmed with zero terminal cases existing to probe). Two acceptance details missing from the deployed code: case rows carry NO age (payload has no date field) and email rows navigate to the bare Inbox, not the item. Both folded into the in-flight final wave (api+SPA deploys). Stays verify pending that landing.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.

## Verdict update — 2026-07-10 (final sweep, ticket-verifier dispatch; transcribed verbatim)

**PENDING — tail sharply narrowed: both 07-09 FAILED details are now live in the served SPA** (bundle-proven today): the case-row age render (`caseAgeLabel` wired into the result-row join) and the email deep-link `/inbox?item=`, plus the grouping header "cases share registration". Server side: `c.created_at` in the live-lineage search mapping; `GLOBAL_SEARCH_ENABLED=true`; `globalSearch` live; unauth 401 today. The core matrix (grouping "3 cases share registration PK20FWT", caps, honest-empty, click-through, openVrmTwins) was live-proven signed-in 07-09. Remaining (narrow, not bugs): a signed-in re-probe showing (a) ages on case rows + (b) an email row opening the specific inbox item; plus acceptance-5's DB cross-check (queued: PK20FWT case count must equal the rendered count). Behavioral certification from bundle strings alone would violate the no-code-only-proof rule. Verified by: ticket-verifier dispatch, 2026-07-10.

### W7 data-pass result (orchestrator-run, 2026-07-10)
Acceptance-5's DB cross-check CLOSED: `PK20FWT` case count = **3**, exactly matching the 07-09
rendered grouping "3 cases share registration PK20FWT". Remaining tail: the signed-in re-probe of
(a) age render on case rows + (b) the email deep-link only.

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

**VERIFIED-LIVE** — every acceptance item in `TKT-072-global-search.md:55-73` was demonstrated against
the deployed SPA/API on 2026-07-14.

## Evidence

1. Spaced VRM `PK20 FWT` returned all three matching cases, each with provider, status context, and age
   (`11d`, `11d`, `12d`), plus “3 cases share registration PK20FWT.”
2. Live searches succeeded for:
   - Case/PO: `PCH26009`
   - Claimant: `Kimberley Connolly`
   - Provider: `Performance Car Hire`
   - Sender: `mray@qdosassist.co.uk`

   Results were grouped by type; the email group was capped at five rows.
3. Clicking a case opened `/case/68442a2a-998c-4a16-89ba-8fe226303734`. Clicking an email result opened
   `/inbox` with the exact matching email preview selected.
4. Duplicate-registration messaging was present for `PK20FWT`.
5. An unauthenticated `GET /api/search?q=PK20FWT` returned `401 Unauthorized`. `RE 30143` produced the
   honest empty state.
6. `q=a` showed “Try a longer search term”; empty `q=` showed the neutral Search screen without returning
   data.
7. Existing W7 direct-Postgres evidence records three `PK20FWT` rows, matching the three live rendered
   rows.
8. Targeted tests passed:
   - API search/proxy: **12 passed**
   - SPA date/deep-link/client: **42 passed**

## Pending / gaps

No acceptance gap. A fresh direct Postgres re-query was unavailable because the server connection had
already failed twice; no firewall mutation was attempted. Only the required unauthorized branch was
probed (`401`), not a separately constructed wrong-role `403`.

## How to re-verify

Repeat the signed-in VRM, Case/PO, claimant, provider, and sender searches; click one case and one email
result; then repeat the unauthenticated API request. When direct DB connectivity is restored, recount
normalized `PK20FWT` rows and compare them with the rendered count.

## Confidence + unread surfaces

**High confidence.** Fresh deployed-SPA and API evidence covers every acceptance item. Unread surfaces
are the current direct DB connection and a distinct wrong-role `403` token case.

# Verification — TKT-195: Manage staff access with Microsoft work accounts

## Verdict
PENDING

## Acceptance evidence matrix

| Acceptance | Offline evidence required | Signed-in/live evidence required | Verdict |
|---|---|---|---|
| A1 — Microsoft-only sign-in, no local/default password | Schema/API/UI inspection and tests find no password path; source/build/secret scans find no dropped default outside immutable operator evidence. | Deployed sign-in redirects through Microsoft and authenticated network/storage inspection shows no local credential endpoint/store. | PENDING |
| A2 — immutable principal mapping for all nine names | Mapping validation tests require unique object IDs and reject email/display-only or guessed mappings. | Approved signed-in/Graph inventory records a confirmed principal ID for every listed display name. | PENDING |
| A3 — approved initial User/Superuser intent | Fixture/config tests assert the exact intended role table and existing-`alex` reuse guard. | Authenticated Graph/application views reconcile each approved assignment and prove no duplicate `alex` principal. | PENDING |
| A4 — truthful Superuser staff-access page | UI/API/Graph-fake tests cover list/grant/change/remove and prevent success before confirmed Graph result or tenant deletion calls. | Signed-in Superuser sees current state and completes an approved genuine staff assignment change confirmed in Graph and the page. | PENDING |
| A5 — canonical roles only | Contract/snapshot tests reject earlier Admin and Engineer assignment options/writes. | Live enterprise-app assignment inspection shows only canonical User/Superuser values for approved genuine changes. | PENDING |
| A6 — server authorization and least privilege | API tests deny every endpoint to User/anonymous and assert Graph scopes/target constraints. | Signed-in User sees no page and receives 403 on direct calls; Superuser succeeds against only the intended app. | PENDING |
| A7 — app-only revocation and refreshed denial | Graph-call tests assert role-assignment deletion only and UI copy describes token refresh honestly. | When operationally required, revoke an approved genuine assignment, prove the Microsoft account remains intact, refresh sign-in and capture application 403; otherwise retain this live row as PENDING. | PENDING |
| A8 — lockout/concurrency/idempotency guards | Tests cover self/last-Superuser, duplicate, stale, unmapped and response-loss cases with one assignment/outcome. | Approved genuine signed-in actions show safe refusal/confirmation and no duplicate Graph assignment or lockout; destructive lockout shapes are proved only offline. | PENDING |
| A9 — complete assignment audit | Audit contract tests assert all actor/target/role/assignment/operation/time/outcome fields and plain display copy. | Signed-in action history plus database audit matches the controlled grant/change/remove/refusal and correct staff names. | PENDING |
| A10 — stable ownership and unspoofable names | Claim/API tests reject client display spoofing and prove alias rename does not rewrite prior snapshots. | Two genuine staff actions show distinct trusted names; authorized detail resolves stable principals without raw-ID leakage elsewhere. | PENDING |
| A11 — Microsoft credential handoff and no credential capture | UI snapshots, request-schema tests, log/storage checks and secret scans find no password input/value path. | Deployed account-management action opens the approved Microsoft route; network/telemetry contains no supplied credential material. | PENDING |
| A12 — full offline and approved live proof | All named unit/integration/UI/security scenarios pass. | Recorded User/Superuser and any operationally required revoked-principal run reconcile Graph, API, UI and audit without changing unrelated staff; unavailable live shapes remain PENDING. | PENDING |

## Pending / gaps
Principal mappings, implementation, Microsoft permissions and controlled live proof are pending. No staff assignment should be guessed from the aliases in the source note.

## How to re-verify
Obtain the approved principal mapping, run every offline suite, and gather signed-in proof only from genuine approved staff-access work. Attach concrete Graph/API/UI/audit evidence to every available row; keep unavailable live shapes `PENDING`. An independent verifier must confirm no local credential path and no staff lockout.

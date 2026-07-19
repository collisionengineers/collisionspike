# PLAN-012 derivation summary

## Review boundary

PLAN-012 distils four local, user-owned architecture-simplification sources and revalidates their governed
outcomes against PLAN-007–011 at `6403f4eaed10cfbbb16dd3e5186b8ebfb0f094cf` plus current code and
read-only Azure evidence. The `workingspace/` sources are untracked in the source checkout and intentionally
absent from this pull request. Their raw Git blob OIDs were calculated without `-w`, so they are
content-addressed references rather than claims that the blobs are committed. The source files were not
edited, renamed, staged, or copied.

## Immutable source references

### User-owned local sources

| Exact source path | Raw Git blob OID | SHA-256 | Role |
|---|---|---|---|
| `workingspace/architecture-simplification/azure-live-verification.md` | `3421f7928d231e33b3d9c7a4a0ae06674d6981c7` | `8e08488f6e2cfa571c607b672c11780d9477cd14af4320729245a622b69c7951` | Point-in-time Azure verification used only as a claim inventory; volatile claims were rechecked below. |
| `workingspace/architecture-simplification/review_1.md` | `52f4402d110c5a04a9f72cf59d5a56b261ac24e2` | `6b4564cddadda049fd26217660c45773ca358b6494df7ed419b8519b8ccda385` | First independent architecture review. |
| `workingspace/architecture-simplification/review_2.md` | `64e08416913c3e334546c5810d422f6e8a2f4f35` | `370e4eb1f9ee906e7af44e5bb40a0314f6f392070a594bbab51f5f280b19e9ef` | Second independent architecture review and detailed inventory. |
| `workingspace/architecture-simplification/review_reconciled.md` | `2900e2d9645e618af3ddf37ac11e8228c31a1002` | `e24135958a91aec1e4208ed81106642d12ed57e77854984c4602dd946f7f9a7f` | Reconciled findings register, dispositions, plan prescriptions, and Gate 0 checklist. |

### Governed plan sources

All five paths below were re-read at commit `6403f4eaed10cfbbb16dd3e5186b8ebfb0f094cf`.

| Exact source path | Blob OID | Role |
|---|---|---|
| `docs/tickets/plans/PLAN-007-server-runtime-foundation.md` | `1b6648642281c3c694392a8e4b2faa9de28189bd` | Server-runtime ownership and terminal-guard source. |
| `docs/tickets/plans/PLAN-008-canonical-service-routes.md` | `a3bd00f482a9e053548eb7e7138b2c0e08c3e2a6` | Route/authority lane and terminal-guard source. |
| `docs/tickets/plans/PLAN-009-cloud-estate-cleanup.md` | `a9c63fd980d2d68d89eb581954e86aafc6c59a3b` | Live-state separation and refresh ownership source. |
| `docs/tickets/plans/PLAN-010-scripts-and-tooling-dedup.md` | `673c24f9021becfa3e283dbc9a6d201b809aceaa` | Tooling single-source guard and equivalence source. |
| `docs/tickets/plans/PLAN-011-python-doctrine-and-parity.md` | `dc888e5b7b5fa22e8c76061881630e952b369ef4` | Cross-language behavioural-parity guard source. |

## Adopted, changed, and dropped decisions

| Source claim or concern | Decision | Governed result and rationale |
|---|---|---|
| The five-plan series needs a final repository-wide sweep. | **Adopted.** | TKT-270 performs a reproducible, read-only audit and maps each residual to an existing owner, a new ticket, or an intentional exception. A point-in-time findings list is not exhaustive proof. |
| Repeated mechanisms should share one home. | **Changed.** | TKT-270 and TKT-274 require structural equivalence plus compatible contract, owner, lifecycle, security, and failure semantics. Three instances trigger review, not automatic consolidation. |
| Completed consolidation plans need durable terminal guards. | **Adopted with qualification.** | TKT-271 requires machine-readable plan classification and modality-specific guards. TypeScript rules may use AST/import analysis, tooling rules import/reference analysis, cross-language rules behavioural fixtures, and live-state rules evidence comparison. |
| Browser-safe domain code and server runtime need a hard boundary. | **Adopted and strengthened.** | TKT-272 checks both SPA-to-server reachability and direct/transitive domain-to-server or cloud-SDK dependencies in manifests and source graphs. |
| Python function clients, BFF/downstream routes, outbox drains, colocated Bicep, and PII/secret controls are duplicate implementations. | **Dropped as blanket consolidation targets.** | Their contracts, callers, owners, security policies, or failure state machines differ. PLAN-007–011 preserve those boundaries and share only proven equivalent primitives or behavioural fixtures. PLAN-012 guards the distinction rather than flattening it. |
| A generic lexical or universal AST guard can close every consolidation. | **Dropped.** | TKT-271 records each guard's real mode and command. A lexical ban would create false positives; behavioural and live-evidence risks are not AST properties. |
| `LIVE_FACTS.json` freshness and doc agreement prove live parity. | **Dropped.** | TKT-273 requires a committed evidence snapshot, field map and digest for offline comparison plus a separate credential-gated, read-only Azure comparison. |
| Changing diff rendering makes an unchanged source draft reviewable. | **Dropped.** | TKT-274 requires a derivation summary for every new plan, including when its source is unchanged. User-owned bytes and `.gitattributes` remain untouched. |
| Every implementation PR must be net-negative. | **Changed.** | TKT-274 measures the completed consolidation lane and aggregate plan. A scaffold may be locally positive; a non-negative completed result requires an explicit operator decision and semantic rationale. |
| Gate 0 should edit the user-owned drafts before governed work proceeds. | **Dropped from repository execution.** | The drafts remain user-owned and byte-stable. Corrections are recorded in governed plans, tickets, evidence notes, and this decision map instead. |
| Capture-expiry, trust-seam, ADR, and rate-limit findings belong inside PLAN-012. | **Dropped from this plan's implementation scope.** | They retain their existing functional owners, including TKT-200, TKT-243, TKT-245, and TKT-246, or the relevant PLAN-007–011 tickets. TKT-270 must map rather than duplicate those owners. |
| Exact live values should be copied into planning prose. | **Dropped.** | Exact current values and verification timestamps remain governed by `LIVE_FACTS.json` and the machine evidence TKT-273 will introduce. This summary records only field-level matched/stale decisions. |

## Volatile-claim revalidation

The tracked evidence below was inspected at commit `6403f4eaed10cfbbb16dd3e5186b8ebfb0f094cf`:

| Exact tracked path | Blob OID | Use |
|---|---|---|
| `LIVE_FACTS.json` | `ef0309fe77fe7267fd1d73028c7667fdea46ba7f` | Governed values compared with the live read-only queries. |
| `docs/operations/cloud-inventory-2026-07-17.md` | `a683e5a6872883d6567b0578304019ae5e6aa950` | Dated inventory and cost wording checked for staleness. |
| `.github/workflows/ci.yml` | `2446cd702687cbb4325dfbf6b01ca14de2825fea` | Current “live registry drift” job inspected. |
| `verify-all.mjs` | `e9fe7f66446d4c704097c21e763691a757f51d44` | Offline verifier contract inspected. |

Read-only Azure verification produced these field-level decisions without changing live state:

| Claim | Current evidence | Decision |
|---|---|---|
| Subscription offer and spending limit | The live offer and spending-limit fields were compared with their governed counterparts. | The tracked fields are stale; TKT-257 retains refresh ownership and TKT-273 adds comparison evidence. |
| Data API function registrations | The live registration count was compared with its governed counterpart. | The tracked field matched when checked. |
| Orchestration function registrations | The live registration count was compared with its governed counterpart. | The tracked field is stale; TKT-257 retains refresh ownership and TKT-273 adds comparison evidence. |
| Existing live-registry CI proof | `.github/workflows/ci.yml` sets `VERIFY_LIVE=1` but invokes `verify-all.mjs`, whose contract says it never contacts the live environment and which does not consume that variable. | The current job can be a false green. TKT-273 requires a distinct credential-gated comparator and explicit no-credential skip semantics. |

No Azure, database, mailbox, Archive, deployment, secret, or other live state was changed during this
revalidation.

# Final review — PR #100 remediation and release decision

## Current verdict

**REMEDIATION COMPLETE; release validation pending.** The preliminary `REQUEST CHANGES` verdict remains
binding until the exact reconciled commit passes GitHub checks, is deployed to the existing development
environment under the safety constraints below, and the resulting live evidence is committed.

## Scope and method

This Stage-3 review started from commit `bfb3fa408e5e5bd5b0acacafd0fbb6defe8e27a3`, every file in this
review pack, current `origin/main`, PR metadata, all review threads, current ticket authority, and read-only
Azure state. The branch was merged with current main rather than rebased by taking either whole tree. Each
conflict was resolved against runtime contracts and the later feature work already on main.

## Preliminary blockers and findings

| Finding | Final disposition |
| --- | --- |
| Stale base and feature reversion | Resolved. Current-main guided capture, Archive holding, MCP image ingestion, image deletion, schema changes, corpus seeds, routes and UI were carried into the new layout and covered by the full suites. |
| TKT-207/TKT-208 collision | Resolved. The colliding current-main work is TKT-217/TKT-218; PLAN-006 retains its own 207/208 authority. Ticket generation rejects duplicate IDs. |
| Merge conflict / dirty PR state | Locally resolved; remote confirmation awaits the pushed merge commit. |
| False reconciliation assurance | Resolved. A committed exact ledger is required; keep/move bytes are checked, rewrites must differ, final rows require origins, and deletions require a PLAN-006 retirement reason. |
| Parser authoring-source proof and live verifier removed | Resolved. CI again checks the private authoring source and retains the live-verification job without changing the review-hook design. |
| Higher-precedence ADR/review loss | Resolved by restoring the applicable ADR amendment and transcribing the current requirements. Obsolete visual artifacts are not restored because this later review supersedes their retired interface framing. |
| Corpus seed missing | Resolved with the current replayable seed and four source CSVs. |
| Legacy audit parser fallback removed | Resolved in the domain decision and both intake/retro callers, with regression tests. |
| EVA warning cache lost retry warnings | Resolved; cached idempotent results preserve the original manual-follow-up warnings. |
| Provider intake retries duplicated cases | Resolved with provider-scoped durable idempotency, request-content binding, conflict/indeterminate handling and tests. |
| Invalid provider Base64 could write first | Resolved; strict decoding and file validation complete before any case or evidence write. |
| EVA adapter used the wrong route/body | Resolved to `/api/eva/instruction-inspection` with the canonical `evaPayload12` request. External submission remains disabled. |

## Additional final-review findings

- The repository reorg omitted six existing Archive-client mutation/scope methods from the new operations
  mixin. They were restored from reviewed repository history. The full Archive suite passes 274 tests.
- Six post-merge source modules exceed the 800-nonblank-line default. TKT-210 was moved back to `now`, its
  former completion claim was retired, and an exact no-growth ratchet now prevents growth or new exceptions.
  This is disclosed decomposition debt, not represented as completed work.
- Live API and orchestration settings had `OUTLOOK_MOVE_ENABLED=true`. Both were set to `false` and read back
  false before release work. No mailbox mutation was used as proof.
- The Archive function's `BOX_ALLOWED_ROOT_ID` read back as `392761581105`, the approved test root. No
  production Archive cutover is authorized or performed.
- The committed reconciliation ledger initially reproduced prohibited vocabulary from deleted historical
  path names. Generation now validates the exact Git-tree strings internally, then writes any policy match
  only as an irreversible SHA-256 reference. The strict whole-tree scan reports no matches.
- The first Linux CI build found that the Windows-authored npm lockfile omitted Lightning CSS's Linux native
  package. The exact 1.32.0 Linux x64 GNU package is now a root optional dependency beside the existing
  cross-platform native-package pins; the replacement push and pull-request runs passed.
- Pre-deployment live parity found the canonical `100000049 / evidence_added` audit action absent from the
  development database, matching TKT-165's recorded failed upload. A fail-closed, replay-safe corrective
  migration is now part of the reviewed release; it must pass CI and apply before application publication.

## Safety decision

- Mail intake and subscription maintenance remain read-only. The earlier suggested-mail-filing activation
  direction is superseded: `OUTLOOK_MOVE_ENABLED` must remain false and no mailbox write permission is added.
- `EVA_API_ENABLED` remains false or absent. The repaired contract is deployed dark; no instruction,
  attachment, poll or finalization request is sent to EVA.
- Archive writes remain locked to test root `392761581105`. No production root is configured and no live
  cutover is performed.
- Individual image deletion, capture cleanup and public capture stay off until their own ticket evidence is
  complete. Deployment of code or schema is not evidence that those behaviors are enabled or verified.
- The existing Codex and Claude review integration is unchanged; this review does not add another hook.

## Verification record

- Final clean aggregate: `node verify-all.mjs` passed 34/34 gates on the staged reconciled tree.
- Linux-package delta: clean install, all four builds, 2,605 TypeScript tests, both deployment bundles and
  40 repository-check tests passed after adding the exact native-package pin and lockfile guard.
- Production build: passed for domain, Data API, orchestration and web.
- TypeScript tests: domain 559, Data API 993, orchestration 508, web 545 — all passed.
- Python: Archive 274, EVA Sentry 43, location assistance 75, OCR 38, parser 384 with 9 intentional skips,
  vehicle enrichment 68, email evaluation 2 — all passed in the completed component runs.
- Runtime contract: 189 routes, 56 DTO declarations, 7 JSON schemas, 64 Postgres tables, 22 numeric code
  tables.
- Repository evidence: 638 logical uses, 618 unique blobs, 20 duplicate occurrences, 77,263,752 duplicate
  bytes removed, 294 reviewed image blobs.
- Documentation/tickets: 1,121 Markdown files, 211 tickets and 6 plans passed before this final evidence
  update; the final generated counts are rerun before release.
- Dependency audit: no high or critical advisory. Two moderate `uuid` advisories are transitive through
  `durable-functions`; the offered forced remediation is an incompatible downgrade and is not applied.
- Azure validation: signed-in existing subscription and `rg-collisionspike-dev` confirmed; five existing-
  resource Bicep/capture templates compile. No new resource, role, scale or region is requested.

## Remaining release gates

1. ~~Generate and verify the final staged repository inventory and committed reconciliation ledger.~~
   Complete: 3,087 tracked files, 3,268 baseline files, 3,085 non-recursive final files, zero unexplained.
2. ~~Complete the final clean aggregate with zero failures.~~ Complete: 34 passed, 0 failed after a clean
   dependency install. The run includes all component suites, deployable bundle smoke loads and governance
   gates.
3. Push the exact merge commit and require current GitHub checks; resolve the three review threads with links
   to their remediations.
4. Apply only missing additive migrations, publish only changed deployables, and complete non-mutating live
   health/safety probes.
5. Commit the observed live facts and ticket evidence, obtain green checks, then merge PR #100.

Until all five gates are evidenced, this file does not approve merge.

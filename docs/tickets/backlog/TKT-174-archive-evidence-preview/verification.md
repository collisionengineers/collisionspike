# Verification — TKT-174: Make Archive evidence previews load clearly and open larger

## Verdict
PENDING

## Acceptance evidence matrix

| Acceptance | Offline evidence required | Signed-in/live evidence required | Verdict |
|---|---|---|---|
| A1 — immediate, non-blank loading state | Component test pauses the rendition request and proves the loading placeholder replaces both blank and stale content synchronously. | Signed-in browser recording shows the loading state before a deliberately delayed controlled thumbnail. | PENDING |
| A2 — measured fastest authorized preview path | Request-waterfall evidence plus API/client tests prove the chosen rendition/original branch, stable geometry and avoidance of original bytes whenever a bounded rendition exists. | Browser network capture records selection-to-first-pixels phases, the actual evidence-backed branch and a stable preview layout. | PENDING |
| A3 — bounded larger view and focus return | Interaction/accessibility tests open and close the overlay, assert lazy large-image fetch, unchanged evidence state and restored focus. | Signed-in browser proof opens the selected image large, closes it by keyboard and confirms acceptance/order did not change. | PENDING |
| A4 — every failure terminates without corrupting analysis | Parameterized tests cover all failures, assert no pending spinner, and prove preview failure alone cannot change analysis/readiness. | An unavailable/expired response renders safe retry copy while the same evidence analysis/readiness state remains unchanged unless original loss is independently proved. | PENDING |
| A5 — retry obtains fresh access and cannot write/apply stale data | API and race tests assert a new access resolution/request, no mutation call and stale-attempt suppression. | Browser network evidence shows a second fresh read after retry and no POST/PATCH/DELETE request. | PENDING |
| A6 — obsolete requests cannot cross evidence items | Deferred-promise tests switch items/unmount in both response orders and assert the selected record alone can render. | Rapid signed-in selection across controlled items never displays a filename/image mismatch. | PENDING |
| A7 — authorization and safe response surface | API authorization tests cover assigned, unassigned and cross-case access; snapshots contain no credentials, paths or provider identifiers. | Assigned staff can preview; an unauthorized controlled request is refused and the UI shows only safe handler copy. | PENDING |
| A8 — accessible and responsive states | Automated keyboard, focus, accessible-name and viewport tests cover every preview state and the overlay. | Keyboard-only signed-in pass at desktop and narrow widths confirms focus, labels, close behavior and readable states. | PENDING |
| A9 — required regression and deployed scenarios | Focused suites prove every named scenario and the existing evidence-preview regressions remain green. | Recorded run on operator-designated existing evidence covers success, larger view, unavailable state and retry without evidence mutation. | PENDING |

## Pending / gaps
Implementation and all offline and signed-in/live proof are pending.

## How to re-verify
Run the offline suites and the deployed signed-in scenarios in the matrix, attach one concrete artifact to every row, and retain `PENDING` until an independent verifier has checked all nine acceptance lines.

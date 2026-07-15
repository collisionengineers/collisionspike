# Verification — TKT-199: Make repository data authority explicit without weakening security

## Verdict
TESTED (offline) — independent live/security review remains required

## Acceptance evidence matrix

| Acceptance | Offline evidence required | Signed-in/live repository evidence required | Verdict |
|---|---|---|---|
| A1 — complete binding-instruction inventory | Inventory script/manual review output lists every scoped file and cited restriction with keep/rewrite/remove disposition. | Authenticated repository tree/diff review confirms all binding surfaces in the inventory exist and none was omitted. | PENDING |
| A2 — canonical complete internal authority | Policy tests locate one dated canonical statement containing every permitted material/action and the no-repermission rule. | Signed-in repository view shows the statement from entry-point instructions and a normal agent run follows it. | PENDING |
| A3 — source contradictions and TKT-068 guidance rewritten | Full-scope review/checker reports zero unresolved PII-only prohibitions and asserts TKT-068 names-only guidance is superseded or clearly prior. | Authenticated diff review confirms no competing operative instruction remains on the default branch. | PENDING |
| A4 — security/live boundaries preserved | Policy assertions and reviewer checklist cover secrets, access, least privilege, mailbox/provider, production writes and external publication. | Signed-in repository/CI view plus a dry-run agent scenario demonstrates those controls still stop an unauthorized secret/share/live-write action. | PENDING |
| A5 — approved assistant separated from arbitrary egress | Policy fixtures allow configured multimodal image input and local reading while blocking unapproved services/publication/secrets/residency breaches. | Authenticated review proves retained egress rules do not block approved assistant input or local source inspection. | PENDING |
| A6 — evidence and assistant workflows updated safely | Skill/agent tests permit all named raw formats plus configured-assistant image input while preserving hashes and no-move/no-edit authority. | A signed-in project run reads representative formats, uses the configured assistant where required and leaves tracked sources unchanged. | PENDING |
| A7 — semantic decisions and retained rationale complete | Human audit checks paraphrases and requires a cited rationale/authority for every retained restriction. | Independent authenticated reviewer samples each retained/rewrite class and agrees with the recorded decision. | PENDING |
| A8 — deterministic contradiction check integrated | Checker unit/integration tests prove presence scan, scoped deny detection, actionable output, allowlist rules and normal verification integration. | Authenticated CI run executes the new check on the repository head and publishes a passing result. | PENDING |
| A9 — robust checker fixtures | Direct/paraphrased deny, canonical allow, legitimate boundary and stale/overbroad allowlist fixtures produce the specified pass/fail results. | CI artifact exposes the fixture run and a reviewer verifies an intentional failing fixture is caught before removal. | PENDING |
| A10 — all docs/ticket/skill checks and human hierarchy review | Local validation commands pass together and copied/generated skill surfaces match the canonical policy. | Authenticated CI passes and independent review records one unambiguous precedence conclusion. | PENDING |
| A11 — raw-format and configured multimodal proof | Tool evidence opens EML/image/PDF/Word, proves unchanged hashes, and inspects the configured-assistant request containing actual image content; network guard proves no unapproved egress. | Signed-in task/repository evidence shows approved multimodal processing and zero production/unapproved external write activity. | PENDING |
| A12 — durable discoverability and precedence | Entry-point/link tests reach the authorization/audit and assert the dated scope/exclusions/precedence are present. | A fresh signed-in agent/reviewer starting from repository entry docs correctly states both authority and retained limits without chat context. | PENDING |
| A13 — evidence bytes unchanged | Evidence validation compares every pre/post byte size and SHA-256 and fails on mismatch. | Authenticated repository review samples catalog blobs against their owning manifests. | PENDING |
| A14 — logical uses preserved | Catalog checks prove every owner/role/original filename resolves to exactly one stored SHA-256 while duplicates retain separate uses. | Independent review samples duplicate groups and confirms all former occurrences remain represented. | PENDING |

## Pending / gaps
The instruction audit, policy rewrites and contradiction checker are complete offline. A representative live `.eml`, image, PDF and Word proof through the configured multimodal boundary, plus independent security review of retained controls, remains pending.

## How to re-verify
Run the inventory, contradiction fixtures/full scan, evidence-catalog verification, all repository
documentation checks, the representative local raw-format review and authenticated CI/reviewer pass.
Attach one concrete artifact to every row and retain `PENDING` until all fourteen acceptance lines are
independently verified.

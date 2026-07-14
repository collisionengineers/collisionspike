# Repository data authority — 2026-07-14

## Binding authority and precedence

The operator has authorised complete internal project use of every email, image, document and evaluation
artifact committed to this repository. Agents may open, decode, render, extract, compare and analyse the full
bytes for ticket evidence, parsing, classification, AI evaluation and verification. No separate permission is
needed because the material contains PII, personal data, client data or real-case detail. Raw image bytes may
be supplied to the configured project multimodal assistant when image understanding is required.

This supersedes any older operative PII-only restriction on raw repository material. It does not weaken
secret/credential non-disclosure, repository and tenant access controls, least privilege, mailbox/provider
scope, approval for production writes, or the prohibition on unapproved external transmission or publication.
The material is not public, anonymised, synthetic or safe to share merely because internal analysis is allowed.

## Decision inventory

| Surface | Prior restriction or ambiguity | Decision | Rationale |
| --- | --- | --- | --- |
| `AGENTS.md` | No single repository-data authority | Rewritten | Canonical, dated authority and retained security boundaries. |
| `.gitignore` `raw/` and local PII backups | PII alone excluded source evidence from Git | Removed | Authorised source/evaluation evidence may be tracked; only external recovery artifacts stay outside checkouts. |
| `docs/README.md` | `raw/` described as a non-committed PII drop-zone | Rewritten | Entry point now points to this authority. |
| `TKT-068` | Image bytes were described only by filenames and barred from the model | Rewritten | Configured multimodal processing may receive original image bytes; confirmation and staff-write boundaries remain. |
| `scripts/check-doc-links.mjs` | `raw/` allowlist rationale implied an ongoing PII exclusion | Rewritten | The allowance is historical-link compatibility, not a data-policy rule. |
| `scripts/live/remediate-blank-claimants.mjs` | Backup location comment called evidence a PII artifact | Rewritten | The outside-checkout requirement is retained as a recovery control, not a PII-processing ban. |
| Secret/key ignores and Key Vault guidance | Credentials must not be committed or disclosed | Keep | A credential is not authorised project evidence. |
| External sharing, tenant/RLS, mailbox scope and production-write gates | Limits on external effects | Keep | The ruling permits approved internal processing, not arbitrary egress or mutation. |
| Older ADRs/ticket records mentioning PII scrubbing or retention | Historical/proposed policy records | Keep as history; TKT-206 owns runtime removal | Historical evidence must not become operative guidance; runtime-policy removal is separately sequenced. |

## Deterministic guard

Run `npm run check:data-authority`. It requires this canonical statement, scans the defined binding surfaces
for direct and paraphrased PII-only raw-data denials, and validates that any narrow exception has an exact
file/line pattern plus a recorded rationale and authority. The check is also part of the full docs check.

## Evidence-handling rules

- Preserve source bytes and record hashes when analysis changes representation.
- Do not silently edit, discard or move supplied evidence.
- Use only configured/approved project processors for raw material; do not create a new external transmission
  merely to collect additional data.
- Keep recovery bundles, database dumps and non-source backups in `collisionsuite-recovery`, outside every
  repository and worktree.

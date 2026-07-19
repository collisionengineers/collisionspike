# Verification — TKT-211: Enforce the forbidden-reference zero state

## Verdict
TESTED (offline)

## Evidence
- The strict scanner reports zero configured matches in tracked filenames, paths, text, code, comments,
  configuration, schemas, manifests and generated adapters.
- The strict scanner's expanded hashed vocabulary reports zero current-tree candidates requiring remediation.
- The binary-content gate reports zero prohibited extracted strings across retained email, message, PDF
  and Office evidence.
- The image-review manifest contains 294 per-hash visual-review records: OCR covers 136 text-bearing
  images and 7,453 extracted lines, while 158 ordinary case photos have explicit visual-only records.
  The gate reports zero former-system names, logos, screens, signature hits or unresolved findings.
- Negative fixtures exercise case, spacing, punctuation, URL-encoded, double-encoded and hashed-signature variants.
- Database parity proves 22 current code tables and 171 ordered numeric options retain the exact
  fingerprint 1160403a90e21a333a68d4c492a75ba54c699f8b368ea14e620eba2ce647951b.
- EVA Sentry remains in scope of TKT-216. TKT-215 separately records why the unused validation-service
  source was removed. No live resource was changed.

## Per-criterion evidence
Each row cites the authoritative source so acceptance is provable without re-deriving it. The
disposition rows live in the TKT-207 ledger `docs/governance/repository-reconciliation.json`
(`baselineEntries`, one `{path, disposition, reason, ticket, finalPath}` row per pre-change path);
its `summary.dispositions` is `{keep: 1107, move: 955, rewrite: 705, delete: 1277}` with
`summary.unexplained: 0` over 3,268 baseline files. `check:reconciliation` re-derives and passes.

- **A1** — Deterministic scan definition. `scripts/checks/forbidden-signatures.json` carries 35 hashed
  signatures (`S001`–`S035`, version 2, `fnv1a32` prefilter + `sha256` digest, `maxAdjacentTokens` 6)
  spanning names, identifiers, URLs, commands, paths, aliases and prefix-based logical names; the
  matcher is `scripts/checks/hashed-signature-matcher.mjs`. `hashed-signature-matcher.test.mjs`
  asserts the committed corpus has `>= 35` signatures and is valid.
- **A2** — Final scans report zero matches. `node scripts/checks/check-forbidden-references.mjs --json`
  → `scannedFiles: 2957, matchedFiles: 0, matchLocations: 0, errors: 0` (exit 0). `check:binary-content`
  and `check:image-review` (294 records) report zero.
- **A3** — Disallowed surfaces deleted, not stubbed. Ledger `disposition: delete` = 1,277 rows. The
  retired top-level folders are absent from `finalEntries` (verified: `api` 140, `orchestration` 93,
  `mockup-app` 74, `migration` 60, `deploy` 9, `connectors` 5, `ocr` 3, `design-system` 3 rows deleted
  and no such top-level path exists in the final tree; the final tree has **no** `archive/` top-level
  folder). Retired generated adapters are deleted (`.claude` 23, `.cursor` 3, `.github` 1 rows) and the
  live adapter set is regenerated fresh — `check:adapters` passes with parity for 15 roles and 10
  skills, so nothing survives as a pointer stub. Every delete reason ends
  "…no current authority or retained byte-equivalent remains and Git history is the recovery path",
  i.e. deletion rather than archive/stub retention.
- **A4** — Current requirements retained in current-stack form. Of 3,268 baseline files, 2,767 are
  carried forward (keep 1,107 + move 955 + rewrite 705) and only 1,277 deleted; `summary.unexplained`
  is 0, so every baseline requirement reached exactly one recorded disposition and every final row has an
  owner+origin (`check:reconciliation` proves this). Requirement preservation across a prohibited-source
  removal is itemised in `tests/fixtures/manifests/evidence-dispositions.json` group
  `requirements-transcribed-obsolete-prototype` (33 occurrences under `docs/reviews/190626/`, reason
  "The adjacent review text preserves the requirements; obsolete prototype images are removed"). Current
  domain rules survive intact: the code-table parity fingerprint above is unchanged
  (`check:database`), and `check:runtime-contract` shows no contract change attributable to cleanup.
- **A5** — Prefix-based aliases removed without changing canonical columns/DTOs/codes/resources. The
  22-table / 171-option parity fingerprint is byte-identical before and after (`check:database`), and
  `check:runtime-contract` confirms route/DTO/auth/resource/numeric-code baselines are unchanged.
- **A6** — Negative fixtures and cited exclusions. `scripts/checks/hashed-signature-matcher.test.mjs`
  passes 6/6 and proves the scan catches case (`ORANGE-signal`), punctuation/spacing
  (`The ORANGE-signal is present.`), embedded-token identifier/filename/command variants
  (`prefixvioletsuffix`), and URL-encoded + double-encoded variants (`ORANGE%2Dsignal`,
  `ORANGE%252Dsignal`), while not exposing or matching unrelated text and failing closed on an empty
  corpus. Rendered-document variants are covered by the same matcher fed from the Office ZIP text
  extractor in `check-forbidden-references.mjs` plus the `check:binary-content` (PDF/Office/email) and
  `check:image-review` (OCR) gates. There is **no** signature-level false-positive allowlist — the
  matcher is pure hash matching. The only exclusions are the four owner-scoped path prefixes cited in
  `scripts/checks/check-forbidden-references.mjs` lines 148–160
  (`tests/fixtures/evidence/sha256/`, `workingspace/`, `docs/governance/repository-inventory.json`,
  `docs/governance/repository-reconciliation.json`), each with its documented reason: `workingspace/`
  is operator-owned material (AGENTS.md), the evidence store is hash-addressed blobs covered by the
  binary-content and image-review gates, and the two generated indexes merely re-list tracked paths.
  None can hide a real remnant, because every non-exempt real file path is still scanned directly by
  the path scan (line 178) and any path listed inside an exempt index is itself an independently
  scanned tracked file.
- **A7** — Ticket links rewritten; non-retained evidence via Git history, not an in-tree archive.
  Ledger `disposition: rewrite` under `docs/tickets/` = 431 rows, all owned by TKT-213, reason
  "The retained authority was rewritten for the current repository" — active ticket acceptance and
  research links were rewritten in place. All 1,277 delete reasons cite "Git history is the recovery
  path"; the final tree contains no `archive/` top-level folder and no pointer stubs (verified against
  `finalEntries`). The 94 deliberately non-retained logical occurrences are itemised with per-group
  reasons in `tests/fixtures/manifests/evidence-dispositions.json` (obsolete assistant exports 57,
  reproducible generated output 4, obsolete prototype images 33) and none is kept in the evidence store.
- **A8** — EVA Sentry remains current; TKT-216 owns the route/body mismatch. The validation-service
  source was removed only per TKT-215's no-caller audit; its live resource is separate work.
- **A9** — Full check suite passes after removal: `check:forbidden`, `check:binary-content`,
  `check:image-review`, `check:docs`, `check:tickets`, `check:adapters`, `check:inventory`,
  `check:reconciliation`, `check:database` and `check:runtime-contract` all exit 0, with no runtime
  contract change attributable to cleanup.
- **A10** — Every gate reads tracked bytes and Git state only; no purge step deploys, changes cloud
  configuration or writes live data.

## Pending / gaps
- Remote CI status is read from the PR checks rather than frozen here; the physical-checkout audit is a
  CI/PR artifact by design. Per-criterion authority is now recorded above and independently
  re-derivable offline from the cited config, ledger and gate output.

## How to re-verify
Run npm run check:forbidden, npm run check:binary-content and npm run check:image-review from the final
checkout. Reconcile every reported path to TKT-207 and independently inspect representative text, email,
message, PDF, Office and image content. The per-criterion disposition claims are re-derivable from
`docs/governance/repository-reconciliation.json` (`summary.dispositions`, `baselineEntries`,
`finalEntries`) via npm run check:reconciliation, the exclusion list from
`scripts/checks/check-forbidden-references.mjs` lines 148–160, the signature corpus from
`scripts/checks/forbidden-signatures.json` (35 signatures) with `node --test
scripts/checks/hashed-signature-matcher.test.mjs`, and the non-retained-evidence inventory from
`tests/fixtures/manifests/evidence-dispositions.json`.

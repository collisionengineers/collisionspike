# Lane A — Reconciliation & "nothing-lost" proof

**Scope:** the load-bearing claim of the reset — locked decision #4 ("Git history is the recovery path; the
tree contains no archive stubs") and the `check:reconciliation` gate that is meant to prove nothing was lost.
**Verdict:** the gate is **bookkeeping, not preservation** — it provides false assurance. The evidence catalog
(#5) is genuinely sound. 4 issues (1 major-verified, 2 major, 1 minor); plus what is sound.

---

### A1 — [MAJOR · CONFIRMED] `check:reconciliation` "0 unexplained" cannot detect content loss or file drops
`scripts/maintenance/reconcile-repository-reset.mjs:345-355` (`validateReconciliation`). Every baseline path is
unconditionally assigned a disposition in `{keep, move, rewrite, delete}` (`baselineDisposition`, 219-257) and
every final path a state in `{retained, moved, rewritten, regenerated, created}` (`finalOrigin`, 259-287). The
validator only flags an entry whose label/reason/ticket is **empty**, and line 349 **exempts `delete` from
needing a `finalPath`**. `summary.unexplained` is even hard-set to `0` (line 336) then recomputed from that
same check. **Confirmed by direct read + by running it:** delete 1046 files, rewrite 693, and all count as
"explained." A move that silently corrupts/truncates a file is labelled `"rewrite"` ("moved and rewritten into
the current authority", 240) and passes; a file dropped entirely is labelled `"delete"` ("Git history is the
recovery path", 255) and passes. **"0 unexplained" ≠ "0 lost."**
*Failure scenario:* any Codex error that mangles a moved doc/source file, or drops owned application source
(e.g. `api/src/functions/assistant.ts`, `ai-suggestions.ts`, `archive-mirror-outbox.ts` are among the deletes),
merges green with no gate objecting.

### A2 — [MAJOR · CONFIRMED] The genuine semantic-invariant proof (`.plan-006-baseline/compare.mjs`) is removed from HEAD and not gated
The baseline snapshot in commit `70a3bb57` shipped a real comparator — `capture.mjs`/`compare.mjs` diffing
`http-routes.json`, `rest-contracts.json`, `numeric-code-mappings.json`, `package-workspaces.json` — the only
tooling that actually proves "no behaviour lost." But `reconcile-repository-reset.mjs` recomputes independently
from git tree `81ae8fdf` (`collectPreResetInventory`) and **never reads `.plan-006-baseline/`**, which is
absent from HEAD (0 files). So the semantic-contract proof is **non-reproducible from the merged tree** and is
not in the objective gate battery. (Lane D determines whether `check-runtime-contract` recovers this.)

### A3 — [MAJOR · CONFIRMED] No committed, repository-wide disposition ledger of removals
`docs/governance/repository-inventory.json` records only **survivors** (`generate-repository-inventory.mjs`
emits stage-0 index files + dirs; zero removed paths, zero dispositions). The only enumeration of the 1046
deletes is the reconciliation JSON, which `main()` **unlinks unless `CI` is set** and, in CI, writes to
gitignored `.artifacts/` (lines 358, 372-379; confirmed no `repository-reconciliation.json` in the tree).
Post-merge there is no committed artifact telling an auditor what was removed or where it went, beyond one
templated reason string. *Concrete lineage loss:* `docs/azure/deploy.md` (blob `f38662b8`) was consolidated
into `docs/operations/deployment.md` but is classified `delete` with no link to its successor.

### A4 — [MINOR · CONFIRMED] The tests codify the bookkeeping, not losslessness
`reconcile-repository-reset.test.mjs:38-45` asserts a deleted file yields `unexplained===0` — it *encodes* that
deletion is "explained." No test forces a byte-changed move to fail. Real content locks exist but are narrow:
the 4 immutable `workingspace` files throw on change (`generate-repository-inventory.test.mjs:99-111`).

---

### Genuinely sound (do not "fix")
- **Evidence catalog is lossless and fully back-mapped (#5).** `evidence-catalog.mjs` `buildManifest` keeps
  `originalPath` + `originalFilename` per logical use; **0/550 usages missing** either. `copyAndVerify`
  byte-verifies each blob and refuses to delete a source until its stored SHA-256 matches. Spot-checked blobs
  trace correctly to their original ticket/demo paths.
- **Sampled moves are byte-clean:** `api/host.json`, `orchestration/host.json`, and the workingspace
  `aifirstplan.txt` share identical blob OIDs across the move.
- Preservation is *proven* for the hash-matched keep/move subset, the evidence store, and the 4 locked
  workingspace files — **but not for the 1046 deletes + 693 rewrites**, which are asserted safe by
  construction, not evidence.

**Recommendation:** before merge, either (a) strengthen `validateReconciliation` to assert byte-preservation on
`keep`/`move` and require a real per-file rationale (not a template) for each `delete`, **or** (b) run
`.plan-006-baseline/compare.mjs` and commit its route/DTO/numeric-code diff as the preservation proof, and wire
it into CI. The reset may well be lossless — the point is the shipped gate does not prove it.

# Lane H — Retired-platform purge & generated-output removal

**Scope:** the forbidden-reference zero-state (TKT-211) + removal of tracked generated output. **Verdict:** the
suspected red flag is **DISPROVEN** — the purge gate is real and the tree is genuinely clean. Only minor
gate-ergonomics issues. 3 issues (all Minor).

### The crux (RED FLAG) — DISPROVEN: `check:forbidden` is NOT vacuous
`forbidden-signatures.json` holds **35 populated signatures**, stored as one-way hashes (fnv1a32 prefilter +
sha256 + normalizedLength) so the checker file doesn't contain the banned words. Forward-hashing candidate
plaintext **reproduced 17/35 exactly** — signatures **S001–S007, S011–S019, S024**: the retired low-code
platform and its workflow engine, the two app-designer shells, the desktop CLI verbs (code/solution/admin/auth),
the connector-authoring feature, and the old table-name prefix (remaining 18 are distinct valid signatures incl.
two len-32 de-dashed GUIDs). The gate is schema-validated + loaded at module init and CI runs
it. The `"No configured signatures found."` line is a **mislabeled clean-tree message** (`matches.length===0`),
not an empty-config signal.

### H1 — [MINOR · CONFIRMED] Mislabeled success message invites misreading
`scripts/checks/check-forbidden-references.mjs:193` prints "No configured signatures found." on zero-*matches*,
not zero-*config*. *Consequence:* an auditor reads a passing clean-tree run as proof the config is empty (this
exact wording triggered this audit); an emptied corpus would print an identical success line.

### H2 — [MINOR · CONFIRMED-latent] No guard that the corpus is non-empty / a known term is caught
`document.signatures ?? []` tolerates `[]`, and `hashed-signature-matcher.test.mjs` uses only synthetic
signatures — no assertion that e.g. signature S005 is actually flagged. *Consequence:* future accidental truncation
of `forbidden-signatures.json` to `[]` silently makes the gate vacuous with zero test/CI failure. Not triggered
in this PR (corpus currently has 35 signatures).

### H3 — [MINOR/INFO · CONFIRMED] `uploadFileToRecord` not individually hashed
Hashes to `f304b1cb…`, matching none of the 35 — caught only if it co-occurs on a line with another banned term.
Low real-world risk; tree has 0 occurrences today.

### Verified clean (non-findings)
- **Purge (item 2):** case-insensitive grep for the retired-platform term set (the S001–S024 corpus — low-code
  platform, workflow engine, CLI verbs, app-designer shells, connector-authoring, table prefix) across the whole
  branch = **0 matches**. `docs/HISTORICAL/` entirely removed; only 3
  done-ticket prose mentions of "ROADMAP" remain (not links). Genuine forbidden-reference zero-state.
- **Generated output (item 3):** `deploy/*.cjs`, `api-deploy.zip`, `orch-deploy.zip`, root
  `build-api.cjs`/`build-orch.cjs` gone; replaced by `scripts/build/build-api.cjs` + `build-orchestration.cjs`,
  wired via package.json `bundle:*`. CI (`npm run bundle`) regenerates to untracked `.artifacts/deploy/**` +
  smoke-loads; `check:outputs` keeps them untracked. Nothing depends on the removed bundles (grep = 0).
- **Removed root docs (item 4):** `ROADMAP.md` + `CURRENT_STATUS.md` git-recoverable; live-state migrated to
  `docs/operations/live-environment.md` + `docs/product/`; branch `CLAUDE.md` rewritten to a thin adapter with
  **no dangling link** to either (`check:docs` correctly passes).

**Bottom line:** the reset genuinely achieves the forbidden-reference zero-state and clean output removal; the
only action is cosmetic hardening of the gate's message + a non-empty-corpus assertion.

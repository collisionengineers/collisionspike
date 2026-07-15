# PLAN-006 pre-mutation baseline

This temporary folder captures the repository state before PLAN-006 source and documentation moves. It is
not a permanent archive and must be removed before the final retired-platform zero-reference gate.

The capture is read-only with respect to repository source. It records:

- Git HEAD/tree, local and remote-tracking refs, worktrees, stash entries, and pre-existing status;
- npm workspace manifests and root lockfile hash;
- normalized TypeScript and Python HTTP registrations;
- canonical JSON schemas and exported domain DTO declarations;
- choice-set, SQL choice-table, and runtime numeric mappings; and
- byte size and SHA-256 for every file in `docs/workingspace` (or `/workingspace` after its move).

## Regenerate and compare

From the repository root, capture a candidate after restructuring:

```powershell
node .plan-006-baseline/capture.mjs --source worktree --out .plan-006-after
node .plan-006-baseline/compare.mjs .plan-006-baseline .plan-006-after --allow-package-workspace-change
```

The committed pre-mutation tree can be regenerated independently of the current checkout with:

```powershell
node .plan-006-baseline/capture.mjs --source 81ae8fdf68b4fd29648d76dc77c379cd98764dbe --assert-pre-mutation-clean --out .plan-006-repeat
```

`--assert-pre-mutation-clean` records the clean status observed before parallel PLAN-006 changes began. It
must only be used with the pinned pre-mutation commit above, not for candidate captures.

`git-state.json` distinguishes that pre-mutation checkout (`main`, clean, and equal to `origin/main`) from
the PLAN-006 branch and ref/worktree inventory visible when the deterministic artifacts were generated.

The comparison intentionally ignores source paths for routes, DTOs, schemas, and numeric mappings. It does
not ignore actual methods, route templates, authorization levels, schema content, exported DTO declarations,
numeric names/codes, workspace package data, or working-folder bytes. The planned web package rename and
workspace path changes will therefore make `package-workspaces.json` differ; review that expected delta
separately. All other semantic snapshots should match unless PLAN-006 explicitly records an approved contract
change.

To verify the snapshot files themselves, recompute the SHA-256 values listed in `manifest.json`. The manifest
uses a documented `null` self-hash.

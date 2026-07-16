# Lane G — Agent generation & CI subsumption

**Scope:** `.agents` canonical → generated `.claude`/`.cursor`/`.codex` (#9) + the CI rewrite (main
`docs.yml`+`capture-contract.yml` → branch single `ci.yml`) + hooks. **Verdict:** CI is largely sound and
actually **broadens** coverage, but **two required main gates are absent** and one new lock file is inert.
Adapter generation is a proper canonical-source model. 5 issues.

### CI subsumption table (main-required gate → branch `ci.yml`)
| Main-required gate | In `ci.yml`? |
|---|---|
| verify:offline TS build+test ×4 workspaces | ✅ `typescript` job |
| verify:offline Python pytest | ✅ broader — 6-svc matrix + parser email eval |
| doc-links / tickets / data-authority | ✅ `check:docs`/`check:tickets`/`check:data-authority`+`test:checks` |
| layout / runtime-contract / forbidden / prod-deps / tracked-outputs / source-size / evidence / inventory / reconciliation / adapters / database | ✅ all `check:*` (additive) |
| capture CONTRACT (`contract:capture:check`, OpenAPI↔codegen) | ⚠️ replaced by `check:runtime-contract` snapshot; the OpenAPI-vs-generated-types check itself is **gone** |
| parser vendor pin — offline lock | ✅ `verify_vendor_pin.py` |
| **parser vendor pin — cross-repo immutable-tag (`parser-vendor-source` + deploy key)** | ❌ **ABSENT** |
| **verify-live (gated, self-skips)** | ❌ **ABSENT** (`verify-all.mjs` never invoked by CI) |

### G1 — [MAJOR · CONFIRMED] Parser cross-repo vendor-source verification dropped
`.github/workflows/ci.yml:86-87` runs `verify_vendor_pin.py` with no sibling checkout / no
`CEDOCUMENTMAPPER_REPO`; grep across `.github` finds zero `CEDOCUMENTMAPPER_DEPLOY_KEY`/`parser-vendor-source`/
`cedocumentmapper_v2.0`. Main's dedicated job (deploy-key checkout of the private authoring repo → immutable-tag
proof) is gone. The remaining offline layer is self-referential (`_verify_worktree` computes `contentSha256`
from the same tree), so a vendored-engine tamper that **also** rewrites `VENDOR_LOCK.json` passes CI. Supply-chain
guarantee weakened. (Compounds Lane E2, which shows the vendored files were in fact edited in-repo.)

### G2 — [MAJOR · CONFIRMED] `pre-push` hook removed
Main ships `scripts/hooks/pre-push` blocking pushes to `refs/heads/main`; the branch has only `pre-commit`.
Merging deletes the local push guard. *Mitigant:* server-side branch protection unaffected; the hook is opt-in
+ `--no-verify`-bypassable. Note the **pre-commit hook is otherwise strengthened** (adds adapter-drift,
tracked-outputs, forbidden-references over main's doc-links/tickets/skills-sync).

### G3 — [MINOR · CONFIRMED] `skills-lock.json` is inert
Only referenced in `check-repository-layout.mjs:17` (root allowlist) + inventory; nothing reads its
`computedHash`. It does **not** replace `check-skills-sync.mjs`'s enforcement — internal skill sync is enforced
by `check:adapters` (byte-for-byte), but the external upstream provenance of the 2 vendored skills is unverified.
False assurance.

### G4 — [MINOR · CONFIRMED] No verify-live equivalent in CI
No live-drift job; `verify-all.mjs` never called. On main it self-skipped without `AZURE_CREDENTIALS` (no
behavior change today), but the capability is now unreachable even if the secret is added.

### G5 — [INFO · CONFIRMED] Capture-contract mechanism swapped
OpenAPI `capture.v1.yaml` validation replaced by the broader `check-runtime-contract.mjs` snapshot. Arguably
broader, but the specific OpenAPI↔generated-types guarantee is dropped.

### Verified sound
- **Adapter generation (#9):** `generate-agent-adapters.mjs` deterministically renders `.claude`/`.cursor`/`.codex`
  agents (from `.agents/agents/roles.json`) + skills (from `.agents/skills/*/SKILL.md`); `--check` does true
  byte-for-byte comparison + flags orphans. `.claude/**` is generated, not hand-edited. Proper canonical model.
- **The 3 `fix(ci)` commits are targeted and sound:** b9803c4 makes inventory hashing use committed Git blob
  bytes (CRLF-deterministic); 9610de6 adds `fetch-depth: 0` + resolves the baseline from immutable `81ae8fdf`
  with a fail-closed guard (**couples reconciliation to full history** — only holds while that commit stays in
  main's ancestry); ba67533 pins Linux-native optional deps for deterministic `npm ci`. No residual defect found,
  **but three CI-fix rounds confirm the new structural gates were initially non-deterministic/platform-fragile** —
  a novel, lightly-proven gate surface.

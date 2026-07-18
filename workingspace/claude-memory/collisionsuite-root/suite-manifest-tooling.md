---
name: suite-manifest-tooling
description: suite.manifest.json + tools/suite.mjs (status/restore/links/audit/fetch) — the machine-readable suite map and drift detector; whitelist .gitignore
metadata: 
  node_type: memory
  type: project
  originSessionId: 8a0f65e5-c065-4360-bad0-28ecb6418116
---

The collisionsuite wrapper repo (2026-07-16) has: **`suite.manifest.json`** (machine-readable twin of INDEX.md — every repo's path/remote/lifecycle/protection/policy) and **`tools/suite.mjs`** (zero-dependency Node, Windows+Linux): `status` | `restore` (replaces SETUP.md's manual clone recipe) | `links` (symlink repair) | `audit` (drift detector, exits non-zero) | `fetch`.

**Why:** 20 nested repos had no aggregate visibility; SETUP.md/INDEX.md had drifted; the wrapper .gitignore was a hand-maintained blacklist that nearly swallowed collision-audaconnect.
**How to apply:** run `node tools/suite.mjs audit` before any suite-root commit and at cross-repo session start (codified in suite AGENTS.md). The wrapper `.gitignore` is now a **whitelist** (`/*` + explicit `!` re-includes) — new projects are invisible-by-default; add manifest entry + INDEX row + (if tracked) whitelist entry per the New Project Checklist. Live-site guard: machine-local `pre-push` hook in the base44 repo requires `CE_ALLOW_LIVE_PUSH=1` (hooks are NOT cloned — recreate on new machines).

Protection levels: live-site (base44 site), never-push (document-work, spreadsheet-work, ai-agents), read-only (archive/on-hold). Manifest entries may also carry `"guidance": "generated-adapters"` (currently collisionspike only) — audit validates that variant differently and `links` skips it. See [[suite-agents-policy]] for the guidance-policy checks audit enforces and [[base44-website-push-guard]].

collisionspike mains converged 2026-07-16 (PR #101: PLAN-006 merge + emailevals allow-listed + stub). Gotchas learned there: spike blocks direct main pushes via committed pre-push hook (`scripts/hooks/`, core.hooksPath) — always branch+PR; its governance ledgers (inventory/reconciliation) hash DISK bytes, so regenerate them only from an LF tree (repo-local `core.autocrlf=false` now set; the reconciliation writer emits platform EOLs — a Windows-generated inventory records a CRLF hash CI can't reproduce); fresh Windows clones of spike need `git config core.longpaths true` (long `.eml` filenames in emailevals/ exceed MAX_PATH at deep paths — a too-long clone fails checkout SILENTLY, leaving mass staged-deletions).

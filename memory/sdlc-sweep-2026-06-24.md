---
name: sdlc-sweep-2026-06-24
description: In-progress ultracode SDLC sweep across all docs/plans + phases (post PR #23 merge)
metadata:
  type: project
---

After merging PR #23 (Phase 4a, squash `84037e7`) into `main` on 2026-06-24, the user
asked to **ultrathink + ultracode through ALL `docs/plans` and phases**: find missed
implementation / outstanding items, then orchestrate a full SDLC workflow implementation
for outstanding items from phases that have been **ADDRESSED** — explicitly **out of
scope: phases with 0 work done / future phases**.

**Standing guardrails for the build phase** (from the user, binding):
- Build offline, **gated-OFF**; the operator activates. Never bind live connections,
  inject real secrets, or flip a gate ON.
- ADR-0013 binding: no runtime inspection-address matcher; suggestions are
  offline-derived + human-confirmed only.
- Do NOT modify the sibling `../cedocumentmapper_v2.0` from collisionspike work
  (tension with ADR-0018 / the Phase-8 classifier plan — must be checkpointed, not
  assumed).
- No mock/seed case data in the Code App.
- Local-only CI; PowerShell tool was returning exit 1 in this bg job — use the **Bash**
  tool for verification (pytest / vitest / tsc).

**Approach:** sequential workflows, staying in the loop between them — (1) discovery
fan-out (one reader per phase, cross-checking docs vs actual code) → classified
build-now worklist; (2) review + scope checkpoint; (3) implementation workflows for the
build-now set; (4) verify. See [[harness-code-review-is-user-triggered]] if present.

**STATUS — COMPLETE 2026-06-24.** Delivered as **PR #24** (`feat/sdlc-sweep` → `main`, 16 commits,
123 files, CLEAN/MERGEABLE) — awaiting the user's review/merge nod (do NOT auto-merge a sweep this
size). Built every buildable-offline item across phases 0–9 + cross-cutting, all gated-OFF: parser
re-vendor (drift guard was RED→GREEN), Phase-3 parity tests + status-evaluate→evavalidation repoint +
finalize photo streaming, Phase-8 classifier+schema+triage flow (net-new), Phase-9 retention schema +
case-disposition flow + 3-role model + bicep hardening + governance docs (net-new), Phase-5 OCR
fallback, Code-App primitives cleanup, InspectionAddress save-path, verify-all widened + boundary gate,
full doc-drift reconciliation + a key-literal scrub. `verify-all` GREEN (10/0/3-skip). Sibling got 1
commit (`aecbc4b`, the classifier). Two items **deliberately deferred** w/ rationale (Phase-2
images-backend = speculative; corpus Pester = low-value + no runner). Live worklist + completion banner
in `OPEN_ITEMS.md`. Remaining = `[OPERATOR]` activations (docs/gated.md §8) + M2/M3 `[DEFERRED]` items.

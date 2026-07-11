---
id: TKT-090
title: Evidence filenames carry a wrong "RJS" provider token and "UnknownVRM"
status: done
priority: P2
area: evidence
tickets-it-relates-to: [TKT-002, TKT-089]
research-link: docs/tickets/done/TKT-090-evidence-filename-provider-vrm/evidence/operator-note.md
---

# Evidence filenames carry a wrong "RJS" provider token and "UnknownVRM"

## Problem

Extracted-image evidence filenames are showing up oddly, e.g.:

```
Letter - instructing Collision engineers__RJS_UnknownVRM_img_1_1.png
LtrtoEngineerIn__RJS_UnknownVRM_img_1_1.png
```

The pattern is `<source-doc-name>__<provider>_<VRM>_img_<page>_<n>.png` — but the case **is not
an RJS case**, so `RJS` is wrong (a hardcoded default, a stale template value, or a provider
mis-resolution leaking into the naming), and `UnknownVRM` is the unresolved-VRM placeholder
surfacing verbatim in handler-facing names. Wrong provider tokens in filenames are actively
misleading (staff read them as case identity), and the names flow into the Box archive.

## Evidence

- `evidence/operator-note.md` — verbatim drop-note ("Not an RJS case").
- `evidence/evidence-filenames-screenshot.png` — the evidence cards showing the two filenames.
- Same case as [TKT-089](../../verify/TKT-089-non-vehicle-images-box/TKT-089-non-vehicle-images-box.md)'s
  logo-image screenshot (shared source document) — coordinate the two fixes.
- The naming likely originates in the PDF image-extraction path (TKT-002 lane: the vendored
  `cedocumentmapper_v2.0` engine or the parser Function's wrapper — locate exactly; ADR-0018
  edit-in-sibling-first applies if it is engine-side).

## Proposed change

PROPOSED (not built):

- **Locate the template**: grep the parser Function + sibling engine for the
  `_img_` / `UnknownVRM` / `RJS` naming construction; establish where `RJS` comes from (grep for
  it as a literal — if it is a hardcoded sample/provider default, that is the bug).
- **Fix the naming**: use the case's actual resolved provider code (or omit the token when
  unresolved) and omit/blank the VRM segment rather than emitting `UnknownVRM`; keep names
  filesystem- and Box-safe.
- **Fixtures**: naming unit tests covering resolved and unresolved provider/VRM combinations.
- Decide (and record) whether existing badly-named evidence/Box files get renamed or left —
  renames in Box must respect the archive's one-way-mirror rules.

## Acceptance

- [ ] No filename ever contains a provider token that differs from the case's resolved provider;
      unresolved provider/VRM produce clean names (no `RJS` default, no literal `UnknownVRM`).
- [ ] The literal `RJS` fallback (if that is the cause) is removed from the code path, with a
      regression test.
- [ ] Re-parsing the sample document yields correctly-named images in evidence and Box.
- [ ] The rename-or-leave decision for existing files is recorded (+ executed if rename).

## Verification requirements (proof standard — all classes required before `done`)

1. **Offline tests** — naming unit tests green (both homes if the template is engine-side,
   ADR-0018); recorded in [verification.md](./verification.md).
2. **Gate + deploy** — `node verify-all.mjs` green; deploys + any re-vendor recorded in
   [changes.md](./changes.md).
3. **Live probe** — a live re-parse/intake of the sample class shows correct names in the
   evidence rows and the Box case folder.
4. **Sweep** — a query over live evidence filenames shows zero remaining `RJS`-mislabelled /
   `UnknownVRM` names created post-deploy.

## Research

Distilled 2026-07-06 from the operator drop-note folder `to-distill/odd-filename-bug/`; raw
material in [evidence/](./evidence).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

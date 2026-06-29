---
name: fidelity-source-of-truth
description: "The renderer's house-style fidelity is benchmarked against the proven stylexamples PDFs, not the letterhead spec doc."
metadata: 
  node_type: memory
  type: project
  originSessionId: 3687442b-87e0-4185-b13a-55edaf16adbc
---

The `collisionrenderer` PDF output is benchmarked for fidelity against the
**stylexamples** PDFs (the output of the prior Python/WeasyPrint `report-renderer`,
which the client said they prefer) — NOT against the prose in
`collision-engineers-design/references/document-letterhead.md`.

Where the two disagree, the **stylexamples win**. These are deliberate and must not be
"corrected" toward the spec doc:
- **12mm** left/right page margins (the spec says ~20mm).
- **Black** titles on market-valuation-evidence and advert-evidence-pack (the spec mentions
  newer outputs in red; only the fee note is red).
- **No continuation running head** — page 1 carries the full logo letterhead in the body;
  pages 2+ have only the running footer (Chromium can't cleanly show a header on pages 2+
  only, and the proven output had none). The footer's "— n of N —" marker covers continuity.

**Why:** the client explicitly preferred the stylexamples look, and the design system is
CSS-native, so the renderer reuses that CSS via headless Chromium.

**How to apply:** before changing `Assets/templates/report.css` or the page furniture in
`HtmlComposer`, compare against `stylexamples/` and re-render the samples (Read the PDFs to
eyeball them). See [[winappsdk-version-pin]] for the GUI build gotcha.

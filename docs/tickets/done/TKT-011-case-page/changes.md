# Changes — TKT-011: Case page de-jargon + layout fixes

## Status
done

## Commits
- `94902ce` — work-todo-spike mega-commit (TKT-001..014,019,020) → swept the case page for engineering / file-format jargon and tightened the layout to match the app charter (plain-language only, no provenance/format labels).

## Files touched
- `apps/web/` case-page React components/strings (user-facing copy + labels)

## Summary
The deployed case page was audited and de-jargoned: user-facing engineering and file-format language banned by the app charter (e.g. `Download JSON`, provenance labels like `Document AI`) was replaced with plain-language equivalents, and the sparse/repeated-badge layout was tidied. Verified by a source string sweep showing no residual jargon strings remain. This was a UI copy/layout change with no backend impact.

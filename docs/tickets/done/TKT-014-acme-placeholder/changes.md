# Changes — TKT-014: Remove the acme.co.uk placeholder from provider fields

## Status
done

## Commits
- `94902ce` — work-todo-spike mega-commit → removed the `acme.co.uk` placeholder string from the provider field component and replaced it with an appropriate empty/neutral state and a neutral aria-label.

## Files touched
- `mockup-app/` provider field component

## Summary
Every provider was rendering a fake `acme.co.uk` grey placeholder. The placeholder string was removed so the field shows the real value or an appropriate empty state, and the accessibility label was made neutral. Confirmed by a source sweep finding zero `acme` occurrences.

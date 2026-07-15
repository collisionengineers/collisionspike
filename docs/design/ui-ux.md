# Interaction and content rules

## Audience

The app is used by non-technical case handlers. Each screen should foreground the case, the evidence,
what needs attention, and the next safe action.

## Language

- Use sentence case, active voice, and the business terms in [CONTEXT.md](../../CONTEXT.md).
- Say what the handler can see or do, not how the system implements it.
- Never render cloud products, service layers, routes, schemas, payloads, feature flags, deployment state,
  planning labels, ticket IDs, or internal identifiers.
- Describe an unavailable capability plainly and give the next useful action.
- Use “Archive” in handler-facing copy for the Box surface.

## Interaction

- Preserve the handler's place and unsaved edits when opening supporting detail.
- Make every destructive or high-impact action explicit, previewable, and confirmable.
- Show source and confidence for suggestions; never present model output as an established fact.
- Keep ambiguous matching decisions human-controlled and explain the competing signals.
- Use progressive disclosure: summary first, evidence and audit detail on demand.
- Empty, loading, error, unavailable, and permission-denied states are first-class designs.

## Accessibility and responsive behaviour

- Meet WCAG 2.2 AA for contrast, keyboard access, focus visibility, names, roles, status announcements,
  zoom, reflow, and reduced motion.
- Do not encode status by colour alone.
- Tables must retain useful reading and action order on narrow screens; use a designed card/list
  alternative when horizontal compression would hide meaning.
- Keep touch targets at least 44 by 44 CSS pixels where practical.
- Respect user font size and do not lock body copy below a readable size.

## Verification

Review changed flows at common desktop and mobile widths, keyboard-only, 200% zoom, high contrast, and
reduced motion. Run automated accessibility checks, then manually verify focus order, labels, errors, and
announcements. Attach evidence to the owning ticket and applicable manual-review checklist.

# Theme mapping

The production app uses Fluent UI v9 components with Collision Engineers brand tokens. Components consume
semantic tokens; screens do not introduce ad-hoc hex values, fonts, shadows, or spacing scales.

## Semantic groups

| Group | Purpose |
| --- | --- |
| Brand | Primary actions, selected navigation, and approved brand accents |
| Neutral | Page, card, border, text, and disabled surfaces |
| Success | Completed or positively verified business state |
| Warning | Needs attention but work can continue |
| Danger | Blocking failure, destructive action, or invalid state |
| Information | Neutral guidance or newly available context |

Status components must pair colour with text and, where useful, an icon. Focus rings use a dedicated
high-contrast token and remain visible on every surface.

Typography uses the checked-in brand fonts with system fallbacks. The token source and font loading live
under `apps/web/src/theme`; this page records intent, not duplicated numeric values.

Any token change requires light/dark or supported-mode contrast checks, component snapshots, keyboard
focus review, and the relevant manual-review evidence.

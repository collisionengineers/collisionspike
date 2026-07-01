import { makeStyles, tokens } from '@fluentui/react-components';

/* ============================================================
   severityStyles — the ONE set of severity chip colour recipes
   (reforge 2026-07-01).

   Each recipe sets fill + line + ink + semibold ONLY — no padding, radius or
   display — so it layers onto whatever geometry the host owns: a Fluent
   <Badge> (StatusBadge, Inbox TriageBadge), a hand-rolled facet chip or an
   age pill (Dashboard, CaseList). Consumers merge it AFTER their shape class.

     critical → --ce-critical-ink fill + white text. TRUE blockers only —
                the red budget is brand chrome + critical.
     warning  → amber accent fill, amber ink text, amber line. Never
                white-on-amber.
     info     → QUIET neutral charcoal outline. Fork #1 ("quiet grids"):
                slate (--ce-info-*) is reserved for callouts — guidance
                banner, avatar circle, info messages — never grid chips.
     success  → success tint fill, success ink text, success line (the
                terminal/windowed-state idiom).
     muted    → low-contrast grey outline — out-of-workflow, never a work
                item.

   Plus one non-severity recipe:
     infoTint → the slate CALLOUT tag (metadata/decision/preview tags in
                panel bodies). Not in the severity vocabulary and not
                reachable via severityClassName().

   TWO AMBER WEIGHTS, deliberately distinct (pigment ruling — don't collapse):
     - ACCENT fill #f5c244 (--ce-warning-accent) = aggregate facet/count
       chips — chipWarning below.
     - TINT fill #f7e2a6 (--ce-warning-tint) = per-row inline pills, hand-
       rolled at the call site (e.g. Dashboard ageAttention) — the accent
       fill is too loud repeated per row.
   ============================================================ */

export type ChipSeverity = 'critical' | 'warning' | 'info' | 'success' | 'muted';

export const useSeverityChipStyles = makeStyles({
  chipCritical: {
    backgroundColor: 'var(--ce-critical-ink)',
    color: '#ffffff',
    border: '1px solid var(--ce-critical-ink)',
    fontWeight: tokens.fontWeightSemibold,
  },
  chipWarning: {
    backgroundColor: 'var(--ce-warning-accent)',
    color: 'var(--ce-warning-ink)',
    border: '1px solid var(--ce-warning-line)',
    fontWeight: tokens.fontWeightSemibold,
  },
  chipInfo: {
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground2,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    fontWeight: tokens.fontWeightSemibold,
  },
  chipSuccess: {
    backgroundColor: 'var(--ce-success-tint)',
    color: 'var(--ce-success-ink)',
    border: '1px solid var(--ce-success-line)',
    fontWeight: tokens.fontWeightSemibold,
  },
  chipMuted: {
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    fontWeight: tokens.fontWeightSemibold,
  },
  /* Info-TINT callout tag (slate) — metadata/decision/preview tags inside
     panel bodies (CaseDetail "Decision", AiAssistPanel suggestion type,
     ImageOrderList "Preview"). NOT a grid severity chip — grids use
     chipInfo's quiet outline (fork #1) — so it is deliberately excluded
     from the severityClassName() vocabulary. */
  chipInfoTint: {
    backgroundColor: 'var(--ce-info-tint)',
    color: 'var(--ce-info-ink)',
    border: '1px solid var(--ce-info-line)',
    fontWeight: tokens.fontWeightSemibold,
  },
});

const CHIP_CLASS = {
  critical: 'chipCritical',
  warning: 'chipWarning',
  info: 'chipInfo',
  success: 'chipSuccess',
  muted: 'chipMuted',
} as const;

/**
 * Pure severity → class-slot mapping for the hook above:
 * `const chips = useSeverityChipStyles(); chips[severityClassName(sev)]`.
 */
export function severityClassName(severity: ChipSeverity): (typeof CHIP_CLASS)[ChipSeverity] {
  return CHIP_CLASS[severity];
}

import type { ReactNode } from 'react';
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';

/* ============================================================
   Panel — the one bordered surface primitive.

   A single hairline-bordered card (1px neutral stroke, medium radius,
   Background1, comfortable padding) that the screens reuse for their content
   panels, read-only summaries and skeletons — previously each screen hand-rolled
   the same border/radius/background block in its own makeStyles.

   `accent` adds a 3px left rail, split by meaning (reforge 2026-07-01):
     - 'critical' → CE-red rail, ERRORS ONLY (red budget = brand chrome + critical)
     - 'neutral'  → charcoal rail, quiet emphasis (empty/summary surfaces are
       never red)

   Layout (flex direction, gap) and any background/padding override stay with the
   caller via `className`, which is merged AFTER the base so it always wins. The
   rendered output is byte-identical to the inline blocks it replaces.
   ============================================================ */

const useStyles = makeStyles({
  base: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    padding: tokens.spacingVerticalL,
  },
  /* 3px critical-red left rail — error surfaces ONLY. */
  accentCritical: {
    borderLeft: '3px solid var(--ce-critical-accent)',
  },
  /* 3px charcoal left rail — quiet, non-severity emphasis. */
  accentNeutral: {
    borderLeft: '3px solid var(--ce-charcoal)',
  },
});

export interface PanelProps {
  children: ReactNode;
  /** 3px left rail: 'critical' (errors only) or 'neutral' (quiet emphasis). */
  accent?: 'critical' | 'neutral';
  /** Extra class — merged after the base so caller layout/overrides win. */
  className?: string;
  /** Optional inline style passthrough. */
  style?: React.CSSProperties;
  /** ARIA role passthrough (e.g. 'alert' on error surfaces). */
  role?: string;
}

/** The shared bordered-surface card. `accent` adds a 3px left rail by meaning. */
export function Panel({ children, accent, className, style, role }: PanelProps) {
  const styles = useStyles();
  return (
    <div
      className={mergeClasses(
        styles.base,
        accent === 'critical' && styles.accentCritical,
        accent === 'neutral' && styles.accentNeutral,
        className,
      )}
      style={style}
      role={role}
    >
      {children}
    </div>
  );
}

export default Panel;

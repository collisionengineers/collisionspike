import type { ReactNode } from 'react';
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';

/* ============================================================
   Panel — the one bordered surface primitive.

   A single hairline-bordered card (1px neutral stroke, medium radius,
   Background1, comfortable padding) that the screens reuse for their content
   panels, read-only summaries and skeletons — previously each screen hand-rolled
   the same border/radius/background block in its own makeStyles.

   `accent` adds the 3px CE-red left rail used by the error/empty surfaces.

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
  /* 3px CE-red left rail — the error / empty / attention accent. */
  accent: {
    borderLeft: '3px solid var(--ce-red)',
  },
});

export interface PanelProps {
  children: ReactNode;
  /** Add the 3px CE-red left rail (error / empty / attention surfaces). */
  accent?: boolean;
  /** Extra class — merged after the base so caller layout/overrides win. */
  className?: string;
  /** Optional inline style passthrough. */
  style?: React.CSSProperties;
  /** ARIA role passthrough (e.g. 'alert' on error surfaces). */
  role?: string;
}

/** The shared bordered-surface card. `accent` adds the CE-red left rail. */
export function Panel({ children, accent, className, style, role }: PanelProps) {
  const styles = useStyles();
  return (
    <div
      className={mergeClasses(styles.base, accent && styles.accent, className)}
      style={style}
      role={role}
    >
      {children}
    </div>
  );
}

export default Panel;

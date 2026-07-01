import { makeStyles, tokens, mergeClasses } from '@fluentui/react-components';
import type { ReactNode } from 'react';

/* CE section heading lockup: an uppercase tracked eyebrow, then the heading
   text (and optional right-aligned actions). The old free-floating 2px red
   hairline under the eyebrow was removed (review 190626 broad-review #2: it
   read as a red bar floating in random places). The eyebrow itself was demoted
   from red to charcoal (--ce-eyebrow-color, reforge 2026-07-01) — the red
   budget is brand chrome + critical; tracking/caps carry the section moment. */

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: tokens.spacingVerticalM },
  topRow: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: tokens.spacingHorizontalM },
  left: { display: 'flex', flexDirection: 'column', gap: '4px' },
  eyebrow: {
    fontFamily: "'Futura PT', 'Tw Cen MT Std', sans-serif",
    color: 'var(--ce-eyebrow-color)',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    lineHeight: 1,
  },
  heading: {
    fontFamily: "'Futura PT', 'Tw Cen MT Std', sans-serif",
    fontSize: tokens.fontSizeHero700,
    fontWeight: 700,
    color: tokens.colorNeutralForeground1,
    lineHeight: 1.1,
    margin: 0,
  },
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase300 },
});

export interface SectionHeadingProps {
  /** Small uppercase tracked eyebrow above the heading. */
  eyebrow: string;
  /** The display heading text. */
  heading: ReactNode;
  /** Optional muted subtitle under the heading. */
  subtitle?: ReactNode;
  /** Optional right-aligned action slot (buttons etc.). */
  actions?: ReactNode;
  /** Extra class on the root. */
  className?: string;
}

/** Tracked eyebrow + display heading. The CE "section moment". */
export function SectionHeading({ eyebrow, heading, subtitle, actions, className }: SectionHeadingProps) {
  const styles = useStyles();
  return (
    <div className={mergeClasses(styles.root, className)}>
      <div className={styles.topRow}>
        <div className={styles.left}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1 className={styles.heading}>{heading}</h1>
          {subtitle && <span className={styles.sub}>{subtitle}</span>}
        </div>
        {actions && <div>{actions}</div>}
      </div>
    </div>
  );
}

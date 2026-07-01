import { useEffect } from 'react';
import { Button, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { X } from 'lucide-react';

/* ============================================================
   BulkActionBar — the selection toolbar for the queue grids
   (reforge M-E1, spec IA §4).

   Sticks to the bottom of the CONTENT pane (position: sticky inside the
   scrolling <main>, NOT viewport-fixed — it never overlays the rail).
   Renders nothing until something is selected. Shape:

     n selected · <verb buttons> · [caption] · Clear

   Esc clears the selection. NOTE (M-F): once the peek drawer lands, Esc
   priority is peek-open → close peek FIRST, else clear selection — the
   drawer must mount its own listener and stop propagation / preventDefault
   so this one stays inert while the drawer is open.

   Entrance rides the global .ce-enter fade (reduced-motion gated in
   theme.css). Buttons are Fluent (they inherit the CE-red focus ring via
   colorStrokeFocus2).
   ============================================================ */

const useStyles = makeStyles({
  bar: {
    position: 'sticky',
    bottom: 0,
    zIndex: 2,
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: '2px',
    boxShadow: 'var(--ce-shadow-md)',
  },
  count: {
    fontWeight: tokens.fontWeightSemibold,
    color: 'var(--ce-ink)',
    whiteSpace: 'nowrap',
  },
  caption: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  spacer: { flexGrow: 1 },
});

export interface BulkVerb {
  key: string;
  /** Button label with the honest eligible count, e.g. "Hold (4)". */
  label: string;
  onClick: () => void;
  /** Disabled ONLY at eligible n = 0 (spec IA §4). */
  disabled?: boolean;
}

export interface BulkActionBarProps {
  /** Selected-row count — the bar renders nothing at 0. */
  count: number;
  verbs: BulkVerb[];
  /** Eligibility caption, e.g. "3 selected need their duplicate decision made per case". */
  caption?: string;
  onClear: () => void;
  /** Disables the verbs while a batch is in flight. */
  busy?: boolean;
}

/** Sticky bulk-selection toolbar. Renders nothing when `count` is 0. */
export function BulkActionBar({ count, verbs, caption, onClear, busy }: BulkActionBarProps) {
  const styles = useStyles();

  // Esc clears the selection. Skip events a component already handled
  // (Fluent dropdowns/dialogs preventDefault their own Esc) — and the M-F
  // peek drawer will take priority the same way (see header note).
  useEffect(() => {
    if (count === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClear();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [count, onClear]);

  if (count === 0) return null;

  return (
    <div
      className={mergeClasses('ce-enter', styles.bar)}
      role="toolbar"
      aria-label="Bulk actions"
    >
      <Text className={styles.count} role="status">
        {count} selected
      </Text>
      {verbs.map((v) => (
        <Button
          key={v.key}
          appearance="secondary"
          disabled={busy || v.disabled}
          onClick={v.onClick}
        >
          {v.label}
        </Button>
      ))}
      {caption && <span className={styles.caption}>{caption}</span>}
      <span className={styles.spacer} aria-hidden />
      <Button appearance="subtle" icon={<X size={16} />} onClick={onClear} disabled={busy}>
        Clear
      </Button>
    </div>
  );
}

export default BulkActionBar;

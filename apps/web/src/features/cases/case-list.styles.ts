import { makeStyles, tokens } from '@fluentui/react-components';

export const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  tabs: { marginTop: `-${tokens.spacingVerticalS}` },

  facets: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  facetLabel: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '11px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
    marginRight: tokens.spacingHorizontalXS,
  },
  facetChip: {
    cursor: 'pointer',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground2,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  // Charcoal-selected (reforge 2026-07-01): a toggled filter is a selection,
  // not a severity — white-on-charcoal clears AA at 14.31:1.
  facetChipActive: {
    backgroundColor: 'var(--ce-charcoal)',
    border: '1px solid var(--ce-charcoal)',
    color: '#ffffff',
    ':hover': { backgroundColor: 'var(--ce-charcoal)' },
  },

  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
  },
  search: { width: '260px', maxWidth: '40vw' },
  filter: { display: 'flex', flexDirection: 'column', gap: '2px' },
  filterLabel: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '10px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
  },
  filterControl: { minWidth: '150px' },
  spacer: { flex: 1 },
  count: { color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap', alignSelf: 'center' },

  grid: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
  },
  row: {
    cursor: 'pointer',
    // CE 3px red focus halo on keyboard-focused rows (row focus mode).
    ':focus-visible': {
      outline: 'none',
      boxShadow: 'inset 0 0 0 2px var(--ce-red), 0 0 0 1px var(--ce-red)',
      position: 'relative',
      zIndex: 1,
    },
    // Reveal the row's peek icon-button on hover (it reveals itself on focus).
    '&:hover [data-peek-btn]': { opacity: 1 },
  },
  rowDuplicate: { backgroundColor: tokens.colorStatusDangerBackground1 },

  vrmCell: { display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  muted: { color: tokens.colorNeutralForeground3 },
  // TKT-118: a pre-mint case's Case/PO cell carries the VRM + a muted
  // "by registration" line so the identity is explicit, never a bare dash.
  vrmIdentityStack: { display: 'flex', flexDirection: 'column', lineHeight: 1.15 },

  // Checkbox cell wrapper — swallows click/keydown so toggling a selection
  // never triggers the row's open-case navigation.
  selectCell: { display: 'inline-flex', alignItems: 'center' },

  // Peek icon-button — ALWAYS tabbable, visually revealed on row hover or
  // its own focus (spec IA §3).
  peekBtn: {
    opacity: 0,
    transitionProperty: 'opacity',
    transitionDuration: tokens.durationFaster,
    ':focus': { opacity: 1 },
    ':focus-visible': { opacity: 1 },
  },

  // Verb-led cells (Outstanding / Why held) — single line, ellipsised.
  // Typography comes from useTableTypography().cellPrimary.
  outstanding: {
    display: 'block',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  // Channel — icon only, centred in its narrow fixed column.
  channelCell: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForeground2,
  },

  // Aging / Due — stacked, severity-aware (spec §3 aging-cell demotion): the
  // non-urgent age is plain cellSecondary text (no pill in grid cells); due
  // ≤2d gets --ce-warning-text semibold + 14px CalendarClock; past-due gets
  // --ce-critical-ink semibold text with the 14px icon keeping --ce-red.
  // Never colour-only — the icons carry the shape cue.
  dueCell: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, lineHeight: 1.2 },
  dueStack: { display: 'flex', flexDirection: 'column', lineHeight: 1.15 },
  duePastIcon: { color: 'var(--ce-red)', flexShrink: 0 },
  dueSoonIcon: { color: 'var(--ce-warning-text)', flexShrink: 0 },
  duePastText: { color: 'var(--ce-critical-ink)', fontWeight: tokens.fontWeightSemibold },
  dueSoonText: { color: 'var(--ce-warning-text)', fontWeight: tokens.fontWeightSemibold },

  dup: { display: 'inline-flex', color: tokens.colorStatusDangerForeground1, flexShrink: 0 },
});

/* Status words come from StatusBadge.statusLabel() — the single source of
   user-facing status copy — so a status reads identically on every screen
   (this screen used to carry a second, divergent map). */

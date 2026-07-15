import { makeStyles, tokens } from '@fluentui/react-components';

export const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },

  // Source-mailbox facet chips (TKT-025) — the SAME pattern as CaseList's
  // reason-facet chips: charcoal-selected (selection ≠ severity), never red.
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
  search: { width: '280px', maxWidth: '40vw' },
  filter: { display: 'flex', flexDirection: 'column', gap: '2px' },
  filterLabel: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '10px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
  },
  filterControl: { minWidth: '180px' },
  // TKT-121 — the E-mail type popover listbox is CAPPED (~10 option rows) with its
  // own scrollbar instead of growing taller than the viewport. `!important` because
  // Fluent's popover positioning (autoSize) writes an INLINE viewport-height
  // max-height on open, which would otherwise beat any class rule. Keyboard nav
  // still reaches every option: Fluent scrolls the active option into view within
  // the listbox as focus moves.
  typeListbox: {
    maxHeight: '320px !important',
    overflowY: 'auto',
  },
  spacer: { flex: 1 },
  dismissedSwitch: { alignSelf: 'center' },

  // "Showing cached" banner — a refetch failed but the previously-loaded rows are
  // still on screen, so we keep them and flag staleness rather than blanking the queue.
  staleBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: '2px',
    border: '1px solid var(--ce-amber-line)',
    backgroundColor: 'var(--ce-amber-tint)',
    color: 'var(--ce-amber-ink)',
    fontSize: '13px',
  },
  staleIcon: { flexShrink: 0, display: 'inline-flex' },
  staleText: { flex: 1, minWidth: 0 },

  grid: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    // Clip vertically (rounded corners + body scroll) but allow horizontal scroll so the
    // right-most actions column (the "…" menu) is never clipped when the preview sidebar
    // narrows the grid pane below the columns' total width.
    overflowX: 'auto',
    overflowY: 'hidden',
    flex: '1 1 auto',
    minWidth: 0,
  },

  workspace: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: tokens.spacingHorizontalM,
    minHeight: '420px',
  },
  gridPane: {
    flex: '1 1 60%',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  gridPaneWithSidebar: {
    flex: '1 1 55%',
  },

  previewSidebar: {
    flex: '0 0 40%',
    maxWidth: '480px',
    minWidth: '280px',
    display: 'flex',
    flexDirection: 'column',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
  },
  previewHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalM + ' ' + tokens.spacingHorizontalM,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  previewTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    color: tokens.colorNeutralForeground1,
    lineHeight: 1.3,
    minWidth: 0,
    wordBreak: 'break-word',
  },
  previewBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalM,
    overflowY: 'auto',
    flex: 1,
    minHeight: 0,
  },
  snippetPreviewSurface: {
    // TKT-169: the old Tooltip grew to the message's full height and could
    // start above the viewport. Floating placement keeps this surface inside
    // the viewport; its own scroll area handles long messages.
    boxSizing: 'border-box',
    width: 'min(420px, calc(100vw - 32px))',
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: 'min(420px, calc(100vh - 64px))',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    lineHeight: 1.4,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
  },
  previewActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  // Sender initial — info slate callout (reforge 2026-07-01: red is budget-
  // gated to critical; an avatar is identity, not severity).
  avatarCircle: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: 'var(--ce-info-tint)',
    color: 'var(--ce-info-ink)',
    fontWeight: 700,
    fontSize: '14px',
    flexShrink: 0,
  },
  fromRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  folderLine: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    color: tokens.colorNeutralForeground3,
    fontSize: '11px',
  },
  folderName: {
    fontFamily: 'var(--ce-font-mono)',
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },

  // Selected subject — semibold ink + underline (the base is already semibold;
  // red-on-selection falsely signals severity in a red-budgeted grid).
  subjLinkSelected: {
    color: 'var(--ce-ink)',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },

  // From — ONE cellSecondary line (spec IA §2); the sender domain is demoted
  // to the cell tooltip. Typography from useTableTypography().
  fromLine: {
    display: 'block',
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  muted: { color: tokens.colorNeutralForeground3 },

  subjCell: { display: 'flex', flexDirection: 'column', minWidth: 0, gap: '2px', lineHeight: 1.25 },
  subjLine: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, minWidth: 0 },
  // Subject as a link/button — opens the Case (linked) or the stored email
  // (unlinked). Weight/size come from cellPrimary; this adds the link chrome.
  subjLink: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'left',
    maxWidth: '100%',
    cursor: 'pointer',
    ':hover': {
      color: 'var(--ce-ink)',
      textDecoration: 'underline',
      textUnderlineOffset: '2px',
    },
  },
  // Preview line — colour/size from cellSecondary; this adds the ellipsis.
  preview: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  },
  clip: { flexShrink: 0, color: tokens.colorNeutralForeground3, display: 'inline-flex' },

  classStack: { display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' },
  subtypeBadge: { maxWidth: '100%' },
  // "Why this label?" — the reasons list inside the classification cell's
  // tooltip AND the preview panel's compact caption list (same recipe, two
  // render sites: D16 keeps the CELL itself at two lines; only the tooltip
  // content and the preview panel grow richer).
  whyTooltip: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    maxWidth: '260px',
  },
  whyList: {
    margin: 0,
    paddingLeft: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  // "Overridden" flag — staff changed the arrival suggestion (amber idiom + icon).
  overrideChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontWeight: tokens.fontWeightSemibold,
    backgroundColor: 'var(--ce-warning-tint)',
    color: 'var(--ce-warning-ink)',
    border: '1px solid var(--ce-warning-line)',
  },

  // Status cell (TKT-054 / 020726 E4) — the case-link form mirrors subjLink's
  // quiet charcoal hover-underline (grid links are D17 rest-underline-exempt).
  statusLink: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'left',
    maxWidth: '100%',
    cursor: 'pointer',
    fontFamily: 'var(--ce-font-mono)',
    fontSize: '12px',
    color: tokens.colorNeutralForeground1,
    ':hover': {
      color: 'var(--ce-ink)',
      textDecoration: 'underline',
      textUnderlineOffset: '2px',
    },
  },

  // Suggested action (020726 E6): actionable = quiet transparent button;
  // display-only/lifecycle = secondary text. Failed retry uses the amber ink
  // (never colour-only — the label says "failed").
  suggestedBtn: {
    justifyContent: 'flex-start',
    maxWidth: '100%',
    overflow: 'hidden',
    fontWeight: tokens.fontWeightRegular,
  },
  suggestedText: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  suggestedFailed: { color: 'var(--ce-warning-ink)' },

  // TKT-093 — inbox-list suggest-attach hint (a pending "may belong to · <Case/PO>" line
  // under the status, so the suggestion is visible from the list, not only the opened email).
  statusCellStack: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '2px',
    minWidth: 0,
  },
  linkSuggestionHint: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    maxWidth: '100%',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  // Handled (actioned) rows stay in the single list, muted — the Status text
  // carries the state (mute is redundant encoding); full strength returns on
  // hover/focus so the quick actions stay legible.
  rowHandled: {
    opacity: 0.55,
    ':hover': { opacity: 1 },
    ':focus-within': { opacity: 1 },
  },

  actionsCell: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '2px',
    width: '100%',
    // Keep the "…" trigger a few px off the clipped right edge of the column.
    paddingRight: '6px',
  },
  quickActions: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
  },
  quickActionBtn: {
    minWidth: '32px',
    minHeight: '32px',
  },


  // Shared dialog scaffolding (full-email view, mailbox pointer, reclassify).
  dialogGrid: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  metaRow: { display: 'flex', flexDirection: 'column', gap: '2px' },
  metaLabel: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '10px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
  },
  metaValue: { color: tokens.colorNeutralForeground1 },
  metaMono: {
    fontFamily: 'var(--ce-font-mono)',
    wordBreak: 'break-all',
    color: tokens.colorNeutralForeground1,
  },
  emailBody: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '40vh',
    overflowY: 'auto',
    padding: tokens.spacingVerticalM,
    borderRadius: '2px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    lineHeight: 1.6,
    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)',
    ':focus-visible': {
      outline: '2px solid var(--ce-red)',
      outlineOffset: '2px',
    },
  },
  dialogNote: { color: tokens.colorNeutralForeground3 },
  suggestLine: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, flexWrap: 'wrap' },
});

/** Format an ISO timestamp as DD/MM/YYYY HH:mm (mirrors the activity feed). */

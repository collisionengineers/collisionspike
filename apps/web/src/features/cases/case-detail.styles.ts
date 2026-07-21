import { makeStyles, tokens } from '@fluentui/react-components';

export const useStyles = makeStyles({
  page: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  backRow: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  /* Back-arrow lockup inside the "Dashboard" link (icon + label, baseline). */
  backLink: { display: 'inline-flex', alignItems: 'center', gap: '4px' },
  /* Inline icon + text lockup (e.g. the evidence-tab "No images yet" bar). */
  inlineIconText: { display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  /* "Nothing outstanding" ready row in the readiness sidebar. */
  readyDone: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    marginTop: tokens.spacingVerticalXS,
  },
  /* Tight caption spacing nudges (kept off inline style props). */
  hintNudgeTop: { marginTop: '2px' },
  hintNudgeBottom: { marginBottom: tokens.spacingVerticalXS },
  titleTags: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    marginTop: '4px',
  },
  /* Title lockup: VRM plate beside the Futura Case/PO · provider line. */
  titleLockup: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  /* VRM VIEW row: the plate + a pencil edit affordance that's de-emphasised until
     the operator hovers the plate or keyboard-focuses the button (issue #12). */
  vrmViewRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    '& .ce-vrm-edit-affordance': { opacity: 0, transition: 'opacity 100ms ease-out' },
    '&:hover .ce-vrm-edit-affordance': { opacity: 1 },
    '&:focus-within .ce-vrm-edit-affordance': { opacity: 1 },
    // Touch / no-hover devices can't hover to reveal — keep the affordance visible.
    '@media (hover: none)': { '& .ce-vrm-edit-affordance': { opacity: 1 } },
  },
  /* VRM EDIT row: the Field-wrapped input + Save/Cancel, replacing the plate in place. */
  vrmEditRow: {
    display: 'inline-flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  vrmInput: {
    minWidth: '170px',
    // Echo the plate's condensed mono so the field reads as "the registration".
    '& input': {
      fontFamily: 'var(--ce-font-mono)',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    },
  },
  titleText: { lineHeight: 1.1 },
  spine: { marginTop: tokens.spacingVerticalS },
  /* Legible age/due metadata chip (severity ramp, not 30%-grey). */
  metaChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    padding: '2px 8px',
    borderRadius: '2px',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  metaPastDue: {
    color: '#ffffff',
    backgroundColor: 'var(--ce-red-dark)',
    border: '1px solid var(--ce-red-dark)',
  },
  metaSoon: {
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  /* TKT-057 — the derived audit reference (marker + Case/PO) in the title tags:
     mono, quiet outline — a reference, not a severity. */
  derivedIdBadge: {
    fontFamily: 'var(--ce-font-mono)',
    letterSpacing: '0.04em',
  },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap', alignItems: 'center' },
  saveBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: '3px solid var(--ce-charcoal)',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  saveBarMessage: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
    flexGrow: 1,
  },
  saveBarActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: tokens.spacingHorizontalXL,
    alignItems: 'start',
    '@media (max-width: 960px)': { gridTemplateColumns: '1fr' },
  },

  main: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, minWidth: 0 },
  tabBody: { paddingTop: tokens.spacingVerticalM },

  /* Fields tab — clustered groups */
  cluster: { display: 'flex', flexDirection: 'column' },
  clusterHead: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground2,
    paddingBottom: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalM,
    // Charcoal group underline (reforge 2026-07-01: a field-cluster head is
    // structure, not severity).
    borderBottom: `2px solid var(--ce-charcoal)`,
    width: 'fit-content',
  },
  clusterBody: { paddingTop: tokens.spacingVerticalM },

  /* Evidence tab — guidance is an INFO callout (slate rail), not an alarm. */
  guidanceBanner: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: `3px solid var(--ce-info-accent)`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    padding: tokens.spacingVerticalS + ' ' + tokens.spacingHorizontalM,
  },
  thumbGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  thumbCard: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  thumbCardExcluded: { opacity: 0.55 },
  thumb: {
    height: '96px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontFamily: 'var(--ce-font-display)',
    fontWeight: 700,
    letterSpacing: '0.04em',
    overflow: 'hidden',
  },
  /* Real inline preview (TKT-048): fill the thumb, crop to fit. */
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  thumbMeta: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, padding: tokens.spacingVerticalS },
  thumbName: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, wordBreak: 'break-all' },
  thumbRowBetween: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacingHorizontalS },
  /* Single-child archive row. Its former space-between partner (the "Case archive —
     … mirrored here" caption) was removed by operator direction, so the link/button
     is left-aligned on purpose — not a stray space-between with one child. */
  thumbRowStart: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  /* TKT-123 — dismissible person-reflection warning on a flagged photo. Amber
     warning triad (never colour-only: the triangle carries the shape cue). */
  reflectionWarning: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    border: '1px solid var(--ce-warning-line)',
    backgroundColor: 'var(--ce-warning-tint)',
    color: 'var(--ce-warning-text)',
  },
  reflectionWarningText: {
    flexGrow: 1,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },

  /* Documents list (source email + instructions + non-image artifacts) */
  docList: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  docRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingVerticalS + ' ' + tokens.spacingHorizontalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  docName: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flexGrow: 1 },
  docFile: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1, wordBreak: 'break-all' },

  /* Address tab */
  addrLines: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    fontFamily: 'var(--ce-font-mono)',
    fontSize: tokens.fontSizeBase300,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  stack: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  hint: { color: tokens.colorNeutralForeground3 },

  /* Suggested locations panel (corpus suggestions — ALWAYS a suggestion). */
  suggestHead: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
  },
  suggestList: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  /* "Suggest location" action row — heading + button, spaced apart. */
  assistActionRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  /* Muted "no location could be suggested" line. */
  assistNoResult: {
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic',
  },
  /* Search-the-corpus input above the suggestion shortlist (TKT-062). */
  addrSearch: {
    width: '100%',
    marginBottom: tokens.spacingVerticalXS,
  },
  suggestRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingVerticalS + ' ' + tokens.spacingHorizontalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: '3px solid #e3a008', // amber rail — unverified suggestion
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  suggestBody: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flexGrow: 1 },
  suggestAddr: {
    fontFamily: 'var(--ce-font-mono)',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'pre-line',
  },
  suggestMeta: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, flexWrap: 'wrap' },
  /* "Suggested" tint badge — distinct from the confirmed brand badge. */
  suggestBadge: {
    backgroundColor: '#fef3c7',
    color: '#7a4f01',
    border: '1px solid #e3c062',
  },

  /* Notes tab */
  noteList: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, marginTop: tokens.spacingVerticalM },
  note: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalS + ' ' + tokens.spacingHorizontalM,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  noteMeta: { display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'baseline' },
  noteAuthor: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  noteTime: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },

  /* Sidebar */
  sidebar: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL, position: 'sticky', top: tokens.spacingVerticalM },

  /* Canonical readiness list (deep-linking ✗ rows) */
  readyList: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, marginTop: tokens.spacingVerticalS },
  readyRow: { display: 'flex', alignItems: 'flex-start', gap: tokens.spacingHorizontalS, padding: '2px 0' },
  iconOk: { color: '#16833b', flexShrink: 0, marginTop: '1px' },
  iconBad: { color: 'var(--ce-red)', flexShrink: 0, marginTop: '1px' },
  readyText: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  readyLabel: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1 },
  readyDetail: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  /* the deep-link button styled as a left-aligned link with a chevron affordance.
     Stays in the red family (it fixes a true blocker) but as --ce-critical-ink
     (9.17:1 on white); hover darkens to ink. */
  fixLink: {
    appearance: 'none',
    background: 'none',
    border: 0,
    padding: 0,
    margin: 0,
    textAlign: 'left',
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: 'var(--ce-critical-ink)',
    cursor: 'pointer',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
    ':hover': { color: 'var(--ce-ink)' },
    ':focus-visible': {
      outline: 'none',
      boxShadow: '0 0 0 3px rgba(219, 8, 22, 0.55)',
      borderRadius: '2px',
    },
  },

  factsPanel: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    padding: tokens.spacingVerticalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  factRow: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: tokens.spacingHorizontalS, fontSize: tokens.fontSizeBase200 },
  factKey: { color: tokens.colorNeutralForeground3 },
  factVal: { color: tokens.colorNeutralForeground2 },

  /* Remove-case confirmation dialog */
  removeBody: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  removeFacts: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    columnGap: tokens.spacingHorizontalM,
    rowGap: '2px',
    fontSize: tokens.fontSizeBase200,
  },
});

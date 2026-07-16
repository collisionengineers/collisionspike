import { makeStyles, tokens } from '@fluentui/react-components';

export const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  tabs: { marginTop: `-${tokens.spacingVerticalS}` },
  /* Layout only — border / radius / background / padding come from <Panel>. */
  intakePanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    maxWidth: '640px',
  },

  /* ----- "what works here" framing line above the toolbar ----- */
  workingNote: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
  },

  /* ----- providers toolbar (search + segmented filter + counts) ----- */
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
  },
  search: { width: '280px', maxWidth: '40vw' },
  segment: { marginLeft: `-${tokens.spacingHorizontalXS}` },
  toolbarSpacer: { flex: 1 },
  counts: { color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },

  /* ----- collapsed Accordion row (the scannable provider summary) ----- */
  accordion: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
  },
  acItem: { borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  rowSummary: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    minWidth: 0,
    width: '100%',
  },
  rowName: {
    fontFamily: 'var(--ce-font-display)',
    fontWeight: 700,
    fontSize: tokens.fontSizeBase300,
    color: 'var(--ce-ink)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowMeta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
  },
  rowSpacer: { flex: 1 },
  rowLastUsed: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
    minWidth: '92px',
    justifyContent: 'flex-end',
  },
  // "No domain" marker — a data-quality warning, not a blocker. Uses
  // --ce-warning-text (#8a5a00), NOT --ce-warning-line, which fails the 3:1
  // non-text graphics contrast floor on white (pigment ruling).
  noDomainDot: {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'var(--ce-warning-text)',
    flexShrink: 0,
  },
  panelInner: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
  },
  showMore: { alignSelf: 'center', marginTop: tokens.spacingVerticalS },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
    gap: tokens.spacingHorizontalL,
  },
  provName: {
    fontFamily: 'var(--ce-font-display)',
    fontWeight: 700,
    fontSize: tokens.fontSizeBase400,
    color: 'var(--ce-ink)',
  },
  code: {
    fontFamily: 'var(--ce-font-mono)',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground2,
  },
  domains: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  domainAdd: { display: 'flex', gap: tokens.spacingHorizontalXS, alignItems: 'flex-end' },

  /* ----- Provider API keys (TKT-055 / ADR-0020) ----- */
  keySection: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  keyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
  },
  keyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  keyPrefixMono: {
    fontFamily: 'var(--ce-font-mono)',
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'nowrap',
  },
  keyMeta: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, whiteSpace: 'nowrap' },
  keyRowSpacer: { flex: 1 },
  /* One-time plaintext reveal — a distinct, attention-drawing surface. */
  plaintextValue: {
    fontFamily: 'var(--ce-font-mono)',
    wordBreak: 'break-all',
    padding: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  fieldHint: { color: tokens.colorNeutralForeground3 },
  cardActions: { display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center', marginTop: 'auto' },
  spacer: { flex: 1 },

  readonlyIntro: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  /* Layout only — border / radius / background / padding come from <Panel>. */
  readonlyPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  readonlyHead: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  readonlyCount: {
    display: 'flex',
    alignItems: 'baseline',
    gap: tokens.spacingHorizontalXS,
  },
  readonlyCountNum: {
    fontFamily: 'var(--ce-font-display)',
    fontWeight: 700,
    fontSize: tokens.fontSizeHero700,
    lineHeight: '1',
    color: 'var(--ce-ink)',
  },
  readonlyCountUnit: { color: tokens.colorNeutralForeground3 },
  /* Confirmed/suggested split sub-line under the inspection-address count. */
  splitLine: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  /* "Suggested" tint chip — distinct from the confirmed brand look. */
  suggestedChip: {
    backgroundColor: '#fef3c7',
    color: '#7a4f01',
    border: '1px solid #e3c062',
  },

  /* A distinct dashed, fill-less surface (NOT the shared <Panel> card, which has
     a solid hairline + Background1 fill) — the assisted-import preview reads as a
     placeholder drop-zone, so it keeps its own block. */
  importPanel: {
    border: `1px dashed ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  diffRow: {
    display: 'grid',
    gridTemplateColumns: '90px 1fr',
    gap: tokens.spacingHorizontalM,
    fontSize: tokens.fontSizeBase200,
    fontFamily: 'var(--ce-font-mono)',
  },
  diffAdd: { color: 'var(--ce-success)' },
  diffKey: { color: tokens.colorNeutralForeground3 },
});

import { makeStyles, tokens } from '@fluentui/react-components';

export const useStyles = makeStyles({
  page: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },

  /* Dropzone-style picker */
  dropzone: {
    border: `2px dashed ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    padding: tokens.spacingVerticalXXL,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    textAlign: 'center',
    transition: 'border-color 120ms ease, background-color 120ms ease',
  },
  // Drag-active KEEPS the red dashed border (CTA-adjacent "drop here now");
  // the rest-state icon is quiet charcoal (reforge fix round 2026-07-01).
  dropzoneActive: {
    border: `2px dashed var(--ce-red)`,
    backgroundColor: tokens.colorNeutralBackground1Selected,
  },
  dropIcon: { color: 'var(--ce-charcoal)' },
  pickActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  hint: { color: tokens.colorNeutralForeground3 },

  /* Chosen-files list (the instruction doc + any extra evidence) */
  fileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    width: '100%',
    maxWidth: '560px',
    marginTop: tokens.spacingVerticalS,
  },
  fileChip: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '2px',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  fileName: {
    fontFamily: 'var(--ce-font-mono)',
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
    flexGrow: 1,
    textAlign: 'left',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fileTag: { flexShrink: 0 },

  /* Identity lockup once parsed */
  identityRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
    flexWrap: 'wrap',
    marginBottom: tokens.spacingVerticalM,
  },
  caseTypeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalM,
  },

  /* A two-up row for paired fields (Work provider + Principal, Make + Model). */
  pairRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalM,
    '@media (max-width: 720px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
  imageIdentityGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    paddingBottom: tokens.spacingVerticalM,
    '& > *': { minWidth: 0 },
    '@media (max-width: 720px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
  imageLookupCell: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'end',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
    '@media (max-width: 520px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },

  /* Field clusters (mirrors CaseDetail) */
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
    // Charcoal group underline — mirrors CaseDetail clusterHead (reforge 2026-07-01).
    borderBottom: `2px solid var(--ce-charcoal)`,
    width: 'fit-content',
  },
  clusterBody: { paddingTop: tokens.spacingVerticalM },
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: tokens.spacingHorizontalM,
    alignItems: 'start',
    paddingBottom: tokens.spacingVerticalM,
    '@media (max-width: 720px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
  fieldMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalXS,
    paddingTop: '26px',
    '@media (max-width: 720px)': {
      justifyContent: 'flex-start',
      paddingTop: 0,
    },
  },
  /* A field with an inline action button to its right (enrich / normalise). */
  fieldWithAction: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  fieldGrow: { flexGrow: 1 },
  inlineNote: {
    color: tokens.colorNeutralForeground3,
    display: 'block',
    marginTop: tokens.spacingVerticalXS,
  },

  /* Parse-in-flight progress (under the dropzone) */
  parseProgress: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalM,
  },
  parseProgressLabel: { color: tokens.colorNeutralForeground3, textAlign: 'center' },

  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    marginTop: tokens.spacingVerticalM,
  },
  footerActions: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  checkboxStack: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  creatingBar: { marginTop: tokens.spacingVerticalM },
  /* MessageBar spacing nudges (kept off inline style props for theming parity). */
  barBelow: { marginBottom: tokens.spacingVerticalM },
  barAbove: { marginTop: tokens.spacingVerticalM },
});

/* EVA field clusters iterated on this screen — a SUBSET of the shared
   FIELD_CLUSTERS (src/shared/ui/EvaFields.tsx). The identity, make/model lookup,
   mileage and inspection-address controls render bespoke outside this map, so
   their keys are deliberately omitted here; the rest of the 12-field contract is
   iterated via the shared EvaFieldRow with labels from the shared LABEL_FOR (so a
   contract relabel flows through both screens). */

import type { ReactNode } from 'react';
import { Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import { Check, Circle, AlertTriangle } from 'lucide-react';
import type {
  FieldProvenance,
  ProvenanceSourceType,
  ReviewState,
} from '@cs/domain';

/* ============================================================
   ProvenanceBadge — ONE coherent provenance token.

   A single pill (same shape everywhere) carrying:
     - a FIXED source colour key (PDF / AI / Corpus / Manual / DVLA),
     - an 11px uppercase letter-tracked source label,
     - a review-state glyph encoded by SHAPE + LABEL, not colour alone
       (check = reviewed · dot = needs review · triangle = conflict ·
        no glyph = no review required),
   with the full provenance (source, origin, confidence, review) in a Tooltip.
   ============================================================ */

/* ----------  Fixed source key  ---------- */
type SourceKey = 'PDF' | 'AI' | 'Corpus' | 'Manual' | 'DVLA';

const SOURCE_KEY: Record<ProvenanceSourceType, SourceKey> = {
  pdf_extraction: 'PDF',
  document_ai: 'PDF',
  email_text: 'PDF',
  ai: 'AI',
  azure_vision: 'AI',
  corpus: 'Corpus',
  staff: 'Manual',
  manual_upload: 'Manual',
  whatsapp: 'Manual',
  dvla_dvsa: 'DVLA',
  web_lookup: 'DVLA',
};

/** Fixed colour key per source — used for the pill's left ink swatch. */
const SOURCE_COLOR: Record<SourceKey, string> = {
  PDF: '#2563eb', // blue — parsed from a document
  AI: '#7c3aed', // violet — model inference
  Corpus: '#0f766e', // teal — governed corpus
  Manual: '#57534e', // stone — human entry
  DVLA: '#b45309', // amber — external lookup
};

const SOURCE_LABEL: Record<ProvenanceSourceType, string> = {
  staff: 'Staff entry',
  manual_upload: 'Manual upload',
  pdf_extraction: 'PDF extraction',
  document_ai: 'Document AI',
  email_text: 'Email text',
  corpus: 'Governed corpus',
  ai: 'AI inference',
  azure_vision: 'Azure Vision',
  dvla_dvsa: 'DVLA / DVSA',
  web_lookup: 'Web lookup',
  whatsapp: 'WhatsApp',
};

const REVIEW_LABEL: Record<ReviewState, string> = {
  not_required: 'No review required',
  needs_review: 'Needs review',
  reviewed: 'Reviewed',
  conflict: 'Conflict',
};

const useStyles = makeStyles({
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    height: '18px',
    padding: '0 7px 0 6px',
    borderRadius: '2px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'default',
    maxWidth: 'fit-content',
  },
  swatch: {
    width: '6px',
    height: '6px',
    borderRadius: '1px',
    flexShrink: 0,
  },
  label: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground2,
    lineHeight: 1,
  },
  // review glyph — encoded by shape AND a sr-only label, not colour alone.
  glyph: {
    display: 'inline-flex',
    alignItems: 'center',
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
  },
  glyphReviewed: { color: tokens.colorPaletteGreenForeground1 },
  glyphNeedsReview: { color: tokens.colorPaletteYellowForeground1 },
  glyphConflict: { color: tokens.colorPaletteRedForeground1 },

  ttBody: { display: 'flex', flexDirection: 'column', gap: '2px', maxWidth: '240px' },
  ttLine: { fontSize: tokens.fontSizeBase200 },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

export interface ProvenanceBadgeProps {
  provenance: FieldProvenance;
  reviewState: ReviewState;
  /** The EVA field this badge annotates (e.g. 'mileage'). When set, lets a
   *  field carry a field-specific pill label — used so a DVSA-sourced mileage
   *  reads "Estimated" rather than the generic "DVLA". */
  fieldKey?: string;
}

/** One provenance token: fixed source-colour key + shape-coded review state, with full detail in a Tooltip. */
export function ProvenanceBadge({ provenance, reviewState, fieldKey }: ProvenanceBadgeProps) {
  const styles = useStyles();
  const key = SOURCE_KEY[provenance.sourceType];
  // The DVSA mileage estimate (sourceType=dvla_dvsa, field=mileage) reads
  // "Estimated" on the pill — the visible cue that this is an MOT-history
  // estimate, not a documented mileage. Colour/aria/tooltip stay the DVLA key.
  const pillLabel =
    provenance.sourceType === 'dvla_dvsa' && fieldKey === 'mileage' ? 'Estimated' : key;
  const sourceName = SOURCE_LABEL[provenance.sourceType];
  const confidencePct =
    provenance.confidence != null ? `${Math.round(provenance.confidence * 100)}%` : undefined;
  const reviewLabel = REVIEW_LABEL[reviewState];

  // Shape-coded review glyph (NOT colour-only): check / dot / triangle / none.
  let glyph: ReactNode = null;
  if (reviewState === 'reviewed') {
    glyph = (
      <span className={`${styles.glyph} ${styles.glyphReviewed}`}>
        <Check size={12} strokeWidth={3} />
      </span>
    );
  } else if (reviewState === 'needs_review') {
    glyph = (
      <span className={`${styles.glyph} ${styles.glyphNeedsReview}`}>
        <Circle size={9} strokeWidth={3} fill="currentColor" />
      </span>
    );
  } else if (reviewState === 'conflict') {
    glyph = (
      <span className={`${styles.glyph} ${styles.glyphConflict}`}>
        <AlertTriangle size={12} strokeWidth={2.5} />
      </span>
    );
  }

  const tip = (
    <div className={styles.ttBody}>
      <span className={styles.ttLine}>
        <strong>{key}</strong> · {sourceName}
      </span>
      <span className={styles.ttLine}>{provenance.sourceLabel}</span>
      {confidencePct && <span className={styles.ttLine}>Confidence: {confidencePct}</span>}
      <span className={styles.ttLine}>Review: {reviewLabel}</span>
    </div>
  );

  return (
    <Tooltip content={tip} relationship="description" withArrow>
      <span className={styles.pill} aria-label={`${key} source — ${reviewLabel}`}>
        <span className={styles.swatch} style={{ backgroundColor: SOURCE_COLOR[key] }} />
        <span className={styles.label}>{pillLabel}</span>
        {glyph}
        <span className={styles.srOnly}>{reviewLabel}</span>
      </span>
    </Tooltip>
  );
}

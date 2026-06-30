import type { ReactNode } from 'react';
import { Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Check, Circle, AlertTriangle } from 'lucide-react';
import type {
  FieldProvenance,
  ProvenanceSourceType,
  ReviewState,
} from '@cs/domain';

/* ============================================================
   ProvenanceBadge — ONE quiet provenance token.

   A small pill (same shape everywhere) carrying:
     - a FIXED source colour key (the left ink swatch),
     - a review-state glyph encoded by SHAPE + LABEL, not colour alone
       (check = reviewed · dot = needs review · triangle = conflict ·
        no glyph = no review required),
   with the full, PLAIN-LANGUAGE provenance in a Tooltip (no engineering terms
   — work-todo-spike: ui-changes/casepage de-jargon).

   `variant='compact'` (the default on the busy CaseDetail / ManualIntake field
   grids) drops the text label so every row carries only the swatch + glyph,
   with the wording in the tooltip — the per-row badge clutter the binding
   caseview review called out. `variant='full'` keeps a short plain label for
   standalone use (e.g. the Address tab).
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
  PDF: '#2563eb', // blue — read from a document
  AI: '#7c3aed', // violet — filled automatically
  Corpus: '#0f766e', // teal — from saved records
  Manual: '#57534e', // stone — entered by staff
  DVLA: '#b45309', // amber — external lookup
};

/** Short, plain-language label shown on the FULL pill (no engineering terms). */
const KEY_DISPLAY: Record<SourceKey, string> = {
  PDF: 'Document',
  AI: 'Auto',
  Corpus: 'Records',
  Manual: 'Staff',
  DVLA: 'DVLA',
};

/** Plain-language source description for the tooltip + accessible name. No
 *  file-format / product names (was "PDF extraction" / "Document AI" / "Azure
 *  Vision") — work-todo-spike: ui-changes/casepage. */
const SOURCE_LABEL: Record<ProvenanceSourceType, string> = {
  staff: 'Entered by staff',
  manual_upload: 'Uploaded by staff',
  pdf_extraction: 'Read from the document',
  document_ai: 'Read from the document',
  email_text: 'From the email',
  corpus: 'From saved records',
  ai: 'Filled in automatically',
  azure_vision: 'Read from the images',
  dvla_dvsa: 'From DVLA records',
  web_lookup: 'From an online lookup',
  whatsapp: 'From WhatsApp',
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
  // Compact: just the swatch + glyph, tighter — the per-row default.
  pillCompact: { gap: '4px', padding: '0 5px' },
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
   *  reads "Estimated" rather than the generic source word. */
  fieldKey?: string;
  /** 'compact' (default) drops the text label for the busy field grids; 'full'
   *  keeps the short plain-language source word. */
  variant?: 'full' | 'compact';
}

/** One provenance token: fixed source-colour key + shape-coded review state, with full plain-language detail in a Tooltip. */
export function ProvenanceBadge({ provenance, reviewState, fieldKey, variant = 'compact' }: ProvenanceBadgeProps) {
  const styles = useStyles();
  const key = SOURCE_KEY[provenance.sourceType];
  // The DVSA mileage estimate (sourceType=dvla_dvsa, field=mileage) reads
  // "Estimated" on the pill — the visible cue that this is an MOT-history
  // estimate, not a documented mileage. Colour/aria/tooltip stay the DVLA key.
  const pillLabel =
    provenance.sourceType === 'dvla_dvsa' && fieldKey === 'mileage' ? 'Estimated' : KEY_DISPLAY[key];
  const sourceName = SOURCE_LABEL[provenance.sourceType];
  const confidencePct =
    provenance.confidence != null ? `${Math.round(provenance.confidence * 100)}%` : undefined;
  const reviewLabel = REVIEW_LABEL[reviewState];
  const compact = variant === 'compact';

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
        <strong>{sourceName}</strong>
      </span>
      <span className={styles.ttLine}>{provenance.sourceLabel}</span>
      {confidencePct && <span className={styles.ttLine}>Confidence: {confidencePct}</span>}
      <span className={styles.ttLine}>Review: {reviewLabel}</span>
    </div>
  );

  return (
    <Tooltip content={tip} relationship="description" withArrow>
      <span
        className={mergeClasses(styles.pill, compact && styles.pillCompact)}
        aria-label={`${sourceName} — ${reviewLabel}`}
      >
        <span className={styles.swatch} style={{ backgroundColor: SOURCE_COLOR[key] }} />
        {!compact && <span className={styles.label}>{pillLabel}</span>}
        {glyph}
        <span className={styles.srOnly}>{reviewLabel}</span>
      </span>
    </Tooltip>
  );
}

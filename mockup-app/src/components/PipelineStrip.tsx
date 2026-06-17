import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { MapPin } from 'lucide-react';
import { pipelineStages, type PipelineStage, type PipelineStageKey } from '../mock';

/* ============================================================
   PipelineStrip — a thin connected stage track of the real sequence
   New → Parsing → Review → Chasing → Ready → Submitted → Box.

   The dashboard hero (variant="hero"); reused as a slim progress spine
   atop CaseDetail (variant="spine"). The chasing/stuck stage lights CE red.
   ============================================================ */

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'stretch',
    width: '100%',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '2px',
    overflow: 'hidden',
  },
  rootHero: { minHeight: '74px' },
  rootSpine: { minHeight: '40px' },

  seg: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '2px',
    flex: 1,
    minWidth: 0,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    // chevron connector
    ':last-child': { borderRight: 0 },
  },
  segSpine: { padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}` },

  /* a stage carrying work */
  segActive: { backgroundColor: tokens.colorNeutralBackground2 },
  /* the chasing/stuck stage — CE red accent (top rule + red count) */
  segStuck: {
    backgroundColor: 'var(--ce-red-tint)',
    '::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '3px',
      backgroundColor: 'var(--ce-red)',
    },
  },
  /* "you are here" — the CURRENT case's stage on the spine. Deliberately
     distinct from segStuck (ink, not red): bold ink top accent, raised
     contrast fill + a "current" caret/label below the count. */
  segHere: {
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: `inset 0 0 0 1px ${tokens.colorNeutralStroke1}`,
    '::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '3px',
      backgroundColor: 'var(--ce-ink)',
    },
  },
  labelHere: { color: 'var(--ce-ink)' },
  countHere: { color: 'var(--ce-ink)' },
  hereTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    fontFamily: 'var(--ce-font-display)',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--ce-ink)',
    lineHeight: 1,
  },

  label: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  count: {
    fontFamily: 'var(--ce-font-display)',
    fontWeight: 700,
    fontSize: '22px',
    lineHeight: 1,
    color: 'var(--ce-ink)',
  },
  countSpine: { fontSize: '15px' },
  countStuck: { color: 'var(--ce-red)' },
  countZero: { color: tokens.colorNeutralForeground4 },
});

export interface PipelineStripProps {
  /** Stages to render. Defaults to the live pipelineStages() helper. */
  stages?: PipelineStage[];
  /** 'hero' (dashboard top) or 'spine' (compact, atop CaseDetail). Default 'hero'. */
  variant?: 'hero' | 'spine';
  /** Force a particular stage to read as the active (work-here) stage. */
  active?: PipelineStageKey;
  /** Force a particular stage to light red (overrides the stage's own tone). */
  stuck?: PipelineStageKey;
  className?: string;
}

/** Thin connected stage track of the intake pipeline. */
export function PipelineStrip({
  stages,
  variant = 'hero',
  active,
  stuck,
  className,
}: PipelineStripProps) {
  const styles = useStyles();
  const data = stages ?? pipelineStages();
  const isSpine = variant === 'spine';

  return (
    <div
      className={mergeClasses(
        styles.root,
        isSpine ? styles.rootSpine : styles.rootHero,
        className,
      )}
      role="list"
      aria-label="Intake pipeline"
    >
      {data.map((s) => {
        const stuckHere = stuck ? s.key === stuck : s.tone === 'stuck' && s.count > 0;
        // "you are here" — only when `active` explicitly names this stage.
        const isHere = active != null && s.key === active;
        // subtle work-carrying tint (derived) — suppressed when this is the
        // explicit current stage or the stuck stage, which own the styling.
        const activeHere = !isHere && !stuckHere && (active != null ? false : s.count > 0);
        return (
          <div
            key={s.key}
            role="listitem"
            aria-label={`${s.label}: ${s.count}${isHere ? ' (current stage)' : ''}`}
            aria-current={isHere ? 'step' : undefined}
            className={mergeClasses(
              styles.seg,
              isSpine && styles.segSpine,
              activeHere && styles.segActive,
              stuckHere && styles.segStuck,
              isHere && styles.segHere,
            )}
          >
            <span className={mergeClasses(styles.label, isHere && styles.labelHere)}>{s.label}</span>
            <span
              className={mergeClasses(
                styles.count,
                isSpine && styles.countSpine,
                stuckHere && styles.countStuck,
                isHere && styles.countHere,
                s.count === 0 && !isHere && styles.countZero,
              )}
            >
              {s.count}
            </span>
            {isHere && (
              <span className={styles.hereTag}>
                <MapPin size={10} strokeWidth={2.5} /> You are here
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default PipelineStrip;

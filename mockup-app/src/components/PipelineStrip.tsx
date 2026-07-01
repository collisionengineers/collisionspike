import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { MapPin } from 'lucide-react';
import type { PipelineStage, PipelineStageKey } from '../data';

/* The pipeline stages, in order, as a count-less skeleton. Re-cut per review
   190626 (dashboard Area 1): Parsing (instant-ish) and Box (== Submitted) were
   dropped; Chasing folded into "Not ready"; Ready folded into Review.

   The HERO funnel (dashboard) shows only the three LIVE-DEPTH backlog stages
   (New → Not ready → Review) — open cases a person can still act on. The
   cumulative terminal total ("Sent to EVA") is NOT a backlog depth, so it was
   lifted out of the funnel into the dashboard's windowed throughput strip; this
   removes the depth-vs-cumulative category error the 190626 review flagged.

   The SPINE (atop CaseDetail) keeps the terminal stage so a per-case "you are
   here" can still light on eva_submitted / box_synced — so it carries all four.
   The Dashboard passes live counts via the `stages` prop (from useDashboard());
   the spine only needs the labels + the highlight, so it falls back to this
   skeleton — no data fetcher is imported here (keeps the seam the single I/O
   boundary). */
const BACKLOG_STAGES: readonly { key: PipelineStageKey; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'not_ready', label: 'Not ready' },
  { key: 'review', label: 'Review' },
];
const TERMINAL_STAGE: { key: PipelineStageKey; label: string } = {
  key: 'submitted',
  label: 'Submitted',
};
/** Hero shows the three backlog depths; the spine carries the terminal too. */
const STAGE_SKELETON_HERO = BACKLOG_STAGES;
const STAGE_SKELETON_SPINE: readonly { key: PipelineStageKey; label: string }[] = [
  ...BACKLOG_STAGES,
  TERMINAL_STAGE,
];
/** Stage keys the HERO funnel renders (the live-depth backlog only). */
const HERO_STAGE_KEYS: ReadonlySet<PipelineStageKey> = new Set(
  BACKLOG_STAGES.map((s) => s.key),
);

/* ============================================================
   PipelineStrip — a thin connected stage track of the intake pipeline.

   The dashboard hero (variant="hero") shows the live-depth backlog
   New → Not ready → Review; reused as a slim progress spine atop CaseDetail
   (variant="spine") which also carries the terminal Submitted stage for the
   per-case "you are here". The not-ready/stuck stage lights WARNING AMBER
   (reforge 2026-07-01 fork #3: a stuck stage needs sorting — it is not a
   blocker; red is budget-gated to brand chrome + critical).
   ============================================================ */

const useStyles = makeStyles({
  /* Wrapper carries the optional eyebrow caption above the stage track so the
     funnel's scope ("Open cases by stage") is unambiguous next to the windowed
     "Today / this week" strip below it. */
  wrap: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  caption: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
  },

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
  /* the chasing/stuck stage — warning amber (wash ground + amber rules;
     the count/label carry --ce-warning-text / --ce-warning-ink below) */
  segStuck: {
    backgroundColor: 'var(--ce-warning-wash)',
    borderLeft: '4px solid var(--ce-warning-line)',
    '::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '3px',
      backgroundColor: 'var(--ce-warning-line)',
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
  countStuck: { color: 'var(--ce-warning-text)' },
  labelStuck: { color: 'var(--ce-warning-ink)' },
  countZero: { color: tokens.colorNeutralForeground3 },

  // interactive (dashboard) — the segment is a real <button> that navigates to
  // its queue on click; reset the native button chrome to keep the seg look.
  segClickable: {
    cursor: 'pointer',
    margin: 0,
    border: 0,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    font: 'inherit',
    color: 'inherit',
    textAlign: 'left',
    transitionProperty: 'background-color, box-shadow, transform',
    transitionDuration: '150ms',
    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      boxShadow: 'var(--ce-shadow-md)',
      transform: 'translateY(-1px)',
    },
    ':focus-visible': { outline: 'none', boxShadow: 'inset 0 0 0 2px var(--ce-red)', zIndex: 1 },
  },
});

export interface PipelineStripProps {
  /** Stages to render. Defaults to the live pipelineStages() helper. */
  stages?: PipelineStage[];
  /** 'hero' (dashboard top) or 'spine' (compact, atop CaseDetail). Default 'hero'. */
  variant?: 'hero' | 'spine';
  /** Force a particular stage to read as the active (work-here) stage. */
  active?: PipelineStageKey;
  /** Force a particular stage to light warning-amber (overrides the stage's own tone). */
  stuck?: PipelineStageKey;
  /** When provided, each stage becomes a button that navigates (dashboard hero). */
  onStageSelect?: (key: PipelineStageKey) => void;
  /** Optional eyebrow caption above the track (e.g. "Open cases by stage"). */
  caption?: string;
  className?: string;
}

/** Thin connected stage track of the intake pipeline. */
export function PipelineStrip({
  stages,
  variant = 'hero',
  active,
  stuck,
  onStageSelect,
  caption,
  className,
}: PipelineStripProps) {
  const styles = useStyles();
  const isSpine = variant === 'spine';
  // The spine carries the terminal stage (for the per-case "you are here" on
  // eva_submitted/box_synced); the hero shows only the live-depth backlog.
  const skeleton = isSpine ? STAGE_SKELETON_SPINE : STAGE_SKELETON_HERO;
  // Live counts come from the seam via the `stages` prop; without them (e.g. the
  // per-case spine before the dashboard bundle resolves) fall back to a count-less
  // skeleton so the track still renders its labels + "you are here" marker.
  const provided: PipelineStage[] =
    stages ??
    skeleton.map((s) => ({ key: s.key, label: s.label, count: 0, tone: 'normal' as const }));
  // The hero funnel is the live-depth backlog only: drop the cumulative terminal
  // stage (its total now lives in the dashboard throughput strip). The spine
  // keeps every stage so a terminal case can still light "you are here".
  const data: PipelineStage[] = isSpine
    ? provided
    : provided.filter((s) => HERO_STAGE_KEYS.has(s.key));

  const interactiveStrip = onStageSelect != null;
  const track = (
    <div
      className={mergeClasses(
        styles.root,
        isSpine ? styles.rootSpine : styles.rootHero,
        // Without a caption wrapper the track owns the passed className.
        caption ? undefined : className,
      )}
      // Interactive hero = a group of navigation buttons (each its own button
      // role); the read-only spine is a list with a "you are here" step.
      role={interactiveStrip ? 'group' : 'list'}
      aria-label={isSpine ? 'Case progress' : 'Open cases by stage'}
    >
      {data.map((s) => {
        const stuckHere = stuck ? s.key === stuck : s.tone === 'stuck' && s.count > 0;
        // "you are here" — only when `active` explicitly names this stage.
        const isHere = active != null && s.key === active;
        // subtle work-carrying tint (derived) — suppressed when this is the
        // explicit current stage or the stuck stage, which own the styling.
        const activeHere = !isHere && !stuckHere && (active != null ? false : s.count > 0);
        const interactive = onStageSelect != null;
        const plural = s.count === 1 ? 'case' : 'cases';
        // Interactive hero segments are REAL buttons (button role + a name that
        // says what they do) so keyboard/SR users get the navigation affordance.
        const commonProps = {
          className: mergeClasses(
            styles.seg,
            isSpine && styles.segSpine,
            interactive && styles.segClickable,
            activeHere && styles.segActive,
            stuckHere && styles.segStuck,
            isHere && styles.segHere,
          ),
        };
        const body = (
          <>
            <span
              className={mergeClasses(
                styles.label,
                stuckHere && styles.labelStuck,
                isHere && styles.labelHere,
              )}
            >
              {s.label}
            </span>
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
          </>
        );
        if (interactive) {
          // Native <button> = implicit button role; a name that says what it does.
          return (
            <button
              key={s.key}
              type="button"
              aria-label={`${s.label}: ${s.count} ${plural}, open queue`}
              onClick={() => onStageSelect?.(s.key)}
              {...commonProps}
            >
              {body}
            </button>
          );
        }
        return (
          <div
            key={s.key}
            role="listitem"
            aria-label={`${s.label}: ${s.count} ${plural}${isHere ? ' (current stage)' : ''}`}
            aria-current={isHere ? 'step' : undefined}
            {...commonProps}
          >
            {body}
          </div>
        );
      })}
    </div>
  );

  // No caption → return the bare track (it already owns `className`).
  if (!caption) return track;
  return (
    <div className={mergeClasses(styles.wrap, className)}>
      <span className={styles.caption}>{caption}</span>
      {track}
    </div>
  );
}

export default PipelineStrip;

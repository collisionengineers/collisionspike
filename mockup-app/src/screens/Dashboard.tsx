import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Spinner } from '@fluentui/react-components';
import {
  Button,
  Caption1,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  RefreshCw,
  AlertOctagon,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CheckCheck,
  Eye,
  Inbox,
  Send,
  CalendarRange,
  Copy,
  GitFork,
  ImageOff,
  FileWarning,
  AlertTriangle,
  AlertCircle,
  Briefcase,
  Mail,
  MailQuestion,
  type LucideIcon,
} from 'lucide-react';

import {
  SectionHeading,
  PipelineStrip,
  VrmPlate,
  EmptyState,
  ErrorState,
  DashboardSkeleton,
  CasePeekDrawer,
  useSeverityChipStyles,
} from '../components';
import { useDashboard } from '../data';
import type { ActionReason, AgingRow, PipelineStageKey } from '../data';
import {
  ageSeverity,
  dueText,
  duePillText,
  groupAgingRows,
  type NeedsActionGroup,
} from './dashboard-needs-action';
import { caseDisplayName } from './case-list-columns';
import { nextPeekId, parsePeek, withPeek, withoutPeek } from './peek';

/* ============================================================
   Dashboard — the CHASE COCKPIT.

   Three kinds of number, never conflated:
     A. LIVE DEPTH    — drainable backlogs (Needs action, Ready). Thin strip.
     B. THROUGHPUT    — windowed (today / this week). Never lifetime.
     C. NEEDS ACTION  — the hero: oldest-due-first exception list.

   Refresh model (shape only, mock data): recompute on mount + on window
   focus + a focus-gated ~75s poll. A quiet "Updated HH:MM · Refresh"
   affordance restamps the time. Nothing here is a lifetime counter.
   ============================================================ */

const POLL_MS = 75_000;

/* Re-cut funnel stage → the queue/view it drills into (clickable strip).
   Each stage lands on a destination that CONTAINS the statuses it counts, so the
   strip never advertises a number then drops the user on a thinner list. The
   mapping mirrors the shared statusToStage buckets onto the three queues:
     - new (new_email/ingested) live in the Not ready queue → land there.
     - not_ready (missing_images/missing_required_fields/needs_review/linked) →
       the Not ready queue.
     - review (ready_for_eva) → the Review queue.
   `submitted` is no longer a funnel segment (its cumulative total moved to the
   throughput strip), so it carries no route here. Held (error/duplicate_risk) is
   reached via the dashboard held bar below, not the funnel. */
const STAGE_ROUTE: Partial<Record<PipelineStageKey, string>> = {
  new: '/queue/not-ready',
  not_ready: '/queue/not-ready',
  review: '/queue/review',
};

/* ----------  styles  ---------- */

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },

  /* Split-pane cockpit: exceptions left, telemetry right (desktop). */
  cockpitGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: tokens.spacingVerticalL,
    alignItems: 'start',
    '@media (min-width: 992px)': {
      gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
    },
  },
  cockpitMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    minWidth: 0,
  },
  cockpitSide: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    minWidth: 0,
  },

  regionHeading: {
    margin: 0,
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontWeight: 'inherit',
  },

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

  /* "Updated HH:MM · Refresh" affordance (quiet) */
  updated: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
    fontSize: '12px',
    whiteSpace: 'nowrap',
  },
  refreshBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    background: 'none',
    border: 'none',
    margin: 0,
    padding: '6px 10px',
    minHeight: '32px',
    borderRadius: '2px',
    cursor: 'pointer',
    color: tokens.colorNeutralForeground2,
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    // Quiet hover — red-on-hover falsely signals severity (reforge 2026-07-01).
    ':hover': {
      color: 'var(--ce-ink)',
      textDecoration: 'underline',
      textUnderlineOffset: '2px',
    },
  },

  /* exceptions bar — surfaces the can't-pass-through queue (queues #3) */
  exceptionBar: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderRadius: '2px',
    border: '1px solid var(--ce-red)',
    backgroundColor: 'var(--ce-red-tint)',
    color: 'var(--ce-red-dark)',
    fontWeight: tokens.fontWeightSemibold,
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    ':hover': { border: '1px solid var(--ce-red-dark)' },
  },
  exceptionText: { flexGrow: 1, minWidth: 0 },

  /* ----- region scaffolding ----- */
  region: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },

  /* ----- Region A: live depth — thin strip of two buttons ----- */
  liveStrip: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
  },
  // Clickable stat tile (spec §4): the affordance discriminator is an
  // always-visible chevron + a hover response (lift + --ce-shadow-hover);
  // static surfaces (thruStrip cells, allTimeTile) get neither. Reduced
  // motion is gated globally in theme.css.
  liveBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '2px',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    cursor: 'pointer',
    textAlign: 'left',
    transitionProperty: 'background-color, border-color, box-shadow, transform',
    transitionDuration: '150ms',
    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      border: `1px solid ${tokens.colorNeutralStroke1}`,
      boxShadow: 'var(--ce-shadow-hover)',
      transform: 'translateY(-1px)',
    },
    ':active': {
      transform: 'translateY(0)',
      boxShadow: 'var(--ce-shadow-sm)',
    },
    '&:hover [data-tile-chevron]': { color: tokens.colorNeutralForeground2 },
  },
  // "Needs sorting" (untriaged) tile — warning amber, not red (reforge fork #3:
  // untriaged email needs sorting; it is not a blocker).
  liveBtnAttention: {
    ':hover': { border: '1px solid var(--ce-warning-line)' },
  },
  liveIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '34px',
    height: '34px',
    borderRadius: '2px',
    backgroundColor: tokens.colorNeutralBackground3,
    color: 'var(--ce-charcoal)',
    flexShrink: 0,
  },
  liveIconAttention: {
    backgroundColor: 'var(--ce-warning-tint)',
    color: 'var(--ce-warning-text)',
  },
  liveText: { display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 },
  // The tile number stays ink at every severity (the icon chip + hover border
  // carry the "needs sorting" signal).
  liveNumber: {
    fontFamily: 'var(--ce-font-display)',
    fontWeight: 700,
    fontSize: '26px',
    lineHeight: 1,
    color: 'var(--ce-ink)',
  },
  liveLabel: {
    fontSize: '13px',
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
  },
  // Right-centred, always-visible clickability cue (spec §4).
  tileChevron: {
    display: 'inline-flex',
    alignItems: 'center',
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
  },

  /* ----- Region B: throughput — windowed figures + a SEPARATE all-time tile ----- */
  // The windowed strip and the lifetime "Sent to EVA" tile sit side-by-side but are
  // visually distinct surfaces, so a lifetime total is never read as a windowed one.
  thruRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: tokens.spacingHorizontalM,
  },
  thruStrip: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 0,
    flex: '1 1 320px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '2px',
    overflow: 'hidden',
  },
  // Lifetime "Sent to EVA" — its own bordered tile, captioned "All time", set apart
  // from the windowed strip so the metric is honest (work-todo-spike: dashboard-logic).
  // Charcoal identity rail (not severity) + flat/static — no shadow, no chevron:
  // this tile is not clickable (reforge 2026-07-01 §4 static surfaces).
  allTimeTile: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '4px',
    minWidth: '180px',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: '3px solid var(--ce-charcoal)',
    borderRadius: '2px',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  allTimeHead: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    fontFamily: 'var(--ce-font-display)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
  },
  thruCell: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    flex: '1 1 0',
    minWidth: '180px',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    ':last-child': { borderRight: 0 },
  },
  thruIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '30px',
    height: '30px',
    borderRadius: '2px',
    backgroundColor: tokens.colorNeutralBackground3,
    color: 'var(--ce-charcoal)',
    flexShrink: 0,
  },
  thruText: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  thruLabel: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
  },

  /* ----- Region C: needs-action hero list ----- */
  facets: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
  },
  // Facet chip geometry — severity colours come from the shared chip recipes
  // (severityStyles.ts: chipCritical for past-due, chipWarning for
  // duplicate/conflict), merged after this shape class.
  facetChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '3px 10px',
    borderRadius: '2px',
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground1,
  },

  /* Needs-action groups (spec IA §1): verb-led h3 headers carry the reason
     (icon + "<verb> — <count>"); rows are DENSE (~40px, no per-row reason
     icon — the header says why). */
  groups: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  group: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  groupHead: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    margin: 0,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: 'var(--ce-ink)',
  },
  groupIcon: { display: 'inline-flex', color: tokens.colorNeutralForeground2, flexShrink: 0 },
  // Disclosure chevron for the 4th+ groups — the header text itself is NOT
  // clickable (it is a heading, not a nav affordance). 6px padding around the
  // 16px glyph = 28px hit target (headroom over the WCAG 2.5.8 24px floor).
  groupToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    border: 0,
    background: 'none',
    margin: 0,
    padding: '6px',
    borderRadius: '2px',
    cursor: 'pointer',
    color: tokens.colorNeutralForeground3,
    ':hover': { color: tokens.colorNeutralForeground2, backgroundColor: tokens.colorNeutralBackground2 },
  },
  // "Show all <n>" in-place expander — the count is always visible, so a
  // capped group never reads as the whole list (no silent caps).
  showAllBtn: {
    alignSelf: 'flex-start',
    border: 0,
    background: 'none',
    margin: 0,
    padding: '4px 8px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
    ':hover': { color: 'var(--ce-ink)' },
  },

  list: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  /* Row = a WRAPPER (hover/border chrome) around the main open-case button +
     the sibling peek icon-button — a button can't nest a button (M-F). */
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalSNudge} ${tokens.spacingHorizontalL}`,
    borderRadius: '2px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    width: '100%',
    transitionProperty: 'background-color, border-color',
    transitionDuration: tokens.durationFaster,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      border: `1px solid ${tokens.colorNeutralStroke1}`,
    },
    // Reveal the peek icon-button on row hover (it reveals itself on focus).
    '&:hover [data-peek-btn]': { opacity: 1 },
  },
  rowPastDue: {
    borderLeft: '3px solid var(--ce-red)',
    ':hover': { borderLeft: '3px solid var(--ce-red)' },
  },
  // The main open-case hit area — chrome-less button filling the row.
  rowMainBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexGrow: 1,
    minWidth: 0,
    margin: 0,
    padding: 0,
    border: 0,
    background: 'none',
    font: 'inherit',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
  },
  // Peek icon-button — ALWAYS tabbable, revealed on row hover / own focus.
  peekBtn: {
    opacity: 0,
    flexShrink: 0,
    transitionProperty: 'opacity',
    transitionDuration: tokens.durationFaster,
    ':focus': { opacity: 1 },
    ':focus-visible': { opacity: 1 },
  },
  rowSub: {
    color: tokens.colorNeutralForeground3,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowSpacer: { flexGrow: 1 },

  /* age/due pill — severity ramp grey → amber → red */
  agePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '2px 8px',
    borderRadius: '2px',
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  ageInfo: {
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  // Attention pill uses the LIGHTER warning tint (the accent fill is too loud
  // for a per-row pill); the blocker pill comes from chipCritical.
  ageAttention: {
    color: 'var(--ce-warning-ink)',
    backgroundColor: 'var(--ce-warning-tint)',
    border: '1px solid var(--ce-warning-line)',
  },

  chev: { color: tokens.colorNeutralForeground4, flexShrink: 0 },
});

/* ----------  icon per action reason (verbs live in dashboard-needs-action)  ---------- */

const REASON_ICON: Record<ActionReason, LucideIcon> = {
  missing_images: ImageOff,
  missing_instructions: FileWarning,
  duplicate: Copy,
  conflict: GitFork,
  needs_review: AlertTriangle,
};

/** Header icon for a group — the trailing no-reason group reuses the review glyph. */
function groupIcon(reason: ActionReason | null): LucideIcon {
  return reason ? REASON_ICON[reason] : AlertTriangle;
}

/** First N rows shown per group before the "Show all <n>" expander. */
const MAX_GROUP_ROWS = 5;
/** Groups expanded by default; 4th+ collapse to their header. */
const DEFAULT_OPEN_GROUPS = 3;

/* ----------  time formatting  ---------- */

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ----------  screen  ---------- */

export function Dashboard() {
  const styles = useStyles();
  const navigate = useNavigate();

  // The dashboard bundle (liveCounts/throughput/agingExceptions/pipelineStages)
  // is fetched through the data seam. `refetch` re-runs it; `stamp` drives the
  // "Updated HH:MM" affordance (display only — the figures come from the hook).
  // `loading` signals a background refresh (focus/poll) so the header can show a
  // tiny spinner instead of silently swapping numbers.
  const { data: dash, loading, error, refetch } = useDashboard();

  const [stamp, setStamp] = useState<Date>(() => new Date());
  const stampRef = useRef(stamp);
  stampRef.current = stamp;

  const refresh = useCallback(() => {
    setStamp(new Date());
    refetch();
  }, [refetch]);

  // Refresh on window focus + a focus-gated ~75s poll.
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const id = window.setInterval(() => {
      if (document.hasFocus()) refresh();
    }, POLL_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, [refresh]);

  // Restamp the "Updated HH:MM" time whenever fresh data resolves.
  useEffect(() => {
    if (dash) setStamp(new Date());
  }, [dash]);

  const chips = useSeverityChipStyles();

  // Needs-action grouping (pure layer). Disclosure state is per-reason, NOT
  // persisted: 4th+ groups default collapsed; "Show all" is per-group in place.
  const groups = useMemo(() => groupAgingRows(dash?.agingExceptions.rows ?? []), [dash]);
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({});
  const [showAllGroups, setShowAllGroups] = useState<Record<string, boolean>>({});

  /* ----------  quick-peek drawer (spec IA §3) — flattened group order  ---------- */
  const [searchParams, setSearchParams] = useSearchParams();
  const peekId = parsePeek(searchParams.toString());
  const [peekList, setPeekList] = useState<string[]>([]);
  const flatIds = useMemo(() => groups.flatMap((g) => g.rows.map((r) => r.case.id)), [groups]);
  useEffect(() => {
    if (!peekId) setPeekList([]);
  }, [peekId]);
  useEffect(() => {
    // Deep link (?peek= arrived from outside): snapshot once rows load.
    if (peekId && peekList.length === 0 && flatIds.length > 0) setPeekList(flatIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekId, flatIds]);
  const openPeek = useCallback(
    (id: string) => {
      setPeekList(flatIds); // snapshot at open — flattened group order
      setSearchParams(withPeek(searchParams.toString(), id)); // PUSH — Back closes
    },
    [flatIds, searchParams, setSearchParams],
  );
  const closePeek = useCallback(
    () => setSearchParams(withoutPeek(searchParams.toString()), { replace: true }),
    [searchParams, setSearchParams],
  );
  const pagePeek = useCallback(
    (id: string) => setSearchParams(withPeek(searchParams.toString(), id), { replace: true }),
    [searchParams, setSearchParams],
  );

  // First-load (no data yet) — content-shaped skeleton; hard failure — error panel.
  if (!dash) {
    return (
      <div className={mergeClasses('ce-enter', styles.root)}>
        <SectionHeading eyebrow="Overview" heading="Case intake dashboard" />
        {error ? (
          <ErrorState error={error} onRetry={refresh} title="Couldn’t load the dashboard" />
        ) : (
          <DashboardSkeleton />
        )}
      </div>
    );
  }

  const {
    pipelineStages: stages,
    liveCounts: live,
    throughput: thru,
    agingExceptions: aging,
    inbound,
  } = dash;

  // Lifetime "Sent to EVA" — the cumulative submitted count read from throughput
  // (NOT the funnel, which shows live depth only). Rendered in its OWN all-time tile,
  // never mixed into the windowed strip. Falls back to the terminal funnel stage when
  // the windowed source hasn't populated submittedTotal yet.
  const sentToEvaTotal =
    thru.submittedTotal ?? stages.find((s) => s.key === 'submitted')?.count ?? 0;

  return (
    <div className={mergeClasses('ce-enter', styles.root)}>
      <SectionHeading
        eyebrow="Overview"
        heading="Case intake dashboard"
        actions={
          <span className={styles.updated}>
            {loading && <Spinner size="tiny" aria-label="Refreshing" />}
            <span>Updated {fmtTime(stamp)}</span>
            <span aria-hidden>·</span>
            <button type="button" className={mergeClasses('ce-focusable', styles.refreshBtn)} onClick={refresh}>
              <RefreshCw size={13} strokeWidth={2} aria-hidden />
              Refresh
            </button>
          </span>
        }
      />

      <div className={styles.srOnly} aria-live="polite">
        {loading ? 'Refreshing dashboard…' : `Dashboard updated at ${fmtTime(stamp)}`}
      </div>

      {/* INTAKE PIPELINE — full-width funnel + held bar */}
      <section className={styles.region} aria-labelledby="heading-pipeline">
        <h2 className={mergeClasses('ce-overline', styles.regionHeading)} id="heading-pipeline">
          Intake pipeline
        </h2>
        <PipelineStrip
          stages={stages}
          variant="hero"
          onStageSelect={(key) => {
            const to = STAGE_ROUTE[key];
            if (to) navigate(to);
          }}
        />
        {live.held > 0 && (
          <button
            type="button"
            className={mergeClasses('ce-focusable', styles.exceptionBar)}
            onClick={() => navigate('/queue/held')}
          >
            <AlertOctagon size={18} strokeWidth={2} aria-hidden />
            <span className={styles.exceptionText}>
              {live.held} case{live.held === 1 ? '' : 's'} held — can’t pass through (missing the
              basics), a possible duplicate, or on hold. Open Held.
            </span>
            <ChevronRight size={18} aria-hidden />
          </button>
        )}
      </section>

      {/* Split cockpit: exceptions left · inbox + throughput right */}
      <div className={styles.cockpitGrid}>
        <div className={styles.cockpitMain}>
          <section className={styles.region} aria-labelledby="heading-needs-action">
            <h2 className={mergeClasses('ce-overline', styles.regionHeading)} id="heading-needs-action">
              Needs action — oldest first
            </h2>

            {aging.rows.length > 0 && (
              <div className={styles.facets}>
                {aging.pastDueCount > 0 && (
                  <span className={mergeClasses(styles.facetChip, chips.chipCritical)}>
                    <AlertTriangle size={12} strokeWidth={2.25} aria-hidden />
                    {aging.pastDueCount} past due
                  </span>
                )}
                {aging.duplicateCount > 0 && (
                  <span className={mergeClasses(styles.facetChip, chips.chipWarning)}>
                    <Copy size={12} strokeWidth={2.25} aria-hidden />
                    {aging.duplicateCount} duplicate
                  </span>
                )}
                {aging.conflictCount > 0 && (
                  <span className={mergeClasses(styles.facetChip, chips.chipWarning)}>
                    <GitFork size={12} strokeWidth={2.25} aria-hidden />
                    {aging.conflictCount} conflict
                  </span>
                )}
              </div>
            )}

            {aging.rows.length === 0 ? (
              <EmptyState
                icon={<CircleCheck size={32} strokeWidth={1.75} aria-hidden />}
                title={`Nothing waiting. New cases land here as email arrives — last checked ${fmtTime(stamp)}.`}
                // Conditional quick action (spec IA §5): untriaged email first,
                // else the review queue, else nothing to point at.
                action={
                  inbound.untriaged > 0 ? (
                    <Button
                      appearance="secondary"
                      onClick={() => navigate('/inbox?view=active&triageState=new')}
                    >
                      Sort new email ({inbound.untriaged})
                    </Button>
                  ) : live.review > 0 ? (
                    <Button appearance="secondary" onClick={() => navigate('/queue/review')}>
                      Review cases ready to send ({live.review})
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className={styles.groups}>
                {groups.map((group, index) => {
                  const key = group.reason ?? 'review-case';
                  const open = openOverrides[key] ?? index < DEFAULT_OPEN_GROUPS;
                  return (
                    <NeedsActionGroupSection
                      key={key}
                      group={group}
                      collapsible={index >= DEFAULT_OPEN_GROUPS}
                      open={open}
                      showAll={showAllGroups[key] ?? false}
                      onToggleOpen={() => setOpenOverrides((prev) => ({ ...prev, [key]: !open }))}
                      onShowAll={() => setShowAllGroups((prev) => ({ ...prev, [key]: true }))}
                      onOpenCase={(id) => navigate(`/case/${id}`)}
                      onPeekCase={openPeek}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className={styles.cockpitSide}>
          <section className={styles.region} aria-labelledby="heading-inbox">
            <h2 className={mergeClasses('ce-overline', styles.regionHeading)} id="heading-inbox">
              Inbox
            </h2>
            <div className={styles.liveStrip}>
              <InboxTile
                icon={Briefcase}
                value={inbound.receiving_work}
                label="Receiving work"
                onOpen={() => navigate('/inbox?category=receiving_work&view=active')}
              />
              <InboxTile
                icon={MailQuestion}
                value={inbound.query}
                label="Queries"
                onOpen={() => navigate('/inbox?category=query&view=active')}
              />
              <InboxTile
                icon={Mail}
                value={inbound.other}
                label="Other"
                onOpen={() => navigate('/inbox?category=other&view=active')}
              />
              <InboxTile
                icon={AlertCircle}
                value={inbound.untriaged}
                label="Needs sorting"
                attention={inbound.untriaged > 0}
                onOpen={() => navigate('/inbox?view=active&triageState=new')}
              />
            </div>
          </section>

          <section className={styles.region} aria-labelledby="heading-throughput">
            <h2 className={mergeClasses('ce-overline', styles.regionHeading)} id="heading-throughput">
              Today / this week
            </h2>
            <div className={styles.thruRow}>
              <div className={styles.thruStrip}>
                <ThruCell icon={Inbox} value={thru.inToday} label="In today" />
                <ThruCell icon={Send} value={thru.submittedToday} label="Submitted today" />
                <ThruCell icon={CalendarRange} value={thru.clearedThisWeek} label="Cleared this week" />
              </div>
              <div className={styles.allTimeTile}>
                <span className={styles.allTimeHead}>
                  <CheckCheck size={12} strokeWidth={2} aria-hidden /> All time
                </span>
                <span className="ce-stat">{sentToEvaTotal}</span>
                <span className={styles.thruLabel}>Sent to EVA</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Quick-peek drawer — ?peek=<caseId> on the dashboard route; Prev/Next
          walk the FLATTENED group order snapshotted at open (spec IA §3). */}
      <CasePeekDrawer
        caseId={peekId}
        prevId={peekId ? nextPeekId(peekList, peekId, -1) : null}
        nextId={peekId ? nextPeekId(peekList, peekId, 1) : null}
        onPeek={pagePeek}
        onClose={closePeek}
        onOpenCase={(id) => navigate(`/case/${id}`, { replace: true })}
      />
    </div>
  );
}

/* (Region A "drainable now" tiles removed — review dashboard Area 1: they
   overlapped the funnel above and the wording was poor. The re-cut clickable
   PipelineStrip carries the live depth + navigation now.) */

/* ----------  Region B cell  ---------- */

function ThruCell({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  const styles = useStyles();
  return (
    <div className={styles.thruCell}>
      <span className={styles.thruIcon} aria-hidden>
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <span className={styles.thruText}>
        <span className="ce-stat">{value}</span>
        <span className={styles.thruLabel}>{label}</span>
      </span>
    </div>
  );
}

/* ----------  Section 2 inbox tile (clickable → /inbox)  ---------- */

function InboxTile({
  icon: Icon,
  value,
  label,
  attention,
  onOpen,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
  /** Warning-amber treatment ("Needs sorting" with a backlog) — never red. */
  attention?: boolean;
  onOpen: () => void;
}) {
  const styles = useStyles();
  return (
    <button
      type="button"
      className={mergeClasses('ce-focusable', styles.liveBtn, attention && styles.liveBtnAttention)}
      onClick={onOpen}
      aria-label={`${label}: ${value}. Open inbox.`}
    >
      <span className={mergeClasses(styles.liveIcon, attention && styles.liveIconAttention)} aria-hidden>
        <Icon size={18} strokeWidth={1.85} />
      </span>
      <span className={styles.liveText}>
        <span className={styles.liveNumber}>{value}</span>
        <span className={styles.liveLabel}>{label}</span>
      </span>
      <span className={styles.tileChevron} data-tile-chevron aria-hidden>
        <ChevronRight size={14} strokeWidth={2} />
      </span>
    </button>
  );
}

/* ----------  Region C: needs-action group + dense row (spec IA §1)  ---------- */

function NeedsActionGroupSection({
  group,
  collapsible,
  open,
  showAll,
  onToggleOpen,
  onShowAll,
  onOpenCase,
  onPeekCase,
}: {
  group: NeedsActionGroup;
  /** 4th+ groups collapse to their header (chevron toggle, not persisted). */
  collapsible: boolean;
  open: boolean;
  showAll: boolean;
  onToggleOpen: () => void;
  onShowAll: () => void;
  onOpenCase: (caseId: string) => void;
  onPeekCase: (caseId: string) => void;
}) {
  const styles = useStyles();
  const Icon = groupIcon(group.reason);
  const count = group.rows.length;
  const bodyId = `needs-action-rows-${group.reason ?? 'review-case'}`;
  const visible = showAll ? group.rows : group.rows.slice(0, MAX_GROUP_ROWS);

  // "Show all" unmounts its own button — move keyboard focus to the FIRST
  // newly-revealed row on a genuine expand (not on a mount that already has
  // showAll set), so focus never drops to <body>.
  const firstRevealedRef = useRef<HTMLButtonElement | null>(null);
  const prevShowAll = useRef(showAll);
  useEffect(() => {
    if (showAll && !prevShowAll.current) firstRevealedRef.current?.focus();
    prevShowAll.current = showAll;
  }, [showAll]);

  return (
    <div className={styles.group}>
      {/* h3, NOT clickable — the disclosure chevron (4th+ groups) is its own
          small button; the count is always visible even when collapsed. */}
      <h3 className={styles.groupHead}>
        <span className={styles.groupIcon} aria-hidden>
          <Icon size={16} strokeWidth={1.85} />
        </span>
        <span>
          {group.verb} — {count}
        </span>
        {collapsible && (
          <button
            type="button"
            className={mergeClasses('ce-focusable', styles.groupToggle)}
            aria-expanded={open}
            // Only reference the body while it is actually rendered.
            aria-controls={open ? bodyId : undefined}
            aria-label={open ? `Collapse “${group.verb}”` : `Expand “${group.verb}” (${count})`}
            onClick={onToggleOpen}
          >
            {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
          </button>
        )}
      </h3>

      {open && (
        <div className={styles.list} id={bodyId}>
          {visible.map((row, index) => (
            <AgingRowItem
              key={row.case.id}
              ref={index === MAX_GROUP_ROWS ? firstRevealedRef : undefined}
              row={row}
              verb={group.verb}
              onOpen={() => onOpenCase(row.case.id)}
              onPeek={() => onPeekCase(row.case.id)}
            />
          ))}
          {!showAll && count > MAX_GROUP_ROWS && (
            <button
              type="button"
              className={mergeClasses('ce-focusable', styles.showAllBtn)}
              onClick={onShowAll}
            >
              Show all {count}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Dense (~40px) needs-action row: VRM plate → vehicle · provider → due pill
    (only when a due date exists — absence is the signal) → peek icon-button →
    chevron. The verb lives on the group header; no per-row reason icon.
    STRUCTURE (M-F): a wrapper div carries the row chrome; the open-case hit
    area is a chrome-less button (a button can't nest the peek button); the
    peek icon-button is its sibling. forwardRef targets the MAIN button (the
    "Show all" focus move + the drawer's focus restore both want it). */
const AgingRowItem = forwardRef<
  HTMLButtonElement,
  { row: AgingRow; verb: string; onOpen: () => void; onPeek: () => void }
>(function AgingRowItem({ row, verb, onOpen, onPeek }, ref) {
  const styles = useStyles();
  const chips = useSeverityChipStyles();
  const c = row.case;
  const sev = ageSeverity(row);
  const pill = duePillText(row);
  const ageCls =
    sev === 'blocker' ? chips.chipCritical : sev === 'attention' ? styles.ageAttention : styles.ageInfo;
  // Join with "·" only when both sides exist — no dangling separator when the
  // provider (or model) is missing.
  const subText = [c.vehicleModel || 'Vehicle TBC', c.provider].filter(Boolean).join(' · ');
  const subAria = [c.vehicleModel || 'vehicle TBC', c.provider].filter(Boolean).join(' · ');
  // VRM-less rows never yield degenerate names (gatekeeper F3) — the ONE
  // fallback chain, shared with the queue grids so they can't drift.
  const rowName = caseDisplayName(c);

  return (
    <div className={mergeClasses(styles.row, row.pastDue && styles.rowPastDue)}>
      <button
        ref={ref}
        type="button"
        data-case-row={c.id}
        className={mergeClasses('ce-focusable', styles.rowMainBtn)}
        onClick={onOpen}
        aria-label={`${verb}. ${rowName}, ${subAria}. ${dueText(row)}. Open case.`}
      >
        <VrmPlate vrm={c.vrm} size="small" />
        <Caption1 className={styles.rowSub}>{subText}</Caption1>
        <span className={styles.rowSpacer} aria-hidden />
        {pill && <span className={mergeClasses(styles.agePill, ageCls)}>{pill}</span>}
      </button>
      <Button
        appearance="subtle"
        size="small"
        data-peek-btn
        className={styles.peekBtn}
        icon={<Eye size={16} />}
        aria-label={`Preview ${rowName}`}
        onClick={onPeek}
      />
      <ChevronRight size={16} className={styles.chev} aria-hidden />
    </div>
  );
});

export default Dashboard;

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '@fluentui/react-components';
import {
  Caption1,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  RefreshCw,
  AlertOctagon,
  ChevronRight,
  CircleCheck,
  CheckCheck,
  Inbox,
  Send,
  CalendarRange,
  Copy,
  GitFork,
  ImageOff,
  FileWarning,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';

import { SectionHeading, PipelineStrip, VrmPlate, EmptyState, ErrorState, DashboardSkeleton } from '../components';
import { useDashboard } from '../data';
import type { ActionReason, AgingRow, PipelineStageKey } from '../data';

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
    gap: tokens.spacingVerticalXXL,
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
    padding: '2px 4px',
    borderRadius: '2px',
    cursor: 'pointer',
    color: tokens.colorNeutralForeground2,
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    ':hover': { color: 'var(--ce-red)' },
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
    transitionProperty: 'background-color, border-color',
    transitionDuration: tokens.durationFaster,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      border: `1px solid ${tokens.colorNeutralStroke1}`,
    },
  },
  liveBtnBlocker: {
    ':hover': { border: '1px solid var(--ce-red)' },
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
  liveIconBlocker: {
    backgroundColor: 'var(--ce-red-tint)',
    color: 'var(--ce-red)',
  },
  liveText: { display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 },
  liveNumber: {
    fontFamily: 'var(--ce-font-display)',
    fontWeight: 700,
    fontSize: '26px',
    lineHeight: 1,
    color: 'var(--ce-ink)',
  },
  liveNumberBlocker: { color: 'var(--ce-red)' },
  liveLabel: {
    fontSize: '13px',
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
  },

  /* ----- Region B: throughput — inline windowed figures ----- */
  thruStrip: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 0,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '2px',
    overflow: 'hidden',
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
  facetBlocker: {
    color: '#ffffff',
    backgroundColor: 'var(--ce-red-dark)',
    border: '1px solid var(--ce-red-dark)',
  },
  facetAttention: {
    color: 'var(--ce-amber-ink)',
    backgroundColor: 'var(--ce-amber)',
    border: '1px solid var(--ce-amber-line)',
  },

  list: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderRadius: '2px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    transitionProperty: 'background-color, border-color',
    transitionDuration: tokens.durationFaster,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      border: `1px solid ${tokens.colorNeutralStroke1}`,
    },
  },
  rowPastDue: {
    borderLeft: '3px solid var(--ce-red)',
    ':hover': { borderLeft: '3px solid var(--ce-red)' },
  },
  rowIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '2px',
    flexShrink: 0,
    backgroundColor: tokens.colorNeutralBackground3,
    color: 'var(--ce-charcoal)',
  },
  rowIconBlocker: { backgroundColor: 'var(--ce-red-tint)', color: 'var(--ce-red)' },
  rowMain: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flexGrow: 1 },
  rowVerb: {
    fontSize: '15px',
    fontWeight: tokens.fontWeightSemibold,
    color: 'var(--ce-ink)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowMeta: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  rowSub: { color: tokens.colorNeutralForeground3 },

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
  ageAttention: {
    color: 'var(--ce-amber-ink)',
    backgroundColor: 'var(--ce-amber-tint)',
    border: '1px solid var(--ce-amber-line)',
  },
  ageBlocker: {
    color: '#ffffff',
    backgroundColor: 'var(--ce-red-dark)',
    border: '1px solid var(--ce-red-dark)',
  },

  chev: { color: tokens.colorNeutralForeground4, flexShrink: 0 },
});

/* ----------  verb + icon per action reason  ---------- */

const REASON_VERB: Record<ActionReason, string> = {
  missing_images: 'Chase garage for images',
  missing_instructions: 'Chase provider for instructions',
  duplicate: 'Resolve duplicate',
  conflict: 'Resolve claimant-name conflict before submit',
  needs_review: 'Review the details',
};

const REASON_ICON: Record<ActionReason, LucideIcon> = {
  missing_images: ImageOff,
  missing_instructions: FileWarning,
  duplicate: Copy,
  conflict: GitFork,
  needs_review: AlertTriangle,
};

/* ----------  time + due formatting  ---------- */

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Severity for an aging row: greys (future/ample) → amber (≤2d) → red (past-due). */
function ageSeverity(row: AgingRow): 'info' | 'attention' | 'blocker' {
  if (row.pastDue) return 'blocker';
  if (Number.isFinite(row.daysToDue) && row.daysToDue <= 2) return 'attention';
  return 'info';
}

/** "3d past due · 12/06" / "Due today · 17/06" / "Due in 4d · 21/06". */
function dueText(row: AgingRow): string {
  const due = row.case.dateDue;
  const tail = due ? ` · ${due.slice(0, 5)}` : '';
  if (!Number.isFinite(row.daysToDue)) return 'No due date';
  const n = row.daysToDue;
  if (n < 0) return `${Math.abs(n)}d past due${tail}`;
  if (n === 0) return `Due today${tail}`;
  return `Due in ${n}d${tail}`;
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

  const { pipelineStages: stages, liveCounts: live, throughput: thru, agingExceptions: aging } = dash;

  // Cumulative "Sent to EVA" total — the funnel's terminal stage (eva_submitted +
  // box_synced), lifted out of the hero into the windowed strip so the funnel
  // shows live depth only. It is a running lifetime total (no time window),
  // hence "(total)" beside the windowed "Submitted today".
  const sentToEvaTotal = stages.find((s) => s.key === 'submitted')?.count ?? 0;

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

      {/* HERO: the re-cut funnel — the LIVE-DEPTH backlog only (New → Not ready →
          Review), clickable. The cumulative terminal total moved to the windowed
          throughput strip below ("Sent to EVA (total)"), so the funnel is purely
          open-cases depth. Replaces the old strip + the "drainable now" tiles. */}
      <PipelineStrip
        stages={stages}
        variant="hero"
        caption="Open cases by stage"
        onStageSelect={(key) => {
          const to = STAGE_ROUTE[key];
          if (to) navigate(to);
        }}
      />

      {/* Held — can't pass through automatically, a possible duplicate, or on hold */}
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

      {/* REGION B — TODAY / THIS WEEK (windowed throughput, never lifetime) */}
      <section className={styles.region} aria-label="Today and this week">
        <span className="ce-overline">Today / this week</span>
        <div className={styles.thruStrip}>
          <ThruCell icon={Inbox} value={thru.inToday} label="In today" />
          <ThruCell icon={Send} value={thru.submittedToday} label="Submitted today" />
          <ThruCell icon={CheckCheck} value={sentToEvaTotal} label="Sent to EVA (total)" />
          <ThruCell icon={CalendarRange} value={thru.clearedThisWeek} label="Cleared this week" />
        </div>
      </section>

      {/* REGION C — NEEDS ACTION (the hero list) */}
      <section className={styles.region} aria-label="Needs action">
        <span className="ce-overline">Needs action — oldest first</span>

        {/* exception chips */}
        {aging.rows.length > 0 && (
          <div className={styles.facets}>
            {aging.pastDueCount > 0 && (
              <span className={mergeClasses(styles.facetChip, styles.facetBlocker)}>
                <AlertTriangle size={12} strokeWidth={2.25} aria-hidden />
                {aging.pastDueCount} past due
              </span>
            )}
            {aging.duplicateCount > 0 && (
              <span className={mergeClasses(styles.facetChip, styles.facetAttention)}>
                <Copy size={12} strokeWidth={2.25} aria-hidden />
                {aging.duplicateCount} duplicate
              </span>
            )}
            {aging.conflictCount > 0 && (
              <span className={mergeClasses(styles.facetChip, styles.facetAttention)}>
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
          />
        ) : (
          <div className={styles.list}>
            {aging.rows.map((row) => (
              <AgingRowItem
                key={row.case.id}
                row={row}
                onOpen={() => navigate(`/case/${row.case.id}`)}
              />
            ))}
          </div>
        )}
      </section>
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

/* ----------  Region C row  ---------- */

function AgingRowItem({ row, onOpen }: { row: AgingRow; onOpen: () => void }) {
  const styles = useStyles();
  const c = row.case;
  const reason = row.reason;
  const Icon = reason ? REASON_ICON[reason] : AlertTriangle;
  const verb = reason ? REASON_VERB[reason] : 'Review case';
  const sev = ageSeverity(row);
  const ageCls =
    sev === 'blocker' ? styles.ageBlocker : sev === 'attention' ? styles.ageAttention : styles.ageInfo;

  return (
    <button
      type="button"
      className={mergeClasses('ce-focusable', styles.row, row.pastDue && styles.rowPastDue)}
      onClick={onOpen}
      aria-label={`${verb}. ${c.vrm}, ${c.vehicleModel || 'vehicle TBC'}. ${dueText(row)}. Open case.`}
    >
      <span
        className={mergeClasses(styles.rowIcon, row.pastDue && styles.rowIconBlocker)}
        aria-hidden
      >
        <Icon size={17} strokeWidth={1.85} />
      </span>

      <span className={styles.rowMain}>
        <span className={styles.rowVerb}>{verb}</span>
        <span className={styles.rowMeta}>
          <VrmPlate vrm={c.vrm} size="small" />
          <Caption1 className={styles.rowSub}>
            {c.vehicleModel || 'Vehicle TBC'} · {c.provider}
          </Caption1>
        </span>
      </span>

      <span className={mergeClasses(styles.agePill, ageCls)}>{dueText(row)}</span>
      <ChevronRight size={18} className={styles.chev} aria-hidden />
    </button>
  );
}

export default Dashboard;

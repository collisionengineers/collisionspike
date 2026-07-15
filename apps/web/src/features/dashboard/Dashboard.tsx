import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import {
  AlertCircle,
  AlertOctagon,
  Briefcase,
  CalendarRange,
  ChevronRight,
  Eye,
  FileWarning,
  Inbox,
  Mail,
  MailQuestion,
  RefreshCw,
  Send,
  type LucideIcon,
} from 'lucide-react';

import { DashboardSkeleton, ErrorState, SectionHeading } from '../../shared/ui';
import { useDashboard, useInboundCounts } from '../../data';
import type { InboundCounts, QueueName, Throughput } from '../../data';
import {
  DASHBOARD_LAYOUT,
  dashboardQueueCards,
  type DashboardQueueCard,
} from './dashboard-layout';

const POLL_MS = 75_000;
const CONTENT_MAX = 1280;

const QUEUE_ICON: Record<QueueName, LucideIcon> = {
  'not-ready': FileWarning,
  review: Eye,
  held: AlertOctagon,
};

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXL,
    width: '100%',
    maxWidth: `${CONTENT_MAX}px`,
    marginLeft: 'auto',
    marginRight: 'auto',
  },
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
    gap: tokens.spacingHorizontalXS,
    minHeight: '32px',
    margin: 0,
    padding: '6px 10px',
    border: 0,
    borderRadius: '2px',
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground2,
    cursor: 'pointer',
    font: 'inherit',
    fontWeight: tokens.fontWeightSemibold,
    ':hover': {
      color: 'var(--ce-ink)',
      textDecoration: 'underline',
      textUnderlineOffset: '2px',
    },
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
  region: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minWidth: 0,
  },
  regionHeading: {
    margin: 0,
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontWeight: 'inherit',
  },
  queueGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: tokens.spacingHorizontalL,
    [`@media (min-width: ${DASHBOARD_LAYOUT.primaryThreeColumnMinWidth}px)`]: {
      gridTemplateColumns: `repeat(${DASHBOARD_LAYOUT.primaryCardCount}, minmax(0, 1fr))`,
    },
  },
  queueCard: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
    minWidth: 0,
    minHeight: '128px',
    width: '100%',
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXL}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderTop: '4px solid var(--ce-charcoal)',
    borderRadius: '3px',
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    boxShadow: 'var(--ce-shadow-sm)',
    cursor: 'pointer',
    textAlign: 'left',
    transitionProperty: 'border-color, box-shadow, transform, background-color',
    transitionDuration: '150ms',
    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      boxShadow: 'var(--ce-shadow-hover)',
      transform: 'translateY(-1px)',
    },
    ':active': {
      boxShadow: 'var(--ce-shadow-sm)',
      transform: 'translateY(0)',
    },
    '&:hover [data-card-chevron]': { color: tokens.colorNeutralForeground2 },
  },
  queueCardNotReady: { borderTopColor: 'var(--ce-warning-text)' },
  queueCardReview: { borderTopColor: 'var(--ce-info-ink)' },
  queueCardHeld: { borderTopColor: 'var(--ce-red)' },
  queueIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '44px',
    height: '44px',
    flexShrink: 0,
    borderRadius: '2px',
    backgroundColor: tokens.colorNeutralBackground3,
    color: 'var(--ce-charcoal)',
  },
  queueIconNotReady: {
    backgroundColor: 'var(--ce-warning-tint)',
    color: 'var(--ce-warning-text)',
  },
  queueIconReview: {
    backgroundColor: 'var(--ce-info-tint)',
    color: 'var(--ce-info-ink)',
  },
  queueIconHeld: {
    backgroundColor: 'var(--ce-red-tint)',
    color: 'var(--ce-red-dark)',
  },
  queueText: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    minWidth: 0,
  },
  queueNumber: {
    color: 'var(--ce-ink)',
    fontFamily: 'var(--ce-font-display)',
    fontSize: '36px',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
  },
  queueLabel: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: 1.25,
  },
  cardChevron: {
    display: 'inline-flex',
    flexShrink: 0,
    marginLeft: 'auto',
    color: tokens.colorNeutralForeground3,
  },
  secondaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: tokens.spacingHorizontalXL,
    alignItems: 'stretch',
    [`@media (min-width: ${DASHBOARD_LAYOUT.secondaryTwoColumnMinWidth}px)`]: {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minWidth: 0,
    minHeight: '280px',
    padding: tokens.spacingHorizontalXL,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '3px',
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: 'var(--ce-shadow-sm)',
  },
  tileGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: tokens.spacingHorizontalM,
    flexGrow: 1,
    [`@media (min-width: ${DASHBOARD_LAYOUT.tileTwoColumnMinWidth}px)`]: {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
  },
  tile: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    minWidth: 0,
    minHeight: '92px',
    width: '100%',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '2px',
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    textAlign: 'left',
  },
  tileButton: {
    cursor: 'pointer',
    transitionProperty: 'background-color, border-color, box-shadow, transform',
    transitionDuration: '150ms',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      border: `1px solid ${tokens.colorNeutralStroke1}`,
      boxShadow: 'var(--ce-shadow-hover)',
      transform: 'translateY(-1px)',
    },
    '&:hover [data-card-chevron]': { color: tokens.colorNeutralForeground2 },
  },
  tileAttention: { border: '1px solid var(--ce-warning-line)' },
  tileWide: {
    [`@media (min-width: ${DASHBOARD_LAYOUT.tileTwoColumnMinWidth}px)`]: {
      gridColumn: '1 / -1',
    },
  },
  tileIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '34px',
    height: '34px',
    flexShrink: 0,
    borderRadius: '2px',
    backgroundColor: tokens.colorNeutralBackground3,
    color: 'var(--ce-charcoal)',
  },
  tileIconAttention: {
    backgroundColor: 'var(--ce-warning-tint)',
    color: 'var(--ce-warning-text)',
  },
  tileText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  tileNumber: {
    color: 'var(--ce-ink)',
    fontFamily: 'var(--ce-font-display)',
    fontSize: '26px',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
  },
  tileLabel: {
    color: tokens.colorNeutralForeground2,
    fontSize: '13px',
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: 1.25,
    overflowWrap: 'anywhere',
  },
  panelStatus: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    minHeight: '208px',
    padding: tokens.spacingHorizontalL,
    color: tokens.colorNeutralForeground2,
    textAlign: 'center',
  },
  panelError: {
    border: '1px solid var(--ce-critical-line)',
    borderRadius: '2px',
    backgroundColor: 'var(--ce-red-tint)',
    color: 'var(--ce-red-dark)',
  },
  retryBtn: {
    minHeight: '40px',
    padding: `0 ${tokens.spacingHorizontalL}`,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: '2px',
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    cursor: 'pointer',
    font: 'inherit',
    fontWeight: tokens.fontWeightSemibold,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  refreshing: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
    fontSize: '12px',
  },
});

function fmtTime(value: Date): string {
  return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export interface DashboardOverviewProps {
  queueCounts: Record<QueueName, number>;
  throughput: Throughput;
  inboundCounts?: InboundCounts;
  inboundLoading: boolean;
  inboundError?: Error;
  onRetryInbound: () => void;
  onNavigate: (route: string) => void;
}

/** Loaded dashboard body, exported so its structure can be contract-tested. */
export function DashboardOverview({
  queueCounts,
  throughput,
  inboundCounts,
  inboundLoading,
  inboundError,
  onRetryInbound,
  onNavigate,
}: DashboardOverviewProps) {
  const styles = useStyles();
  const queues = dashboardQueueCards(queueCounts);

  return (
    <>
      <section className={styles.region} aria-labelledby="dashboard-queue-heading" data-dashboard-region="primary-queues">
        <h2 className={mergeClasses('ce-overline', styles.regionHeading)} id="dashboard-queue-heading">
          Case queues
        </h2>
        <div className={styles.queueGrid} data-layout="one-to-three-columns">
          {queues.map((queue) => (
            <QueueCard key={queue.name} queue={queue} onOpen={() => onNavigate(queue.route)} />
          ))}
        </div>
      </section>

      <div className={styles.secondaryGrid} data-layout="one-to-two-columns">
        <section
          className={styles.panel}
          aria-labelledby="dashboard-inbox-heading"
          aria-busy={inboundLoading || undefined}
          data-dashboard-region="inbox"
        >
          <h2 className={mergeClasses('ce-overline', styles.regionHeading)} id="dashboard-inbox-heading">
            Inbox
          </h2>
          {inboundError ? (
            <div className={mergeClasses(styles.panelStatus, styles.panelError)} role="alert">
              <AlertCircle size={26} strokeWidth={1.75} aria-hidden />
              <span>Couldn’t load inbox totals.</span>
              <button
                type="button"
                className={mergeClasses('ce-focusable', styles.retryBtn)}
                onClick={onRetryInbound}
              >
                Try again
              </button>
            </div>
          ) : !inboundCounts ? (
            <div className={styles.panelStatus} aria-label="Loading inbox totals">
              <Spinner size="small" aria-hidden />
              <span>Loading inbox totals…</span>
            </div>
          ) : (
            <>
              {inboundLoading && (
                <span className={styles.refreshing}>
                  <Spinner size="tiny" aria-hidden />
                  Refreshing inbox totals…
                </span>
              )}
              <div className={styles.tileGrid}>
                <MetricTile
                  icon={Briefcase}
                  value={inboundCounts.receiving_work}
                  label="Receiving work"
                  onOpen={() => onNavigate('/inbox?type=receiving_work')}
                />
                <MetricTile
                  icon={MailQuestion}
                  value={inboundCounts.query}
                  label="Queries"
                  onOpen={() => onNavigate('/inbox?type=query')}
                />
                <MetricTile
                  icon={Mail}
                  value={inboundCounts.other}
                  label="Other"
                  onOpen={() => onNavigate('/inbox?type=other')}
                />
                <MetricTile
                  icon={AlertCircle}
                  value={inboundCounts.untriaged}
                  label="Needs sorting"
                  attention={inboundCounts.untriaged > 0}
                  onOpen={() => onNavigate('/inbox')}
                />
              </div>
            </>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="dashboard-throughput-heading" data-dashboard-region="throughput">
          <h2 className={mergeClasses('ce-overline', styles.regionHeading)} id="dashboard-throughput-heading">
            Today / this week
          </h2>
          <div className={styles.tileGrid}>
            <MetricTile icon={Inbox} value={throughput.inToday} label="In today" />
            <MetricTile
              icon={Send}
              value={throughput.submittedToday}
              label="Submitted today"
              onOpen={() => onNavigate('/completed')}
            />
            <MetricTile
              icon={CalendarRange}
              value={throughput.clearedThisWeek}
              label="Cleared this week"
              wide
              onOpen={() => onNavigate('/completed')}
            />
          </div>
        </section>
      </div>
    </>
  );
}

export function Dashboard() {
  const styles = useStyles();
  const navigate = useNavigate();
  const dashboard = useDashboard();
  const inbound = useInboundCounts();
  const [stamp, setStamp] = useState(() => new Date());

  const refresh = useCallback(() => {
    dashboard.refetch();
    inbound.refetch();
  }, [dashboard.refetch, inbound.refetch]);

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

  useEffect(() => {
    if (dashboard.data && !dashboard.error) setStamp(new Date());
  }, [dashboard.data, dashboard.error]);

  const refreshing = dashboard.loading || inbound.loading;

  if (dashboard.error) {
    return (
      <div className={mergeClasses('ce-enter', styles.root)}>
        <SectionHeading eyebrow="Overview" heading="Case intake dashboard" />
        <ErrorState onRetry={refresh} title="Couldn’t load the dashboard" />
      </div>
    );
  }

  if (!dashboard.data) {
    return (
      <div className={mergeClasses('ce-enter', styles.root)}>
        <SectionHeading eyebrow="Overview" heading="Case intake dashboard" />
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className={mergeClasses('ce-enter', styles.root)}>
      <SectionHeading
        eyebrow="Overview"
        heading="Case intake dashboard"
        actions={
          <span className={styles.updated}>
            {refreshing && <Spinner size="tiny" aria-label="Refreshing" />}
            <span>Updated {fmtTime(stamp)}</span>
            <span aria-hidden>·</span>
            <button
              type="button"
              className={mergeClasses('ce-focusable', styles.refreshBtn)}
              onClick={refresh}
            >
              <RefreshCw size={13} strokeWidth={2} aria-hidden />
              Refresh
            </button>
          </span>
        }
      />

      <div className={styles.srOnly} aria-live="polite">
        {refreshing ? 'Refreshing dashboard…' : `Dashboard updated at ${fmtTime(stamp)}`}
      </div>

      <DashboardOverview
        queueCounts={dashboard.data.queueCounts}
        throughput={dashboard.data.throughput}
        inboundCounts={inbound.data}
        inboundLoading={inbound.loading}
        inboundError={inbound.error}
        onRetryInbound={inbound.refetch}
        onNavigate={navigate}
      />
    </div>
  );
}

export default Dashboard;

function QueueCard({ queue, onOpen }: { queue: DashboardQueueCard; onOpen: () => void }) {
  const styles = useStyles();
  const Icon = QUEUE_ICON[queue.name];
  const toneClass = {
    'not-ready': styles.queueCardNotReady,
    review: styles.queueCardReview,
    held: styles.queueCardHeld,
  }[queue.name];
  const iconToneClass = {
    'not-ready': styles.queueIconNotReady,
    review: styles.queueIconReview,
    held: styles.queueIconHeld,
  }[queue.name];

  return (
    <button
      type="button"
      className={mergeClasses('ce-focusable', styles.queueCard, toneClass)}
      onClick={onOpen}
      aria-label={`${queue.label}: ${queue.count} case${queue.count === 1 ? '' : 's'}. Open ${queue.label} queue.`}
      data-dashboard-queue={queue.name}
      data-route={queue.route}
    >
      <span className={mergeClasses(styles.queueIcon, iconToneClass)} aria-hidden>
        <Icon size={22} strokeWidth={1.85} />
      </span>
      <span className={styles.queueText}>
        <span className={styles.queueNumber}>{queue.count}</span>
        <span className={styles.queueLabel}>{queue.label}</span>
      </span>
      <span className={styles.cardChevron} data-card-chevron aria-hidden>
        <ChevronRight size={18} strokeWidth={2} />
      </span>
    </button>
  );
}

function MetricTile({
  icon: Icon,
  value,
  label,
  attention,
  wide,
  onOpen,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
  attention?: boolean;
  wide?: boolean;
  onOpen?: () => void;
}) {
  const styles = useStyles();
  const content = (
    <>
      <span className={mergeClasses(styles.tileIcon, attention && styles.tileIconAttention)} aria-hidden>
        <Icon size={18} strokeWidth={1.85} />
      </span>
      <span className={styles.tileText}>
        <span className={styles.tileNumber}>{value}</span>
        <span className={styles.tileLabel}>{label}</span>
      </span>
      {onOpen && (
        <span className={styles.cardChevron} data-card-chevron aria-hidden>
          <ChevronRight size={15} strokeWidth={2} />
        </span>
      )}
    </>
  );
  const className = mergeClasses(
    styles.tile,
    onOpen && styles.tileButton,
    attention && styles.tileAttention,
    wide && styles.tileWide,
  );

  if (!onOpen) return <div className={className}>{content}</div>;
  return (
    <button
      type="button"
      className={mergeClasses('ce-focusable', className)}
      onClick={onOpen}
      aria-label={`${label}: ${value}. Open details.`}
    >
      {content}
    </button>
  );
}

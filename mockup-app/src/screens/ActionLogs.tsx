import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Caption1,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { ScrollText, ChevronRight } from 'lucide-react';
import {
  SectionHeading,
  VrmPlate,
  DataGridSkeleton,
  EmptyState,
  ErrorState,
} from '../components';
import { useActivity, type ActivityKind } from '../data';

/* Action logs (review nav-bar #2: "Audit → Action Logs").
   Was a disabled "Soon" rail stub; now a real read over the audit-event seam
   (data.recentActivity → Postgres `audit_event`), through the shared useActivity
   hook so it shows the same loading / error / empty surfaces as the other screens.
   Newest first. The empty default data source returns [] honestly until
   the live REST source is injected. */

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  list: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  rowMain: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flexGrow: 1 },
  rowTop: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  desc: { color: 'var(--ce-ink)', fontWeight: tokens.fontWeightSemibold },
  meta: { color: tokens.colorNeutralForeground3 },
  when: { color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap', flexShrink: 0 },
  chev: { color: tokens.colorNeutralForeground4, flexShrink: 0 },
});

const KIND_LABELS: Record<ActivityKind, string> = {
  intake: 'Intake',
  parse: 'Read',
  classify: 'Sort',
  review: 'Review',
  enrich: 'Enrich',
  chaser: 'Chaser',
  eva_submit: 'EVA submit',
  box_sync: 'Archive',
  status_change: 'Status',
  note: 'Note',
  dedup: 'Duplicate',
};

export function ActionLogs() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { data: events, loading, error, refetch } = useActivity();

  return (
    <div className={mergeClasses('ce-enter', styles.root)}>
      <SectionHeading
        eyebrow="Admin"
        heading="Action logs"
        subtitle="Every action on a case — newest first."
      />

      {loading && events === undefined ? (
        <DataGridSkeleton rows={8} />
      ) : error && events === undefined ? (
        <ErrorState error={error} onRetry={refetch} title="Couldn’t load the action logs" />
      ) : !events || events.length === 0 ? (
        <EmptyState
          icon={<ScrollText size={32} strokeWidth={1.5} aria-hidden />}
          title="No activity recorded yet."
          hint="Intake, review, chase and submit actions appear here as cases move."
        />
      ) : (
        <div className={styles.list}>
          {events.map((e) => (
            <button
              key={e.id}
              type="button"
              className={mergeClasses('ce-focusable', styles.row)}
              onClick={() => e.caseId && navigate(`/case/${e.caseId}`)}
            >
              <div className={styles.rowMain}>
                <span className={styles.rowTop}>
                  <Badge appearance="tint" color="informative" size="small">
                    {KIND_LABELS[e.kind] ?? e.kind}
                  </Badge>
                  {e.vrm && <VrmPlate vrm={e.vrm} size="small" />}
                  <span className={styles.desc}>{e.description}</span>
                </span>
                <Caption1 className={styles.meta}>{e.actor}</Caption1>
              </div>
              <span className={styles.when}>{e.timestamp}</span>
              {e.caseId && <ChevronRight size={18} className={styles.chev} aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ActionLogs;

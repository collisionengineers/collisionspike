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
} from '../../shared/ui';
import { useActivity, type ActivityEvent, type ActivityKind } from '../../data';

/* Action logs (review nav-bar #2: "Audit → Action Logs").
   Was a disabled "Soon" rail stub; now a real read over the audit-event seam
   (data.recentActivity → Postgres `audit_event`), through the shared useActivity
   hook so it shows the same loading / error / empty surfaces as the other screens.
   Newest first. The empty default data source returns [] honestly until
   the live REST source is injected.

   TKT-134 — the PRIMARY line is the server-humanized `description` (the ONE
   audit-action label map, services/data-api/src/shared/last-activity.ts — no second mapping table
   here). Plain specifics render as a secondary `detail` line; the raw audit
   summary is available ONLY behind the "Technical details" disclosure. */

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  list: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  row: {
    display: 'flex',
    flexDirection: 'column',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  rowButton: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderRadius: tokens.borderRadiusMedium,
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  rowMain: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flexGrow: 1 },
  rowTop: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  desc: { color: 'var(--ce-ink)', fontWeight: tokens.fontWeightSemibold },
  detail: { color: tokens.colorNeutralForeground2 },
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

function ActionLogRow({ event, onOpen }: { event: ActivityEvent; onOpen: () => void }) {
  const styles = useStyles();
  return (
    <div className={styles.row}>
      <button
        type="button"
        className={mergeClasses('ce-focusable', styles.rowButton)}
        onClick={onOpen}
      >
        <div className={styles.rowMain}>
          <span className={styles.rowTop}>
            <Badge appearance="tint" color="informative" size="small">
              {KIND_LABELS[event.kind] ?? 'Update'}
            </Badge>
            {event.vrm && <VrmPlate vrm={event.vrm} size="small" />}
            <span className={styles.desc}>{event.description}</span>
          </span>
          {event.detail && <Caption1 className={styles.detail}>{event.detail}</Caption1>}
          <Caption1 className={styles.meta}>{event.actor}</Caption1>
        </div>
        <span className={styles.when}>{event.timestamp}</span>
        {event.caseId && <ChevronRight size={18} className={styles.chev} aria-hidden />}
      </button>
      {/* The server's withheld `event.technical` (raw event names / GUIDs / key=value tokens)
          is intentionally NOT rendered here: the AGENTS.md hard rule bans engineering/meta
          language from any staff-facing rendered string, and a click-to-reveal body is still
          rendered. Diagnostics belong in App Insights / a superuser-only surface. (PR52-F5) */}
    </div>
  );
}

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
            <ActionLogRow
              key={e.id}
              event={e}
              onOpen={() => e.caseId && navigate(`/case/${e.caseId}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default ActionLogs;

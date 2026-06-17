import type { KeyboardEvent } from 'react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  Caption1,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Dropdown,
  Option,
  SearchBox,
  Tab,
  TabList,
  TableCellLayout,
  Text,
  Tooltip,
  createTableColumn,
  makeStyles,
  mergeClasses,
  tokens,
  type SelectTabData,
  type SelectTabEvent,
  type TableColumnDefinition,
  type TableColumnSizingOptions,
} from '@fluentui/react-components';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Inbox,
  Mail,
  MessageCircle,
} from 'lucide-react';
import { SectionHeading, StatusBadge, VrmPlate } from '../components';
import {
  QUEUES,
  REASON_LABELS,
  casesForQueue,
  dueInfo,
  outstandingText,
  providers,
  queueByName,
  reasonCounts,
  type ActionReason,
  type Case,
  type CaseStatus,
  type QueueName,
} from '../mock';

/* Case list at /queue/:name (new 4-queue IA).
   - TabList across Needs action / In progress / Ready for EVA / Done (today).
   - On Needs action: reason facet chips (Missing images · Missing instructions ·
     Duplicate · Conflict) from reasonCounts(), toggling to filter the grid.
   - Toolbar: SearchBox (VRM / Case-PO / claimant) + Provider / Status / Channel /
     Age dropdowns, all filtering the mock cases client-side.
   - Fluent v9 declarative DataGrid with FIXED column sizing so Outstanding (verb-led,
     ellipsised + tooltip) and the icon-only Channel column never collide.
   - Row click → /case/:id. duplicate_risk rows keep the ⚠ + tinted background. */

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  tabs: { marginTop: `-${tokens.spacingVerticalS}` },

  facets: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  facetLabel: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '11px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
    marginRight: tokens.spacingHorizontalXS,
  },
  facetChip: {
    cursor: 'pointer',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground2,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  facetChipActive: {
    backgroundColor: 'var(--ce-red-dark)',
    border: '1px solid var(--ce-red-dark)',
    color: '#ffffff',
    ':hover': { backgroundColor: 'var(--ce-red-dark)' },
  },

  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
  },
  search: { width: '260px', maxWidth: '40vw' },
  filter: { display: 'flex', flexDirection: 'column', gap: '2px' },
  filterLabel: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '10px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
  },
  filterControl: { minWidth: '150px' },
  spacer: { flex: 1 },
  count: { color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap', alignSelf: 'center' },

  grid: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
  },
  row: {
    cursor: 'pointer',
    // CE 3px red focus halo on keyboard-focused rows (row focus mode).
    ':focus-visible': {
      outline: 'none',
      boxShadow: 'inset 0 0 0 2px var(--ce-red), 0 0 0 1px var(--ce-red)',
      position: 'relative',
      zIndex: 1,
    },
  },
  rowDuplicate: { backgroundColor: tokens.colorStatusDangerBackground1 },

  vrmCell: { display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  po: { fontFamily: 'var(--ce-font-mono)', textTransform: 'uppercase' },
  muted: { color: tokens.colorNeutralForeground3 },

  // Outstanding — verb-led, single line, ellipsised. Width bounded by the column.
  outstanding: {
    display: 'block',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  // Channel — icon only, centred in its narrow fixed column.
  channelCell: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForeground2,
  },

  // Aging / Due — stacked, severity-aware.
  dueCell: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, lineHeight: 1.2 },
  dueStack: { display: 'flex', flexDirection: 'column', lineHeight: 1.15 },
  duePastIcon: { color: 'var(--ce-red)', flexShrink: 0 },
  dueSoonIcon: { color: '#b07a00', flexShrink: 0 },
  duePastText: { color: 'var(--ce-red)', fontWeight: tokens.fontWeightSemibold },
  dueSoonText: { color: '#8a5a00', fontWeight: tokens.fontWeightSemibold },

  dup: { display: 'inline-flex', color: tokens.colorStatusDangerForeground1, flexShrink: 0 },

  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalXXXL} ${tokens.spacingHorizontalL}`,
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
  },
});

/* Distinct statuses that can appear in any queue, for the Status filter. */
const ALL_STATUSES: CaseStatus[] = [
  'new_email',
  'ingested',
  'needs_review',
  'missing_required_fields',
  'missing_images',
  'duplicate_risk',
  'linked_to_instruction',
  'ready_for_eva',
  'eva_submitted',
  'box_synced',
  'error',
];

const STATUS_LABELS: Record<CaseStatus, string> = {
  new_email: 'New email',
  ingested: 'Ingested',
  needs_review: 'Needs review',
  missing_required_fields: 'Missing fields',
  missing_images: 'Missing images',
  duplicate_risk: 'Duplicate risk',
  linked_to_instruction: 'Linked to instruction',
  ready_for_eva: 'Ready for EVA',
  eva_submitted: 'EVA submitted',
  box_synced: 'Box synced',
  error: 'Error',
};

type AgeBucket = 'all' | 'today' | 'week' | 'over1' | 'over2';
const AGE_OPTIONS: { value: AgeBucket; label: string }[] = [
  { value: 'all', label: 'Any age' },
  { value: 'today', label: 'Today (0 days)' },
  { value: 'week', label: 'This week (≤7 days)' },
  { value: 'over1', label: 'Over 1 week' },
  { value: 'over2', label: 'Over 2 weeks' },
];

const ANY = '__any__';

/* Per-tab empty-state guidance (no filters applied). */
const EMPTY_HINT: Record<QueueName, string> = {
  'needs-action': 'Nothing is waiting on a person right now — every case is moving on its own.',
  'in-progress': 'Nothing is being parsed or linked right now. New email arrivals land here first.',
  ready: 'No cases are cleared for EVA yet. They appear here once review and chasing are done.',
  done: 'Nothing has been submitted to EVA today. This list is windowed to today only.',
};

function ageInBucket(ageDays: number, bucket: AgeBucket): boolean {
  switch (bucket) {
    case 'today':
      return ageDays === 0;
    case 'week':
      return ageDays <= 7;
    case 'over1':
      return ageDays > 7;
    case 'over2':
      return ageDays > 14;
    default:
      return true;
  }
}

export function CaseList() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { name } = useParams<{ name: string }>();

  const activeName: QueueName = (queueByName(name ?? '')?.name ?? 'needs-action') as QueueName;
  const queue = queueByName(activeName);
  const isNeedsAction = activeName === 'needs-action';

  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>(ANY);
  const [statusFilter, setStatusFilter] = useState<CaseStatus | typeof ANY>(ANY);
  const [channelFilter, setChannelFilter] = useState<'email' | 'whatsapp' | typeof ANY>(ANY);
  const [ageFilter, setAgeFilter] = useState<AgeBucket>('all');
  const [reasonFilter, setReasonFilter] = useState<ActionReason | null>(null);

  const queueCases = useMemo(() => casesForQueue(activeName), [activeName]);
  const facets = useMemo(() => (isNeedsAction ? reasonCounts() : []), [isNeedsAction]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return queueCases.filter((c) => {
      if (isNeedsAction && reasonFilter && c.actionReason !== reasonFilter) return false;
      if (q) {
        const hay = [
          c.vrm,
          c.casePo ?? '',
          c.provider,
          c.providerCode,
          c.evaFields.claimantName.value,
          c.vehicleModel,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (providerFilter !== ANY && c.providerCode !== providerFilter) return false;
      if (statusFilter !== ANY && c.status !== statusFilter) return false;
      if (channelFilter !== ANY && c.channel.kind !== channelFilter) return false;
      if (!ageInBucket(c.ageDays, ageFilter)) return false;
      return true;
    });
  }, [
    queueCases,
    search,
    providerFilter,
    statusFilter,
    channelFilter,
    ageFilter,
    reasonFilter,
    isNeedsAction,
  ]);

  const onTabSelect = (_e: SelectTabEvent, data: SelectTabData) => {
    setReasonFilter(null);
    navigate(`/queue/${data.value as QueueName}`);
  };

  /* Fixed sizing so Channel (icon-only) and Outstanding never overlap. */
  const columnSizing: TableColumnSizingOptions = useMemo(
    () => ({
      vrm: { minWidth: 150, idealWidth: 170, defaultWidth: 170 },
      casePo: { minWidth: 110, idealWidth: 120, defaultWidth: 120 },
      provider: { minWidth: 130, idealWidth: 150, defaultWidth: 150 },
      status: { minWidth: 150, idealWidth: 165, defaultWidth: 165 },
      outstanding: { minWidth: 180, idealWidth: 240, defaultWidth: 240 },
      channel: { minWidth: 64, idealWidth: 64, defaultWidth: 64, padding: 0 },
      due: { minWidth: 120, idealWidth: 140, defaultWidth: 140 },
    }),
    [],
  );

  const columns: TableColumnDefinition<Case>[] = useMemo(
    () => [
      createTableColumn<Case>({
        columnId: 'vrm',
        renderHeaderCell: () => 'VRM',
        renderCell: (c) => (
          <span className={styles.vrmCell}>
            {c.status === 'duplicate_risk' && (
              <Tooltip content="Possible duplicate — held for human review" relationship="label">
                <span className={styles.dup}>
                  <AlertTriangle size={15} aria-label="Duplicate risk" />
                </span>
              </Tooltip>
            )}
            <VrmPlate vrm={c.vrm} size="small" />
          </span>
        ),
      }),
      createTableColumn<Case>({
        columnId: 'casePo',
        renderHeaderCell: () => 'Case / PO',
        renderCell: (c) =>
          c.casePo ? (
            <span className={styles.po}>{c.casePo}</span>
          ) : (
            <span className={mergeClasses(styles.po, styles.muted)}>—</span>
          ),
      }),
      createTableColumn<Case>({
        columnId: 'provider',
        renderHeaderCell: () => 'Provider',
        renderCell: (c) => (
          <TableCellLayout description={c.providerCode} truncate>
            {c.provider}
          </TableCellLayout>
        ),
      }),
      createTableColumn<Case>({
        columnId: 'status',
        renderHeaderCell: () => 'Status',
        renderCell: (c) => <StatusBadge status={c.status} size="small" />,
      }),
      createTableColumn<Case>({
        columnId: 'outstanding',
        renderHeaderCell: () => 'Outstanding',
        renderCell: (c) => {
          const full = outstandingText(c);
          return (
            <Tooltip content={full} relationship="label">
              <span className={styles.outstanding} title={full}>
                {full}
              </span>
            </Tooltip>
          );
        },
      }),
      createTableColumn<Case>({
        columnId: 'channel',
        renderHeaderCell: () => 'Ch.',
        renderCell: (c) => {
          const isWhatsapp = c.channel.kind === 'whatsapp';
          const label = isWhatsapp ? 'WhatsApp' : 'Email';
          const desc = `${label}${c.channel.mode === 'manual' ? ' (manual)' : ''} — ${c.channel.sourceMailbox}`;
          return (
            <Tooltip content={desc} relationship="label">
              <span className={styles.channelCell}>
                {isWhatsapp ? (
                  <MessageCircle size={16} aria-label={`${label} channel`} />
                ) : (
                  <Mail size={16} aria-label={`${label} channel`} />
                )}
              </span>
            </Tooltip>
          );
        },
      }),
      createTableColumn<Case>({
        columnId: 'due',
        renderHeaderCell: () => 'Aging / Due',
        renderCell: (c) => {
          const due = dueInfo(c);
          const ageText = c.ageDays === 0 ? 'Today' : `${c.ageDays} day${c.ageDays === 1 ? '' : 's'}`;
          return (
            <span className={styles.dueCell}>
              {due.tone === 'pastdue' && (
                <AlertTriangle size={15} className={styles.duePastIcon} aria-label="Past due" />
              )}
              {due.tone === 'soon' && (
                <CalendarClock size={15} className={styles.dueSoonIcon} aria-label="Due soon" />
              )}
              <span className={styles.dueStack}>
                <span
                  className={mergeClasses(
                    due.tone === 'pastdue' && styles.duePastText,
                    due.tone === 'soon' && styles.dueSoonText,
                  )}
                >
                  {ageText}
                </span>
                {c.dateDue && <Caption1 className={styles.muted}>{due.dueText}</Caption1>}
              </span>
            </span>
          );
        },
      }),
    ],
    [styles],
  );

  const filtersActive =
    providerFilter !== ANY ||
    statusFilter !== ANY ||
    channelFilter !== ANY ||
    ageFilter !== 'all' ||
    reasonFilter !== null ||
    search.trim() !== '';

  return (
    <div className={styles.root}>
      <SectionHeading
        eyebrow="Queue"
        heading={queue?.label ?? 'Cases'}
        subtitle="Click a case to open its review workspace."
      />

      <TabList
        className={styles.tabs}
        selectedValue={activeName}
        onTabSelect={onTabSelect}
        aria-label="Case queues"
      >
        {QUEUES.map((q) => (
          <Tab key={q.name} value={q.name}>
            {q.label} ({casesForQueue(q.name).length})
          </Tab>
        ))}
      </TabList>

      {isNeedsAction && facets.length > 0 && (
        <div className={styles.facets} role="group" aria-label="Filter by reason">
          <span className={styles.facetLabel}>Reason</span>
          {facets.map((f) => {
            const active = reasonFilter === f.reason;
            return (
              <Badge
                key={f.reason}
                appearance="outline"
                shape="rounded"
                size="large"
                className={mergeClasses('ce-focusable', styles.facetChip, active && styles.facetChipActive)}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                onClick={() => setReasonFilter(active ? null : f.reason)}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setReasonFilter(active ? null : f.reason);
                  }
                }}
              >
                {REASON_LABELS[f.reason]} ({f.count})
              </Badge>
            );
          })}
        </div>
      )}

      <div className={styles.toolbar} role="search">
        <SearchBox
          className={styles.search}
          placeholder="Search VRM, Case/PO, claimant…"
          value={search}
          onChange={(_e, data) => setSearch(data.value)}
          aria-label="Search cases"
        />

        <div className={styles.filter}>
          <span className={styles.filterLabel} id="filter-provider">
            Provider
          </span>
          <Dropdown
            className={styles.filterControl}
            aria-labelledby="filter-provider"
            value={
              providerFilter === ANY
                ? 'All providers'
                : providers.find((p) => p.principalCode === providerFilter)?.displayName ?? providerFilter
            }
            selectedOptions={[providerFilter]}
            onOptionSelect={(_e, data) => setProviderFilter(data.optionValue ?? ANY)}
          >
            <Option value={ANY} text="All providers">
              All providers
            </Option>
            {providers.map((p) => (
              <Option key={p.principalCode} value={p.principalCode} text={p.displayName}>
                {p.displayName} ({p.principalCode})
              </Option>
            ))}
          </Dropdown>
        </div>

        <div className={styles.filter}>
          <span className={styles.filterLabel} id="filter-status">
            Status
          </span>
          <Dropdown
            className={styles.filterControl}
            aria-labelledby="filter-status"
            value={statusFilter === ANY ? 'All statuses' : STATUS_LABELS[statusFilter]}
            selectedOptions={[statusFilter]}
            onOptionSelect={(_e, data) =>
              setStatusFilter((data.optionValue as CaseStatus | typeof ANY) ?? ANY)
            }
          >
            <Option value={ANY} text="All statuses">
              All statuses
            </Option>
            {ALL_STATUSES.map((s) => (
              <Option key={s} value={s} text={STATUS_LABELS[s]}>
                {STATUS_LABELS[s]}
              </Option>
            ))}
          </Dropdown>
        </div>

        <div className={styles.filter}>
          <span className={styles.filterLabel} id="filter-channel">
            Channel
          </span>
          <Dropdown
            className={styles.filterControl}
            aria-labelledby="filter-channel"
            value={
              channelFilter === ANY
                ? 'All channels'
                : channelFilter === 'whatsapp'
                  ? 'WhatsApp'
                  : 'Email'
            }
            selectedOptions={[channelFilter]}
            onOptionSelect={(_e, data) =>
              setChannelFilter((data.optionValue as 'email' | 'whatsapp' | typeof ANY) ?? ANY)
            }
          >
            <Option value={ANY} text="All channels">
              All channels
            </Option>
            <Option value="email" text="Email">
              Email
            </Option>
            <Option value="whatsapp" text="WhatsApp">
              WhatsApp
            </Option>
          </Dropdown>
        </div>

        <div className={styles.filter}>
          <span className={styles.filterLabel} id="filter-age">
            Age
          </span>
          <Dropdown
            className={styles.filterControl}
            aria-labelledby="filter-age"
            value={AGE_OPTIONS.find((o) => o.value === ageFilter)?.label ?? 'Any age'}
            selectedOptions={[ageFilter]}
            onOptionSelect={(_e, data) => setAgeFilter((data.optionValue as AgeBucket) ?? 'all')}
          >
            {AGE_OPTIONS.map((o) => (
              <Option key={o.value} value={o.value} text={o.label}>
                {o.label}
              </Option>
            ))}
          </Dropdown>
        </div>

        <div className={styles.spacer} />
        <Text className={styles.count} size={200}>
          {filtered.length} of {queueCases.length} case{queueCases.length === 1 ? '' : 's'}
        </Text>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          {queueCases.length === 0 ? (
            <>
              <CheckCircle2 size={32} strokeWidth={1.5} aria-hidden />
              <Text>No cases in “{queue?.label ?? activeName}” right now.</Text>
              <Caption1>{EMPTY_HINT[activeName]}</Caption1>
            </>
          ) : (
            <>
              <Inbox size={32} strokeWidth={1.5} aria-hidden />
              <Text>No cases match the current filters.</Text>
              {filtersActive && (
                <Caption1>Clear the reason chip, search box or dropdowns to widen the results.</Caption1>
              )}
            </>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          <DataGrid
            items={filtered}
            columns={columns}
            getRowId={(c) => c.id}
            focusMode="row_unstable"
            resizableColumns
            columnSizingOptions={columnSizing}
            aria-label={`Cases in ${queue?.label ?? activeName}`}
          >
            <DataGridHeader>
              <DataGridRow>
                {({ renderHeaderCell }) => (
                  <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                )}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<Case>>
              {({ item, rowId }) => (
                <DataGridRow<Case>
                  key={rowId}
                  className={mergeClasses(
                    styles.row,
                    item.status === 'duplicate_risk' && styles.rowDuplicate,
                  )}
                  onClick={() => navigate(`/case/${item.id}`)}
                  onKeyDown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter') navigate(`/case/${item.id}`);
                  }}
                  aria-label={`Open case ${item.vrm}`}
                >
                  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        </div>
      )}
    </div>
  );
}

export default CaseList;

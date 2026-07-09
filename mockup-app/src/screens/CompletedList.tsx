import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Tab,
  TabList,
  TableCellLayout,
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
  SectionHeading,
  StatusBadge,
  VrmPlate,
  EmptyState,
  ErrorState,
  DataGridSkeleton,
  useTableTypography,
} from '../components';
import { caseDisplayName } from './case-list-columns';
import { useCompletedCases, type Case, type CaseStatus } from '../data';

/* ============================================================
   CompletedList — the Completed/Archive area at /completed (TKT-096, ADR-0023).

   Terminal cases have NO work-queue by design (ADR-0008: the tool boundary ends
   at the EVA handoff) — this view is their browse/audit home, deliberately a
   separate nav section, NOT a 4th queue. Split per the operator's Phase-D plan:
     - Awaiting delivery  → eva_submitted (exported to EVA; the report has not
                            yet gone back to the work provider)
     - Delivered          → done (the report went back to the provider)
   plus the All tab (which also surfaces historical box_synced rows).
   Dashboard throughput tiles drill through here (STAGE_ROUTE.submitted).
   ============================================================ */

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  tabs: { marginTop: `-${tokens.spacingVerticalS}` },
  grid: { width: '100%' },
  row: { cursor: 'pointer' },
});

type CompletedTab = 'all' | 'awaiting' | 'delivered';

const TAB_STATUS: Record<CompletedTab, (s: CaseStatus) => boolean> = {
  all: () => true,
  awaiting: (s) => s === 'eva_submitted',
  delivered: (s) => s === 'done',
};

export default function CompletedList() {
  const styles = useStyles();
  const typo = useTableTypography();
  const navigate = useNavigate();
  const { data: cases, loading, error, refetch } = useCompletedCases();
  const [tab, setTab] = useState<CompletedTab>('all');

  const all = useMemo(() => cases ?? [], [cases]);
  const awaitingCount = all.filter((c) => c.status === 'eva_submitted').length;
  const deliveredCount = all.filter((c) => c.status === 'done').length;
  const rows = useMemo(() => all.filter((c) => TAB_STATUS[tab](c.status)), [all, tab]);

  const onTabSelect = (_e: SelectTabEvent, d: SelectTabData) => setTab(d.value as CompletedTab);

  const columns: TableColumnDefinition<Case>[] = useMemo(
    () => [
      createTableColumn<Case>({
        columnId: 'casePo',
        renderHeaderCell: () => 'Case/PO',
        renderCell: (c) => (
          <TableCellLayout>
            <span className={typo.cellMono}>{c.casePo || '—'}</span>
          </TableCellLayout>
        ),
      }),
      createTableColumn<Case>({
        columnId: 'vrm',
        renderHeaderCell: () => 'Registration',
        renderCell: (c) =>
          c.vrm ? <VrmPlate vrm={c.vrm} size="small" /> : <span className={typo.cellSecondary}>—</span>,
      }),
      createTableColumn<Case>({
        columnId: 'claimant',
        renderHeaderCell: () => 'Claimant',
        renderCell: (c) => (
          <TableCellLayout>
            <span className={typo.cellPrimary}>
              {c.evaFields.claimantName.value?.trim() || caseDisplayName(c)}
            </span>
          </TableCellLayout>
        ),
      }),
      createTableColumn<Case>({
        columnId: 'provider',
        renderHeaderCell: () => 'Work provider',
        renderCell: (c) => (
          <TableCellLayout>
            <span className={typo.cellSecondary}>{c.provider || '—'}</span>
          </TableCellLayout>
        ),
      }),
      createTableColumn<Case>({
        columnId: 'status',
        renderHeaderCell: () => 'Status',
        renderCell: (c) => <StatusBadge status={c.status} size="small" />,
      }),
      createTableColumn<Case>({
        columnId: 'submitted',
        renderHeaderCell: () => 'Submitted',
        renderCell: (c) => (
          <TableCellLayout>
            <span className={typo.cellSecondary}>{c.submittedAt || '—'}</span>
          </TableCellLayout>
        ),
      }),
    ],
    [typo],
  );

  const sizing: TableColumnSizingOptions = {
    casePo: { minWidth: 110, idealWidth: 130 },
    vrm: { minWidth: 110, idealWidth: 130 },
    claimant: { minWidth: 160, idealWidth: 240 },
    provider: { minWidth: 140, idealWidth: 200 },
    status: { minWidth: 130, idealWidth: 150 },
    submitted: { minWidth: 110, idealWidth: 130 },
  };

  return (
    <div className={mergeClasses('ce-enter', styles.root)}>
      <SectionHeading
        eyebrow="Completed"
        heading="Completed cases"
        subtitle="Past the EVA handoff — exported submissions awaiting delivery, and delivered reports. Not a work queue."
      />

      <TabList className={styles.tabs} selectedValue={tab} onTabSelect={onTabSelect}>
        <Tab value="all">All ({all.length})</Tab>
        <Tab value="awaiting">Awaiting delivery ({awaitingCount})</Tab>
        <Tab value="delivered">Delivered ({deliveredCount})</Tab>
      </TabList>

      {loading && !cases ? (
        <DataGridSkeleton rows={6} />
      ) : error ? (
        <ErrorState title="Couldn’t load completed cases" onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            tab === 'delivered'
              ? 'No delivered cases yet'
              : tab === 'awaiting'
                ? 'Nothing awaiting delivery'
                : 'No completed cases yet'
          }
          hint="Cases appear here once they are exported for EVA, and move to Delivered when the report goes back to the work provider."
        />
      ) : (
        <DataGrid
          className={styles.grid}
          items={rows}
          columns={columns}
          columnSizingOptions={sizing}
          resizableColumns
          getRowId={(c: Case) => c.id}
          focusMode="composite"
        >
          <DataGridHeader>
            <DataGridRow>
              {({ renderHeaderCell }) => (
                <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
              )}
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody<Case>>
            {({ item }) => (
              <DataGridRow<Case>
                key={item.id}
                className={styles.row}
                onClick={() => navigate(`/case/${item.id}`)}
              >
                {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
              </DataGridRow>
            )}
          </DataGridBody>
        </DataGrid>
      )}
    </div>
  );
}

import type { KeyboardEvent } from 'react';
import { Badge, Button, DataGrid, DataGridBody, DataGridCell, DataGridHeader, DataGridHeaderCell, DataGridRow, Dropdown, Option, SearchBox, Tab, TabList, Text, mergeClasses } from '@fluentui/react-components';
import { CheckCircle2, Inbox } from 'lucide-react';
import { SectionHeading, statusLabel, EmptyState, ErrorState, DataGridSkeleton, BulkActionBar, CasePeekDrawer } from '../../shared/ui';
import { Pager } from '../../shared/ui/Pager';
import { nextPeekId } from '../../shared/navigation/peek';
import { QUEUES, REASON_LABELS, type Case, type CaseStatus } from '../../data';

import type { AgeBucket, useCaseList } from './case-list.controller';

type CaseListViewModel = ReturnType<typeof useCaseList>;

export function CaseListView(props: CaseListViewModel) {
  const { activeName, ageFilter, bulkBusy, channelFilter, closePeek, columnSizing, columns, eligibleRows, facets, filtered, filtersActive, ineligibleCount, isHeld, navigate, onTabSelect, pageItems, pagePeek, peekId, peekList, providerFilter, providerOptions, queue, queueCases, queueQuery, queueTabCounts, reasonFilter, restoreFocusFromBar, runBulk, runBulkChase, search, selected, setAgeFilter, setChannelFilter, setPage, setProviderFilter, setReasonFilter, setSearch, setSelected, setStatusFilter, showFacets, showStatusFilter, statusFilter, styles, win, AGE_OPTIONS, ANY, EMPTY_STATE } = props;
    return (
    <div className={mergeClasses('ce-enter', styles.root)}>
      <SectionHeading
        eyebrow="Queue"
        heading={queue?.label ?? 'Cases'}
        subtitle={
          activeName === 'not-ready'
            ? 'Needs action = a chase is due (weekly cadence) or the case is past due.'
            : 'Click a case to open its review workspace.'
        }
      />

      <TabList
        className={styles.tabs}
        selectedValue={activeName}
        onTabSelect={onTabSelect}
        aria-label="Case queues"
      >
        {QUEUES.map((q) => (
          <Tab key={q.name} value={q.name}>
            {q.label}
            {queueTabCounts ? ` (${queueTabCounts[q.name]})` : ''}
          </Tab>
        ))}
      </TabList>

      {showFacets && facets.length > 0 && (
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
                : providerOptions.find((p) => p.code === providerFilter)?.label ?? providerFilter
            }
            selectedOptions={[providerFilter]}
            onOptionSelect={(_e, data) => setProviderFilter(data.optionValue ?? ANY)}
          >
            <Option value={ANY} text="All providers">
              All providers
            </Option>
            {providerOptions.map((p) => (
              <Option key={p.code} value={p.code} text={p.label}>
                {p.label} ({p.code})
              </Option>
            ))}
          </Dropdown>
        </div>

        {showStatusFilter && (
          <div className={styles.filter}>
            <span className={styles.filterLabel} id="filter-status">
              Status
            </span>
            <Dropdown
              className={styles.filterControl}
              aria-labelledby="filter-status"
              value={statusFilter === ANY ? 'All statuses' : statusLabel(statusFilter)}
              selectedOptions={[statusFilter]}
              onOptionSelect={(_e, data) =>
                setStatusFilter((data.optionValue as CaseStatus | typeof ANY) ?? ANY)
              }
            >
              <Option value={ANY} text="All statuses">
                All statuses
              </Option>
              {(queue?.statuses ?? []).map((s) => (
                <Option key={s} value={s} text={statusLabel(s)}>
                  {statusLabel(s)}
                </Option>
              ))}
            </Dropdown>
          </div>
        )}

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

      {queueQuery.loading && queueQuery.data === undefined ? (
        <DataGridSkeleton rows={8} />
      ) : queueQuery.error && queueQuery.data === undefined ? (
        <ErrorState
          error={queueQuery.error}
          onRetry={queueQuery.refetch}
          title="Couldn’t load this queue"
        />
      ) : filtered.length === 0 ? (
        queueCases.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={32} strokeWidth={1.5} aria-hidden />}
            title={EMPTY_STATE[activeName].title}
            hint={EMPTY_STATE[activeName].hint}
            action={
              <Button
                appearance="secondary"
                onClick={() => navigate(EMPTY_STATE[activeName].to)}
              >
                {EMPTY_STATE[activeName].actionLabel}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Inbox size={32} strokeWidth={1.5} aria-hidden />}
            title="No cases match the current filters."
            hint={
              filtersActive
                ? 'Clear the reason chip, search box or dropdowns to widen the results.'
                : undefined
            }
          />
        )
      ) : (
        <>
        <div className={styles.grid}>
          {/* focusMode="composite" (was row_unstable): rows stay focusable
              (Enter opens the case) and arrow keys reach the in-cell
              checkboxes — row_unstable left them keyboard-unreachable. */}
          <DataGrid
            items={pageItems}
            columns={columns}
            getRowId={(c) => c.id}
            focusMode="composite"
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
                  data-case-row={item.id}
                  className={mergeClasses(
                    styles.row,
                    item.status === 'duplicate_risk' && styles.rowDuplicate,
                  )}
                  onClick={() => navigate(`/case/${item.id}`)}
                  onKeyDown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter') navigate(`/case/${item.id}`);
                  }}
                  // NO aria-label (gatekeeper F2): it would REPLACE the
                  // name-from-content and hide claimant/provider/why-held
                  // from SR row focus; Enter-to-open is grid idiom.
                >
                  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        </div>
        {/* TKT-116 — queue pager (the TKT-098 inbox pattern). Inside the grid
            branch so it never shows over the empty / skeleton / error states;
            the Pager's own guard renders null when the list fits one page. */}
        <Pager
          page={win.page}
          pageCount={win.pageCount}
          from={win.from}
          to={win.to}
          total={win.total}
          itemNoun="cases"
          onPageChange={setPage}
        />
        </>
      )}

      {/* Bulk-selection toolbar — sticky to the bottom of the content pane;
          renders nothing until a row is selected. Verb counts are the
          ELIGIBLE subset (honest "(n)"); disabled only at eligible 0. */}
      <BulkActionBar
        count={selected.size}
        busy={bulkBusy}
        verbs={[
          {
            key: isHeld ? 'release' : 'hold',
            label: `${isHeld ? 'Release' : 'Hold'} (${eligibleRows.length})`,
            onClick: () => void runBulk(eligibleRows.map((c) => c.id)),
            disabled: eligibleRows.length === 0,
          },
          // Log chase — the NOT-READY queue only (spec IA §4); records, never sends.
          ...(activeName === 'not-ready'
            ? [
                {
                  key: 'chase',
                  label: `Log chase (${eligibleRows.length})`,
                  onClick: () => void runBulkChase(eligibleRows.map((c) => c.id)),
                  disabled: eligibleRows.length === 0,
                },
              ]
            : []),
        ]}
        caption={
          isHeld && ineligibleCount > 0
            ? // "decision", not "duplicate decision" — the ineligible set
              // includes failed-processing rows too (critic).
              `${ineligibleCount} selected need their decision made per case`
            : undefined
        }
        onClear={() => {
          restoreFocusFromBar(); // the bar is about to unmount (F4)
          setSelected(new Set());
        }}
      />

      {/* Quick-peek drawer — ?peek=<caseId> on this route (spec IA §3).
          "Open case" REPLACES the peeked entry with the canonical /case/:id. */}
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

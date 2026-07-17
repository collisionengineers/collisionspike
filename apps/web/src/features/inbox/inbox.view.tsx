import type { KeyboardEvent } from 'react';
import { Badge, Button, DataGrid, DataGridBody, DataGridCell, DataGridHeader, DataGridHeaderCell, DataGridRow, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Dropdown, Option, OptionGroup, SearchBox, Switch, Text, mergeClasses } from '@fluentui/react-components';
import { AlertCircle, Copy, Inbox as InboxIcon, RotateCcw } from 'lucide-react';
import { SectionHeading, EmptyState, ErrorState, DataGridSkeleton, CasePeekDrawer } from '../../shared/ui';
import { Pager } from '../../shared/ui/Pager';
import { nextPeekId } from '../../shared/navigation/peek';
import { CATEGORY_LABEL, CATEGORY_ORDER, EMAIL_TYPE_ALL, SUBTYPE_LABEL, SUBTYPES_BY_CATEGORY, emailTypeDisplayLabel, emailTypeParam, parseEmailType } from './inbox-email-type';
import type { InboundEmail } from '@cs/domain';

import type { useInboxController } from './inbox.controller';
import { EmailPreviewPanel, ReclassifyDialog } from './inbox-panels';
import { PreviewControllerProvider } from './subject-preview';

type InboxViewModel = ReturnType<typeof useInboxController>;

export function InboxView(props: InboxViewModel) {
  const { applyEmailType, applyShowDismissed, clearFilters, closePeek, columnSizing, columns, copyPointer, dispatchToast, emailType, filtered, hiddenDismissedCount, inbox, mailboxChips, mailboxFilter, navigate, onlyDismissedHidden, pageItems, pagePeek, peekId, peekList, pointerRow, preMailboxFiltered, reclassifyRow, refresh, rows, search, selectMailboxFilter, selectedEmail, setHoveredRowId, setPage, setPointerRow, setReclassifyRow, setSearch, setSelectedEmail, setTriage, showDismissed, styles, win, TYPE_ALL_OPTION, isHandledState } = props;
    return (
    <div className={mergeClasses('ce-enter', styles.root)}>
      <SectionHeading
        eyebrow="Triage"
        heading="Inbox"
        subtitle="Every email to the shared inboxes, classified. Action it here — work flows to Cases; queries and everything else are dismissed or actioned."
      />

      {/* ONE condensed filter row (020726 E1): search + mailbox chips + the
          E-mail type dropdown + the Show-dismissed switch. */}
      <div className={styles.toolbar} role="search">
        <SearchBox
          className={styles.search}
          placeholder="Search subject, from, domain, VRM, Case/PO…"
          value={search}
          onChange={(_e, d) => setSearch(d.value)}
          aria-label="Search inbound email"
        />

        {/* Source-mailbox facet chips (TKT-025) — client-side over the loaded
            rows; SINGLE-select, "All" is the explicit default and exactly one
            chip is active at a time. */}
        {mailboxChips.length > 0 && (
          <div className={styles.facets} role="radiogroup" aria-label="Filter by mailbox">
            <span className={styles.facetLabel}>Mailbox</span>
            {(() => {
              const allActive = mailboxFilter === null;
              return (
                <Badge
                  appearance="outline"
                  shape="rounded"
                  size="large"
                  className={mergeClasses('ce-focusable', styles.facetChip, allActive && styles.facetChipActive)}
                  role="radio"
                  tabIndex={0}
                  aria-checked={allActive}
                  onClick={() => selectMailboxFilter(null)}
                  onKeyDown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectMailboxFilter(null);
                    }
                  }}
                >
                  All ({preMailboxFiltered.length})
                </Badge>
              );
            })()}
            {mailboxChips.map((chip) => {
              const active = mailboxFilter === chip.mailbox;
              return (
                <Badge
                  key={chip.mailbox}
                  appearance="outline"
                  shape="rounded"
                  size="large"
                  className={mergeClasses('ce-focusable', styles.facetChip, active && styles.facetChipActive)}
                  role="radio"
                  tabIndex={0}
                  aria-checked={active}
                  onClick={() => selectMailboxFilter(chip.mailbox)}
                  onKeyDown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectMailboxFilter(chip.mailbox);
                    }
                  }}
                >
                  {chip.label} ({chip.count})
                </Badge>
              );
            })}
          </div>
        )}

        {/* The ONE type filter — categories with their subtypes, grouped. */}
        <div className={styles.filter}>
          <span className={styles.filterLabel} id="filter-email-type">
            E-mail type
          </span>
          <Dropdown
            className={styles.filterControl}
            listbox={{ className: styles.typeListbox }}
            aria-labelledby="filter-email-type"
            value={emailTypeDisplayLabel(emailType)}
            selectedOptions={[emailTypeParam(emailType) ?? TYPE_ALL_OPTION]}
            onOptionSelect={(_e, d) => {
              const v = d.optionValue;
              applyEmailType(v && v !== TYPE_ALL_OPTION ? parseEmailType(v) : EMAIL_TYPE_ALL);
            }}
          >
            <Option value={TYPE_ALL_OPTION} text="All types">
              All types
            </Option>
            {CATEGORY_ORDER.map((c) => (
              <OptionGroup key={c} label={CATEGORY_LABEL[c]}>
                <Option value={c} text={CATEGORY_LABEL[c]}>
                  All {CATEGORY_LABEL[c].toLowerCase()}
                </Option>
                {SUBTYPES_BY_CATEGORY[c].length > 1 &&
                  SUBTYPES_BY_CATEGORY[c].map((s) => (
                    <Option key={s} value={s} text={SUBTYPE_LABEL[s]}>
                      {SUBTYPE_LABEL[s]}
                    </Option>
                  ))}
              </OptionGroup>
            ))}
          </Dropdown>
        </div>

        <div className={styles.spacer} />

        <Switch
          className={styles.dismissedSwitch}
          label="Show dismissed"
          checked={showDismissed}
          onChange={(_e, d) => applyShowDismissed(d.checked)}
        />
      </div>

      {/* Stale refetch: a reload failed but we still hold the last-loaded rows. */}
      {inbox.error && inbox.data !== undefined && (
        <div className={styles.staleBanner} role="status">
          <span className={styles.staleIcon}>
            <AlertCircle size={16} strokeWidth={2} aria-hidden />
          </span>
          <span className={styles.staleText}>
            Showing the last loaded inbox — couldn’t refresh just now.
          </span>
          <Button
            appearance="transparent"
            size="small"
            icon={<RotateCcw size={14} strokeWidth={2} />}
            onClick={inbox.refetch}
          >
            Retry
          </Button>
        </div>
      )}

      {inbox.loading && inbox.data === undefined ? (
        <DataGridSkeleton rows={8} />
      ) : inbox.error && inbox.data === undefined ? (
        <ErrorState error={inbox.error} onRetry={inbox.refetch} title="Couldn’t load the inbox" />
      ) : filtered.length === 0 ? (
        rows.length === 0 ? (
          <EmptyState
            icon={<InboxIcon size={32} strokeWidth={1.5} aria-hidden />}
            title="No email yet."
            hint="Everything sent to the shared inboxes lands here, classified and ready to action."
            action={
              <Button appearance="secondary" onClick={() => navigate('/intake')}>
                Start a case manually
              </Button>
            }
          />
        ) : onlyDismissedHidden ? (
          <EmptyState
            icon={<InboxIcon size={32} strokeWidth={1.5} aria-hidden />}
            title={`Nothing to show — ${hiddenDismissedCount} dismissed email${hiddenDismissedCount === 1 ? '' : 's'} hidden.`}
            action={
              <Button appearance="secondary" onClick={() => applyShowDismissed(true)}>
                Show dismissed
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<InboxIcon size={32} strokeWidth={1.5} aria-hidden />}
            title="No email matches the current filters."
            action={
              <Button appearance="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        )
      ) : (
        <div className={styles.workspace}>
          <div className={mergeClasses(styles.gridPane, selectedEmail != null && styles.gridPaneWithSidebar)}>
            <div className={styles.grid}>
              {/* TKT-169 — one shared hover/focus preview controller (and one
                  rendered popover surface) for every row's subject cell, so
                  at most one preview is ever open at a time. */}
              <PreviewControllerProvider>
                <DataGrid
                  items={pageItems}
                  columns={columns}
                  getRowId={(e) => e.id}
                  resizableColumns
                  columnSizingOptions={columnSizing}
                  aria-label="Inbound email"
                >
                  <DataGridHeader>
                    <DataGridRow>
                      {({ renderHeaderCell }) => (
                        <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                      )}
                    </DataGridRow>
                  </DataGridHeader>
                  <DataGridBody<InboundEmail>>
                    {({ item, rowId }) => (
                      <DataGridRow<InboundEmail>
                        key={rowId}
                        // Handled rows stay in the single list, muted (020726 E1);
                        // the Status text carries the state — mute is redundant.
                        className={mergeClasses(
                          isHandledState(item.triageState) && styles.rowHandled,
                        )}
                        // Focus-restore target for the peek drawer (linked rows only).
                        data-case-row={item.caseId ?? undefined}
                        onMouseEnter={() => setHoveredRowId(item.id)}
                        onMouseLeave={() => setHoveredRowId(null)}
                      >
                        {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                      </DataGridRow>
                    )}
                  </DataGridBody>
                </DataGrid>
              </PreviewControllerProvider>
            </div>
            {/* TKT-098 — inbox pager. Sits BELOW the grid, inside the grid branch,
                so it never shows over the empty / skeleton / error states; the
                Pager's own guard renders null whenever the list fits one page. */}
            <Pager
              page={win.page}
              pageCount={win.pageCount}
              from={win.from}
              to={win.to}
              total={win.total}
              itemNoun="emails"
              onPageChange={setPage}
            />
          </div>

          {selectedEmail && (
            <EmailPreviewPanel
              row={selectedEmail}
              onClose={() => setSelectedEmail(null)}
              onOpenCase={(id) => {
                setSelectedEmail(null);
                navigate(`/case/${id}`);
              }}
              onCopyReference={copyPointer}
              onTriage={(next) => void setTriage(selectedEmail, next)}
              onReclassify={() => setReclassifyRow(selectedEmail)}
              // After a suggestion accept links the email, or a detach unlinks it —
              // patch the sidebar's row in place (never wait a full refetch to show
              // it) AND refresh the grid so the DataGrid row agrees.
              onCaseLinkChanged={(emailId, caseId) => {
                setSelectedEmail((prev) => (prev && prev.id === emailId ? { ...prev, caseId } : prev));
                refresh();
              }}
              // TKT-137 — an accepted type suggestion relabelled the email: patch the
              // sidebar's row in place when the server applied it, refresh the grid
              // either way (the E-mail type cell reads the refetched rows).
              onEmailTypeChanged={(emailId, applied) => {
                if (applied) {
                  setSelectedEmail((prev) => (prev && prev.id === emailId ? { ...prev, ...applied } : prev));
                }
                refresh();
              }}
              dispatchToast={dispatchToast}
            />
          )}
        </div>
      )}

      {/* Mailbox POINTER dialog — unlinked rows hold no .eml; surface the source
          mailbox + Message-ID for the operator to find the mail by hand. */}
      <Dialog open={pointerRow !== null} onOpenChange={(_e, d) => !d.open && setPointerRow(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Open in mailbox</DialogTitle>
            <DialogContent>
              <div className={styles.dialogGrid}>
                <Text className={styles.dialogNote}>
                  Open the shared mailbox below and search for this Message-ID to find the original
                  email.
                </Text>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Mailbox</span>
                  <span className={styles.metaMono}>{pointerRow?.sourceMailbox || '—'}</span>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Message-ID</span>
                  <span className={styles.metaMono}>{pointerRow?.sourceMessageId || '—'}</span>
                </div>
              </div>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="primary"
                icon={<Copy size={16} />}
                onClick={() => pointerRow && void copyPointer(pointerRow)}
              >
                Copy reference
              </Button>
              <Button appearance="secondary" onClick={() => setPointerRow(null)}>
                Close
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Reclassify / override — app-side suggestion only (does NOT move Outlook folders). */}
      <ReclassifyDialog
        row={reclassifyRow}
        onClose={() => setReclassifyRow(null)}
        onDone={() => {
          setReclassifyRow(null);
          refresh();
        }}
        dispatchToast={dispatchToast}
      />

      {/* Quick-peek drawer — LINKED rows only; unlinked rows never peek.
          Prev/Next walk the linked rows' case ids snapshotted at open. */}
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

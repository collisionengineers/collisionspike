import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Caption1,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Menu,
  MenuDivider,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  SearchBox,
  Tab,
  TabList,
  Text,
  Toast,
  ToastBody,
  ToastTitle,
  Tooltip,
  createTableColumn,
  makeStyles,
  mergeClasses,
  tokens,
  useToastController,
  type SelectTabData,
  type SelectTabEvent,
  type TableColumnDefinition,
  type TableColumnSizingOptions,
} from '@fluentui/react-components';
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  Inbox as InboxIcon,
  Link2,
  Mail,
  MailQuestion,
  MoreHorizontal,
  Paperclip,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import {
  SectionHeading,
  VrmPlate,
  EmptyState,
  ErrorState,
  DataGridSkeleton,
  GLOBAL_TOASTER_ID,
} from '../components';
import {
  data,
  useInbox,
  useInboundCounts,
  type InboundCategory,
  type InboundEmail,
  type InboundSubtype,
  type TriageState,
} from '../data';

/* Inbox / Triage at /inbox (Phase 8 — ADR-0015 · IMPLEMENTATION-PLAN slice B-app).
   - Faceted TabList across the three categories — Receiving work / Queries / Other
     (the Other tab is mandatory: the catch-all bucket for unidentified email).
   - Toolbar: SearchBox (subject / from / domain / VRM / Case-PO) + Subtype (scoped
     to the active category) + Triage state.
   - Fluent v9 declarative DataGrid (mirrors CaseList): From · Subject + preview ·
     Classification (subtype + confidence) · Ref (body VRM / Case-PO) · Received ·
     Triage state · row actions.
   - query/other rows carry NO persisted .eml (A7) — "Open in mailbox" reveals the
     metadata POINTER (source mailbox + Message-ID) for the operator to find the
     mail by hand. CSP-safe: no external navigation, no iframe, no raw fetch.
   - Mark actioned / Dismiss / Reopen write cr1bd_triagestate via the seam
     (setTriageState → a direct UpdateRecord; connector op only).
   - Convert-to-Case + LLM-reclassify are DEFERRED to Phase C — not built here. */

const CATEGORY_ORDER: InboundCategory[] = ['receiving_work', 'query', 'other'];

const CATEGORY_LABEL: Record<InboundCategory, string> = {
  receiving_work: 'Receiving work',
  query: 'Queries',
  other: 'Other',
};

const SUBTYPE_LABEL: Record<InboundSubtype, string> = {
  existing_provider_instruction: 'Provider instruction',
  existing_provider_audit: 'Audit re-inspection',
  new_client_work: 'New client work',
  query_existing_work: 'Query — existing work',
  query_new_enquiry: 'New enquiry',
  other: 'Unidentified',
};

/** Subtypes that belong under each category — scopes the Subtype dropdown. */
const SUBTYPES_BY_CATEGORY: Record<InboundCategory, InboundSubtype[]> = {
  receiving_work: ['existing_provider_instruction', 'existing_provider_audit', 'new_client_work'],
  query: ['query_existing_work', 'query_new_enquiry'],
  other: ['other'],
};

const TRIAGE_LABEL: Record<TriageState, string> = {
  new: 'New',
  routed: 'Routed',
  actioned: 'Actioned',
  dismissed: 'Dismissed',
};

const TAB_ICON: Record<InboundCategory, typeof Briefcase> = {
  receiving_work: Briefcase,
  query: MailQuestion,
  other: Mail,
};

const ANY = '__any__';

const EMPTY_HINT: Record<InboundCategory, string> = {
  receiving_work:
    'Nothing here — instruction and audit emails that became (or will become) Cases land in this tab.',
  query: 'No queries right now — chasers and enquiries about work land here.',
  other:
    'Nothing unidentified — auto-replies, bounces and newsletters fall through to this catch-all.',
};

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  tabs: { marginTop: `-${tokens.spacingVerticalS}` },

  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
  },
  search: { width: '280px', maxWidth: '40vw' },
  filter: { display: 'flex', flexDirection: 'column', gap: '2px' },
  filterLabel: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '10px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
  },
  filterControl: { minWidth: '180px' },
  spacer: { flex: 1 },
  count: { color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap', alignSelf: 'center' },

  grid: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
  },

  fromCell: { display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.25 },
  fromAddr: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  muted: { color: tokens.colorNeutralForeground3 },
  mono: { fontFamily: 'var(--ce-font-mono)', textTransform: 'uppercase' },

  subjCell: { display: 'flex', flexDirection: 'column', minWidth: 0, gap: '2px', lineHeight: 1.25 },
  subjLine: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, minWidth: 0 },
  subjText: {
    fontWeight: tokens.fontWeightSemibold,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  preview: {
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  },
  clip: { flexShrink: 0, color: tokens.colorNeutralForeground3, display: 'inline-flex' },

  classStack: { display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' },
  subtypeBadge: { maxWidth: '100%' },

  // Triage-state badges — same severity idiom as StatusBadge (never colour-only).
  badgeBase: { fontWeight: tokens.fontWeightSemibold },
  badgeNew: {
    backgroundColor: 'var(--ce-amber)',
    color: 'var(--ce-amber-ink)',
    border: '1px solid var(--ce-amber-line)',
  },
  badgeInfo: {
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground2,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  badgeMuted: {
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },

  actionsCell: { display: 'inline-flex', justifyContent: 'center', width: '100%' },

  // Visually-hidden text that still names the icon-only Actions column for AT.
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

  // "Open in mailbox" pointer dialog.
  pointerGrid: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  pointerRow: { display: 'flex', flexDirection: 'column', gap: '2px' },
  pointerLabel: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '10px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
  },
  pointerValue: {
    fontFamily: 'var(--ce-font-mono)',
    wordBreak: 'break-all',
    color: tokens.colorNeutralForeground1,
  },
  pointerNote: { color: tokens.colorNeutralForeground3 },
});

/** Banded confidence label (matches the classifier's 0.95/0.8/0.6/0.3 bands). */
function confidenceLabel(confidence: number): string {
  const pct = `${Math.round(confidence * 100)}%`;
  if (confidence >= 0.95) return `Strong · ${pct}`;
  if (confidence >= 0.8) return `Good · ${pct}`;
  if (confidence >= 0.6) return `Weak · ${pct}`;
  return `Abstain · ${pct}`;
}

/** Format an ISO/Dataverse DateTime as DD/MM/YYYY HH:mm (mirrors the activity feed). */
function formatReceived(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function TriageBadge({ state }: { state: TriageState }) {
  const styles = useStyles();
  if (state === 'actioned') {
    return (
      <Badge
        className={styles.badgeBase}
        appearance="filled"
        color="success"
        size="small"
        shape="rounded"
        icon={<CheckCircle2 size={12} strokeWidth={2} />}
      >
        {TRIAGE_LABEL.actioned}
      </Badge>
    );
  }
  const map: Record<Exclude<TriageState, 'actioned'>, { cls: string; Icon: typeof Circle }> = {
    new: { cls: styles.badgeNew, Icon: AlertCircle },
    routed: { cls: styles.badgeInfo, Icon: Link2 },
    dismissed: { cls: styles.badgeMuted, Icon: XCircle },
  };
  const { cls, Icon } = map[state];
  return (
    <Badge
      className={mergeClasses(styles.badgeBase, cls)}
      appearance="filled"
      size="small"
      shape="rounded"
      icon={<Icon size={12} strokeWidth={2} />}
    >
      {TRIAGE_LABEL[state]}
    </Badge>
  );
}

export function Inbox() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  const [category, setCategory] = useState<InboundCategory>('receiving_work');
  const [search, setSearch] = useState('');
  const [subtypeFilter, setSubtypeFilter] = useState<InboundSubtype | typeof ANY>(ANY);
  const [stateFilter, setStateFilter] = useState<TriageState | typeof ANY>(ANY);
  // The row whose mailbox POINTER is shown in the dialog (query/other; no .eml).
  const [pointerRow, setPointerRow] = useState<InboundEmail | null>(null);

  const inbox = useInbox(category);
  const counts = useInboundCounts();
  const rows = useMemo(() => inbox.data ?? [], [inbox.data]);

  const subtypeOptions = SUBTYPES_BY_CATEGORY[category];
  // Hide the Subtype filter where the category has a single subtype (e.g. Other),
  // so it isn't a no-op dropdown — mirrors CaseList's showStatusFilter (queues #1).
  const showSubtypeFilter = subtypeOptions.length > 1;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((e) => {
      if (subtypeFilter !== ANY && e.subtype !== subtypeFilter) return false;
      if (stateFilter !== ANY && e.triageState !== stateFilter) return false;
      if (q) {
        const hay = [
          e.subject,
          e.fromAddress,
          e.senderDomain,
          e.bodyVrm,
          e.bodyCaseref,
          e.name,
          e.bodyPreview,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, subtypeFilter, stateFilter]);

  const onTabSelect = (_e: SelectTabEvent, d: SelectTabData) => {
    setCategory(d.value as InboundCategory);
    setSubtypeFilter(ANY);
    setStateFilter(ANY);
  };

  const refresh = () => {
    inbox.refetch();
    counts.refetch();
  };

  const setTriage = async (row: InboundEmail, next: TriageState) => {
    try {
      await data.setTriageState(row.id, next);
      dispatchToast(
        <Toast>
          <ToastTitle>Marked “{TRIAGE_LABEL[next]}”</ToastTitle>
          <ToastBody>{row.subject}</ToastBody>
        </Toast>,
        { intent: 'success' },
      );
      refresh();
    } catch (err) {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t update triage state</ToastTitle>
          <ToastBody>{err instanceof Error ? err.message : 'Please try again.'}</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    }
  };

  const copyPointer = async (row: InboundEmail) => {
    const text = `Mailbox: ${row.sourceMailbox}\nMessage-ID: ${row.sourceMessageId}`;
    try {
      await navigator.clipboard.writeText(text);
      dispatchToast(
        <Toast>
          <ToastTitle>Mailbox pointer copied</ToastTitle>
          <ToastBody>Search your mailbox for this Message-ID.</ToastBody>
        </Toast>,
        { intent: 'success' },
      );
    } catch {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t copy — select the text manually</ToastTitle>
        </Toast>,
        { intent: 'error' },
      );
    }
  };

  const columnSizing: TableColumnSizingOptions = useMemo(
    () => ({
      from: { minWidth: 170, idealWidth: 190, defaultWidth: 190 },
      subject: { minWidth: 220, idealWidth: 320, defaultWidth: 320 },
      classification: { minWidth: 160, idealWidth: 180, defaultWidth: 180 },
      ref: { minWidth: 120, idealWidth: 140, defaultWidth: 140 },
      received: { minWidth: 120, idealWidth: 145, defaultWidth: 145 },
      state: { minWidth: 110, idealWidth: 120, defaultWidth: 120 },
      actions: { minWidth: 56, idealWidth: 56, defaultWidth: 56, padding: 0 },
    }),
    [],
  );

  const columns: TableColumnDefinition<InboundEmail>[] = useMemo(
    () => [
      createTableColumn<InboundEmail>({
        columnId: 'from',
        renderHeaderCell: () => 'From',
        renderCell: (e) => (
          <span className={styles.fromCell}>
            <span className={styles.fromAddr} title={e.fromAddress}>
              {e.fromAddress || '—'}
            </span>
            {e.senderDomain && <Caption1 className={styles.muted}>{e.senderDomain}</Caption1>}
          </span>
        ),
      }),
      createTableColumn<InboundEmail>({
        columnId: 'subject',
        renderHeaderCell: () => 'Subject',
        renderCell: (e) => (
          <span className={styles.subjCell}>
            <span className={styles.subjLine}>
              {e.hasAttachments && (
                // Tooltip relationship="label" already names the trigger span — keep
                // the icon decorative so it isn't announced a second time.
                <Tooltip content="Has attachments" relationship="label">
                  <span className={styles.clip}>
                    <Paperclip size={13} aria-hidden />
                  </span>
                </Tooltip>
              )}
              <span className={styles.subjText} title={e.subject}>
                {e.subject || '(no subject)'}
              </span>
            </span>
            {e.bodyPreview && (
              <Tooltip content={e.bodyPreview} relationship="label">
                <span className={styles.preview}>{e.bodyPreview}</span>
              </Tooltip>
            )}
          </span>
        ),
      }),
      createTableColumn<InboundEmail>({
        columnId: 'classification',
        renderHeaderCell: () => 'Classification',
        renderCell: (e) => (
          <div className={styles.classStack}>
            <Badge
              appearance="outline"
              shape="rounded"
              size="small"
              className={styles.subtypeBadge}
            >
              {SUBTYPE_LABEL[e.subtype]}
            </Badge>
            <Caption1 className={styles.muted}>{confidenceLabel(e.confidence)}</Caption1>
          </div>
        ),
      }),
      createTableColumn<InboundEmail>({
        columnId: 'ref',
        renderHeaderCell: () => 'VRM / Ref',
        renderCell: (e) =>
          e.bodyVrm ? (
            <VrmPlate vrm={e.bodyVrm} size="small" />
          ) : e.bodyCaseref ? (
            <span className={styles.mono}>{e.bodyCaseref}</span>
          ) : (
            <span className={mergeClasses(styles.mono, styles.muted)}>—</span>
          ),
      }),
      createTableColumn<InboundEmail>({
        columnId: 'received',
        renderHeaderCell: () => 'Received',
        renderCell: (e) => (
          <Caption1 className={styles.muted}>{formatReceived(e.receivedOn)}</Caption1>
        ),
      }),
      createTableColumn<InboundEmail>({
        columnId: 'state',
        renderHeaderCell: () => 'Triage',
        renderCell: (e) => <TriageBadge state={e.triageState} />,
      }),
      createTableColumn<InboundEmail>({
        columnId: 'actions',
        renderHeaderCell: () => <span className={styles.srOnly}>Actions</span>,
        renderCell: (e) => {
          return (
            <span className={styles.actionsCell}>
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<MoreHorizontal size={16} />}
                    aria-label={`Actions for “${e.subject || e.fromAddress}”`}
                  />
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    {e.caseId ? (
                      <MenuItem
                        icon={<ExternalLink size={16} />}
                        onClick={() => navigate(`/case/${e.caseId}`)}
                      >
                        View case
                      </MenuItem>
                    ) : (
                      // No Case yet (any category) — reveal the mailbox pointer so the
                      // source email is still reachable. Convert-to-Case is Phase C.
                      <MenuItem icon={<Mail size={16} />} onClick={() => setPointerRow(e)}>
                        Open in mailbox…
                      </MenuItem>
                    )}
                    <MenuDivider />
                    {e.triageState !== 'actioned' && (
                      <MenuItem
                        icon={<CheckCircle2 size={16} />}
                        onClick={() => void setTriage(e, 'actioned')}
                      >
                        Mark as actioned
                      </MenuItem>
                    )}
                    {e.triageState !== 'dismissed' && (
                      <MenuItem
                        icon={<XCircle size={16} />}
                        onClick={() => void setTriage(e, 'dismissed')}
                      >
                        Dismiss
                      </MenuItem>
                    )}
                    {(e.triageState === 'actioned' || e.triageState === 'dismissed') && (
                      <MenuItem
                        icon={<RotateCcw size={16} />}
                        onClick={() => void setTriage(e, 'new')}
                      >
                        Reopen
                      </MenuItem>
                    )}
                  </MenuList>
                </MenuPopover>
              </Menu>
            </span>
          );
        },
      }),
    ],
    // styles/navigate/setTriage are stable across renders for the grid's purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [styles],
  );

  const filtersActive = search.trim() !== '' || subtypeFilter !== ANY || stateFilter !== ANY;

  return (
    <div className={mergeClasses('ce-enter', styles.root)}>
      <SectionHeading
        eyebrow="Triage"
        heading="Inbox"
        subtitle="Every email to the shared inboxes, classified. Work flows to Cases; queries and everything else are triaged here."
      />

      <TabList
        className={styles.tabs}
        selectedValue={category}
        onTabSelect={onTabSelect}
        aria-label="Inbound categories"
      >
        {CATEGORY_ORDER.map((c) => {
          const Icon = TAB_ICON[c];
          const n = counts.data?.[c];
          return (
            <Tab key={c} value={c} icon={<Icon size={16} />}>
              {CATEGORY_LABEL[c]}
              {n !== undefined ? ` (${n})` : ''}
            </Tab>
          );
        })}
      </TabList>

      <div className={styles.toolbar} role="search">
        <SearchBox
          className={styles.search}
          placeholder="Search subject, from, domain, VRM, Case/PO…"
          value={search}
          onChange={(_e, d) => setSearch(d.value)}
          aria-label="Search inbound email"
        />

        {showSubtypeFilter && (
          <div className={styles.filter}>
            <span className={styles.filterLabel} id="filter-subtype">
              Subtype
            </span>
            <Dropdown
              className={styles.filterControl}
              aria-labelledby="filter-subtype"
              value={subtypeFilter === ANY ? 'All subtypes' : SUBTYPE_LABEL[subtypeFilter]}
              selectedOptions={[subtypeFilter]}
              onOptionSelect={(_e, d) =>
                setSubtypeFilter((d.optionValue as InboundSubtype | typeof ANY) ?? ANY)
              }
            >
              <Option value={ANY} text="All subtypes">
                All subtypes
              </Option>
              {subtypeOptions.map((s) => (
                <Option key={s} value={s} text={SUBTYPE_LABEL[s]}>
                  {SUBTYPE_LABEL[s]}
                </Option>
              ))}
            </Dropdown>
          </div>
        )}

        <div className={styles.filter}>
          <span className={styles.filterLabel} id="filter-triage">
            Triage state
          </span>
          <Dropdown
            className={styles.filterControl}
            aria-labelledby="filter-triage"
            value={stateFilter === ANY ? 'All states' : TRIAGE_LABEL[stateFilter]}
            selectedOptions={[stateFilter]}
            onOptionSelect={(_e, d) =>
              setStateFilter((d.optionValue as TriageState | typeof ANY) ?? ANY)
            }
          >
            <Option value={ANY} text="All states">
              All states
            </Option>
            {(Object.keys(TRIAGE_LABEL) as TriageState[]).map((s) => (
              <Option key={s} value={s} text={TRIAGE_LABEL[s]}>
                {TRIAGE_LABEL[s]}
              </Option>
            ))}
          </Dropdown>
        </div>

        <div className={styles.spacer} />
        <Text className={styles.count} size={200}>
          {filtered.length} of {rows.length} email{rows.length === 1 ? '' : 's'}
        </Text>
      </div>

      {inbox.loading && inbox.data === undefined ? (
        <DataGridSkeleton rows={8} />
      ) : inbox.error && inbox.data === undefined ? (
        <ErrorState error={inbox.error} onRetry={inbox.refetch} title="Couldn’t load the inbox" />
      ) : filtered.length === 0 ? (
        rows.length === 0 ? (
          <EmptyState
            icon={<InboxIcon size={32} strokeWidth={1.5} aria-hidden />}
            title={`No “${CATEGORY_LABEL[category]}” email right now.`}
            hint={EMPTY_HINT[category]}
          />
        ) : (
          <EmptyState
            icon={<InboxIcon size={32} strokeWidth={1.5} aria-hidden />}
            title="No email matches the current filters."
            hint={filtersActive ? 'Clear the search box or dropdowns to widen the results.' : undefined}
          />
        )
      ) : (
        <div className={styles.grid}>
          <DataGrid
            items={filtered}
            columns={columns}
            getRowId={(e) => e.id}
            resizableColumns
            columnSizingOptions={columnSizing}
            aria-label={`Inbound email — ${CATEGORY_LABEL[category]}`}
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
                <DataGridRow<InboundEmail> key={rowId}>
                  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        </div>
      )}

      {/* Mailbox POINTER dialog — query/other rows hold no persisted .eml (A7), so we
          surface the source mailbox + Message-ID for the operator to find the mail by
          hand. No external navigation / iframe — CSP-safe. */}
      <Dialog open={pointerRow !== null} onOpenChange={(_e, d) => !d.open && setPointerRow(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Open in mailbox</DialogTitle>
            <DialogContent>
              <div className={styles.pointerGrid}>
                <Text className={styles.pointerNote}>
                  No copy of this email is stored in the app. Open the shared mailbox below and
                  search for this Message-ID to find it.
                </Text>
                <div className={styles.pointerRow}>
                  <span className={styles.pointerLabel}>Mailbox</span>
                  <span className={styles.pointerValue}>{pointerRow?.sourceMailbox || '—'}</span>
                </div>
                <div className={styles.pointerRow}>
                  <span className={styles.pointerLabel}>Message-ID</span>
                  <span className={styles.pointerValue}>{pointerRow?.sourceMessageId || '—'}</span>
                </div>
              </div>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="primary"
                icon={<Copy size={16} />}
                onClick={() => pointerRow && void copyPointer(pointerRow)}
              >
                Copy pointer
              </Button>
              <Button appearance="secondary" onClick={() => setPointerRow(null)}>
                Close
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

export default Inbox;

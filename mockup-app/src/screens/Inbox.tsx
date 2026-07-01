import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Field,
  Link,
  Menu,
  MenuDivider,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Radio,
  RadioGroup,
  SearchBox,
  Spinner,
  Tab,
  TabList,
  Text,
  Textarea,
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
  FileText,
  Inbox as InboxIcon,
  Link2,
  Mail,
  MailQuestion,
  MoreHorizontal,
  Paperclip,
  PencilLine,
  RotateCcw,
  Tags,
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
import { data, useInbox, useInboundCounts } from '../data';
import type {
  InboundCategory,
  InboundEmail,
  InboundSubtype,
  InboundView,
  TriageState,
} from '@cs/domain';

/* Inbox / Triage at /inbox — a REAL work queue (work-todo-spike: email-management).
   - Faceted TabList across the three categories — Receiving work / Queries / Other.
   - ACTIVE-FIRST: the list defaults to view='active' (handled rows hidden). Dismiss /
     Mark actioned REMOVE the row from the active view (optimistic hide + refetch on the
     throwing setTriageState mutation — never a fake success). A "Show" toggle
     (Active / Handled / All) reopens handled email.
   - SUGGESTED TAGS: the classifier's suggestion is shown as the current classification;
     staff can override it (Change classification… → reclassifyInbound) and an overridden
     row is visibly flagged. App-side suggestion only — this does NOT move Outlook folders.
   - CLICKABLE ROWS: a linked email's subject opens its Case; an unlinked subject opens the
     stored email preview is available on every row; unlinked rows keep the
     mailbox pointer affordance. CSP-safe: no external navigation, no iframe, no raw fetch. */

const CATEGORY_ORDER: InboundCategory[] = [
  'receiving_work',
  'query',
  'billing',
  'non_actionable',
  'other',
];

const CATEGORY_LABEL: Record<InboundCategory, string> = {
  receiving_work: 'Receiving work',
  query: 'Queries',
  billing: 'Billing',
  non_actionable: 'No action',
  other: 'Other',
};

const SUBTYPE_LABEL: Record<InboundSubtype, string> = {
  existing_provider_instruction: 'Provider instruction',
  existing_provider_audit: 'Audit re-inspection',
  existing_provider_diminution: 'Diminution',
  new_client_work: 'New client work',
  query_existing_work: 'Case query',
  query_new_enquiry: 'New enquiry',
  billing_request: 'Invoice request',
  case_summary: 'Case summary',
  acknowledgement: 'Acknowledgement',
  other: 'Unidentified',
};

/** Subtypes that belong under each category — scopes the Subtype dropdown. */
const SUBTYPES_BY_CATEGORY: Record<InboundCategory, InboundSubtype[]> = {
  receiving_work: [
    'existing_provider_instruction',
    'existing_provider_audit',
    'existing_provider_diminution',
    'new_client_work',
  ],
  // The Enquiries-vs-Case-Queries split (TKT-034) lives here, as the two query subtypes.
  query: ['query_existing_work', 'query_new_enquiry'],
  billing: ['billing_request'],
  non_actionable: ['case_summary', 'acknowledgement'],
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
  billing: Mail,
  non_actionable: Mail,
  other: Mail,
};

/** The handler-facing override taxonomy (work-todo-spike: suggested-tags-and-folders).
 *  `reclassifyInbound` maps the tag onto category+subtype server-side. */
const RECLASSIFY_TAGS = ['Inspection', 'New client work', 'Audit', 'Diminution', 'Query'] as const;
type ReclassifyTag = (typeof RECLASSIFY_TAGS)[number];

/** Best-effort current tag from the chosen subtype (prefills the override radio). */
function subtypeToTag(subtype: InboundSubtype): ReclassifyTag | undefined {
  switch (subtype) {
    case 'existing_provider_audit':
      return 'Audit';
    case 'existing_provider_diminution':
      return 'Diminution';
    case 'query_existing_work':
    case 'query_new_enquiry':
      return 'Query';
    case 'existing_provider_instruction':
      return 'Inspection';
    case 'new_client_work':
      return 'New client work';
    default:
      return undefined;
  }
}

const ANY = '__any__';

const VIEW_LABEL: Record<InboundView, string> = {
  active: 'Active',
  handled: 'Handled',
  all: 'All',
};

function parseInboxCategory(value: string | null): InboundCategory {
  return CATEGORY_ORDER.includes(value as InboundCategory) ? (value as InboundCategory) : 'receiving_work';
}

function parseInboxView(value: string | null): InboundView {
  return value === 'handled' || value === 'all' ? value : 'active';
}

const EMPTY_HINT: Record<InboundCategory, string> = {
  receiving_work:
    'Nothing to action — instruction and audit emails that became (or will become) Cases land in this tab.',
  query: 'No queries to action — chasers and enquiries about work land here.',
  billing: 'No billing requests — emails asking for an invoice/fee for completed work land here.',
  non_actionable:
    'Nothing here — case-summary digests and bare acknowledgements ("Thanks") that need no action land here.',
  other:
    'Nothing unidentified to action — auto-replies, bounces and newsletters fall through to this catch-all.',
};

const isHandledState = (s: TriageState): boolean => s === 'actioned' || s === 'dismissed';

/** True when staff have overridden the classifier (chosen value ≠ suggested value). */
function isOverridden(e: InboundEmail): boolean {
  return (
    (e.suggestedCategory !== undefined && e.suggestedCategory !== e.category) ||
    (e.suggestedSubtype !== undefined && e.suggestedSubtype !== e.subtype)
  );
}

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

  // "Showing cached" banner — a refetch failed but the previously-loaded rows are
  // still on screen, so we keep them and flag staleness rather than blanking the queue.
  staleBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: '2px',
    border: '1px solid var(--ce-amber-line)',
    backgroundColor: 'var(--ce-amber-tint)',
    color: 'var(--ce-amber-ink)',
    fontSize: '13px',
  },
  staleIcon: { flexShrink: 0, display: 'inline-flex' },
  staleText: { flex: 1, minWidth: 0 },

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
  // Subject as a link/button — opens the Case (linked) or the stored email (unlinked).
  subjLink: {
    fontWeight: tokens.fontWeightSemibold,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'left',
    maxWidth: '100%',
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
  // "Overridden" flag — staff changed the classifier's suggestion (info idiom + icon).
  overrideChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontWeight: tokens.fontWeightSemibold,
    backgroundColor: 'var(--ce-amber-tint)',
    color: 'var(--ce-amber-ink)',
    border: '1px solid var(--ce-amber-line)',
  },

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

  // Shared dialog scaffolding (full-email view, mailbox pointer, reclassify).
  dialogGrid: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  metaRow: { display: 'flex', flexDirection: 'column', gap: '2px' },
  metaLabel: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '10px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
  },
  metaValue: { color: tokens.colorNeutralForeground1 },
  metaMono: {
    fontFamily: 'var(--ce-font-mono)',
    wordBreak: 'break-all',
    color: tokens.colorNeutralForeground1,
  },
  emailBody: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '40vh',
    overflowY: 'auto',
    padding: tokens.spacingVerticalM,
    borderRadius: '2px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    lineHeight: 1.5,
  },
  dialogNote: { color: tokens.colorNeutralForeground3 },
  suggestLine: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, flexWrap: 'wrap' },
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  const [category, setCategory] = useState<InboundCategory>(() =>
    parseInboxCategory(searchParams.get('category')),
  );
  const [search, setSearch] = useState('');
  const [subtypeFilter, setSubtypeFilter] = useState<InboundSubtype | typeof ANY>(ANY);
  const [view, setView] = useState<InboundView>(() => parseInboxView(searchParams.get('view'))); // active-first
  // Dialog targets: the email-body view, the mailbox pointer (unlinked), the reclassify form.
  const [emailRow, setEmailRow] = useState<InboundEmail | null>(null);
  const [pointerRow, setPointerRow] = useState<InboundEmail | null>(null);
  const [reclassifyRow, setReclassifyRow] = useState<InboundEmail | null>(null);
  // Ids optimistically hidden after a triage change that moves the row OUT of the
  // current view — cleared when fresh server data resolves (which already excludes them).
  const [pendingHidden, setPendingHidden] = useState<Set<string>>(() => new Set());

  const inbox = useInbox({
    category,
    subtype: subtypeFilter === ANY ? undefined : subtypeFilter,
    view,
  });
  const counts = useInboundCounts();
  const rows = useMemo(() => inbox.data ?? [], [inbox.data]);

  useEffect(() => {
    const nextCategory = parseInboxCategory(searchParams.get('category'));
    const nextView = parseInboxView(searchParams.get('view'));
    setCategory((prev) => {
      if (prev === nextCategory) return prev;
      setSubtypeFilter(ANY);
      return nextCategory;
    });
    setView(nextView);
  }, [searchParams]);

  // Fresh data resolved → the server slice is authoritative again; drop optimistic hides.
  useEffect(() => {
    setPendingHidden((prev) => (prev.size === 0 ? prev : new Set()));
  }, [inbox.data]);

  const subtypeOptions = SUBTYPES_BY_CATEGORY[category];
  // Hide the Subtype filter where the category has a single subtype (e.g. Other).
  const showSubtypeFilter = subtypeOptions.length > 1;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((e) => {
      if (pendingHidden.has(e.id)) return false;
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
  }, [rows, search, pendingHidden]);

  const onTabSelect = (_e: SelectTabEvent, d: SelectTabData) => {
    const nextCategory = d.value as InboundCategory;
    setCategory(nextCategory);
    setSubtypeFilter(ANY);
    const next = new URLSearchParams(searchParams);
    next.set('category', nextCategory);
    setSearchParams(next, { replace: true });
  };

  const onViewSelect = (_e: SelectTabEvent, d: SelectTabData) => {
    const nextView = d.value as InboundView;
    setView(nextView);
    const next = new URLSearchParams(searchParams);
    next.set('view', nextView);
    setSearchParams(next, { replace: true });
  };

  const refresh = () => {
    inbox.refetch();
    counts.refetch();
  };

  /** Mark/dismiss/reopen a row. The mutation THROWS on failure, so we only show
   *  success (and optimistically hide the row when it leaves the view) after it
   *  resolves — never a fake success. */
  const setTriage = async (row: InboundEmail, next: TriageState) => {
    try {
      await data.setTriageState(row.id, next);
      // Optimistically drop the row when the change moves it out of the active /
      // handled view (so Dismiss / Mark actioned visibly removes it now).
      const leavesView =
        (view === 'active' && isHandledState(next)) ||
        (view === 'handled' && !isHandledState(next));
      if (leavesView) {
        setPendingHidden((prev) => {
          const nextSet = new Set(prev);
          nextSet.add(row.id);
          return nextSet;
        });
      }
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
          <ToastTitle>Couldn’t update this email. Please try again.</ToastTitle>
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
          <ToastTitle>Email reference copied</ToastTitle>
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
      classification: { minWidth: 170, idealWidth: 190, defaultWidth: 190 },
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
                <Tooltip content="Has attachments" relationship="label">
                  <span className={styles.clip}>
                    <Paperclip size={13} aria-hidden />
                  </span>
                </Tooltip>
              )}
              {/* A linked email's subject opens its Case; an unlinked one opens the
                  stored email body — every subject is a clickable affordance. */}
              <Link
                as="button"
                className={styles.subjLink}
                title={e.caseId ? `Open case · ${e.subject}` : `View email · ${e.subject}`}
                onClick={() => (e.caseId ? navigate(`/case/${e.caseId}`) : setEmailRow(e))}
              >
                {e.subject || '(no subject)'}
              </Link>
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
        renderCell: (e) => {
          const overridden = isOverridden(e);
          return (
            <div className={styles.classStack}>
              <Badge appearance="outline" shape="rounded" size="small" className={styles.subtypeBadge}>
                {SUBTYPE_LABEL[e.subtype]}
              </Badge>
              {overridden ? (
                <Tooltip
                  content={`Classifier suggested: ${
                    e.suggestedSubtype ? SUBTYPE_LABEL[e.suggestedSubtype] : CATEGORY_LABEL[e.suggestedCategory ?? e.category]
                  }`}
                  relationship="label"
                >
                  <Badge
                    appearance="tint"
                    shape="rounded"
                    size="small"
                    className={styles.overrideChip}
                    icon={<PencilLine size={11} strokeWidth={2} />}
                  >
                    Overridden
                  </Badge>
                </Tooltip>
              ) : (
                <Caption1 className={styles.muted}>{confidenceLabel(e.confidence)}</Caption1>
              )}
            </div>
          );
        },
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
        renderHeaderCell: () => 'Status',
        renderCell: (e) => <TriageBadge state={e.triageState} />,
      }),
      createTableColumn<InboundEmail>({
        columnId: 'actions',
        renderHeaderCell: () => <span className={styles.srOnly}>Actions</span>,
        renderCell: (e) => (
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
                  {e.caseId && (
                    <MenuItem icon={<Briefcase size={16} />} onClick={() => navigate(`/case/${e.caseId}`)}>
                      View case
                    </MenuItem>
                  )}
                  <MenuItem icon={<FileText size={16} />} onClick={() => setEmailRow(e)}>
                    View email preview
                  </MenuItem>
                  {!e.caseId && (
                    <MenuItem icon={<Mail size={16} />} onClick={() => setPointerRow(e)}>
                      Open in mailbox…
                    </MenuItem>
                  )}
                  <MenuDivider />
                  <MenuItem icon={<Tags size={16} />} onClick={() => setReclassifyRow(e)}>
                    Change classification…
                  </MenuItem>
                  <MenuDivider />
                  {e.triageState !== 'actioned' && (
                    <MenuItem icon={<CheckCircle2 size={16} />} onClick={() => void setTriage(e, 'actioned')}>
                      Mark as actioned
                    </MenuItem>
                  )}
                  {e.triageState !== 'dismissed' && (
                    <MenuItem icon={<XCircle size={16} />} onClick={() => void setTriage(e, 'dismissed')}>
                      Dismiss
                    </MenuItem>
                  )}
                  {isHandledState(e.triageState) && (
                    <MenuItem icon={<RotateCcw size={16} />} onClick={() => void setTriage(e, 'new')}>
                      Reopen
                    </MenuItem>
                  )}
                </MenuList>
              </MenuPopover>
            </Menu>
          </span>
        ),
      }),
    ],
    // styles/navigate/setTriage are stable across renders for the grid's purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [styles, view],
  );

  const filtersActive = search.trim() !== '' || subtypeFilter !== ANY;
  const emptyTitle =
    view === 'handled'
      ? `No handled “${CATEGORY_LABEL[category]}” email.`
      : view === 'all'
        ? `No “${CATEGORY_LABEL[category]}” email yet.`
        : `Nothing to action in “${CATEGORY_LABEL[category]}”.`;
  const emptyHint =
    view === 'handled'
      ? 'Email you dismiss or mark as actioned shows here — reopen it to put it back in the queue.'
      : EMPTY_HINT[category];

  return (
    <div className={mergeClasses('ce-enter', styles.root)}>
      <SectionHeading
        eyebrow="Triage"
        heading="Inbox"
        subtitle="Every email to the shared inboxes, classified. Action it here — work flows to Cases; queries and everything else are dismissed or actioned."
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

        <div className={styles.spacer} />

        {/* Active-first view toggle — Active hides handled rows; Handled / All reopen them. */}
        <div className={styles.filter}>
          <span className={styles.filterLabel} id="filter-view">
            Show
          </span>
            <TabList
              aria-labelledby="filter-view"
              selectedValue={view}
              onTabSelect={onViewSelect}
              size="small"
            >
            {(Object.keys(VIEW_LABEL) as InboundView[]).map((v) => (
              <Tab key={v} value={v}>
                {VIEW_LABEL[v]}
              </Tab>
            ))}
          </TabList>
        </div>

        <Text className={styles.count} size={200}>
          {filtered.length} of {rows.length} email{rows.length === 1 ? '' : 's'}
        </Text>
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
            title={emptyTitle}
            hint={emptyHint}
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
            aria-label={`Inbound email — ${CATEGORY_LABEL[category]} (${VIEW_LABEL[view]})`}
          >
            <DataGridHeader>
              <DataGridRow>
                {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
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

      {/* View email preview — renders the stored body the app already holds. Self-contained:
          no API call, no iframe, no external navigation (CSP-safe). */}
      <ViewEmailDialog
        row={emailRow}
        onClose={() => setEmailRow(null)}
        onOpenCase={(id) => {
          setEmailRow(null);
          navigate(`/case/${id}`);
        }}
        onCopyReference={copyPointer}
      />

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
    </div>
  );
}

/* ----------  View email preview (stored body)  ---------- */

function ViewEmailDialog({
  row,
  onClose,
  onOpenCase,
  onCopyReference,
}: {
  row: InboundEmail | null;
  onClose: () => void;
  onOpenCase: (caseId: string) => void;
  onCopyReference: (row: InboundEmail) => void;
}) {
  const styles = useStyles();
  return (
    <Dialog open={row !== null} onOpenChange={(_e, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{row?.subject || '(no subject)'}</DialogTitle>
          <DialogContent>
            {row && (
              <div className={styles.dialogGrid}>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>From</span>
                  <span className={styles.metaValue}>
                    {row.fromAddress || '—'}
                    {row.senderDomain ? ` · ${row.senderDomain}` : ''}
                  </span>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Received</span>
                  <span className={styles.metaValue}>{formatReceived(row.receivedOn)}</span>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Classification</span>
                  <span className={styles.metaValue}>
                    {CATEGORY_LABEL[row.category]} · {SUBTYPE_LABEL[row.subtype]}
                  </span>
                </div>
                <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>Preview</span>
                    <div className={styles.emailBody}>
                      {row.bodyPreview?.trim()
                        ? row.bodyPreview
                        : 'No message text was captured for this email. Use “Open in mailbox” to find the original.'}
                    </div>
                  </div>
                  <Text className={styles.dialogNote}>
                    This is the saved preview. Use the mailbox reference if you need the original message.
                  </Text>
                </div>
            )}
          </DialogContent>
          <DialogActions>
            {row?.caseId ? (
              <Button appearance="primary" icon={<Briefcase size={16} />} onClick={() => onOpenCase(row.caseId!)}>
                View case
              </Button>
            ) : (
              row && (
                <Button appearance="secondary" icon={<Copy size={16} />} onClick={() => onCopyReference(row)}>
                  Copy reference
                </Button>
              )
            )}
            <Button appearance="secondary" onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/* ----------  Reclassify / override (suggested tags)  ---------- */

function ReclassifyDialog({
  row,
  onClose,
  onDone,
  dispatchToast,
}: {
  row: InboundEmail | null;
  onClose: () => void;
  onDone: () => void;
  dispatchToast: ReturnType<typeof useToastController>['dispatchToast'];
}) {
  const styles = useStyles();
  const [tag, setTag] = useState<ReclassifyTag | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Seed the form from the row each time the dialog target changes.
  useEffect(() => {
    setTag(row ? subtypeToTag(row.subtype) : undefined);
    setReason('');
  }, [row]);

  const suggestedLabel = row
    ? row.suggestedSubtype
      ? SUBTYPE_LABEL[row.suggestedSubtype]
      : SUBTYPE_LABEL[row.subtype]
    : '';

  const submit = async () => {
    if (!row || !tag) return;
    setSaving(true);
    try {
      await data.reclassifyInbound(row.id, { tag, reason: reason.trim() || undefined });
      dispatchToast(
        <Toast>
          <ToastTitle>Classification updated to “{tag}”</ToastTitle>
          <ToastBody>{row.subject}</ToastBody>
        </Toast>,
        { intent: 'success' },
      );
      onDone();
    } catch (err) {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t change the classification. Please try again.</ToastTitle>
          <ToastBody>{err instanceof Error ? err.message : 'Please try again.'}</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={row !== null} onOpenChange={(_e, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Change classification</DialogTitle>
          <DialogContent>
            <div className={styles.dialogGrid}>
              <span className={styles.suggestLine}>
                <Text className={styles.dialogNote}>Suggested by the classifier:</Text>
                <Badge appearance="outline" shape="rounded" size="small">
                  {suggestedLabel || '—'}
                </Badge>
              </span>
              <Field label="Change to">
                <RadioGroup value={tag ?? ''} onChange={(_e, d) => setTag(d.value as ReclassifyTag)}>
                  {RECLASSIFY_TAGS.map((t) => (
                    <Radio key={t} value={t} label={t} />
                  ))}
                </RadioGroup>
              </Field>
              <Field label="Reason (optional)" hint="Recorded so the classifier can learn from overrides.">
                <Textarea
                  value={reason}
                  onChange={(_e, d) => setReason(d.value)}
                  resize="vertical"
                  placeholder="Why is this the right type?"
                />
              </Field>
              <Text className={styles.dialogNote}>
                This updates the tag in the app only — it does not move the email between mailbox
                folders.
              </Text>
            </div>
          </DialogContent>
          <DialogActions>
            <Button
              appearance="primary"
              icon={saving ? <Spinner size="tiny" /> : <Tags size={16} />}
              disabled={!tag || saving}
              onClick={() => void submit()}
            >
              {saving ? 'Saving…' : 'Save classification'}
            </Button>
            <Button appearance="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export default Inbox;

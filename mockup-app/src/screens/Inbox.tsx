import type { KeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Radio,
  RadioGroup,
  OptionGroup,
  SearchBox,
  Spinner,
  Switch,
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
  type TableColumnDefinition,
  type TableColumnSizingOptions,
} from '@fluentui/react-components';
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Briefcase,
  CheckCircle2,
  CircleHelp,
  Copy,
  Eye,
  FileText,
  Folder,
  Inbox as InboxIcon,
  Link2,
  Mail,
  MailCheck,
  MailQuestion,
  MoreHorizontal,
  Hourglass,
  Paperclip,
  PencilLine,
  Receipt,
  RotateCcw,
  Tags,
  Unlink,
  X,
  XCircle,
} from 'lucide-react';
import {
  SectionHeading,
  VrmPlate,
  EmptyState,
  ErrorState,
  DataGridSkeleton,
  CasePeekDrawer,
  GLOBAL_TOASTER_ID,
  useSeverityChipStyles,
  severityClassName,
  useTableTypography,
  type ChipSeverity,
} from '../components';
import { formatReceivedCompact } from '../components/date-format';
import { Pager } from '../components/Pager';
import { nextPeekId, parsePeek, withPeek, withoutPeek } from './peek';
import {
  caseLinkHeadline,
  cancellationHeadline,
  pendingRefGateSuggestion,
  refGateValue,
  CASE_LINK_SUGGESTION_TYPE,
  CANCELLATION_SUGGESTION_TYPE,
} from './inbox-suggestions';
import { whyClassifiedReasons } from './why-classified';
import { mailboxFacets, matchesMailboxFilter, type MailboxFilter } from './inbox-mailbox-filter';
import { pageWindow, slicePage, clampPage, pageOf } from './inbox-pagination';
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  EMAIL_TYPE_ALL,
  SUBTYPE_LABEL,
  SUBTYPES_BY_CATEGORY,
  emailTypeDisplayLabel,
  emailTypeParam,
  matchesEmailType,
  migrateLegacyInboxParams,
  parseEmailType,
  type EmailTypeFilter,
} from './inbox-email-type';
import { inboxStatus, inboxStatusText } from './inbox-status';
import { suggestedAction, suggestedFolder } from './inbox-suggested-action';
import {
  data,
  useInbox,
  useInboundSuggestions,
  useOutlookMove,
  useOutlookMoveGate,
  useReviewAiSuggestion,
  useDetachInbound,
} from '../data';
import type {
  AiSuggestion,
  InboundCategory,
  InboundEmail,
  InboundSubtype,
  TriageState,
} from '@cs/domain';

/* Inbox / Triage at /inbox — ONE condensed work queue (TKT-054 / 020726 E1).
   - SINGLE LIST: every email except dismissed, newest first — the category tabs,
     Triage-status links and Show Active/Handled/All toggles are gone. Filters left:
     search + mailbox chips + one "E-mail type" dropdown + a "Show dismissed" switch.
     Handled (actioned) rows stay in place, visually muted; only dismiss removes a
     row (optimistic hide + refetch on the throwing setTriageState mutation — never
     a fake success).
   - STATUS carries the case link (020726 E4): "Case created / Linked to case ·
     <Case/PO> →" opens the case; New stays the amber sort-me marker.
   - SUGGESTED ACTION (020726 E6): per-row Outlook filing suggestion from the shared
     folder derivation; with OUTLOOK_MOVE_ENABLED on the button REALLY files the
     message (queued server-side); while off it is display-only text.
   - E-MAIL TYPE (020726 E2/E3): neutral outline badge + per-category icon; staff can
     change it (Change e-mail type… → reclassifyInbound) and an overridden row is
     flagged. NO strength/confidence UI — backend-only (supersedes 010726 D16).
   - CLICKABLE ROWS: every subject opens the stored email preview; unlinked rows keep
     the mailbox pointer affordance. CSP-safe: no external navigation, no iframe. */

/** Toast wording for a triage change (handler-facing, matches the status cell). */
const TRIAGE_LABEL: Record<TriageState, string> = {
  new: 'New',
  routed: 'Linked',
  actioned: 'Handled',
  dismissed: 'Dismissed',
};

/** Per-category icon INSIDE the neutral outline e-mail-type badge (020726 E2 —
 *  icon shape is the discriminator; D3 keeps colour out of the tags). */
const CATEGORY_ICON: Record<InboundCategory, typeof Briefcase> = {
  receiving_work: Briefcase,
  query: MailQuestion,
  case_update: RotateCcw,
  // Taxonomy v3 (TKT-084) — directions held for a later instruction.
  pre_instruction: Hourglass,
  cancellation: Ban,
  billing: Receipt,
  non_actionable: MailCheck,
  other: CircleHelp,
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

/** Sentinel for the E-mail type dropdown's "All types" option. */
const TYPE_ALL_OPTION = '__all__';

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

  // Source-mailbox facet chips (TKT-025) — the SAME pattern as CaseList's
  // reason-facet chips: charcoal-selected (selection ≠ severity), never red.
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
    backgroundColor: 'var(--ce-charcoal)',
    border: '1px solid var(--ce-charcoal)',
    color: '#ffffff',
    ':hover': { backgroundColor: 'var(--ce-charcoal)' },
  },

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
  // TKT-121 — the E-mail type popover listbox is CAPPED (~10 option rows) with its
  // own scrollbar instead of growing taller than the viewport. `!important` because
  // Fluent's popover positioning (autoSize) writes an INLINE viewport-height
  // max-height on open, which would otherwise beat any class rule. Keyboard nav
  // still reaches every option: Fluent scrolls the active option into view within
  // the listbox as focus moves.
  typeListbox: {
    maxHeight: '320px !important',
    overflowY: 'auto',
  },
  spacer: { flex: 1 },
  dismissedSwitch: { alignSelf: 'center' },

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
    // Clip vertically (rounded corners + body scroll) but allow horizontal scroll so the
    // right-most actions column (the "…" menu) is never clipped when the preview sidebar
    // narrows the grid pane below the columns' total width.
    overflowX: 'auto',
    overflowY: 'hidden',
    flex: '1 1 auto',
    minWidth: 0,
  },

  workspace: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: tokens.spacingHorizontalM,
    minHeight: '420px',
  },
  gridPane: {
    flex: '1 1 60%',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  gridPaneWithSidebar: {
    flex: '1 1 55%',
  },

  previewSidebar: {
    flex: '0 0 40%',
    maxWidth: '480px',
    minWidth: '280px',
    display: 'flex',
    flexDirection: 'column',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
  },
  previewHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalM + ' ' + tokens.spacingHorizontalM,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  previewTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    color: tokens.colorNeutralForeground1,
    lineHeight: 1.3,
    minWidth: 0,
    wordBreak: 'break-word',
  },
  previewBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalM,
    overflowY: 'auto',
    flex: 1,
    minHeight: 0,
  },
  previewActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  // Sender initial — info slate callout (reforge 2026-07-01: red is budget-
  // gated to critical; an avatar is identity, not severity).
  avatarCircle: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: 'var(--ce-info-tint)',
    color: 'var(--ce-info-ink)',
    fontWeight: 700,
    fontSize: '14px',
    flexShrink: 0,
  },
  fromRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  folderLine: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    color: tokens.colorNeutralForeground3,
    fontSize: '11px',
  },
  folderName: {
    fontFamily: 'var(--ce-font-mono)',
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },

  // Selected subject — semibold ink + underline (the base is already semibold;
  // red-on-selection falsely signals severity in a red-budgeted grid).
  subjLinkSelected: {
    color: 'var(--ce-ink)',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },

  // From — ONE cellSecondary line (spec IA §2); the sender domain is demoted
  // to the cell tooltip. Typography from useTableTypography().
  fromLine: {
    display: 'block',
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  muted: { color: tokens.colorNeutralForeground3 },

  subjCell: { display: 'flex', flexDirection: 'column', minWidth: 0, gap: '2px', lineHeight: 1.25 },
  subjLine: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, minWidth: 0 },
  // Subject as a link/button — opens the Case (linked) or the stored email
  // (unlinked). Weight/size come from cellPrimary; this adds the link chrome.
  subjLink: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'left',
    maxWidth: '100%',
    cursor: 'pointer',
    ':hover': {
      color: 'var(--ce-ink)',
      textDecoration: 'underline',
      textUnderlineOffset: '2px',
    },
  },
  // Preview line — colour/size from cellSecondary; this adds the ellipsis.
  preview: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  },
  clip: { flexShrink: 0, color: tokens.colorNeutralForeground3, display: 'inline-flex' },

  classStack: { display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' },
  subtypeBadge: { maxWidth: '100%' },
  // "Why this label?" — the reasons list inside the classification cell's
  // tooltip AND the preview panel's compact caption list (same recipe, two
  // render sites: D16 keeps the CELL itself at two lines; only the tooltip
  // content and the preview panel grow richer).
  whyTooltip: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    maxWidth: '260px',
  },
  whyList: {
    margin: 0,
    paddingLeft: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  // "Overridden" flag — staff changed the arrival suggestion (amber idiom + icon).
  overrideChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontWeight: tokens.fontWeightSemibold,
    backgroundColor: 'var(--ce-warning-tint)',
    color: 'var(--ce-warning-ink)',
    border: '1px solid var(--ce-warning-line)',
  },

  // Status cell (TKT-054 / 020726 E4) — the case-link form mirrors subjLink's
  // quiet charcoal hover-underline (grid links are D17 rest-underline-exempt).
  statusLink: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'left',
    maxWidth: '100%',
    cursor: 'pointer',
    fontFamily: 'var(--ce-font-mono)',
    fontSize: '12px',
    color: tokens.colorNeutralForeground1,
    ':hover': {
      color: 'var(--ce-ink)',
      textDecoration: 'underline',
      textUnderlineOffset: '2px',
    },
  },

  // Suggested action (020726 E6): actionable = quiet transparent button;
  // display-only/lifecycle = secondary text. Failed retry uses the amber ink
  // (never colour-only — the label says "failed").
  suggestedBtn: {
    justifyContent: 'flex-start',
    maxWidth: '100%',
    overflow: 'hidden',
    fontWeight: tokens.fontWeightRegular,
  },
  suggestedText: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  suggestedFailed: { color: 'var(--ce-warning-ink)' },

  // TKT-093 — inbox-list suggest-attach hint (a pending "may belong to · <Case/PO>" line
  // under the status, so the suggestion is visible from the list, not only the opened email).
  statusCellStack: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '2px',
    minWidth: 0,
  },
  linkSuggestionHint: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    maxWidth: '100%',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  // Handled (actioned) rows stay in the single list, muted — the Status text
  // carries the state (mute is redundant encoding); full strength returns on
  // hover/focus so the quick actions stay legible.
  rowHandled: {
    opacity: 0.55,
    ':hover': { opacity: 1 },
    ':focus-within': { opacity: 1 },
  },

  actionsCell: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '2px',
    width: '100%',
    // Keep the "…" trigger a few px off the clipped right edge of the column.
    paddingRight: '6px',
  },
  quickActions: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
  },
  quickActionBtn: {
    minWidth: '32px',
    minHeight: '32px',
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
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    lineHeight: 1.6,
    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)',
    ':focus-visible': {
      outline: '2px solid var(--ce-red)',
      outlineOffset: '2px',
    },
  },
  dialogNote: { color: tokens.colorNeutralForeground3 },
  suggestLine: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, flexWrap: 'wrap' },
});

/** Format an ISO/Dataverse DateTime as DD/MM/YYYY HH:mm (mirrors the activity feed). */
function formatReceived(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* Non-link status chips — the shared severity recipes (never colour-only).
   'new' is warning amber (needs sorting, not a blocker — D4); Handled success;
   Dismissed muted; routed-without-case falls back to a neutral info chip. */
const STATUS_CHIP: Record<
  'new' | 'handled' | 'dismissed' | 'linked-unresolved',
  { severity: ChipSeverity; Icon: typeof AlertCircle }
> = {
  new: { severity: 'warning', Icon: AlertCircle },
  handled: { severity: 'success', Icon: CheckCircle2 },
  dismissed: { severity: 'muted', Icon: XCircle },
  'linked-unresolved': { severity: 'info', Icon: Link2 },
};

/** Status cell (TKT-054 / 020726 E4): case-linked rows render the Case/PO link
 *  ("Case created / Linked to case · CCPY26050 →" → the case); the rest keep
 *  icon+text chips. */
function StatusCell({ e, onOpenCase }: { e: InboundEmail; onOpenCase: (caseId: string) => void }) {
  const styles = useStyles();
  const chips = useSeverityChipStyles();
  const m = inboxStatus(e);
  if (m.kind === 'case-created' || m.kind === 'linked') {
    return (
      <Link
        as="button"
        className={styles.statusLink}
        title={`Open case${m.casePo ? ` ${m.casePo}` : ''}`}
        onClick={() => onOpenCase(m.caseId)}
      >
        {inboxStatusText(m)} <span aria-hidden="true">→</span>
        <span className="ce-sr-only"> — open case</span>
      </Link>
    );
  }
  const { severity, Icon } = STATUS_CHIP[m.kind];
  const badge = (
    <Badge
      className={chips[severityClassName(severity)]}
      appearance="filled"
      size="small"
      shape="rounded"
      icon={<Icon size={12} strokeWidth={2} />}
    >
      {inboxStatusText(m)}
    </Badge>
  );
  // TKT-093 — a not-yet-linked email with a PENDING attach suggestion shows a "may belong
  // to · <Case/PO>" hint here so the suggestion is visible from the LIST, not only inside
  // the opened email. Opening the row reveals the Attach / Not-a-match card as today.
  if (!e.caseId && e.linkSuggestionCasePo) {
    return (
      <span className={styles.statusCellStack}>
        {badge}
        <span
          className={styles.linkSuggestionHint}
          title={`Suggested: this email may belong to open case ${e.linkSuggestionCasePo} — open it to attach or dismiss`}
        >
          may belong to · {e.linkSuggestionCasePo}
        </span>
      </span>
    );
  }
  return badge;
}

export function Inbox() {
  const styles = useStyles();
  const tt = useTableTypography();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  const [search, setSearch] = useState('');
  // The two URL-backed filters of the single-list model (TKT-054 / 020726 E1):
  // ?type=<categoryId|subtypeId> and ?dismissed=1. Initialised through the legacy
  // migration so an old ?category/?view/?triageState deep link lands filtered.
  const [emailType, setEmailType] = useState<EmailTypeFilter>(
    () => migrateLegacyInboxParams(searchParams).emailType,
  );
  const [showDismissed, setShowDismissed] = useState<boolean>(
    () => migrateLegacyInboxParams(searchParams).showDismissed,
  );
  const [selectedEmail, setSelectedEmail] = useState<InboundEmail | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [pointerRow, setPointerRow] = useState<InboundEmail | null>(null);
  const [reclassifyRow, setReclassifyRow] = useState<InboundEmail | null>(null);
  const focusAfterTriageRef = useRef<string | null>(null);
  // Ids optimistically hidden after a dismiss (the only action that removes a row
  // from the single list) — cleared when fresh server data resolves.
  const [pendingHidden, setPendingHidden] = useState<Set<string>>(() => new Set());
  // Source-mailbox facet filter (TKT-025) — CLIENT-SIDE over the loaded rows;
  // SINGLE-select, exactly one of All/mailbox active at a time; null = "All"
  // (the explicit default). Not URL-persisted.
  const [mailboxFilter, setMailboxFilter] = useState<MailboxFilter>(null);
  // Inbox list pagination (TKT-098) — 1-based current page, clamped by the
  // helpers. Like the mailbox facet, it is client-side and NOT URL-persisted.
  const [page, setPage] = useState(1);

  // ONE load: the whole queue, filtered client-side (dismissed hidden by default).
  const inbox = useInbox({ view: 'all' });
  const rows = useMemo(() => inbox.data ?? [], [inbox.data]);

  // The Outlook-move gate (020726 E6): undefined/loading = OFF → the suggested-
  // action column renders display-only text until the gate read lands.
  const moveGate = useOutlookMoveGate();
  const moveEnabled = moveGate.data?.enabled === true;
  const { move: outlookMove } = useOutlookMove();

  // URL → state sync (+ one-shot legacy rewrite). Writes ONLY when a legacy param
  // was consumed or the canonical form differs — guarded against loops; `?peek=`
  // (and anything else) is preserved by editing a copy of the current params.
  useEffect(() => {
    const migrated = migrateLegacyInboxParams(searchParams);
    setEmailType((prev) => {
      const next = migrated.emailType;
      return emailTypeParam(prev) === emailTypeParam(next) ? prev : next;
    });
    setShowDismissed(migrated.showDismissed);
    if (migrated.hadLegacy) {
      const next = new URLSearchParams(searchParams);
      next.delete('category');
      next.delete('view');
      next.delete('triageState');
      const typeParam = emailTypeParam(migrated.emailType);
      if (typeParam) next.set('type', typeParam);
      else next.delete('type');
      if (migrated.showDismissed) next.set('dismissed', '1');
      else next.delete('dismissed');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Fresh data resolved → the server slice is authoritative again; drop optimistic hides.
  useEffect(() => {
    setPendingHidden((prev) => (prev.size === 0 ? prev : new Set()));
  }, [inbox.data]);

  // Every filter EXCEPT the mailbox facet — the base the mailbox chips' own
  // "live" counts are drawn from (so a chip's count reflects "how many would
  // show with this source picked", the standard faceted-filter contract, and
  // toggling a chip can never make its own count include/exclude itself).
  const preMailboxFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((e) => {
      if (pendingHidden.has(e.id)) return false;
      if (!showDismissed && e.triageState === 'dismissed') return false;
      if (!matchesEmailType(e, emailType)) return false;
      if (q) {
        const hay = [
          e.subject,
          e.fromAddress,
          e.senderDomain,
          e.bodyVrm,
          e.bodyCaseref,
          e.bodyJobref ?? '',
          e.casePo ?? '',
          e.name,
          e.bodyPreview,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, pendingHidden, showDismissed, emailType]);

  // Source-mailbox facet chips (TKT-025) — derived from the loaded rows only;
  // no server-side facet param yet (the scale follow-up once the inbox
  // routinely holds more rows than a single page comfortably loads).
  const mailboxChips = useMemo(() => mailboxFacets(preMailboxFiltered), [preMailboxFiltered]);

  // Plain setter — SINGLE-select, so choosing a mailbox (or "All") always
  // replaces the current selection outright, never toggle-accumulates.
  const selectMailboxFilter = useCallback((mailbox: MailboxFilter) => {
    setMailboxFilter(mailbox);
  }, []);

  const filtered = useMemo(
    () => preMailboxFiltered.filter((e) => matchesMailboxFilter(e, mailboxFilter)),
    [preMailboxFiltered, mailboxFilter],
  );
  // Always-latest `filtered` for event handlers. `setTriage` is captured in the
  // memoized `columns` (deps deliberately exclude it for perf), so its own
  // closure over `filtered` can be stale — reading through this stable ref keeps
  // the next-row/focus-page-hop computation correct even before a columns rebuild.
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  // Inbox list pagination (TKT-098). `win` drives the pager label + controls;
  // `pageItems` is the slice the DataGrid actually renders. Both read through
  // pageWindow so the rows shown and the "N–M of T" label never disagree.
  const win = useMemo(() => pageWindow(filtered.length, page), [filtered.length, page]);
  const pageItems = useMemo(() => slicePage(filtered, page), [filtered, page]);

  // Caveat 1 — reset to page 1 whenever a FILTER changes (search / e-mail type /
  // show-dismissed / mailbox facet), so a filtered result never opens on a stale
  // deep page. `pendingHidden` is deliberately EXCLUDED: a dismiss must not yank
  // the operator back to page 1. The second effect clamps the page down when the
  // list shrinks beneath the current window (e.g. dismissing the last row on the
  // final page) so we never strand them on an empty page.
  const filterSignature = `${search.trim()}|${emailTypeParam(emailType) ?? ''}|${showDismissed}|${mailboxFilter ?? ''}`;
  useEffect(() => {
    setPage(1);
  }, [filterSignature]);
  useEffect(() => {
    setPage((p) => clampPage(p, filtered.length));
  }, [filtered.length]);

  /* ----------  quick-peek drawer — LINKED rows only (spec IA §3)  ---------- */
  const peekId = parsePeek(searchParams.toString());
  const [peekList, setPeekList] = useState<string[]>([]);
  // Snapshot source read through a ref so openPeek stays stable for the
  // columns memo (Prev/Next walk the linked rows' CASE ids in current order).
  const linkedIdsRef = useRef<string[]>([]);
  linkedIdsRef.current = filtered.filter((e) => e.caseId).map((e) => e.caseId as string);
  useEffect(() => {
    if (!peekId) setPeekList([]);
  }, [peekId]);
  useEffect(() => {
    // Deep link (?peek= arrived from outside): snapshot once rows load.
    if (peekId && peekList.length === 0 && linkedIdsRef.current.length > 0) {
      setPeekList(linkedIdsRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekId, filtered]);
  const openPeek = useCallback(
    (caseId: string) => {
      setSelectedEmail(null); // never two panels — peek closes the email preview
      setPeekList(linkedIdsRef.current); // snapshot at open
      setSearchParams((prev) => withPeek(prev.toString(), caseId)); // PUSH — Back closes
    },
    [setSearchParams],
  );
  const closePeek = useCallback(
    () => setSearchParams((prev) => withoutPeek(prev.toString()), { replace: true }),
    [setSearchParams],
  );
  const pagePeek = useCallback(
    (id: string) => setSearchParams((prev) => withPeek(prev.toString(), id), { replace: true }),
    [setSearchParams],
  );

  // Restore keyboard focus after a triage action removes a row from the active
  // view. Caveat 2 (TKT-098): the next row may sit on a DIFFERENT page slice, and
  // its DOM node only exists once that page is rendered — so if the target isn't
  // on the current page, turn to its page and let this effect re-run (page is a
  // dep) to focus it there; otherwise focus it (or the search box) right away.
  useEffect(() => {
    const target = focusAfterTriageRef.current;
    if (!target) return;
    const focusSearchBox = () => {
      focusAfterTriageRef.current = null;
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('[aria-label="Search inbound email"]')?.focus();
      });
    };
    // Explicit sentinel → the search box (e.g. the last row of the view left).
    if (target === 'search-box') {
      focusSearchBox();
      return;
    }
    const idx = filtered.findIndex((r) => r.id === target);
    if (idx === -1) {
      // The next row isn't on the current list. A dismiss kicks off a refetch, so
      // it may only be TRANSIENTLY absent — keep the ref and wait (the effect
      // re-runs when `filtered`/`inbox.loading` change). Only give up to the
      // search box once the reload has settled and the row is genuinely gone.
      if (inbox.loading) return;
      focusSearchBox();
      return;
    }
    const targetPage = pageOf(idx);
    if (targetPage !== page) {
      // Row lives on another slice: turn to it and KEEP the ref — the page change
      // re-runs this effect, and the row's DOM node is now present to focus.
      setPage(targetPage);
      return;
    }
    focusAfterTriageRef.current = null;
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-row-id="${target}"]`)?.focus();
    });
  }, [filtered, page, inbox.loading]);

  /** Write the E-mail type filter to state + `?type=` (omitted = all). */
  const applyEmailType = (f: EmailTypeFilter) => {
    setEmailType(f);
    const next = new URLSearchParams(searchParams);
    const param = emailTypeParam(f);
    if (param) next.set('type', param);
    else next.delete('type');
    setSearchParams(next, { replace: true });
  };

  /** Toggle the "Show dismissed" switch (state + `?dismissed=1`). Turning it OFF
   *  while a dismissed row is selected closes the panel and hands focus to the
   *  search box (D17: an unmounting control must hand focus somewhere sensible). */
  const applyShowDismissed = (on: boolean) => {
    setShowDismissed(on);
    if (!on && selectedEmail?.triageState === 'dismissed') {
      setSelectedEmail(null);
      focusAfterTriageRef.current = 'search-box';
    }
    const next = new URLSearchParams(searchParams);
    if (on) next.set('dismissed', '1');
    else next.delete('dismissed');
    setSearchParams(next, { replace: true });
  };

  const selectEmail = (row: InboundEmail) => {
    setSelectedEmail(row);
  };

  const refresh = () => {
    inbox.refetch();
  };

  /** Mark/dismiss/reopen a row. The mutation THROWS on failure, so we only show
   *  success after it resolves — never a fake success. Single-list semantics
   *  (020726 E1): marking Handled mutes the row IN PLACE; only a dismiss (with
   *  the "Show dismissed" switch off) removes it — that path keeps the
   *  optimistic hide + focus handoff. */
  const setTriage = async (row: InboundEmail, next: TriageState) => {
    // Read the LIVE filtered list (see filteredRef) so the next-row target is
    // correct even if this handler was captured in a stale columns memo.
    const live = filteredRef.current;
    const currentIndex = live.findIndex((r) => r.id === row.id);
    const nextRow = live[currentIndex + 1] ?? live[currentIndex - 1];
    const leavesView = next === 'dismissed' && !showDismissed;
    if (leavesView) {
      focusAfterTriageRef.current = nextRow?.id ?? 'search-box';
      if (selectedEmail?.id === row.id) {
        setSelectedEmail(nextRow ?? null);
      }
    }
    try {
      await data.setTriageState(row.id, next);
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

  /** Queue the REAL Outlook filing (020726 E6). The mutation throws on refusal
   *  (gate off / already filed / queue down) — the row only ever shows "Filing…"
   *  after the server accepted the job (the refetch reflects the queued state). */
  const fileToOutlook = async (row: InboundEmail) => {
    try {
      const result = await outlookMove(row.id);
      dispatchToast(
        <Toast>
          <ToastTitle>Filing to {result.folder}</ToastTitle>
          <ToastBody>{row.subject}</ToastBody>
        </Toast>,
        { intent: 'success' },
      );
      refresh();
    } catch (err) {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t file this email. Please try again.</ToastTitle>
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

  // Nine lean columns (TKT-054): Subject stays the flex column; VRM/Ref split,
  // Suggested action + link-bearing Status added. Minimums sum ≈1000px so the
  // grid still fits the D6 ~1024 sanity width without a horizontal scroll.
  const columnSizing: TableColumnSizingOptions = useMemo(
    () => ({
      from: { minWidth: 110, idealWidth: 140, defaultWidth: 140 },
      subject: { minWidth: 190, idealWidth: 320, defaultWidth: 320 },
      emailType: { minWidth: 128, idealWidth: 150, defaultWidth: 150 },
      vrm: { minWidth: 86, idealWidth: 92, defaultWidth: 92 },
      ref: { minWidth: 86, idealWidth: 100, defaultWidth: 100 },
      received: { minWidth: 74, idealWidth: 90, defaultWidth: 90 },
      suggested: { minWidth: 112, idealWidth: 140, defaultWidth: 140 },
      state: { minWidth: 120, idealWidth: 156, defaultWidth: 156 },
      actions: { minWidth: 100, idealWidth: 116, defaultWidth: 116, padding: 0 },
    }),
    [],
  );

  const columns: TableColumnDefinition<InboundEmail>[] = useMemo(
    () => [
      createTableColumn<InboundEmail>({
        columnId: 'from',
        renderHeaderCell: () => 'From',
        // ONE secondary line; the domain is demoted to the tooltip (IA §2).
        renderCell: (e) => (
          <Tooltip
            content={
              e.senderDomain ? `${e.fromAddress || '—'} · ${e.senderDomain}` : e.fromAddress || '—'
            }
            relationship="description"
          >
            <span className={mergeClasses(tt.cellSecondary, styles.fromLine)}>
              {e.fromAddress || '—'}
            </span>
          </Tooltip>
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
                className={mergeClasses(
                  tt.cellPrimary,
                  styles.subjLink,
                  selectedEmail?.id === e.id && styles.subjLinkSelected,
                )}
                title={`View email · ${e.subject}`}
                onClick={() => selectEmail(e)}
              >
                {e.subject || '(no subject)'}
              </Link>
            </span>
            {e.bodyPreview && (
              <Tooltip content={e.bodyPreview} relationship="label">
                <span className={mergeClasses(tt.cellSecondary, styles.preview)}>
                  {e.bodyPreview}
                </span>
              </Tooltip>
            )}
          </span>
        ),
      }),
      createTableColumn<InboundEmail>({
        columnId: 'emailType',
        renderHeaderCell: () => 'E-mail type',
        // TKT-054 / 020726 E2+E3: neutral charcoal outline badge (D3) with a
        // per-category icon as the at-a-glance discriminator; second line only
        // ever the Overridden chip. NO strength/confidence UI (supersedes D16);
        // the why-reasons stay in the tooltip.
        renderCell: (e) => {
          const overridden = isOverridden(e);
          const suggestedText = e.suggestedSubtype
            ? SUBTYPE_LABEL[e.suggestedSubtype]
            : e.suggestedCategory
              ? CATEGORY_LABEL[e.suggestedCategory]
              : CATEGORY_LABEL[e.category];
          // "Why this label?" (rules-engine-v2 Phase 5) — up to 4 plain-English
          // reasons derived from the row's raw signal tokens; [] when there is
          // nothing to explain.
          const whyReasons = whyClassifiedReasons(e.signals);
          const TypeIcon = CATEGORY_ICON[e.category];
          const cell = (
            <div className={styles.classStack}>
              {/* Neutral outline (fork #1 "quiet grids") — the outline Badge
                  default color="brand" renders red, which reads as severity. */}
              <Badge
                appearance="outline"
                color="informative"
                shape="rounded"
                size="small"
                className={styles.subtypeBadge}
                icon={<TypeIcon size={11} strokeWidth={2} aria-hidden />}
              >
                {SUBTYPE_LABEL[e.subtype]}
              </Badge>
              {/* The tooltip hangs on a non-focusable div — mirror its content
                  as real hidden text so SRs get it too (gatekeeper). */}
              {whyReasons.length > 0 && (
                <span className="ce-sr-only">{`${whyReasons.join('. ')}.`}</span>
              )}
              {overridden && (
                <Badge
                  appearance="tint"
                  shape="rounded"
                  size="small"
                  className={styles.overrideChip}
                  icon={<PencilLine size={11} strokeWidth={2} />}
                >
                  Overridden
                  <span className="ce-sr-only">{` (Suggested when it arrived: ${suggestedText})`}</span>
                </Badge>
              )}
            </div>
          );
          return whyReasons.length > 0 ? (
            <Tooltip
              content={
                <div className={styles.whyTooltip}>
                  <ul className={styles.whyList}>
                    {whyReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              }
              relationship="description"
            >
              {cell}
            </Tooltip>
          ) : (
            cell
          );
        },
      }),
      createTableColumn<InboundEmail>({
        columnId: 'vrm',
        renderHeaderCell: () => 'VRM',
        renderCell: (e) =>
          e.bodyVrm ? (
            <VrmPlate vrm={e.bodyVrm} size="small" />
          ) : (
            <span className={mergeClasses(tt.cellMono, styles.muted)}>—</span>
          ),
      }),
      createTableColumn<InboundEmail>({
        columnId: 'ref',
        renderHeaderCell: () => 'Ref',
        // The email's OWN reference (body case-ref, else provider job-ref).
        // The linked case's Case/PO deliberately does NOT render here — it lives
        // in the Status link (020726 E4/E5, no duplication).
        renderCell: (e) => {
          const ref = e.bodyCaseref || e.bodyJobref;
          return ref ? (
            <span className={tt.cellMono}>{ref}</span>
          ) : (
            <span className={mergeClasses(tt.cellMono, styles.muted)}>—</span>
          );
        },
      }),
      createTableColumn<InboundEmail>({
        columnId: 'received',
        renderHeaderCell: () => 'Received',
        // Compact in the cell (spec IA §6); the FULL DD/MM/YYYY HH:mm form is
        // an sr-only text sibling (gatekeeper ruling: no aria-label on a
        // generic span — ARIA naming-prohibited role; real hidden DOM text is
        // what every SR reads). aria-hidden on the compact form kills the
        // duplicate; the tooltip is visual-only.
        renderCell: (e) => {
          const full = formatReceived(e.receivedOn);
          return (
            <Tooltip content={full} relationship="inaccessible">
              <span className={tt.cellSecondary}>
                <span aria-hidden="true">{formatReceivedCompact(e.receivedOn)}</span>
                <span className="ce-sr-only">{full}</span>
              </span>
            </Tooltip>
          );
        },
      }),
      createTableColumn<InboundEmail>({
        columnId: 'suggested',
        renderHeaderCell: () => 'Suggested action',
        // 020726 E6: with the gate ON the button REALLY files the message in the
        // shared mailbox (queued server-side); gate OFF renders the same
        // suggestion as display-only text. queued/moved/failed reflect the row's
        // recorded lifecycle; failed offers a retry while actionable.
        renderCell: (e) => {
          const model = suggestedAction(e, moveEnabled);
          if ((model.kind === 'suggest' || model.kind === 'failed') && model.actionable) {
            return (
              <Button
                appearance="transparent"
                size="small"
                className={mergeClasses(
                  styles.suggestedBtn,
                  model.kind === 'failed' && styles.suggestedFailed,
                )}
                icon={
                  model.kind === 'failed' ? (
                    <AlertTriangle size={13} strokeWidth={2.25} aria-hidden />
                  ) : (
                    <Folder size={13} aria-hidden />
                  )
                }
                title={model.label}
                aria-label={`${model.label} — files this email in the shared mailbox`}
                onClick={() => void fileToOutlook(e)}
              >
                {model.label}
              </Button>
            );
          }
          return (
            <span
              className={mergeClasses(
                tt.cellSecondary,
                styles.suggestedText,
                model.kind === 'failed' && styles.suggestedFailed,
              )}
              title={model.label}
            >
              {model.kind === 'queued' ? (
                <Spinner size="extra-tiny" aria-hidden />
              ) : model.kind === 'moved' ? (
                <CheckCircle2 size={13} strokeWidth={2} aria-hidden />
              ) : model.kind === 'failed' ? (
                <AlertTriangle size={13} strokeWidth={2.25} aria-hidden />
              ) : (
                <Folder size={13} aria-hidden />
              )}
              {model.label}
            </span>
          );
        },
      }),
      createTableColumn<InboundEmail>({
        columnId: 'state',
        renderHeaderCell: () => 'Status',
        renderCell: (e) => <StatusCell e={e} onOpenCase={(id) => navigate(`/case/${id}`)} />,
      }),
      createTableColumn<InboundEmail>({
        columnId: 'actions',
        renderHeaderCell: () => <span className="ce-sr-only">Actions</span>,
        renderCell: (e) => {
          const showQuick = hoveredRowId === e.id || selectedEmail?.id === e.id;
          return (
            <span className={styles.actionsCell}>
              {showQuick && (
                <span className={styles.quickActions}>
                  {e.caseId && (
                    <Tooltip content="Peek case" relationship="label">
                      <Button
                        appearance="subtle"
                        size="small"
                        className={styles.quickActionBtn}
                        icon={<Eye size={16} />}
                        aria-label={`Preview case for “${e.subject || e.fromAddress}”`}
                        data-row-id={e.id}
                        onClick={() => openPeek(e.caseId!)}
                      />
                    </Tooltip>
                  )}
                  {/* "Mark actioned" lives in the overflow menu only — keeping the hover
                      cluster at ≤2 quick actions + the "…" trigger means it always fits the
                      actions column (the "…" was being clipped when a 4th button overflowed
                      a narrowed pane). */}
                  {e.triageState !== 'dismissed' && (
                    <Tooltip content="Dismiss" relationship="label">
                      <Button
                        appearance="subtle"
                        size="small"
                        className={styles.quickActionBtn}
                        icon={<XCircle size={16} />}
                        aria-label={`Dismiss “${e.subject || e.fromAddress}”`}
                        data-row-id={e.id}
                        onClick={() => void setTriage(e, 'dismissed')}
                      />
                    </Tooltip>
                  )}
                </span>
              )}
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button
                    appearance="subtle"
                    size="small"
                    className={styles.quickActionBtn}
                    icon={<MoreHorizontal size={16} />}
                    aria-label={`Actions for “${e.subject || e.fromAddress}”`}
                    data-row-id={e.id}
                  />
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    {e.caseId && (
                      <MenuItem icon={<Briefcase size={16} />} onClick={() => navigate(`/case/${e.caseId}`)}>
                        View case
                      </MenuItem>
                    )}
                    {e.caseId && (
                      <MenuItem icon={<Eye size={16} />} onClick={() => openPeek(e.caseId!)}>
                        Peek case
                      </MenuItem>
                    )}
                    <MenuItem icon={<FileText size={16} />} onClick={() => selectEmail(e)}>
                      View email preview
                    </MenuItem>
                    {!e.caseId && (
                      <MenuItem icon={<Mail size={16} />} onClick={() => setPointerRow(e)}>
                        Open in mailbox…
                      </MenuItem>
                    )}
                    <MenuDivider />
                    <MenuItem icon={<Tags size={16} />} onClick={() => setReclassifyRow(e)}>
                      Change e-mail type…
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
          );
        },
      }),
    ],
    // styles/navigate/setTriage/fileToOutlook are stable across renders for the
    // grid's purpose; moveEnabled re-renders the suggested-action column when the
    // gate read lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [styles, selectedEmail?.id, hoveredRowId, moveEnabled],
  );

  const filtersActive =
    search.trim() !== '' || emailType.kind !== 'all' || mailboxFilter !== null;

  /** Reset every client-side filter (the filter-miss empty state's ONE action). */
  const clearFilters = () => {
    setSearch('');
    setMailboxFilter(null);
    applyEmailType(EMAIL_TYPE_ALL);
  };

  // Single-list empty states (020726 E9, under D15's one-action principle):
  // true-empty → start a case; everything-hidden-because-dismissed → reveal;
  // filter-miss → clear filters.
  const hiddenDismissedCount = useMemo(
    () => (showDismissed ? 0 : rows.filter((e) => e.triageState === 'dismissed').length),
    [rows, showDismissed],
  );
  const onlyDismissedHidden =
    rows.length > 0 && !filtersActive && !showDismissed && hiddenDismissedCount > 0;

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

/* ----------  Email preview sidebar (stored body)  ---------- */

function EmailPreviewPanel({
  row,
  onClose,
  onOpenCase,
  onCopyReference,
  onTriage,
  onReclassify,
  onCaseLinkChanged,
  dispatchToast,
}: {
  row: InboundEmail;
  onClose: () => void;
  onOpenCase: (caseId: string) => void;
  onCopyReference: (row: InboundEmail) => void;
  onTriage: (next: TriageState) => void;
  onReclassify: () => void;
  /** A suggestion accept just linked this email, or a detach just unlinked it —
   *  lets the sidebar (and the grid, via the parent's own refresh) show the new
   *  caseId without waiting on a full refetch. */
  onCaseLinkChanged: (emailId: string, caseId: string | undefined) => void;
  dispatchToast: ReturnType<typeof useToastController>['dispatchToast'];
}) {
  const styles = useStyles();
  const fromInitial = (row.fromAddress?.[0] ?? '?').toUpperCase();
  const overridden = isOverridden(row);
  const suggestedText = row.suggestedSubtype
    ? SUBTYPE_LABEL[row.suggestedSubtype]
    : row.suggestedCategory
      ? CATEGORY_LABEL[row.suggestedCategory]
      : CATEGORY_LABEL[row.category];
  // "Why this label?" (rules-engine-v2 Phase 5) — same mapping as the grid
  // cell's tooltip, rendered here as a compact caption list instead.
  const whyReasons = whyClassifiedReasons(row.signals);

  /* ----- Suggested-match banner (rules-engine-v2 Phase 2 ref-gate) -----
     Pending case_link / cancellation suggestions for THIS email — suggest-first;
     staff accept/reject (review 010726 D14/D15/D16). Honest-empty on a failed read
     (safe()-wrapped): the banner just doesn't render. Reset when the previewed
     email changes so a stale spinner/dialog never carries over to the next row. */
  const suggestionsQuery = useInboundSuggestions(row.id);
  const suggestions: AiSuggestion[] = suggestionsQuery.data ?? [];
  const caseLinkSuggestion = pendingRefGateSuggestion(suggestions, CASE_LINK_SUGGESTION_TYPE);
  const cancellationSuggestion = pendingRefGateSuggestion(suggestions, CANCELLATION_SUGGESTION_TYPE);
  const caseLinkTargetId = caseLinkSuggestion && refGateValue(caseLinkSuggestion).targetCaseId;
  const cancellationTargetId = cancellationSuggestion && refGateValue(cancellationSuggestion).targetCaseId;
  const { review, saving: reviewSaving } = useReviewAiSuggestion();
  const [reviewingId, setReviewingId] = useState<string | undefined>(undefined);
  const { detach, detaching } = useDetachInbound();
  const [detachConfirmOpen, setDetachConfirmOpen] = useState(false);

  useEffect(() => {
    setReviewingId(undefined);
    setDetachConfirmOpen(false);
  }, [row.id]);

  const onAcceptCaseLink = async () => {
    if (!caseLinkSuggestion || !caseLinkTargetId) return;
    setReviewingId(caseLinkSuggestion.id);
    try {
      await review(caseLinkSuggestion.id, { decision: 'accepted' });
      suggestionsQuery.refetch();
      onCaseLinkChanged(row.id, caseLinkTargetId);
      const { casePo } = refGateValue(caseLinkSuggestion);
      dispatchToast(
        <Toast>
          <ToastTitle>{casePo ? `Attached to ${casePo}` : 'Attached to the case'}</ToastTitle>
          <ToastBody>{row.subject}</ToastBody>
        </Toast>,
        { intent: 'success' },
      );
    } catch (err) {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t attach this email. Please try again.</ToastTitle>
          <ToastBody>{err instanceof Error ? err.message : 'Please try again.'}</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setReviewingId(undefined);
    }
  };

  const onRejectCaseLink = async () => {
    if (!caseLinkSuggestion) return;
    setReviewingId(caseLinkSuggestion.id);
    try {
      await review(caseLinkSuggestion.id, { decision: 'rejected' });
      suggestionsQuery.refetch();
      dispatchToast(
        <Toast>
          <ToastTitle>Marked “Not a match”</ToastTitle>
        </Toast>,
        { intent: 'success' },
      );
    } catch (err) {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t save that. Please try again.</ToastTitle>
          <ToastBody>{err instanceof Error ? err.message : 'Please try again.'}</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setReviewingId(undefined);
    }
  };

  /* ----- Detach (unlink) — preview panel only, never the grid row ----- */
  const doDetach = async () => {
    try {
      await detach(row.id);
      setDetachConfirmOpen(false);
      onCaseLinkChanged(row.id, undefined);
      dispatchToast(
        <Toast>
          <ToastTitle>Unlinked from the case</ToastTitle>
          <ToastBody>{row.subject}</ToastBody>
        </Toast>,
        { intent: 'success' },
      );
    } catch (err) {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t unlink this email. Please try again.</ToastTitle>
          <ToastBody>{err instanceof Error ? err.message : 'Please try again.'}</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    }
  };

  return (
    <aside className={styles.previewSidebar} aria-label="Email preview">
      <div className={styles.previewHeader}>
        <span className={styles.previewTitle}>{row.subject || '(no subject)'}</span>
        <Button
          appearance="subtle"
          size="small"
          className={styles.quickActionBtn}
          icon={<X size={16} />}
          aria-label="Close email preview"
          onClick={onClose}
        />
      </div>

      <div className={styles.previewBody}>
        <div className={styles.fromRow}>
          <span className={styles.avatarCircle} aria-hidden>
            {fromInitial}
          </span>
          <div>
            <Text weight="semibold">{row.fromAddress || '—'}</Text>
            {row.senderDomain && <Caption1 className={styles.muted}>{row.senderDomain}</Caption1>}
            <Caption1 className={styles.muted}>
              Received {formatReceived(row.receivedOn)} · {row.sourceMailbox}
            </Caption1>
          </div>
        </div>

        {/* Suggested-match banners — amber attention idiom (D4: amber, never red),
            passive until acted on. At most one of each ever shows (both are keyed
            off the FIRST pending suggestion of their type). */}
        {caseLinkSuggestion && caseLinkTargetId && (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>{caseLinkHeadline(caseLinkSuggestion)}</MessageBarTitle>
              {caseLinkSuggestion.rationale}
            </MessageBarBody>
            <MessageBarActions>
              <Button
                appearance="primary"
                size="small"
                icon={
                  reviewingId === caseLinkSuggestion.id && reviewSaving ? (
                    <Spinner size="tiny" />
                  ) : (
                    <Link2 size={14} />
                  )
                }
                disabled={reviewingId === caseLinkSuggestion.id && reviewSaving}
                onClick={() => void onAcceptCaseLink()}
              >
                Attach to case
              </Button>
              <Button
                appearance="secondary"
                size="small"
                icon={<X size={14} />}
                disabled={reviewingId === caseLinkSuggestion.id && reviewSaving}
                onClick={() => void onRejectCaseLink()}
              >
                Not a match
              </Button>
            </MessageBarActions>
          </MessageBar>
        )}

        {cancellationSuggestion && cancellationTargetId && (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>{cancellationHeadline(cancellationSuggestion)}</MessageBarTitle>
              {cancellationSuggestion.rationale}
            </MessageBarBody>
            <MessageBarActions>
              <Button
                appearance="primary"
                size="small"
                icon={<Briefcase size={14} />}
                onClick={() => onOpenCase(cancellationTargetId)}
              >
                Open case
              </Button>
            </MessageBarActions>
          </MessageBar>
        )}

        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>E-mail type</span>
          <span className={styles.metaValue}>
            {CATEGORY_LABEL[row.category]} · {SUBTYPE_LABEL[row.subtype]}
          </span>
        </div>

        {whyReasons.length > 0 && (
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Why this label</span>
            <ul className={styles.whyList}>
              {whyReasons.map((reason) => (
                <li key={reason}>
                  <Caption1 className={styles.metaValue}>{reason}</Caption1>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Suggested folder</span>
          <span className={styles.folderLine}>
            <Folder size={12} aria-hidden />
            <span className={styles.folderName}>{suggestedFolder(row)}</span>
          </span>
        </div>

        {overridden && (
          <Caption1 className={styles.muted}>Suggested when it arrived: {suggestedText}</Caption1>
        )}

        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Preview</span>
          <div
            className={styles.emailBody}
            tabIndex={0}
            role="region"
            aria-label="Email body preview"
          >
            {row.bodyPreview?.trim()
              ? row.bodyPreview
              : 'No message text was captured for this email. Use “Open in mailbox” to find the original.'}
          </div>
        </div>

        <Caption1 className={styles.dialogNote}>
          This is the saved preview. Use the mailbox reference if you need the original message.
        </Caption1>
      </div>

      <div className={styles.previewActions}>
        {row.caseId ? (
          <Button appearance="primary" icon={<Briefcase size={16} />} onClick={() => onOpenCase(row.caseId!)}>
            View case
          </Button>
        ) : (
          <Button appearance="secondary" icon={<Copy size={16} />} onClick={() => onCopyReference(row)}>
            Copy reference
          </Button>
        )}
        {row.triageState !== 'actioned' && (
          <Button appearance="secondary" icon={<CheckCircle2 size={16} />} onClick={() => onTriage('actioned')}>
            Mark actioned
          </Button>
        )}
        {row.triageState !== 'dismissed' && (
          <Button appearance="secondary" icon={<XCircle size={16} />} onClick={() => onTriage('dismissed')}>
            Dismiss
          </Button>
        )}
        <Button appearance="secondary" icon={<Tags size={16} />} onClick={onReclassify}>
          Change e-mail type
        </Button>
        {/* Quiet secondary action — linked rows only; kept out of the DataGrid row
            entirely (preview panel only). Deliberately de-emphasised (subtle +
            small) next to the other preview actions above. */}
        {row.caseId && (
          <Button
            appearance="subtle"
            size="small"
            icon={<Unlink size={14} />}
            onClick={() => setDetachConfirmOpen(true)}
          >
            Unlink from case…
          </Button>
        )}
      </div>

      <Dialog
        open={detachConfirmOpen}
        onOpenChange={(_e, d) => {
          if (!d.open && !detaching) setDetachConfirmOpen(false);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Unlink from case</DialogTitle>
            <DialogContent>
              <div className={styles.dialogGrid}>
                <MessageBar intent="warning">
                  <MessageBarBody>
                    <MessageBarTitle>The archive copy isn’t removed</MessageBarTitle>
                    Unlinking removes the connection between this email and the case. Any copy
                    already filed in the case’s archive folder stays there — you’ll need to tidy it
                    up by hand.
                  </MessageBarBody>
                </MessageBar>
              </div>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="primary"
                icon={detaching ? <Spinner size="tiny" /> : <Unlink size={16} />}
                disabled={detaching}
                onClick={() => void doDetach()}
              >
                {detaching ? 'Unlinking…' : 'Unlink from case'}
              </Button>
              <Button appearance="secondary" onClick={() => setDetachConfirmOpen(false)} disabled={detaching}>
                Cancel
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </aside>
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
          <ToastTitle>E-mail type updated to “{tag}”</ToastTitle>
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
          <DialogTitle>Change e-mail type</DialogTitle>
          <DialogContent>
            <div className={styles.dialogGrid}>
              <span className={styles.suggestLine}>
                <Text className={styles.dialogNote}>Suggested when it arrived:</Text>
                <Badge appearance="outline" color="informative" shape="rounded" size="small">
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
              <Field label="Reason (optional)" hint="Recorded to help sort similar email correctly in future.">
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

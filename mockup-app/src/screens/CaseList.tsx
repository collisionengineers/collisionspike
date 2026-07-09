import type { KeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Caption1,
  Checkbox,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Dropdown,
  Link,
  Option,
  SearchBox,
  Tab,
  TabList,
  TableCellLayout,
  Text,
  Toast,
  ToastBody,
  ToastTitle,
  ToastTrigger,
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
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Eye,
  Inbox,
  Mail,
  MessageCircle,
} from 'lucide-react';
import {
  SectionHeading,
  StatusBadge,
  statusLabel,
  VrmPlate,
  EmptyState,
  ErrorState,
  DataGridSkeleton,
  useTableTypography,
  BulkActionBar,
  CasePeekDrawer,
  GLOBAL_TOASTER_ID,
} from '../components';
import { Pager } from '../components/Pager';
import { clampPage, pageWindow, slicePage } from './inbox-pagination';
import { runBatch, summarizeBatch } from '../data/batch';
import {
  caseDisplayName,
  columnsForQueue,
  heldReleaseEligible,
  whyHeldText,
  type CaseColumnId,
} from './case-list-columns';
import { nextPeekId, parsePeek, withPeek, withoutPeek } from './peek';
import {
  QUEUES,
  REASON_LABELS,
  dueInfo,
  outstandingText,
  queueByName,
  data,
  useQueueQuery,
  INTAKE_CHANNEL_LABELS,
  type ActionReason,
  type Case,
  type CaseStatus,
  type QueueName,
  type ReasonFacet,
} from '../data';

/* Case list at /queue/:name (review 190626 queue IA + reforge M-D).
   - TabList across the three queues — the case's natural state.
   - PER-QUEUE COLUMN SETS from the pure columnsForQueue() (spec IA §2):
     not-ready keeps the full set; review swaps Outstanding/Status/Channel for
     Claimant + Vehicle; held drops Case/PO + Status for the "Why held"
     decision verb (whyHeldText, twin-count enriched via data.openVrmTwins).
   - Cell typography from the shared useTableTypography() hierarchy (spec §3):
     primary (claimant, outstanding, why-held) / secondary (provider, vehicle,
     ages, timestamps) / mono (Case/PO).
   - Reason facet chips (Missing images · Duplicate · Conflict …) from
     reasonCounts() on the not-ready queue, toggling to filter the grid.
   - Toolbar: SearchBox (VRM / Case-PO / claimant) + Provider (only providers WITH a
     case in this queue) / Status (only where statuses vary — the held Status
     FILTER stays even though its column dropped) / Channel / Age.
   - Fluent v9 declarative DataGrid with FIXED column sizing so the verb-led
     ellipsised cells and the icon-only Channel column never collide.
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
  // Charcoal-selected (reforge 2026-07-01): a toggled filter is a selection,
  // not a severity — white-on-charcoal clears AA at 14.31:1.
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
    // Reveal the row's peek icon-button on hover (it reveals itself on focus).
    '&:hover [data-peek-btn]': { opacity: 1 },
  },
  rowDuplicate: { backgroundColor: tokens.colorStatusDangerBackground1 },

  vrmCell: { display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  muted: { color: tokens.colorNeutralForeground3 },
  // TKT-118: a pre-mint case's Case/PO cell carries the VRM + a muted
  // "by registration" line so the identity is explicit, never a bare dash.
  vrmIdentityStack: { display: 'flex', flexDirection: 'column', lineHeight: 1.15 },

  // Checkbox cell wrapper — swallows click/keydown so toggling a selection
  // never triggers the row's open-case navigation.
  selectCell: { display: 'inline-flex', alignItems: 'center' },

  // Peek icon-button — ALWAYS tabbable, visually revealed on row hover or
  // its own focus (spec IA §3).
  peekBtn: {
    opacity: 0,
    transitionProperty: 'opacity',
    transitionDuration: tokens.durationFaster,
    ':focus': { opacity: 1 },
    ':focus-visible': { opacity: 1 },
  },

  // Verb-led cells (Outstanding / Why held) — single line, ellipsised.
  // Typography comes from useTableTypography().cellPrimary.
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

  // Aging / Due — stacked, severity-aware (spec §3 aging-cell demotion): the
  // non-urgent age is plain cellSecondary text (no pill in grid cells); due
  // ≤2d gets --ce-warning-text semibold + 14px CalendarClock; past-due gets
  // --ce-critical-ink semibold text with the 14px icon keeping --ce-red.
  // Never colour-only — the icons carry the shape cue.
  dueCell: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, lineHeight: 1.2 },
  dueStack: { display: 'flex', flexDirection: 'column', lineHeight: 1.15 },
  duePastIcon: { color: 'var(--ce-red)', flexShrink: 0 },
  dueSoonIcon: { color: 'var(--ce-warning-text)', flexShrink: 0 },
  duePastText: { color: 'var(--ce-critical-ink)', fontWeight: tokens.fontWeightSemibold },
  dueSoonText: { color: 'var(--ce-warning-text)', fontWeight: tokens.fontWeightSemibold },

  dup: { display: 'inline-flex', color: tokens.colorStatusDangerForeground1, flexShrink: 0 },
});

/* Status words come from StatusBadge.statusLabel() — the single source of
   user-facing status copy — so a status reads identically on every screen
   (this screen used to carry a second, divergent map). */

type AgeBucket = 'all' | 'today' | 'week' | 'over1' | 'over2';
const AGE_OPTIONS: { value: AgeBucket; label: string }[] = [
  { value: 'all', label: 'Any age' },
  { value: 'today', label: 'Today (0 days)' },
  { value: 'week', label: 'This week (≤7 days)' },
  { value: 'over1', label: 'Over 1 week' },
  { value: 'over2', label: 'Over 2 weeks' },
];

const ANY = '__any__';

/* Per-tab empty state (no filters applied): spec IA §5 title + the ONE
   priority-ordered quick action (active voice) + the explanatory hint. */
const EMPTY_STATE: Record<
  QueueName,
  { title: string; hint: string; actionLabel: string; to: string }
> = {
  'not-ready': {
    title: 'Nothing waiting on details.',
    hint: 'Cases waiting on images, instructions or other details land here.',
    actionLabel: 'Sort new email',
    to: '/inbox',
  },
  review: {
    title: 'Nothing to review.',
    hint: 'Cases that need a person to check — flagged for review, or complete and ready to send — land here.',
    actionLabel: 'Check what’s not ready',
    to: '/queue/not-ready',
  },
  held: {
    title: 'Nothing held.',
    hint: 'Cases that can’t go through (missing the basics) or are on hold would show here.',
    actionLabel: 'Check the review queue',
    to: '/queue/review',
  },
};

/** "Today" / "3 days" — plain case-age wording (due cell + the held Age column). */
function caseAgeText(c: Case): string {
  return c.ageDays === 0 ? 'Today' : `${c.ageDays} day${c.ageDays === 1 ? '' : 's'}`;
}

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
  const tt = useTableTypography();
  const navigate = useNavigate();
  const { name } = useParams<{ name: string }>();

  const activeName: QueueName = (queueByName(name ?? '')?.name ?? 'not-ready') as QueueName;
  const queue = queueByName(activeName);
  // Reason facet chips help most on the Not ready queue, where reasons vary.
  const showFacets = activeName === 'not-ready';
  // Status filter only where the queue spans multiple statuses (queues #1).
  // Since TKT-130 the Review queue spans needs_review + ready_for_eva, so it
  // shows the filter too (it adapts off the queue definition automatically).
  const showStatusFilter = (queue?.statuses.length ?? 0) > 1;

  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>(ANY);
  const [statusFilter, setStatusFilter] = useState<CaseStatus | typeof ANY>(ANY);
  const [channelFilter, setChannelFilter] = useState<'email' | 'whatsapp' | typeof ANY>(ANY);
  const [ageFilter, setAgeFilter] = useState<AgeBucket>('all');
  const [reasonFilter, setReasonFilter] = useState<ActionReason | null>(null);

  // Queues pagination (TKT-116) — the SAME 15-per-page window + <Pager> as the
  // inbox (TKT-098; helpers in inbox-pagination.ts). Page state is PER QUEUE so
  // switching tabs never resets the other queue's page; a FILTER change resets
  // the active queue to page 1 (below). Client-side, like the inbox.
  const [pageByQueue, setPageByQueue] = useState<Partial<Record<QueueName, number>>>({});
  const page = pageByQueue[activeName] ?? 1;
  const setPage = useCallback(
    (p: number) => setPageByQueue((prev) => ({ ...prev, [activeName]: p })),
    [activeName],
  );

  // The active queue's rows come through the seam hook (loading/empty/error).
  const queueQuery = useQueueQuery(activeName);
  const queueCases = useMemo(() => queueQuery.data ?? [], [queueQuery.data]);

  // Provider filter options = providers WITH a case in THIS queue (queues #1),
  // derived from the loaded rows — not the whole corpus.
  const providerOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of queueCases) {
      if (c.providerCode) m.set(c.providerCode, c.provider || c.providerCode);
    }
    return [...m.entries()]
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [queueCases]);

  // Per-tab counts for the TabList badges (one aggregate fetch via the seam).
  const [queueTabCounts, setQueueTabCounts] = useState<Record<QueueName, number> | undefined>();
  // Needs-action reason facet chips (seam fetch; only on the needs-action tab).
  const [facets, setFacets] = useState<ReasonFacet[]>([]);

  useEffect(() => {
    let cancelled = false;
    void data.queueCounts().then((c) => {
      if (!cancelled) setQueueTabCounts(c);
    });
    return () => {
      cancelled = true;
    };
    // Re-fetch the badge counts when the active queue changes (cases may move).
  }, [activeName]);

  /* ----------  bulk selection (spec IA §4)  ---------- */
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // Focus home when the BulkActionBar unmounts while holding focus
  // (gatekeeper F4): the header select-all checkbox.
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const restoreFocusFromBar = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest('[aria-label="Bulk actions"]')) {
      requestAnimationFrame(() => selectAllRef.current?.focus());
    }
  }, []);
  // Rows optimistically hidden after a successful hold/release (they've moved
  // queue server-side) — cleared when fresh queue data resolves below.
  const [pendingHidden, setPendingHidden] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  // Fresh server data is authoritative again — drop the optimistic hides.
  useEffect(() => {
    setPendingHidden((prev) => (prev.size === 0 ? prev : new Set()));
  }, [queueQuery.data]);

  // Reset the queue-derived provider filter on ANY queue change — tab click OR a
  // URL/dashboard-strip navigation (which doesn't fire onTabSelect). The provider
  // options come from the active queue's rows, so a code selected on the previous
  // queue won't exist here and would silently filter the grid to zero (queues #6).
  // Bulk selection clears on queue change too (spec IA §4).
  useEffect(() => {
    setProviderFilter(ANY);
    setSelected(new Set());
    setPendingHidden(new Set());
  }, [activeName]);

  useEffect(() => {
    let cancelled = false;
    if (!showFacets) {
      setFacets([]);
      return;
    }
    void data.reasonCounts().then((f) => {
      if (!cancelled) setFacets(f);
    });
    return () => {
      cancelled = true;
    };
  }, [showFacets, activeName]);

  // Held "Why held" twin counts — NOT on the row itself; fetched live via the
  // seam (the enrichment outstandingText was designed for). Fetched for ALL
  // held rows (M-D review: live held data rarely carries duplicate_risk — the
  // twin count itself is the duplicate FACT), capped at 50 until M-E2's batch
  // endpoint absorbs the fan-out server-side. Counts are only cleared when
  // LEAVING the held queue, so a refetch never flashes the numbered wording
  // back to generic. A failed fetch just leaves the generic wording.
  const TWIN_FETCH_CAP = 50;
  const [twinCounts, setTwinCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (activeName !== 'held') {
      setTwinCounts((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const rows = queueCases.filter((c) => c.vrm?.trim()).slice(0, TWIN_FETCH_CAP);
    if (rows.length === 0) return;
    let cancelled = false;
    void Promise.all(
      rows.map((c) =>
        data.openVrmTwins(c.vrm, c.id).then(
          (twins) => [c.id, twins.length] as const,
          () => null, // fetch failure → keep "Possible duplicate"/current verb
        ),
      ),
    ).then((entries) => {
      if (cancelled) return;
      setTwinCounts(
        Object.fromEntries(entries.filter((e): e is readonly [string, number] => e !== null)),
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeName, queueCases]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return queueCases.filter((c) => {
      if (pendingHidden.has(c.id)) return false;
      if (showFacets && reasonFilter && c.actionReason !== reasonFilter) return false;
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
    showFacets,
    pendingHidden,
  ]);

  // Filter changes INTERSECT the selection with the still-visible rows —
  // hidden rows silently deselect so a verb never acts on unseen cases.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filtered.map((c) => c.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  /* ----------  pagination window (TKT-116)  ----------
     `win` drives the pager label + controls; `pageItems` is the slice the grid
     renders. Both read through pageWindow so what the grid shows and what the
     pager says can never disagree (the TKT-098 invariant). Selection + peek
     deliberately stay FILTERED-scoped (all pages): select-all is "the current
     view" and the BulkActionBar names an explicit count, so bulk verbs across
     pages stay possible and honest. */
  const win = useMemo(() => pageWindow(filtered.length, page), [filtered.length, page]);
  const pageItems = useMemo(() => slicePage(filtered, page), [filtered, page]);

  // Reset to page 1 when a FILTER changes on the SAME queue (a tab switch keeps
  // each queue's own page — the ref guard tells the two apart). The clamp effect
  // below folds a stale deep page back into range when the list shrinks.
  const filterSignature = `${search.trim()}|${providerFilter}|${statusFilter}|${channelFilter}|${ageFilter}|${reasonFilter ?? ''}`;
  const lastSigRef = useRef<{ queue: QueueName; sig: string }>({
    queue: activeName,
    sig: filterSignature,
  });
  useEffect(() => {
    const last = lastSigRef.current;
    if (last.queue === activeName && last.sig !== filterSignature) {
      setPageByQueue((prev) =>
        (prev[activeName] ?? 1) === 1 ? prev : { ...prev, [activeName]: 1 },
      );
    }
    lastSigRef.current = { queue: activeName, sig: filterSignature };
  }, [activeName, filterSignature]);
  useEffect(() => {
    setPageByQueue((prev) => {
      const cur = prev[activeName] ?? 1;
      const clamped = clampPage(cur, filtered.length);
      return clamped === cur ? prev : { ...prev, [activeName]: clamped };
    });
  }, [activeName, filtered.length]);

  const onTabSelect = (_e: SelectTabEvent, data: SelectTabData) => {
    setReasonFilter(null);
    setStatusFilter(ANY);
    navigate(`/queue/${data.value as QueueName}`);
  };

  /* ----------  bulk verbs + batch mutation (spec IA §4)  ---------- */
  const selectedRows = useMemo(
    () => filtered.filter((c) => selected.has(c.id)),
    [filtered, selected],
  );
  const isHeld = activeName === 'held';
  // Release excludes the per-case-decision rows (heldReleaseEligible derives
  // from the SAME heldReason classification whyHeldText renders — twin count
  // included); Hold acts on everything picked.
  const eligibleRows = useMemo(
    () => (isHeld ? selectedRows.filter((c) => heldReleaseEligible(c, twinCounts[c.id])) : selectedRows),
    [isHeld, selectedRows, twinCounts],
  );
  const ineligibleCount = selectedRows.length - eligibleRows.length;

  const runBulk = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const nextOnHold = !isHeld; // Hold on not-ready/review; Release on held.
      setBulkBusy(true);
      const result = await runBatch(ids, (id) => data.setOnHold(id, nextOnHold), {
        concurrency: 4,
      });
      setBulkBusy(false);

      // Succeeded rows have moved queue server-side: hide them optimistically
      // and deselect; FAILED rows stay selected for the retry. Never fake
      // success — the summary counts only what actually resolved.
      if (result.ok.length > 0) {
        setPendingHidden((prev) => new Set([...prev, ...result.ok]));
      }
      // Full success is about to unmount the bar — send focus home first (F4).
      if (result.failed.length === 0) restoreFocusFromBar();
      setSelected(new Set(result.failed.map((f) => f.id)));

      const summary = summarizeBatch(nextOnHold ? 'Held' : 'Released', result);
      if (summary.ok) {
        dispatchToast(
          <Toast>
            <ToastTitle>{summary.title}</ToastTitle>
          </Toast>,
          { intent: 'success' },
        );
      } else {
        const failedIds = result.failed.map((f) => f.id);
        dispatchToast(
          <Toast>
            <ToastTitle
              action={
                <ToastTrigger>
                  <Link onClick={() => void runBulk(failedIds)}>Retry</Link>
                </ToastTrigger>
              }
            >
              {summary.title}
            </ToastTitle>
            <ToastBody>{summary.detail}</ToastBody>
          </Toast>,
          { intent: 'error' },
        );
      }

      // Rows moved between queues — refresh this queue AND the tab counts.
      queueQuery.refetch();
      void data.queueCounts().then((c) => setQueueTabCounts(c));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isHeld, dispatchToast, queueQuery.refetch, restoreFocusFromBar],
  );

  /** Bulk "Log chase" (M-E2, not-ready queue only). RECORDS a chase per case —
   *  never sends. Chased rows stay in the queue (no hide, no refetch); failed
   *  ids stay selected with a Retry, identical semantics to Hold. */
  const runBulkChase = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setBulkBusy(true);
      const result = await runBatch(
        ids,
        // Default bulk template: the not-ready queue IS the weekly chase
        // cadence (its subtitle says so); ChaserPanel's templates are all
        // case-type-specific, so none is an honest bulk default.
        (id) => data.logChase(id, { channel: 'email', templateLabel: 'Weekly chase' }),
        { concurrency: 4 },
      );
      setBulkBusy(false);
      // Full success is about to unmount the bar — send focus home first (F4).
      if (result.failed.length === 0) restoreFocusFromBar();
      setSelected(new Set(result.failed.map((f) => f.id)));
      const summary = summarizeBatch('Logged a chase for', result);
      if (summary.ok) {
        dispatchToast(
          <Toast>
            <ToastTitle>{summary.title}</ToastTitle>
          </Toast>,
          { intent: 'success' },
        );
      } else {
        const failedIds = result.failed.map((f) => f.id);
        dispatchToast(
          <Toast>
            <ToastTitle
              action={
                <ToastTrigger>
                  <Link onClick={() => void runBulkChase(failedIds)}>Retry</Link>
                </ToastTrigger>
              }
            >
              {summary.title}
            </ToastTitle>
            <ToastBody>{summary.detail}</ToastBody>
          </Toast>,
          { intent: 'error' },
        );
      }
    },
    [dispatchToast, restoreFocusFromBar],
  );

  /* ----------  quick-peek drawer (spec IA §3)  ---------- */
  const [searchParams, setSearchParams] = useSearchParams();
  const peekId = parsePeek(searchParams.toString());
  // Prev/Next snapshot — captured when the drawer OPENS (or on deep-link once
  // rows load); paging never re-derives it, so filter churn can't reshuffle
  // the deck mid-peek.
  const [peekList, setPeekList] = useState<string[]>([]);
  useEffect(() => {
    if (!peekId) setPeekList([]);
  }, [peekId]);
  useEffect(() => {
    // Deep link (?peek= arrived from outside): snapshot once rows load.
    if (peekId && peekList.length === 0 && filtered.length > 0) {
      setPeekList(filtered.map((c) => c.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekId, filtered]);

  const openPeek = useCallback(
    (id: string) => {
      setPeekList(filtered.map((c) => c.id)); // snapshot at open
      setSearchParams(withPeek(searchParams.toString(), id)); // PUSH — Back closes
    },
    [filtered, searchParams, setSearchParams],
  );
  const closePeek = useCallback(
    () => setSearchParams(withoutPeek(searchParams.toString()), { replace: true }),
    [searchParams, setSearchParams],
  );
  const pagePeek = useCallback(
    (id: string) => setSearchParams(withPeek(searchParams.toString(), id), { replace: true }),
    [searchParams, setSearchParams],
  );

  /* Fixed sizing so the icon-only Channel and the verb-led ellipsised cells
     never overlap. Superset over all queues — unused ids are ignored. */
  const columnSizing: TableColumnSizingOptions = useMemo(
    () => ({
      select: { minWidth: 44, idealWidth: 48, defaultWidth: 48 },
      peek: { minWidth: 44, idealWidth: 48, defaultWidth: 48 },
      vrm: { minWidth: 150, idealWidth: 170, defaultWidth: 170 },
      casePo: { minWidth: 110, idealWidth: 120, defaultWidth: 120 },
      provider: { minWidth: 130, idealWidth: 150, defaultWidth: 150 },
      status: { minWidth: 150, idealWidth: 165, defaultWidth: 165 },
      outstanding: { minWidth: 180, idealWidth: 240, defaultWidth: 240 },
      channel: { minWidth: 64, idealWidth: 64, defaultWidth: 64, padding: 0 },
      due: { minWidth: 120, idealWidth: 140, defaultWidth: 140 },
      claimant: { minWidth: 140, idealWidth: 180, defaultWidth: 180 },
      vehicle: { minWidth: 130, idealWidth: 160, defaultWidth: 160 },
      whyHeld: { minWidth: 200, idealWidth: 280, defaultWidth: 280 },
      age: { minWidth: 70, idealWidth: 90, defaultWidth: 90 },
      lastUpdate: { minWidth: 130, idealWidth: 160, defaultWidth: 160 },
    }),
    [],
  );

  /* Every column renderer, keyed by id; the visible ORDERED set per queue
     comes from the pure columnsForQueue() (spec IA §2). */
  const allColumns: Record<CaseColumnId, TableColumnDefinition<Case>> = useMemo(
    () => ({
      vrm: createTableColumn<Case>({
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
      casePo: createTableColumn<Case>({
        columnId: 'casePo',
        renderHeaderCell: () => 'Case / PO',
        // TKT-118: a case with no Case/PO yet (images before instructions — the
        // provider is unknown, so no number can be minted) is identified by its
        // REGISTRATION. Show the VRM prominently in this cell rather than a bare
        // dash, with a plain-English tooltip saying why.
        renderCell: (c) =>
          c.casePo ? (
            <span className={tt.cellMono}>{c.casePo}</span>
          ) : c.vrm?.trim() ? (
            <Tooltip
              content="No Case/PO yet — identified by the registration until instructions arrive"
              relationship="description"
            >
              <span className={styles.vrmIdentityStack}>
                <span className={tt.cellMono}>{c.vrm}</span>
                <Caption1 className={styles.muted}>by registration</Caption1>
              </span>
            </Tooltip>
          ) : (
            <span className={mergeClasses(tt.cellMono, styles.muted)}>—</span>
          ),
      }),
      provider: createTableColumn<Case>({
        columnId: 'provider',
        renderHeaderCell: () => 'Provider',
        renderCell: (c) => (
          <TableCellLayout description={c.providerCode} truncate>
            <span className={tt.cellSecondary}>{c.provider}</span>
          </TableCellLayout>
        ),
      }),
      status: createTableColumn<Case>({
        columnId: 'status',
        renderHeaderCell: () => 'Status',
        renderCell: (c) => <StatusBadge status={c.status} size="small" />,
      }),
      outstanding: createTableColumn<Case>({
        columnId: 'outstanding',
        renderHeaderCell: () => 'Outstanding',
        renderCell: (c) => {
          const full = outstandingText(c);
          return (
            <Tooltip content={full} relationship="label">
              <span className={mergeClasses(tt.cellPrimary, styles.outstanding)} title={full}>
                {full}
              </span>
            </Tooltip>
          );
        },
      }),
      channel: createTableColumn<Case>({
        columnId: 'channel',
        renderHeaderCell: () => 'Ch.',
        renderCell: (c) => {
          const isWhatsapp = c.channel.kind === 'whatsapp';
          const label = INTAKE_CHANNEL_LABELS[c.channel.kind] ?? 'Email';
          // Same guard as the peek drawer: the seam sometimes carries an
          // internal mailbox ID here — internal ids never render (CONTEXT.md).
          const mailbox = c.channel.sourceMailbox?.includes('@')
            ? ` — ${c.channel.sourceMailbox}`
            : '';
          const desc = `${label}${c.channel.mode === 'manual' ? ' (manual)' : ''}${mailbox}`;
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
      due: createTableColumn<Case>({
        columnId: 'due',
        renderHeaderCell: () => 'Aging / Due',
        renderCell: (c) => {
          const due = dueInfo(c);
          return (
            <span className={styles.dueCell}>
              {due.tone === 'pastdue' && (
                <AlertTriangle size={14} className={styles.duePastIcon} aria-label="Past due" />
              )}
              {due.tone === 'soon' && (
                <CalendarClock size={14} className={styles.dueSoonIcon} aria-label="Due soon" />
              )}
              <span className={styles.dueStack}>
                <span
                  className={mergeClasses(
                    due.tone === 'normal' && tt.cellSecondary,
                    due.tone === 'pastdue' && styles.duePastText,
                    due.tone === 'soon' && styles.dueSoonText,
                  )}
                >
                  {caseAgeText(c)}
                </span>
                {c.dateDue && <Caption1 className={tt.cellSecondary}>{due.dueText}</Caption1>}
              </span>
            </span>
          );
        },
      }),
      claimant: createTableColumn<Case>({
        columnId: 'claimant',
        renderHeaderCell: () => 'Claimant',
        renderCell: (c) =>
          c.evaFields.claimantName.value ? (
            <TableCellLayout truncate>
              <span className={tt.cellPrimary}>{c.evaFields.claimantName.value}</span>
            </TableCellLayout>
          ) : (
            <span className={tt.cellSecondary}>—</span>
          ),
      }),
      vehicle: createTableColumn<Case>({
        columnId: 'vehicle',
        renderHeaderCell: () => 'Vehicle',
        renderCell: (c) => (
          <TableCellLayout truncate>
            <span className={tt.cellSecondary}>{c.vehicleModel || '—'}</span>
          </TableCellLayout>
        ),
      }),
      whyHeld: createTableColumn<Case>({
        columnId: 'whyHeld',
        renderHeaderCell: () => 'Why held',
        renderCell: (c) => {
          const text = whyHeldText(c, twinCounts[c.id]);
          return (
            <Tooltip content={text} relationship="label">
              <span className={mergeClasses(tt.cellPrimary, styles.outstanding)} title={text}>
                {text}
              </span>
            </Tooltip>
          );
        },
      }),
      age: createTableColumn<Case>({
        columnId: 'age',
        renderHeaderCell: () => 'Age',
        renderCell: (c) => <span className={tt.cellSecondary}>{caseAgeText(c)}</span>,
      }),
      lastUpdate: createTableColumn<Case>({
        columnId: 'lastUpdate',
        renderHeaderCell: () => 'Last update',
        // TKT-117 — the server-derived recency descriptor ("Images received",
        // "Chased", "Note added by Alex") + its date, stacked like Aging/Due.
        renderCell: (c) =>
          c.lastActivity ? (
            <Tooltip
              content={`${c.lastActivity.label} · ${c.lastActivity.date}`}
              relationship="description"
            >
              <span className={styles.dueStack}>
                <span className={mergeClasses(tt.cellSecondary, styles.outstanding)}>
                  {c.lastActivity.label}
                </span>
                <Caption1 className={tt.cellSecondary}>{c.lastActivity.date}</Caption1>
              </span>
            </Tooltip>
          ) : (
            <span className={mergeClasses(tt.cellSecondary, styles.muted)}>—</span>
          ),
      }),
    }),
    [styles, tt, twinCounts],
  );

  /* Explicit checkbox column, self-managed selection Set — deliberately NOT
     DataGrid selectionMode, which conflicts with the row-click navigation.
     The header checkbox is tri-state select-all-FILTERED. */
  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const selectColumn: TableColumnDefinition<Case> = useMemo(
    () =>
      createTableColumn<Case>({
        columnId: 'select',
        renderHeaderCell: () => (
          <Checkbox
            ref={selectAllRef}
            checked={allFilteredSelected ? true : selected.size > 0 ? 'mixed' : false}
            onChange={(_e, d) =>
              setSelected(d.checked === true ? new Set(filtered.map((c) => c.id)) : new Set())
            }
            aria-label={`Select all ${filtered.length} cases in the current view`}
          />
        ),
        renderCell: (c) => (
          <span
            className={styles.selectCell}
            onClick={(e) => e.stopPropagation()}
            // Keep row navigation keys out, but let ESCAPE bubble — the
            // clear-selection / close-peek listeners live on window (F1).
            onKeyDown={(e) => {
              if (e.key !== 'Escape') e.stopPropagation();
            }}
          >
            <Checkbox
              checked={selected.has(c.id)}
              onChange={(_e, d) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (d.checked === true) {
                    next.add(c.id);
                  } else {
                    next.delete(c.id);
                  }
                  return next;
                })
              }
              aria-label={`Select case ${caseDisplayName(c)}`}
            />
          </span>
        ),
      }),
    [filtered, selected, allFilteredSelected, styles],
  );

  /* Trailing peek column — the quick-peek affordance on every queue row
     (always tabbable; revealed on row hover / its own focus). */
  const peekColumn: TableColumnDefinition<Case> = useMemo(
    () =>
      createTableColumn<Case>({
        columnId: 'peek',
        renderHeaderCell: () => <span className="ce-sr-only">Preview</span>,
        renderCell: (c) => (
          <Button
            appearance="subtle"
            size="small"
            data-peek-btn
            className={styles.peekBtn}
            icon={<Eye size={16} />}
            aria-label={`Preview ${caseDisplayName(c)}`}
            onClick={(e) => {
              e.stopPropagation();
              openPeek(c.id);
            }}
          />
        ),
      }),
    [styles, openPeek],
  );

  const columns: TableColumnDefinition<Case>[] = useMemo(
    () => [selectColumn, ...columnsForQueue(activeName).map((id) => allColumns[id]), peekColumn],
    [selectColumn, activeName, allColumns, peekColumn],
  );

  const filtersActive =
    providerFilter !== ANY ||
    statusFilter !== ANY ||
    channelFilter !== ANY ||
    ageFilter !== 'all' ||
    reasonFilter !== null ||
    search.trim() !== '';

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

export default CaseList;

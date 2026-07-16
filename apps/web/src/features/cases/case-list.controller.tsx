
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Caption1, Checkbox, Link, TableCellLayout, Toast, ToastBody, ToastTitle, ToastTrigger, Tooltip, createTableColumn, mergeClasses, useToastController, type SelectTabData, type SelectTabEvent, type TableColumnDefinition, type TableColumnSizingOptions } from '@fluentui/react-components';
import { AlertTriangle, CalendarClock, Eye, Mail, MessageCircle } from 'lucide-react';
import { StatusBadge, VrmPlate, useTableTypography, GLOBAL_TOASTER_ID } from '../../shared/ui';
import { clampPage, pageWindow, slicePage } from '../../shared/navigation/inbox-pagination';
import { runBatch, summarizeBatch } from '../../data/batch';
import { caseDisplayName, columnsForQueue, heldReleaseEligible, whyHeldText, type CaseColumnId } from './case-list-columns';
import { parsePeek, withPeek, withoutPeek } from '../../shared/navigation/peek';
import { REASON_LABELS, dueInfo, outstandingText, queueByName, data, useQueueQuery, INTAKE_CHANNEL_LABELS, type ActionReason, type Case, type CaseStatus, type QueueName, type ReasonFacet } from '../../data';

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
import { useStyles } from './case-list.styles';
export type AgeBucket = 'all' | 'today' | 'week' | 'over1' | 'over2';
const AGE_OPTIONS: { value: AgeBucket; label: string }[] = [
  { value: 'all', label: 'Any age' },
  { value: 'today', label: 'Today (0 days)' },
  { value: 'week', label: 'This week (≤7 days)' },
  { value: 'over1', label: 'Over 1 week' },
  { value: 'over2', label: 'Over 2 weeks' },
];

const ANY = '__any__' as const;

/* Per-tab empty state (no filters applied): spec IA §5 title + the ONE
   priority-ordered quick action (active voice) + the explanatory hint. */
const EMPTY_STATE: Record<
  QueueName,
  { title: string; hint: string; actionLabel: string; to: string }
> = {
  'not-ready': {
    title: 'Nothing waiting on details.',
    hint: 'Cases waiting on images, instructions, details or a review decision land here.',
    actionLabel: 'Sort new email',
    to: '/inbox',
  },
  review: {
    title: 'Nothing to review.',
    hint: 'Cases with every required detail and image ready for the final check land here.',
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

export function useCaseList() {
  const styles = useStyles();
  const tt = useTableTypography();
  const navigate = useNavigate();
  const { name } = useParams<{ name: string }>();

  const activeName: QueueName = (queueByName(name ?? '')?.name ?? 'not-ready') as QueueName;
  const queue = queueByName(activeName);
  // Reason facet chips help most on the Not ready queue, where reasons vary.
  const showFacets = activeName === 'not-ready';
  // Status filter only where the queue spans multiple statuses (queues #1).
  // Review is ready_for_eva only, so its redundant status filter stays hidden.
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
  // Not-ready reason facet chips — derived CLIENT-SIDE from the loaded Not-ready rows
  // (A3). The chips render only on this queue AND the reason filter runs over the SAME
  // queueCases, so counting the global data.reasonCounts() route (which tallies Review +
  // Held cases too) once put generic reason chips here that filtered to zero rows.
  // Tallying c.actionReason over queueCases makes each chip count EXACTLY equal what
  // selecting that reason yields. REASON_LABELS key order is preserved for stable chips.
  const facets = useMemo<ReasonFacet[]>(() => {
    if (!showFacets) return [];
    const counts = new Map<ActionReason, number>();
    for (const c of queueCases) {
      if (!c.actionReason) continue;
      counts.set(c.actionReason, (counts.get(c.actionReason) ?? 0) + 1);
    }
    return (Object.keys(REASON_LABELS) as ActionReason[])
      .filter((reason) => (counts.get(reason) ?? 0) > 0)
      .map((reason) => ({ reason, label: REASON_LABELS[reason], count: counts.get(reason)! }));
  }, [showFacets, queueCases]);

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

  return { activeName, ageFilter, bulkBusy, channelFilter, closePeek, columnSizing, columns, eligibleRows, facets, filtered, filtersActive, ineligibleCount, isHeld, navigate, onTabSelect, pageItems, pagePeek, peekId, peekList, providerFilter, providerOptions, queue, queueCases, queueQuery, queueTabCounts, reasonFilter, restoreFocusFromBar, runBulk, runBulkChase, search, selected, setAgeFilter, setChannelFilter, setPage, setProviderFilter, setReasonFilter, setSearch, setSelected, setStatusFilter, showFacets, showStatusFilter, statusFilter, styles, win, AGE_OPTIONS, ANY, EMPTY_STATE };
}

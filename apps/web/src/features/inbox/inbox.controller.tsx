
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Toast, ToastBody, ToastTitle, useToastController } from '@fluentui/react-components';
import { GLOBAL_TOASTER_ID, useTableTypography } from '../../shared/ui';
import { parsePeek, withPeek, withoutPeek } from '../../shared/navigation/peek';
import { parseInboxItem, resolveInboxItem, withoutInboxItem } from './inbox-deep-link';
import { mailboxFacets, matchesMailboxFilter, type MailboxFilter } from './inbox-mailbox-filter';
import { pageWindow, slicePage, clampPage, pageOf } from '../../shared/navigation/inbox-pagination';
import { EMAIL_TYPE_ALL, emailTypeParam, matchesEmailType, readInboxFilterParams, type EmailTypeFilter } from './inbox-email-type';
import { data, serverMessageOf, useInbox as useInboxQuery, useOutlookMove, useOutlookMoveGate } from '../../data';
import type { InboundEmail, TriageState } from '@cs/domain';

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

const TYPE_ALL_OPTION = '__all__';
const isHandledState = (state: TriageState): boolean => state === 'actioned' || state === 'dismissed';

import { useStyles } from './inbox.styles';
import { useInboxColumns } from './inbox-columns';

export function useInboxController() {
  const styles = useStyles();
  const tt = useTableTypography();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  const [search, setSearch] = useState('');
  // The two URL-backed filters of the single-list model (TKT-054 / 020726 E1):
  // ?type=<categoryId|subtypeId> and ?dismissed=1.
  const [emailType, setEmailType] = useState<EmailTypeFilter>(
    () => readInboxFilterParams(searchParams).emailType,
  );
  const [showDismissed, setShowDismissed] = useState<boolean>(
    () => readInboxFilterParams(searchParams).showDismissed,
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
  const inbox = useInboxQuery({ view: 'all' });
  const rows = useMemo(() => inbox.data ?? [], [inbox.data]);

  // The Outlook-move gate (020726 E6): undefined/loading = OFF → the suggested-
  // action column renders display-only text until the gate read lands.
  const moveGate = useOutlookMoveGate();
  const moveEnabled = moveGate.data?.enabled === true;
  const { move: outlookMove } = useOutlookMove();

  // URL → state sync. Other URL parameters are owned by their corresponding
  // navigation features and are left untouched here.
  useEffect(() => {
    const current = readInboxFilterParams(searchParams);
    setEmailType((prev) => {
      const next = current.emailType;
      return emailTypeParam(prev) === emailTypeParam(next) ? prev : next;
    });
    setShowDismissed(current.showDismissed);
  }, [searchParams]);

  // Fresh data resolved → the server slice is authoritative again; drop optimistic hides.
  useEffect(() => {
    setPendingHidden((prev) => (prev.size === 0 ? prev : new Set()));
  }, [inbox.data]);

  // `?item=<inbound email id>` deep link (TKT-072: a global-search EMAIL hit opens
  // THAT email's preview). One-shot: wait for the list to load, open the row's
  // preview if it exists, then consume the param either way — an unknown/stale id
  // degrades honestly to the plain inbox (no error flash), and Back returns to the
  // search results instead of re-opening the preview.
  const inboxItemId = parseInboxItem(searchParams.toString());
  useEffect(() => {
    if (!inboxItemId || inbox.loading) return;
    const target = resolveInboxItem(rows, inboxItemId);
    if (target) setSelectedEmail(target);
    setSearchParams((prev) => withoutInboxItem(prev.toString()), { replace: true });
  }, [inboxItemId, inbox.loading, rows, setSearchParams]);

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
      // TKT-091 — show the server's plain-English reason when it sent one (e.g. the
      // filing queue missing / a permission not granted), never the technical line.
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t file this email.</ToastTitle>
          <ToastBody>{serverMessageOf(err) ?? 'Please try again in a moment.'}</ToastBody>
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
  const { columnSizing, columns } = useInboxColumns({ styles, tt, hoveredRowId, selectedEmail, moveEnabled, navigate, openPeek, selectEmail, setPointerRow, setReclassifyRow, setTriage, fileToOutlook });

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

  return { applyEmailType, applyShowDismissed, clearFilters, closePeek, columnSizing, columns, copyPointer, dispatchToast, emailType, filtered, hiddenDismissedCount, inbox, mailboxChips, mailboxFilter, navigate, onlyDismissedHidden, pageItems, pagePeek, peekId, peekList, pointerRow, preMailboxFiltered, reclassifyRow, refresh, rows, search, selectMailboxFilter, selectedEmail, setHoveredRowId, setPage, setPointerRow, setReclassifyRow, setSearch, setSelectedEmail, setTriage, showDismissed, styles, win, TYPE_ALL_OPTION, isHandledState };
}

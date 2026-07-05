import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Spinner } from '@fluentui/react-components';
import {
  Button,
  Caption1,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  RefreshCw,
  AlertOctagon,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CheckCheck,
  Eye,
  Inbox,
  Send,
  CalendarRange,
  Copy,
  GitFork,
  ImageOff,
  FileWarning,
  AlertTriangle,
  AlertCircle,
  Briefcase,
  Mail,
  MailQuestion,
  type LucideIcon,
} from 'lucide-react';

import {
  SectionHeading,
  PipelineStrip,
  VrmPlate,
  EmptyState,
  ErrorState,
  DashboardSkeleton,
  CasePeekDrawer,
  useSeverityChipStyles,
} from '../components';
import { useDashboard } from '../data';
import type { ActionReason, AgingRow, PipelineStageKey } from '../data';
import {
  ageSeverity,
  dueText,
  duePillText,
  groupAgingRows,
  type NeedsActionGroup,
} from './dashboard-needs-action';
import { caseDisplayName } from './case-list-columns';
import { nextPeekId, parsePeek, withPeek, withoutPeek } from './peek';

/* ============================================================
   Dashboard — the CHASE COCKPIT.

   Three kinds of number, never conflated:
     A. LIVE DEPTH    — drainable backlogs (Needs action, Ready). Thin strip.
     B. THROUGHPUT    — windowed (today / this week). Never lifetime.
     C. NEEDS ACTION  — the hero: oldest-due-first exception list.

   Refresh model (shape only, mock data): recompute on mount + on window
   focus + a focus-gated ~75s poll. A quiet "Updated HH:MM · Refresh"
   affordance restamps the time. Nothing here is a lifetime counter.

   ── LAYOUT (TKT-054 from-scratch redesign, 030726) ────────────────────────
   The five prior patch rounds chased a moving overlap between the needs-action
   list and the right rail with fr-vs-fr grid tracks, breakpoint moves, label
   wrapping and finally position:sticky. All shared one fragile premise: the two
   columns competed for width (fr vs fr) and for height (a list that grew to
   ~6500px once "Show all" expanded, beside a ~640px rail → a huge void, and on
   some machines an actual paint overlap). This redesign removes the whole
   problem class deterministically:

     1. FIXED right rail. The cockpit grid is `minmax(0, 1fr) <RAIL_W>px`, not
        fr-vs-fr. A fixed track cannot be pushed by the left column, and the
        left `minmax(0, 1fr)` track can never overflow its cell. The left column
        carries minWidth:0 + overflowX:hidden and every long string ellipsizes,
        so content can never paint over the rail. Below RAIL_STACK_BP the grid
        collapses to one column (rail below the list) — a SINGLE media query on
        the SINGLE grid container, so Griffel's non-guaranteed media-rule
        ordering can never matter (no child carries a competing media block).
     2. BOUNDED needs-action list. The groups render inside ONE internally
        scrollable panel (maxHeight ~viewport, overflowY:auto, thin scrollbar).
        "Show all 118" now expands INSIDE the panel, so the column stays roughly
        viewport-height and no void ever opens beside the rail — regardless of
        list length. No sticky, no alignSelf, no top-offset hacks.
     3. Whole cockpit capped (COCKPIT_MAX) so ultra-wide doesn't stretch to
        sparseness.
   ============================================================ */

const POLL_MS = 75_000;

/* Fixed right-rail width (px). A fixed track — not an fr — so the left column
   can never push it and it can never be pushed. ~400px comfortably holds the
   2×2 inbox tiles + the throughput grid + the queues stack. */
const RAIL_W = 400;
/* Below this viewport width the two columns stack (rail below the list). One
   media query, on the grid container only. */
const RAIL_STACK_BP = 1100;
/* Cap the cockpit content so ultra-wide (rail collapsed at ~1920) stops
   stretching into sparseness; left-aligned, not centred (a dashboard reads
   left-anchored). */
const COCKPIT_MAX = 1680;

/* Re-cut funnel stage → the queue/view it drills into (clickable strip).
   Each stage lands on a destination that CONTAINS the statuses it counts, so the
   strip never advertises a number then drops the user on a thinner list. The
   mapping mirrors the shared statusToStage buckets onto the three queues:
     - new (new_email/ingested) live in the Not ready queue → land there.
     - not_ready (missing_images/missing_required_fields/needs_review/linked) →
       the Not ready queue.
     - review (ready_for_eva) → the Review queue.
   `submitted` is no longer a funnel segment (its cumulative total moved to the
   throughput strip), so it carries no route here. Held (error/duplicate_risk) is
   reached via the dashboard held bar below, not the funnel. */
const STAGE_ROUTE: Partial<Record<PipelineStageKey, string>> = {
  new: '/queue/not-ready',
  not_ready: '/queue/not-ready',
  review: '/queue/review',
};

/* ----------  styles  ---------- */

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    // Cap the cockpit content width so it stops stretching on ultra-wide (e.g.
    // rail collapsed at 1920). Left-aligned within the padded content area — the
    // heading, pipeline and cockpit all share the same left edge and right cap.
    maxWidth: `${COCKPIT_MAX}px`,
    width: '100%',
  },

  /* Split-pane cockpit: exceptions left, telemetry right (desktop).
     DETERMINISTIC two-column grid — a FIXED right rail (not fr-vs-fr), so the
     left column can never push the rail and the rail can never be pushed. The
     left `minmax(0, 1fr)` track can never overflow its cell. Below the stack
     breakpoint it collapses to one column (rail below the list). This is the
     ONLY media query in the cockpit — no child carries a competing media block,
     so Griffel media-rule ordering can't change the outcome. */
  cockpitGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    columnGap: tokens.spacingHorizontalXXL,
    rowGap: tokens.spacingVerticalL,
    alignItems: 'start',
    [`@media (min-width: ${RAIL_STACK_BP}px)`]: {
      gridTemplateColumns: `minmax(0, 1fr) ${RAIL_W}px`,
    },
  },
  // Left column — MUST carry minWidth:0 (so the grid track can shrink) and
  // overflowX:hidden (belt-and-braces: even a mis-sized child is clipped, never
  // painted over the rail).
  cockpitMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    minWidth: 0,
    overflowX: 'hidden',
  },
  // Right rail — fixed-width track. minWidth:0 keeps its own children honest.
  cockpitSide: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    minWidth: 0,
  },

  regionHeading: {
    margin: 0,
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontWeight: 'inherit',
  },

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

  /* "Updated HH:MM · Refresh" affordance (quiet) */
  updated: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
    fontSize: '12px',
    whiteSpace: 'nowrap',
  },
  refreshBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    background: 'none',
    border: 'none',
    margin: 0,
    padding: '6px 10px',
    minHeight: '32px',
    borderRadius: '2px',
    cursor: 'pointer',
    color: tokens.colorNeutralForeground2,
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    // Quiet hover — red-on-hover falsely signals severity (reforge 2026-07-01).
    ':hover': {
      color: 'var(--ce-ink)',
      textDecoration: 'underline',
      textUnderlineOffset: '2px',
    },
  },

  /* exceptions bar — surfaces the can't-pass-through queue (queues #3) */
  exceptionBar: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderRadius: '2px',
    border: '1px solid var(--ce-red)',
    backgroundColor: 'var(--ce-red-tint)',
    color: 'var(--ce-red-dark)',
    fontWeight: tokens.fontWeightSemibold,
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    ':hover': { border: '1px solid var(--ce-red-dark)' },
  },
  exceptionText: { flexGrow: 1, minWidth: 0 },

  /* ----- region scaffolding ----- */
  region: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minWidth: 0,
  },

  /* ----- Region A: live depth — a 2×2 grid of EQUAL tiles. Equal tracks +
     flush-right chevrons keep the four tiles aligned at any width. The tracks
     are minmax(0, 1fr) so they shrink inside the fixed rail without overflow. */
  liveStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gridAutoRows: '1fr',
    gap: tokens.spacingHorizontalM,
  },
  // Clickable stat tile (spec §4): the affordance discriminator is an
  // always-visible chevron + a hover response (lift + --ce-shadow-hover);
  // static surfaces (thruCell figures, allTimeTile) get neither. Reduced
  // motion is gated globally in theme.css.
  liveBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    width: '100%',
    minWidth: 0,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '2px',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    cursor: 'pointer',
    textAlign: 'left',
    transitionProperty: 'background-color, border-color, box-shadow, transform',
    transitionDuration: '150ms',
    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      border: `1px solid ${tokens.colorNeutralStroke1}`,
      boxShadow: 'var(--ce-shadow-hover)',
      transform: 'translateY(-1px)',
    },
    ':active': {
      transform: 'translateY(0)',
      boxShadow: 'var(--ce-shadow-sm)',
    },
    '&:hover [data-tile-chevron]': { color: tokens.colorNeutralForeground2 },
  },
  // "Needs sorting" (untriaged) tile — warning amber, not red (reforge fork #3:
  // untriaged email needs sorting; it is not a blocker).
  liveBtnAttention: {
    ':hover': { border: '1px solid var(--ce-warning-line)' },
  },
  liveIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '34px',
    height: '34px',
    borderRadius: '2px',
    backgroundColor: tokens.colorNeutralBackground3,
    color: 'var(--ce-charcoal)',
    flexShrink: 0,
  },
  liveIconAttention: {
    backgroundColor: 'var(--ce-warning-tint)',
    color: 'var(--ce-warning-text)',
  },
  liveText: { display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 },
  // The tile number stays ink at every severity (the icon chip + hover border
  // carry the "needs sorting" signal).
  liveNumber: {
    fontFamily: 'var(--ce-font-display)',
    fontWeight: 700,
    fontSize: '26px',
    lineHeight: 1,
    color: 'var(--ce-ink)',
  },
  // Labels WRAP (max 2 lines) rather than truncate — a chopped "Needs sort…"
  // at restored-down window widths was the round-3 operator regression report.
  liveLabel: {
    fontSize: '13px',
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    lineHeight: 1.25,
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
  },
  // Right-centred, always-visible clickability cue (spec §4) — flush right in
  // the equal-width tile so the four chevrons read as one column.
  tileChevron: {
    display: 'inline-flex',
    alignItems: 'center',
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
    marginLeft: 'auto',
  },

  /* ----- Queues snapshot: a single-column stack of the three live queues.
     Reuses the inbox tile anatomy; a vertical stack (not the 2×2 grid) suits an
     odd count of three and reads as a compact rail block. ----- */
  queueList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },

  /* ----- Region B: throughput — the SAME 2×2 equal grid as the inbox tiles
     above. Equal tracks kill the flex-wrap misalignment at any rail width. */
  thruRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gridAutoRows: '1fr',
    gap: tokens.spacingHorizontalM,
  },
  thruCell: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    minWidth: 0,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '2px',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  // Lifetime "Sent to EVA" — same cell anatomy, set apart by the charcoal
  // identity rail (not severity) + an "All time" caption in the slot where
  // clickable tiles carry their chevron, so a lifetime total is never read
  // as a windowed one. Flat/static — no shadow, no chevron: not clickable.
  allTimeTile: {
    borderLeft: '3px solid var(--ce-charcoal)',
  },
  // Sub-line under the label (not a right-aligned caption — it crowded the
  // cell and forced label truncation at restored-down window widths).
  allTimeHead: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
  },
  thruIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '30px',
    height: '30px',
    borderRadius: '2px',
    backgroundColor: tokens.colorNeutralBackground3,
    color: 'var(--ce-charcoal)',
    flexShrink: 0,
  },
  thruText: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  thruLabel: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
    lineHeight: 1.25,
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
  },

  /* ----- Region C: needs-action hero list ----- */
  facets: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
  },
  // Facet chip geometry — severity colours come from the shared chip recipes
  // (severityStyles.ts: chipCritical for past-due, chipWarning for
  // duplicate/conflict), merged after this shape class.
  facetChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '3px 10px',
    borderRadius: '2px',
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground1,
  },

  /* The BOUNDED needs-action scroll panel (TKT-054 redesign §2). The groups
     live inside one internally scrollable region so "Show all" expands INSIDE
     it — the list stays ~viewport-height and never grows the page to ~6500px
     (which was what left a tall void beside the rail). maxHeight is viewport-
     relative (vh is viewport-, not container-, relative, so this is stable
     inside the app's <main> scroll container). overflowX:hidden is the final
     guarantee that no row can paint sideways over the rail. */
  needsActionScroll: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    overflowY: 'auto',
    overflowX: 'hidden',
    // 320px ≈ topbar + page heading + pipeline region + gaps; leaves the panel
    // to fill the remaining viewport. Page scroll (not a 6500px column) absorbs
    // any overshoot at short viewports.
    maxHeight: 'calc(100vh - 320px)',
    paddingRight: tokens.spacingHorizontalXS,
    // Thin scrollbar, both engines.
    scrollbarWidth: 'thin',
    scrollbarColor: `${tokens.colorNeutralStroke1} transparent`,
    '::-webkit-scrollbar': { width: '8px' },
    '::-webkit-scrollbar-thumb': {
      backgroundColor: tokens.colorNeutralStroke1,
      borderRadius: '4px',
    },
    '::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
  },

  /* Needs-action groups (spec IA §1): verb-led h3 headers carry the reason
     (icon + "<verb> — <count>"); rows are DENSE (~40px, no per-row reason
     icon — the header says why). */
  group: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  groupHead: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    margin: 0,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: 'var(--ce-ink)',
  },
  groupIcon: { display: 'inline-flex', color: tokens.colorNeutralForeground2, flexShrink: 0 },
  // Disclosure chevron for the 4th+ groups — the header text itself is NOT
  // clickable (it is a heading, not a nav affordance). 6px padding around the
  // 16px glyph = 28px hit target (headroom over the WCAG 2.5.8 24px floor).
  groupToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    border: 0,
    background: 'none',
    margin: 0,
    padding: '6px',
    borderRadius: '2px',
    cursor: 'pointer',
    color: tokens.colorNeutralForeground3,
    ':hover': { color: tokens.colorNeutralForeground2, backgroundColor: tokens.colorNeutralBackground2 },
  },
  // "Show all <n>" in-place expander — the count is always visible, so a
  // capped group never reads as the whole list (no silent caps). Expansion now
  // grows the row set INSIDE the bounded scroll panel above.
  showAllBtn: {
    alignSelf: 'flex-start',
    border: 0,
    background: 'none',
    margin: 0,
    padding: '4px 8px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
    ':hover': { color: 'var(--ce-ink)' },
  },

  list: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  /* Row = a WRAPPER (hover/border chrome) around the main open-case button +
     the sibling peek icon-button — a button can't nest a button (M-F). */
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalSNudge} ${tokens.spacingHorizontalL}`,
    borderRadius: '2px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    width: '100%',
    minWidth: 0,
    transitionProperty: 'background-color, border-color',
    transitionDuration: tokens.durationFaster,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      border: `1px solid ${tokens.colorNeutralStroke1}`,
    },
    // Reveal the peek icon-button on row hover (it reveals itself on focus).
    '&:hover [data-peek-btn]': { opacity: 1 },
  },
  rowPastDue: {
    borderLeft: '3px solid var(--ce-red)',
    ':hover': { borderLeft: '3px solid var(--ce-red)' },
  },
  // The main open-case hit area — chrome-less button filling the row.
  rowMainBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexGrow: 1,
    minWidth: 0,
    margin: 0,
    padding: 0,
    border: 0,
    background: 'none',
    font: 'inherit',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
  },
  // Peek icon-button — ALWAYS tabbable, revealed on row hover / own focus.
  peekBtn: {
    opacity: 0,
    flexShrink: 0,
    transitionProperty: 'opacity',
    transitionDuration: tokens.durationFaster,
    ':focus': { opacity: 1 },
    ':focus-visible': { opacity: 1 },
  },
  rowSub: {
    color: tokens.colorNeutralForeground3,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowSpacer: { flexGrow: 1 },

  /* "N · same VRM" twin badge — a muted chip flagging that identical-looking rows are a
     same-registration pair (not a render bug); links to the case where merge is offered. */
  twinChip: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 7px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground4,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },

  /* age/due pill — severity ramp grey → amber → red */
  agePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '2px 8px',
    borderRadius: '2px',
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  ageInfo: {
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  // Attention pill uses the LIGHTER warning tint (the accent fill is too loud
  // for a per-row pill); the blocker pill comes from chipCritical.
  ageAttention: {
    color: 'var(--ce-warning-ink)',
    backgroundColor: 'var(--ce-warning-tint)',
    border: '1px solid var(--ce-warning-line)',
  },

  chev: { color: tokens.colorNeutralForeground4, flexShrink: 0 },
});

/* ----------  icon per action reason (verbs live in dashboard-needs-action)  ---------- */

const REASON_ICON: Record<ActionReason, LucideIcon> = {
  missing_images: ImageOff,
  missing_instructions: FileWarning,
  duplicate: Copy,
  conflict: GitFork,
  needs_review: AlertTriangle,
};

/** Header icon for a group — the trailing no-reason group reuses the review glyph. */
function groupIcon(reason: ActionReason | null): LucideIcon {
  return reason ? REASON_ICON[reason] : AlertTriangle;
}

/** First N rows shown per group before the "Show all <n>" expander. */
const MAX_GROUP_ROWS = 5;
/** Groups expanded by default; 4th+ collapse to their header. */
const DEFAULT_OPEN_GROUPS = 3;

/* ----------  time formatting  ---------- */

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ----------  screen  ---------- */

export function Dashboard() {
  const styles = useStyles();
  const navigate = useNavigate();

  // The dashboard bundle (liveCounts/throughput/agingExceptions/pipelineStages)
  // is fetched through the data seam. `refetch` re-runs it; `stamp` drives the
  // "Updated HH:MM" affordance (display only — the figures come from the hook).
  // `loading` signals a background refresh (focus/poll) so the header can show a
  // tiny spinner instead of silently swapping numbers.
  const { data: dash, loading, error, refetch } = useDashboard();

  const [stamp, setStamp] = useState<Date>(() => new Date());
  const stampRef = useRef(stamp);
  stampRef.current = stamp;

  const refresh = useCallback(() => {
    setStamp(new Date());
    refetch();
  }, [refetch]);

  // Refresh on window focus + a focus-gated ~75s poll.
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const id = window.setInterval(() => {
      if (document.hasFocus()) refresh();
    }, POLL_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, [refresh]);

  // Restamp the "Updated HH:MM" time whenever fresh data resolves.
  useEffect(() => {
    if (dash) setStamp(new Date());
  }, [dash]);

  const chips = useSeverityChipStyles();

  // Needs-action grouping (pure layer). Disclosure state is per-reason, NOT
  // persisted: 4th+ groups default collapsed; "Show all" is per-group in place.
  const groups = useMemo(() => groupAgingRows(dash?.agingExceptions.rows ?? []), [dash]);
  // Same-VRM twins across the WHOLE needs-action set (a case can sit in one group and its
  // twin in another) — so identical-looking rows read as a flagged pair, not a render bug.
  const vrmCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of dash?.agingExceptions.rows ?? []) {
      const v = (r.case.vrm ?? '').trim().toUpperCase();
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return m;
  }, [dash]);
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({});
  const [showAllGroups, setShowAllGroups] = useState<Record<string, boolean>>({});

  /* ----------  quick-peek drawer (spec IA §3) — flattened group order  ---------- */
  const [searchParams, setSearchParams] = useSearchParams();
  const peekId = parsePeek(searchParams.toString());
  const [peekList, setPeekList] = useState<string[]>([]);
  const flatIds = useMemo(() => groups.flatMap((g) => g.rows.map((r) => r.case.id)), [groups]);
  useEffect(() => {
    if (!peekId) setPeekList([]);
  }, [peekId]);
  useEffect(() => {
    // Deep link (?peek= arrived from outside): snapshot once rows load.
    if (peekId && peekList.length === 0 && flatIds.length > 0) setPeekList(flatIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekId, flatIds]);
  const openPeek = useCallback(
    (id: string) => {
      setPeekList(flatIds); // snapshot at open — flattened group order
      setSearchParams(withPeek(searchParams.toString(), id)); // PUSH — Back closes
    },
    [flatIds, searchParams, setSearchParams],
  );
  const closePeek = useCallback(
    () => setSearchParams(withoutPeek(searchParams.toString()), { replace: true }),
    [searchParams, setSearchParams],
  );
  const pagePeek = useCallback(
    (id: string) => setSearchParams(withPeek(searchParams.toString(), id), { replace: true }),
    [searchParams, setSearchParams],
  );

  // First-load (no data yet) — content-shaped skeleton; hard failure — error panel.
  if (!dash) {
    return (
      <div className={mergeClasses('ce-enter', styles.root)}>
        <SectionHeading eyebrow="Overview" heading="Case intake dashboard" />
        {error ? (
          <ErrorState error={error} onRetry={refresh} title="Couldn’t load the dashboard" />
        ) : (
          <DashboardSkeleton />
        )}
      </div>
    );
  }

  const {
    pipelineStages: stages,
    liveCounts: live,
    throughput: thru,
    agingExceptions: aging,
    inbound,
  } = dash;

  // Lifetime "Sent to EVA" — the cumulative submitted count read from throughput
  // (NOT the funnel, which shows live depth only). Rendered in its OWN all-time tile,
  // never mixed into the windowed strip. Falls back to the terminal funnel stage when
  // the windowed source hasn't populated submittedTotal yet.
  const sentToEvaTotal =
    thru.submittedTotal ?? stages.find((s) => s.key === 'submitted')?.count ?? 0;

  return (
    <div className={mergeClasses('ce-enter', styles.root)}>
      <SectionHeading
        eyebrow="Overview"
        heading="Case intake dashboard"
        actions={
          <span className={styles.updated}>
            {loading && <Spinner size="tiny" aria-label="Refreshing" />}
            <span>Updated {fmtTime(stamp)}</span>
            <span aria-hidden>·</span>
            <button type="button" className={mergeClasses('ce-focusable', styles.refreshBtn)} onClick={refresh}>
              <RefreshCw size={13} strokeWidth={2} aria-hidden />
              Refresh
            </button>
          </span>
        }
      />

      <div className={styles.srOnly} aria-live="polite">
        {loading ? 'Refreshing dashboard…' : `Dashboard updated at ${fmtTime(stamp)}`}
      </div>

      {/* INTAKE PIPELINE — full-width funnel + held bar */}
      <section className={styles.region} aria-labelledby="heading-pipeline">
        <h2 className={mergeClasses('ce-overline', styles.regionHeading)} id="heading-pipeline">
          Intake pipeline
        </h2>
        <PipelineStrip
          stages={stages}
          variant="hero"
          onStageSelect={(key) => {
            const to = STAGE_ROUTE[key];
            if (to) navigate(to);
          }}
        />
        {live.held > 0 && (
          <button
            type="button"
            className={mergeClasses('ce-focusable', styles.exceptionBar)}
            onClick={() => navigate('/queue/held')}
          >
            <AlertOctagon size={18} strokeWidth={2} aria-hidden />
            <span className={styles.exceptionText}>
              {live.held} case{live.held === 1 ? '' : 's'} held — can’t pass through (missing the
              basics), a possible duplicate, or on hold. Open Held.
            </span>
            <ChevronRight size={18} aria-hidden />
          </button>
        )}
      </section>

      {/* Split cockpit: exceptions left · inbox + throughput right */}
      <div className={styles.cockpitGrid}>
        <div className={styles.cockpitMain}>
          <section className={styles.region} aria-labelledby="heading-needs-action">
            <h2 className={mergeClasses('ce-overline', styles.regionHeading)} id="heading-needs-action">
              Needs action — oldest first
            </h2>

            {aging.rows.length > 0 && (
              <div className={styles.facets}>
                {aging.pastDueCount > 0 && (
                  <span className={mergeClasses(styles.facetChip, chips.chipCritical)}>
                    <AlertTriangle size={12} strokeWidth={2.25} aria-hidden />
                    {aging.pastDueCount} past due
                  </span>
                )}
                {aging.duplicateCount > 0 && (
                  <span className={mergeClasses(styles.facetChip, chips.chipWarning)}>
                    <Copy size={12} strokeWidth={2.25} aria-hidden />
                    {aging.duplicateCount} duplicate
                  </span>
                )}
                {aging.conflictCount > 0 && (
                  <span className={mergeClasses(styles.facetChip, chips.chipWarning)}>
                    <GitFork size={12} strokeWidth={2.25} aria-hidden />
                    {aging.conflictCount} conflict
                  </span>
                )}
              </div>
            )}

            {aging.rows.length === 0 ? (
              <EmptyState
                icon={<CircleCheck size={32} strokeWidth={1.75} aria-hidden />}
                title={`Nothing waiting. New cases land here as email arrives — last checked ${fmtTime(stamp)}.`}
                // Conditional quick action (spec IA §5): untriaged email first,
                // else the review queue, else nothing to point at.
                action={
                  inbound.untriaged > 0 ? (
                    <Button
                      appearance="secondary"
                      onClick={() => navigate('/inbox')}
                    >
                      Sort new email ({inbound.untriaged})
                    </Button>
                  ) : live.review > 0 ? (
                    <Button appearance="secondary" onClick={() => navigate('/queue/review')}>
                      Review cases ready to send ({live.review})
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              // BOUNDED scroll panel (TKT-054 redesign §2): all groups live in one
              // internally scrollable region so "Show all" expands INSIDE it — the
              // column stays ~viewport-height, never ~6500px, so no void ever opens
              // beside the rail.
              <div className={styles.needsActionScroll}>
                {groups.map((group, index) => {
                  const key = group.reason ?? 'review-case';
                  const open = openOverrides[key] ?? index < DEFAULT_OPEN_GROUPS;
                  return (
                    <NeedsActionGroupSection
                      key={key}
                      group={group}
                      vrmCounts={vrmCounts}
                      collapsible={index >= DEFAULT_OPEN_GROUPS}
                      open={open}
                      showAll={showAllGroups[key] ?? false}
                      onToggleOpen={() => setOpenOverrides((prev) => ({ ...prev, [key]: !open }))}
                      onShowAll={() => setShowAllGroups((prev) => ({ ...prev, [key]: true }))}
                      onOpenCase={(id) => navigate(`/case/${id}`)}
                      onPeekCase={openPeek}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className={styles.cockpitSide}>
          <section className={styles.region} aria-labelledby="heading-inbox">
            <h2 className={mergeClasses('ce-overline', styles.regionHeading)} id="heading-inbox">
              Inbox
            </h2>
            <div className={styles.liveStrip}>
              {/* TKT-054: the inbox is one condensed list — tiles deep-link the
                  new ?type= scheme (legacy ?category/?view URLs still migrate). */}
              <InboxTile
                icon={Briefcase}
                value={inbound.receiving_work}
                label="Receiving work"
                onOpen={() => navigate('/inbox?type=receiving_work')}
              />
              <InboxTile
                icon={MailQuestion}
                value={inbound.query}
                label="Queries"
                onOpen={() => navigate('/inbox?type=query')}
              />
              <InboxTile
                icon={Mail}
                value={inbound.other}
                label="Other"
                onOpen={() => navigate('/inbox?type=other')}
              />
              <InboxTile
                icon={AlertCircle}
                value={inbound.untriaged}
                label="Needs sorting"
                attention={inbound.untriaged > 0}
                onOpen={() => navigate('/inbox')}
              />
            </div>
          </section>

          <section className={styles.region} aria-labelledby="heading-throughput">
            <h2 className={mergeClasses('ce-overline', styles.regionHeading)} id="heading-throughput">
              Today / this week
            </h2>
            <div className={styles.thruRow}>
              <ThruCell icon={Inbox} value={thru.inToday} label="In today" />
              <ThruCell icon={Send} value={thru.submittedToday} label="Submitted today" />
              <ThruCell icon={CalendarRange} value={thru.clearedThisWeek} label="Cleared this week" />
              <div className={mergeClasses(styles.thruCell, styles.allTimeTile)}>
                <span className={styles.thruIcon} aria-hidden>
                  <CheckCheck size={16} strokeWidth={1.75} />
                </span>
                <span className={styles.thruText}>
                  <span className="ce-stat">{sentToEvaTotal}</span>
                  <span className={styles.thruLabel}>Sent to EVA</span>
                  <span className={styles.allTimeHead}>All time</span>
                </span>
              </div>
            </div>
          </section>

          {/* Queues snapshot — the three live queue depths; each row deep-links
              its queue (same routes as the funnel + held bar). */}
          <section className={styles.region} aria-labelledby="heading-queues">
            <h2 className={mergeClasses('ce-overline', styles.regionHeading)} id="heading-queues">
              Queues
            </h2>
            <div className={styles.queueList}>
              <InboxTile
                icon={FileWarning}
                value={live.notReady}
                label="Not ready"
                hint="Open queue."
                onOpen={() => navigate('/queue/not-ready')}
              />
              <InboxTile
                icon={Eye}
                value={live.review}
                label="Review"
                hint="Open queue."
                onOpen={() => navigate('/queue/review')}
              />
              <InboxTile
                icon={AlertOctagon}
                value={live.held}
                label="Held"
                hint="Open queue."
                onOpen={() => navigate('/queue/held')}
              />
            </div>
          </section>
        </div>
      </div>

      {/* Quick-peek drawer — ?peek=<caseId> on the dashboard route; Prev/Next
          walk the FLATTENED group order snapshotted at open (spec IA §3). */}
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

/* ----------  Region B cell  ---------- */

function ThruCell({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  const styles = useStyles();
  return (
    <div className={styles.thruCell}>
      <span className={styles.thruIcon} aria-hidden>
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <span className={styles.thruText}>
        <span className="ce-stat">{value}</span>
        <span className={styles.thruLabel}>{label}</span>
      </span>
    </div>
  );
}

/* ----------  Section 2 inbox tile (clickable → /inbox)  ---------- */

function InboxTile({
  icon: Icon,
  value,
  label,
  attention,
  hint = 'Open inbox.',
  onOpen,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
  /** Warning-amber treatment ("Needs sorting" with a backlog) — never red. */
  attention?: boolean;
  /** Trailing sentence of the aria-label — the Queues snapshot passes "Open queue." */
  hint?: string;
  onOpen: () => void;
}) {
  const styles = useStyles();
  return (
    <button
      type="button"
      className={mergeClasses('ce-focusable', styles.liveBtn, attention && styles.liveBtnAttention)}
      onClick={onOpen}
      aria-label={`${label}: ${value}. ${hint}`}
    >
      <span className={mergeClasses(styles.liveIcon, attention && styles.liveIconAttention)} aria-hidden>
        <Icon size={18} strokeWidth={1.85} />
      </span>
      <span className={styles.liveText}>
        <span className={styles.liveNumber}>{value}</span>
        <span className={styles.liveLabel}>{label}</span>
      </span>
      <span className={styles.tileChevron} data-tile-chevron aria-hidden>
        <ChevronRight size={14} strokeWidth={2} />
      </span>
    </button>
  );
}

/* ----------  Region C: needs-action group + dense row (spec IA §1)  ---------- */

function NeedsActionGroupSection({
  group,
  vrmCounts,
  collapsible,
  open,
  showAll,
  onToggleOpen,
  onShowAll,
  onOpenCase,
  onPeekCase,
}: {
  group: NeedsActionGroup;
  /** VRM → how many needs-action rows share it (a twin badge shows when > 1). */
  vrmCounts: Map<string, number>;
  /** 4th+ groups collapse to their header (chevron toggle, not persisted). */
  collapsible: boolean;
  open: boolean;
  showAll: boolean;
  onToggleOpen: () => void;
  onShowAll: () => void;
  onOpenCase: (caseId: string) => void;
  onPeekCase: (caseId: string) => void;
}) {
  const styles = useStyles();
  const Icon = groupIcon(group.reason);
  const count = group.rows.length;
  const bodyId = `needs-action-rows-${group.reason ?? 'review-case'}`;
  const visible = showAll ? group.rows : group.rows.slice(0, MAX_GROUP_ROWS);

  // "Show all" unmounts its own button — move keyboard focus to the FIRST
  // newly-revealed row on a genuine expand (not on a mount that already has
  // showAll set), so focus never drops to <body>.
  const firstRevealedRef = useRef<HTMLButtonElement | null>(null);
  const prevShowAll = useRef(showAll);
  useEffect(() => {
    if (showAll && !prevShowAll.current) firstRevealedRef.current?.focus();
    prevShowAll.current = showAll;
  }, [showAll]);

  return (
    <div className={styles.group}>
      {/* h3, NOT clickable — the disclosure chevron (4th+ groups) is its own
          small button; the count is always visible even when collapsed. */}
      <h3 className={styles.groupHead}>
        <span className={styles.groupIcon} aria-hidden>
          <Icon size={16} strokeWidth={1.85} />
        </span>
        <span>
          {group.verb} — {count}
        </span>
        {collapsible && (
          <button
            type="button"
            className={mergeClasses('ce-focusable', styles.groupToggle)}
            aria-expanded={open}
            // Only reference the body while it is actually rendered.
            aria-controls={open ? bodyId : undefined}
            aria-label={open ? `Collapse “${group.verb}”` : `Expand “${group.verb}” (${count})`}
            onClick={onToggleOpen}
          >
            {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
          </button>
        )}
      </h3>

      {open && (
        <div className={styles.list} id={bodyId}>
          {visible.map((row, index) => (
            <AgingRowItem
              key={row.case.id}
              ref={index === MAX_GROUP_ROWS ? firstRevealedRef : undefined}
              row={row}
              verb={group.verb}
              twinCount={vrmCounts.get((row.case.vrm ?? '').trim().toUpperCase()) ?? 1}
              onOpen={() => onOpenCase(row.case.id)}
              onPeek={() => onPeekCase(row.case.id)}
            />
          ))}
          {!showAll && count > MAX_GROUP_ROWS && (
            <button
              type="button"
              className={mergeClasses('ce-focusable', styles.showAllBtn)}
              onClick={onShowAll}
            >
              Show all {count}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* Dense (~40px) needs-action row: VRM plate → vehicle · provider → due pill
    (only when a due date exists — absence is the signal) → peek icon-button →
    chevron. The verb lives on the group header; no per-row reason icon.
    STRUCTURE (M-F): a wrapper div carries the row chrome; the open-case hit
    area is a chrome-less button (a button can't nest the peek button); the
    peek icon-button is its sibling. forwardRef targets the MAIN button (the
    "Show all" focus move + the drawer's focus restore both want it). */
const AgingRowItem = forwardRef<
  HTMLButtonElement,
  { row: AgingRow; verb: string; twinCount: number; onOpen: () => void; onPeek: () => void }
>(function AgingRowItem({ row, verb, twinCount, onOpen, onPeek }, ref) {
  const styles = useStyles();
  const chips = useSeverityChipStyles();
  const c = row.case;
  const sev = ageSeverity(row);
  const pill = duePillText(row);
  const ageCls =
    sev === 'blocker' ? chips.chipCritical : sev === 'attention' ? styles.ageAttention : styles.ageInfo;
  // Join with "·" only when both sides exist — no dangling separator when the
  // provider (or model) is missing.
  const subText = [c.vehicleModel || 'Vehicle TBC', c.provider].filter(Boolean).join(' · ');
  const subAria = [c.vehicleModel || 'vehicle TBC', c.provider].filter(Boolean).join(' · ');
  // VRM-less rows never yield degenerate names (gatekeeper F3) — the ONE
  // fallback chain, shared with the queue grids so they can't drift.
  const rowName = caseDisplayName(c);

  return (
    <div className={mergeClasses(styles.row, row.pastDue && styles.rowPastDue)}>
      <button
        ref={ref}
        type="button"
        data-case-row={c.id}
        className={mergeClasses('ce-focusable', styles.rowMainBtn)}
        onClick={onOpen}
        aria-label={`${verb}. ${rowName}, ${subAria}.${twinCount > 1 ? ` ${twinCount} open cases share this registration.` : ''} ${dueText(row)}. Open case.`}
      >
        <VrmPlate vrm={c.vrm} size="small" />
        {twinCount > 1 && (
          <span className={styles.twinChip} title={`${twinCount} open cases share ${c.vrm}`}>
            {twinCount} · same VRM
          </span>
        )}
        <Caption1 className={styles.rowSub}>{subText}</Caption1>
        <span className={styles.rowSpacer} aria-hidden />
        {pill && <span className={mergeClasses(styles.agePill, ageCls)}>{pill}</span>}
      </button>
      <Button
        appearance="subtle"
        size="small"
        data-peek-btn
        className={styles.peekBtn}
        icon={<Eye size={16} />}
        aria-label={`Preview ${rowName}`}
        onClick={onPeek}
      />
      <ChevronRight size={16} className={styles.chev} aria-hidden />
    </div>
  );
});

export default Dashboard;

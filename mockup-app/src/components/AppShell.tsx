import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Avatar,
  Button,
  SearchBox,
  Tooltip,
  makeStyles,
  tokens,
  mergeClasses,
} from '@fluentui/react-components';
import {
  Clock,
  ClipboardCheck,
  AlertTriangle,
  CheckCheck,
  ListChecks,
  ChevronDown,
  ChevronRight,
  Building2,
  ScrollText,
  FilePlus2,
  Paperclip,
  LayoutDashboard,
  Inbox,
  Menu,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { QUEUES, data, useAiChatGate, type QueueName } from '../data';
import { AssistantDrawer } from './AssistantDrawer';
// Brand logos as base64 data: URIs (generated). Kept as TEXT-embedded data URIs
// (a decision inherited from the prior Power Apps Code App build, where `pac code
// push` corrupted binary image assets on upload — see the historical finding below);
// the SWA CSP `img-src 'self' data:` still permits data URIs. (Fonts can't use this
// — CSP is `font-src 'self'`.)
// Regenerate: `node scripts/gen-logo-data-uris.mjs`. See docs/plans/phase-1-intake-and-case-tracking/code-app/logo-fix-findings.md.
import { logoMark } from '../assets/logos.generated';
import { AppErrorBoundary } from './AppErrorBoundary';

/* Two-part app chrome (review 190626 nav-bar + R2 logo/colour):
   - charcoal (#2c2a27) left rail with a clean WHITE brand header carrying the
     single full-colour CE logo (the red gear + wordmark). This is the signature
     element; everything around it stays quiet. The earlier red header band put
     red + black + white in conflict — resolved by giving the logo its natural
     white space, so red lives only in the logo + the eyebrows/active accents.
     The top bar carries a neutral menu burger + the page title only.
   - Nav IA: Overview (Dashboard) · Intake (New case, Add evidence) · a first-
     class expandable "Queues" group (the four natural queues) · Admin (Provider
     Settings, Action Logs). "Done (today)" is no longer a queue page.
   <Outlet/> renders the active route. */

const RAIL_W = 240;
const RAIL_W_COLLAPSED = 60;
const TOPBAR_H = 56;

const QUEUE_ICONS: Record<QueueName, LucideIcon> = {
  'not-ready': Clock,
  review: ClipboardCheck,
  held: AlertTriangle,
};

const useStyles = makeStyles({
  shell: { display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: tokens.colorNeutralBackground2 },

  rail: {
    backgroundColor: '#2c2a27',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    width: `${RAIL_W}px`,
    flexShrink: 0,
    transition: 'width 0.15s ease',
  },
  railCollapsed: { width: `${RAIL_W_COLLAPSED}px` },

  // White brand header — the full-colour CE logo (the signature) on clean white,
  // atop the charcoal rail. Red stays in the logo + accents, never a band.
  railLogo: {
    height: `${TOPBAR_H}px`,
    display: 'flex',
    alignItems: 'center',
    padding: `0 ${tokens.spacingHorizontalL}`,
    backgroundColor: '#ffffff',
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    flexShrink: 0,
  },
  railLogoImg: { height: '30px', width: 'auto', maxWidth: '100%', display: 'block' },
  railLogoImgCollapsed: { height: '22px' },

  navList: {
    display: 'flex',
    flexDirection: 'column',
    padding: `${tokens.spacingVerticalM} 0`,
    gap: '2px',
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  navSectionLabel: {
    fontFamily: "'Futura PT', sans-serif",
    fontSize: '10px',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL} ${tokens.spacingVerticalXS}`,
  },

  navItem: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    // box-sizing:border-box so `width:100%` INCLUDES the padding. Without it the
    // 16px+12px L/R padding pushed the row to ~268px inside the 240px rail, and
    // navList's `overflowX:hidden` clipped the right-aligned count pill (the
    // Inbox / Not-ready / Review / Held badges). With border-box the right
    // padding reads as an inner gutter that keeps the badge inside the rail edge.
    boxSizing: 'border-box',
    padding: `${tokens.spacingVerticalSNudge} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalSNudge} ${tokens.spacingHorizontalL}`,
    color: 'rgba(255,255,255,0.78)',
    textDecoration: 'none',
    fontSize: tokens.fontSizeBase300,
    cursor: 'pointer',
    border: 0,
    background: 'none',
    width: '100%',
    textAlign: 'left',
    ':hover': { backgroundColor: 'rgba(255,255,255,0.06)', color: '#fff' },
    ':focus-visible': {
      outline: 'none',
      boxShadow: '0 0 0 3px rgba(219,8,22,0.55)',
      zIndex: 1,
    },
  },
  // queue sub-items sit indented under the "Queues" parent.
  navSubItem: {
    paddingLeft: tokens.spacingHorizontalXXL,
    fontSize: tokens.fontSizeBase200,
  },
  navItemActive: {
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.10)',
    fontWeight: tokens.fontWeightSemibold,
    '::before': {
      content: '""',
      position: 'absolute',
      left: 0,
      top: '6px',
      bottom: '6px',
      width: '3px',
      backgroundColor: 'var(--ce-red)',
      borderRadius: '0 2px 2px 0',
    },
  },
  navIcon: { flexShrink: 0, display: 'inline-flex' },
  navLabel: {
    flex: 1,
    minWidth: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  chevron: { flexShrink: 0, display: 'inline-flex', color: 'rgba(255,255,255,0.55)' },

  // shared count pill — inline, right-aligned, vertically centred in the row.
  countPill: {
    flexShrink: 0,
    minWidth: '20px',
    height: '18px',
    padding: '0 6px',
    borderRadius: '9px',
    fontSize: '11px',
    fontWeight: 600,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontVariantNumeric: 'tabular-nums',
  },
  countMuted: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    color: 'rgba(255,255,255,0.82)',
  },
  // the critical pill — the HELD queue only (reforge 2026-07-01: red = a case
  // can't pass through; a full review queue is normal work, so Review reads
  // muted). --ce-critical-ink fill so white text passes AA.
  countBlocker: {
    backgroundColor: 'var(--ce-critical-ink)',
    color: '#fff',
  },

  main: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 },

  topbar: {
    height: `${TOPBAR_H}px`,
    flexShrink: 0,
    backgroundColor: '#fff',
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
    padding: `0 ${tokens.spacingHorizontalXL}`,
  },
  burger: {
    border: 0,
    background: 'none',
    cursor: 'pointer',
    color: tokens.colorNeutralForeground2,
    padding: '6px',
    borderRadius: tokens.borderRadiusSmall,
    display: 'inline-flex',
    ':hover': { backgroundColor: tokens.colorNeutralBackground2 },
  },
  title: {
    fontFamily: "'Futura PT', 'Tw Cen MT Std', sans-serif",
    fontSize: '18px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'nowrap',
  },
  spacer: { flex: 1 },
  search: { width: '240px', maxWidth: '34vw' },
  user: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },

  content: { flex: 1, overflow: 'auto', padding: tokens.spacingHorizontalXXL },
});

export interface AppShellProps {
  /** Display name shown by the avatar. */
  userName?: string;
}

/** App chrome: charcoal queue rail + brand top bar + routed <Outlet/>. */
export function AppShell({ userName = 'J. Mercer' }: AppShellProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const { data: chatGate } = useAiChatGate();

  // The "Queues" group expands to its sub-queues; auto-open on a queue route.
  const onQueueRoute = location.pathname.startsWith('/queue/');
  const [queuesOpen, setQueuesOpen] = useState(true);
  useEffect(() => {
    if (onQueueRoute) setQueuesOpen(true);
  }, [onQueueRoute]);

  // Rail badge counts come through the data seam (async).
  const [counts, setCounts] = useState<Record<QueueName, number> | undefined>();
  useEffect(() => {
    let cancelled = false;
    void data.queueCounts().then((c) => {
      if (!cancelled) setCounts(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Phase 8: the untriaged-inbox backlog drives the Inbox nav pill (honest 0 until
  // the cr1bd_inboundemail table is wired — the seam returns zero counts).
  const [inboundUntriaged, setInboundUntriaged] = useState<number | undefined>();
  useEffect(() => {
    let cancelled = false;
    void data.inboundEmailCounts().then((c) => {
      if (!cancelled) setInboundUntriaged(c.untriaged);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const renderQueue = (segment: QueueName, label: string, isBlocker: boolean, sub: boolean) => {
    const Icon = QUEUE_ICONS[segment];
    const count = counts?.[segment] ?? 0;
    const badge =
      count > 0 ? (
        <span
          className={mergeClasses(
            styles.countPill,
            isBlocker ? styles.countBlocker : styles.countMuted,
          )}
        >
          {count}
        </span>
      ) : null;

    const inner = (
      <NavLink
        to={`/queue/${segment}`}
        className={({ isActive }) =>
          mergeClasses(styles.navItem, sub && !collapsed && styles.navSubItem, isActive && styles.navItemActive)
        }
      >
        <span className={styles.navIcon}>
          <Icon size={18} />
        </span>
        {!collapsed && <span className={styles.navLabel}>{label}</span>}
        {!collapsed && badge}
      </NavLink>
    );
    return collapsed ? (
      <Tooltip key={segment} content={`${label} (${count})`} relationship="label" positioning="after">
        {inner}
      </Tooltip>
    ) : (
      <div key={segment}>{inner}</div>
    );
  };

  /* A real nav entry (Dashboard, intake, the admin surfaces). `end` makes the
     match exact — required for "/" so it isn't active on every route. */
  const renderLink = (to: string, label: string, Icon: LucideIcon, end = false) => {
    const inner = (
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) => mergeClasses(styles.navItem, isActive && styles.navItemActive)}
      >
        <span className={styles.navIcon}>
          <Icon size={18} />
        </span>
        {!collapsed && <span className={styles.navLabel}>{label}</span>}
      </NavLink>
    );
    return collapsed ? (
      <Tooltip key={to} content={label} relationship="label" positioning="after">
        {inner}
      </Tooltip>
    ) : (
      <div key={to}>{inner}</div>
    );
  };

  /* The Inbox (Triage) entry — a real nav link carrying the untriaged-count pill
     (muted, like the non-blocker queue pills). Hidden count when zero. */
  const renderInboxLink = () => {
    const count = inboundUntriaged ?? 0;
    const badge =
      count > 0 ? (
        <span className={mergeClasses(styles.countPill, styles.countMuted)}>{count}</span>
      ) : null;
    const inner = (
      <NavLink
        to="/inbox"
        className={({ isActive }) => mergeClasses(styles.navItem, isActive && styles.navItemActive)}
      >
        <span className={styles.navIcon}>
          <Inbox size={18} />
        </span>
        {!collapsed && <span className={styles.navLabel}>Inbox</span>}
        {!collapsed && badge}
      </NavLink>
    );
    return collapsed ? (
      <Tooltip content={`Inbox (${count})`} relationship="label" positioning="after">
        {inner}
      </Tooltip>
    ) : (
      <div>{inner}</div>
    );
  };

  /* First-class "Queues" group: a button that toggles the four sub-queues
     (review nav-bar #6). Highlights when any queue route is active. */
  const renderQueuesGroup = () => {
    if (collapsed) {
      // No room to expand — show the four queue icons directly with tooltips.
      // Critical pill keyed on the QUEUE NAME (held only), NOT QueueDef.tone:
      // review shares tone 'blocker' but is normal work, not an exception.
      return <>{QUEUES.map((q) => renderQueue(q.name, q.label, q.name === 'held', false))}</>;
    }
    return (
      <>
        <button
          type="button"
          className={mergeClasses('ce-focusable', styles.navItem, onQueueRoute && styles.navItemActive)}
          aria-expanded={queuesOpen}
          onClick={() => setQueuesOpen((v) => !v)}
        >
          <span className={styles.navIcon}>
            <ListChecks size={18} />
          </span>
          <span className={styles.navLabel}>Queues</span>
          <span className={styles.chevron}>
            {queuesOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        </button>
        {queuesOpen && QUEUES.map((q) => renderQueue(q.name, q.label, q.name === 'held', true))}
      </>
    );
  };

  return (
    <div className={styles.shell}>
      <nav className={mergeClasses(styles.rail, collapsed && styles.railCollapsed)} aria-label="Primary">
        <Link to="/" className={mergeClasses('ce-focusable', styles.railLogo)} aria-label="Collision Engineers — home">
          <img
            src={logoMark}
            alt="Collision Engineers"
            className={mergeClasses(styles.railLogoImg, collapsed && styles.railLogoImgCollapsed)}
          />
        </Link>

        <div className={styles.navList}>
          {!collapsed && <div className={styles.navSectionLabel}>Overview</div>}
          {renderLink('/', 'Dashboard', LayoutDashboard, true)}

          {!collapsed && <div className={styles.navSectionLabel}>Triage</div>}
          {renderInboxLink()}

          {!collapsed && <div className={styles.navSectionLabel}>Intake</div>}
          {renderLink('/intake', 'New case', FilePlus2)}
          {renderLink('/evidence', 'Add evidence', Paperclip)}

          {!collapsed && <div className={styles.navSectionLabel}>Queues</div>}
          {renderQueuesGroup()}

          {/* TKT-096 (ADR-0023): Completed sits OUTSIDE the Queues group — the
              work-queues stay work-only; this is the browse/audit home for
              terminal cases (exported/awaiting delivery + delivered). */}
          {!collapsed && <div className={styles.navSectionLabel}>Completed</div>}
          {renderLink('/completed', 'Completed cases', CheckCheck)}

          {!collapsed && <div className={styles.navSectionLabel}>Admin</div>}
          {renderLink('/admin', 'Provider settings', Building2)}
          {renderLink('/logs', 'Action logs', ScrollText)}
        </div>
      </nav>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <button
            className={mergeClasses('ce-focusable', styles.burger)}
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-expanded={!collapsed}
          >
            <Menu size={20} aria-hidden />
          </button>
          <span className={styles.title}>Case Intake</span>
          <div className={styles.spacer} />
          <SearchBox
            className={styles.search}
            placeholder="Search VRM, claimant, Case/PO…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                // TKT-072 — submit to the global-search results view (falls back home on empty).
                const q = (e.target as HTMLInputElement).value.trim();
                navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/');
              }
            }}
          />
          {chatGate?.enabled && (
            <Button
              appearance="subtle"
              icon={<Sparkles size={20} aria-hidden />}
              aria-label="Open the assistant"
              onClick={() => setAssistantOpen(true)}
            />
          )}
          <div className={styles.user}>
            <Avatar name={userName} size={32} color="colorful" />
          </div>
        </header>

        <main className={styles.content}>
          <AppErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </AppErrorBoundary>
        </main>
      </div>
      {chatGate?.enabled && <AssistantDrawer open={assistantOpen} onOpenChange={setAssistantOpen} />}
    </div>
  );
}

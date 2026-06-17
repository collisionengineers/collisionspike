import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Avatar,
  SearchBox,
  Tooltip,
  makeStyles,
  tokens,
  mergeClasses,
} from '@fluentui/react-components';
import {
  AlertTriangle,
  Loader,
  CheckCircle2,
  CheckCheck,
  type LucideIcon,
} from 'lucide-react';
import { QUEUES, queueCounts, type QueueName } from '../mock';

/* Two-part app chrome:
   - charcoal (#2c2a27) left rail: white reverse logo (web_logo_white.png),
     the 4-queue nav IA with INLINE right-aligned counts. The actionable
     "Needs action" count is the only red pill; the others are muted/charcoal.
     Active item = WHITE label + 3px red left accent bar + slightly darker fill.
     Collapses to icons under the burger.
   - brand top bar: full-colour logo, "Case Intake" title, SearchBox, avatar.
   <Outlet/> renders the active route. */

const RAIL_W = 232;
const RAIL_W_COLLAPSED = 60;
const TOPBAR_H = 56;

const QUEUE_ICONS: Record<QueueName, LucideIcon> = {
  'needs-action': AlertTriangle,
  'in-progress': Loader,
  ready: CheckCircle2,
  done: CheckCheck,
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

  railLogo: {
    height: `${TOPBAR_H}px`,
    display: 'flex',
    alignItems: 'center',
    padding: `0 ${tokens.spacingHorizontalL}`,
    borderBottom: '1px solid rgba(255,255,255,0.10)',
    flexShrink: 0,
  },
  railLogoImg: { height: '26px', width: 'auto', display: 'block' },
  railLogoImgCollapsed: { height: '22px' },

  navList: { display: 'flex', flexDirection: 'column', padding: `${tokens.spacingVerticalM} 0`, gap: '2px', flex: 1 },
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
    padding: `${tokens.spacingVerticalSNudge} ${tokens.spacingHorizontalL}`,
    color: 'rgba(255,255,255,0.78)',
    textDecoration: 'none',
    fontSize: tokens.fontSizeBase300,
    cursor: 'pointer',
    border: 0,
    background: 'none',
    width: '100%',
    textAlign: 'left',
    ':hover': { backgroundColor: 'rgba(255,255,255,0.06)', color: '#fff' },
    // CE focus ring (3px red halo) for keyboard nav.
    ':focus-visible': {
      outline: 'none',
      boxShadow: '0 0 0 3px rgba(219,8,22,0.55)',
      zIndex: 1,
    },
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
      backgroundColor: '#db0816',
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
  // muted (charcoal) count pill for non-actionable queues.
  countMuted: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    color: 'rgba(255,255,255,0.82)',
  },
  // the ONLY red pill — needs-action. #8f1422 fill so white text passes AA.
  countBlocker: {
    backgroundColor: '#8f1422',
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
  topLogo: { height: '24px', width: 'auto', display: 'block' },
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
  const [collapsed, setCollapsed] = useState(false);
  const counts = queueCounts();

  const renderQueue = (segment: QueueName, label: string, isBlocker: boolean) => {
    const Icon = QUEUE_ICONS[segment];
    const count = counts[segment];
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
          mergeClasses(styles.navItem, isActive && styles.navItemActive)
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

  return (
    <div className={styles.shell}>
      <nav className={mergeClasses(styles.rail, collapsed && styles.railCollapsed)} aria-label="Queues">
        <Link to="/" className={mergeClasses('ce-focusable', styles.railLogo)} aria-label="Collision Engineers — home">
          <img
            src="/assets/web_logo_white.png"
            alt="Collision Engineers"
            className={mergeClasses(styles.railLogoImg, collapsed && styles.railLogoImgCollapsed)}
          />
        </Link>

        <div className={styles.navList}>
          {!collapsed && <div className={styles.navSectionLabel}>Queues</div>}
          {QUEUES.map((q) => renderQueue(q.name, q.label, q.tone === 'blocker'))}
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
            <img src="/assets/logo_no_margin.png" alt="" className={styles.topLogo} />
          </button>
          <span className={styles.title}>Case Intake</span>
          <div className={styles.spacer} />
          <SearchBox
            className={styles.search}
            placeholder="Search VRM, claimant, Case/PO…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate('/');
            }}
          />
          <div className={styles.user}>
            <Avatar name={userName} size={32} color="colorful" />
          </div>
        </header>

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

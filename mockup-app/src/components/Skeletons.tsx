import { Skeleton, SkeletonItem, makeStyles, tokens } from '@fluentui/react-components';

/* ============================================================
   Skeletons — content-shaped loading placeholders (Fluent v9 Skeleton).

   Preferred over a bare centred Spinner for FIRST loads: a skeleton preserves
   each screen's layout shape so the async→loaded transition reads as faster and
   doesn't jump. The mock source used to resolve synchronously so these were
   invisible; against the live Dataverse source the fetch is genuinely async.

   Fluent's <Skeleton> ships its own shimmer (reduced-motion-safe via the global
   kill-switch in theme.css). Spinner stays for in-flight ACTIONS; ProgressBar
   for the multi-second parse (see ManualIntake).
   ============================================================ */

const useStyles = makeStyles({
  stack: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM },
  bordered: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  gridRow: {
    display: 'grid',
    gridTemplateColumns: '170px 120px 150px 165px 1fr 64px 140px',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  providerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  liveStrip: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalM },
  liveBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    minWidth: '200px',
  },
  pipeBar: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
  },
  thumbGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  thumb: { borderRadius: tokens.borderRadiusMedium },
});

/** A fixed-height SkeletonItem of a given width (px or %). */
function Bar({ w, h = 16 }: { w: number | string; h?: number }) {
  return <SkeletonItem style={{ width: typeof w === 'number' ? `${w}px` : w, height: `${h}px` }} />;
}

/* ----------  Dashboard ---------- */
/** PipelineStrip-shaped bar + two live buttons + three throughput cells + aging rows. */
export function DashboardSkeleton() {
  const styles = useStyles();
  return (
    <Skeleton aria-label="Loading dashboard">
      <div className={styles.stack}>
        {/* pipeline strip (7 stages) */}
        <div className={styles.pipeBar}>
          {Array.from({ length: 7 }).map((_, i) => (
            <SkeletonItem key={i} style={{ height: '40px', flex: 1 }} />
          ))}
        </div>
        {/* live work (2 buttons) */}
        <div className={styles.liveStrip}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className={styles.liveBtn}>
              <SkeletonItem shape="square" style={{ width: '34px', height: '34px' }} />
              <div className={styles.stack} style={{ gap: tokens.spacingVerticalXS }}>
                <Bar w={40} h={24} />
                <Bar w={96} h={12} />
              </div>
            </div>
          ))}
        </div>
        {/* aging rows */}
        <div className={styles.stack}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.providerRow}>
              <SkeletonItem shape="square" style={{ width: '32px', height: '32px' }} />
              <div className={styles.stack} style={{ gap: tokens.spacingVerticalXS, flex: 1 }}>
                <Bar w="40%" />
                <Bar w="60%" h={12} />
              </div>
              <Bar w={90} h={20} />
            </div>
          ))}
        </div>
      </div>
    </Skeleton>
  );
}

/* ----------  DataGrid (queue list) ---------- */
/** Header row + N body rows sized to the CaseList column widths. */
export function DataGridSkeleton({ rows = 8 }: { rows?: number }) {
  const styles = useStyles();
  return (
    <Skeleton aria-label="Loading cases" className={styles.bordered}>
      {Array.from({ length: rows + 1 }).map((_, r) => (
        <div key={r} className={styles.gridRow}>
          {Array.from({ length: 7 }).map((__, c) => (
            <Bar key={c} w="80%" h={r === 0 ? 12 : 16} />
          ))}
        </div>
      ))}
    </Skeleton>
  );
}

/* ----------  Provider list (Admin) ---------- */
/** Toolbar block + N collapsed-row-height provider rows. */
export function ProviderListSkeleton({ rows = 8 }: { rows?: number }) {
  const styles = useStyles();
  return (
    <Skeleton aria-label="Loading provider corpus">
      <div className={styles.stack}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={styles.providerRow}>
            <SkeletonItem shape="square" style={{ width: '18px', height: '18px' }} />
            <Bar w="22%" />
            <Bar w={72} h={12} />
            <div style={{ flex: 1 }} />
            <Bar w={56} h={20} />
          </div>
        ))}
      </div>
    </Skeleton>
  );
}

/* ----------  Case detail ---------- */
/** Header lockup + spine bar + 2fr/1fr field block + sidebar list. */
export function CaseDetailSkeleton() {
  const styles = useStyles();
  return (
    <Skeleton aria-label="Loading case">
      <div className={styles.stack}>
        <div className={styles.row}>
          <SkeletonItem style={{ width: '160px', height: '40px' }} />
          <Bar w="30%" h={24} />
        </div>
        <SkeletonItem style={{ height: '44px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: tokens.spacingHorizontalL }}>
          <div className={styles.stack}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={styles.stack} style={{ gap: tokens.spacingVerticalXS }}>
                <Bar w={120} h={12} />
                <SkeletonItem style={{ height: '32px' }} />
              </div>
            ))}
          </div>
          <div className={styles.stack}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonItem key={i} style={{ height: '48px' }} />
            ))}
          </div>
        </div>
      </div>
    </Skeleton>
  );
}

/* ----------  Image thumbnail grid (CaseDetail evidence tab) ---------- */
/** A few thumbnail-shaped placeholders while images load. */
export function ThumbGridSkeleton({ count = 4 }: { count?: number }) {
  const styles = useStyles();
  return (
    <Skeleton aria-label="Loading images">
      <div className={styles.thumbGrid}>
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonItem key={i} shape="rectangle" className={styles.thumb} style={{ height: '96px' }} />
        ))}
      </div>
    </Skeleton>
  );
}

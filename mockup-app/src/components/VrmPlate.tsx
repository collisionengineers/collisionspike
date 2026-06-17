import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';

/* ============================================================
   VrmPlate — render a VRM as a UK numberplate chip.

   The domain's signature object: bold condensed mono, black on
   plate-yellow (#FFDD00), thin charcoal border, 2px radius, with an
   optional left blue GB band. Use in lists + case headers.
   ============================================================ */

const PLATE_YELLOW = '#FFDD00';
const PLATE_BORDER = '#2c2a27';
const GB_BLUE = '#0a3aa0';

type PlateSize = 'small' | 'medium' | 'large';

const SIZE: Record<PlateSize, { font: string; padV: string; padH: string; band: string; bandFont: string }> = {
  small: { font: '12px', padV: '1px', padH: '6px', band: '13px', bandFont: '7px' },
  medium: { font: '15px', padV: '3px', padH: '9px', band: '16px', bandFont: '8px' },
  large: { font: '22px', padV: '5px', padH: '13px', band: '20px', bandFont: '10px' },
};

const useStyles = makeStyles({
  plate: {
    display: 'inline-flex',
    alignItems: 'stretch',
    border: `1px solid ${PLATE_BORDER}`,
    borderRadius: '2px',
    overflow: 'hidden',
    backgroundColor: PLATE_YELLOW,
    lineHeight: 1,
    verticalAlign: 'middle',
    userSelect: 'text',
    fontFamily:
      "'Roboto Mono', ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, monospace",
  },
  band: {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: GB_BLUE,
    color: '#fff',
    fontWeight: 700,
    letterSpacing: '0.02em',
    paddingBottom: '2px',
    paddingTop: '2px',
    flexShrink: 0,
  },
  text: {
    display: 'inline-flex',
    alignItems: 'center',
    color: '#16191d',
    fontWeight: 700,
    letterSpacing: '0.08em',
    whiteSpace: 'nowrap',
    fontStretch: 'condensed',
  },
  muted: { color: tokens.colorNeutralForeground3 },
});

export interface VrmPlateProps {
  vrm: string;
  /** Plate height/scale. Default 'medium'. */
  size?: PlateSize;
  /** Render the blue GB band on the left. Default true. */
  gbBand?: boolean;
  className?: string;
}

/** UK numberplate chip for a VRM. */
export function VrmPlate({ vrm, size = 'medium', gbBand = true, className }: VrmPlateProps) {
  const styles = useStyles();
  const s = SIZE[size];
  return (
    <span
      className={mergeClasses(styles.plate, className)}
      role="img"
      aria-label={`Registration ${vrm}`}
      title={vrm}
    >
      {gbBand && (
        <span
          className={styles.band}
          style={{ width: s.band, fontSize: s.bandFont }}
          aria-hidden
        >
          GB
        </span>
      )}
      <span
        className={styles.text}
        style={{ fontSize: s.font, padding: `${s.padV} ${s.padH}` }}
      >
        {vrm}
      </span>
    </span>
  );
}

export default VrmPlate;

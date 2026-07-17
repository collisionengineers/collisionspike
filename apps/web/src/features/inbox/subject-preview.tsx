import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, Popover, PopoverSurface, Tooltip, mergeClasses } from '@fluentui/react-components';
import { Paperclip } from 'lucide-react';
import type { InboundEmail } from '@cs/domain';
import { useTableTypography } from '../../shared/ui';
import { useStyles } from './inbox.styles';

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 100;

interface PreviewContent {
  subject: string;
  bodyPreview: string;
}

interface PreviewContextValue {
  openRowId: string | null;
  requestOpen: (rowId: string, target: HTMLElement, content: PreviewContent) => void;
  requestOpenImmediate: (rowId: string, target: HTMLElement, content: PreviewContent) => void;
  requestClose: () => void;
  cancelClose: () => void;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

/** Read the shared hover/focus preview controller — must be used under
 *  {@link PreviewControllerProvider}. */
function useSubjectPreview(): PreviewContextValue {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error('useSubjectPreview must be used within PreviewControllerProvider');
  return ctx;
}

/** TKT-169: a top/bottom placement (never `'after'`/sideways, which used to
 *  open over the VRM/Ref/Status/Actions columns) puts the horizontal
 *  containment on Floating UI's `shift` main-axis — enabled by default for
 *  top/bottom placements — so the surface is kept inside the viewport left
 *  and right automatically. `fallbackPositions` gives the vertical flip
 *  (above vs below) an alternative to try when the primary side doesn't fit,
 *  which the old hard-coded `'after'` never had. */
export const previewPositioning = {
  position: 'below' as const,
  align: 'start' as const,
  offset: 8,
  // A plain mutable array (not `as const`, which would freeze it to a
  // readonly tuple) — Popover's `positioning.fallbackPositions` expects a
  // mutable `PositioningShorthandValue[]`.
  fallbackPositions: ['above'] as ('above')[],
};

/** One shared controller + one shared Popover/PopoverSurface for the whole
 *  grid (not one Popover per row). A single `openRowId` makes "never more
 *  than one preview open" true by construction, and lets rapid pointer
 *  travel across rows cancel a not-yet-open row's pending timer instead of
 *  racing two independent popovers. */
export function PreviewControllerProvider({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [content, setContent] = useState<PreviewContent | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout>>();
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  const clearOpenTimer = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = undefined;
    }
  }, []);
  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
  }, []);

  const openNow = useCallback(
    (rowId: string, el: HTMLElement, c: PreviewContent) => {
      clearOpenTimer();
      setTarget(el);
      setContent(c);
      setOpenRowId(rowId);
    },
    [clearOpenTimer],
  );

  const closeNow = useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    setOpenRowId(null);
  }, [clearOpenTimer, clearCloseTimer]);

  // Cancels a pending OPEN for whichever row requested it — this is what
  // stops rapid traversal across rows from ever flashing a stale preview.
  const requestOpen = useCallback(
    (rowId: string, el: HTMLElement, c: PreviewContent) => {
      clearCloseTimer();
      if (openRowId === rowId) return;
      clearOpenTimer();
      openTimer.current = setTimeout(() => openNow(rowId, el, c), OPEN_DELAY_MS);
    },
    [openRowId, clearCloseTimer, clearOpenTimer, openNow],
  );

  // Keyboard focus is already a deliberate action with no travel jitter —
  // skip the hover-intent debounce and open immediately.
  const requestOpenImmediate = useCallback(
    (rowId: string, el: HTMLElement, c: PreviewContent) => {
      clearCloseTimer();
      openNow(rowId, el, c);
    },
    [clearCloseTimer, openNow],
  );

  const requestClose = useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpenRowId(null), CLOSE_DELAY_MS);
  }, [clearOpenTimer, clearCloseTimer]);

  const cancelClose = useCallback(() => {
    clearCloseTimer();
  }, [clearCloseTimer]);

  useEffect(() => () => {
    clearOpenTimer();
    clearCloseTimer();
  }, [clearOpenTimer, clearCloseTimer]);

  const value = useMemo<PreviewContextValue>(
    () => ({ openRowId, requestOpen, requestOpenImmediate, requestClose, cancelClose }),
    [openRowId, requestOpen, requestOpenImmediate, requestClose, cancelClose],
  );

  return (
    <PreviewContext.Provider value={value}>
      {children}
      <Popover
        open={openRowId != null}
        onOpenChange={(_, data) => {
          if (!data.open) closeNow();
        }}
        withArrow
        positioning={{ ...previewPositioning, target: target ?? undefined }}
      >
        <PopoverSurface
          className={styles.snippetPreviewSurface}
          aria-label={`Email preview — ${content?.subject || 'no subject'}`}
          tabIndex={0}
          onPointerEnter={cancelClose}
          onPointerLeave={requestClose}
        >
          {content?.bodyPreview}
        </PopoverSurface>
      </Popover>
    </PreviewContext.Provider>
  );
}

/** The subject cell: the subject stays the click-to-select affordance
 *  (unchanged) and becomes the hover/focus trigger for the shared preview;
 *  the one-line body-snippet underneath is now inert summary text. */
export function SubjectPreviewCell({
  e,
  selected,
  onSelect,
}: {
  e: InboundEmail;
  selected: boolean;
  onSelect: (e: InboundEmail) => void;
}) {
  const styles = useStyles();
  const tt = useTableTypography();
  const { requestOpen, requestOpenImmediate, requestClose } = useSubjectPreview();
  const linkRef = useRef<HTMLButtonElement>(null);

  const previewContent = useMemo<PreviewContent>(
    () => ({ subject: e.subject || '(no subject)', bodyPreview: e.bodyPreview ?? '' }),
    [e.subject, e.bodyPreview],
  );

  const handlePointerEnter = () => {
    if (e.bodyPreview && linkRef.current) requestOpen(e.id, linkRef.current, previewContent);
  };
  const handlePointerLeave = () => {
    if (e.bodyPreview) requestClose();
  };
  const handleFocus = () => {
    if (e.bodyPreview && linkRef.current) requestOpenImmediate(e.id, linkRef.current, previewContent);
  };
  const handleBlur = () => {
    if (e.bodyPreview) requestClose();
  };

  return (
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
            stored email body — every subject is a clickable affordance. It is
            also now the hover/focus trigger for the compact preview below. */}
        <Link
          as="button"
          ref={linkRef}
          className={mergeClasses(tt.cellPrimary, styles.subjLink, selected && styles.subjLinkSelected)}
          title={`View email · ${e.subject}`}
          onClick={() => onSelect(e)}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onFocus={handleFocus}
          onBlur={handleBlur}
        >
          {e.subject || '(no subject)'}
        </Link>
      </span>
      {e.bodyPreview && (
        <span className={mergeClasses(tt.cellSecondary, styles.preview)}>{e.bodyPreview}</span>
      )}
    </span>
  );
}

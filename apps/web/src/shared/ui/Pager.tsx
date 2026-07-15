import { useEffect, useRef } from 'react';
import { Button, Caption1, makeStyles, tokens } from '@fluentui/react-components';
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';

/* ============================================================
   Pager — a generic, purely-presentational page control (TKT-098).

   The PARENT owns the page (no internal useState here) — the pager is a pure
   function of {page, pageCount, from, to, total}. It is deliberately generic
   (an `itemNoun`, not "emails") so TKT-096's queue grids can reuse it.

   Renders NOTHING when the whole list fits one page (pageCount <= 1) — no
   clutter under a short list. The "N–M of T" range is an assertive-but-polite
   live region so a page turn is announced to a screen reader.

   Boundary focus (a11y): activating a button that then disables (e.g. Next onto
   the last page) would drop focus to <body>. After such a turn we move focus to
   the still-enabled sibling (Prev at the end, Next at the start) so a keyboard
   user isn't stranded.
   ============================================================ */

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
  },
  range: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
  },
});

export interface PagerProps {
  /** Current page, 1-based. */
  page: number;
  /** Total pages (min 1) — the pager renders nothing when this is <= 1. */
  pageCount: number;
  /** 1-based index of the first item shown (0 when empty). */
  from: number;
  /** 1-based index of the last item shown (0 when empty). */
  to: number;
  /** The unpaged item count. */
  total: number;
  /** Called with the requested 1-based page — the parent re-slices + re-renders. */
  onPageChange: (page: number) => void;
  /** Plural noun for the range label + nav aria-label, e.g. "emails". */
  itemNoun?: string;
}

/** First / Prev / Next / Last page controls + a "N–M of T" range label. */
export function Pager({ page, pageCount, from, to, total, onPageChange, itemNoun = 'items' }: PagerProps) {
  const styles = useStyles();
  // The still-enabled sibling to focus after a boundary turn disables the
  // clicked button. Set by a click, consumed once `page` has re-rendered.
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<'prev' | 'next' | null>(null);

  useEffect(() => {
    const want = pendingFocus.current;
    if (!want) return;
    pendingFocus.current = null;
    (want === 'prev' ? prevRef.current : nextRef.current)?.focus();
  }, [page]);

  // The whole list fits on one page — a pager would be noise.
  if (pageCount <= 1) return null;

  const hasPrev = page > 1;
  const hasNext = page < pageCount;
  const nounLabel = itemNoun.charAt(0).toUpperCase() + itemNoun.slice(1);

  // Turn the page; if the button we clicked will disable at the new boundary,
  // hand focus to the enabled sibling once the re-render lands.
  const go = (next: number, focusAfter: 'prev' | 'next' | null) => {
    pendingFocus.current = focusAfter;
    onPageChange(next);
  };

  return (
    <nav className={styles.root} role="navigation" aria-label={`${nounLabel} pages`}>
      {/* En-dash range — live so a page turn is spoken. */}
      <Caption1 className={styles.range} role="status" aria-live="polite">
        {from}–{to} of {total} {itemNoun}
      </Caption1>
      <Button
        appearance="subtle"
        size="small"
        icon={<ChevronsLeft size={16} />}
        aria-label="First page"
        disabled={!hasPrev}
        onClick={() => go(1, 'next')}
      />
      <Button
        ref={prevRef}
        appearance="subtle"
        size="small"
        icon={<ChevronLeft size={16} />}
        aria-label="Previous page"
        disabled={!hasPrev}
        onClick={() => go(page - 1, page - 1 <= 1 ? 'next' : null)}
      />
      <Button
        ref={nextRef}
        appearance="subtle"
        size="small"
        icon={<ChevronRight size={16} />}
        aria-label="Next page"
        disabled={!hasNext}
        onClick={() => go(page + 1, page + 1 >= pageCount ? 'prev' : null)}
      />
      <Button
        appearance="subtle"
        size="small"
        icon={<ChevronsRight size={16} />}
        aria-label="Last page"
        disabled={!hasNext}
        onClick={() => go(pageCount, 'prev')}
      />
    </nav>
  );
}

export default Pager;

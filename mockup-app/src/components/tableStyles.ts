import { makeStyles, tokens } from '@fluentui/react-components';

/* ============================================================
   tableStyles — the ONE table-typography hierarchy for grid cells
   (reforge M-D, spec VISUAL §3). Both DataGrids (Inbox, CaseList)
   consume these instead of hand-rolling per-screen muted/mono recipes.

     cellPrimary   → what the row IS about: subject, outstanding verb,
                     claimant, the held decision verb.
     cellSecondary → supporting detail: preview line, provider, vehicle,
                     timestamps, plain (non-urgent) age.
     cellMono      → machine identifiers: Case/PO, VRM-as-text,
                     message ids. Uppercase, tracked, tabular numerals.

   Colour-severity overrides (past-due / due-soon text) layer on top from
   the call site — these three set the WEIGHT/SIZE hierarchy only.
   ============================================================ */

export const useTableTypography = makeStyles({
  cellPrimary: {
    color: tokens.colorNeutralForeground1,
    fontWeight: 600,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
  },
  cellSecondary: {
    color: tokens.colorNeutralForeground3,
    fontWeight: 400,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  cellMono: {
    fontFamily: 'var(--ce-font-mono)',
    fontSize: tokens.fontSizeBase200,
    fontWeight: 400,
    color: tokens.colorNeutralForeground2,
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
    fontVariantNumeric: 'tabular-nums',
  },
});

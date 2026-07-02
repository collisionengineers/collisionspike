/* ============================================================
   inbox-suggested-action — PURE model for the inbox "Suggested action"
   column (TKT-054 / 020726 E6). No React — Inbox.tsx renders the model.

   The folder mapping itself is the SHARED @cs/domain suggestedOutlookFolder —
   the same derivation the Data API uses server-side when it queues a real
   move, so the button's label and the actual filing can never disagree.

   Display model by row lifecycle + gate:
     no move state    gate on  → an actionable "File to <folder>" button
                      gate off → the same suggestion as display-only text
     queued           "Filing to <folder>…" (in flight)
     moved            "Filed to <folder>"
     failed           "Filing failed — retry" (button again, amber)
   ============================================================ */

import { suggestedOutlookFolder } from '../data/types';
import type { InboundEmail } from '../data/types';

/** The current filing destination — per the CHOSEN type (a staff override refiles
 *  to the corrected folder), the classifier's original only as fallback. Matches
 *  the server's derivation in POST /api/inbound/{id}/outlook-move. */
export function suggestedFolder(
  e: Pick<InboundEmail, 'subtype' | 'suggestedSubtype'>,
): string {
  return suggestedOutlookFolder(e.subtype ?? e.suggestedSubtype ?? 'other');
}

export type SuggestedActionModel =
  | { kind: 'suggest'; folder: string; label: string; actionable: boolean }
  | { kind: 'queued'; folder: string; label: string }
  | { kind: 'moved'; folder: string; label: string }
  | { kind: 'failed'; folder: string; label: string; actionable: boolean };

export function suggestedAction(
  e: Pick<InboundEmail, 'subtype' | 'suggestedSubtype' | 'outlookMoveState' | 'outlookMovedFolder'>,
  moveEnabled: boolean,
): SuggestedActionModel {
  const folder = e.outlookMovedFolder || suggestedFolder(e);
  switch (e.outlookMoveState) {
    case 'queued':
      return { kind: 'queued', folder, label: `Filing to ${folder}…` };
    case 'moved':
      return { kind: 'moved', folder, label: `Filed to ${folder}` };
    case 'failed':
      return {
        kind: 'failed',
        folder,
        label: moveEnabled ? 'Filing failed — retry' : 'Filing failed',
        actionable: moveEnabled,
      };
    default:
      return { kind: 'suggest', folder, label: `File to ${folder}`, actionable: moveEnabled };
  }
}

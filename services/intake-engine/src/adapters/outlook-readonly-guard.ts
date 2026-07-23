/* ============================================================
   intake-engine — read-only Outlook/message-access surface.

   This package only ever CONSUMES already-fetched, read-only message data. There is no
   live Outlook/Graph SDK dependency anywhere in this package; every export below is
   deliberately read-shaped.

   Why a type-only module is the enforcement mechanism: there is no runtime check that
   could stop a future contributor from importing a mutation call some other way —
   what this file buys is a SINGLE, reviewable choke point. Adding a mutation-shaped
   export here (moveMessage, markAsRead, sendReply, deleteMessage, etc.) would be a
   visible, one-file diff any reviewer/CI grep can catch, instead of a mutation shape
   quietly appearing scattered across the pipeline modules. That visibility is the
   entire point of keeping ALL read-shaped message-access typing in exactly one place.
   ============================================================ */

export interface Attachment {
  id: string;
  name: string;
  contentType: string;
}

/** Read-only message access. NO move/mark-read/send/delete-shaped method may be added
 * to this type — see module doc above. */
export type ReadOnlyMessageAccess = {
  getMessageBody(id: string): Promise<string>;
  getAttachments(id: string): Promise<Attachment[]>;
};

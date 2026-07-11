/**
 * Process-local notification seam for writes committed outside the mounted screen.
 *
 * Assistant confirmation cards execute through the shared data access layer, so a
 * case/detail or inbox query that is already mounted would otherwise keep showing
 * its pre-write snapshot until the user manually refreshed it. Query hooks subscribe
 * here and bump their normal refetch nonce after a successful committed write.
 */

export type CommittedWriteKind = 'case' | 'inbound';

export interface CommittedWriteTarget {
  kind: CommittedWriteKind;
  id: string;
}

export interface CommittedWriteSubscription {
  /** `any` is used by aggregate views such as the dashboard/activity feed. */
  kind: CommittedWriteKind | 'any';
  /** Omit to subscribe to every resource of the selected kind. */
  id?: string;
}

type CommittedWriteListener = (target: CommittedWriteTarget) => void;

const listeners = new Set<CommittedWriteListener>();

export function matchesCommittedWriteSubscription(
  subscription: CommittedWriteSubscription,
  target: CommittedWriteTarget,
): boolean {
  if (subscription.kind !== 'any' && subscription.kind !== target.kind) return false;
  return subscription.id === undefined || subscription.id === target.id;
}

/** Notify mounted readers only after the server has confirmed the write. */
export function notifyCommittedWrite(target: CommittedWriteTarget): void {
  for (const listener of [...listeners]) {
    try {
      listener(target);
    } catch {
      // A rendering subscriber must never turn a committed server write into an
      // apparent failure or prevent the remaining mounted readers from refreshing.
    }
  }
}

export function subscribeCommittedWrites(listener: CommittedWriteListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

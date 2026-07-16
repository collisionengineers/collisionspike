import type { QueueName } from '../../data';

/**
 * The dashboard deliberately exposes the three work queues once. Counts come
 * straight from the server's canonical queue-count map; this module does not
 * reclassify cases or maintain a second count implementation.
 */
export const DASHBOARD_QUEUE_DESTINATIONS = [
  { name: 'not-ready', label: 'Not ready', route: '/queue/not-ready' },
  { name: 'review', label: 'Review', route: '/queue/review' },
  { name: 'held', label: 'Held', route: '/queue/held' },
] as const satisfies ReadonlyArray<{
  name: QueueName;
  label: string;
  route: `/queue/${string}`;
}>;

export interface DashboardQueueCard {
  name: QueueName;
  label: string;
  route: `/queue/${string}`;
  count: number;
}

export function dashboardQueueCards(
  counts: Readonly<Record<QueueName, number>>,
): DashboardQueueCard[] {
  return DASHBOARD_QUEUE_DESTINATIONS.map((destination) => ({
    ...destination,
    count: counts[destination.name],
  }));
}

/** Breakpoints used by Dashboard.tsx and pinned by the layout contract tests. */
export const DASHBOARD_LAYOUT = Object.freeze({
  primaryCardCount: 3,
  primaryThreeColumnMinWidth: 960,
  secondaryTwoColumnMinWidth: 1100,
  tileTwoColumnMinWidth: 760,
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { InboundCounts, QueueName, Throughput } from '../data';
import { DashboardOverview } from './Dashboard';
import {
  DASHBOARD_LAYOUT,
  DASHBOARD_QUEUE_DESTINATIONS,
  dashboardQueueCards,
} from './dashboard-layout';

const queueCounts: Record<QueueName, number> = {
  'not-ready': 203,
  review: 191,
  held: 124,
};

const inboundCounts: InboundCounts = {
  receiving_work: 569,
  query: 199,
  billing: 0,
  non_actionable: 0,
  other: 141,
  case_update: 0,
  cancellation: 0,
  pre_instruction: 0,
  website_enquiry: 0,
  untriaged: 672,
};

const throughput: Throughput = {
  inToday: 4,
  submittedToday: 2,
  clearedThisWeek: 11,
  submittedTotal: 90,
};

function renderOverview(options?: {
  inboundError?: Error;
  inboundLoading?: boolean;
  withCounts?: boolean;
  queueCounts?: Record<QueueName, number>;
  throughput?: Throughput;
  inboundCounts?: InboundCounts;
}) {
  return renderToStaticMarkup(
    createElement(DashboardOverview, {
      queueCounts: options?.queueCounts ?? queueCounts,
      throughput: options?.throughput ?? throughput,
      inboundCounts:
        options?.withCounts === false ? undefined : (options?.inboundCounts ?? inboundCounts),
      inboundLoading: options?.inboundLoading ?? false,
      inboundError: options?.inboundError,
      onRetryInbound: vi.fn(),
      onNavigate: vi.fn(),
    }),
  );
}

describe('dashboard queue contract', () => {
  it('has exactly three equal-status destinations with canonical routes and counts', () => {
    expect(DASHBOARD_QUEUE_DESTINATIONS).toHaveLength(3);
    expect(dashboardQueueCards(queueCounts)).toEqual([
      { name: 'not-ready', label: 'Not ready', route: '/queue/not-ready', count: 203 },
      { name: 'review', label: 'Review', route: '/queue/review', count: 191 },
      { name: 'held', label: 'Held', route: '/queue/held', count: 124 },
    ]);

    const html = renderOverview();
    expect(html.match(/data-dashboard-queue=/g)).toHaveLength(3);
    expect(html).toContain('data-route="/queue/not-ready"');
    expect(html).toContain('data-route="/queue/review"');
    expect(html).toContain('data-route="/queue/held"');
    expect(html).toContain('aria-label="Not ready: 203 cases. Open Not ready queue."');
    expect(html).toContain('aria-label="Review: 191 cases. Open Review queue."');
    expect(html).toContain('aria-label="Held: 124 cases. Open Held queue."');
  });

  it('pins one-column compact layouts and balanced wide layouts without a fixed rail', () => {
    expect(DASHBOARD_LAYOUT).toEqual({
      primaryCardCount: 3,
      primaryThreeColumnMinWidth: 960,
      secondaryTwoColumnMinWidth: 1100,
      tileTwoColumnMinWidth: 760,
    });
    const html = renderOverview();
    expect(html).toContain('data-layout="one-to-three-columns"');
    expect(html).toContain('data-layout="one-to-two-columns"');
  });
});

describe('dashboard simplification', () => {
  it('removes the needs-action lists, held banner, queue snapshot and lifetime tile', () => {
    const html = renderOverview();
    expect(html).not.toMatch(/Needs action|oldest first|Check the flagged details|Progress the case|Show all/i);
    expect(html).not.toMatch(/can.t pass through|missing the basics|possible duplicate/i);
    expect(html).not.toMatch(/Sent to EVA|All time/i);
    expect(html).not.toContain('data-dashboard-region="queue-snapshot"');
    expect(html.match(/data-dashboard-region=/g)).toHaveLength(3);
  });

  it('keeps Inbox and Today / this week in a clear reading order', () => {
    const html = renderOverview();
    expect(html.indexOf('Case queues')).toBeLessThan(html.indexOf('Inbox'));
    expect(html.indexOf('Inbox')).toBeLessThan(html.indexOf('Today / this week'));
    expect(html).toContain('Receiving work');
    expect(html).toContain('Needs sorting');
    expect(html).toContain('Submitted today');
    expect(html).toContain('Cleared this week');
  });

  it('keeps the same stable, operable structure when every count is honestly zero', () => {
    const zeros: Record<QueueName, number> = { 'not-ready': 0, review: 0, held: 0 };
    const zeroInbound = Object.fromEntries(
      Object.keys(inboundCounts).map((key) => [key, 0]),
    ) as unknown as InboundCounts;
    const html = renderOverview({
      queueCounts: zeros,
      inboundCounts: zeroInbound,
      throughput: { inToday: 0, submittedToday: 0, clearedThisWeek: 0 },
    });
    expect(html.match(/data-dashboard-queue=/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Not ready: 0 cases. Open Not ready queue."');
    expect(html).toContain('aria-label="Review: 0 cases. Open Review queue."');
    expect(html).toContain('aria-label="Held: 0 cases. Open Held queue."');
  });

  it('uses plain handler language', () => {
    const html = renderOverview();
    expect(html).not.toMatch(/Azure|Postgres|MSAL|Entra|JWT|Function|API|endpoint|webhook|Key Vault|Dataverse|Power Automate|connector|OCR|JSON|operator-gated|deploy|mock|seed|schema|payload|provenance|\bBox\b/i);
  });
});

describe('dashboard section states', () => {
  it('shows only the Inbox retry state while healthy queue and throughput data remain', () => {
    const html = renderOverview({ inboundError: new Error('database detail must not render') });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Couldn’t load inbox totals.');
    expect(html).toContain('Try again');
    expect(html).not.toContain('database detail');
    expect(html).toContain('Not ready');
    expect(html).toContain('Cleared this week');
  });

  it('reserves the Inbox panel while its first count read is loading', () => {
    const html = renderOverview({ inboundLoading: true, withCounts: false });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Loading inbox totals');
    expect(html).toContain('Today / this week');
  });
});

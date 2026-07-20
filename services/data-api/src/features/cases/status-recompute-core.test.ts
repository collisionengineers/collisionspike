/**
 * The unified status-recompute writer (TKT-276): one authoritative case_.status_code writer that both
 * the staff and internal paths delegate to. These tests exercise its parametrisation directly, including
 * the internal path's audit suffix + generation ack that had no unit coverage before the unification.
 */
import { beforeEach, expect, it, vi } from 'vitest';
import type { CaseStatus, StatusEvaluationInput } from '@cs/domain';
import type { StatusRecomputeLoad } from './status-recompute-core.js';

const domain = vi.hoisted(() => ({ statusForReviewCase: vi.fn() }));
vi.mock('@cs/domain', () => ({ statusForReviewCase: domain.statusForReviewCase }));
vi.mock('@cs/domain/codecs', () => ({ statusToInt: (s: string) => ({ pending_review: 1, missing_images: 2 }[s] ?? 0) }));

const db = vi.hoisted(() => ({ tx: vi.fn(), q: vi.fn() }));
vi.mock('../../platform/db/client.js', () => ({ tx: db.tx }));

const chase = vi.hoisted(() => vi.fn(async () => false));
vi.mock('./overview-chase.js', () => ({ maybeSuggestOverviewChase: chase }));

const audit = vi.hoisted(() => vi.fn(async (_event: Record<string, unknown>, _q?: unknown) => undefined));
vi.mock('../../shared/audit.js', () => ({ AUDIT_ACTION: { status_changed: 'status_changed' }, writeAudit: audit }));

const ack = vi.hoisted(() => vi.fn(async () => ({ completed: true, pending: false })));
vi.mock('./status-recompute.js', () => ({ acknowledgeStatusRecompute: ack }));

const { runStatusRecompute } = await import('./status-recompute-core.js');

beforeEach(() => {
  vi.clearAllMocks();
  db.tx.mockImplementation(async (fn: (q: unknown) => Promise<unknown>) => fn(db.q));
  db.q.mockResolvedValue([]);
  domain.statusForReviewCase.mockReturnValue('missing_images');
});

const staffLoad = async (): Promise<StatusRecomputeLoad> => ({
  status: 'pending_review' as CaseStatus,
  readinessInput: {} as unknown as StatusEvaluationInput,
});

it('writes the status change + audit with the given suffix and actor, then chases', async () => {
  const result = await runStatusRecompute('case-1', {
    actor: 'staff@x',
    auditSuffix: '',
    prefill: async () => ({ found: true }),
    load: staffLoad,
  });
  expect(result).toEqual({ found: true, value: 'missing_images' });
  // UPDATE case_ ... ran with the mapped int.
  expect(db.q).toHaveBeenCalledWith(expect.stringContaining('UPDATE case_ SET status_code'), ['case-1', 2]);
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({ summary: 'Status pending_review -> missing_images', actor: 'staff@x' }),
    db.q,
  );
  expect(chase).toHaveBeenCalledWith('case-1', 'missing_images', 'staff@x');
});

it('internal path: applies the "(internal recompute)" suffix, no actor, and routes the ack through the helper', async () => {
  const result = await runStatusRecompute('case-1', {
    acknowledgeGeneration: 7,
    auditSuffix: ' (internal recompute)',
    prefill: async () => ({ found: true }),
    load: staffLoad,
  });
  expect(result).toEqual({ found: true, value: 'missing_images', completed: true, pending: false });
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({ summary: 'Status pending_review -> missing_images (internal recompute)' }),
    db.q,
  );
  // No actor field on the internal audit.
  expect(audit.mock.calls[0][0]).not.toHaveProperty('actor');
  expect(ack).toHaveBeenCalledWith(db.q, 'case-1', 7);
  expect(chase).toHaveBeenCalledWith('case-1', 'missing_images', undefined);
});

it('does not write or audit when the evaluated status is unchanged, but still chases', async () => {
  domain.statusForReviewCase.mockReturnValue('pending_review'); // same as loaded status
  const result = await runStatusRecompute('case-1', {
    prefill: async () => ({ found: true }),
    load: staffLoad,
  });
  expect(result).toEqual({ found: true, value: 'pending_review' });
  expect(db.q).not.toHaveBeenCalled();
  expect(audit).not.toHaveBeenCalled();
  expect(chase).toHaveBeenCalledWith('case-1', 'pending_review', undefined);
});

it('short-circuits with {found:false, value:error} and no transaction when prefill reports missing', async () => {
  const result = await runStatusRecompute('case-1', {
    prefill: async () => ({ found: false }),
    load: staffLoad,
  });
  expect(result).toEqual({ found: false, value: 'error' });
  expect(db.tx).not.toHaveBeenCalled();
  expect(chase).not.toHaveBeenCalled();
});

it('returns {found:false, value:error} and does not chase when the loader finds no case', async () => {
  const result = await runStatusRecompute('case-1', {
    prefill: async () => ({ found: true }),
    load: async () => null,
  });
  expect(result).toEqual({ found: false, value: 'error' });
  expect(chase).not.toHaveBeenCalled();
});

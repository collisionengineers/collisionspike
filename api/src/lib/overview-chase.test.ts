/**
 * api/src/lib/overview-chase.test.ts — OFFLINE proof for the TKT-148 overview-photo
 * chase suggestion. No Postgres, no Functions host: `db`/`audit` are mocked
 * (the inspection-prefill.test.ts idiom).
 *
 * Pins the acceptance:
 *   (a) isOverviewChaseEligible — ONLY an active case with >= N accepted photos,
 *       ZERO overview-role candidates and ZERO still-unclassified photos qualifies
 *       (N boundary, terminal/retired statuses, each predicate leg).
 *   (b) maybeSuggestOverviewChase — the guarded single-statement INSERT mints the
 *       drafted suggestion with the staff-visible handler-plain copy, targets the
 *       work provider over email, and writes ONE chaser_sent audit row carrying
 *       the created chaser id + suggested:true.
 *   (c) idempotency — a lost guard (the NOT-EXISTS matched an existing suggestion
 *       or an open chase) returns false and writes NO audit; ineligible counts
 *       never attempt the INSERT; a terminal status never touches the DB at all.
 *   (d) advisory — a DB failure returns false, never throws.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CaseStatus } from '@cs/domain';

/* ---- db: record every SQL + params; canned rows per statement ---- */
const sqls: string[] = [];
const params: unknown[][] = [];
const rowsFor = vi.fn<(sql: string, p?: unknown[]) => Record<string, unknown>[]>(() => []);
vi.mock('./db.js', () => ({
  query: vi.fn(async (sql: string, p?: unknown[]) => {
    sqls.push(sql);
    params.push(p ?? []);
    return rowsFor(sql, p);
  }),
  getPool: vi.fn(),
  tx: vi.fn(),
}));

/* ---- audit: keep AUDIT_ACTION real; spy writeAudit ---- */
const auditCalls = vi.hoisted(
  () => [] as Array<{ action: number; summary: string; after?: unknown; actor?: string }>,
);
vi.mock('./audit.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    writeAudit: vi.fn(async (a: { action: number; summary: string; after?: unknown }) => {
      auditCalls.push(a as never);
    }),
  };
});

const { AUDIT_ACTION } = await import('./audit.js');
const {
  OVERVIEW_CHASE_MIN_ACCEPTED_IMAGES,
  OVERVIEW_CHASE_TEMPLATE_LABEL,
  OVERVIEW_CHASE_SUMMARY,
  isOverviewChaseEligible,
  maybeSuggestOverviewChase,
} = await import('./overview-chase.js');

const N = OVERVIEW_CHASE_MIN_ACCEPTED_IMAGES;

/** Qualifying counts (the A.QDOS26029 shape: 8 accepted close-ups, no overview). */
const QUALIFIES = { acceptedCount: 8, overviewCount: 0, unclassifiedCount: 0 };

/** Canned aggregate row for the counts query. */
function aggRow(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    provider_display: 'QDOS Underwriting',
    accepted_count: 8,
    overview_count: 0,
    unclassified_count: 0,
    ...over,
  };
}

beforeEach(() => {
  sqls.length = 0;
  params.length = 0;
  auditCalls.length = 0;
  rowsFor.mockReset();
  rowsFor.mockImplementation((sql: string) => {
    if (sql.includes('FROM case_ c')) return [aggRow()];
    if (sql.includes('INSERT INTO chaser')) return [{ id: 'ch-148' }];
    return [];
  });
});

const insertCall = (): { sql: string; p: unknown[] } | undefined => {
  const i = sqls.findIndex((s) => s.includes('INSERT INTO chaser'));
  return i === -1 ? undefined : { sql: sqls[i], p: params[i] };
};

/* ============================================================
   (a) the pure predicate
   ============================================================ */

describe('isOverviewChaseEligible', () => {
  it(`qualifies at exactly N (${N}) accepted, zero overview, zero unclassified`, () => {
    expect(
      isOverviewChaseEligible('missing_images', {
        acceptedCount: N,
        overviewCount: 0,
        unclassifiedCount: 0,
      }),
    ).toBe(true);
  });

  it(`does not qualify below N (${N - 1})`, () => {
    expect(
      isOverviewChaseEligible('missing_images', {
        acceptedCount: N - 1,
        overviewCount: 0,
        unclassifiedCount: 0,
      }),
    ).toBe(false);
  });

  it('any overview candidate disqualifies (even one, even unconfirmed registration)', () => {
    expect(
      isOverviewChaseEligible('missing_images', {
        acceptedCount: 8,
        overviewCount: 1,
        unclassifiedCount: 0,
      }),
    ).toBe(false);
  });

  it('any still-unclassified photo disqualifies (the TKT-146 drain guard)', () => {
    expect(
      isOverviewChaseEligible('missing_images', {
        acceptedCount: 8,
        overviewCount: 0,
        unclassifiedCount: 1,
      }),
    ).toBe(false);
  });

  it('active statuses qualify; terminal + retired-merged never do', () => {
    const active: CaseStatus[] = ['needs_review', 'missing_images', 'missing_required_fields', 'ingested'];
    for (const s of active) expect(isOverviewChaseEligible(s, QUALIFIES)).toBe(true);
    const never: CaseStatus[] = ['eva_submitted', 'box_synced', 'error', 'removed', 'done', 'linked_to_instruction'];
    for (const s of never) expect(isOverviewChaseEligible(s, QUALIFIES)).toBe(false);
  });
});

/* ============================================================
   (b) the mint — row shape + audit
   ============================================================ */

describe('maybeSuggestOverviewChase — mint', () => {
  it('mints the drafted suggestion with the exact staff-visible copy and audits it', async () => {
    const minted = await maybeSuggestOverviewChase('case-1', 'missing_images');
    expect(minted).toBe(true);

    const ins = insertCall();
    expect(ins).toBeDefined();
    // Same table/columns the case-detail read queries; status_code is NOT in the
    // column list, so it keeps the DB default 'drafted' (draft-only, ADR-0003 —
    // nothing here sends). The guard's ch.status_code reference is the idempotency
    // check, not a write.
    expect(ins!.sql).toMatch(
      /INSERT INTO chaser\s*\(name, case_id, target_type_code, target_name, channel_code, template_used, drafted_at\)/,
    );
    expect(ins!.p).toEqual([
      OVERVIEW_CHASE_SUMMARY,
      'case-1',
      100000002, // work_provider target (same code as the staff logChase write)
      'QDOS Underwriting',
      100000000, // email channel
      OVERVIEW_CHASE_TEMPLATE_LABEL,
    ]);

    // ONE chaser_sent audit row carrying the created chaser id + suggested:true.
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].action).toBe(AUDIT_ACTION.chaser_sent);
    expect(auditCalls[0].summary).toContain('Chase suggested');
    expect(auditCalls[0].after).toMatchObject({
      chaserId: 'ch-148',
      templateLabel: OVERVIEW_CHASE_TEMPLATE_LABEL,
      suggested: true,
      acceptedImages: 8,
    });
  });

  it('the guarded INSERT blocks on the template (once ever) OR any open chase', () => {
    // The idempotency contract lives in the SQL itself — pin its shape.
    return maybeSuggestOverviewChase('case-1', 'missing_images').then(() => {
      const ins = insertCall();
      expect(ins!.sql).toMatch(/WHERE NOT EXISTS/);
      expect(ins!.sql).toMatch(/ch\.template_used = \$6/);
      // open statuses: drafted, sent, overdue — never 'responded' (100000002)
      expect(ins!.sql).toMatch(/ch\.status_code IN \(100000000, 100000001, 100000003\)/);
      expect(ins!.sql).not.toMatch(/100000002\)/);
    });
  });

  it('carries the staff actor onto the audit row when one is supplied', async () => {
    await maybeSuggestOverviewChase('case-1', 'missing_images', 'staff-1');
    expect(auditCalls[0].actor).toBe('staff-1');
  });

  it('handler-plain copy: no engineering tokens in any staff-visible string', () => {
    for (const s of [OVERVIEW_CHASE_SUMMARY, OVERVIEW_CHASE_TEMPLATE_LABEL]) {
      expect(s).not.toMatch(/_/); // no snake_case enum leakage
      expect(s).not.toMatch(/->|→/); // no state-machine arrows
      expect(s.toLowerCase()).not.toMatch(/candidate|classif|predicate|overview-role/);
    }
  });
});

/* ============================================================
   (c) idempotency / ineligibility — nothing minted, nothing audited
   ============================================================ */

describe('maybeSuggestOverviewChase — no-op paths', () => {
  it('lost guard (suggestion already exists / staff already chasing): false, NO audit', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (sql.includes('FROM case_ c')) return [aggRow()];
      return []; // INSERT ... WHERE NOT EXISTS matched nothing
    });
    const minted = await maybeSuggestOverviewChase('case-1', 'missing_images');
    expect(minted).toBe(false);
    expect(insertCall()).toBeDefined(); // attempted…
    expect(auditCalls).toHaveLength(0); // …but nothing to audit
  });

  it.each([
    ['an overview candidate exists', aggRow({ overview_count: 1 })],
    ['photos still unclassified', aggRow({ unclassified_count: 3 })],
    [`fewer than N accepted (${N - 1})`, aggRow({ accepted_count: N - 1 })],
  ])('ineligible — %s: never attempts the INSERT', async (_label, row) => {
    rowsFor.mockImplementation((sql: string) =>
      sql.includes('FROM case_ c') ? [row as Record<string, unknown>] : [],
    );
    const minted = await maybeSuggestOverviewChase('case-1', 'missing_images');
    expect(minted).toBe(false);
    expect(insertCall()).toBeUndefined();
    expect(auditCalls).toHaveLength(0);
  });

  it('terminal status: returns false without touching the DB at all', async () => {
    const minted = await maybeSuggestOverviewChase('case-1', 'eva_submitted');
    expect(minted).toBe(false);
    expect(sqls).toHaveLength(0);
  });

  it('unknown case (no aggregate row): false, no INSERT', async () => {
    rowsFor.mockImplementation(() => []);
    const minted = await maybeSuggestOverviewChase('missing', 'needs_review');
    expect(minted).toBe(false);
    expect(insertCall()).toBeUndefined();
  });

  it('exactly N accepted at the boundary DOES mint', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (sql.includes('FROM case_ c')) return [aggRow({ accepted_count: N })];
      if (sql.includes('INSERT INTO chaser')) return [{ id: 'ch-n' }];
      return [];
    });
    const minted = await maybeSuggestOverviewChase('case-1', 'needs_review');
    expect(minted).toBe(true);
  });
});

/* ============================================================
   (d) advisory — never throws
   ============================================================ */

describe('maybeSuggestOverviewChase — advisory', () => {
  it('a DB failure returns false and never throws (the recompute must survive)', async () => {
    rowsFor.mockImplementation(() => {
      throw new Error('connection reset');
    });
    await expect(maybeSuggestOverviewChase('case-1', 'missing_images')).resolves.toBe(false);
    expect(auditCalls).toHaveLength(0);
  });
});

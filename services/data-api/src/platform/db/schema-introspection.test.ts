/**
 * services/data-api/src/platform/db/schema-introspection.test.ts — the pure SQL-assembly branch (no DB).
 * `tableColumns`/`hasColumn` touch Postgres via lib/db.js and are exercised implicitly by
 * every route that calls them; `planOptionalColumns` is the pure piece that decides WHICH
 * columns/placeholders a schema-tolerant upsert emits, so it is what's unit-tested here.
 */
import { describe, it, expect } from 'vitest';
import { planOptionalColumns, type OptionalColumnCandidate } from './schema-introspection.js';

const CANDIDATES: OptionalColumnCandidate[] = [
  { column: 'body_jobref', value: 'REF123' },
  { column: 'conversation_id', value: 'CONV456' },
  { column: 'graph_message_id', value: 'AAMk-immutable' },
  {
    column: 'outlook_web_link',
    value: 'https://outlook.office365.com/owa/?ItemID=AAMk-immutable',
  },
];

describe('planOptionalColumns — pre-DDL vs post-DDL schema tolerance', () => {
  it('includes nothing when no optional columns are present (pre-DDL)', () => {
    const plan = planOptionalColumns('inbound_email', CANDIDATES, new Set(), 19);
    expect(plan).toEqual({ cols: [], placeholders: [], updateSets: [], values: [] });
  });

  it('includes only the present column, numbered from startIndex', () => {
    const plan = planOptionalColumns('inbound_email', CANDIDATES, new Set(['body_jobref']), 19);
    expect(plan.cols).toEqual(['body_jobref']);
    expect(plan.placeholders).toEqual(['$19']);
    expect(plan.updateSets).toEqual([
      'body_jobref = COALESCE(EXCLUDED.body_jobref, inbound_email.body_jobref)',
    ]);
    expect(plan.values).toEqual(['REF123']);
  });

  it('includes the SECOND candidate alone too (order-independent presence)', () => {
    const plan = planOptionalColumns(
      'inbound_email',
      CANDIDATES,
      new Set(['conversation_id']),
      19,
    );
    expect(plan.cols).toEqual(['conversation_id']);
    expect(plan.placeholders).toEqual(['$19']);
    expect(plan.values).toEqual(['CONV456']);
  });

  it('includes all columns in candidate order, placeholders incrementing from startIndex (post-DDL)', () => {
    const plan = planOptionalColumns(
      'inbound_email',
      CANDIDATES,
      new Set(['body_jobref', 'conversation_id', 'graph_message_id', 'outlook_web_link']),
      19,
    );
    expect(plan.cols).toEqual([
      'body_jobref',
      'conversation_id',
      'graph_message_id',
      'outlook_web_link',
    ]);
    expect(plan.placeholders).toEqual(['$19', '$20', '$21', '$22']);
    expect(plan.updateSets).toEqual([
      'body_jobref = COALESCE(EXCLUDED.body_jobref, inbound_email.body_jobref)',
      'conversation_id = COALESCE(EXCLUDED.conversation_id, inbound_email.conversation_id)',
      'graph_message_id = COALESCE(EXCLUDED.graph_message_id, inbound_email.graph_message_id)',
      'outlook_web_link = COALESCE(EXCLUDED.outlook_web_link, inbound_email.outlook_web_link)',
    ]);
    expect(plan.values).toEqual([
      'REF123',
      'CONV456',
      'AAMk-immutable',
      'https://outlook.office365.com/owa/?ItemID=AAMk-immutable',
    ]);
  });

  it('ignores a presentColumns entry that is not among the candidates', () => {
    const plan = planOptionalColumns(
      'inbound_email',
      CANDIDATES,
      new Set(['some_unrelated_column']),
      19,
    );
    expect(plan.cols).toEqual([]);
  });

  it('respects a non-default startIndex', () => {
    const plan = planOptionalColumns(
      'inbound_email',
      CANDIDATES,
      new Set(['body_jobref', 'conversation_id']),
      5,
    );
    expect(plan.placeholders).toEqual(['$5', '$6']);
  });

  it('is pure — same inputs yield equal (not just similar) output', () => {
    const present = new Set(['conversation_id']);
    const a = planOptionalColumns('inbound_email', CANDIDATES, present, 19);
    const b = planOptionalColumns('inbound_email', CANDIDATES, present, 19);
    expect(a).toEqual(b);
  });
});

/**
 * api/src/functions/inbound.ts — inbox / triage HTTP routes (Phase 8).
 *
 * DataAccess methods 27–29 (plan 21 §21.1):
 *   27 GET  /api/inbound?category=&subtype=   inboundEmails       (honest [])
 *   28 GET  /api/inbound/counts               inboundEmailCounts  (honest INBOUND_COUNTS_ZERO)
 *   29 POST /api/inbound/{id}/triage          setTriageState      (204; honest no-op)
 *
 * "Honest-empty" (plan 21 conventions): 27 + 28 resolve 200 with [] / zero on ANY
 * failure (table not wired / read error). 29 resolves (204) even on a soft failure —
 * the seam treats the triage write as an honest no-op until the table is wired.
 */

import { app } from '@azure/functions';
import {
  INBOUND_COUNTS_ZERO,
  type InboundCategory,
  type InboundCounts,
  type InboundEmail,
  type InboundSubtype,
  type TriageState,
} from '@cs/domain';
import { withRole } from '../lib/auth.js';
import { query } from '../lib/db.js';
import {
  INBOUND_CATEGORY_TO_INT,
  inboundCategoryFromInt,
  rowToInboundEmail,
  type Row,
} from '../lib/mappers.js';

// 27 — GET /api/inbound?category=&subtype=   (honest [])
app.http('inboundEmails', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'inbound',
  handler: withRole('CollisionSpike.User', async (req) => {
    try {
      const category = req.query.get('category') as InboundCategory | null;
      const subtype = req.query.get('subtype') as InboundSubtype | null;
      const params: unknown[] = [];
      let where = '';
      if (category && category in INBOUND_CATEGORY_TO_INT) {
        params.push(INBOUND_CATEGORY_TO_INT[category]);
        where = `WHERE category_code = $${params.length}`;
      }
      const rows = await query<Row>(
        `SELECT * FROM inbound_email ${where} ORDER BY received_on DESC`,
        params,
      );
      let result: InboundEmail[] = rows.map(rowToInboundEmail);
      if (subtype) result = result.filter((r) => r.subtype === subtype);
      return { status: 200, jsonBody: result };
    } catch {
      return { status: 200, jsonBody: [] }; // honest-empty on any read failure
    }
  }),
});

// 28 — GET /api/inbound/counts   (honest INBOUND_COUNTS_ZERO)
app.http('inboundEmailCounts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'inbound/counts',
  handler: withRole('CollisionSpike.User', async () => {
    try {
      const rows = await query<Row>('SELECT category_code, triage_state FROM inbound_email');
      const counts: InboundCounts = { ...INBOUND_COUNTS_ZERO };
      for (const r of rows) {
        const cat = inboundCategoryFromInt(r.category_code);
        if (cat) counts[cat] += 1;
        if ((r.triage_state ?? '') === 'new') counts.untriaged += 1;
      }
      return { status: 200, jsonBody: counts };
    } catch {
      return { status: 200, jsonBody: { ...INBOUND_COUNTS_ZERO } };
    }
  }),
});

// 29 — POST /api/inbound/{id}/triage   (204; honest no-op on failure)
app.http('setTriageState', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'inbound/{id}/triage',
  handler: withRole('CollisionSpike.User', async (req) => {
    const id = req.params.id;
    const body = (await req.json()) as { state: TriageState };
    try {
      await query('UPDATE inbound_email SET triage_state = $2, updated_at = now() WHERE id = $1', [
        id,
        body.state,
      ]);
    } catch {
      /* honest no-op — the triage table may not be wired yet */
    }
    return { status: 204 };
  }),
});

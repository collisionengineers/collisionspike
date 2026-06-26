/**
 * api/src/functions/providers.ts — provider corpus HTTP routes.
 *
 * DataAccess methods 9–10 (plan 21 §21.1):
 *   9  GET /api/providers           providers()
 *   10 GET /api/providers/{code}    providerByCode()   (404 -> SPA undefined)
 *
 * Reads the work_provider corpus table ([`20`] 010_work_provider.sql).
 */

import { app } from '@azure/functions';
import { withRole } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { rowToProvider, type Row } from '../lib/mappers.js';

// 9 — GET /api/providers
app.http('providers', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'providers',
  handler: withRole('CollisionSpike.User', async () => {
    const rows = await query<Row>('SELECT * FROM work_provider ORDER BY display_name');
    return { status: 200, jsonBody: rows.map(rowToProvider) };
  }),
});

// 10 — GET /api/providers/{code}
app.http('providerByCode', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'providers/{code}',
  handler: withRole('CollisionSpike.User', async (req) => {
    const code = req.params.code;
    const rows = await query<Row>('SELECT * FROM work_provider WHERE principal_code = $1 LIMIT 1', [
      code,
    ]);
    if (!rows[0]) return { status: 404, jsonBody: { error: 'not found' } };
    return { status: 200, jsonBody: rowToProvider(rows[0]) };
  }),
});

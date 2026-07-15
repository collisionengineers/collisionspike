/**
 * api/src/functions/settings.ts — app intake preference HTTP routes.
 *
 * DataAccess methods 25–26 (plan 21 §21.1 / §21.2; plan 10 §1.3):
 *   25 GET /api/settings/hold-new-cases   getHoldNewCasesDefault  (User)   -> { value: boolean }
 *   26 PUT /api/settings/hold-new-cases   setHoldNewCasesDefault  (Admin)  -> 204
 *
 * `hold_new_cases_by_default` is the ONE runtime-writable gate — a DB-backed
 * app_setting row (NOT an app-setting), so the running app can UPDATE it (plan 10 §1.3).
 * Read defaults to false on any failure (honest off). The WRITE is Admin-only, preserving
 * the Dataverse "writing the hold default needs env-var customization privilege" rule.
 */

import { app } from '@azure/functions';
import { withRole } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../lib/audit.js';
import type { Row } from '../lib/mappers.js';

const HOLD_KEY = 'hold_new_cases_by_default';

// 25 — GET /api/settings/hold-new-cases   (User)
app.http('getHoldNewCasesDefault', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'settings/hold-new-cases',
  handler: withRole('CollisionSpike.User', async () => {
    try {
      const rows = await query<Row>('SELECT value FROM app_setting WHERE key = $1', [HOLD_KEY]);
      return { status: 200, jsonBody: { value: (rows[0]?.value ?? 'false') === 'true' } };
    } catch {
      return { status: 200, jsonBody: { value: false } }; // honest off on any failure
    }
  }),
});

// 26 — PUT /api/settings/hold-new-cases   (Superuser-only)
app.http('setHoldNewCasesDefault', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'settings/hold-new-cases',
  handler: withRole('CollisionSpike.Superuser', async (req, _ctx, claims) => {
    const body = (await req.json()) as { value: boolean };
    const actor = actorFromClaims(claims);
    const valueStr = body.value ? 'true' : 'false';
    try {
      await query(
        `INSERT INTO app_setting (key, value, updated_at, updated_by)
         VALUES ($1, $2, now(), $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [HOLD_KEY, valueStr, actor ?? null],
      );
    } catch {
      // app_setting may be absent/unavailable — surface a retryable 503, not a masked 500.
      return { status: 503, jsonBody: { error: 'settings store unavailable' } };
    }
    await writeAudit({
      action: AUDIT_ACTION.corpus_record_changed,
      summary: `Set hold-new-cases-by-default = ${valueStr}`,
      after: { key: HOLD_KEY, value: valueStr },
      ...(actor ? { actor } : {}),
    });
    return { status: 204 };
  }),
});

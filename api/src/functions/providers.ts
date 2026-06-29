/**
 * api/src/functions/providers.ts — provider corpus HTTP routes.
 *
 * DataAccess methods 9–10 (plan 21 §21.1) + the work-todo-spike Superuser update:
 *   9  GET   /api/providers           providers()
 *   10 GET   /api/providers/{code}    providerByCode()   (404 -> SPA undefined)
 *   --  PATCH /api/providers/{id}      updateProvider()   (Superuser; automation-mode + acme)
 *
 * Reads the work_provider corpus table ([`20`] 010_work_provider.sql).
 */

import { app } from '@azure/functions';
import { type ProviderAutomationMode } from '@cs/domain';
import { automationModeCodec } from '@cs/domain/codecs';
import { withRole } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../lib/audit.js';
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normalise a known-email-domains list: trim, lower-case, drop blanks, dedupe (preserve order). */
function normaliseDomains(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of input) {
    const v = String(d ?? '').trim().toLowerCase();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

// PATCH /api/providers/{id}   (Superuser-only durable provider edit)
// Persists provider_automation_mode_code + known_email_domains so the Admin "save" stops
// no-op'ing (work-todo-spike: automation-mode resolves the persistence gap; acme resolves the
// placeholder/edit-doesn't-save complaint). principal_code is IMMUTABLE (not accepted here).
// {id} accepts EITHER the work_provider uuid OR the principal_code.
app.http('updateProvider', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'providers/{id}',
  handler: withRole('CollisionSpike.Superuser', async (req, _ctx, claims) => {
    const idOrCode = (req.params.id ?? '').trim();
    if (!idOrCode) return { status: 400, jsonBody: { error: 'id is required' } };
    const body = (await req.json().catch(() => ({}))) as {
      providerAutomationMode?: unknown;
      knownEmailDomains?: unknown;
    };

    // Validate the automation mode against the choice set (manual | review_auto | full_auto).
    let modeCode: number | undefined;
    if (body.providerAutomationMode !== undefined) {
      const mode = String(body.providerAutomationMode) as ProviderAutomationMode;
      const code = automationModeCodec.toInt(mode);
      if (code == null) return { status: 400, jsonBody: { error: 'invalid providerAutomationMode' } };
      modeCode = code;
    }

    // Validate + normalise the domain list when supplied.
    let domains: string[] | undefined;
    if (body.knownEmailDomains !== undefined) {
      domains = normaliseDomains(body.knownEmailDomains);
      if (domains === undefined) {
        return { status: 400, jsonBody: { error: 'knownEmailDomains must be an array of strings' } };
      }
    }

    if (modeCode === undefined && domains === undefined) {
      return { status: 400, jsonBody: { error: 'nothing to update' } };
    }

    // Resolve the target row (uuid or principal_code) and snapshot it for the audit.
    const where = UUID_RE.test(idOrCode) ? 'id = $1' : 'principal_code = $1';
    const existing = await query<Row>(`SELECT * FROM work_provider WHERE ${where} LIMIT 1`, [idOrCode]);
    if (!existing[0]) return { status: 404, jsonBody: { error: 'not found' } };
    const beforeRow = existing[0];

    const sets: string[] = [];
    const vals: unknown[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (modeCode !== undefined) {
      vals.push(modeCode);
      sets.push(`provider_automation_mode_code = $${vals.length}`);
      before.providerAutomationMode =
        automationModeCodec.toName(beforeRow.provider_automation_mode_code) ?? null;
      after.providerAutomationMode = automationModeCodec.toName(modeCode);
    }
    if (domains !== undefined) {
      vals.push(domains.join('\n'));
      sets.push(`known_email_domains = $${vals.length}`);
      before.knownEmailDomains = beforeRow.known_email_domains ?? null;
      after.knownEmailDomains = domains;
    }

    vals.push(beforeRow.id);
    const updated = await query<Row>(
      `UPDATE work_provider SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}
       RETURNING *`,
      vals,
    );
    if (!updated[0]) return { status: 404, jsonBody: { error: 'not found' } };

    const actor = actorFromClaims(claims);
    await writeAudit({
      action: AUDIT_ACTION.corpus_record_changed,
      summary: `Provider ${beforeRow.principal_code ?? beforeRow.id} updated: ${Object.keys(after).join(', ')}`,
      before,
      after: { ...after, principalCode: beforeRow.principal_code ?? null },
      ...(actor ? { actor } : {}),
    });

    return { status: 200, jsonBody: rowToProvider(updated[0]) };
  }),
});

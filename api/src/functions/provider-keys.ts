/**
 * api/src/functions/provider-keys.ts — Superuser API-key management (TKT-055, ADR-0020).
 *
 * Backs the Admin "API keys" section for the provider intake channel. Superuser-only
 * (mirrors providers.ts updateProvider):
 *   POST   /api/providers/{id}/api-keys          mint a key -> { id, keyPrefix, plaintextKey } ONCE
 *   GET    /api/providers/{id}/api-keys           list keys (never the plaintext)
 *   DELETE /api/providers/{id}/api-keys/{keyId}   soft-revoke (revoked_at := now())
 *
 * {id} accepts EITHER the work_provider uuid OR its principal_code. The secret is
 * hashed (SHA-256) and only the hash + display prefix are stored — the plaintext is
 * returned once and never recoverable (api/src/lib/api-key-auth.ts).
 */

import { app } from '@azure/functions';
import type { CreateProviderApiKeyResult, ProviderApiKey } from '@cs/domain';
import { withRole } from '../lib/auth.js';
import { generateApiKey } from '../lib/api-key-auth.js';
import { query } from '../lib/db.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../lib/audit.js';
import type { Row } from '../lib/mappers.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve the work_provider row from a uuid OR principal_code; null when not found. */
async function resolveProvider(idOrCode: string): Promise<Row | null> {
  const where = UUID_RE.test(idOrCode) ? 'id = $1' : 'principal_code = $1';
  const rows = await query<Row>(`SELECT * FROM work_provider WHERE ${where} LIMIT 1`, [idOrCode]);
  return rows[0] ?? null;
}

const iso = (v: unknown): string | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

function rowToApiKey(r: Row): ProviderApiKey {
  return {
    id: String(r.id),
    label: (r.label as string | null) ?? '',
    keyPrefix: (r.key_prefix as string | null) ?? '',
    createdAt: iso(r.created_at) ?? '',
    ...(r.created_by ? { createdBy: String(r.created_by) } : {}),
    revokedAt: iso(r.revoked_at),
    lastUsedAt: iso(r.last_used_at),
  };
}

/* ============================================================
   POST /api/providers/{id}/api-keys  — mint a key (returns plaintext ONCE)
   ============================================================ */
app.http('createProviderApiKey', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'providers/{id}/api-keys',
  handler: withRole('CollisionSpike.Superuser', async (req, _ctx, claims) => {
    const idOrCode = (req.params.id ?? '').trim();
    if (!idOrCode) return { status: 400, jsonBody: { error: 'id is required' } };
    const body = (await req.json().catch(() => ({}))) as { label?: unknown };
    const label = String(body.label ?? '').trim();
    if (!label) return { status: 400, jsonBody: { error: 'label is required' } };
    if (label.length > 200) {
      return { status: 400, jsonBody: { error: 'label must be 200 characters or fewer' } };
    }

    const provider = await resolveProvider(idOrCode);
    if (!provider) return { status: 404, jsonBody: { error: 'not found' } };

    const actor = actorFromClaims(claims);
    const { plaintext, keyPrefix, keyHash } = generateApiKey();
    const rows = await query<Row>(
      `INSERT INTO provider_api_key (work_provider_id, label, key_prefix, key_hash, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [provider.id, label, keyPrefix, keyHash, actor ?? null],
    );
    const id = rows[0]?.id as string | undefined;
    if (!id) return { status: 500, jsonBody: { error: 'api key insert returned no id' } };

    await writeAudit({
      action: AUDIT_ACTION.api_key_created,
      summary: `Provider API key created for ${provider.principal_code ?? provider.id} (${label})`,
      after: { keyId: id, keyPrefix, workProviderId: provider.id, principalCode: provider.principal_code ?? null },
      ...(actor ? { actor } : {}),
    });

    const result: CreateProviderApiKeyResult = { id, keyPrefix, plaintextKey: plaintext };
    return { status: 201, jsonBody: result };
  }),
});

/* ============================================================
   GET /api/providers/{id}/api-keys  — list (no plaintext)
   ============================================================ */
app.http('listProviderApiKeys', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'providers/{id}/api-keys',
  handler: withRole('CollisionSpike.Superuser', async (req) => {
    const idOrCode = (req.params.id ?? '').trim();
    if (!idOrCode) return { status: 400, jsonBody: { error: 'id is required' } };
    const provider = await resolveProvider(idOrCode);
    if (!provider) return { status: 404, jsonBody: { error: 'not found' } };
    const rows = await query<Row>(
      `SELECT id, label, key_prefix, created_at, created_by, revoked_at, last_used_at
         FROM provider_api_key WHERE work_provider_id = $1 ORDER BY created_at DESC`,
      [provider.id],
    );
    return { status: 200, jsonBody: rows.map(rowToApiKey) };
  }),
});

/* ============================================================
   DELETE /api/providers/{id}/api-keys/{keyId}  — soft-revoke
   ============================================================ */
app.http('revokeProviderApiKey', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'providers/{id}/api-keys/{keyId}',
  handler: withRole('CollisionSpike.Superuser', async (req, _ctx, claims) => {
    const idOrCode = (req.params.id ?? '').trim();
    const keyId = (req.params.keyId ?? '').trim();
    if (!idOrCode || !keyId) return { status: 400, jsonBody: { error: 'id and keyId are required' } };
    if (!UUID_RE.test(keyId)) return { status: 400, jsonBody: { error: 'invalid keyId' } };

    const provider = await resolveProvider(idOrCode);
    if (!provider) return { status: 404, jsonBody: { error: 'not found' } };

    // Scope the revoke to the provider so a keyId can't be revoked cross-provider.
    // Idempotent: a re-revoke keeps the original revoked_at (COALESCE) and still 200s.
    const rows = await query<Row>(
      `UPDATE provider_api_key
          SET revoked_at = COALESCE(revoked_at, now())
        WHERE id = $1 AND work_provider_id = $2
        RETURNING id, label, key_prefix, created_at, created_by, revoked_at, last_used_at`,
      [keyId, provider.id],
    );
    if (!rows[0]) return { status: 404, jsonBody: { error: 'not found' } };

    const actor = actorFromClaims(claims);
    await writeAudit({
      action: AUDIT_ACTION.api_key_revoked,
      severity: 'warning',
      summary: `Provider API key revoked for ${provider.principal_code ?? provider.id}`,
      after: { keyId, workProviderId: provider.id, principalCode: provider.principal_code ?? null },
      ...(actor ? { actor } : {}),
    });

    return { status: 200, jsonBody: rowToApiKey(rows[0]) };
  }),
});

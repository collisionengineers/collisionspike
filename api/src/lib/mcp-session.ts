import { randomUUID } from 'node:crypto';
import { query, tx } from './db.js';

export class McpSessionLimitError extends Error {
  constructor() {
    super('The active MCP session limit for this principal has been reached.');
    this.name = 'McpSessionLimitError';
  }
}

function sessionLifetimeMinutes(): number {
  const configured = Number(process.env.MCP_SESSION_LIFETIME_MINUTES ?? 60);
  return Number.isFinite(configured) ? Math.min(480, Math.max(5, Math.trunc(configured))) : 60;
}

function sessionCapPerPrincipal(): number {
  const configured = Number(process.env.MCP_SESSION_CAP_PER_PRINCIPAL ?? 8);
  return Number.isFinite(configured) ? Math.min(32, Math.max(1, Math.trunc(configured))) : 8;
}

export async function createMcpSession(
  principalId: string,
  protocolVersion: string,
): Promise<string> {
  const sessionId = randomUUID();
  const boundedPrincipalId = principalId.slice(0, 200);
  const lifetimeMinutes = sessionLifetimeMinutes();
  await tx(async (q) => {
    // Serialize creation per authenticated principal so concurrent initialize requests cannot
    // exceed the cap. The lock is transaction-scoped and never spans principals.
    await q('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `mcp-http-session:${boundedPrincipalId}`,
    ]);
    const sessions = await q<{ session_id: string; expired: boolean }>(
      `SELECT session_id::text, expires_at <= now() AS expired
         FROM mcp_http_session
        WHERE principal_id = $1
        ORDER BY expires_at ASC
        FOR UPDATE`,
      [boundedPrincipalId],
    );
    const reusable = sessions.find((session) => session.expired);
    if (reusable) {
      // Opportunistic cleanup reuses only this principal's expired row. The expiry predicate is
      // repeated on UPDATE so a row can never be recycled after becoming live again.
      const recycled = await q<{ session_id: string }>(
        `UPDATE mcp_http_session
            SET session_id = $1::uuid, protocol_version = $3, phase = 'initializing',
                initialized_at = NULL, last_seen_at = now(), created_at = now(),
                expires_at = now() + ($4 * interval '1 minute')
          WHERE session_id = $2::uuid AND principal_id = $5 AND expires_at <= now()
          RETURNING session_id::text`,
        [sessionId, reusable.session_id, protocolVersion, lifetimeMinutes, boundedPrincipalId],
      );
      if (recycled.length === 1) return;
    }
    if (sessions.length >= sessionCapPerPrincipal()) throw new McpSessionLimitError();
    await q(
      `INSERT INTO mcp_http_session
         (session_id, principal_id, protocol_version, phase, expires_at)
       VALUES ($1::uuid, $2, $3, 'initializing', now() + ($4 * interval '1 minute'))`,
      [sessionId, boundedPrincipalId, protocolVersion, lifetimeMinutes],
    );
  });
  return sessionId;
}

export async function markMcpSessionInitialized(
  sessionId: string,
  principalId: string,
  protocolVersion: string,
): Promise<boolean> {
  const rows = await query<{ session_id: string }>(
    `UPDATE mcp_http_session
        SET phase = 'ready', initialized_at = now(), last_seen_at = now(),
            expires_at = now() + ($4 * interval '1 minute')
      WHERE session_id = $1::uuid AND principal_id = $2
        AND protocol_version = $3 AND phase = 'initializing' AND expires_at > now()
      RETURNING session_id::text`,
    [sessionId, principalId.slice(0, 200), protocolVersion, sessionLifetimeMinutes()],
  );
  return rows.length === 1;
}

export async function touchReadyMcpSession(
  sessionId: string,
  principalId: string,
  protocolVersion: string,
): Promise<boolean> {
  const rows = await query<{ session_id: string }>(
    `UPDATE mcp_http_session
        SET last_seen_at = now(), expires_at = now() + ($4 * interval '1 minute')
      WHERE session_id = $1::uuid AND principal_id = $2
        AND protocol_version = $3 AND phase = 'ready' AND expires_at > now()
      RETURNING session_id::text`,
    [sessionId, principalId.slice(0, 200), protocolVersion, sessionLifetimeMinutes()],
  );
  return rows.length === 1;
}

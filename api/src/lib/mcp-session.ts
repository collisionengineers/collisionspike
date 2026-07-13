import { randomUUID } from 'node:crypto';
import { query } from './db.js';

function sessionLifetimeMinutes(): number {
  const configured = Number(process.env.MCP_SESSION_LIFETIME_MINUTES ?? 60);
  return Number.isFinite(configured) ? Math.min(480, Math.max(5, Math.trunc(configured))) : 60;
}

export async function createMcpSession(
  principalId: string,
  protocolVersion: string,
): Promise<string> {
  const sessionId = randomUUID();
  await query(
    `INSERT INTO mcp_http_session
       (session_id, principal_id, protocol_version, phase, expires_at)
     VALUES ($1::uuid, $2, $3, 'initializing', now() + ($4 * interval '1 minute'))`,
    [sessionId, principalId.slice(0, 200), protocolVersion, sessionLifetimeMinutes()],
  );
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

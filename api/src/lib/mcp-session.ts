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

/**
 * A row is created in `initializing` and only earns the full lifetime once `markMcpSessionInitialized`
 * promotes it to `ready`. Give the un-promoted row a SHORT distinct TTL so a crash-looping agent that
 * re-POSTs `initialize` cannot pin the per-principal cap with dangling `initializing` rows for a full
 * lifetime (a self-inflicted 429 DoS). Env `MCP_SESSION_INIT_TTL_MINUTES` (default 2), clamped to
 * [1, lifetime] so it can never outlive — nor be configured longer than — a ready session.
 */
function sessionInitTtlMinutes(): number {
  const lifetime = sessionLifetimeMinutes();
  const configured = Number(process.env.MCP_SESSION_INIT_TTL_MINUTES ?? 2);
  const resolved = Number.isFinite(configured) ? Math.trunc(configured) : 2;
  return Math.min(lifetime, Math.max(1, resolved));
}

function sessionCapPerPrincipal(): number {
  const configured = Number(process.env.MCP_SESSION_CAP_PER_PRINCIPAL ?? 8);
  return Number.isFinite(configured) ? Math.min(32, Math.max(1, Math.trunc(configured))) : 8;
}

type SessionRow = { session_id: string; phase: string; expired: boolean };

export async function createMcpSession(
  principalId: string,
  protocolVersion: string,
): Promise<string> {
  const sessionId = randomUUID();
  const boundedPrincipalId = principalId.slice(0, 200);
  // New / recycled rows are `initializing`, so they take the SHORT init TTL. The full lifetime is
  // applied only when markMcpSessionInitialized promotes the row to `ready`.
  const initTtlMinutes = sessionInitTtlMinutes();
  await tx(async (q) => {
    // Serialize creation per authenticated principal so concurrent initialize requests cannot
    // exceed the cap. The lock is transaction-scoped and never spans principals.
    await q('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `mcp-http-session:${boundedPrincipalId}`,
    ]);
    const sessions = await q<SessionRow>(
      `SELECT session_id::text, phase, expires_at <= now() AS expired
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
        [sessionId, reusable.session_id, protocolVersion, initTtlMinutes, boundedPrincipalId],
      );
      if (recycled.length === 1) return;
    }
    // Only LIVE rows can legitimately hold a slot against the cap; expired rows were already
    // recyclable above, so they never count here.
    const liveCount = sessions.filter((session) => !session.expired).length;
    if (liveCount >= sessionCapPerPrincipal()) {
      // Don't let a dead/transient slot wedge the cap. Rows are ordered by expires_at ASC, so an
      // expired or short-TTL `initializing` row sorts to the front; if the oldest is one of those,
      // evict it and hand back a fresh session instead of 429-ing a crash-looping client. The
      // predicate refuses to touch a live `ready` row, so only a full set of live ready sessions
      // trips the cap.
      const oldest = sessions[0];
      if (oldest && (oldest.expired || oldest.phase === 'initializing')) {
        const evicted = await q<{ session_id: string }>(
          `UPDATE mcp_http_session
              SET session_id = $1::uuid, protocol_version = $3, phase = 'initializing',
                  initialized_at = NULL, last_seen_at = now(), created_at = now(),
                  expires_at = now() + ($4 * interval '1 minute')
            WHERE session_id = $2::uuid AND principal_id = $5
              AND (phase = 'initializing' OR expires_at <= now())
            RETURNING session_id::text`,
          [sessionId, oldest.session_id, protocolVersion, initTtlMinutes, boundedPrincipalId],
        );
        if (evicted.length === 1) return;
      }
      throw new McpSessionLimitError();
    }
    await q(
      `INSERT INTO mcp_http_session
         (session_id, principal_id, protocol_version, phase, expires_at)
       VALUES ($1::uuid, $2, $3, 'initializing', now() + ($4 * interval '1 minute'))`,
      [sessionId, boundedPrincipalId, protocolVersion, initTtlMinutes],
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

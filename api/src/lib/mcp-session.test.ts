import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn() }));
vi.mock('./db.js', () => ({ query: db.query, tx: db.tx }));

const {
  createMcpSession,
  McpSessionLimitError,
  markMcpSessionInitialized,
  touchReadyMcpSession,
} = await import('./mcp-session.js');

beforeEach(() => {
  db.query.mockReset();
  db.tx.mockReset();
  db.tx.mockImplementation(async (fn) => fn(db.query));
  delete process.env.MCP_SESSION_LIFETIME_MINUTES;
  delete process.env.MCP_SESSION_CAP_PER_PRINCIPAL;
});

describe('durable MCP lifecycle sessions', () => {
  it('mints an opaque session in initializing phase', async () => {
    db.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const sessionId = await createMcpSession('client-1', '2025-06-18');
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(db.query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(db.query.mock.calls[1][0]).toContain('WHERE principal_id = $1');
    expect(db.query.mock.calls[2][0]).toContain("'initializing'");
    expect(db.query.mock.calls[2][1]).toEqual([sessionId, 'client-1', '2025-06-18', 60]);
  });

  it('opportunistically reuses only an expired row owned by the authenticated principal', async () => {
    db.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ session_id: '22222222-2222-4222-8222-222222222222', expired: true }])
      .mockResolvedValueOnce([{ session_id: 'replacement' }]);
    const sessionId = await createMcpSession('client-1', '2025-06-18');
    const [sql, params] = db.query.mock.calls[2];
    expect(sql).toContain('principal_id = $5 AND expires_at <= now()');
    expect(params).toEqual([
      sessionId,
      '22222222-2222-4222-8222-222222222222',
      '2025-06-18',
      60,
      'client-1',
    ]);
    expect(db.query).toHaveBeenCalledTimes(3);
  });

  it('hard-caps live durable sessions per principal under the same advisory lock', async () => {
    process.env.MCP_SESSION_CAP_PER_PRINCIPAL = '2';
    db.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { session_id: 'one', expired: false },
        { session_id: 'two', expired: false },
      ]);
    await expect(createMcpSession('client-1', '2025-06-18'))
      .rejects.toBeInstanceOf(McpSessionLimitError);
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('moves only the matching initializing session to ready and binds protocol version', async () => {
    db.query.mockResolvedValueOnce([{ session_id: 'session' }]).mockResolvedValueOnce([]);
    await expect(markMcpSessionInitialized(
      '11111111-1111-4111-8111-111111111111',
      'client-1',
      '2025-06-18',
    )).resolves.toBe(true);
    await expect(markMcpSessionInitialized(
      '11111111-1111-4111-8111-111111111111',
      'client-1',
      '2025-03-26',
    )).resolves.toBe(false);
    expect(db.query.mock.calls[0][0]).toContain("phase = 'initializing'");
    expect(db.query.mock.calls[0][1]).toContain('2025-06-18');
  });

  it('accepts later requests only for a ready, unexpired matching session', async () => {
    db.query.mockResolvedValueOnce([{ session_id: 'session' }]).mockResolvedValueOnce([]);
    await expect(touchReadyMcpSession(
      '11111111-1111-4111-8111-111111111111',
      'client-1',
      '2025-06-18',
    )).resolves.toBe(true);
    await expect(touchReadyMcpSession(
      '11111111-1111-4111-8111-111111111111',
      'other-client',
      '2025-06-18',
    )).resolves.toBe(false);
    expect(db.query.mock.calls[0][0]).toContain("phase = 'ready'");
  });
});

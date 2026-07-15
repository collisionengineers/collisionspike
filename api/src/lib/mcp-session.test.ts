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
  delete process.env.MCP_SESSION_INIT_TTL_MINUTES;
  delete process.env.MCP_SESSION_CAP_PER_PRINCIPAL;
});

describe('durable MCP lifecycle sessions', () => {
  it('mints an opaque session in initializing phase on the SHORT init TTL, not the full lifetime', async () => {
    db.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const sessionId = await createMcpSession('client-1', '2025-06-18');
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(db.query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(db.query.mock.calls[1][0]).toContain('WHERE principal_id = $1');
    expect(db.query.mock.calls[2][0]).toContain("'initializing'");
    // Default init TTL is 2 minutes (NOT the 60-minute session lifetime): an unpromoted row must
    // not be able to pin the per-principal cap for an hour.
    expect(db.query.mock.calls[2][1]).toEqual([sessionId, 'client-1', '2025-06-18', 2]);
  });

  it('applies the env-tunable init TTL, clamped to the ready lifetime', async () => {
    process.env.MCP_SESSION_LIFETIME_MINUTES = '30';
    process.env.MCP_SESSION_INIT_TTL_MINUTES = '3';
    db.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const sessionId = await createMcpSession('client-1', '2025-06-18');
    // The 3-minute init TTL is applied to the INSERT, never the 30-minute ready lifetime.
    expect(db.query.mock.calls[2][1]).toEqual([sessionId, 'client-1', '2025-06-18', 3]);
  });

  it('clamps an over-long init TTL down to the ready lifetime', async () => {
    process.env.MCP_SESSION_LIFETIME_MINUTES = '10';
    process.env.MCP_SESSION_INIT_TTL_MINUTES = '999';
    db.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const sessionId = await createMcpSession('client-1', '2025-06-18');
    expect(db.query.mock.calls[2][1]).toEqual([sessionId, 'client-1', '2025-06-18', 10]);
  });

  it('opportunistically reuses only an expired row owned by the authenticated principal', async () => {
    db.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ session_id: '22222222-2222-4222-8222-222222222222', expired: true }])
      .mockResolvedValueOnce([{ session_id: 'replacement' }]);
    const sessionId = await createMcpSession('client-1', '2025-06-18');
    const [sql, params] = db.query.mock.calls[2];
    expect(sql).toContain('principal_id = $5 AND expires_at <= now()');
    // Recycled back into `initializing`, so it takes the short init TTL (2), not the 60-min lifetime.
    expect(params).toEqual([
      sessionId,
      '22222222-2222-4222-8222-222222222222',
      '2025-06-18',
      2,
      'client-1',
    ]);
    expect(db.query).toHaveBeenCalledTimes(3);
  });

  it('lets an unpromoted initializing row self-heal: once its short TTL lapses the slot is recycled', async () => {
    // The row is now `initializing` AND expired (its 2-minute TTL lapsed before the handshake).
    db.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { session_id: '33333333-3333-4333-8333-333333333333', expired: true, phase: 'initializing' },
      ])
      .mockResolvedValueOnce([{ session_id: 'recycled' }]);
    const sessionId = await createMcpSession('client-1', '2025-06-18');
    const [sql, params] = db.query.mock.calls[2];
    expect(sql).toContain('expires_at <= now()');
    expect(params).toEqual([
      sessionId,
      '33333333-3333-4333-8333-333333333333',
      '2025-06-18',
      2,
      'client-1',
    ]);
    expect(db.query).toHaveBeenCalledTimes(3);
  });

  it('hard-caps only LIVE ready sessions per principal under the same advisory lock', async () => {
    process.env.MCP_SESSION_CAP_PER_PRINCIPAL = '2';
    db.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { session_id: 'one', expired: false, phase: 'ready' },
        { session_id: 'two', expired: false, phase: 'ready' },
      ]);
    // Oldest row is a live `ready` session, so the cap is legitimately full -> fail closed.
    await expect(createMcpSession('client-1', '2025-06-18'))
      .rejects.toBeInstanceOf(McpSessionLimitError);
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('at cap during an init crash-loop, evicts the oldest initializing row and returns success (not 429)', async () => {
    process.env.MCP_SESSION_CAP_PER_PRINCIPAL = '2';
    db.query
      .mockResolvedValueOnce([]) // advisory lock
      // ORDER BY expires_at ASC -> the short-TTL initializing row sorts ahead of the ready one.
      .mockResolvedValueOnce([
        { session_id: '44444444-4444-4444-8444-444444444444', expired: false, phase: 'initializing' },
        { session_id: '55555555-5555-4555-8555-555555555555', expired: false, phase: 'ready' },
      ])
      .mockResolvedValueOnce([{ session_id: 'reissued' }]); // eviction recycle succeeds
    const sessionId = await createMcpSession('client-1', '2025-06-18');
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/u);
    const [sql, params] = db.query.mock.calls[2];
    // The eviction UPDATE only ever recycles an initializing/expired slot -> never a live ready row.
    expect(sql).toContain("phase = 'initializing' OR expires_at <= now()");
    expect(params).toEqual([
      sessionId,
      '44444444-4444-4444-8444-444444444444',
      '2025-06-18',
      2,
      'client-1',
    ]);
    expect(db.query).toHaveBeenCalledTimes(3);
  });

  it('still fails closed at cap when every live row is ready (nothing evictable)', async () => {
    process.env.MCP_SESSION_CAP_PER_PRINCIPAL = '2';
    db.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { session_id: '66666666-6666-4666-8666-666666666666', expired: false, phase: 'ready' },
        { session_id: '77777777-7777-4777-8777-777777777777', expired: false, phase: 'ready' },
      ]);
    await expect(createMcpSession('client-1', '2025-06-18'))
      .rejects.toBeInstanceOf(McpSessionLimitError);
    // No eviction UPDATE is issued: only the lock + the SELECT ran.
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

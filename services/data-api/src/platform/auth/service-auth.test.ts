import { describe, it, expect } from 'vitest';
import type { JWTPayload } from 'jose';
import { authorizeAgentCapability, isAgentPrincipal, AGENT_ROLE } from './staff-auth.js';

describe('isAgentPrincipal (PLAN-001 Phase 3)', () => {
  it('an app-only token with the Agent role and no user identity IS an agent', () => {
    expect(isAgentPrincipal({ roles: [AGENT_ROLE] } as JWTPayload)).toBe(true);
  });
  it('a DELEGATED staff user (has scp / preferred_username) is NOT an agent even with the role', () => {
    expect(isAgentPrincipal({ roles: [AGENT_ROLE], scp: 'user_impersonation' } as JWTPayload)).toBe(false);
    expect(isAgentPrincipal({ roles: [AGENT_ROLE], preferred_username: 'a@b.com' } as JWTPayload)).toBe(false);
  });
  it('a plain user without the Agent role is NOT an agent', () => {
    expect(isAgentPrincipal({ roles: ['CollisionSpike.User'] } as JWTPayload)).toBe(false);
    expect(isAgentPrincipal({} as JWTPayload)).toBe(false);
  });
});

describe('authorizeAgentCapability (C1 — agents never reach a write/destructive capability)', () => {
  const read = { kind: 'read' as const, destructive: false, humanOnly: false };
  const write = { kind: 'write' as const, destructive: false, humanOnly: false };
  const destructive = { kind: 'write' as const, destructive: true, humanOnly: true };

  it('a human principal passes through unchanged (authz handled by withRole + gates)', () => {
    expect(authorizeAgentCapability(write, false).allow).toBe(true);
    expect(authorizeAgentCapability(destructive, false).allow).toBe(true);
  });

  it('an agent may invoke a non-destructive read', () => {
    expect(authorizeAgentCapability(read, true).allow).toBe(true);
  });

  it('an agent is REFUSED any write', () => {
    const d = authorizeAgentCapability(write, true);
    expect(d.allow).toBe(false);
    expect(d.reason).toMatch(/writes/i);
  });

  it('an agent is REFUSED a destructive / human-only capability', () => {
    expect(authorizeAgentCapability(destructive, true).allow).toBe(false);
    expect(authorizeAgentCapability({ kind: 'read', destructive: false, humanOnly: true }, true).allow).toBe(false);
  });
});

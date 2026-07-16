import { describe, expect, it, vi } from 'vitest';
import { capabilityByName } from '@cs/domain';

interface Registration {
  methods: string[];
  route: string;
}

const registrations = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, opts: unknown) => registrations.set(name, opts),
  },
}));

await import('./routes.js');

describe('reclassify_inbound capability ↔ HTTP route contract', () => {
  it('uses the registered PATCH inbound/{id}/classification route', () => {
    const capability = capabilityByName('reclassify_inbound');
    const route = registrations.get('reclassifyInbound') as Registration | undefined;
    expect(capability?.route).toBeDefined();
    expect(route).toBeDefined();
    expect(route?.methods).toContain(capability?.route?.method);
    expect(capability?.route?.path.replace('{inboundId}', '{id}')).toBe(route?.route);
  });
});

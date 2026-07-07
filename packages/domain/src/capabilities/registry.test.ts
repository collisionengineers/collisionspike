import { describe, it, expect } from 'vitest';
import {
  CAPABILITIES,
  agentCapabilities,
  capabilityByName,
  readCapabilities,
  writeCapabilities,
} from './registry';

describe('capability registry invariants (ADR-0025)', () => {
  it('has no set_case_status capability (status is a terminal-locked computed projection)', () => {
    expect(capabilityByName('set_case_status')).toBeUndefined();
    expect(CAPABILITIES.some((c) => c.name === 'set_case_status')).toBe(false);
  });

  it('every capability derives a valid object JSON-schema from its zod inputSchema', () => {
    for (const c of CAPABILITIES) {
      expect(c.parameters.type).toBe('object');
      // strict zod objects → additionalProperties:false (no surprise fields to the model)
      expect(c.parameters.additionalProperties).toBe(false);
    }
  });

  it('capability names are unique and snake_case', () => {
    const names = CAPABILITIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('every destructive capability is also humanOnly (agent-rejected, defence in depth)', () => {
    for (const c of CAPABILITIES) {
      if (c.destructive) expect(c.humanOnly).toBe(true);
    }
  });

  it('agent-visible capabilities are read-only, never humanOnly, never destructive', () => {
    for (const c of agentCapabilities()) {
      expect(c.kind).toBe('read');
      expect(c.humanOnly).toBe(false);
      expect(c.destructive).toBe(false);
    }
  });

  it('read capabilities never carry a write route', () => {
    for (const c of readCapabilities()) expect(c.route).toBeUndefined();
  });

  it('write capabilities always carry a route (existing Data API endpoint)', () => {
    for (const c of writeCapabilities()) expect(c.route).toBeDefined();
  });

  it('exposes the nine core read tools plus the archive lookup', () => {
    const readNames = readCapabilities().map((c) => c.name);
    for (const n of [
      'lookup_case',
      'count_cases_by_status',
      'search_inbound',
      'get_case_detail',
      'case_activity',
      'vrm_twins',
      'list_queue_cases',
      'emails_for_case',
      'aging_exceptions',
      'archive_lookup',
    ]) {
      expect(readNames).toContain(n);
    }
  });
});

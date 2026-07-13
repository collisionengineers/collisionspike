/**
 * inbox-suggested-action.test.ts — the "Suggested action" column model
 * (TKT-054 / 020726 E6) + a banned-word sweep over every rendered label.
 */
import { describe, expect, it } from 'vitest';
import { INBOUND_SUBTYPES } from '../data/types';
import type { InboundSubtype } from '../data/types';
import { suggestedAction, suggestedFolder } from './inbox-suggested-action';

const base = { subtype: 'existing_provider_instruction' as InboundSubtype };

describe('suggestedFolder — chosen type wins over the original suggestion', () => {
  it('uses the current (possibly staff-corrected) subtype', () => {
    expect(suggestedFolder({ subtype: 'billing_request', suggestedSubtype: 'new_client_work' })).toBe(
      'Inbox/Billing',
    );
  });

  it('maps the flagship types', () => {
    expect(suggestedFolder({ subtype: 'existing_provider_instruction' })).toBe('Inbox/Instructions');
    expect(suggestedFolder({ subtype: 'query_new_enquiry' })).toBe('Inbox/Queries/Enquiries');
    expect(suggestedFolder({ subtype: 'website_general_enquiry' })).toBe('Inbox/Queries/Enquiries');
    expect(suggestedFolder({ subtype: 'other' })).toBe('Inbox/Other');
  });
});

describe('suggestedAction — lifecycle + gate model', () => {
  it('no move state + gate on -> actionable suggest button', () => {
    expect(suggestedAction(base, true)).toEqual({
      kind: 'suggest',
      folder: 'Inbox/Instructions',
      label: 'File to Inbox/Instructions',
      actionable: true,
    });
  });

  it('no move state + gate off -> same text, not actionable (display-only)', () => {
    expect(suggestedAction(base, false)).toMatchObject({ kind: 'suggest', actionable: false });
  });

  it('queued / moved reflect the recorded folder over the derived one', () => {
    expect(
      suggestedAction({ ...base, outlookMoveState: 'queued', outlookMovedFolder: 'Inbox/Audits' }, true),
    ).toEqual({ kind: 'queued', folder: 'Inbox/Audits', label: 'Filing to Inbox/Audits…' });
    expect(
      suggestedAction({ ...base, outlookMoveState: 'moved', outlookMovedFolder: 'Inbox/Audits' }, true),
    ).toEqual({ kind: 'moved', folder: 'Inbox/Audits', label: 'Filed to Inbox/Audits' });
  });

  it('failed offers a retry only while the gate is on', () => {
    expect(suggestedAction({ ...base, outlookMoveState: 'failed' }, true)).toMatchObject({
      kind: 'failed',
      label: 'Filing failed — retry',
      actionable: true,
    });
    expect(suggestedAction({ ...base, outlookMoveState: 'failed' }, false)).toMatchObject({
      kind: 'failed',
      label: 'Filing failed',
      actionable: false,
    });
  });
});

describe('banned-word sweep — no engineering vocabulary ever renders', () => {
  // The AGENTS.md hard-rule set (mirrors why-classified.test.ts) + the location-assist regex.
  const BANNED_WORDS = [
    'azure', 'postgres', 'dataverse', 'connector', 'function app', 'sdk', 'power automate',
    'key vault', 'document intelligence', 'webhook', 'csp', 'json', 'operator', 'gated',
    'deploy', 'provisioned', 'mock', 'seeded', 'schema', 'payload', '12-field', 'provenance',
    'adr-', 'milestone', 'correlation key', 'signal', 'classifier', 'rule-id', 'queue',
  ];
  const BANNED_RE = /gpt|llm|model|api\b|azure|vision|ocr|geocode/i;

  it('sweeps every subtype × lifecycle × gate combination', () => {
    const labels: string[] = [];
    for (const s of INBOUND_SUBTYPES) {
      for (const state of [undefined, 'queued', 'moved', 'failed'] as const) {
        for (const enabled of [true, false]) {
          labels.push(
            suggestedAction({ subtype: s, ...(state ? { outlookMoveState: state } : {}) }, enabled).label,
          );
        }
      }
    }
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      const lower = label.toLowerCase();
      for (const banned of BANNED_WORDS) expect(lower, label).not.toContain(banned);
      expect(BANNED_RE.test(label), label).toBe(false);
    }
  });
});

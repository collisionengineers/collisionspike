/**
 * api/src/lib/last-activity.test.ts — the queues' "Last update" wording (TKT-117).
 *
 * Pins the ONE descriptor mapping: controlled audit action codes → handler-plain
 * labels (never a raw enum), note rows → "Note added by <author>" with the
 * GUID/oid guard (internal ids never render — CONTEXT.md), chaser rows → "Chased".
 */
import { describe, expect, it } from 'vitest';
import { auditActionLabel, humanActorName, lastActivityLabel } from './last-activity';

describe('auditActionLabel', () => {
  it('maps the seeded controlled codes to plain English', () => {
    expect(auditActionLabel(100000000)).toBe('Email received'); // graph_message_ingested
    expect(auditActionLabel(100000002)).toBe('Files received'); // attachment_classified
    expect(auditActionLabel(100000003)).toBe('Case created'); // case_created
    expect(auditActionLabel(100000013)).toBe('Details updated'); // status_changed
    expect(auditActionLabel(100000015)).toBe('Sent to EVA'); // eva_submitted
    expect(auditActionLabel(100000021)).toBe('Images received'); // box_upload_received
    expect(auditActionLabel(100000023)).toBe('Chased'); // chaser_sent
    expect(auditActionLabel(100000030)).toBe('Case closed'); // case_removed
  });

  it('maps the post-choiceset delta codes by frozen integer', () => {
    expect(auditActionLabel(100000049)).toBe('Files added'); // evidence_added
    expect(auditActionLabel(100000046)).toBe('Case reconstructed'); // retro_case_created
    expect(auditActionLabel(100000052)).toBe('Photos analysed'); // image_analysis_generated
  });

  it('never leaks a raw enum — unknown/missing codes fall back to a plain default', () => {
    expect(auditActionLabel(999999999)).toBe('Updated');
    expect(auditActionLabel(null)).toBe('Updated');
    expect(auditActionLabel(undefined)).toBe('Updated');
  });

  it('has no snake_case/engineering tokens in ANY label it can produce', () => {
    // Sweep every code the map can emit for accidental enum-ish output.
    for (let code = 100000000; code <= 100000060; code++) {
      const label = auditActionLabel(code);
      expect(label).not.toMatch(/[a-z]_[a-z]/i);
      expect(label).not.toMatch(/^\d/);
    }
  });
});

describe('humanActorName — the internal-id guard', () => {
  it('drops Entra oids (GUIDs) and System', () => {
    expect(humanActorName('a1b2c3d4-e5f6-7890-abcd-ef0123456789')).toBeUndefined();
    expect(humanActorName('System')).toBeUndefined();
    expect(humanActorName('system')).toBeUndefined();
    expect(humanActorName('')).toBeUndefined();
    expect(humanActorName(null)).toBeUndefined();
    expect(humanActorName(undefined)).toBeUndefined();
  });

  it('keeps human names and reduces a UPN/email to its local part', () => {
    expect(humanActorName('Alex')).toBe('Alex');
    expect(humanActorName('J. Mercer')).toBe('J. Mercer');
    expect(humanActorName('alex@collisionengineers.co.uk')).toBe('alex');
  });
});

describe('lastActivityLabel — the three row kinds', () => {
  it('audit rows use the controlled-action mapping', () => {
    expect(lastActivityLabel({ kind: 'audit', actionCode: 100000023 })).toBe('Chased');
  });

  it('note rows name the author only when human-safe', () => {
    expect(lastActivityLabel({ kind: 'note', actor: 'Alex' })).toBe('Note added by Alex');
    expect(
      lastActivityLabel({ kind: 'note', actor: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789' }),
    ).toBe('Note added');
    expect(lastActivityLabel({ kind: 'note', actor: null })).toBe('Note added');
  });

  it('chaser rows read "Chased"', () => {
    expect(lastActivityLabel({ kind: 'chaser' })).toBe('Chased');
  });

  it('unknown kinds degrade to the plain default', () => {
    expect(lastActivityLabel({ kind: 'mystery' })).toBe('Updated');
    expect(lastActivityLabel({ kind: null })).toBe('Updated');
  });
});

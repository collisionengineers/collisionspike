/**
 * services/data-api/src/shared/last-activity.test.ts — the queues' "Last update" wording (TKT-117).
 *
 * Pins the ONE descriptor mapping: controlled audit action codes → handler-plain
 * labels (never a raw enum), note rows → "Note added by <author>" with the
 * GUID/oid guard (internal ids never render — CONTEXT.md), chase suggestions →
 * "Chase suggested", and staff/manual chaser rows → "Chased".
 */
import { describe, expect, it } from 'vitest';
import { auditActionLabel, boxUploadLabel, humanActorName, lastActivityLabel, plainDetail } from './last-activity.js';

describe('auditActionLabel', () => {
  it('maps the seeded controlled codes to plain English', () => {
    expect(auditActionLabel(100000000)).toBe('Email received'); // graph_message_ingested
    expect(auditActionLabel(100000002)).toBe('Files received'); // attachment_classified
    expect(auditActionLabel(100000003)).toBe('Case created'); // case_created
    expect(auditActionLabel(100000013)).toBe('Details updated'); // status_changed
    expect(auditActionLabel(100000015)).toBe('Sent to EVA'); // eva_submitted
    // TKT-226 — the honest no-payload default: a Box upload is not proven to be
    // images without a payload/summary saying so (boxUploadLabel owns the upgrade).
    expect(auditActionLabel(100000021)).toBe('File added to archive'); // box_upload_received
    expect(auditActionLabel(100000023)).toBe('Chased'); // chaser_sent
    expect(auditActionLabel(100000030)).toBe('Case closed'); // case_removed
  });

  it('maps the post-code-table delta codes by frozen integer', () => {
    expect(auditActionLabel(100000049)).toBe('Files added'); // evidence_added
    expect(auditActionLabel(100000046)).toBe('Case reconstructed'); // retro_case_created
    expect(auditActionLabel(100000052)).toBe('Photos analysed'); // image_analysis_generated
    expect(auditActionLabel(100000054)).toBe('Chase suggested'); // chaser_suggested
  });

  it('never leaks a raw enum — unknown/missing codes fall back to a plain default', () => {
    expect(auditActionLabel(999999999)).toBe('Updated');
    expect(auditActionLabel(null)).toBe('Updated');
    expect(auditActionLabel(undefined)).toBe('Updated');
  });

  it('has no snake_case/engineering tokens in ANY label it can produce', () => {
    // Sweep every code the map can emit for accidental enum-ish output.
    for (let code = 100000000; code <= 100000062; code++) {
      const label = auditActionLabel(code);
      expect(label).not.toMatch(/[a-z]_[a-z]/i);
      expect(label).not.toMatch(/^\d/);
    }
  });
});

describe('humanActorName — the internal-id guard', () => {
  it('drops Entra oids (GUIDs) and System', () => {
    expect(humanActorName('a1b2c3d4-e5f6-7890-abcd-ef0123456789')).toBeUndefined();
    expect(humanActorName('capture-session:a1b2c3d4-e5f6-7890-abcd-ef0123456789')).toBeUndefined();
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

  it('keeps legitimate names containing hex letters and dashes (TKT-200 regression)', () => {
    // The GUID-anywhere broadening must only drop real 8-4-4-4-12 identifiers,
    // never a hyphenated human name built from hex-alphabet letters.
    expect(humanActorName('Anne-Marie Deacon')).toBe('Anne-Marie Deacon');
    expect(humanActorName('Abba-Fabb De-Cade')).toBe('Abba-Fabb De-Cade');
    expect(humanActorName('Ada Bede-Cafe')).toBe('Ada Bede-Cafe');
  });
});

describe('plainDetail — the TKT-134 detail-line safety filter', () => {
  it('passes plain summaries through untouched', () => {
    expect(plainDetail('Case created (CCPY26050)')).toBe('Case created (CCPY26050)');
    expect(plainDetail('Chaser marked responded — the requested item arrived')).toBe(
      'Chaser marked responded — the requested item arrived',
    );
    expect(plainDetail('  Inbound email linked to case (suggestion accepted)  ')).toBe(
      'Inbound email linked to case (suggestion accepted)',
    );
  });

  it('withholds engineering-shaped summaries entirely (they go behind technical details)', () => {
    // The live sightings that motivated the ticket:
    expect(plainDetail('box_upload_received: 3 files landed')).toBeUndefined();
    expect(
      plainDetail('Status duplicate_risk -> missing_required_fields (internal recompute)'),
    ).toBeUndefined();
    expect(plainDetail('Case propose_attach: PK20FWT')).toBeUndefined();
    // The general shapes:
    expect(plainDetail('anything with a snake_case token')).toBeUndefined();
    expect(plainDetail('linked a1b2c3d4-e5f6-7890-abcd-ef0123456789')).toBeUndefined(); // GUID
    expect(plainDetail('reclassified (category=case_update subtype=update_general)')).toBeUndefined();
    expect(plainDetail('new → old')).toBeUndefined(); // unicode arrow
  });

  it('empty/blank input yields undefined (no empty detail line)', () => {
    expect(plainDetail('')).toBeUndefined();
    expect(plainDetail('   ')).toBeUndefined();
    expect(plainDetail(null)).toBeUndefined();
    expect(plainDetail(undefined)).toBeUndefined();
  });
});

describe('boxUploadLabel — TKT-226 honest Box-upload wording (decision table)', () => {
  it('payload image class → Images received', () => {
    expect(boxUploadLabel({ evidenceClass: 'image', origin: 'external_upload' })).toBe(
      'Images received',
    );
  });

  it('payload non-image classes → File added to archive (.eml / .pdf-instruction / video / report)', () => {
    expect(boxUploadLabel({ evidenceClass: 'email', origin: 'external_upload' })).toBe(
      'File added to archive',
    );
    expect(boxUploadLabel({ evidenceClass: 'instruction', origin: 'external_upload' })).toBe(
      'File added to archive',
    );
    expect(boxUploadLabel({ evidenceClass: 'other', origin: 'external_upload' })).toBe(
      'File added to archive',
    );
    expect(boxUploadLabel({ evidenceClass: 'engineer_report', origin: 'external_upload' })).toBe(
      'File added to archive',
    );
  });

  it('origin archive_mirror beats every class — the system echo reads Archived', () => {
    expect(boxUploadLabel({ evidenceClass: 'image', origin: 'archive_mirror' })).toBe('Archived');
    expect(boxUploadLabel({ evidenceClass: 'email', origin: 'archive_mirror' })).toBe('Archived');
    expect(
      boxUploadLabel({ origin: 'archive_mirror', summary: 'box_upload_received: IMG_0001.jpg' }),
    ).toBe('Archived');
  });

  it('legacy rows (no payload) self-heal from the summary filename via the shared extension table', () => {
    // The FW26029 shape: the archive-mirrored .eml must NEVER read as images.
    expect(boxUploadLabel({ summary: 'box_upload_received: message-ab12cd34.eml' })).toBe(
      'File added to archive',
    );
    expect(boxUploadLabel({ summary: 'box_upload_received: IMG_0001.jpg' })).toBe(
      'Images received',
    );
    expect(boxUploadLabel({ summary: 'box_upload_received: report.pdf' })).toBe(
      'File added to archive',
    );
    expect(boxUploadLabel({ summary: 'box_upload_received: clip.mp4' })).toBe(
      'File added to archive',
    );
  });

  it('unparsable/unknown falls back to File added to archive — never a false Images received', () => {
    expect(boxUploadLabel({})).toBe('File added to archive');
    expect(boxUploadLabel({ summary: '3 files landed' })).toBe('File added to archive');
    expect(boxUploadLabel({ summary: 'box_upload_received: 3 files landed' })).toBe(
      'File added to archive', // extensionless "filename" classifies as other
    );
    expect(boxUploadLabel({ evidenceClass: null, origin: null, summary: null })).toBe(
      'File added to archive',
    );
  });
});

describe('lastActivityLabel — the three row kinds', () => {
  it('audit rows use the controlled-action mapping', () => {
    expect(lastActivityLabel({ kind: 'audit', actionCode: 100000023 })).toBe('Chased');
    expect(lastActivityLabel({ kind: 'audit', actionCode: 100000054 })).toBe(
      'Chase suggested',
    );
  });

  it('box_upload_received audit rows route through boxUploadLabel (TKT-226)', () => {
    // Object-payload rows: class and origin decide.
    expect(
      lastActivityLabel({ kind: 'audit', actionCode: 100000021, evidenceClass: 'image' }),
    ).toBe('Images received');
    expect(
      lastActivityLabel({ kind: 'audit', actionCode: 100000021, evidenceClass: 'email' }),
    ).toBe('File added to archive');
    expect(
      lastActivityLabel({
        kind: 'audit',
        actionCode: 100000021,
        evidenceClass: 'image',
        origin: 'archive_mirror',
      }),
    ).toBe('Archived');
    // Legacy rows: the summary filename heals the label read-time.
    expect(
      lastActivityLabel({
        kind: 'audit',
        actionCode: 100000021,
        summary: 'box_upload_received: message-ab12cd34.eml',
      }),
    ).toBe('File added to archive');
    // Bare row (no payload, no summary): the honest default, never a false image claim.
    expect(lastActivityLabel({ kind: 'audit', actionCode: 100000021 })).toBe(
      'File added to archive',
    );
  });

  it('legacy chaser_sent audit metadata still renders as a suggestion', () => {
    expect(
      lastActivityLabel({ kind: 'audit', actionCode: 100000023, suggested: true }),
    ).toBe('Chase suggested');
  });

  it('note rows name the author only when human-safe', () => {
    expect(lastActivityLabel({ kind: 'note', actor: 'Alex' })).toBe('Note added by Alex');
    expect(
      lastActivityLabel({ kind: 'note', actor: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789' }),
    ).toBe('Note added');
    expect(lastActivityLabel({ kind: 'note', actor: null })).toBe('Note added');
  });

  it('chaser rows read "Chased"', () => {
    expect(lastActivityLabel({ kind: 'chaser', suggested: false })).toBe('Chased');
    expect(lastActivityLabel({ kind: 'chaser', suggested: true })).toBe('Chase suggested');
  });

  it('unknown kinds degrade to the plain default', () => {
    expect(lastActivityLabel({ kind: 'mystery' })).toBe('Updated');
    expect(lastActivityLabel({ kind: null })).toBe('Updated');
  });
});

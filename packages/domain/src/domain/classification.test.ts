import { describe, it, expect } from 'vitest';
import {
  classifyAttachment,
  describeEvidence,
  extensionOf,
  type EvidenceClass,
} from './classification';

/* ----------  classifyAttachment — every branch (ext + MIME table)  ---------- */

describe('classifyAttachment — extension table (every branch)', () => {
  const cases: ReadonlyArray<[string, EvidenceClass]> = [
    // image
    ['IMG_0421.jpg', 'image'],
    ['overview.jpeg', 'image'],
    ['damage.PNG', 'image'], // case-insensitive extension
    // instruction
    ['Instruction.pdf', 'instruction'],
    ['letter.docx', 'instruction'],
    ['legacy.doc', 'instruction'],
    // email
    ['message.eml', 'email'],
    // other (unknown extensions)
    ['notes.txt', 'other'],
    ['archive.zip', 'other'],
    ['movie.mp4', 'other'],
    ['noextension', 'other'],
    ['.', 'other'],
    ['', 'other'],
  ];

  it.each(cases)('classifies %s -> %s by extension', (filename, expected) => {
    expect(classifyAttachment(filename)).toBe(expected);
  });
});

describe('classifyAttachment — MIME fallback when extension unknown', () => {
  const cases: ReadonlyArray<[string, string, EvidenceClass]> = [
    ['scan', 'image/jpeg', 'image'],
    ['scan', 'image/png', 'image'],
    ['blob', 'application/pdf', 'instruction'],
    ['blob', 'application/msword', 'instruction'],
    [
      'blob',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'instruction',
    ],
    ['rawmessage', 'message/rfc822', 'email'],
    ['blob', 'application/octet-stream', 'other'],
    ['blob', '', 'other'],
  ];

  it.each(cases)(
    'classifies (%s, %s) -> %s by MIME',
    (filename, contentType, expected) => {
      expect(classifyAttachment(filename, contentType)).toBe(expected);
    },
  );

  it('normalises a content-type with parameters', () => {
    expect(classifyAttachment('msg', 'message/rfc822; charset=utf-8')).toBe('email');
  });
});

describe('classifyAttachment — extension wins over MIME on disagreement', () => {
  it('trusts the .jpg extension even if MIME says pdf', () => {
    expect(classifyAttachment('photo.jpg', 'application/pdf')).toBe('image');
  });
  it('trusts the .pdf extension even if MIME says image', () => {
    expect(classifyAttachment('doc.pdf', 'image/png')).toBe('instruction');
  });
});

/* ----------  extensionOf  ---------- */

describe('extensionOf', () => {
  it('lower-cases and strips the dot', () => {
    expect(extensionOf('Foo.PDF')).toBe('pdf');
  });
  it('takes the LAST extension', () => {
    expect(extensionOf('archive.tar.gz')).toBe('gz');
  });
  it('returns empty for a dotfile with no extension', () => {
    expect(extensionOf('.gitignore')).toBe('');
  });
  it('returns empty when there is no dot', () => {
    expect(extensionOf('README')).toBe('');
  });
});

/* ----------  describeEvidence — per-message Evidence shape helper  ---------- */

describe('describeEvidence', () => {
  it('builds an image descriptor with convenience flags', () => {
    const d = describeEvidence('IMG_1.jpg', 'image/jpeg; charset=binary');
    expect(d).toMatchObject({
      filename: 'IMG_1.jpg',
      contentType: 'image/jpeg',
      extension: 'jpg',
      evidenceClass: 'image',
      isImage: true,
      isInstruction: false,
    });
  });

  it('builds an instruction descriptor', () => {
    const d = describeEvidence('Instruction.pdf', 'application/pdf');
    expect(d.evidenceClass).toBe('instruction');
    expect(d.isInstruction).toBe(true);
    expect(d.isImage).toBe(false);
  });

  it('flags the .eml message body as email regardless of filename', () => {
    const d = describeEvidence('whatever.bin', 'application/octet-stream', true);
    expect(d.evidenceClass).toBe('email');
  });

  it('classifies an unknown attachment as other', () => {
    const d = describeEvidence('weird.xyz');
    expect(d.evidenceClass).toBe('other');
    expect(d.isImage).toBe(false);
    expect(d.isInstruction).toBe(false);
  });
});

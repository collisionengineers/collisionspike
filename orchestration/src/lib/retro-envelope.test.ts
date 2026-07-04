import { describe, expect, it } from 'vitest';
import { hashPayload } from '../functions/activities/fetchMessage';
import { kqlPhrase } from './graph';
import {
  buildMinimalAnchorEnvelope,
  buildRetroEnvelopeFromDoc,
  buildRetroEnvelopeFromEml,
  firstAddress,
  pickCaseFolder,
  selectOutlookOriginal,
  type OutlookSearchCandidate,
  type RetroSearchHit,
} from './retro-envelope';
import type { ExplodedEml } from './functions-client';

const exploded: ExplodedEml = {
  subject: 'New Instruction - KA08 XTR',
  from: 'Claims Team <claims@pch-ltd.com>',
  to: 'info@collisionengineers.co.uk',
  date_iso: '2026-03-02T09:15:00+00:00',
  message_id: '<orig-123@pch-ltd.com>',
  in_reply_to: '',
  references: '',
  body_text: 'Please inspect KA08 XTR. Our Ref 575689.',
  attachments: [],
  skipped: [],
  contract_version: 'explode_eml_v1',
};

const landed = [
  { filename: 'instruction letter.pdf', contentType: 'application/pdf', blobPath: 'retro-box-f1/instruction letter.pdf', size: 1234 },
];
const rawEml = { filename: 'original.eml', contentType: 'message/rfc822', blobPath: 'retro-box-f1/original.eml', size: 9999 };
const meta = { boxFileId: 'f1', discoveredPo: 'A.PCH261269', fallbackReceivedAt: '2026-07-04T10:00:00Z' };

describe('buildRetroEnvelopeFromEml', () => {
  it('mirrors a live envelope: real Message-ID, shared hash, VRM sniff, discovered PO as candidateRef', () => {
    const env = buildRetroEnvelopeFromEml(exploded, landed, rawEml, meta);
    expect(env.messageId).toBe('retro-box-f1');
    expect(env.internetMessageId).toBe('<orig-123@pch-ltd.com>');
    expect(env.senderAddress).toBe('claims@pch-ltd.com');
    expect(env.sourceMailbox).toBe('info@collisionengineers.co.uk');
    expect(env.receivedAt).toBe('2026-03-02T09:15:00+00:00');
    expect(env.candidateVrm).toBe('KA08XTR');
    expect(env.candidateRef).toBe('A.PCH261269');
    expect(env.attachments).toEqual(landed);
    expect(env.rawEml).toEqual(rawEml);
    // Hash parity with a LIVE arrival of the same email (same shared function+inputs).
    expect(env.payloadHash).toBe(hashPayload(exploded.subject, 'claims@pch-ltd.com', landed));
  });

  it('falls back to a deterministic synthetic id and the fallback timestamp', () => {
    const env = buildRetroEnvelopeFromEml(
      { ...exploded, message_id: '', date_iso: '', to: '' },
      landed,
      undefined,
      meta,
    );
    expect(env.internetMessageId).toBe('retro:box:f1');
    expect(env.receivedAt).toBe('2026-07-04T10:00:00Z');
    expect(env.sourceMailbox).toBe('box-archive');
    expect(env.rawEml).toBeUndefined();
  });
});

describe('buildRetroEnvelopeFromDoc / buildMinimalAnchorEnvelope', () => {
  it('doc-only reconstruction carries the doc as the sole attachment', () => {
    const env = buildRetroEnvelopeFromDoc(landed[0], { ...meta, folderName: 'A.PCH261269' });
    expect(env.internetMessageId).toBe('retro:box:f1');
    expect(env.attachments).toEqual([landed[0]]);
    expect(env.candidateRef).toBe('A.PCH261269');
    expect(env.body).toBe('');
  });

  it('minimal anchor is keyed on the FOLDER so duplicate triggers converge', () => {
    const env = buildMinimalAnchorEnvelope({ receivedAt: '2026-07-01T00:00:00Z' }, 'CCPY26050', '888');
    expect(env.internetMessageId).toBe('retro:box:folder:888');
    expect(env.messageId).toBe('retro-box-folder-888');
    expect(env.receivedAt).toBe('2026-07-01T00:00:00Z');
    expect(env.attachments).toEqual([]);
  });
});

describe('firstAddress', () => {
  it('pulls the first address out of a display-name header, lowercased', () => {
    expect(firstAddress('Claims Team <Claims@PCH-ltd.com>')).toBe('claims@pch-ltd.com');
    expect(firstAddress('no address here')).toBe('');
    expect(firstAddress(undefined)).toBe('');
  });
});

describe('pickCaseFolder', () => {
  const hit = (id: string, folder: { id: string; name: string } | null): RetroSearchHit => ({
    id,
    name: `${id}.eml`,
    type: 'file',
    caseFolder: folder,
  });
  const F1 = { id: 'c1', name: 'CCPY26050' };
  const F2 = { id: 'c2', name: 'CCPY26051' };

  it('unanimous hits pick the folder', () => {
    const pick = pickCaseFolder([hit('a', F1)], [hit('b', F1)]);
    expect(pick.folder).toEqual(F1);
    expect(pick.basis).toBe('ref_tier'); // ref hits named exactly one folder
  });

  it('a decisive ref tier beats noisy VRM hits (one vehicle, several claims)', () => {
    const pick = pickCaseFolder([hit('a', F1)], [hit('b', F2), hit('c', F1)]);
    expect(pick.folder).toEqual(F1);
    expect(pick.basis).toBe('ref_tier');
    expect(pick.candidateCount).toBe(2);
  });

  it('VRM-only hits pick only when unanimous', () => {
    expect(pickCaseFolder([], [hit('a', F1), hit('b', F1)]).folder).toEqual(F1);
    expect(pickCaseFolder([], [hit('a', F1), hit('b', F2)]).folder).toBeNull();
  });

  it('two ref folders → never guess', () => {
    const pick = pickCaseFolder([hit('a', F1), hit('b', F2)], []);
    expect(pick.folder).toBeNull();
    expect(pick.candidateCount).toBe(2);
  });

  it('hits without a resolvable case folder are ignored', () => {
    expect(pickCaseFolder([hit('a', null)], []).folder).toBeNull();
    expect(pickCaseFolder([hit('a', null)], [hit('b', F1)]).folder).toEqual(F1);
  });
});

describe('kqlPhrase (Graph messages $search clause)', () => {
  it('wraps in the REQUIRED double quotes and strips clause-reserved characters', () => {
    expect(kqlPhrase('575689')).toBe('"575689"');
    expect(kqlPhrase(' Our "Ref" \\ 575689 ')).toBe('"Our Ref 575689"');
    expect(kqlPhrase('')).toBe('""');
  });
});

describe('selectOutlookOriginal', () => {
  const INTAKE = ['info@collisionengineers.co.uk', 'desk@collisionengineers.co.uk'];
  const cand = (over: Partial<OutlookSearchCandidate>): OutlookSearchCandidate => ({
    id: over.id ?? 'm1',
    subject: over.subject ?? 'New Instruction KA08XTR',
    receivedDateTime: over.receivedDateTime ?? '2026-03-01T09:00:00Z',
    from: over.from ?? 'claims@pch-ltd.com',
    hasAttachments: over.hasAttachments ?? true,
    mailbox: over.mailbox ?? 'info@collisionengineers.co.uk',
  });

  it('drops our own senders ($search spans Sent Items) and sender-less hits', () => {
    expect(
      selectOutlookOriginal(
        [cand({ from: 'info@collisionengineers.co.uk' }), cand({ from: '' })],
        { intakeMailboxes: INTAKE },
      ),
    ).toBeNull();
  });

  it('prefers attachments, then non-RE: subjects, then the EARLIEST message', () => {
    const bare = cand({ id: 'bare', hasAttachments: false, receivedDateTime: '2026-01-01T00:00:00Z' });
    const reply = cand({ id: 'reply', subject: 'RE: New Instruction', receivedDateTime: '2026-01-02T00:00:00Z' });
    const later = cand({ id: 'later', receivedDateTime: '2026-03-05T00:00:00Z' });
    const original = cand({ id: 'orig', receivedDateTime: '2026-03-01T00:00:00Z' });
    expect(selectOutlookOriginal([bare, reply, later, original], { intakeMailboxes: INTAKE })?.id).toBe(
      'orig',
    );
  });

  it('falls back to a reply-prefixed hit when nothing else survives', () => {
    const reply = cand({ id: 'reply', subject: 'FW: instruction', hasAttachments: true });
    expect(selectOutlookOriginal([reply], { intakeMailboxes: INTAKE })?.id).toBe('reply');
  });
});

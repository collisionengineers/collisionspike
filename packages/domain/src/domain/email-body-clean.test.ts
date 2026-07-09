import { describe, it, expect } from 'vitest';
import { cleanEmailBodyForPreview } from './email-body-clean';

/* The QDOS signature-garbage shape from the 2026-07-08 operator re-report
   (docs/tickets/now/TKT-070-email-body-readability/evidence/operator-note-2026-07-08.md):
   logo/phone/email/web image URLs in brackets, an association link, then the legal
   block — all of which used to fill the whole preview. */
const QDOS_BODY = [
  'Good morning,',
  '',
  'Please find the further photographs you requested for the above claim.',
  '',
  'Kind regards',
  'Claims Team',
  '',
  '[https://www.qdosassist.co.uk/ASSIST-EMAIL-SIGNATURES/QAA%20Logo%2050.png]',
  '[https://www.qdosassist.co.uk/ASSIST-EMAIL-SIGNATURES/Phone%2050.png] 0800 093 0982<tel:08000930982>',
  'Proud members of: [The Managing General Agents Association Website]<https://www.mgaa.co.uk/>',
  'You are dealing with QDOS Accident Assistance Limited which reserves copyright on the contents of this and any attachment.',
].join('\n');

describe('cleanEmailBodyForPreview — the QDOS garbage sample (TKT-070)', () => {
  const cleaned = cleanEmailBodyForPreview(QDOS_BODY);

  it('the typed body survives', () => {
    expect(cleaned).toContain('Please find the further photographs you requested');
  });
  it('line structure survives (multi-line, not a run-on wall)', () => {
    expect(cleaned.split('\n').length).toBeGreaterThan(2);
  });
  it('the bracketed image URLs are gone', () => {
    expect(cleaned).not.toContain('ASSIST-EMAIL-SIGNATURES');
    expect(cleaned).not.toContain('[https://');
  });
  it('the tel:/angle-link duplicates are gone', () => {
    expect(cleaned).not.toContain('<tel:');
    expect(cleaned).not.toContain('mgaa.co.uk/>');
  });
  it('the legal/membership boilerplate is gone', () => {
    expect(cleaned).not.toContain('Proud members');
    expect(cleaned).not.toContain('reserves copyright');
  });
  it('the sign-off and signer name are kept, signature furniture is not', () => {
    expect(cleaned).toContain('Kind regards');
    expect(cleaned).toContain('Claims Team');
    expect(cleaned).not.toContain('0800 093 0982');
  });
});

describe('cleanEmailBodyForPreview — quoted reply chains', () => {
  it('cuts an Outlook From:/Sent: header block (the most common corpus convention)', () => {
    const body = [
      'Please provide your report.',
      '',
      'From: Claims <claims@example.co.uk>',
      'Sent: Wednesday, June 24, 2026 3:44 PM',
      'To: Engineers',
      'Subject: 30143',
      '',
      'We instruct you to inspect the vehicle and prepare a report.',
    ].join('\n');
    const cleaned = cleanEmailBodyForPreview(body);
    expect(cleaned).toContain('Please provide your report.');
    expect(cleaned).not.toContain('We instruct you to inspect');
    expect(cleaned).not.toContain('Sent: Wednesday');
  });

  it('cuts a Gmail "On … wrote:" attribution and the quoted text after it', () => {
    const body = 'Thanks, received.\n\nOn Mon, 6 Jul 2026 at 10:12, Casework wrote:\n> original text here';
    const cleaned = cleanEmailBodyForPreview(body);
    expect(cleaned).toBe('Thanks, received.');
  });

  it('cuts an -----Original Message----- divider', () => {
    const body = 'New instruction attached.\n\n-----Original Message-----\nFrom: someone\nolder text';
    expect(cleanEmailBodyForPreview(body)).toBe('New instruction attached.');
  });

  it('drops ">"-quoted lines', () => {
    const body = 'Agreed.\n> earlier line one\n> earlier line two';
    expect(cleanEmailBodyForPreview(body)).toBe('Agreed.');
  });
});

describe('cleanEmailBodyForPreview — structure + URLs', () => {
  it('preserves paragraphs and collapses 3+ blank lines to one', () => {
    const body = 'Paragraph one.\n\n\n\n\nParagraph two.';
    expect(cleanEmailBodyForPreview(body)).toBe('Paragraph one.\n\nParagraph two.');
  });

  it('shortens a bare URL to its host (domain stays visible)', () => {
    const body = 'Track the claim at https://portal.example.co.uk/claims/12345?token=abc anytime.';
    expect(cleanEmailBodyForPreview(body)).toBe('Track the claim at portal.example.co.uk anytime.');
  });

  it('cuts the legal footer even with no sign-off line', () => {
    const body = [
      'The vehicle is a total loss.',
      'Registered office: Suite 1, Example Street, Glasgow',
      'Authorised and regulated by the Law Society of Scotland',
    ].join('\n');
    expect(cleanEmailBodyForPreview(body)).toBe('The vehicle is a total loss.');
  });

  it('nullish/empty input returns an empty string', () => {
    expect(cleanEmailBodyForPreview('')).toBe('');
    expect(cleanEmailBodyForPreview(null)).toBe('');
    expect(cleanEmailBodyForPreview(undefined)).toBe('');
  });
});

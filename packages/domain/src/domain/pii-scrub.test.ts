import { describe, it, expect } from 'vitest';
import {
  scrubPii,
  scrubPiiText,
  containsPii,
  DEFAULT_PLACEHOLDERS,
  type PiiKind,
} from './pii-scrub';

/* ----------  email  ---------- */

describe('scrubPii — email', () => {
  it.each([
    'john.smith@example.co.uk',
    'a_b+tag@sub.domain.com',
    'claims-team@acme.io',
  ])('redacts %s', (email) => {
    const r = scrubPii(`Contact ${email} for details.`);
    expect(r.text).toBe('Contact [EMAIL] for details.');
    expect(r.redactions).toContainEqual({ kind: 'email', count: 1 });
  });

  it('redacts multiple emails and counts them', () => {
    const r = scrubPii('From a@b.com to c@d.org');
    expect(r.text).toBe('From [EMAIL] to [EMAIL]');
    expect(r.redactions).toContainEqual({ kind: 'email', count: 2 });
  });

  it("does not read an email's digits as a phone number", () => {
    const r = scrubPii('user07911123456@example.com');
    expect(r.redactions.find((x) => x.kind === 'phone')).toBeUndefined();
    expect(r.text).toBe('[EMAIL]');
  });
});

/* ----------  UK phone  ---------- */

describe('scrubPii — UK phone', () => {
  it.each([
    ['07911 123456', '[PHONE]'],
    ['07911123456', '[PHONE]'],
    ['+44 7911 123456', '[PHONE]'],
    ['+447911123456', '[PHONE]'],
    ['020 7946 0000', '[PHONE]'],
    ['0161 496 0000', '[PHONE]'],
    ['+44 20 7946 0000', '[PHONE]'],
  ])('redacts %s', (phone, expected) => {
    const r = scrubPii(`Call ${phone} please`);
    expect(r.text).toBe(`Call ${expected} please`);
    expect(r.redactions).toContainEqual({ kind: 'phone', count: 1 });
  });

  it('does not grab a Case/PO reference', () => {
    const r = scrubPii('Case CCPY26050 is open');
    expect(r.text).toBe('Case CCPY26050 is open');
    expect(r.totalRedactions).toBe(0);
  });

  it('does not grab a short reference number', () => {
    const r = scrubPii('Ref 12345 attached');
    expect(r.redactions.find((x) => x.kind === 'phone')).toBeUndefined();
  });
});

/* ----------  UK postcode  ---------- */

describe('scrubPii — UK postcode', () => {
  it.each(['M1 4WB', 'SW1A 1AA', 'GIR 0AA', 'EC1A1BB', 'b33 8th'.toUpperCase()])(
    'redacts %s',
    (pc) => {
      const r = scrubPii(`Inspection at ${pc} tomorrow`);
      expect(r.text).toBe('Inspection at [POSTCODE] tomorrow');
      expect(r.redactions).toContainEqual({ kind: 'postcode', count: 1 });
    },
  );

  it('is case-insensitive but keeps surrounding text', () => {
    const r = scrubPii('postcode sw1a 1aa here');
    expect(r.text).toBe('postcode [POSTCODE] here');
  });
});

/* ----------  UK street address  ---------- */

describe('scrubPii — UK street address', () => {
  it.each([
    '12 Acacia Avenue',
    '1 High Street',
    '221B Baker Street',
    '45 Coronation Road',
    'Flat 2 Victoria Court',
  ])('redacts %s', (addr) => {
    const r = scrubPii(`The vehicle is at ${addr}.`);
    expect(r.text).toContain('[ADDRESS]');
    expect(r.redactions.find((x) => x.kind === 'address')).toBeDefined();
  });

  it('does not redact ordinary prose without a street suffix', () => {
    const r = scrubPii('We received 3 photos and 1 instruction today.');
    expect(r.redactions.find((x) => x.kind === 'address')).toBeUndefined();
  });
});

/* ----------  UK National Insurance number  ---------- */

describe('scrubPii — NINO', () => {
  it.each(['AB123456C', 'AB 12 34 56 C', 'JG 12 34 56 A'])(
    'redacts %s',
    (nino) => {
      const r = scrubPii(`NI ${nino} on file`);
      expect(r.text).toBe('NI [NINO] on file');
      expect(r.redactions).toContainEqual({ kind: 'nino', count: 1 });
    },
  );
});

/* ----------  title-anchored names  ---------- */

describe('scrubPii — names (title-anchored, default on)', () => {
  it.each([
    'Mr John Smith',
    'Mrs Jane Doe',
    'Dr A Patel',
    "Ms Mary-Anne O'Brien",
    'Prof Alan Turing',
  ])('redacts %s', (name) => {
    const r = scrubPii(`Insured: ${name}.`);
    expect(r.text).toBe('Insured: [NAME].');
    expect(r.redactions).toContainEqual({ kind: 'name', count: 1 });
  });

  it('can be disabled via redactNames:false', () => {
    const r = scrubPii('Insured: Mr John Smith.', { redactNames: false });
    expect(r.text).toBe('Insured: Mr John Smith.');
    expect(r.redactions.find((x) => x.kind === 'name')).toBeUndefined();
  });

  it('does not over-redact a bare capitalised word', () => {
    const r = scrubPii('The London office handled it.');
    expect(r.redactions.find((x) => x.kind === 'name')).toBeUndefined();
  });
});

/* ----------  VRM — opt-in, off by default (domain key, not claimant PII)  ---------- */

describe('scrubPii — VRM', () => {
  it('does NOT redact a registration by default (vehicle-identity)', () => {
    const r = scrubPii('Vehicle AB12 CDE inspected');
    expect(r.text).toBe('Vehicle AB12 CDE inspected');
    expect(r.redactions.find((x) => x.kind === 'vrm')).toBeUndefined();
  });

  it('redacts a registration when redactVrm:true', () => {
    const r = scrubPii('Vehicle AB12 CDE inspected', { redactVrm: true });
    expect(r.text).toBe('Vehicle [VRM] inspected');
    expect(r.redactions).toContainEqual({ kind: 'vrm', count: 1 });
  });

  it.each(['AB12CDE', 'AB12 CDE', 'ab12 cde'])(
    'redacts %s when opted in',
    (vrm) => {
      const r = scrubPii(`Reg ${vrm}`, { redactVrm: true });
      expect(r.text).toBe('Reg [VRM]');
    },
  );
});

/* ----------  combined / realistic email body  ---------- */

describe('scrubPii — realistic email body', () => {
  const body = [
    'Dear Sir,',
    '',
    'Please find attached the instruction for Mr John Smith.',
    'The vehicle AB12 CDE is at 12 Acacia Avenue, M1 4WB.',
    'You can reach me on 07911 123456 or claims@acme.co.uk.',
    'NI number AB123456C.',
    '',
    'Regards',
  ].join('\n');

  it('removes every obvious identifier but keeps structure + the VRM', () => {
    const r = scrubPii(body);
    expect(r.text).toContain('[NAME]'); // Mr John Smith
    expect(r.text).toContain('[ADDRESS]'); // 12 Acacia Avenue
    expect(r.text).toContain('[POSTCODE]'); // M1 4WB
    expect(r.text).toContain('[PHONE]'); // 07911 123456
    expect(r.text).toContain('[EMAIL]'); // claims@acme.co.uk
    expect(r.text).toContain('[NINO]'); // AB123456C
    // VRM preserved (domain key) unless opted in.
    expect(r.text).toContain('AB12 CDE');
    // No raw PII leaked.
    expect(r.text).not.toContain('John Smith');
    expect(r.text).not.toContain('07911');
    expect(r.text).not.toContain('acme.co.uk');
    expect(r.text).not.toContain('AB123456C');
    expect(r.totalRedactions).toBeGreaterThanOrEqual(6);
  });

  it('summary carries counts only, never the matched values', () => {
    const r = scrubPii(body);
    const serialised = JSON.stringify(r.redactions);
    expect(serialised).not.toContain('John');
    expect(serialised).not.toContain('07911');
    for (const entry of r.redactions) {
      expect(typeof entry.count).toBe('number');
      expect(Object.keys(entry).sort()).toEqual(['count', 'kind']);
    }
  });
});

/* ----------  options + edge cases  ---------- */

describe('scrubPii — options and edges', () => {
  it('honours custom placeholders', () => {
    const r = scrubPii('mail a@b.com', {
      placeholders: { email: '‹redacted-email›' },
    });
    expect(r.text).toBe('mail ‹redacted-email›');
  });

  it('returns empty result for empty / non-string input', () => {
    expect(scrubPii('')).toEqual({ text: '', redactions: [], totalRedactions: 0 });
    // @ts-expect-error — exercising defensive non-string guard
    expect(scrubPii(null).text).toBe('');
    // @ts-expect-error — exercising defensive non-string guard
    expect(scrubPii(undefined).text).toBe('');
  });

  it('leaves clean text untouched', () => {
    const clean = 'Two photos received; awaiting the instruction document.';
    const r = scrubPii(clean);
    expect(r.text).toBe(clean);
    expect(r.totalRedactions).toBe(0);
    expect(r.redactions).toEqual([]);
  });

  it('is deterministic across repeated calls (no RegExp lastIndex leak)', () => {
    const input = 'a@b.com and c@d.com';
    const first = scrubPii(input);
    const second = scrubPii(input);
    expect(first).toEqual(second);
    expect(first.redactions).toContainEqual({ kind: 'email', count: 2 });
  });

  it('scrubPiiText returns just the text', () => {
    expect(scrubPiiText('ring 07911 123456')).toBe('ring [PHONE]');
  });

  it('containsPii flags presence without exposing values', () => {
    expect(containsPii('hello a@b.com')).toBe(true);
    expect(containsPii('hello world')).toBe(false);
  });

  it('every kind has a default placeholder', () => {
    const kinds: PiiKind[] = [
      'email',
      'phone',
      'postcode',
      'address',
      'nino',
      'name',
      'vrm',
    ];
    for (const k of kinds) {
      expect(DEFAULT_PLACEHOLDERS[k]).toMatch(/^\[.+\]$/);
    }
  });
});

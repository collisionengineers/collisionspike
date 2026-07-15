import { describe, it, expect } from 'vitest';
import {
  parseDdmmyyyy,
  formatDdmmyyyy,
  isValidDdmmyyyy,
  formatReceivedCompact,
  ageDaysFromIso,
  caseAgeLabel,
} from './date-format';

/* ============================================================
   date-format — the DD/MM/YYYY <-> Date bridge under the calendar pickers
   (work-todo-spike: ui-changes/calendar-box-on-date-fields). Storage stays
   DD/MM/YYYY strings; the picker works in Date, so these conversions must be
   lossless and must reject impossible dates rather than silently roll them over.
   ============================================================ */

describe('parseDdmmyyyy', () => {
  it('parses a valid DD/MM/YYYY into the right local date', () => {
    const d = parseDdmmyyyy('12/06/2026');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(5); // June (0-based)
    expect(d!.getDate()).toBe(12);
  });

  it('returns null for empty / blank / nullish input', () => {
    expect(parseDdmmyyyy('')).toBeNull();
    expect(parseDdmmyyyy('   ')).toBeNull();
    expect(parseDdmmyyyy(undefined)).toBeNull();
    expect(parseDdmmyyyy(null)).toBeNull();
  });

  it('rejects the wrong shape (ISO, single digits, partials)', () => {
    expect(parseDdmmyyyy('2026-06-12')).toBeNull();
    expect(parseDdmmyyyy('1/6/2026')).toBeNull();
    expect(parseDdmmyyyy('12/06/26')).toBeNull();
    expect(parseDdmmyyyy('12/2026')).toBeNull();
  });

  it('rejects impossible calendar dates instead of rolling them over', () => {
    expect(parseDdmmyyyy('31/02/2026')).toBeNull();
    expect(parseDdmmyyyy('00/01/2026')).toBeNull();
    expect(parseDdmmyyyy('32/01/2026')).toBeNull();
    expect(parseDdmmyyyy('01/13/2026')).toBeNull();
  });

  it('accepts a leap day in a leap year, rejects it otherwise', () => {
    expect(parseDdmmyyyy('29/02/2024')).not.toBeNull();
    expect(parseDdmmyyyy('29/02/2026')).toBeNull();
  });
});

describe('formatDdmmyyyy', () => {
  it('formats a Date as zero-padded DD/MM/YYYY', () => {
    expect(formatDdmmyyyy(new Date(2026, 5, 9))).toBe('09/06/2026');
    expect(formatDdmmyyyy(new Date(2026, 11, 31))).toBe('31/12/2026');
  });

  it('returns empty string for null / undefined / invalid Date', () => {
    expect(formatDdmmyyyy(null)).toBe('');
    expect(formatDdmmyyyy(undefined)).toBe('');
    expect(formatDdmmyyyy(new Date('not a date'))).toBe('');
  });

  it('round-trips DD/MM/YYYY -> Date -> DD/MM/YYYY', () => {
    for (const s of ['01/01/2025', '12/06/2026', '29/02/2024', '31/12/2099']) {
      expect(formatDdmmyyyy(parseDdmmyyyy(s))).toBe(s);
    }
  });
});

describe('isValidDdmmyyyy', () => {
  it('is true only for real DD/MM/YYYY calendar dates', () => {
    expect(isValidDdmmyyyy('12/06/2026')).toBe(true);
    expect(isValidDdmmyyyy('')).toBe(false);
    expect(isValidDdmmyyyy('31/02/2026')).toBe(false);
  });
});

describe('formatReceivedCompact', () => {
  // Fixed "now": Wednesday 17 June 2026, 14:00 local. TZ-suffix-less ISO
  // strings parse as LOCAL time, so the assertions hold on any machine.
  const NOW = new Date(2026, 5, 17, 14, 0);

  it('same local day → 24h time only', () => {
    expect(formatReceivedCompact('2026-06-17T09:12', NOW)).toBe('09:12');
    expect(formatReceivedCompact('2026-06-17T00:05', NOW)).toBe('00:05');
    // Later the same day still counts as today (never relative).
    expect(formatReceivedCompact('2026-06-17T23:30', NOW)).toBe('23:30');
  });

  it('within the last 6 days → short weekday + time', () => {
    expect(formatReceivedCompact('2026-06-16T23:59', NOW)).toBe('Tue 23:59'); // yesterday
    expect(formatReceivedCompact('2026-06-15T09:12', NOW)).toBe('Mon 09:12');
    expect(formatReceivedCompact('2026-06-11T08:30', NOW)).toBe('Thu 08:30'); // 6 days back
  });

  it('7+ days back → DD/MM/YY date', () => {
    expect(formatReceivedCompact('2026-06-10T10:00', NOW)).toBe('10/06/26'); // 7 days: boundary
    expect(formatReceivedCompact('2025-12-25T10:00', NOW)).toBe('25/12/25');
  });

  it('future-dated timestamps fall through to the date form (never relative)', () => {
    expect(formatReceivedCompact('2026-06-20T10:00', NOW)).toBe('20/06/26');
  });

  it('empty input → em dash; unparseable input returned verbatim', () => {
    expect(formatReceivedCompact('', NOW)).toBe('—');
    expect(formatReceivedCompact('not-a-date', NOW)).toBe('not-a-date');
  });
});

describe('ageDaysFromIso / caseAgeLabel (TKT-072 search-row age)', () => {
  // Same fixed "now" idiom as formatReceivedCompact: local-time ISO strings.
  const NOW = new Date(2026, 5, 17, 14, 0); // Wed 17 June 2026, 14:00

  it('counts whole CALENDAR days (a late-yesterday timestamp is 1 day old)', () => {
    expect(ageDaysFromIso('2026-06-17T09:00', NOW)).toBe(0);
    expect(ageDaysFromIso('2026-06-16T23:59', NOW)).toBe(1);
    expect(ageDaysFromIso('2026-06-05T10:00', NOW)).toBe(12);
  });

  it('floors a clock-skewed future timestamp at 0, and null on junk/absent input', () => {
    expect(ageDaysFromIso('2026-06-20T10:00', NOW)).toBe(0);
    expect(ageDaysFromIso('', NOW)).toBeNull();
    expect(ageDaysFromIso(null, NOW)).toBeNull();
    expect(ageDaysFromIso(undefined, NOW)).toBeNull();
    expect(ageDaysFromIso('not-a-date', NOW)).toBeNull();
  });

  it('renders the queue-row idiom: "12d old", "today" on day 0, "" when unknown', () => {
    expect(caseAgeLabel('2026-06-05T10:00', NOW)).toBe('12d old');
    expect(caseAgeLabel('2026-06-16T23:59', NOW)).toBe('1d old');
    expect(caseAgeLabel('2026-06-17T09:00', NOW)).toBe('today');
    expect(caseAgeLabel('', NOW)).toBe('');
    expect(caseAgeLabel(undefined, NOW)).toBe('');
    expect(caseAgeLabel('junk', NOW)).toBe('');
  });
});

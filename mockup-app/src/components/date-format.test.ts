import { describe, it, expect } from 'vitest';
import { parseDdmmyyyy, formatDdmmyyyy, isValidDdmmyyyy } from './date-format';

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

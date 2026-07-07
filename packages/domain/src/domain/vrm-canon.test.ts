import { describe, it, expect } from 'vitest';
import { canonicalizeVrm } from './vrm-canon';

describe('canonicalizeVrm', () => {
  it('upper-cases and strips all non-alphanumerics', () => {
    expect(canonicalizeVrm('yt13 utv')).toBe('YT13UTV');
    expect(canonicalizeVrm('YT13 UTV')).toBe('YT13UTV');
    expect(canonicalizeVrm('YT13UTV')).toBe('YT13UTV');
    expect(canonicalizeVrm('yt13-utv')).toBe('YT13UTV');
    expect(canonicalizeVrm('  YT13  UTV  ')).toBe('YT13UTV');
  });

  it('canonicalises Case/PO references the same way', () => {
    expect(canonicalizeVrm('CCPY 26050')).toBe('CCPY26050');
    expect(canonicalizeVrm('ccpy26050')).toBe('CCPY26050');
  });

  it('all spaced/compact/mixed-case forms of one mark converge', () => {
    const forms = ['YT13 UTV', 'yt13 utv', 'YT13UTV', 'Yt13-Utv', 'yt 13 u t v'];
    const canon = forms.map(canonicalizeVrm);
    expect(new Set(canon).size).toBe(1);
    expect(canon[0]).toBe('YT13UTV');
  });

  it('handles null / undefined / empty as empty string', () => {
    expect(canonicalizeVrm(null)).toBe('');
    expect(canonicalizeVrm(undefined)).toBe('');
    expect(canonicalizeVrm('')).toBe('');
    expect(canonicalizeVrm('   ')).toBe('');
  });
});

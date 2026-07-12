import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ============================================================
   contrast — WCAG guards over the theme.css semantic triads
   (reforge 2026-07-01).

   Parses the :root custom properties out of theme.css with a regex (no DOM,
   no jsdom — pure node), resolves var() aliases (e.g. --ce-warning-tint →
   --ce-amber-tint), and asserts the relative-luminance contrast ratios the
   reforge spec promises:

     - ink-on-tint ≥ 4.5 for all four families (info/success/warning/critical)
     - white-on-critical-ink ≥ 4.5 (the white-text blocker chip fill)
     - warning-text-on-white ≥ 4.5 (amber-looking text on white)
     - the wash/fill/ground pairings the red-demotion sweep introduced

   Plus two binding-constraint guards: the demoted eyebrow stays AA on both
   grounds, and the PRINT brand red never appears anywhere under src/ (the
   hex literal is built in pieces below so this file passes its own sweep).
   ============================================================ */

const css = readFileSync(fileURLToPath(new URL('./theme.css', import.meta.url)), 'utf8');

/* ----------  tiny CSS-variable parser + var() alias resolver  ---------- */

const vars = new Map<string, string>();
for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
  vars.set(m[1], m[2].trim());
}

function resolve(value: string, depth = 0): string {
  if (depth > 16) throw new Error(`var() alias chain too deep at: ${value}`);
  const ref = /^var\((--[a-z0-9-]+)\)$/i.exec(value.trim());
  if (!ref) return value.trim();
  const next = vars.get(ref[1]);
  if (next === undefined) throw new Error(`var ${ref[1]} is not defined in theme.css`);
  return resolve(next, depth + 1);
}

/** Resolve a custom-property name (or a literal colour) to its hex literal. */
function colorOf(nameOrLiteral: string): string {
  const raw = nameOrLiteral.startsWith('--')
    ? vars.get(nameOrLiteral)
    : nameOrLiteral;
  if (raw === undefined) throw new Error(`var ${nameOrLiteral} is not defined in theme.css`);
  return resolve(raw);
}

/* ----------  WCAG relative luminance + contrast ratio  ---------- */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, '');
  const full =
    h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const la = luminance(colorOf(a));
  const lb = luminance(colorOf(b));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* ----------  assertions  ---------- */

const FAMILIES = ['info', 'success', 'warning', 'critical'] as const;

describe('semantic triads exist and resolve to hex', () => {
  it.each(FAMILIES)('%s family defines tint / line / ink / accent', (family) => {
    for (const part of ['tint', 'line', 'ink', 'accent'] as const) {
      const name = `--ce-${family}-${part}`;
      expect(vars.has(name), `${name} missing from theme.css :root`).toBe(true);
      expect(colorOf(name)).toMatch(/^#[0-9a-f]{3,6}$/i);
    }
  });

  it('warning family also defines -text and -wash', () => {
    expect(colorOf('--ce-warning-text')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(colorOf('--ce-warning-wash')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('WCAG contrast (≥ 4.5:1)', () => {
  it.each(FAMILIES)('%s ink on %s tint clears AA text contrast', (family) => {
    const r = ratio(`--ce-${family}-ink`, `--ce-${family}-tint`);
    expect(r, `--ce-${family}-ink on --ce-${family}-tint = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it('white text on the critical-ink chip fill clears AA', () => {
    const r = ratio('#ffffff', '--ce-critical-ink');
    expect(r, `white on --ce-critical-ink = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it('warning-text on white clears AA', () => {
    const r = ratio('--ce-warning-text', '#ffffff');
    expect(r, `--ce-warning-text on white = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it('critical-ink on white clears AA (fixLink, duePastText)', () => {
    const r = ratio('--ce-critical-ink', '#ffffff');
    expect(r, `--ce-critical-ink on white = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  // The pipeline stuck-stage pairing: count (warning-text) + label
  // (warning-ink) both sit on the large-surface warning wash.
  it('warning-text on the warning wash clears AA', () => {
    const r = ratio('--ce-warning-text', '--ce-warning-wash');
    expect(r, `--ce-warning-text on --ce-warning-wash = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it('warning-ink on the warning wash clears AA', () => {
    const r = ratio('--ce-warning-ink', '--ce-warning-wash');
    expect(r, `--ce-warning-ink on --ce-warning-wash = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  // The chipWarning recipe: ink text on the amber ACCENT fill.
  it('warning-ink on the warning accent fill clears AA', () => {
    const r = ratio('--ce-warning-ink', '--ce-warning-accent');
    expect(r, `--ce-warning-ink on --ce-warning-accent = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  // Charcoal-selected surfaces (CaseList facetChipActive, AddEvidence row).
  it('white on charcoal clears AA', () => {
    const r = ratio('#ffffff', '--ce-charcoal');
    expect(r, `white on --ce-charcoal = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it('the demoted eyebrow colour clears AA on white', () => {
    const r = ratio('--ce-eyebrow-color', '#ffffff');
    expect(r, `--ce-eyebrow-color on white = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it('the demoted eyebrow colour clears AA on the secondary ground', () => {
    const r = ratio('--ce-eyebrow-color', '--ce-bg-2');
    expect(r, `--ce-eyebrow-color on --ce-bg-2 = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});

describe('WCAG focus appearance contrast (≥ 3:1)', () => {
  it('the outer focus stroke clears 3:1 against white controls and cards', () => {
    const r = ratio('--ce-focus-stroke', '#ffffff');
    expect(r, `--ce-focus-stroke on white = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });

  it('the focus separator clears 3:1 against the charcoal navigation rail', () => {
    const r = ratio('--ce-focus-separator', '--ce-charcoal');
    expect(r, `--ce-focus-separator on charcoal = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });

  it('uses the solid two-layer recipe instead of the old translucent halo', () => {
    expect(css).toContain('0 0 0 2px var(--ce-focus-separator)');
    expect(css).toContain('0 0 0 5px var(--ce-focus-stroke)');
    expect(css).not.toContain('0 0 0 3px rgba(219, 8, 22, 0.55)');
  });
});

describe('red budget guards', () => {
  // Built in pieces so this file passes its own source sweep below.
  const PRINT_RED = ['c80a', '32'].join('');

  it('the print red never appears anywhere under mockup-app/src', () => {
    const srcRoot = fileURLToPath(new URL('..', import.meta.url));
    const offenders = readdirSync(srcRoot, { recursive: true })
      .map(String)
      .filter((f) => /\.(ts|tsx|css)$/.test(f))
      .filter((f) => readFileSync(join(srcRoot, f), 'utf8').toLowerCase().includes(PRINT_RED));
    expect(offenders, `print red found in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('critical aliases stay anchored to the CE web reds', () => {
    expect(colorOf('--ce-critical-accent').toLowerCase()).toBe('#db0816');
    expect(colorOf('--ce-critical-ink').toLowerCase()).toBe('#8f1422');
  });
});

/**
 * The engine wired AUTHORITATIVELY. The safety case is: byte-identical to today while the
 * gate is off, correct mapping onto CaseWorkType while on, and a fall back to the existing
 * decision (never a guess, never a throw) for anything the engine cannot resolve.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  decideCaseTypeWithIntakeEngine,
  identifyingSenderFor,
  yearTokenFor,
} from './intakeEngineDecision.js';

const STAFF = 'sam.baker@collisionengineers.co.uk';

/** A staff forward: envelope From is Collision Engineers, QDOS is in the quoted header. */
function forward(instruction: string): { senderAddress: string; body: string; receivedAt: string } {
  return {
    senderAddress: STAFF,
    receivedAt: '2026-07-21T09:20:00Z',
    body: [
      'Another one for the pile.',
      '',
      '-----Original Message-----',
      'From: Instructions <instructions@qdosassist.co.uk>',
      'Sent: 21 July 2026 09:14',
      'To: Sam Baker <sam.baker@collisionengineers.co.uk>',
      'Subject: Instruction',
      '',
      instruction,
    ].join('\n'),
  };
}

const STANDARD = 'Please arrange a standard engineer inspection at the policyholder address.';
const AUDIT_REPAIRABLE =
  "Please audit the third-party engineer's report. Our records show the other engineer found the vehicle repairable.";
const AUDIT_TOTAL_LOSS =
  "Please audit the previous engineer's report; the vehicle was recorded as a total loss.";
const DUAL = 'Please provide a REPORT + AUDIT REPORT for the vehicle below.';

const NO_SIGNALS = {};

afterEach(() => {
  delete process.env.INTAKE_ENGINE_ENABLED;
});

describe('gate off — byte-identical to the existing decision', () => {
  it('returns the legacy decision and ignores the engine entirely', () => {
    const decision = decideCaseTypeWithIntakeEngine(forward(AUDIT_REPAIRABLE), NO_SIGNALS);
    expect(decision).toEqual({ caseType: 'standard', dual: false, signals: [] });
  });

  it('identifyingSenderFor returns the envelope sender untouched', () => {
    expect(identifyingSenderFor(STAFF, forward(STANDARD).body)).toEqual({
      senderAddress: STAFF,
      source: 'envelope',
    });
  });

  it('still honours a legacy parser verdict', () => {
    const decision = decideCaseTypeWithIntakeEngine(forward(STANDARD), {
      parserCaseType: { value: 'audit_total_loss', signals: ['parser:x'] },
    });
    expect(decision.caseType).toBe('audit_total_loss');
  });
});

describe('gate on — the engine decides', () => {
  afterEach(() => {
    delete process.env.INTAKE_ENGINE_ENABLED;
  });

  it('recovers the provider address from the forwarded header', () => {
    process.env.INTAKE_ENGINE_ENABLED = 'true';
    expect(identifyingSenderFor(STAFF, forward(STANDARD).body)).toEqual({
      senderAddress: 'instructions@qdosassist.co.uk',
      source: 'forwarded_header',
    });
  });

  it('a standard QDOS instruction -> standard', () => {
    process.env.INTAKE_ENGINE_ENABLED = 'true';
    const decision = decideCaseTypeWithIntakeEngine(forward(STANDARD), NO_SIGNALS);
    expect(decision.caseType).toBe('standard');
    expect(decision.dual).toBe(false);
    expect(decision.signals).toContain('intake-engine:1a_standard');
    expect(decision.signals).toContain('principal:QDOS');
    expect(decision.signals).toContain('sender:forwarded_header');
  });

  it('an audit whose verdict is repairable -> audit (mints A.)', () => {
    process.env.INTAKE_ENGINE_ENABLED = 'true';
    const decision = decideCaseTypeWithIntakeEngine(forward(AUDIT_REPAIRABLE), NO_SIGNALS);
    expect(decision.caseType).toBe('audit');
    expect(decision.dual).toBe(false);
  });

  it('an audit whose verdict is total loss -> audit_total_loss (mints AP.)', () => {
    process.env.INTAKE_ENGINE_ENABLED = 'true';
    const decision = decideCaseTypeWithIntakeEngine(forward(AUDIT_TOTAL_LOSS), NO_SIGNALS);
    expect(decision.caseType).toBe('audit_total_loss');
    expect(decision.dual).toBe(false);
  });

  it('the dual REPORT + AUDIT REPORT template -> audit with dual TRUE (so markerForMint keeps the standard number)', () => {
    process.env.INTAKE_ENGINE_ENABLED = 'true';
    const decision = decideCaseTypeWithIntakeEngine(forward(DUAL), NO_SIGNALS);
    expect(decision.caseType).toBe('audit');
    expect(decision.dual).toBe(true);
    expect(decision.signals).toContain('intake-engine:1c_inspection_and_audit');
  });
});

describe('gate on — falls back rather than guessing', () => {
  afterEach(() => {
    delete process.env.INTAKE_ENGINE_ENABLED;
  });

  it('an unknown sender the engine cannot match falls back to the legacy decision', () => {
    process.env.INTAKE_ENGINE_ENABLED = 'true';
    const unknown = { senderAddress: 'someone@not-a-known-provider.example', body: STANDARD, receivedAt: '2026-07-21T09:20:00Z' };
    const decision = decideCaseTypeWithIntakeEngine(unknown, {
      classifierSubtype: 'existing_provider_audit',
    });
    // Legacy's classifier corroboration still wins — the engine never resolved.
    expect(decision.caseType).toBe('audit');
    expect(decision.signals).toEqual(['classifier:existing_provider_audit']);
  });

  it('an audit with no determinable verdict (engine needs_review) falls back', () => {
    process.env.INTAKE_ENGINE_ENABLED = 'true';
    const ambiguous = forward('Please audit the report — findings to follow once known.');
    const decision = decideCaseTypeWithIntakeEngine(ambiguous, NO_SIGNALS);
    expect(decision).toEqual({ caseType: 'standard', dual: false, signals: [] });
  });

  it('PRESERVES a legacy diminution decision — the engine cannot express it', () => {
    process.env.INTAKE_ENGINE_ENABLED = 'true';
    const decision = decideCaseTypeWithIntakeEngine(forward(AUDIT_REPAIRABLE), {
      parserCaseType: { value: 'diminution', signals: ['parser:dim'] },
    });
    expect(decision.caseType).toBe('diminution');
  });

  it('never throws on a malformed envelope — falls back instead', () => {
    process.env.INTAKE_ENGINE_ENABLED = 'true';
    expect(() => decideCaseTypeWithIntakeEngine(undefined, NO_SIGNALS)).not.toThrow();
    expect(decideCaseTypeWithIntakeEngine(undefined, NO_SIGNALS).caseType).toBe('standard');
    expect(decideCaseTypeWithIntakeEngine({ body: 42 }, NO_SIGNALS).caseType).toBe('standard');
  });
});

describe('yearTokenFor', () => {
  it('derives from receivedAt, not the wall clock (replay-stable)', () => {
    expect(yearTokenFor('2026-07-21T09:20:00Z')).toBe('26');
    expect(yearTokenFor('2031-01-01T00:00:00Z')).toBe('31');
    expect(yearTokenFor('not-a-date')).toBe('70');
  });
});

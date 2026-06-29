/* ============================================================
   Collision Engineers — client-side VRM input validation (issue #12).

   The editable-VRM safety net must WARN on an obviously-malformed correction
   without BLOCKING a deliberate one (a foreign / trade / personalised mark the
   operator knows is right). Rather than re-derive a UK-mark regex here, we REUSE
   the domain's canonical ruleset (`extractVrm` — the exact STRICT/LOOSE shapes
   the orchestration intake + the parser sniff mirror). A typed value is a
   plausible mark iff `extractVrm` recognises it; the VRM field is itself the
   context anchor that licenses the loose dateless personal-plate shape (e.g. "A1"),
   so we feed `extractVrm` an explicit anchor.

   PURE + DETERMINISTIC. No I/O.
   ============================================================ */
import { extractVrm } from '@cs/domain';

/** Normalise a typed VRM to the stored form: uppercase, no spaces/punctuation. */
export function normaliseVrm(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** The outcome of validating a typed VRM for the edit/save flow. */
export type VrmCheck =
  | { status: 'ok'; vrm: string } // a recognised UK mark shape — save cleanly
  | { status: 'empty' } // nothing entered — hard block (a case keeps a registration)
  | { status: 'malformed'; vrm: string }; // not a known shape — WARN, but allow an override

/**
 * Classify a typed VRM for the edit/save flow:
 *   - `ok`        → saves cleanly (normalised mark recognised by the domain ruleset).
 *   - `empty`     → BLOCK the save (the registration field can't be cleared).
 *   - `malformed` → WARN inline, but still allow a deliberate save (the operator may
 *                   know a non-standard / foreign / trade mark the ruleset rejects).
 */
export function checkVrm(input: string): VrmCheck {
  const vrm = normaliseVrm(input);
  if (!vrm) return { status: 'empty' };
  // The VRM field IS the context anchor, so license the loose dateless shape too.
  const recognised = extractVrm(`registration ${vrm}`) === vrm;
  return recognised ? { status: 'ok', vrm } : { status: 'malformed', vrm };
}

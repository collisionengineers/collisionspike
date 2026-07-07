/* ============================================================
   Collision Engineers — Intake case-minting eligibility (DOMAIN LOGIC).

   Which inbound category may MINT a new Case on the primary intake path. A domain
   CONSTANT (not an inline `category !== 'receiving_work'` string check in the
   orchestrator) so the rule is explicit, drift-proof, and unit-tested — the sibling
   of {@link RETRO_TRIGGER_CATEGORIES} in ./retro-case.

   PURE + DETERMINISTIC + FRAMEWORK-FREE.
   ============================================================ */

import type { InboundCategory } from '../dto/index.js';

/**
 * The ONLY inbound category the primary intake path mints a Case from. Every other
 * category (`query`, `billing`, `non_actionable`, `cancellation`, `case_update`,
 * `other`) is record-kept as a triage row, linked/appended to an EXISTING case, or
 * surfaced as a suggestion — never minted. This is the guard that stops a
 * `non_actionable` acknowledgement from opening a blank Case (the TKT-081 s2 live
 * bug, whose root cause was a Stage-A mislabel now fixed — this constant is the
 * belt-and-braces so a future edit can't silently reintroduce the hole).
 *
 * Retroactive reconstruction is a SEPARATE, gated seam ({@link RETRO_TRIGGER_CATEGORIES})
 * that DISCOVERS an existing Case/PO from the archive — it likewise never mints a
 * new Case/PO, and it too excludes `non_actionable`.
 */
export const CASE_MINTING_CATEGORIES: readonly InboundCategory[] = ['receiving_work'];

/** True when an inbound of this category may mint a Case on the primary intake path. */
export function categoryMintsCase(category: InboundCategory): boolean {
  return CASE_MINTING_CATEGORIES.includes(category);
}

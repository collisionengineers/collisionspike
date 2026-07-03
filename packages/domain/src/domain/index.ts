/* ============================================================
   Collision Engineers — Domain decision logic (barrel).

   Pure, framework-free, deterministic decision logic for the collisionspike
   intake flows (Phase-1 plan §5.2 / §5.3 / §5.8 / §5.9). Mirrors collisioncc
   semantics (graph-intake classification, ADR-0010 dedup/case-linking,
   provider-by-domain, inspection-address policy) WITHOUT importing or calling
   it. The Power Automate flows mirror these tables; the Code App reuses them.
   ============================================================ */

export * from './classification';
export * from './dedup';
export * from './provider-match';
export * from './sender-identity-match';
export * from './vrm-filter';
export * from './case-po';
export * from './case-type';
export * from './address-policy';
export * from './pii-scrub';
export * from './triage-policy';
export * from './outlook-folder';

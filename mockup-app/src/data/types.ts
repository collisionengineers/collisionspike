/* ============================================================
   Collision Engineers — DATA SEAM: re-export shim (plan 30 §0 D10 hoist).

   The types that used to be DEFINED here have been hoisted to the shared
   package '@cs/domain' (packages/domain/src/dto/index.ts).  This file is now a
   THIN RE-EXPORT BARREL so that the handful of sibling modules that import with
   the relative './types' / '../data/types' path (hooks.ts, location-assist-
   client.ts) keep compiling unchanged.

   '@cs/domain' is the single source of truth — the DataAccess interface, every
   input/result DTO, the Box/location-assist gate types + their all-false/all-off
   fallback constants, and the Phase-8 triage types all live there now. No type
   or interface body is defined locally; there are no mockup-app-only DTOs left
   that '@cs/domain' does not already export.
   ============================================================ */

export * from '@cs/domain';

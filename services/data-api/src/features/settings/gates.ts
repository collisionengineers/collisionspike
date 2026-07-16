/**
 * services/data-api/src/features/settings/gates.ts — thin re-export of @cs/domain/gates.
 *
 * The same gate module used by the orchestration activities (via @cs/domain/gates directly)
 * and the API function handlers (via this re-export). One implementation, no duplication.
 *
 * Plan 21 §21.2: "the API's lib/gates.ts re-exports it [the shared gate reader]".
 * Plan 10 §1.4: centralised gate reader over process.env.
 */

export { gates } from '@cs/domain/gates';

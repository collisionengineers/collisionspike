/**
 * @cs/domain — main barrel export (browser-safe).
 *
 * Re-exports: contracts, domain, model, dto.
 *
 * codecs  → import from '@cs/domain/codecs'  (subpath; server-only — JSON code tables off the client)
 * gates   → import from '@cs/domain/gates'   (subpath; server-only — process.env out of the browser)
 */

// contracts
export * from './contracts/case-status.js';
export * from './contracts/image-rules.js';
export * from './contracts/eva-export.js';
export * from './contracts/eva-edit.js';
export * from './contracts/vehicle-data.js';

// domain
export * from './domain/index.js';

// model — pure domain types + helpers lifted from mock/types.ts + mock/queues.ts
export * from './model/index.js';

// dto — DataAccess interface + all input/result types; persistence-neutral.
export * from './dto/index.js';

// dto/provider-api — the provider API-intake channel DTOs (TKT-055, ADR-0020). Kept a
// SEPARATE module from dto/index.ts (the frozen DataAccess contract) — additive, channel-specific.
export * from './dto/provider-api.js';

// dto/capture — staff controls for the public guided-photo request lifecycle.
export * from './dto/capture.js';

// capabilities — the shared AI capability registry (PLAN-001, ADR-0025). Env-free descriptors
// both AI surfaces (in-app assistant + read-only MCP) derive their tool set from.
export * from './capabilities/index.js';

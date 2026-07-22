/**
 * @cs/intake-engine — main barrel export.
 *
 * Zero I/O, zero live SDK dependencies by design (see README.md). Re-exports the
 * registry loader, the pipeline stages, and the two safety-guard adapters.
 */

// registry
export * from './registry/schema.js';
export * from './registry/defaults.js';
export * from './registry/loader.js';

// pipeline
export * from './pipeline/identify-principal.js';
export * from './pipeline/resolve-intermediary-principal.js';
export * from './pipeline/classify-email-type.js';
export * from './pipeline/mint-case-number.js';
export * from './pipeline/resolve-archive-folder-name.js';
export * from './pipeline/pipeline.js';

// adapters
export * from './adapters/box-scope-guard.js';
export * from './adapters/outlook-readonly-guard.js';

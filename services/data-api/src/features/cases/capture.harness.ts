/**
 * capture.harness — shared fixtures for the guided-capture route test suites.
 *
 * Owns the session-row, HTTP request, and client-observation factories used across the
 * capture route test files (capture.test.ts and the capture-access/upload/complete/submit
 * suites). Each test file owns its own vitest mock wiring and assertions; only these pure
 * fixtures are shared, so the default shapes stay identical between suites.
 */

import type { HttpRequest } from '@azure/functions';

export function sessionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    case_id: 'case-1',
    status: 'open',
    shot_plan_id: 'essential-v1',
    shot_plan_label: 'Essential vehicle photos',
    guidance_mode: 'advisory',
    rules_version: 'deterministic-quality-v1',
    model_version: null,
    token_generation: 1,
    expires_at: new Date(Date.now() + 60_000),
    created_at: new Date(),
    submitted_at: null,
    submit_idempotency_key: null,
    revoked_at: null,
    ...overrides,
  };
}

export function request(input: {
  params?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
} = {}): HttpRequest {
  return {
    params: input.params ?? {},
    headers: new Headers(input.headers),
    json: async () => input.body ?? {},
  } as unknown as HttpRequest;
}

export function clientObservation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    route: 'guided',
    disposition: 'ready',
    signals: { brightness: 0.5, contrast: 0.2, sharpness: 0.1, motion: 0.01 },
    stableFrames: 3,
    rulesVersion: 'deterministic-quality-v1',
    ...overrides,
  };
}

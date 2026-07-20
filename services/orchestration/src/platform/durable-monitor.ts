/**
 * Shared client-side lifecycle for the eternal Durable singleton monitors (TKT-264 / PLAN-008).
 *
 * This is the CLIENT side only — status readback and the race-safe ensure/start that run in HTTP
 * handlers and bootstrap timers (via `df.DurableClient`), NOT the orchestrator generators. The
 * orchestrator bodies, their retry policies, interval defaults, reschedule tails, and each lane's
 * data-plane protocol stay lane-owned so Durable replay history is never perturbed (ADR-0030).
 *
 * The Box File Request and Box classification monitors share this in full (they were one
 * implementation in `box-maintenance-monitor.ts` before the classification split). The archive-mirror
 * and provider-archive monitors keep their own thinner `ensure*` contract (`{ started, status? }`,
 * no race re-read) and reuse only the behaviour-neutral {@link isAlive} predicate — unifying their
 * ensure behaviour onto the race-safe form here would change observable behaviour and is deferred.
 */

import type { DurableClient } from 'durable-functions';

export const ALIVE_STATUSES = new Set(['Running', 'Pending', 'ContinuedAsNew']);

export function isAlive(status: unknown): boolean {
  return ALIVE_STATUSES.has(String(status ?? ''));
}

export function isNotFound(error: unknown): boolean {
  const rec = error as { statusCode?: unknown; status?: unknown } | null;
  if (rec?.statusCode === 404 || rec?.status === 404) return true;
  return /\b404\b|not found|could not find any data/i.test(
    error instanceof Error ? error.message : String(error ?? ''),
  );
}

export interface MonitorDefinition {
  instanceId: string;
  orchestratorName: string;
  label: string;
}

export interface BoxMonitorStatus {
  instanceId: string;
  runtimeStatus: string;
  running: boolean;
  started?: boolean;
  error?: string;
}

export async function readMonitor(
  client: DurableClient,
  definition: MonitorDefinition,
): Promise<BoxMonitorStatus> {
  try {
    const status = await client.getStatus(definition.instanceId);
    const runtimeStatus = String(status?.runtimeStatus ?? 'Unknown');
    return {
      instanceId: definition.instanceId,
      runtimeStatus,
      running: isAlive(runtimeStatus),
    };
  } catch (error) {
    if (!isNotFound(error)) throw error;
    return {
      instanceId: definition.instanceId,
      runtimeStatus: 'NotFound',
      running: false,
    };
  }
}

export async function ensureMonitor(
  client: DurableClient,
  definition: MonitorDefinition,
  log?: (message: string) => void,
): Promise<BoxMonitorStatus> {
  const current = await readMonitor(client, definition);
  if (current.running) return { ...current, started: false };
  try {
    await client.startNew(definition.orchestratorName, {
      instanceId: definition.instanceId,
    });
    log?.(`[${definition.label}] started singleton ${definition.instanceId}`);
    return {
      instanceId: definition.instanceId,
      runtimeStatus: 'Pending',
      running: true,
      started: true,
    };
  } catch (error) {
    // Two bootstrap requests may race. A fixed instance id makes the loser safe:
    // if the winner is now alive, report the singleton instead of failing deploy.
    const raced = await readMonitor(client, definition).catch(() => undefined);
    if (raced?.running) return { ...raced, started: false };
    throw error;
  }
}

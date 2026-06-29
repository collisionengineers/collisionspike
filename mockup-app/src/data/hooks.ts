/* ============================================================
   Collision Engineers — Code App DATA SEAM: React hooks.

   Thin hooks over the async DataAccess fetchers, each returning
   { data, loading, error, refetch }. The mock source resolves synchronously
   behind them, so the first render still flips to loaded immediately; the
   Dataverse source awaits real Web API calls. Loading/empty/error states are the
   screen's to render (Phase-1 §5.10 Surface A).

   Dependency-correctness: each effect's deps are the PRIMITIVE query inputs only
   (id / queue name). The fetcher is read from the live seam at call time, not
   captured as a dep, so swapping mock<->Dataverse never re-triggers loops, and a
   stable `refetch` (a bumpable nonce) is the explicit re-run lever. An
   `ignore`/`cancelled` guard drops stale resolutions on unmount or input change.
   ============================================================ */

import { useCallback, useEffect, useState } from 'react';
import { getDataAccess } from './index';
import type { ActivityEvent, Case, CaseUpdateInput, Evidence, Provider } from '@cs/domain';
import type {
  LiveCounts,
  Throughput,
  AgingExceptions,
  PipelineStage,
} from '@cs/domain';
import type { QueueName } from '@cs/domain';
import type {
  SuggestedAddress,
  InspectionAddressCounts,
  BoxGates,
  LocationAssistGate,
  InboundEmail,
  InboundCategory,
  InboundCounts,
} from './types';

/** The shape every query hook returns. */
export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
  /** Re-run the query (e.g. the dashboard's "Updated HH:MM · Refresh"). */
  refetch: () => void;
}

/**
 * Internal: run an async fetcher and track loading/error, re-running whenever any
 * `deps` entry changes or `refetch` is called. `run` is read fresh each effect
 * pass (closed over `deps`), so it must be provided as a stable callback by the
 * caller (we wrap each public hook's fetcher in useCallback over its primitives).
 */
function useAsync<T>(run: () => Promise<T>, deps: readonly unknown[]): QueryState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    run()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `run` is intentionally excluded; deps + nonce are the re-run triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, refetch };
}

/* ============================================================
   Public hooks.
   ============================================================ */

/** A single case by id. */
export function useCaseQuery(id: string | undefined): QueryState<Case | undefined> {
  const run = useCallback(
    () => (id ? getDataAccess().caseById(id) : Promise.resolve(undefined)),
    [id],
  );
  return useAsync(run, [id]);
}

/** The cases in a queue (windowed for `done`). Re-runs on queue name change. */
export function useQueueQuery(name: QueueName): QueryState<Case[]> {
  const run = useCallback(() => getDataAccess().casesForQueue(name), [name]);
  return useAsync(run, [name]);
}

/** The dashboard bundle: live counts, throughput, aging, pipeline stages. */
export interface DashboardData {
  liveCounts: LiveCounts;
  throughput: Throughput;
  agingExceptions: AgingExceptions;
  pipelineStages: PipelineStage[];
}
export function useDashboard(): QueryState<DashboardData> {
  const run = useCallback(async (): Promise<DashboardData> => {
    const da = getDataAccess();
    const now = new Date();
    const [liveCounts, throughput, agingExceptions, pipelineStages] = await Promise.all([
      da.liveCounts(now),
      da.throughput(now),
      da.agingExceptions(now),
      da.pipelineStages(),
    ]);
    return { liveCounts, throughput, agingExceptions, pipelineStages };
  }, []);
  return useAsync(run, []);
}

/** The EVA-relevant image set for a case. */
export function useImages(caseId: string | undefined): QueryState<Evidence[]> {
  const run = useCallback(
    () => (caseId ? getDataAccess().imagesForCase(caseId) : Promise.resolve([])),
    [caseId],
  );
  return useAsync(run, [caseId]);
}

/** The WorkProvider corpus. */
export function useProviders(): QueryState<Provider[]> {
  const run = useCallback(() => getDataAccess().providers(), []);
  return useAsync(run, []);
}

/** Low-confidence inspection-address suggestions for a case (corpus; ALWAYS suggestions). */
export function useInspectionAddressSuggestions(
  caseId: string | undefined,
): QueryState<SuggestedAddress[]> {
  const run = useCallback(
    () => (caseId ? getDataAccess().inspectionAddressSuggestions(caseId) : Promise.resolve([])),
    [caseId],
  );
  return useAsync(run, [caseId]);
}

/** Confirmed-vs-suggested split of the inspection-address corpus (Admin count). */
export function useInspectionAddressCounts(): QueryState<InspectionAddressCounts> {
  const run = useCallback(() => getDataAccess().inspectionAddressCounts(), []);
  return useAsync(run, []);
}

/**
 * The BOX_* feature gates. Screens read `const { data: gates } = useBoxGates()`
 * and treat `undefined`/loading as all-off (the type stays optional). Deps `[]`
 * like `useProviders`; `refetch` re-runs the read. The read itself defaults
 * all-false on failure, so this never throws a feature on by accident.
 */
export function useBoxGates(): QueryState<BoxGates> {
  const run = useCallback(() => getDataAccess().getBoxGates(), []);
  return useAsync(run, []);
}

/**
 * The location-assist gate (Phase 4a). Screens read
 * `const { data: assistGate } = useLocationAssistGate()` and treat
 * `undefined`/loading as off (the action stays hidden). The read defaults all-off
 * on failure, so this never throws the feature on by accident.
 */
export function useLocationAssistGate(): QueryState<LocationAssistGate> {
  const run = useCallback(() => getDataAccess().getLocationAssistGate(), []);
  return useAsync(run, []);
}

/** The 'hold new cases by default' intake preference (env-var). Loading/undefined
 *  is treated as false (no accidental hold). */
export function useHoldNewCasesDefault(): QueryState<boolean> {
  const run = useCallback(() => getDataAccess().getHoldNewCasesDefault(), []);
  return useAsync(run, []);
}

/** Recent pipeline activity (audit events), newest first. */
export function useActivity(): QueryState<ActivityEvent[]> {
  const run = useCallback(() => getDataAccess().recentActivity(), []);
  return useAsync(run, []);
}

/**
 * The inbox/triage rows for the active category tab (Phase 8), newest-first.
 * Re-runs when the category changes. Honest-empty (`[]`) until the
 * `cr1bd_inboundemail` table is wired — the screen renders the empty state.
 */
export function useInbox(category?: InboundCategory): QueryState<InboundEmail[]> {
  const run = useCallback(
    () => getDataAccess().inboundEmails(category ? { category } : undefined),
    [category],
  );
  return useAsync(run, [category]);
}

/** Per-category triage counts (+ untriaged backlog) — TabList badges + nav pill. */
export function useInboundCounts(): QueryState<InboundCounts> {
  const run = useCallback(() => getDataAccess().inboundEmailCounts(), []);
  return useAsync(run, []);
}

/* ============================================================
   Mutation hooks.

   Unlike the query hooks above (auto-run on mount via useAsync), a mutation
   hook hands back an EXPLICIT trigger the screen calls on a user action, plus
   in-flight + error state. The first one (useCaseUpdate) backs the editable-VRM
   correction (issue #12).
   ============================================================ */

/** What `useCaseUpdate` hands the screen. */
export interface CaseUpdateState {
  /** Persist the patch; resolves the updated Case, REJECTS on a transport error. */
  update: (id: string, patch: CaseUpdateInput) => Promise<Case>;
  /** True while a save is in flight (drives the Save button's spinner + disabled). */
  saving: boolean;
  /** The last save error (cleared at the start of each attempt). */
  error: Error | undefined;
}

/**
 * Patch a case (human correction — the editable VRM, issue #12). The trigger
 * resolves the server's updated Case so the caller can fold it into local state
 * (the working copy reflects the new VRM immediately), and rethrows on failure so
 * the editor can stay open and surface the error rather than silently "succeed".
 */
export function useCaseUpdate(): CaseUpdateState {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  const update = useCallback(
    async (id: string, patch: CaseUpdateInput): Promise<Case> => {
      setSaving(true);
      setError(undefined);
      try {
        return await getDataAccess().updateCase(id, patch);
      } catch (err: unknown) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e; // rethrow: the caller keeps the editor open + toasts the failure
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return { update, saving, error };
}

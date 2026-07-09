/* ============================================================
   Collision Engineers — SPA DATA SEAM: React hooks.

   Thin hooks over the async DataAccess fetchers, each returning
   { data, loading, error, refetch }. The mock source resolves synchronously
   behind them, so the first render still flips to loaded immediately; the
   REST (Data API) source awaits real HTTP calls. Loading/empty/error states are
   the screen's to render (Phase-1 §5.10 Surface A).

   Dependency-correctness: each effect's deps are the PRIMITIVE query inputs only
   (id / queue name). The fetcher is read from the live seam at call time, not
   captured as a dep, so swapping mock<->REST never re-triggers loops, and a
   stable `refetch` (a bumpable nonce) is the explicit re-run lever. An
   `ignore`/`cancelled` guard drops stale resolutions on unmount or input change.
   ============================================================ */

import { useCallback, useEffect, useState } from 'react';
import { getDataAccess } from './index';
import type { LogChaseInput, DetachInboundResult, OutlookMoveResult } from './rest-client';
import type { ActivityEvent, Case, CaseUpdateInput, Chaser, Evidence, Provider } from '@cs/domain';
import type {
  DashboardSummary,
  RemoveCaseInput,
  RemoveCaseResult,
  ProviderUpdateInput,
  NextCasePoResult,
  ReclassifyInboundInput,
  TriageState,
  AiSuggestion,
  AiSuggestionReviewInput,
  AiSuggestionReviewResult,
  GenerateAiSuggestionsResult,
  AiAssistGate,
  OutlookMoveGate,
} from '@cs/domain';
import type { QueueName } from '@cs/domain';
import type {
  SuggestedAddress,
  InspectionAddressCounts,
  BoxGates,
  LocationAssistGate,
  InboundEmail,
  InboundFacet,
  InboundView,
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

/** The Completed/Archive list (TKT-096): terminal cases — eva_submitted (awaiting
 *  delivery), done (delivered), box_synced (historical). safe()-empty at the seam,
 *  so a transport failure renders as an empty list, never a crash. */
export function useCompletedCases(): QueryState<Case[]> {
  const run = useCallback(() => getDataAccess().completedCases(), []);
  return useAsync(run, []);
}

/**
 * The amalgamated dashboard summary (work-todo-spike: amalgamated-dashboard) — the
 * case pipeline (liveCounts, throughput, queueCounts, pipelineStages, reasonFacets,
 * agingExceptions) AND the active-first `inbound` triage counts, in ONE fetch
 * (replacing the prior 4-call fan-out). `now` is threaded so the server windows
 * (today / this week) against the CLIENT clock. NOT safe()-wrapped: a transport
 * failure surfaces as `error` so the dashboard renders its error panel.
 */
export function useDashboard(): QueryState<DashboardSummary> {
  const run = useCallback(() => getDataAccess().dashboardSummary(new Date()), []);
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
  q?: string,
): QueryState<SuggestedAddress[]> {
  // Trimmed search term; <2 chars means "shortlist" (the server ignores it too).
  const term = (q ?? '').trim();
  const run = useCallback(
    () =>
      caseId
        ? getDataAccess().inspectionAddressSuggestions(caseId, term.length >= 2 ? term : undefined)
        : Promise.resolve([]),
    [caseId, term],
  );
  return useAsync(run, [caseId, term]);
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

/**
 * The AI-assist gate (TKT-015). Screens read `const { data: aiGate } = useAiAssistGate()`
 * and treat `undefined`/loading as OFF (the panel stays hidden). The read defaults all-off
 * on failure, so this never throws the feature on by accident.
 */
export function useAiAssistGate(): QueryState<AiAssistGate> {
  const run = useCallback(() => getDataAccess().getAiAssistGate(), []);
  return useAsync(run, []);
}

/** The AI-chat gate (TKT-060). `{ enabled:false }` on failure/loading, so the assistant
 *  drawer stays hidden unless the server confirms it is on. */
export function useAiChatGate(): QueryState<{ enabled: boolean }> {
  const run = useCallback(() => getDataAccess().getAiChatGate(), []);
  return useAsync(run, []);
}

/** Pending + recently-reviewed AI suggestions for a case (TKT-015). Honest-empty (`[]`)
 *  on any failure (the read is safe()-wrapped). Re-runs on case id change. */
export function useAiSuggestions(caseId: string | undefined): QueryState<AiSuggestion[]> {
  const run = useCallback(
    () => (caseId ? getDataAccess().aiSuggestions(caseId) : Promise.resolve([])),
    [caseId],
  );
  return useAsync(run, [caseId]);
}

/** Pending + recently-reviewed AI suggestions for ONE inbound email (rules-engine-v2
 *  Phase 2 ref-gate) — backs the inbox preview panel's "looks like an open case" /
 *  "may be a cancellation" banner. Distinct from `useAiSuggestions` above, which is
 *  case-scoped. Honest-empty (`[]`) on any failure (safe()-wrapped). Re-runs on
 *  inbound email id change. */
export function useInboundSuggestions(id: string | undefined): QueryState<AiSuggestion[]> {
  const run = useCallback(
    () => (id ? getDataAccess().inboundSuggestions(id) : Promise.resolve([])),
    [id],
  );
  return useAsync(run, [id]);
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
 * The inbox/triage rows for the active facet (Phase 8 + work-todo-spike:
 * email-management), newest-first. `view` defaults to 'active' (handled rows
 * hidden); pass 'handled' or 'all' to widen. Re-runs when category/subtype/view
 * change. Honest-empty (`[]`) until wired. The inbox LIST is NOT safe()-wrapped —
 * a 5xx surfaces as `error`/retry, never a fake empty inbox.
 */
export function useInbox(facet?: InboundFacet): QueryState<InboundEmail[]> {
  const category = facet?.category;
  const subtype = facet?.subtype;
  const view: InboundView = facet?.view ?? 'active';
  const run = useCallback(
    () => getDataAccess().inboundEmails({ category, subtype, view }),
    [category, subtype, view],
  );
  return useAsync(run, [category, subtype, view]);
}

/** Per-category ACTIVE-first triage counts (+ untriaged backlog) — TabList badges +
 *  nav pill. safe()-degrades to the zero baseline (the badge must never crash the nav). */
export function useInboundCounts(): QueryState<InboundCounts> {
  const run = useCallback(() => getDataAccess().inboundEmailCounts(), []);
  return useAsync(run, []);
}

/**
 * Preview the next Case/PO for a principal (+ optional year) — work-todo-spike:
 * box/case-po-gen. Re-runs as `principal`/`year` change so a manual-intake form can
 * show a live "next PO" preview; resolves `undefined` until a principal is supplied.
 * PREVIEW only — the durable claim happens at case create under the advisory-locked mint.
 */
export function useNextCasePo(
  principal: string | undefined,
  year?: string | number,
): QueryState<NextCasePoResult | undefined> {
  const run = useCallback(
    () =>
      principal ? getDataAccess().nextCasePo(principal, year) : Promise.resolve(undefined),
    [principal, year],
  );
  return useAsync(run, [principal, year]);
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

/**
 * Internal: back a mutation trigger with in-flight + error state. `fn` runs on the
 * user action (NOT on mount) and reads `getDataAccess()` fresh each call, so the
 * stable trigger never goes stale across a source swap. The trigger REJECTS on
 * failure (after recording `error`) so the caller can keep its editor/dialog open
 * and surface the failure rather than silently "succeed".
 */
function useMutationFn<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): { run: (...args: A) => Promise<R>; pending: boolean; error: Error | undefined } {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const run = useCallback(
    async (...args: A): Promise<R> => {
      setPending(true);
      setError(undefined);
      try {
        return await fn(...args);
      } catch (err: unknown) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e; // rethrow: caller keeps the UI open + toasts the failure
      } finally {
        setPending(false);
      }
    },
    // `fn` intentionally excluded: it only forwards to the live seam, read fresh per call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return { run, pending, error };
}

/** What `useTriage` hands the screen. `setState` REJECTS on non-2xx so the UI shows
 *  the failure (never a fake success). */
export interface TriageMutationState {
  setState: (id: string, state: TriageState) => Promise<void>;
  saving: boolean;
  error: Error | undefined;
}
/** Set an inbound email's triage state (Phase 8). */
export function useTriage(): TriageMutationState {
  const m = useMutationFn((id: string, state: TriageState) =>
    getDataAccess().setTriageState(id, state),
  );
  return { setState: m.run, saving: m.pending, error: m.error };
}

/** What `useReclassifyInbound` hands the screen. `reclassify` resolves the updated
 *  InboundEmail (chosen vs. suggested category/subtype) and REJECTS on failure. */
export interface ReclassifyInboundState {
  reclassify: (id: string, input: ReclassifyInboundInput) => Promise<InboundEmail>;
  saving: boolean;
  error: Error | undefined;
}
/** Staff reclassify/override an inbound email (work-todo-spike: suggested-tags-and-folders). */
export function useReclassifyInbound(): ReclassifyInboundState {
  const m = useMutationFn((id: string, input: ReclassifyInboundInput) =>
    getDataAccess().reclassifyInbound(id, input),
  );
  return { reclassify: m.run, saving: m.pending, error: m.error };
}

/** What `useLogChase` hands the screen. `logChase` resolves the created Chaser
 *  row (same shape as the case-detail read) and REJECTS on failure — a chase
 *  that didn't persist must never look logged. */
export interface LogChaseState {
  logChase: (caseId: string, input: LogChaseInput) => Promise<Chaser>;
  saving: boolean;
  error: Error | undefined;
}
/** Record a chase against a case (M-E2 — records, never sends). */
export function useLogChase(): LogChaseState {
  const m = useMutationFn((caseId: string, input: LogChaseInput) =>
    getDataAccess().logChase(caseId, input),
  );
  return { logChase: m.run, saving: m.pending, error: m.error };
}

/** What `useCaseRemove` hands the screen. `remove` resolves the RemoveCaseResult
 *  (surfacing `boxFolderUrl` + `alreadyRemoved`) and REJECTS on failure. Superuser. */
export interface CaseRemoveState {
  remove: (id: string, input: RemoveCaseInput) => Promise<RemoveCaseResult>;
  removing: boolean;
  error: Error | undefined;
}
/** Soft-remove a case (Superuser, work-todo-spike: ui-changes/delete-case). */
export function useCaseRemove(): CaseRemoveState {
  const m = useMutationFn((id: string, input: RemoveCaseInput) =>
    getDataAccess().removeCase(id, input),
  );
  return { remove: m.run, removing: m.pending, error: m.error };
}

/** What `useProviderUpdate` hands the screen. `update` resolves the full updated
 *  Provider and REJECTS on failure. Superuser; principal_code is immutable. */
export interface ProviderUpdateState {
  update: (idOrCode: string, input: ProviderUpdateInput) => Promise<Provider>;
  saving: boolean;
  error: Error | undefined;
}
/** Update a provider's automation mode / known sender-domains (work-todo-spike). */
export function useProviderUpdate(): ProviderUpdateState {
  const m = useMutationFn((idOrCode: string, input: ProviderUpdateInput) =>
    getDataAccess().updateProvider(idOrCode, input),
  );
  return { update: m.run, saving: m.pending, error: m.error };
}

/** What `useReviewAiSuggestion` hands the screen (TKT-015). `review` resolves the
 *  AiSuggestionReviewResult (surfacing whether a value was promoted) and REJECTS on failure. */
export interface ReviewAiSuggestionState {
  review: (id: string, input: AiSuggestionReviewInput) => Promise<AiSuggestionReviewResult>;
  saving: boolean;
  error: Error | undefined;
}
/** Accept/reject an AI suggestion (TKT-015 AI suggestion layer). */
export function useReviewAiSuggestion(): ReviewAiSuggestionState {
  const m = useMutationFn((id: string, input: AiSuggestionReviewInput) =>
    getDataAccess().reviewAiSuggestion(id, input),
  );
  return { review: m.run, saving: m.pending, error: m.error };
}

/** What `useGenerateAiSuggestions` hands the screen (TKT-015). `generate` resolves the
 *  honest `{ generated, reason? }` result (no-op when the gate is off / model unconfigured). */
export interface GenerateAiSuggestionsState {
  generate: (caseId: string) => Promise<GenerateAiSuggestionsResult>;
  generating: boolean;
  error: Error | undefined;
}
/** Ask the server to generate AI suggestions for a case (TKT-015). */
export function useGenerateAiSuggestions(): GenerateAiSuggestionsState {
  const m = useMutationFn((caseId: string) => getDataAccess().generateAiSuggestions(caseId));
  return { generate: m.run, generating: m.pending, error: m.error };
}

/** What `useDetachInbound` hands the screen (rules-engine-v2 Phase 2 — "Detach").
 *  `detach` resolves the DetachInboundResult and REJECTS on failure — a failed
 *  unlink must never look like it worked. */
export interface DetachInboundState {
  detach: (id: string) => Promise<DetachInboundResult>;
  detaching: boolean;
  error: Error | undefined;
}
/** Unlink an inbound email from its case. The case's already-filed archive copy is
 *  untouched — the preview panel's confirm dialog says so; this only records the
 *  unlink. */
export function useDetachInbound(): DetachInboundState {
  const m = useMutationFn((id: string) => getDataAccess().detachInbound(id));
  return { detach: m.run, detaching: m.pending, error: m.error };
}

/**
 * The Outlook-move gate (TKT-054 / 020726 E6). The "Suggested action" column reads
 * `const { data: moveGate } = useOutlookMoveGate()` and treats undefined/loading as
 * OFF (the suggestion renders as display-only text). Defaults all-off on failure.
 */
export function useOutlookMoveGate(): QueryState<OutlookMoveGate> {
  const run = useCallback(() => getDataAccess().getOutlookMoveGate(), []);
  return useAsync(run, []);
}

/** What `useOutlookMove` hands the screen. `move` resolves the queued/folder result
 *  and REJECTS on failure (409 gated / 503 queue down) — never a phantom "Filing…". */
export interface OutlookMoveState {
  move: (id: string) => Promise<OutlookMoveResult>;
  filing: boolean;
  error: Error | undefined;
}
/** Queue the REAL Outlook filing of one inbound email (TKT-054 / 020726 E6). */
export function useOutlookMove(): OutlookMoveState {
  const m = useMutationFn((id: string) => getDataAccess().moveInboundToOutlook(id));
  return { move: m.run, filing: m.pending, error: m.error };
}

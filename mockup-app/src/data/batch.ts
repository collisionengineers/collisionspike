/* ============================================================
   batch — PURE bulk-mutation runner + honest summary copy
   (reforge M-E1, spec IA §4). No React, no I/O of its own.

   runBatch() drives one async mutation per id through a small worker
   pool (default 4 concurrent) and NEVER throws on an item failure —
   every id lands in exactly one of {ok, failed}, so the caller can
   deselect the succeeded rows and keep the failed ones selected.

   summarizeBatch() turns a result into the honest toast wording:
   full success → "Held 6 cases"; partial → "Held 4 of 6 cases" +
   "2 failed and stay selected — retry when ready."
   ============================================================ */

export interface BatchFailure {
  id: string;
  error: Error;
}

export interface BatchResult {
  /** Ids whose mutation resolved. */
  ok: string[];
  /** Ids whose mutation rejected (with the normalized error). */
  failed: BatchFailure[];
}

/**
 * Run `fn` once per id with at most `concurrency` in flight (default 4).
 * Item failures are captured, never thrown; the returned arrays preserve
 * COMPLETION order (callers treat them as sets).
 */
export async function runBatch(
  ids: readonly string[],
  fn: (id: string) => Promise<unknown>,
  opts: { concurrency?: number } = {},
): Promise<BatchResult> {
  const concurrency = Math.max(1, Math.floor(opts.concurrency ?? 4));
  const ok: string[] = [];
  const failed: BatchFailure[] = [];
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < ids.length) {
      const id = ids[next];
      next += 1;
      try {
        await fn(id);
        ok.push(id);
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err : new Error(String(err)) });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()));
  return { ok, failed };
}

export interface BatchSummary {
  /** True when every item succeeded. */
  ok: boolean;
  /** Toast title: "Held 6 cases" / "Held 4 of 6 cases". */
  title: string;
  /** Toast body on partial failure: "2 failed and stay selected — retry when ready." */
  detail?: string;
}

/**
 * Honest toast wording for a batch result. `verb` is the past-tense action
 * word ("Held", "Released") — never claims more than actually succeeded.
 */
export function summarizeBatch(verb: string, result: BatchResult): BatchSummary {
  const total = result.ok.length + result.failed.length;
  const cases = (n: number) => `case${n === 1 ? '' : 's'}`;
  if (result.failed.length === 0) {
    return { ok: true, title: `${verb} ${total} ${cases(total)}` };
  }
  const f = result.failed.length;
  return {
    ok: false,
    title: `${verb} ${result.ok.length} of ${total} ${cases(total)}`,
    detail: `${f} failed and stay${f === 1 ? 's' : ''} selected — retry when ready.`,
  };
}

/** Immediate, generation-aware status settlement after evidence persistence. */
import type { InvocationContext } from '@azure/functions';
import { dataApi } from './data-api.js';

export async function settlePersistedStatusGeneration(
  caseId: string,
  result: { statusGeneration?: number },
  ctx: Pick<InvocationContext, 'warn'>,
): Promise<boolean> {
  const generation = result.statusGeneration;
  if (!Number.isSafeInteger(generation) || (generation ?? 0) < 1) return false;
  try {
    // The Data API row-locks, evaluates, and acknowledges this exact generation in one
    // transaction. A failure leaves requested > completed for the durable sweep to retry.
    const completion = await dataApi.evaluateStatus(caseId, generation!);
    return completion.completed === true;
  } catch (e) {
    ctx.warn(
      `[status-generation] case ${caseId} generation ${generation} remains pending: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return false;
  }
}

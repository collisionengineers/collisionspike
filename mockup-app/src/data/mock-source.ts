/* ============================================================
   Collision Engineers — Code App DATA SEAM: mock source.

   The PERMANENT offline harness. Implements `DataAccess` by delegating to the
   existing mock/* modules and wrapping the synchronous results in
   Promise.resolve, so behaviour is byte-identical to the pre-seam screens while
   the surface is already async (ready for the Dataverse swap).

   This is the DEFAULT data source the seam selector returns (see index.ts), so
   the offline build stays mock-backed and green with no SDK import.
   ============================================================ */

import {
  caseById as mockCaseById,
  casesForQueue as mockCasesForQueue,
  liveCounts as mockLiveCounts,
  throughput as mockThroughput,
  agingExceptions as mockAgingExceptions,
  queueCounts as mockQueueCounts,
  reasonCounts as mockReasonCounts,
  pipelineStages as mockPipelineStages,
  imagesForCase as mockImagesForCase,
  providers as mockProviders,
  providerByCode as mockProviderByCode,
  activity as mockActivity,
  activityForCase as mockActivityForCase,
  cases as mockCases,
} from '../mock';
import type { DataAccess } from './types';

/** Open (non-terminal) statuses — the set the duplicate "VRM twins" affordance uses. */
const TERMINAL = new Set(['eva_submitted', 'box_synced']);

/**
 * The mock-backed DataAccess. Every member resolves synchronously (no real
 * latency); callers `await` it exactly as they will the Dataverse source.
 */
export const mockDataAccess: DataAccess = {
  /* ----- Cases ----- */
  caseById: (id) => Promise.resolve(mockCaseById(id)),
  casesForQueue: (name, now) => Promise.resolve(mockCasesForQueue(name, now)),
  openVrmTwins: (vrm, excludeCaseId) =>
    Promise.resolve(
      mockCases.filter(
        (c) => c.vrm === vrm && !TERMINAL.has(c.status) && c.id !== excludeCaseId,
      ),
    ),

  /* ----- Evidence ----- */
  imagesForCase: (caseId) => Promise.resolve(mockImagesForCase(caseId)),

  /* ----- Providers ----- */
  providers: () => Promise.resolve(mockProviders),
  providerByCode: (code) => Promise.resolve(mockProviderByCode(code)),

  /* ----- Dashboard / queue aggregates ----- */
  liveCounts: (now) => Promise.resolve(mockLiveCounts(now)),
  throughput: (now) => Promise.resolve(mockThroughput(now)),
  agingExceptions: (now) => Promise.resolve(mockAgingExceptions(now)),
  queueCounts: (now) => Promise.resolve(mockQueueCounts(now)),
  reasonCounts: (now) => Promise.resolve(mockReasonCounts(now)),
  pipelineStages: () => Promise.resolve(mockPipelineStages()),

  /* ----- Activity feed ----- */
  recentActivity: () => Promise.resolve(mockActivity),
  activityForCase: (caseId) => Promise.resolve(mockActivityForCase(caseId)),
};

/** Factory form, for symmetry with `createDataverseDataAccess`. */
export function createMockDataAccess(): DataAccess {
  return mockDataAccess;
}

/* Barrel for the PURE domain layer — types + queue IA + intake helpers.

   NOTE: despite the directory name, this no longer exports any fabricated case
   data. The app renders only real Dataverse rows; the fabricated rows that used
   to live here were moved to src/__fixtures__ (test-only, tree-shaken out of
   dist) and the dashboard/queue AGGREGATES are computed by the data sources
   (src/data/dataverse-source.ts), not here. Screens import these pure helpers
   through the data seam ('../data'), which re-exports them. */
export * from './types';
export {
  QUEUES,
  queueByName,
  statusToQueue,
  REASON_LABELS,
  type QueueName,
  type QueueDef,
  type LiveCounts,
  type Throughput,
  type AgingRow,
  type AgingExceptions,
  type PipelineStage,
  type PipelineStageKey,
  type ReasonFacet,
} from './queues';
export {
  reasonVerb,
  outstandingText,
  dueInfo,
  suggestCasePo,
  type DueTone,
  type DueInfo,
  type CasePoSuggestion,
} from './intake';

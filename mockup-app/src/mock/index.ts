/** Barrel for all mock data + types. Screen agents import from '../mock'. */
export * from './types';
export { cases, caseById } from './cases';
export { providers, providerByCode } from './providers';
export { allEvidence, evidenceForCase, imagesForCase } from './evidence';
export { activity, activityForCase } from './activity';
export {
  QUEUES,
  queueByName,
  statusToQueue,
  casesForQueue,
  queueCounts,
  liveCounts,
  throughput,
  agingExceptions,
  pipelineStages,
  reasonCounts,
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

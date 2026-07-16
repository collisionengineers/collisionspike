/** queues — cohesive Data API module. */

import { QUEUES, caseToQueue, queueByName, type Case, type CaseStatus, type InboundCategory, type InboundSubtype, type QueueName } from '@cs/domain';

export function casePoSeqOfName(name: string, principal: string, yy: string): number {
  const prefix = `${principal}${yy}`.toUpperCase();
  const up = String(name ?? '').trim().toUpperCase();
  if (!up.startsWith(prefix)) return 0;
  const tail = up.slice(prefix.length);
  if (!/^[0-9]{3,}$/.test(tail)) return 0;
  return Number.parseInt(tail, 10);
}

export function maxCasePoSeqFromNames(
  names: ReadonlyArray<string>,
  principal: string,
  yy: string,
): number {
  let max = 0;
  for (const n of names) {
    const seq = casePoSeqOfName(n, principal, yy);
    if (seq > max) max = seq;
  }
  return max;
}

export function richTagToClassification(
  tag: string,
): { category: InboundCategory; subtype: InboundSubtype } | undefined {
  switch (tag) {
    case 'Inspection':
      return { category: 'receiving_work', subtype: 'existing_provider_instruction' };
    case 'New client work':
      return { category: 'receiving_work', subtype: 'new_client_work' };
    case 'Audit':
      return { category: 'receiving_work', subtype: 'existing_provider_audit' };
    case 'Diminution':
      return { category: 'receiving_work', subtype: 'existing_provider_diminution' };
    case 'Query':
      return { category: 'query', subtype: 'query_existing_work' };
    default:
      return undefined;
  }
}

export function parseDmy(s?: string): Date | undefined {
  if (!s) return undefined;
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isSameDay(a?: Date, b?: Date): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

export function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7; // Monday-anchored
  s.setDate(s.getDate() - dow);
  return s;
}

export function filterQueue(all: Case[], name: QueueName): Case[] {
  if (!queueByName(name)) return [];
  return all.filter((c) => caseToQueue(c) === name);
}

export function actionableCases(all: Case[]): Case[] {
  return [
    ...filterQueue(all, 'not-ready'),
    ...filterQueue(all, 'review'),
    ...filterQueue(all, 'held'),
  ];
}

export const TWIN_TERMINAL: ReadonlySet<CaseStatus> = new Set<CaseStatus>([
  'eva_submitted',
  'box_synced',
  'removed',
  'done', // delivered (TKT-094): a delivered case is never an open twin/merge target.
]);

void QUEUES;

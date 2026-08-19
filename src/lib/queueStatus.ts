import { QueueEntry } from '../types';

export type QueueStatusVariant = 'emerald' | 'amber' | 'sky' | 'violet' | 'blue' | 'gray';

/**
 * Single source of truth for what color bucket a queue entry falls into.
 * Priority mirrors the actual data model: `completedAt`/`startedAt` are
 * set independently of `status` (status stays 'Confirmed' while serving),
 * so they must be checked before falling back to the raw status switch.
 */
export function getQueueStatusVariant(
  entry: Pick<QueueEntry, 'status' | 'startedAt' | 'completedAt'>
): QueueStatusVariant {
  if (entry.completedAt || entry.status === 'Completed') return 'blue';
  if (entry.startedAt && !entry.completedAt) return 'violet';
  switch (entry.status) {
    case 'Confirmed': return 'emerald';
    case 'Estimated': return 'amber';
    case 'Pending Reply': return 'sky';
    default: return 'gray';
  }
}

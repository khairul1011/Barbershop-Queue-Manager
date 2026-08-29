import { describe, it, expect } from 'vitest';
import { getQueueStatusVariant } from './queueStatus';

describe('getQueueStatusVariant', () => {
  it('completedAt menang atas status apapun', () => {
    expect(getQueueStatusVariant({ status: 'Confirmed', startedAt: undefined, completedAt: '2026-01-01T00:00:00Z' })).toBe('blue');
  });

  it('startedAt tanpa completedAt = sedang dilayani (violet), meskipun status masih Confirmed', () => {
    expect(getQueueStatusVariant({ status: 'Confirmed', startedAt: '2026-01-01T00:00:00Z', completedAt: undefined })).toBe('violet');
  });

  it('fallback ke status mentah kalau belum mulai/selesai', () => {
    expect(getQueueStatusVariant({ status: 'Confirmed', startedAt: undefined, completedAt: undefined })).toBe('emerald');
    expect(getQueueStatusVariant({ status: 'Estimated', startedAt: undefined, completedAt: undefined })).toBe('amber');
    expect(getQueueStatusVariant({ status: 'Pending Reply', startedAt: undefined, completedAt: undefined })).toBe('sky');
  });
});

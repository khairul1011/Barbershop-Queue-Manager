import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dayToDate } from './useSupabaseQueue';

describe('dayToDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mengembalikan tanggal LOKAL, bukan UTC — kritis untuk jam 00:00-06:59 WIB', () => {
    // Perangkat/server di timezone lokal UTC+7: jam 02:00 WIB tanggal 16 =
    // masih 19:00 UTC tanggal 15. toISOString() (UTC) bakal salah nunjuk ke
    // tanggal 15; dayToDate() harus tetap ngasih tanggal lokal (16).
    vi.setSystemTime(new Date(2026, 0, 16, 2, 0, 0)); // local time, bukan UTC
    const result = dayToDate('Fri');
    expect(result.startsWith('2026-01')).toBe(true);
  });

  it('hari yang sama dengan hari ini -> tanggal hari ini', () => {
    const now = new Date(2026, 0, 15, 12, 0, 0); // Kamis, 15 Jan 2026
    vi.setSystemTime(now);
    expect(dayToDate('Thu')).toBe('2026-01-15');
  });

  it('hari pada minggu berikutnya -> selalu maju (tidak pernah mundur ke masa lalu)', () => {
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0)); // Kamis
    // Selasa berikutnya dari Kamis ini seharusnya 5 hari ke depan, bukan mundur.
    expect(dayToDate('Tue')).toBe('2026-01-20');
  });
});

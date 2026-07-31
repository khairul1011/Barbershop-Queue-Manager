import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { QueueEntry, Barber, Service, QueueStatus } from '../types';

type DayType = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
const DAYS: DayType[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Helper: dapatkan tanggal lokal (bukan UTC) sebagai string 'YYYY-MM-DD'.
 * Menghindari bug toISOString() yang selalu pakai UTC — berbahaya di timezone +07:00
 * pada jam 00:00–06:59 WIB karena tanggal UTC masih hari sebelumnya.
 */
function getLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Hitung scheduled_date dari day abbreviation relatif ke minggu ini
export function dayToDate(day: DayType): string {
  const today = new Date();
  const currentDayIdx = today.getDay(); // 0=Sun, 1=Mon, ...
  const targetIdx = DAYS.indexOf(day);
  const diff = ((targetIdx - currentDayIdx) + 7) % 7; // selalu 0–6, tidak pernah negatif
  const target = new Date(today);
  target.setDate(today.getDate() + diff);
  return getLocalDateString(target); // FIX Bug #3: pakai local date, bukan toISOString() (UTC)
}

function mapStatusToSupabase(status: QueueStatus): string {
  switch (status) {
    case 'Confirmed': return 'confirmed';
    case 'Estimated': return 'estimated';
    case 'Pending Reply': return 'pending_reply';
    case 'Completed': return 'completed';
    default: return 'estimated';
  }
}

function mapStatusFromSupabase(status: string): QueueStatus {
  switch (status) {
    case 'confirmed': return 'Confirmed';
    case 'estimated': return 'Estimated';
    case 'pending_reply': return 'Pending Reply';
    case 'completed': return 'Completed';
    default: return 'Estimated';
  }
}

export function useSupabaseQueue(barbers: Barber[], services: Service[]) {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [servingSessions, setServingSessions] = useState<Record<string, QueueEntry | null>>({});
  const [completedEntries, setCompletedEntries] = useState<QueueEntry[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchQueueEntries = useCallback(async () => {
    // Membutuhkan barbers dan services untuk pemetaan, jadi tunggu sampai tidak kosong
    // Tapi bisa jadi memang kosong di awal jika belum ada.
    try {
      setLoading(true);
      setError(null);
      
      const today = new Date();
      const from = new Date(today);
      from.setDate(today.getDate() - 7);
      const to = new Date(today);
      to.setDate(today.getDate() + 7);
      
      // FIX Bug #3: pakai getLocalDateString agar rentang fetch berbasis tanggal LOKAL (WIB)
      // bukan toISOString() yang UTC-based — penting agar entry hari ini tidak keluar rentang
      const fromStr = getLocalDateString(from);
      const toStr   = getLocalDateString(to);
      
      const { data, error: supabaseError } = await supabase
        .from('queue_entries')
        .select('*')
        .gte('scheduled_date', fromStr)
        .lte('scheduled_date', toStr)
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: true }); // Penting untuk kalkulasi posisi antrian
        
      if (supabaseError) throw supabaseError;
      
      // Temporary groups to calculate queue numbers for 'Estimated' status
      const estimatedCountPerDayBarber: Record<string, number> = {};

      const allEntries: QueueEntry[] = (data || []).map(row => {
        const barberObj = barbers.find(b => b.id === row.barber_id);
        const barberName = barberObj ? barberObj.name : 'Unknown Barber';
        
        const serviceObj = services.find(s => s.id === row.service_id);
        const serviceName = serviceObj ? serviceObj.name : 'Unknown Service';
        const durationMinutes = serviceObj ? serviceObj.duration : 30;

        const dateObj = new Date(row.scheduled_date + 'T00:00:00'); // force local midnight
        const dayAbbr = dateObj.toLocaleDateString('en-US', { weekday: 'short' }) as DayType;

        let timeRange = '';
        if (row.scheduled_time) {
            const startH = parseInt(row.scheduled_time.split(':')[0]);
            const startM = parseInt(row.scheduled_time.split(':')[1]);
            const startTotalMinutes = startH * 60 + startM;
            const endTotalMinutes = startTotalMinutes + durationMinutes;
            const endH = Math.floor(endTotalMinutes / 60) % 24;
            const endM = endTotalMinutes % 60;
            
            const startStr = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;
            const endStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
            timeRange = `~${startStr} - ${endStr}`;
        } else if (row.started_at) {
            const d = new Date(row.started_at);
            const startH = d.getHours();
            const startM = d.getMinutes();
            const startTotalMinutes = startH * 60 + startM;
            const endTotalMinutes = startTotalMinutes + durationMinutes;
            const endH = Math.floor(endTotalMinutes / 60) % 24;
            const endM = endTotalMinutes % 60;
            
            const startStr = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;
            const endStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
            timeRange = `~${startStr} - ${endStr}`;
        } else {
            timeRange = '~--:-- - --:--';
        }

        const frontendStatus = mapStatusFromSupabase(row.status);
        let queueNumber: number | undefined = undefined;

        if (frontendStatus === 'Estimated') {
            const key = `${row.scheduled_date}_${row.barber_id}`;
            if (!estimatedCountPerDayBarber[key]) estimatedCountPerDayBarber[key] = 0;
            estimatedCountPerDayBarber[key]++;
            queueNumber = estimatedCountPerDayBarber[key];
        }

        return {
          id: row.id,
          customerName: row.customer_name,
          status: frontendStatus,
          timeRange,
          queueNumber,
          day: dayAbbr,
          scheduledDate: row.scheduled_date,
          service: serviceName,
          barber: barberName,
          phone: row.phone || '',
          durationMinutes,
          startedAt: row.started_at || undefined,
          completedAt: row.completed_at || undefined,
        };
      });

      // Partisi data - FIX Bug #1: gunakan `data` array asli (bukan private field di QueueEntry)
      // agar nilai started_at/completed_at/barber_id dari DB tidak ter-strip oleh TypeScript.
      const newQueue: QueueEntry[] = [];
      const newServingSessions: Record<string, QueueEntry | null> = {};
      const newCompletedEntries: QueueEntry[] = [];

      (data || []).forEach((row, idx) => {
        const entry = allEntries[idx];
        if (!entry) return;

        if (row.completed_at) {
          newCompletedEntries.push(entry);
        } else if (row.started_at) {
          newServingSessions[row.barber_id] = entry;
        } else {
          newQueue.push(entry);
        }
      });

      // Diagnostik sementara: log jumlah row dari Supabase vs hasil partisi
      console.log(`[DIAG] fetch: ${(data||[]).length} rows → queue:${newQueue.length}, serving:${Object.keys(newServingSessions).length}, completed:${newCompletedEntries.length}`);

      setQueue(newQueue);
      setServingSessions(newServingSessions);
      setCompletedEntries(newCompletedEntries);

    } catch (err) {
      console.error('Error fetching queue entries:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [barbers, services]);

  useEffect(() => {
    fetchQueueEntries();
  }, [fetchQueueEntries]);

  // CREATE
  const addQueueEntry = async (entry: Partial<QueueEntry> & { barberId: string, serviceId: string, scheduledTime?: string }) => {
    try {
      const scheduled_date = dayToDate(entry.day as DayType);
      const dbStatus = mapStatusToSupabase(entry.status || 'Estimated');

      // --- DIAGNOSTIK SEMENTARA: log payload sebelum INSERT ---
      const payload = {
        customer_name: entry.customerName,
        phone: entry.phone,
        status: dbStatus,
        scheduled_date,
        scheduled_time: entry.scheduledTime || null,
        barber_id: entry.barberId,
        service_id: entry.serviceId
      };
      console.log('[DIAG] addQueueEntry payload:', JSON.stringify(payload, null, 2));
      // --- AKHIR DIAGNOSTIK ---
      
      const { error: supabaseError } = await supabase
        .from('queue_entries')
        .insert([payload])
        .select(); // Tambahkan .select() agar Supabase merespons dengan JSON (mencegah bug parser)

      if (supabaseError) {
        throw supabaseError;
      }
      
      console.log('[DIAG] Insert berhasil! Memanggil fetchQueueEntries...');
      
      // Pisahkan penanganan error fetch agar tidak menggagalkan insert yang sudah sukses
      try {
        await fetchQueueEntries();
        console.log('[DIAG] fetchQueueEntries berhasil dipanggil setelah insert.');
      } catch (fetchErr) {
        console.error('[DIAG] fetchQueueEntries GAGAL setelah insert sukses:', fetchErr);
        // Kita JANGAN throw fetchErr agar toast sukses tetap muncul (karena data sudah masuk DB)
      }
      
    } catch (err) {
      console.error('[DIAG] addQueueEntry caught error (full):', err);
      throw err;
    }
  };

  // UPDATE: Status only
  const updateQueueEntryStatus = async (id: string, newStatus: QueueStatus, scheduledTime?: string) => {
    try {
      const dbStatus = mapStatusToSupabase(newStatus);
      const payload: any = { status: dbStatus };
      if (scheduledTime) {
        payload.scheduled_time = scheduledTime;
      }

      const { error: supabaseError } = await supabase
        .from('queue_entries')
        .update(payload)
        .eq('id', id);

      if (supabaseError) throw supabaseError;
      await fetchQueueEntries();
    } catch (err) {
      console.error('Error updating queue status:', err);
      throw err;
    }
  };

  // SERVE NOW (Update started_at)
  const serveQueueEntry = async (id: string, barberId: string) => {
    try {
      // Pastikan dari data lokal kursi kosong (sebagai guard pertama)
      if (servingSessions[barberId]) {
         throw new Error('SEAT_OCCUPIED_LOCAL');
      }

      const { error: supabaseError } = await supabase
        .from('queue_entries')
        .update({ started_at: new Date().toISOString() })
        .eq('id', id);

      if (supabaseError) {
         if (supabaseError.code === '23505') {
            throw new Error('SEAT_OCCUPIED_DB');
         }
         throw supabaseError;
      }
      
      await fetchQueueEntries();
    } catch (err) {
      console.error('Error serving queue entry:', err);
      throw err;
    }
  };

  // QUICK WALK-IN
  const startQuickWalkIn = async (barberId: string) => {
    try {
      const defaultService = services.find(s => s.name.toLowerCase().includes('potong rambut')) || services[0];
      const serviceId = defaultService ? defaultService.id : '';
      
      const today = new Date();
      const scheduled_date = getLocalDateString(today);

      const payload = {
        customer_name: 'TBD', // Placeholder
        phone: '',
        status: 'serving',
        scheduled_date,
        scheduled_time: null,
        barber_id: barberId,
        service_id: serviceId,
        started_at: new Date().toISOString()
      };

      const { error: supabaseError } = await supabase
        .from('queue_entries')
        .insert([payload])
        .select();

      if (supabaseError) throw supabaseError;
      
      await fetchQueueEntries();
    } catch (err) {
      console.error('Error starting quick walk-in:', err);
      throw err;
    }
  };

  // COMPLETE SESSION
  const completeServingSession = async (barberId: string, serviceId?: string, customerName?: string) => {
    try {
      const session = servingSessions[barberId];
      if (!session) return; // tidak ada yg dikerjakan

      const updatePayload: any = {
        completed_at: new Date().toISOString(),
        status: 'completed'
      };

      if (serviceId) updatePayload.service_id = serviceId;
      if (customerName) updatePayload.customer_name = customerName;

      const { error: supabaseError } = await supabase
        .from('queue_entries')
        .update(updatePayload)
        .eq('id', session.id);

      if (supabaseError) throw supabaseError;
      await fetchQueueEntries();
    } catch (err) {
      console.error('Error completing session:', err);
      throw err;
    }
  };

  // DELETE
  const removeQueueEntry = async (id: string) => {
    try {
      const { error: supabaseError } = await supabase
        .from('queue_entries')
        .delete()
        .eq('id', id);

      if (supabaseError) throw supabaseError;
      await fetchQueueEntries();
    } catch (err) {
      console.error('Error deleting queue entry:', err);
      throw err;
    }
  };

  return {
    queue,
    servingSessions,
    completedEntries,
    loading,
    error,
    addQueueEntry,
    updateQueueEntryStatus,
    serveQueueEntry,
    completeServingSession,
    removeQueueEntry,
    refreshQueue: fetchQueueEntries,
    startQuickWalkIn
  };
}

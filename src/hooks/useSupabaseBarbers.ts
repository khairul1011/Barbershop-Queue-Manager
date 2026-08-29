import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Barber } from '../types';

// `enabled` — fetch tidak dilakukan sampai status login (session) dipastikan,
// dan hanya dilakukan apabila session benar-benar ada. RLS pada tabel ini
// bersifat authenticated-only, sehingga fetch sebelum session ada hanya akan
// menghasilkan request yang sia-sia (hasil kosong/diblokir). Sebelumnya, fetch
// selalu dijalankan saat mount (sebelum diketahui ada session atau tidak) dan
// tidak pernah di-refetch setelah pengguna benar-benar login — lihat App.tsx.
export function useSupabaseBarbers(enabled: boolean) {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchBarbers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error: supabaseError } = await supabase
        .from('barbers')
        .select('*')
        .eq('archived', false)
        .order('name');
        
      if (supabaseError) throw supabaseError;
      
      const formattedBarbers: Barber[] = (data || []).map(row => ({
        id: row.id,
        name: row.name,
        status: row.status as 'active' | 'break' | 'off',
        specialty: row.specialization || '',
        avatar: row.photo_url || ''
      }));
      
      setBarbers(formattedBarbers);
    } catch (err) {
      console.error('Error fetching barbers:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchBarbers();
  }, [enabled, fetchBarbers]);

  const addBarber = async (newBarber: Omit<Barber, 'id'>) => {
    try {
      setError(null);
      const { data, error: supabaseError } = await supabase
        .from('barbers')
        .insert([{
          name: newBarber.name,
          status: newBarber.status,
          specialization: newBarber.specialty,
          photo_url: newBarber.avatar
        }])
        .select()
        .single();
        
      if (supabaseError) throw supabaseError;
      
      const addedBarber: Barber = {
        id: data.id,
        name: data.name,
        status: data.status as 'active' | 'break' | 'off',
        specialty: data.specialization || '',
        avatar: data.photo_url || ''
      };
      
      setBarbers(prev => [...prev, addedBarber]);
    } catch (err) {
      console.error('Error adding barber:', err);
      throw err; // Re-throw to be handled by caller
    }
  };

  const editBarber = async (id: string, updated: Partial<Barber>) => {
    try {
      setError(null);
      
      const updatePayload: any = {};
      if (updated.name !== undefined) updatePayload.name = updated.name;
      if (updated.status !== undefined) updatePayload.status = updated.status;
      if (updated.specialty !== undefined) updatePayload.specialization = updated.specialty;
      if (updated.avatar !== undefined) updatePayload.photo_url = updated.avatar;
      
      const { data, error: supabaseError } = await supabase
        .from('barbers')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();
        
      if (supabaseError) throw supabaseError;
      
      const updatedBarber: Barber = {
        id: data.id,
        name: data.name,
        status: data.status as 'active' | 'break' | 'off',
        specialty: data.specialization || '',
        avatar: data.photo_url || ''
      };
      
      setBarbers(prev => prev.map(b => b.id === id ? updatedBarber : b));
    } catch (err) {
      console.error('Error editing barber:', err);
      throw err;
    }
  };

  // Soft delete: kapster diarsipkan (archived = true), bukan dihapus secara
  // permanen dari database. Kapster yang sudah memiliki riwayat pada queue_entries
  // tidak dapat di-hard-delete (foreign key constraint) tanpa merusak riwayat
  // antrean lama — pendekatan soft delete ini secara konsisten menghindari
  // masalah tersebut tanpa perlu memeriksa terlebih dahulu apakah kapster
  // yang bersangkutan memiliki riwayat atau tidak.
  const removeBarber = async (id: string) => {
    try {
      setError(null);
      const { error: supabaseError } = await supabase
        .from('barbers')
        .update({ archived: true })
        .eq('id', id);

      if (supabaseError) throw supabaseError;

      setBarbers(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      console.error('Error removing barber:', err);
      throw err;
    }
  };

  const updateBarberStatus = async (id: string, status: 'active' | 'break' | 'off') => {
    try {
      setError(null);
      const { data, error: supabaseError } = await supabase
        .from('barbers')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
        
      if (supabaseError) throw supabaseError;
      
      setBarbers(prev => prev.map(b => b.id === id ? { ...b, status: data.status as 'active' | 'break' | 'off' } : b));
    } catch (err) {
      console.error('Error updating barber status:', err);
      throw err;
    }
  };

  return {
    barbers,
    loading,
    error,
    addBarber,
    editBarber,
    removeBarber,
    updateBarberStatus,
    refreshBarbers: fetchBarbers
  };
}

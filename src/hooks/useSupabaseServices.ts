import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Service } from '../types';

// `enabled` — lihat catatan yang sama di useSupabaseBarbers.ts.
export function useSupabaseServices(enabled: boolean) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchServices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error: supabaseError } = await supabase
        .from('services')
        .select('*')
        .eq('archived', false)
        .order('name');
        
      if (supabaseError) throw supabaseError;
      
      const formattedServices: Service[] = (data || []).map(row => ({
        id: row.id,
        name: row.name,
        price: Number(row.price),
        duration: row.duration_minutes
      }));
      
      setServices(formattedServices);
    } catch (err) {
      console.error('Error fetching services:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchServices();
  }, [enabled, fetchServices]);

  const addService = async (newSvc: Omit<Service, 'id'>) => {
    try {
      setError(null);
      const { data, error: supabaseError } = await supabase
        .from('services')
        .insert([{
          name: newSvc.name,
          price: newSvc.price,
          duration_minutes: newSvc.duration
        }])
        .select()
        .single();
        
      if (supabaseError) throw supabaseError;
      
      const addedService: Service = {
        id: data.id,
        name: data.name,
        price: Number(data.price),
        duration: data.duration_minutes
      };
      
      setServices(prev => [...prev, addedService]);
    } catch (err) {
      console.error('Error adding service:', err);
      throw err; // Re-throw to be handled by caller
    }
  };

  const updateService = async (id: string, updates: Partial<Omit<Service, 'id'>>) => {
    try {
      setError(null);
      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.price !== undefined) payload.price = updates.price;
      if (updates.duration !== undefined) payload.duration_minutes = updates.duration;

      const { error: supabaseError } = await supabase
        .from('services')
        .update(payload)
        .eq('id', id);

      if (supabaseError) throw supabaseError;

      setServices(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    } catch (err) {
      console.error('Error updating service:', err);
      throw err; // Re-throw to be handled by caller
    }
  };

  // Soft delete: layanan diarsipkan (archived = true), bukan dihapus
  // permanen — layanan yang udah pernah dipakai di queue_entries nggak bisa
  // di-hard-delete (foreign key constraint) tanpa merusak riwayat antrean lama.
  const removeService = async (id: string) => {
    try {
      setError(null);
      const { error: supabaseError } = await supabase
        .from('services')
        .update({ archived: true })
        .eq('id', id);

      if (supabaseError) throw supabaseError;

      setServices(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('Error removing service:', err);
      throw err; // Re-throw to be handled by caller
    }
  };

  return {
    services,
    loading,
    error,
    addService,
    updateService,
    removeService,
    refreshServices: fetchServices
  };
}

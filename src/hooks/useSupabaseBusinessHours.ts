import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useSupabaseBusinessHours() {
  const [businessHours, setBusinessHours] = useState<{ openHour: number; closeHour: number; shopName: string; logoUrl: string | null }>({ openHour: 9, closeHour: 20, shopName: 'BarberFlow', logoUrl: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchBusinessHours = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: supabaseError } = await supabase
        .from('business_hours')
        .select('*')
        .limit(1)
        .single();

      if (supabaseError && supabaseError.code !== 'PGRST116') { // Ignore if not found (0 rows)
        throw supabaseError;
      }

      if (data) {
        setBusinessHours({
          openHour: data.open_hour,
          closeHour: data.close_hour,
          shopName: data.shop_name || 'BarberFlow',
          logoUrl: data.logo_url || null
        });
      }
    } catch (err) {
      console.error('Error fetching business hours:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBusinessHours();

    const channel = supabase
      .channel('business_hours_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_hours' }, () => {
        fetchBusinessHours();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchBusinessHours]);

  const updateBusinessHours = async (openHour: number, closeHour: number) => {
    try {
      setError(null);

      const { error: supabaseError } = await supabase
        .from('business_hours')
        .update({ open_hour: openHour, close_hour: closeHour })
        .eq('id', 1);

      if (supabaseError) throw supabaseError;

      await fetchBusinessHours(); // Refresh data
    } catch (err) {
      console.error('Error updating business hours:', err);
      throw err; // Re-throw to be handled by caller
    }
  };

  const updateShopProfile = async (shopName: string, logoUrl: string | null) => {
    try {
      setError(null);

      const { error: supabaseError } = await supabase
        .from('business_hours')
        .update({ shop_name: shopName, logo_url: logoUrl })
        .eq('id', 1);

      if (supabaseError) throw supabaseError;

      await fetchBusinessHours(); // Refresh data
    } catch (err) {
      console.error('Error updating shop profile:', err);
      throw err; // Re-throw to be handled by caller
    }
  };

  return {
    businessHours,
    loading,
    error,
    updateBusinessHours,
    updateShopProfile,
    refreshBusinessHours: fetchBusinessHours
  };
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { WhatsAppRequest, RequestStatus } from '../types';

// `enabled` — lihat catatan yang sama di useSupabaseBarbers.ts. Realtime
// subscription juga ikut ditahan, bukan cuma fetch awal -- nggak ada
// gunanya subscribe sebelum authenticated.
export function useSupabaseRequests(enabled: boolean) {
  const [requests, setRequests] = useState<WhatsAppRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error: supabaseError } = await supabase
        .from('whatsapp_requests')
        .select('*')
        .order('received_at', { ascending: false });
        
      if (supabaseError) throw supabaseError;
      
      const formattedRequests: WhatsAppRequest[] = (data || []).map(row => {
        const parts = (row.extracted_service || '').split('|BARBER:');
        return {
          id: row.id,
          senderName: row.sender_name,
          senderPhone: row.sender_phone,
          message: row.raw_message,
          extractedDay: row.extracted_day as any,
          extractedTime: row.extracted_time,
          extractedService: parts[0],
          extractedBarber: parts[1] || null,
          status: row.status as RequestStatus,
          receivedTime: row.received_at,
          paymentStatus: row.payment_status,
          dpAmount: row.dp_amount,
          paymentExpiresAt: row.payment_expires_at
        };
      });
      
      setRequests(formattedRequests);
    } catch (err) {
      console.error('Error fetching requests:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchRequests();

    const channel = supabase
      .channel('whatsapp_requests_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_requests' }, () => {
        fetchRequests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, fetchRequests]);

  const updateRequestStatus = async (id: string, status: RequestStatus) => {
    try {
      setError(null);
      const { error: supabaseError } = await supabase
        .from('whatsapp_requests')
        .update({ status })
        .eq('id', id);
        
      if (supabaseError) throw supabaseError;
      
      await fetchRequests(); // Refresh data
    } catch (err) {
      console.error('Error updating request status:', err);
      throw err; // Re-throw to be handled by caller
    }
  };

  const approveRequest = (id: string) => updateRequestStatus(id, 'approved');
  const rejectRequest = (id: string) => updateRequestStatus(id, 'rejected');

  // Persist an edit (day/time/service/name) made before approval — the WA
  // confirmation the backend sends on approve reads straight from this row,
  // so an edit that only lives in local state would send the customer a
  // message with the pre-edit values.
  const updateRequestDetails = async (id: string, updates: Partial<WhatsAppRequest>) => {
    try {
      setError(null);
      const current = requests.find(r => r.id === id);
      const merged = { ...current, ...updates };

      const payload: Record<string, string> = {};
      if (updates.senderName !== undefined) payload.sender_name = merged.senderName as string;
      if (updates.extractedDay !== undefined) payload.extracted_day = merged.extractedDay as string;
      if (updates.extractedTime !== undefined) payload.extracted_time = merged.extractedTime as string;
      if (updates.extractedService !== undefined) {
        const barberSuffix = merged.extractedBarber ? `|BARBER:${merged.extractedBarber}` : '';
        payload.extracted_service = `${merged.extractedService}${barberSuffix}`;
      }

      if (Object.keys(payload).length === 0) return;

      const { error: supabaseError } = await supabase
        .from('whatsapp_requests')
        .update(payload)
        .eq('id', id);

      if (supabaseError) throw supabaseError;

      await fetchRequests();
    } catch (err) {
      console.error('Error updating request details:', err);
      throw err;
    }
  };

  return {
    requests,
    loading,
    error,
    approveRequest,
    rejectRequest,
    updateRequestDetails,
    refreshRequests: fetchRequests
  };
}

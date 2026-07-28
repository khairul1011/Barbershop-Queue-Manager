import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { WhatsAppRequest, RequestStatus } from '../types';

export function useSupabaseRequests() {
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
      
      const formattedRequests: WhatsAppRequest[] = (data || []).map(row => ({
        id: row.id,
        senderName: row.sender_name,
        senderPhone: row.sender_phone,
        message: row.raw_message,
        extractedDay: row.extracted_day as any,
        extractedTime: row.extracted_time,
        extractedService: row.extracted_service,
        status: row.status as RequestStatus,
        receivedTime: row.received_at
      }));
      
      setRequests(formattedRequests);
    } catch (err) {
      console.error('Error fetching requests:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

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

  return {
    requests,
    setRequests,
    loading,
    error,
    approveRequest,
    rejectRequest,
    refreshRequests: fetchRequests
  };
}

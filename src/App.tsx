import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabaseClient';
import Login from './components/Login';
import { useSupabaseServices } from './hooks/useSupabaseServices';
import { useSupabaseBarbers } from './hooks/useSupabaseBarbers';
import { useSupabaseQueue } from './hooks/useSupabaseQueue';
import { useSupabaseRequests } from './hooks/useSupabaseRequests';
import { useSupabaseBusinessHours } from './hooks/useSupabaseBusinessHours';
import AppSidebar from './components/Sidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from './components/ui/sidebar';
import { Popover, PopoverTrigger, PopoverContent } from './components/ui/popover';
import Overview from './components/Overview';
import Schedule from './components/Schedule';
import Requests from './components/Requests';
import QueueList from './components/QueueList';
import SettingsView from './components/Settings';
import HistoryTab from './components/History.tsx';
import LanguageSwitcher from './components/LanguageSwitcher';
import ThemeCustomizer from './components/ThemeCustomizer';
import { useThemeSettings } from './theme-settings';
import { cn } from './lib/utils';
import { DotPattern } from './components/ui/dot-pattern';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel
} from './components/ui/alert-dialog';
import { useTranslation } from './i18n';
import { QueueEntry, WhatsAppRequest, Barber, Service, QueueStatus } from './types';
import {
  Search,
  Clock,
  Bell,
  CheckCircle,
  MessageSquare,
  X,
  AlertCircle,
  XCircle,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const { t } = useTranslation();
  const { contentLayout, sidebarVariant, sidebarMode } = useThemeSettings();

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState('overview');

  // Auth gate — Phase 1: UI-only gate via Supabase Auth (shared staff login).
  // Data access (RLS) is unchanged in this phase; see PROJECT.md for the
  // planned follow-up that moves the WhatsApp bot to a service_role key and
  // tightens RLS to `authenticated`-only.
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Gerbang untuk semua hook data di bawah yang tabelnya bersifat authenticated-only
  // melalui RLS (whatsapp_requests, barbers, services, queue_entries) — bernilai
  // `true` hanya setelah authLoading selesai DAN session benar-benar ada. Sebelumnya,
  // hook-hook ini melakukan fetch langsung saat mount tanpa menunggu kondisi ini,
  // sehingga sering terjadi SEBELUM pengguna login (hook tetap berjalan meskipun yang
  // dirender masih <Login/>, karena React tetap memanggil seluruh hook di atas
  // terlebih dahulu sebelum mencapai return bersyarat di bawah) — fetch tersebut
  // menghasilkan data kosong/diblokir RLS, dan tidak pernah di-refetch secara otomatis
  // setelah pengguna benar-benar login, sehingga dashboard tampak kosong hingga
  // dilakukan reload manual. `business_hours` SENGAJA dikecualikan dari gerbang ini —
  // tabel tersebut memiliki policy `anon` terpisah karena nama toko/logo harus dapat
  // dibaca pada halaman Login sebelum autentikasi.
  const dataReady = !authLoading && !!session;

  // Core App States
  const { requests, loading: requestsLoading, error: requestsError, approveRequest, rejectRequest, updateRequestDetails } = useSupabaseRequests(dataReady);
  const { barbers, loading: barbersLoading, error: barbersError, addBarber, editBarber, removeBarber, updateBarberStatus } = useSupabaseBarbers(dataReady);
  const { services, loading: servicesLoading, error: servicesError, addService, updateService, removeService } = useSupabaseServices(dataReady);
  const { queue, servingSessions, completedEntries, error: queueError, addQueueEntry, updateQueueEntryStatus, serveQueueEntry, completeServingSession, removeQueueEntry, startQuickWalkIn } = useSupabaseQueue(barbers, services, dataReady);
  const { businessHours, updateBusinessHours, updateShopProfile } = useSupabaseBusinessHours();

  // Stats Counters (derived from Supabase data)

  // Custom Toast System
  interface Toast {
    id: string;
    message: string;
    type: 'success' | 'info' | 'whatsapp' | 'error';
    title?: string;
  }
  const [toasts, setToasts] = useState<Toast[]>([]);

  const triggerToast = (message: string, type: 'success' | 'info' | 'whatsapp' | 'error' = 'success', title?: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setToasts(prev => [...prev, { id, message, type, title }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  // Confirmation Dialog System (pengganti window.confirm() bawaan browser,
  // biar konsisten sama tema gelap aplikasi alih-alih dialog native OS)
  interface ConfirmRequest {
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  }
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  const requestConfirm = (message: string, onConfirm: () => void, confirmLabel: string = 'Ya, Lanjutkan') => {
    setConfirmRequest({ message, onConfirm, confirmLabel });
  };

  // Live clock state
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Header search: ⌘K / Ctrl+K focuses the field so the kbd hint isn't decorative
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  // Daily reset is no longer needed since stats are calculated directly from Supabase completed_at timestamps

  // Supabase Fetch Error Handling
  useEffect(() => {
    if (servicesError) {
      triggerToast('Gagal memuat data layanan. Periksa koneksi internet.', 'error', 'Connection Error');
    }
    if (barbersError) {
      triggerToast('Gagal memuat data kapster. Periksa koneksi internet.', 'error', 'Connection Error');
    }
    if (queueError) {
      triggerToast('Gagal memuat antrean dari server. Periksa koneksi internet.', 'error', 'Connection Error');
    }
  }, [servicesError, barbersError, queueError]);

  const todayKey = useMemo(() => {
    return currentTime.toLocaleDateString('en-US', { weekday: 'short' }) as
      'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  }, [currentTime]);

  // Derived Stats
  const completedCount = useMemo(() => {
    return completedEntries.filter(e => e.day === todayKey).length;
  }, [completedEntries, todayKey]);

  const revenueToday = useMemo(() => {
    return completedEntries
      .filter(e => e.day === todayKey)
      .reduce((sum, entry) => {
        const price = services.find(s => s.name === entry.service)?.price || 0;
        return sum + price;
      }, 0);
  }, [completedEntries, services, todayKey]);

  // Helper: Calculate end time based on duration
  const calculateEndTime = (startTimeStr: string, serviceName: string) => {
    const matchedService = services.find(s => s.name === serviceName);
    const duration = matchedService ? matchedService.duration : 45;

    const [hours, minutes] = startTimeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
      return '14:45'; // fallback
    }
    const startTotalMinutes = hours * 60 + minutes;
    const endTotalMinutes = startTotalMinutes + duration;

    const endHours = Math.floor(endTotalMinutes / 60) % 24;
    const endMinutes = endTotalMinutes % 60;

    return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
  };

  // Callback: Complete session
  const handleCompleteSession = async (barberId: string, actualDurationMinutes: number, serviceId?: string, customerName?: string, paymentMethod?: 'cash' | 'qris') => {
    const session = servingSessions[barberId];
    if (!session) return;

    try {
      await completeServingSession(barberId, serviceId, customerName, paymentMethod);
      
      // Same lookup key + fallback as `revenueToday` below, so this toast's
      // number can never disagree with the dashboard once it recomputes.
      const priceOfService = services.find(s => s.name === session.service)?.price || 0;

      // Toast
      triggerToast(
        `Pangkas selesai! ${session.customerName} - layanan ${session.service} selesai, Rp ${priceOfService.toLocaleString()} terkumpul.`,
        'success',
        'Session Completed'
      );
    } catch {
      triggerToast('Gagal menyelesaikan sesi pangkas.', 'error', 'Completion Failed');
    }
  };

  // Helper to check double-booking (used by both Booking and Walk-In)
  const checkOverlap = (targetDay: string, targetTimeRange: string, targetBarber: string): boolean => {
    const parseMinutes = (timeStr: string) => {
      const match = timeStr.replace('~', '').trim().match(/^(\d{1,2}):(\d{2})/);
      if (!match) return 0;
      return parseInt(match[1]) * 60 + parseInt(match[2]);
    };
    
    const [startStr, endStr] = targetTimeRange.split('-');
    if (!startStr || !endStr) return false;
    const newStart = parseMinutes(startStr);
    const newEnd = parseMinutes(endStr);

    return queue.some(entry => {
      if (entry.day !== targetDay || entry.barber !== targetBarber) return false;
      // Estimated entries don't have hard slots
      if (entry.status === 'Estimated') return false; 
      
      const [eStartStr, eEndStr] = entry.timeRange.split('-');
      if (!eStartStr || !eEndStr) return false;
      const entryStart = parseMinutes(eStartStr);
      const entryEnd = parseMinutes(eEndStr);
      
      // True Overlap Condition
      return (newStart < entryEnd) && (newEnd > entryStart);
    });
  };

  // Callback: Add manual Walk-In
  const handleAddWalkIn = async (name: string, serviceName: string, barberName: string) => {
    const todayQueue = queue.filter(q => q.day === todayKey);
    const queueNumber = todayQueue.length + 1;

    // Calculate simulated dynamic estimate time
    let startMinutes = businessHours.openHour * 60; // default to openHour
    if (todayQueue.length > 0) {
      // parse last item time
      const lastItem = todayQueue[todayQueue.length - 1];
      const match = lastItem.timeRange.match(/(\d+):(\d+)\s*$/);
      if (match) {
        startMinutes = Number(match[1]) * 60 + Number(match[2]) + 15; // 15 mins gap
      }
    } else {
      // Estimate based on barber's current session if any
      const barber = barbers.find(b => b.name === barberName);
      if (barber && servingSessions[barber.id]) {
        startMinutes = 14 * 60 + 45; // arbitrary fallback based on previous mock
      }
    }

    const startH = Math.floor(startMinutes / 60) % 24;
    const startM = startMinutes % 60;
    const startTimeStr = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;
    const endTimeStr = calculateEndTime(startTimeStr, serviceName);
    const timeRange = `~${startTimeStr} - ${endTimeStr}`;

    if (checkOverlap(todayKey, timeRange, barberName)) {
      triggerToast(
        `Gagal: jadwal bentrok dengan booking lain untuk ${barberName}.`,
        'info',
        'Double Booking Prevented'
      );
      return;
    }

    try {
      const bId = barbers.find(b => b.name === barberName)?.id || '';
      const sId = services.find(s => s.name === serviceName)?.id || '';
      if (!bId || !sId) throw new Error("Barber or Service not found locally");

      await addQueueEntry({
        customerName: name,
        status: 'Estimated',
        day: todayKey,
        barberId: bId,
        serviceId: sId,
        phone: '+62 Walk-In'
      });
      
      triggerToast(
        `Walk-in ditambahkan: ${name} (No. ${queueNumber}) masuk ke antrean kursi ${barberName}.`,
        'success',
        'Walk-In Added'
      );
    } catch {
      triggerToast('Gagal menambah antrean walk-in.', 'error', 'Save Failed');
    }
  };

  const indonesianToEnglishDay = (dayStr: string): string => {
    if (!dayStr) return '';
    const d = dayStr.toLowerCase();
    const today = new Date();
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    if (d.includes('hari ini')) return DAYS[today.getDay()];
    if (d.includes('besok')) {
      const tmr = new Date();
      tmr.setDate(today.getDate() + 1);
      return DAYS[tmr.getDay()];
    }
    if (d.includes('lusa')) {
      const lusa = new Date();
      lusa.setDate(today.getDate() + 2);
      return DAYS[lusa.getDay()];
    }
    if (d.includes('senin')) return 'Mon';
    if (d.includes('selasa')) return 'Tue';
    if (d.includes('rabu')) return 'Wed';
    if (d.includes('kamis')) return 'Thu';
    if (d.includes('jumat')) return 'Fri';
    if (d.includes('sabtu')) return 'Sat';
    if (d.includes('minggu')) return 'Sun';
    
    return dayStr; // fallback
  };

  // `matched: false` means we couldn't find a confident (exact/partial) match
  // against what was extracted from the WhatsApp message, and silently fell
  // back to a default guess — the caller should warn staff when this happens
  // rather than let a wrong-guess booking go through unnoticed.
  const fuzzyMatchService = (extractedService: string, availableServices: Service[]): { id: string; matched: boolean } => {
    const fallbackId = availableServices.length > 0 ? availableServices[0].id : '';
    if (!extractedService) return { id: fallbackId, matched: false };
    const s = extractedService.toLowerCase();
    const exactMatch = availableServices.find(srv => srv.name.toLowerCase() === s);
    if (exactMatch) return { id: exactMatch.id, matched: true };

    const partialMatch = availableServices.find(srv =>
      srv.name.toLowerCase().includes(s) || s.includes(srv.name.toLowerCase())
    );
    if (partialMatch) return { id: partialMatch.id, matched: true };

    return { id: fallbackId, matched: false };
  };

  const fuzzyMatchBarber = (
    extractedBarber: string | null | undefined,
    availableBarbers: Barber[],
    daySelected: string,
    timeSelected: string,
    currentQueue: QueueEntry[]
  ): { barber: Barber | null; matched: boolean } => {
    const isBusy = (bName: string) => {
       return currentQueue.some(q =>
         q.day === daySelected &&
         (q.timeRange || '').includes(timeSelected) &&
         q.barber === bName
       );
    };

    if (extractedBarber) {
      const b = extractedBarber.toLowerCase();
      const exactMatch = availableBarbers.find(barber => barber.name.toLowerCase() === b);
      if (exactMatch) return { barber: exactMatch, matched: true };

      const partialMatch = availableBarbers.find(barber =>
        barber.name.toLowerCase().includes(b) || b.includes(barber.name.toLowerCase())
      );
      if (partialMatch) return { barber: partialMatch, matched: true };
    }

    const available = availableBarbers.find(barber => !isBusy(barber.name));
    return { barber: available || availableBarbers[0] || null, matched: false };
  };

  // Callback: Approve WhatsApp Booking
  const handleApproveRequest = async (id: string, customDay?: string, customTime?: string, customService?: string) => {
    const request = requests.find(r => r.id === id);
    if (!request) return;

    try {
      await approveRequest(id);
    } catch {
      triggerToast('Gagal mengubah status di server.', 'error', 'Update Failed');
      return;
    }

    const rawDay = customDay || request.extractedDay || '';
    const daySelected = indonesianToEnglishDay(rawDay) as 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
    const timeSelected = customTime || request.extractedTime;
    const serviceSelected = customService || request.extractedService;

    const barberMatch = fuzzyMatchBarber(request.extractedBarber, barbers, daySelected, timeSelected, queue);
    const targetBarber = barberMatch.barber;

    if (!targetBarber) return;
    const serviceMatch = fuzzyMatchService(serviceSelected, services);
    const sId = serviceMatch.id;
    if (!sId) {
      triggerToast('Gagal memetakan layanan secara otomatis.', 'error', 'Mapping Failed');
      return;
    }

    try {
      await addQueueEntry({
        customerName: request.senderName,
        status: 'Confirmed',
        day: daySelected,
        barberId: targetBarber.id,
        serviceId: sId,
        scheduledTime: timeSelected,
        phone: request.senderPhone
      });

      triggerToast(
        `Booking WhatsApp dari ${request.senderName} dikonfirmasi untuk ${daySelected} jam ${timeSelected}. Pesan konfirmasi terkirim!`,
        'success',
        'Booking Approved'
      );

      // System couldn't confidently match what was extracted from the chat
      // to a real service/barber and silently defaulted to a guess — flag
      // it so staff can double-check this specific booking.
      if (!serviceMatch.matched || !barberMatch.matched) {
        const guessedParts = [
          !serviceMatch.matched ? `layanan (dipakai: "${services.find(s => s.id === sId)?.name}")` : null,
          !barberMatch.matched ? `kapster (dipakai: "${targetBarber.name}")` : null,
        ].filter(Boolean).join(' dan ');
        triggerToast(
          `Tidak ada kecocokan persis untuk ${guessedParts} dari pesan WhatsApp ${request.senderName} — booking tetap dibuat pakai tebakan terbaik sistem. Mohon cek ulang.`,
          'info',
          'Perlu Verifikasi'
        );
      }
    } catch {
      triggerToast('Gagal menyetujui request ke database antrean.', 'error', 'Approval Failed');
    }
  };

  // Callback: Reject WhatsApp Request
  const handleRejectRequest = async (id: string) => {
    const request = requests.find(r => r.id === id);
    if (!request) return;

    requestConfirm(
      'Yakin mau tolak request booking ini? Customer akan langsung dapat notifikasi WhatsApp penolakan.',
      async () => {
        try {
          await rejectRequest(id);
          triggerToast(`Request booking dari ${request.senderName} ditolak.`, 'info', 'Request Declined');
        } catch {
          triggerToast('Gagal mengubah status di server.', 'error', 'Update Failed');
        }
      },
      'Ya, Tolak'
    );
  };

  // Callback: Edit WhatsApp Request before approval
  const handleEditRequest = async (id: string, updated: Partial<WhatsAppRequest>) => {
    try {
      await updateRequestDetails(id, updated);
      triggerToast(`Parameter booking berhasil disesuaikan.`, 'info', 'Metadata Extracted');
    } catch {
      triggerToast('Gagal menyimpan perubahan ke server.', 'error', 'Update Failed');
    }
  };

  const handleAddBooking = async (
    day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun',
    timeRange: string,
    customerName: string,
    serviceName: string,
    barberName: string
  ) => {

    if (checkOverlap(day, timeRange, barberName)) {
      triggerToast(
        `Gagal: jadwal bentrok dengan booking lain untuk ${barberName}.`,
        'info',
        'Double Booking Prevented'
      );
      return;
    }

    try {
      const bId = barbers.find(b => b.name === barberName)?.id || '';
      const sId = services.find(s => s.name === serviceName)?.id || '';
      if (!bId || !sId) throw new Error("Barber or Service not found locally");
      
      const startTime = timeRange.replace('~', '').split('-')[0].trim();

      await addQueueEntry({
        customerName,
        status: 'Confirmed',
        day,
        barberId: bId,
        serviceId: sId,
        phone: '+62 Custom Book',
        scheduledTime: startTime
      });
      
      triggerToast(
        `Slot berhasil dibooking: ${customerName} pada ${day} jam ${timeRange.replace('~', '')}`,
        'success',
        'Slot Booked'
      );
    } catch {
      triggerToast('Gagal menyimpan booking.', 'error', 'Booking Failed');
    }
  };

  const handleRemoveBooking = async (id: string) => {
    const entry = queue.find(q => q.id === id);
    if (!entry) return;

    requestConfirm('Yakin mau batalkan booking ini?', async () => {
      try {
        await removeQueueEntry(id);
        triggerToast(
          `Janji temu ${entry.customerName} pada ${entry.day} telah dibatalkan.`,
          'info',
          'Booking Cancelled'
        );
      } catch {
        triggerToast('Gagal membatalkan booking.', 'error', 'Delete Failed');
      }
    }, 'Ya, Batalkan');
  };

  // Callback: Serve customer now
  const handleServeNow = async (entry: QueueEntry, barberId: string) => {
    try {
      await serveQueueEntry(entry.id, barberId);
      triggerToast(
        `${entry.customerName} dipanggil ke kursi. Timer dimulai.`,
        'info',
        'Active Seat Swapped'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'SEAT_OCCUPIED_LOCAL' || message === 'SEAT_OCCUPIED_DB') {
        triggerToast(
          `Kursi ini sedang terisi, selesaikan dulu sesi yang sedang berjalan. (Simultaneous request blocked)`,
          'error',
          'Seat Occupied'
        );
      } else {
        triggerToast('Gagal memulai sesi pangkas.', 'error', 'Serve Failed');
      }
    }
  };

  // Callback: Call Next for a specific barber
  const handleCallNextForBarber = (barberId: string) => {
    const barber = barbers.find(b => b.id === barberId);
    if (!barber) return;

    if (servingSessions[barberId]) {
       return; // Guard if occupied
    }

    const todayQueue = queue.filter(q => q.day === todayKey);
    const nextEntry = todayQueue.find(q => q.barber === barber.name);

    if (nextEntry) {
      handleServeNow(nextEntry, barberId);
    }
  };

  // Callback: Remove Customer from Queue
  const handleRemoveQueueEntry = async (id: string) => {
    const item = queue.find(q => q.id === id);

    requestConfirm('Yakin mau hapus pelanggan ini dari antrean?', async () => {
      try {
        await removeQueueEntry(id);
        if (item) {
          triggerToast(`${item.customerName} dihapus dari jadwal antrean.`, 'info', 'Queue Removed');
        }
      } catch {
        triggerToast('Gagal menghapus antrean.', 'error', 'Delete Failed');
      }
    }, 'Ya, Hapus');
  };

  // Callback: Update status from Schedule
  const handleUpdateQueueStatus = async (id: string, newStatus: QueueStatus, scheduledTime?: string) => {
    try {
      await updateQueueEntryStatus(id, newStatus, scheduledTime);
      triggerToast(`Status antrean diubah jadi ${newStatus}.`, 'info');
    } catch {
      triggerToast('Gagal memperbarui status.', 'error', 'Update Failed');
    }
  };

  // Callback: Simulate sending WhatsApp message
  const handleSendWhatsAppSimulated = (phone: string, text: string) => {
    triggerToast(
      `"${text}"`,
      'whatsapp',
      `WhatsApp API dispatch to ${phone}`
    );
  };

  // Callback: Add custom service
  const handleAddService = async (newSvc: Omit<Service, 'id'>) => {
    try {
      await addService(newSvc);
      triggerToast(`Layanan baru "${newSvc.name}" ditambahkan ke daftar harga.`, 'success', 'Service Saved');
    } catch {
      triggerToast(`Gagal menyimpan layanan baru.`, 'error', 'Save Failed');
    }
  };

  // Callback: Update existing service
  const handleUpdateService = async (id: string, updates: Partial<Omit<Service, 'id'>>) => {
    try {
      await updateService(id, updates);
      triggerToast(`Layanan berhasil diperbarui.`, 'success', 'Service Updated');
    } catch {
      triggerToast(`Gagal memperbarui layanan.`, 'error', 'Update Failed');
    }
  };

  // Callback: Remove custom service
  const handleRemoveService = async (id: string) => {
    requestConfirm('Yakin mau hapus layanan ini?', async () => {
      try {
        await removeService(id);
        triggerToast(`Layanan dihapus dari daftar pilihan.`, 'info', 'Service Deleted');
      } catch {
        triggerToast(`Gagal menghapus layanan.`, 'error', 'Delete Failed');
      }
    }, 'Ya, Hapus');
  };

  // Callback: Update barber status
  const handleUpdateBarberStatus = async (id: string, status: 'active' | 'break' | 'off') => {
    try {
      await updateBarberStatus(id, status);
      const name = barbers.find(b => b.id === id)?.name || 'Kapster';
      const statusLabel = status === 'active' ? 'AKTIF' : status === 'break' ? 'ISTIRAHAT' : 'OFF';
      triggerToast(`${name} sekarang berstatus ${statusLabel}.`, status === 'active' ? 'success' : 'info', 'Duty Swapped');
    } catch {
      triggerToast(`Gagal memperbarui status kapster.`, 'error', 'Update Failed');
    }
  };

  // Callback: Add custom barber
  const handleAddBarber = async (newBarber: Omit<Barber, 'id'>) => {
    try {
      await addBarber(newBarber);
      triggerToast(`Kapster "${newBarber.name}" berhasil ditambahkan.`, 'success', 'Barber Added');
    } catch {
      triggerToast(`Gagal menyimpan kapster baru.`, 'error', 'Save Failed');
    }
  };

  // Callback: Edit custom barber
  const handleEditBarber = async (id: string, updatedBarber: Partial<Barber>) => {
    try {
      await editBarber(id, updatedBarber);
      triggerToast(`Data kapster berhasil diperbarui.`, 'success', 'Barber Edited');
    } catch {
      triggerToast(`Gagal memperbarui data kapster.`, 'error', 'Update Failed');
    }
  };

  // Callback: Remove custom barber
  const handleRemoveBarber = async (id: string) => {
    requestConfirm('Yakin mau hapus kapster ini?', async () => {
      try {
        await removeBarber(id);
        triggerToast(`Kapster berhasil dihapus.`, 'info', 'Barber Deleted');
      } catch (err) {
        triggerToast(err instanceof Error ? err.message : 'Gagal menghapus kapster.', 'error', 'Delete Failed');
      }
    }, 'Ya, Hapus');
  };

  // Callback: Quick Walk-In (starts session immediately without filling customer data)
  const handleQuickStart = async (barberId: string) => {
    try {
      await startQuickWalkIn(barberId);
      const barberName = barbers.find(b => b.id === barberId)?.name || 'Kapster';
      triggerToast(`Sesi dimulai untuk ${barberName}! Timer berjalan.`, 'success', 'Mulai Cepat');
    } catch (err) {
      console.error('Quick walk-in failed:', err);
      triggerToast('Gagal memulai sesi. Coba lagi.', 'error', 'Gagal');
    }
  };

  // Main navigation tabs render
  const renderActiveTab = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <Overview
            queue={queue}
            servingSessions={servingSessions}
            onCompleteSession={handleCompleteSession}
            onQuickStart={handleQuickStart}
            onCallNextForBarber={handleCallNextForBarber}
            onAddWalkIn={handleAddWalkIn}
            barbers={barbers}
            services={services}
            completedCount={completedCount}
            revenueToday={revenueToday}
            todayKey={todayKey}
          />
        );
      case 'queue':
        return (
          <QueueList
            queue={queue}
            servingSessions={servingSessions}
            barbers={barbers}
            todayKey={todayKey}
            onServeNow={handleServeNow}
            onRemove={handleRemoveQueueEntry}
            onSendWhatsApp={handleSendWhatsAppSimulated}
            shopName={businessHours.shopName}
          />
        );
      case 'requests':
        return (
          <Requests
            requests={requests}
            requestsLoading={requestsLoading}
            requestsError={requestsError ? requestsError.message : null}
            onApprove={handleApproveRequest}
            onReject={handleRejectRequest}
            onEdit={handleEditRequest}
          />
        );
      case 'schedule':
        return (
          <Schedule
            queue={queue}
            servingSessions={servingSessions}
            completedEntries={completedEntries}
            todayKey={todayKey}
            currentTime={currentTime}
            onUpdateStatus={handleUpdateQueueStatus}
            onSendWhatsApp={handleSendWhatsAppSimulated}
            barbers={barbers}
            services={services}
            businessHours={businessHours}
            onAddBooking={handleAddBooking}
            onRemoveBooking={handleRemoveBooking}
          />
        );
      case 'history':
        return (
          <HistoryTab completedEntries={completedEntries} barbers={barbers} services={services} />
        );
      case 'settings':
        return (
          <SettingsView
            services={services}
            servicesLoading={servicesLoading}
            barbers={barbers}
            barbersLoading={barbersLoading}
            onAddService={handleAddService}
            onUpdateService={handleUpdateService}
            onRemoveService={handleRemoveService}
            onUpdateBarberStatus={handleUpdateBarberStatus}
            onAddBarber={handleAddBarber}
            onEditBarber={handleEditBarber}
            onRemoveBarber={handleRemoveBarber}
            businessHours={businessHours}
            onUpdateBusinessHours={updateBusinessHours}
            onUpdateShopProfile={updateShopProfile}
          />
        );
      default:
        return null;
    }
  };

  const pendingRequestsCount = requests.filter(r => r.status === 'pending' && r.paymentStatus === 'paid').length;

  if (authLoading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center animate-pulse overflow-hidden">
          {businessHours.logoUrl ? (
            <img src={businessHours.logoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="font-display font-bold text-primary-foreground text-sm">{businessHours.shopName.charAt(0).toUpperCase()}</span>
          )}
        </div>
      </div>
    );
  }

  if (!session) {
    return <Login shopName={businessHours.shopName} logoUrl={businessHours.logoUrl} />;
  }

  return (
    <SidebarProvider className="relative h-dvh bg-background text-foreground font-sans selection:bg-primary/20 selection:text-foreground overflow-hidden z-0">

      {/* Ambient Depth Background */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/5 via-background/80 to-background" />

      {/* Subtle Dot Pattern Background */}
      <DotPattern
        className="[mask-image:radial-gradient(1500px_circle_at_center,white,transparent)] z-0"
        cx={1} cy={1} cr={1}
      />

      {/* SIDEBAR — desktop: fixed column (via primitive's own positioning); mobile: Sheet drawer */}
      <AppSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingRequestsCount={pendingRequestsCount}
        sidebarVariant={sidebarVariant}
        sidebarMode={sidebarMode}
        shopName={businessHours.shopName}
        logoUrl={businessHours.logoUrl}
      />

      <SidebarInset className={cn(
        "z-10 min-w-0 flex flex-col",
        sidebarVariant === 'inset'
          ? "md:bg-background md:rounded-[2rem] md:shadow-2xl"
          : "bg-background"
      )}>

        {/* MOBILE TOP BAR — h-[64px] is load-bearing: Schedule.tsx sticky offsets are hardcoded to match */}
        <div className="md:hidden flex items-center justify-between bg-background border-b border-border px-5 h-[64px] sticky top-0 z-40 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg" id="mobile-menu-toggle-btn" />
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center overflow-hidden">
              {businessHours.logoUrl ? (
                <img src={businessHours.logoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="font-display font-bold text-primary-foreground text-sm">{businessHours.shopName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <span className="font-display font-semibold tracking-wide text-foreground text-base">{businessHours.shopName.toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-3">
            {pendingRequestsCount > 0 && (
              <button
                onClick={() => setActiveTab('requests')}
                className="relative p-2 text-foreground hover:bg-accent rounded-lg transition-all cursor-pointer"
                aria-label={`${t('sidebar.requests')} (${pendingRequestsCount})`}
                id="mobile-requests-badge-btn"
              >
                <MessageSquare size={20} />
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                  {pendingRequestsCount}
                </span>
              </button>
            )}
            <button
              onClick={() => supabase.auth.signOut()}
              className="p-2 text-muted-foreground hover:text-destructive hover:bg-accent rounded-lg transition-colors cursor-pointer"
              title="Keluar"
              aria-label="Keluar"
              id="mobile-logout-btn"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* MAIN VIEW AREA — scrolls independently on desktop; on mobile fills remaining height.
            Rounds+clips its OWN corners (matching SidebarInset's md:rounded-[2rem]) rather than
            relying on an ancestor's overflow-hidden — SidebarInset itself must stay unclipped or
            it breaks position:sticky for elements deep inside Schedule.tsx (see CLAUDE.md). */}
        <div className={cn(
          "flex-1 flex flex-col min-w-0 z-10 relative overflow-y-auto",
          sidebarVariant === 'inset' && "md:rounded-[2rem]"
        )}>

        {/* TOP INTEGRATION BAR (Desktop only - mobile has its own top bar above) */}
        <header className="hidden md:flex items-start sticky top-0 z-50 flex-shrink-0 min-h-[66px] px-6 pt-3 backdrop-blur-md">
          <div className="w-full flex items-center justify-between bg-card border border-border rounded-xl px-6 py-2">

          {/* Left: Sidebar toggle + quick search mockup */}
          <div className="flex items-center gap-4">
            <SidebarTrigger
              className="w-8 h-8 min-w-0 min-h-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent [&>svg]:size-5"
              id="desktop-header-sidebar-toggle"
            />
            <div className="hidden lg:block w-px h-4 bg-border" />
            <div className="hidden lg:flex items-center gap-1.5 h-9 rounded-md px-3 text-muted-foreground hover:bg-accent focus-within:bg-accent transition-colors">
              <Search size={16} className="text-muted-foreground shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t('header.searchPlaceholder')}
                className="bg-transparent text-sm text-foreground focus:outline-none placeholder-muted-foreground w-44"
                id="global-search-input"
              />
              <kbd className="hidden xl:flex h-5 items-center justify-center rounded-sm bg-muted px-1 font-mono text-xs font-medium text-muted-foreground">
                ⌘K
              </kbd>
            </div>
            <div className="lg:hidden text-foreground font-mono text-xs font-semibold uppercase tracking-wider">
              {activeTab === 'overview' ? t('header.dashboard') : activeTab.toUpperCase()}
            </div>
          </div>

          {/* Right: Date, Ticking clock, Quick Actions */}
          <div className="flex items-center gap-1.5">

            {/* Live Clock Widget */}
            <div className="hidden sm:flex items-center gap-2 h-9 px-3 text-xs md:text-sm font-sans text-muted-foreground">
              <Clock size={14} className="text-muted-foreground" />
              <span className="font-mono text-muted-foreground">
                <span className="hidden lg:inline">
                  {currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  <span className="text-muted-foreground/60 mx-1.5">•</span>
                </span>
                <span className="text-foreground font-bold">
                  {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </span>
            </div>

            <LanguageSwitcher />
            <ThemeCustomizer />

            {/* Quick Notification Ring Mock */}
            <button
              onClick={() => triggerToast("Semua kursi aktif beroperasi optimal.", "info", "System Scan")}
              className="relative w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-all cursor-pointer"
              title="System Notifications"
              aria-label="Notifikasi sistem"
              id="topbar-notif-btn"
            >
              <Bell size={16} />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
            </button>

            {/* User Barber Operator Hub Profile */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-accent transition-all cursor-pointer"
                  aria-label={`Menu akun — ${t('header.hqOperator')}`}
                  id="header-profile-btn"
                >
                  <span className="w-8 h-8 rounded-full bg-accent border border-border flex items-center justify-center text-foreground font-bold font-mono text-xs">
                    HQ
                  </span>
                  <span className="absolute bottom-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-card" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 p-2">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-semibold text-foreground">{t('header.hqOperator')}</p>
                  <p className="text-[10px] text-muted-foreground font-mono tracking-wider uppercase">{businessHours.shopName}</p>
                </div>
                <div className="h-px bg-border my-1" />
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-destructive hover:bg-accent transition-colors cursor-pointer"
                  id="logout-btn"
                >
                  <LogOut size={15} />
                  Keluar
                </button>
              </PopoverContent>
            </Popover>
          </div>
          </div>
        </header>

        {/* CONTAINER CONTENT VIEW */}
        <main className={cn(
          'flex-1 p-5 md:p-8 space-y-6 w-full mx-auto',
          contentLayout === 'compact' ? 'max-w-5xl' : 'max-w-7xl'
        )}>
          {/* Fade-only: a translateY-based transition here would leave a
              transform on this ancestor, which creates a new containing
              block and breaks position:sticky elements inside pages
              (e.g. Schedule's mobile barber-tabs bar). */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {renderActiveTab()}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* PAGE FOOTER */}
        <footer className={cn(
          'w-full mx-auto px-5 md:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground flex-shrink-0',
          contentLayout === 'compact' ? 'max-w-5xl' : 'max-w-7xl'
        )}>
          <p>
            © {new Date().getFullYear()} <span className="text-foreground/80">{businessHours.shopName}</span> — Sistem Antrian Barbershop
          </p>
        </footer>
        </div>
      </SidebarInset>

      {/* GLOBAL CONFIRMATION DIALOG (pengganti window.confirm bawaan browser) */}
      <AlertDialog open={!!confirmRequest} onOpenChange={(open) => !open && setConfirmRequest(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi</AlertDialogTitle>
            <AlertDialogDescription>{confirmRequest?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive/10 text-destructive hover:bg-destructive/20"
              onClick={() => {
                confirmRequest?.onConfirm();
                setConfirmRequest(null);
              }}
            >
              {confirmRequest?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* GLOBAL TOAST BANNER CONTAINER (AnimatePresence) */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 w-full max-w-[380px] px-4 sm:px-0">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              className={`rounded-2xl p-4 shadow-2xl flex items-start gap-3.5 border relative overflow-hidden backdrop-blur-md ${toast.type === 'whatsapp'
                  ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-100'
                  : toast.type === 'error'
                    ? 'bg-red-950/90 border-red-500/30 text-red-100'
                  : toast.type === 'info'
                    ? 'bg-popover border-amber-500/30 text-foreground'
                    : 'bg-popover border-teal-500/30 text-foreground'
                }`}
            >
              {/* Type Indicator Icon */}
              <div className="mt-0.5 shrink-0">
                {toast.type === 'whatsapp' ? (
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <MessageSquare size={16} />
                  </div>
                ) : toast.type === 'error' ? (
                  <div className="p-1.5 rounded-lg bg-red-500/10 text-red-400">
                    <XCircle size={16} />
                  </div>
                ) : toast.type === 'info' ? (
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                    <AlertCircle size={16} />
                  </div>
                ) : (
                  <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400">
                    <CheckCircle size={16} />
                  </div>
                )}
              </div>

              {/* Message Block */}
              <div className="flex-1 min-w-0 pr-4">
                {toast.title && (
                  <h4 className="text-xs font-bold font-mono tracking-wider uppercase text-foreground mb-0.5">
                    {toast.title}
                  </h4>
                )}
                <p className="text-xs font-sans leading-relaxed text-muted-foreground break-words">
                  {toast.message}
                </p>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="absolute top-3.5 right-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                id={`close-toast-${toast.id}`}
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </SidebarProvider>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import { useSupabaseServices } from './hooks/useSupabaseServices';
import { useSupabaseBarbers } from './hooks/useSupabaseBarbers';
import { useSupabaseQueue } from './hooks/useSupabaseQueue';
import { useSupabaseRequests } from './hooks/useSupabaseRequests';
import { useSupabaseBusinessHours } from './hooks/useSupabaseBusinessHours';
import Sidebar from './components/Sidebar';
import Overview from './components/Overview';
import Schedule from './components/Schedule';
import Requests from './components/Requests';
import QueueList from './components/QueueList';
import SettingsView from './components/Settings';
import HistoryTab from './components/History.tsx';
import LanguageSwitcher from './components/LanguageSwitcher';
import { DotPattern } from './components/ui/dot-pattern';
import { useTranslation } from './i18n';
import { QueueEntry, WhatsAppRequest, Barber, Service, QueueStatus } from './types';
import {
  INITIAL_BARBERS,
  INITIAL_QUEUE,
  INITIAL_REQUESTS,
  INITIAL_SERVICES,
  INITIAL_SERVING_SESSIONS
} from './data/mockData';
import {
  Search,
  Clock,
  Sparkles,
  Bell,
  User,
  ChevronDown,
  CheckCircle,
  MessageSquare,
  X,
  AlertCircle,
  XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const { t } = useTranslation();

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState('overview');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isOpenMobile, setIsOpenMobile] = useState(false);

  // Core App States
  const { requests, setRequests, loading: requestsLoading, error: requestsError, approveRequest, rejectRequest, refreshRequests } = useSupabaseRequests();
  const { barbers, loading: barbersLoading, error: barbersError, addBarber, editBarber, removeBarber, updateBarberStatus } = useSupabaseBarbers();
  const { services, loading: servicesLoading, error: servicesError, addService, removeService } = useSupabaseServices();
  const { queue, servingSessions, completedEntries, loading: queueLoading, error: queueError, addQueueEntry, updateQueueEntryStatus, serveQueueEntry, completeServingSession, removeQueueEntry } = useSupabaseQueue(barbers, services);
  const { businessHours, updateBusinessHours } = useSupabaseBusinessHours();

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

  // Live clock state
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
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
  }, [currentTime.toDateString()]);

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
  const handleCompleteSession = async (barberId: string, actualDurationMinutes: number) => {
    const session = servingSessions[barberId];
    if (!session) return;

    try {
      await completeServingSession(barberId);
      
      const priceOfService = services.find(s => s.name === session.service)?.price || 120000;

      // Toast
      triggerToast(
        `Pangkas Selesai! ${session.customerName} completed ${session.service} session. Collected Rp ${priceOfService.toLocaleString()}.`,
        'success',
        'Session Completed'
      );
    } catch (err) {
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
        `Failed: Time slot overlaps with an existing booking for ${barberName}.`,
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
        `Walk-In added: ${name} (No. ${queueNumber}) has been appended to Seat of ${barberName}.`,
        'success',
        'Walk-In Added'
      );
    } catch (err) {
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

  const fuzzyMatchService = (extractedService: string, availableServices: any[]): string => {
    if (!extractedService) return availableServices.length > 0 ? availableServices[0].id : '';
    const s = extractedService.toLowerCase();
    const exactMatch = availableServices.find(srv => srv.name.toLowerCase() === s);
    if (exactMatch) return exactMatch.id;
    
    const partialMatch = availableServices.find(srv => 
      srv.name.toLowerCase().includes(s) || s.includes(srv.name.toLowerCase())
    );
    if (partialMatch) return partialMatch.id;

    return availableServices.length > 0 ? availableServices[0].id : '';
  };

  const fuzzyMatchBarber = (
    extractedBarber: string | null | undefined, 
    availableBarbers: any[],
    daySelected: string,
    timeSelected: string,
    currentQueue: any[]
  ): any => {
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
      if (exactMatch) return exactMatch;

      const partialMatch = availableBarbers.find(barber => 
        barber.name.toLowerCase().includes(b) || b.includes(barber.name.toLowerCase())
      );
      if (partialMatch) return partialMatch;
    }

    const available = availableBarbers.find(barber => !isBusy(barber.name));
    return available || availableBarbers[0] || null;
  };

  // Callback: Approve WhatsApp Booking
  const handleApproveRequest = async (id: string, customDay?: string, customTime?: string, customService?: string) => {
    const request = requests.find(r => r.id === id);
    if (!request) return;

    try {
      await approveRequest(id);
    } catch (err: any) {
      triggerToast('Gagal mengubah status di server.', 'error', 'Update Failed');
      return;
    }

    const rawDay = customDay || request.extractedDay || '';
    const daySelected = indonesianToEnglishDay(rawDay) as any;
    const timeSelected = customTime || request.extractedTime;
    const serviceSelected = customService || request.extractedService;

    const endTime = calculateEndTime(timeSelected, serviceSelected);
    const targetBarber = fuzzyMatchBarber(request.extractedBarber, barbers, daySelected, timeSelected, queue);

    if (!targetBarber) return;
    const sId = fuzzyMatchService(serviceSelected, services);
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
        `WhatsApp booking for ${request.senderName} confirmed for ${daySelected} at ${timeSelected}. Welcome msg triggered!`,
        'success',
        'Booking Approved'
      );
    } catch (err) {
      triggerToast('Gagal menyetujui request ke database antrean.', 'error', 'Approval Failed');
    }
  };

  // Callback: Reject WhatsApp Request
  const handleRejectRequest = async (id: string) => {
    const request = requests.find(r => r.id === id);
    if (!request) return;

    try {
      await rejectRequest(id);
      triggerToast(`Booking request from ${request.senderName} rejected.`, 'info', 'Request Declined');
    } catch (err: any) {
      triggerToast('Gagal mengubah status di server.', 'error', 'Update Failed');
    }
  };

  // Callback: Edit WhatsApp Request before approval
  const handleEditRequest = (id: string, updated: Partial<WhatsAppRequest>) => {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r));
    triggerToast(`Booking parameters adjusted successfully.`, 'info', 'Metadata Extracted');
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
        `Failed: Time slot overlaps with an existing booking for ${barberName}.`,
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
        `Slot booked successfully: ${customerName} on ${day} at ${timeRange.replace('~', '')}`,
        'success',
        'Slot Booked'
      );
    } catch (err) {
      triggerToast('Gagal menyimpan booking.', 'error', 'Booking Failed');
    }
  };

  const handleRemoveBooking = async (id: string) => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) return;
    const entry = queue.find(q => q.id === id);
    if (!entry) return;
    
    try {
      await removeQueueEntry(id);
      triggerToast(
        `Appointment for ${entry.customerName} on ${entry.day} has been cancelled.`,
        'info',
        'Booking Cancelled'
      );
    } catch (err) {
      triggerToast('Gagal membatalkan booking.', 'error', 'Delete Failed');
    }
  };

  // Callback: Serve customer now
  const handleServeNow = async (entry: QueueEntry, barberId: string) => {
    try {
      await serveQueueEntry(entry.id, barberId);
      triggerToast(
        `Called ${entry.customerName} to the chair immediately. Timer initiated.`,
        'info',
        'Active Seat Swapped'
      );
    } catch (err: any) {
      if (err.message === 'SEAT_OCCUPIED_LOCAL' || err.message === 'SEAT_OCCUPIED_DB') {
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
    if (!window.confirm('Are you sure you want to remove this customer from the queue?')) return;
    const item = queue.find(q => q.id === id);
    
    try {
      await removeQueueEntry(id);
      if (item) {
        triggerToast(`Removed ${item.customerName} from queue schedule.`, 'info', 'Queue Removed');
      }
    } catch (err) {
      triggerToast('Gagal menghapus antrean.', 'error', 'Delete Failed');
    }
  };

  // Callback: Update status from Schedule
  const handleUpdateQueueStatus = async (id: string, newStatus: QueueStatus, scheduledTime?: string) => {
    try {
      await updateQueueEntryStatus(id, newStatus, scheduledTime);
      triggerToast(`Queue entry status shifted to ${newStatus}.`, 'info');
    } catch (err) {
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
      triggerToast(`New service "${newSvc.name}" added to pricing menu.`, 'success', 'Service Saved');
    } catch (err) {
      triggerToast(`Gagal menyimpan layanan baru.`, 'error', 'Save Failed');
    }
  };

  // Callback: Remove custom service
  const handleRemoveService = async (id: string) => {
    try {
      await removeService(id);
      triggerToast(`Service item removed from options.`, 'info', 'Service Deleted');
    } catch (err) {
      triggerToast(`Gagal menghapus layanan.`, 'error', 'Delete Failed');
    }
  };

  // Callback: Update barber status
  const handleUpdateBarberStatus = async (id: string, status: 'active' | 'break' | 'off') => {
    try {
      await updateBarberStatus(id, status);
      const name = barbers.find(b => b.id === id)?.name || 'Barber';
      triggerToast(`${name} is now marked [${status.toUpperCase()}].`, 'info', 'Duty Swapped');
    } catch (err) {
      triggerToast(`Gagal memperbarui status kapster.`, 'error', 'Update Failed');
    }
  };

  // Callback: Add custom barber
  const handleAddBarber = async (newBarber: Omit<Barber, 'id'>) => {
    try {
      await addBarber(newBarber);
      triggerToast(`Barber "${newBarber.name}" has been added.`, 'success', 'Barber Added');
    } catch (err) {
      triggerToast(`Gagal menyimpan kapster baru.`, 'error', 'Save Failed');
    }
  };

  // Callback: Edit custom barber
  const handleEditBarber = async (id: string, updatedBarber: Partial<Barber>) => {
    try {
      await editBarber(id, updatedBarber);
      triggerToast(`Barber details updated.`, 'success', 'Barber Edited');
    } catch (err) {
      triggerToast(`Gagal memperbarui data kapster.`, 'error', 'Update Failed');
    }
  };

  // Callback: Remove custom barber
  const handleRemoveBarber = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this barber?')) return;
    try {
      await removeBarber(id);
      triggerToast(`Barber has been removed.`, 'info', 'Barber Deleted');
    } catch (err: any) {
      if (err.code === '23503') {
        triggerToast('Kapster terkait dengan Riwayat Antrean. Ubah statusnya menjadi "Off" untuk menyembunyikannya.', 'error', 'Tidak Bisa Dihapus');
      } else {
        triggerToast(err.message || `Gagal menghapus kapster.`, 'error', 'Delete Failed');
      }
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
            onServeNow={handleServeNow}
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
            services={services}
            barbers={barbers}
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
          <HistoryTab completedEntries={completedEntries} barbers={barbers} />
        );
      case 'settings':
        return (
          <SettingsView
            services={services}
            servicesLoading={servicesLoading}
            barbers={barbers}
            barbersLoading={barbersLoading}
            onAddService={handleAddService}
            onRemoveService={handleRemoveService}
            onUpdateBarberStatus={handleUpdateBarberStatus}
            onAddBarber={handleAddBarber}
            onEditBarber={handleEditBarber}
            onRemoveBarber={handleRemoveBarber}
            businessHours={businessHours}
            onUpdateBusinessHours={updateBusinessHours}
          />
        );
      default:
        return null;
    }
  };

  const pendingRequestsCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="relative min-h-dvh bg-[#070707] text-gray-100 flex flex-col md:flex-row font-sans selection:bg-amber-500/20 selection:text-amber-400 overflow-hidden z-0">
      
      {/* Ambient Depth Background */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/5 via-[#070707]/80 to-[#070707]" />

      {/* Subtle Dot Pattern Background */}
      <DotPattern
        className="[mask-image:radial-gradient(1500px_circle_at_center,white,transparent)] z-0"
        cx={1} cy={1} cr={1}
      />
      
      {/* SIDEBAR NAVIGATION */}
      <div className="z-10 flex">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
          isOpenMobile={isOpenMobile}
          setIsOpenMobile={setIsOpenMobile}
          pendingRequestsCount={pendingRequestsCount}
        />
      </div>

      {/* MAIN VIEW AREA */}
      <div className="flex-1 flex flex-col min-w-0 z-10 relative">

        {/* TOP INTEGRATION BAR (Sticky) */}
        <header className="bg-[#0A0A0A]/95 backdrop-blur border-b border-[#1A1A1A] h-[72px] px-6 flex items-center justify-between sticky top-0 z-50">

          {/* Left: Quick search mockup */}
          <div className="hidden lg:flex items-center gap-2.5 bg-[#0F0F0F] border border-[#1A1A1A] rounded-xl px-3.5 py-2 w-72">
            <Search size={15} className="text-gray-500" />
            <input
              type="text"
              placeholder={t('header.searchPlaceholder')}
              className="bg-transparent text-xs text-gray-200 focus:outline-none w-full placeholder-gray-600"
              id="global-search-input"
            />
          </div>
          <div className="sm:hidden text-amber-500 font-mono text-xs font-semibold uppercase tracking-wider">
            {activeTab === 'overview' ? t('header.dashboard') : activeTab.toUpperCase()}
          </div>

          {/* Right: Date, Ticking clock, Quick Actions */}
          <div className="flex items-center gap-4">

            {/* Live Clock Widget */}
            <div className="flex items-center gap-2 text-xs md:text-sm font-sans text-gray-400 bg-[#0F0F0F] border border-[#1A1A1A] rounded-xl px-3 py-2">
              <Clock size={14} className="text-amber-500" />
              <span className="font-mono text-gray-300">
                <span className="hidden lg:inline">
                  {currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  <span className="text-gray-600 mx-1.5">•</span>
                </span>
                <span className="text-white font-bold">
                  <span className="sm:hidden">
                    {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="hidden sm:inline">
                    {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </span>
              </span>
            </div>

            <LanguageSwitcher />

            {/* Quick Notification Ring Mock */}
            <button
              onClick={() => triggerToast("All active seats are operating optimally.", "info", "System Scan")}
              className="relative p-2 bg-[#0F0F0F] border border-[#1A1A1A] hover:bg-[#151515] hover:text-amber-500 rounded-xl transition-all cursor-pointer"
              title="System Notifications"
              id="topbar-notif-btn"
            >
              <Bell size={16} className="text-gray-400" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
            </button>

            {/* User Barber Operator Hub Profile */}
            <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-[#1A1A1A]">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 font-bold font-mono text-xs">
                HQ
              </div>
              <div className="text-left">
                <span className="text-xs font-semibold text-white block">{t('header.hqOperator')}</span>
                <span className="text-[9px] text-teal-400 font-mono tracking-wider uppercase block">GOLDEN SHEARS</span>
              </div>
            </div>
          </div>
        </header>

        {/* CONTAINER CONTENT VIEW */}
        <main className="flex-1 p-5 md:p-8 space-y-6 max-w-7xl w-full mx-auto">
          {renderActiveTab()}
        </main>
      </div>

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
                    ? 'bg-zinc-900/95 border-amber-500/30 text-gray-200'
                    : 'bg-zinc-900/95 border-teal-500/30 text-gray-200'
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
                  <h4 className="text-xs font-bold font-mono tracking-wider uppercase text-white mb-0.5">
                    {toast.title}
                  </h4>
                )}
                <p className="text-xs font-sans leading-relaxed text-gray-300 break-words">
                  {toast.message}
                </p>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="absolute top-3.5 right-3.5 text-gray-500 hover:text-white transition-colors cursor-pointer"
                id={`close-toast-${toast.id}`}
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

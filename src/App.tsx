import React, { useState, useEffect, useMemo } from 'react';
import { useLocalStorageState } from './hooks/useLocalStorageState';
import Sidebar from './components/Sidebar';
import Overview from './components/Overview';
import Schedule from './components/Schedule';
import Requests from './components/Requests';
import QueueList from './components/QueueList';
import SettingsView from './components/Settings';
import { QueueEntry, WhatsAppRequest, Barber, Service, QueueStatus } from './types';
import { 
  INITIAL_BARBERS, 
  INITIAL_QUEUE, 
  INITIAL_REQUESTS, 
  INITIAL_SERVICES 
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
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const INITIAL_SERVING = INITIAL_QUEUE.find(q => q.id === 'q1') || null;
const INITIAL_QUEUE_WITHOUT_SERVING = INITIAL_QUEUE.filter(
  q => q.id !== INITIAL_SERVING?.id
);

export default function App() {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState('overview');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isOpenMobile, setIsOpenMobile] = useState(false);

  // Core App States
  const [queue, setQueue] = useLocalStorageState<QueueEntry[]>('barberflow_queue', INITIAL_QUEUE_WITHOUT_SERVING);
  const [requests, setRequests] = useLocalStorageState<WhatsAppRequest[]>('barberflow_requests', INITIAL_REQUESTS);
  const [barbers, setBarbers] = useLocalStorageState<Barber[]>('barberflow_barbers', INITIAL_BARBERS);
  const [services, setServices] = useLocalStorageState<Service[]>('barberflow_services', INITIAL_SERVICES);

  // "Currently Serving" Active slot state
  const [currentlyServing, setCurrentlyServing] = useLocalStorageState<QueueEntry | null>('barberflow_currentlyServing', INITIAL_SERVING);

  // Stats Counters
  const [completedCount, setCompletedCount] = useLocalStorageState('barberflow_completedCount', 3);
  const [revenueToday, setRevenueToday] = useLocalStorageState('barberflow_revenueToday', 450000); // 450k starting IDR

  // Custom Toast System
  interface Toast {
    id: string;
    message: string;
    type: 'success' | 'info' | 'whatsapp';
    title?: string;
  }
  const [toasts, setToasts] = useState<Toast[]>([]);

  const triggerToast = (message: string, type: 'success' | 'info' | 'whatsapp' = 'success', title?: string) => {
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

  const todayKey = useMemo(() => {
    return currentTime.toLocaleDateString('en-US', { weekday: 'short' }) as
      'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  }, [currentTime.toDateString()]);

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
  const handleCompleteServing = (id: string, actualDurationMinutes: number) => {
    if (!currentlyServing) return;

    const priceOfService = services.find(s => s.name === currentlyServing.service)?.price || 120000;
    
    // Add to stats
    setCompletedCount(prev => prev + 1);
    setRevenueToday(prev => prev + priceOfService);

    // Toast
    triggerToast(
      `Pangkas Selesai! ${currentlyServing.customerName} completed Classic Fade session. Collected Rp ${priceOfService.toLocaleString()}.`, 
      'success',
      'Session Completed'
    );

    // Call Next customer from today's list if available
    const todayQueue = queue.filter(q => q.day === todayKey);
    if (todayQueue.length > 0) {
      const nextInLine = todayQueue[0];
      setCurrentlyServing(nextInLine);
      setQueue(prev => prev.filter(q => q.id !== nextInLine.id));
      triggerToast(
        `Next customer ${nextInLine.customerName} is now up! Active Seat initialized.`, 
        'info',
        'Next Customer Called'
      );
    } else {
      setCurrentlyServing(null);
    }
  };

  // Callback: Add manual Walk-In
  const handleAddWalkIn = (name: string, serviceName: string, barberName: string) => {
    const todayQueue = queue.filter(q => q.day === todayKey);
    const queueNumber = todayQueue.length + 1;
    
    // Calculate simulated dynamic estimate time
    let startMinutes = 15 * 60; // default to 15:00
    if (todayQueue.length > 0) {
      // parse last item time
      const lastItem = todayQueue[todayQueue.length - 1];
      const match = lastItem.timeRange.match(/(\d+):(\d+)\s*$/);
      if (match) {
        startMinutes = Number(match[1]) * 60 + Number(match[2]) + 15; // 15 mins gap
      }
    } else if (currentlyServing) {
      startMinutes = 14 * 60 + 45; // after current serving estimate
    }

    const startH = Math.floor(startMinutes / 60) % 24;
    const startM = startMinutes % 60;
    const startTimeStr = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;
    const endTimeStr = calculateEndTime(startTimeStr, serviceName);

    const newEntry: QueueEntry = {
      id: `walk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      customerName: name,
      status: 'Estimated',
      timeRange: `~${startTimeStr} - ${endTimeStr}`,
      queueNumber,
      day: todayKey,
      service: serviceName,
      barber: barberName,
      phone: '+62 Walk-In',
      durationMinutes: services.find(s => s.name === serviceName)?.duration || 30
    };

    setQueue(prev => [...prev, newEntry]);
    triggerToast(
      `Walk-In added: ${name} (No. ${queueNumber}) has been appended to Seat of ${barberName}.`,
      'success',
      'Walk-In Added'
    );
  };

  // Callback: Approve WhatsApp Booking
  const handleApproveRequest = (id: string, customDay?: string, customTime?: string, customService?: string) => {
    const request = requests.find(r => r.id === id);
    if (!request) return;

    // Mark approved
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' } : r));

    const daySelected = (customDay || request.extractedDay) as any;
    const timeSelected = customTime || request.extractedTime;
    const serviceSelected = customService || request.extractedService;

    const endTime = calculateEndTime(timeSelected, serviceSelected);

    const newEntry: QueueEntry = {
      id: 'approved-' + id,
      customerName: request.senderName,
      status: 'Confirmed',
      timeRange: `~${timeSelected} - ${endTime}`,
      day: daySelected,
      service: serviceSelected,
      barber: barbers[0]?.name || 'Marcus Vance',
      phone: request.senderPhone,
      durationMinutes: services.find(s => s.name === serviceSelected)?.duration || 45
    };

    setQueue(prev => [...prev, newEntry]);
    triggerToast(
      `WhatsApp booking for ${request.senderName} confirmed for ${daySelected} at ${timeSelected}. Welcome msg triggered!`,
      'success',
      'Booking Approved'
    );
  };

  // Callback: Reject WhatsApp Request
  const handleRejectRequest = (id: string) => {
    const request = requests.find(r => r.id === id);
    if (!request) return;

    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'rejected' } : r));
    triggerToast(`Booking request from ${request.senderName} rejected.`, 'info', 'Request Declined');
  };

  // Callback: Edit WhatsApp Request before approval
  const handleEditRequest = (id: string, updated: Partial<WhatsAppRequest>) => {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r));
    triggerToast(`Booking parameters adjusted successfully.`, 'info', 'Metadata Extracted');
  };

  const handleAddBooking = (
    day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun',
    timeRange: string,
    customerName: string,
    serviceName: string,
    barberName: string
  ) => {
    const isToday = day === todayKey;
    const todayQueue = queue.filter(q => q.day === day);
    const queueNumber = isToday ? todayQueue.length + 1 : undefined;

    const newEntry: QueueEntry = {
      id: `book-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      customerName,
      status: 'Confirmed',
      timeRange,
      queueNumber,
      day,
      service: serviceName,
      barber: barberName,
      phone: '+62 Custom Book',
      durationMinutes: services.find(s => s.name === serviceName)?.duration || 30
    };

    setQueue(prev => [...prev, newEntry]);
    triggerToast(
      `Slot booked successfully: ${customerName} on ${day} at ${timeRange.replace('~', '')}`,
      'success',
      'Slot Booked'
    );
  };

  const handleRemoveBooking = (id: string) => {
    const entry = queue.find(q => q.id === id);
    if (!entry) return;
    setQueue(prev => prev.filter(q => q.id !== id));
    triggerToast(
      `Appointment for ${entry.customerName} on ${entry.day} has been cancelled.`,
      'info',
      'Booking Cancelled'
    );
  };

  // Callback: Serve instant customer now from Today's Queue List
  const handleServeNow = (entry: QueueEntry) => {
    // If currently serving exists, return it back to queue
    const oldServing = currentlyServing;
    
    setCurrentlyServing(entry);
    setQueue(prev => {
      let filtered = prev.filter(q => q.id !== entry.id);
      if (oldServing) {
        // preserve day
        filtered = [...filtered, { ...oldServing, status: 'Confirmed' }];
      }
      return filtered;
    });

    triggerToast(
      `Called ${entry.customerName} to the chair immediately. Timer initiated.`,
      'info',
      'Active Seat Swapped'
    );
  };

  // Callback: Remove Customer from Queue
  const handleRemoveQueueEntry = (id: string) => {
    const item = queue.find(q => q.id === id);
    setQueue(prev => prev.filter(q => q.id !== id));
    if (item) {
      triggerToast(`Removed ${item.customerName} from queue schedule.`, 'info', 'Queue Removed');
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
  const handleAddService = (newSvc: Omit<Service, 'id'>) => {
    const id = `service-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setServices(prev => [...prev, { id, ...newSvc }]);
    triggerToast(`New service "${newSvc.name}" added to pricing menu.`, 'success', 'Service Saved');
  };

  // Callback: Remove custom service
  const handleRemoveService = (id: string) => {
    setServices(prev => prev.filter(s => s.id !== id));
    triggerToast(`Service item removed from options.`, 'info', 'Service Deleted');
  };

  // Callback: Update barber status
  const handleUpdateBarberStatus = (id: string, status: 'active' | 'break' | 'off') => {
    setBarbers(prev => prev.map(b => b.id === id ? { ...b, status } : b));
    const name = barbers.find(b => b.id === id)?.name || 'Barber';
    triggerToast(`${name} is now marked [${status.toUpperCase()}].`, 'info', 'Duty Swapped');
  };

  // Main navigation tabs render
  const renderActiveTab = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <Overview
            queue={queue}
            currentlyServing={currentlyServing}
            onCompleteServing={handleCompleteServing}
            onServeNow={handleServeNow}
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
            onUpdateStatus={(id, status) => {
              setQueue(prev => prev.map(q => q.id === id ? { ...q, status } : q));
              triggerToast(`Queue entry status shifted to ${status}.`, 'info');
            }}
            onSendWhatsApp={handleSendWhatsAppSimulated}
            barbers={barbers}
            services={services}
            onAddBooking={handleAddBooking}
            onRemoveBooking={handleRemoveBooking}
          />
        );
      case 'settings':
        return (
          <SettingsView
            services={services}
            barbers={barbers}
            onAddService={handleAddService}
            onRemoveService={handleRemoveService}
            onUpdateBarberStatus={handleUpdateBarberStatus}
          />
        );
      default:
        return null;
    }
  };

  const pendingRequestsCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="min-h-screen bg-[#070707] text-gray-100 flex flex-col md:flex-row font-sans selection:bg-amber-500/20 selection:text-amber-400">
      
      {/* SIDEBAR NAVIGATION */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        isOpenMobile={isOpenMobile}
        setIsOpenMobile={setIsOpenMobile}
        pendingRequestsCount={pendingRequestsCount}
      />

      {/* MAIN VIEW AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* TOP INTEGRATION BAR (Sticky) */}
        <header className="bg-[#0A0A0A]/95 backdrop-blur border-b border-[#1A1A1A] h-[72px] px-6 flex items-center justify-between sticky top-0 z-20">
          
          {/* Left: Quick search mockup */}
          <div className="hidden sm:flex items-center gap-2.5 bg-[#0F0F0F] border border-[#1A1A1A] rounded-xl px-3.5 py-2 w-72">
            <Search size={15} className="text-gray-500" />
            <input 
              type="text" 
              placeholder="Search appointments, bookings..." 
              className="bg-transparent text-xs text-gray-200 focus:outline-none w-full placeholder-gray-600"
              id="global-search-input"
            />
          </div>
          <div className="sm:hidden text-amber-500 font-mono text-xs font-semibold uppercase tracking-wider">
            {activeTab === 'overview' ? 'DASHBOARD' : activeTab.toUpperCase()}
          </div>

          {/* Right: Date, Ticking clock, Quick Actions */}
          <div className="flex items-center gap-4">
            
            {/* Live Clock Widget */}
            <div className="flex items-center gap-2 text-xs md:text-sm font-sans text-gray-400 bg-[#0F0F0F] border border-[#1A1A1A] rounded-xl px-3 py-2">
              <Clock size={14} className="text-amber-500" />
              <span className="font-mono text-gray-300">
                {currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                <span className="text-gray-600 mx-1.5">•</span>
                <span className="text-white font-bold">
                  {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </span>
            </div>

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
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-[#1A1A1A]">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 font-bold font-mono text-xs">
                HQ
              </div>
              <div className="text-left">
                <span className="text-xs font-semibold text-white block">HQ Operator</span>
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
              className={`rounded-2xl p-4 shadow-2xl flex items-start gap-3.5 border relative overflow-hidden backdrop-blur-md ${
                toast.type === 'whatsapp'
                  ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-100'
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

import React, { useState } from 'react';
import { QueueEntry, QueueStatus, Barber, Service } from '../types';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  User, 
  ChevronRight, 
  ChevronLeft, 
  ChevronDown, 
  Phone, 
  MessageSquarePlus, 
  Info, 
  X, 
  Plus, 
  Trash2, 
  Check, 
  Sparkles, 
  Scissors, 
  Bell 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ScheduleProps {
  queue: QueueEntry[];
  onUpdateStatus: (id: string, newStatus: QueueStatus) => void;
  onSendWhatsApp: (phone: string, text: string) => void;
  barbers: Barber[];
  services: Service[];
  onAddBooking?: (
    day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun',
    timeRange: string,
    customerName: string,
    service: string,
    barber: string
  ) => void;
  onRemoveBooking?: (id: string) => void;
}

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type DayType = typeof DAYS_OF_WEEK[number];

const HOURS = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00'
];

export default function Schedule({ 
  queue, 
  onUpdateStatus, 
  onSendWhatsApp,
  barbers,
  services,
  onAddBooking,
  onRemoveBooking
}: ScheduleProps) {
  const [viewMode, setViewMode] = useState<'Daily' | 'Weekly'>('Weekly');
  const [selectedDay, setSelectedDay] = useState<DayType>('Wed'); // Default to Wed (Today)
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // States for Modals
  const [activeSlotDetails, setActiveSlotDetails] = useState<{ day: DayType; hour: string; entry: QueueEntry } | null>(null);
  const [bookingSlot, setBookingSlot] = useState<{ day: DayType; hour: string } | null>(null);

  // Quick book form states
  const [newCustomerName, setNewCustomerName] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState(services[0]?.id || '');
  const [selectedBarberId, setSelectedBarberId] = useState(barbers[0]?.id || '');

  // Calculate dates of the week dynamically based on the current weekOffset
  const getDatesForWeek = (offsetWeeks: number) => {
    // Standard system anchor date (Wednesday, July 8th, 2026)
    const systemToday = new Date('2026-07-08T12:00:00');
    const anchorDate = new Date(systemToday);
    anchorDate.setDate(systemToday.getDate() + offsetWeeks * 7);

    // Find the Monday of that week
    const dayOfWeek = anchorDate.getDay(); // 0 = Sun, 1 = Mon, etc.
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(anchorDate);
    monday.setDate(anchorDate.getDate() + diffToMonday);

    const dates: { day: DayType; label: string; dayNum: number; suffix: string; isToday: boolean }[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);

      const dayNum = d.getDate();
      let suffix = 'th';
      if (dayNum === 1 || dayNum === 21 || dayNum === 31) suffix = 'st';
      else if (dayNum === 2 || dayNum === 22) suffix = 'nd';
      else if (dayNum === 3 || dayNum === 23) suffix = 'rd';

      // Check if it's the exact anchor today date (July 8, 2026)
      const isToday = d.toDateString() === systemToday.toDateString();

      dates.push({
        day: DAYS_OF_WEEK[i],
        label: `${DAYS_OF_WEEK[i]} ${dayNum}${suffix}`,
        dayNum,
        suffix,
        isToday
      });
    }

    // Generate date range string: e.g. "6 — 12 July 2026"
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const monMonth = monday.toLocaleDateString('en-US', { month: 'long' });
    const sunMonth = sunday.toLocaleDateString('en-US', { month: 'long' });
    const yearStr = monday.getFullYear();

    let rangeStr = '';
    if (monMonth === sunMonth) {
      rangeStr = `${monday.getDate()} — ${sunday.getDate()} ${monMonth} ${yearStr}`;
    } else {
      rangeStr = `${monday.getDate()} ${monMonth} — ${sunday.getDate()} ${sunMonth} ${yearStr}`;
    }

    return { dates, rangeStr };
  };

  const { dates: weekDates, rangeStr: weekRangeStr } = getDatesForWeek(weekOffset);

  // Helper to find entry for a slot
  const getEntryForSlot = (day: DayType, hour: string) => {
    return queue.find((item) => {
      if (item.day !== day) return false;
      const cleanTime = item.timeRange.replace('~', '').trim(); // "14:00 - 14:45"
      const parts = cleanTime.split('-');
      if (parts.length > 0) {
        const startTime = parts[0].trim(); // "14:00"
        const [startHour] = startTime.split(':');
        const [targetHour] = hour.split(':');
        return startHour === targetHour;
      }
      return false;
    });
  };

  const getStatusBadgeStyles = (status: QueueStatus) => {
    switch (status) {
      case 'Confirmed':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded-full';
      case 'Estimated':
        return 'bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded-full';
      case 'Pending Reply':
        return 'bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded-full';
      default:
        return 'bg-gray-500/10 text-gray-400 border border-gray-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded-full';
    }
  };

  // WhatsApp nudge handler
  const handleWhatsAppAction = (entry: QueueEntry) => {
    const text = `Halo ${entry.customerName}, konfirmasi jadwal pangkas Anda di Golden Shears untuk hari ${entry.day} ${entry.timeRange}. Apakah sudah sesuai?`;
    onSendWhatsApp(entry.phone, text);
    if (activeSlotDetails && activeSlotDetails.entry.id === entry.id) {
      setActiveSlotDetails(prev => prev ? { ...prev, entry: { ...prev.entry, status: 'Confirmed' } } : null);
    }
  };

  // Quick book slot confirm action
  const handleConfirmQuickBook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingSlot || !newCustomerName.trim() || !onAddBooking) return;

    const matchedService = services.find(s => s.id === selectedServiceId) || services[0];
    const matchedBarber = barbers.find(b => b.id === selectedBarberId) || barbers[0];

    const endH = parseInt(bookingSlot.hour.split(':')[0]);
    const startM = 0;
    const duration = matchedService?.duration || 45;
    const totalMin = endH * 60 + startM + duration;
    const endHourStr = `${Math.floor(totalMin / 60).toString().padStart(2, '0')}:${(totalMin % 60).toString().padStart(2, '0')}`;
    const calculatedTimeRange = `~${bookingSlot.hour} - ${endHourStr}`;

    onAddBooking(
      bookingSlot.day,
      calculatedTimeRange,
      newCustomerName,
      matchedService.name,
      matchedBarber.name
    );

    // reset and close
    setNewCustomerName('');
    setBookingSlot(null);
  };

  // Quick cancel booking
  const handleCancelBooking = (id: string) => {
    if (onRemoveBooking) {
      onRemoveBooking(id);
      setActiveSlotDetails(null);
    }
  };

  // Get active day label for Daily view
  const currentDailyDate = weekDates.find(d => d.day === selectedDay);

  return (
    <div className="space-y-6">
      {/* 1. TOP PREMIUM LOCATION BAR */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-zinc-900 border border-zinc-800 text-gray-400 text-xs px-3.5 py-1.5 rounded-full font-medium flex items-center gap-1.5">
          <MapPin size={12} className="text-amber-500" />
          Jakarta Selatan
        </span>
        <span className="bg-zinc-900 border border-zinc-800 text-gray-400 text-xs px-3.5 py-1.5 rounded-full font-medium">
          Premium Barbershop
        </span>
        <div className="relative">
          <button className="bg-zinc-900 border border-zinc-800 text-white text-xs px-3.5 py-1.5 rounded-full font-medium flex items-center gap-1">
            Golden Shears HQ <ChevronDown size={12} className="text-gray-400" />
          </button>
        </div>
      </div>

      {/* 2. MAIN HEADER TITLE & REPORT ACTIONS */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-display font-extrabold text-white tracking-tight">
            Golden Shears HQ
          </h1>
          <p className="text-sm text-gray-400 font-sans mt-0.5">
            Hourly slot scheduler Board. Seamlessly manage walk-ins and active queues.
          </p>
        </div>

        {/* Generate Report & Notification Icon */}
        <div className="flex items-center gap-2 lg:self-end">
          <button 
            onClick={() => {
              // Simulated dynamic report trigger
              const totalScheduled = queue.length;
              alert(`Report generated successfully!\nTotal Active Appointments this Week: ${totalScheduled}`);
            }}
            className="bg-white hover:bg-zinc-200 text-black text-xs font-bold px-4 py-2.5 rounded-full transition-all cursor-pointer flex items-center gap-1.5 shadow-md active:scale-95"
          >
            <Sparkles size={13} />
            Generate report
          </button>
          
          <button 
            onClick={() => alert("Notification center: All active barber seats are running optimally.")}
            className="p-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-white rounded-full relative transition-all cursor-pointer"
          >
            <Bell size={15} />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 border border-zinc-900" />
          </button>
        </div>
      </div>

      {/* 3. SWITCHER ROW (Daily / Weekly toggle + Date range navigation) */}
      <div className="flex flex-wrap gap-4 items-center justify-between border-t border-b border-zinc-900 py-4">
        {/* Toggle Pills */}
        <div className="flex bg-zinc-950 p-1 rounded-full border border-zinc-900 w-fit">
          <button
            onClick={() => setViewMode('Daily')}
            className={`px-5 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'Daily'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Daily
          </button>
          <button
            onClick={() => setViewMode('Weekly')}
            className={`px-5 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'Weekly'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Weekly
          </button>
        </div>

        {/* Date Selector navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset(prev => prev - 1)}
            className="p-2 bg-zinc-950 hover:bg-zinc-900 border border-zinc-850 hover:border-zinc-700 text-gray-400 hover:text-white rounded-full transition-all cursor-pointer"
            title="Previous Week"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="bg-zinc-950 border border-zinc-850 px-5 py-2 rounded-full text-xs font-semibold font-mono text-gray-300 min-w-[140px] text-center shadow-inner">
            {weekRangeStr}
          </div>
          <button
            onClick={() => setWeekOffset(prev => prev + 1)}
            className="p-2 bg-zinc-950 hover:bg-zinc-900 border border-zinc-850 hover:border-zinc-700 text-gray-400 hover:text-white rounded-full transition-all cursor-pointer"
            title="Next Week"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Mobile view only Horizontal Day Switcher */}
      <div className="flex md:hidden overflow-x-auto pb-2 scrollbar-none gap-2">
        {weekDates.map((dateObj) => {
          const isSelected = selectedDay === dateObj.day;
          return (
            <button
              key={dateObj.day}
              onClick={() => setSelectedDay(dateObj.day)}
              className={`flex-none flex flex-col items-center justify-center w-16 py-3 rounded-2xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-amber-500 border-amber-500 text-black shadow-lg shadow-amber-500/20'
                  : 'bg-[#121212] border-zinc-800/80 text-gray-400 hover:text-white'
              }`}
            >
              <span className="text-[10px] uppercase tracking-wider font-mono font-bold">{dateObj.day}</span>
              <span className="text-sm font-bold mt-1">{dateObj.dayNum}</span>
            </button>
          );
        })}
      </div>

      {/* 4. CALENDAR SCHEDULER VIEWPORT */}
      {viewMode === 'Weekly' ? (
        /* ==================== WEEKLY 7-COLUMN VIEW ==================== */
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3.5 overflow-x-auto pb-4">
          {weekDates.map((dateObj) => {
            const isSelectedMobile = selectedDay === dateObj.day;
            const isToday = dateObj.isToday;

            return (
              <div
                key={dateObj.day}
                className={`flex flex-col rounded-2xl min-w-[150px] min-h-[450px] transition-all duration-300 ${
                  isSelectedMobile ? 'flex' : 'hidden md:flex'
                } ${
                  isToday 
                    ? 'bg-zinc-950 border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.03)]' 
                    : 'bg-[#0A0A0A] border border-zinc-900'
                }`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between p-3.5 border-b border-zinc-900">
                  <span className={`font-display font-bold text-xs ${isToday ? 'text-amber-500' : 'text-gray-400'}`}>
                    {dateObj.label}
                  </span>
                  {isToday && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  )}
                </div>

                {/* Slots List */}
                <div className="p-2 space-y-2.5">
                  {HOURS.map((hour) => {
                    const entry = getEntryForSlot(dateObj.day, hour);

                    if (entry) {
                      // BOOKED SLOT
                      return (
                        <div
                          key={hour}
                          onClick={() => setActiveSlotDetails({ day: dateObj.day, hour, entry })}
                          className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-800/80 hover:border-zinc-700/80 rounded-2xl p-3 h-[78px] flex flex-col justify-between transition-all cursor-pointer relative group"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs text-gray-500 font-medium">{hour}</span>
                            <div className="flex items-center gap-1">
                              <span className={getStatusBadgeStyles(entry.status)}>
                                {entry.status === 'Pending Reply' ? 'Pending' : entry.status}
                              </span>
                              <Info size={10} className="text-gray-500 opacity-60 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                          <div className="text-xs font-bold text-gray-200 truncate pr-1">
                            {entry.customerName}
                          </div>
                        </div>
                      );
                    } else {
                      // AVAILABLE SLOT
                      return (
                        <div
                          key={hour}
                          onClick={() => setBookingSlot({ day: dateObj.day, hour })}
                          className="bg-[#121212]/70 hover:bg-zinc-900 border border-zinc-900 hover:border-amber-500/10 rounded-2xl p-3 h-[78px] flex flex-col justify-between transition-all cursor-pointer group"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-gray-400 group-hover:text-amber-500 transition-colors">
                              {hour}
                            </span>
                            <Plus size={11} className="text-gray-700 group-hover:text-amber-500 group-hover:scale-110 transition-all opacity-0 group-hover:opacity-100" />
                          </div>
                          <span className="text-[10px] text-zinc-600 group-hover:text-zinc-500 font-mono font-medium transition-colors">
                            Rp 150.000
                          </span>
                        </div>
                      );
                    }
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ==================== DAILY VIEW TIMELINE ==================== */
        <div className="bg-[#0A0A0A] border border-zinc-900 rounded-2xl p-6 space-y-6 max-w-3xl mx-auto">
          {/* Header Row */}
          <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
            <div className="flex items-center gap-3">
              <Calendar size={20} className="text-amber-500" />
              <div>
                <h3 className="text-lg font-bold text-white">
                  Daily Schedule for {currentDailyDate?.label || selectedDay}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Detailed timeline view. Create, edit, and monitor active seat allocations.
                </p>
              </div>
            </div>
            <span className="text-xs bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-full text-amber-500 font-mono font-bold">
              {queue.filter(q => q.day === selectedDay).length} Scheduled
            </span>
          </div>

          {/* Timeline Stack */}
          <div className="space-y-4">
            {HOURS.map((hour) => {
              const entry = getEntryForSlot(selectedDay, hour);

              if (entry) {
                // Booked Slot Detailed Row
                return (
                  <div
                    key={hour}
                    className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:border-zinc-700 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      {/* Hour Indicator block */}
                      <div className="bg-[#121212] border border-zinc-800 rounded-xl px-3.5 py-2 text-center min-w-[70px]">
                        <span className="font-mono text-xs text-gray-500 block">TIME</span>
                        <span className="font-mono text-sm font-bold text-white">{hour}</span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-sm">{entry.customerName}</h4>
                          <span className={getStatusBadgeStyles(entry.status)}>
                            {entry.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 font-sans flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Scissors size={11} className="text-amber-500" />
                            {entry.service}
                          </span>
                          <span className="flex items-center gap-1">
                            <User size={11} className="text-teal-400" />
                            {entry.barber}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Action Panel directly shown */}
                    <div className="flex items-center gap-2 sm:self-center">
                      {entry.status === 'Pending Reply' && (
                        <button
                          onClick={() => handleWhatsAppAction(entry)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <MessageSquarePlus size={13} />
                          Nudge
                        </button>
                      )}
                      
                      <button
                        onClick={() => setActiveSlotDetails({ day: selectedDay, hour, entry })}
                        className="p-2 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-amber-500 hover:text-white rounded-xl text-xs transition-all cursor-pointer"
                        title="Edit Booking"
                      >
                        <Info size={13} />
                      </button>

                      <button
                        onClick={() => handleCancelBooking(entry.id)}
                        className="p-2 bg-zinc-950 border border-red-950 text-red-400 hover:bg-red-900/10 rounded-xl text-xs transition-all cursor-pointer"
                        title="Cancel Appointment"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              } else {
                // Available Slot Row
                return (
                  <div
                    key={hour}
                    className="border border-dashed border-zinc-900 rounded-2xl p-4 flex items-center justify-between hover:border-amber-500/20 transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      {/* Hour indicator block */}
                      <div className="bg-[#0A0A0A] border border-zinc-900 rounded-xl px-3.5 py-2 text-center min-w-[70px]">
                        <span className="font-mono text-xs text-zinc-700 block">TIME</span>
                        <span className="font-mono text-sm font-semibold text-zinc-500 group-hover:text-amber-500 transition-colors">
                          {hour}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-600 font-medium">Available Appointment Slot</span>
                        <div className="text-xs text-zinc-500 font-mono mt-0.5">Rp 150.000 (Standard)</div>
                      </div>
                    </div>

                    <button
                      onClick={() => setBookingSlot({ day: selectedDay, hour })}
                      className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white hover:text-amber-500 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-zinc-800 transition-all cursor-pointer"
                    >
                      <Plus size={13} />
                      Book Slot
                    </button>
                  </div>
                );
              }
            })}
          </div>
        </div>
      )}

      {/* 5. LEGEND & STATS BADGES */}
      <div className="bg-[#0A0A0A] border border-zinc-900 rounded-2xl p-4 flex flex-wrap gap-4 items-center justify-between text-xs text-gray-400 font-sans">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="font-semibold text-white">Status badging guide:</span>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span><strong>Confirmed</strong> (Exact slot locked)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span><strong>Estimated</strong> (Queue order)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-500" />
            <span><strong>Pending Reply</strong> (Waiting response)</span>
          </div>
        </div>
      </div>

      {/* ==================== MODAL: QUICK BOOK SLOT ==================== */}
      <AnimatePresence>
        {bookingSlot && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#0F0F0F] border border-zinc-800 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
            >
              <div className="p-5 border-b border-zinc-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                    <Calendar size={16} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Quick Book Appointment</h3>
                    <p className="text-xs text-gray-500 font-sans mt-0.5">
                      {bookingSlot.day} — Slot {bookingSlot.hour}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setBookingSlot(null)}
                  className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-gray-400 hover:text-white rounded-lg transition-all cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleConfirmQuickBook} className="p-5 space-y-4">
                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider font-mono font-bold block">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="e.g. Peter Parker"
                    className="w-full bg-[#121212] border border-zinc-850 text-white text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 font-sans placeholder-gray-600"
                    id="schedule-book-customer-name"
                  />
                </div>

                {/* Service Selection */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider font-mono font-bold block">
                    Select Service
                  </label>
                  <select
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                    className="w-full bg-[#121212] border border-zinc-850 text-white text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 cursor-pointer"
                    id="schedule-book-service-select"
                  >
                    {services.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} — Rp {s.price.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Barber Selection */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider font-mono font-bold block">
                    Select Barber
                  </label>
                  <select
                    value={selectedBarberId}
                    onChange={(e) => setSelectedBarberId(e.target.value)}
                    className="w-full bg-[#121212] border border-zinc-850 text-white text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 cursor-pointer"
                    id="schedule-book-barber-select"
                  >
                    {barbers.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.specialty})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Actions */}
                <div className="flex gap-2.5 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-amber-500/10 active:scale-95"
                  >
                    <Check size={14} />
                    Confirm Booking
                  </button>
                  <button
                    type="button"
                    onClick={() => setBookingSlot(null)}
                    className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 text-gray-400 hover:text-white rounded-xl text-xs transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================== MODAL: BOOKED SLOT DETAILS ==================== */}
      <AnimatePresence>
        {activeSlotDetails && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#0F0F0F] border border-zinc-800 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
            >
              {/* Header */}
              <div className="p-5 border-b border-zinc-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400">
                    <User size={16} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Appointment Details</h3>
                    <p className="text-xs text-gray-500 font-sans mt-0.5">
                      {activeSlotDetails.day} — Slot {activeSlotDetails.hour}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveSlotDetails(null)}
                  className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-gray-400 hover:text-white rounded-lg transition-all cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4">
                {/* Customer name info box */}
                <div className="bg-[#121212] border border-zinc-850 p-4 rounded-xl space-y-1">
                  <span className="text-[9px] text-gray-500 uppercase tracking-wider font-mono font-bold block">
                    Customer Name
                  </span>
                  <div className="text-base font-bold text-white flex items-center gap-2">
                    {activeSlotDetails.entry.customerName}
                    {activeSlotDetails.entry.queueNumber && (
                      <span className="text-[10px] bg-amber-500/10 text-amber-500 font-mono px-1.5 py-0.5 rounded">
                        No. {activeSlotDetails.entry.queueNumber}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 font-mono mt-1">
                    Phone: {activeSlotDetails.entry.phone}
                  </div>
                </div>

                {/* Details layout */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="bg-[#121212] border border-zinc-850 p-3 rounded-xl space-y-1">
                    <span className="text-[9px] text-gray-500 uppercase tracking-wider font-mono font-bold block flex items-center gap-1">
                      <Scissors size={10} className="text-amber-500" /> Service
                    </span>
                    <span className="text-xs font-semibold text-gray-200 block truncate">
                      {activeSlotDetails.entry.service}
                    </span>
                  </div>

                  <div className="bg-[#121212] border border-zinc-850 p-3 rounded-xl space-y-1">
                    <span className="text-[9px] text-gray-500 uppercase tracking-wider font-mono font-bold block flex items-center gap-1">
                      <User size={10} className="text-teal-400" /> Assigned Barber
                    </span>
                    <span className="text-xs font-semibold text-gray-200 block truncate">
                      {activeSlotDetails.entry.barber}
                    </span>
                  </div>
                </div>

                {/* Time range & Status */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="bg-[#121212] border border-zinc-850 p-3 rounded-xl space-y-1">
                    <span className="text-[9px] text-gray-500 uppercase tracking-wider font-mono font-bold block">
                      Time Range
                    </span>
                    <span className="text-xs font-semibold text-gray-200 block font-mono">
                      {activeSlotDetails.entry.timeRange}
                    </span>
                  </div>

                  <div className="bg-[#121212] border border-zinc-850 p-3 rounded-xl space-y-1">
                    <span className="text-[9px] text-gray-500 uppercase tracking-wider font-mono font-bold block">
                      Booking Status
                    </span>
                    <div className="pt-0.5">
                      <span className={getStatusBadgeStyles(activeSlotDetails.entry.status)}>
                        {activeSlotDetails.entry.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions Toolbar */}
                <div className="border-t border-zinc-900 pt-4 space-y-2.5">
                  {activeSlotDetails.entry.status === 'Pending Reply' && (
                    <button
                      onClick={() => handleWhatsAppAction(activeSlotDetails.entry)}
                      className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-emerald-500/10 active:scale-95"
                    >
                      <MessageSquarePlus size={14} />
                      Send WhatsApp Nudge
                    </button>
                  )}

                  {/* Status update selector inside details */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        onUpdateStatus(activeSlotDetails.entry.id, 'Confirmed');
                        setActiveSlotDetails(prev => prev ? { ...prev, entry: { ...prev.entry, status: 'Confirmed' } } : null);
                      }}
                      className="flex-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-850 text-emerald-400 hover:text-emerald-300 font-bold py-2 rounded-xl text-[11px] flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
                    >
                      <Check size={11} /> Confirm
                    </button>
                    <button
                      onClick={() => {
                        onUpdateStatus(activeSlotDetails.entry.id, 'Estimated');
                        setActiveSlotDetails(prev => prev ? { ...prev, entry: { ...prev.entry, status: 'Estimated' } } : null);
                      }}
                      className="flex-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-850 text-amber-500 hover:text-amber-400 font-bold py-2 rounded-xl text-[11px] flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
                    >
                      Set Estimate
                    </button>
                  </div>

                  {/* Cancel Booking option */}
                  <button
                    type="button"
                    onClick={() => handleCancelBooking(activeSlotDetails.entry.id)}
                    className="w-full bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 text-red-400 hover:text-red-300 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                  >
                    <Trash2 size={13} />
                    Cancel Appointment
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

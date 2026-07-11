import React, { useState } from 'react';
import { QueueEntry, QueueStatus, Barber, Service } from '../types';
import { 
  Calendar, Clock, MapPin, User, ChevronRight, ChevronLeft, ChevronDown, 
  Phone, MessageSquarePlus, Info, X, Plus, Trash2, Check, Sparkles, 
  Scissors, Bell, Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '../i18n';
import { SegmentedToggle } from './ui/SegmentedToggle';

interface ScheduleProps {
  queue: QueueEntry[];
  completedEntries: QueueEntry[];
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
  todayKey?: string;
  businessHours: { openHour: number; closeHour: number };
}

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type DayType = typeof DAYS_OF_WEEK[number];

const PIXELS_PER_MINUTE = 1.5;

export default function Schedule({ 
  queue, 
  completedEntries,
  onUpdateStatus, 
  onSendWhatsApp,
  barbers,
  services,
  onAddBooking,
  onRemoveBooking,
  todayKey = 'Wed',
  businessHours
}: ScheduleProps) {
  const { t } = useTranslation();
  
  const [viewMode, setViewMode] = useState<'Daily' | 'Weekly' | 'Monthly'>('Daily');
  const [selectedDay, setSelectedDay] = useState<DayType>(todayKey as DayType);
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [monthOffset, setMonthOffset] = useState<number>(0);
  
  const [filterBarberId, setFilterBarberId] = useState<string>('all');
  const [filterServiceId, setFilterServiceId] = useState<string>('all');
  const [activeMobileBarberIndex, setActiveMobileBarberIndex] = useState<number>(0);

  // Modals state
  const [activeSlotDetails, setActiveSlotDetails] = useState<{ day: DayType; timeRange: string; entry: QueueEntry } | null>(null);
  const [bookingSlot, setBookingSlot] = useState<{ day: DayType; hour: string; barberName: string } | null>(null);

  // Quick book form states
  const [newCustomerName, setNewCustomerName] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState(services[0]?.id || '');
  const [selectedBarberId, setSelectedBarberId] = useState(''); // Populated dynamically

  // Date calculation helpers
  const getDatesForWeek = (offsetWeeks: number) => {
    const systemToday = new Date('2026-07-08T12:00:00'); // Our anchored today is a Wed
    const anchorDate = new Date(systemToday);
    anchorDate.setDate(systemToday.getDate() + offsetWeeks * 7);

    const dayOfWeek = anchorDate.getDay(); 
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(anchorDate);
    monday.setDate(anchorDate.getDate() + diffToMonday);

    const dates: { day: DayType; label: string; dayNum: number; fullDate: Date; isToday: boolean }[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const isToday = d.toDateString() === systemToday.toDateString();
      
      dates.push({
        day: DAYS_OF_WEEK[i],
        label: `${DAYS_OF_WEEK[i]} ${d.getDate()}`,
        dayNum: d.getDate(),
        fullDate: d,
        isToday
      });
    }

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const monMonth = monday.toLocaleDateString('en-US', { month: 'short' });
    const sunMonth = sunday.toLocaleDateString('en-US', { month: 'short' });
    const yearStr = monday.getFullYear();

    const rangeStr = monMonth === sunMonth 
      ? `${monday.getDate()} — ${sunday.getDate()} ${monMonth} ${yearStr}`
      : `${monday.getDate()} ${monMonth} — ${sunday.getDate()} ${sunMonth} ${yearStr}`;

    return { dates, rangeStr };
  };

  const getDatesForMonth = (offsetMonths: number) => {
    const systemToday = new Date('2026-07-08T12:00:00');
    const targetDate = new Date(systemToday.getFullYear(), systemToday.getMonth() + offsetMonths, 1);
    
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const monthName = targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    // Get first day of month (0 = Sun, 1 = Mon)
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const diffToMonday = firstDay === 0 ? 6 : firstDay - 1;
    const days = [];
    
    // Padding from previous month
    for(let i = 0; i < diffToMonday; i++) {
       days.push(null);
    }
    
    for(let i = 1; i <= daysInMonth; i++) {
       const d = new Date(year, month, i);
       days.push({
         dayNum: i,
         day: DAYS_OF_WEEK[d.getDay() === 0 ? 6 : d.getDay() - 1],
         isToday: d.toDateString() === systemToday.toDateString(),
         fullDate: d
       });
    }
    
    return { days, monthName };
  };

  const { dates: weekDates, rangeStr: weekRangeStr } = getDatesForWeek(weekOffset);
  const { days: monthDays, monthName } = getDatesForMonth(monthOffset);

  // Time calculation helpers
  const parseStartMinutes = (timeRange: string): number | null => {
    const match = timeRange.replace('~', '').trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return (parseInt(match[1]) - businessHours.openHour) * 60 + parseInt(match[2]);
  };

  const allEntries = [...queue, ...completedEntries];

  const filteredEntries = allEntries.filter(entry => {
    if (filterBarberId !== 'all') {
      const b = barbers.find(b => b.id === filterBarberId);
      if (b && entry.barber !== b.name) return false;
    }
    if (filterServiceId !== 'all') {
      const s = services.find(s => s.id === filterServiceId);
      if (s && entry.service !== s.name) return false;
    }
    return true;
  });

  const getStatusBadgeStyles = (status: QueueStatus) => {
    switch (status) {
      case 'Confirmed': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'Estimated': return 'bg-amber-500/10 text-amber-500 border border-amber-500/20';
      case 'Pending Reply': return 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
      case 'Completed': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20 opacity-50';
      default: return 'bg-gray-500/10 text-gray-400 border border-gray-500/20';
    }
  };

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

    setNewCustomerName('');
    setBookingSlot(null);
  };

  const handleWhatsAppAction = (entry: QueueEntry) => {
    const text = `Halo ${entry.customerName}, konfirmasi jadwal pangkas Anda di Golden Shears untuk hari ${entry.day} ${entry.timeRange}.`;
    onSendWhatsApp(entry.phone, text);
    if (activeSlotDetails && activeSlotDetails.entry.id === entry.id) {
      setActiveSlotDetails(prev => prev ? { ...prev, entry: { ...prev.entry, status: 'Confirmed' } } : null);
    }
  };

  // Rendering logic for Time Grid Columns
  const renderTimeGridColumn = (barber: Barber, day: DayType) => {
    const barberEntries = filteredEntries.filter(e => e.barber === barber.name && e.day === day && e.status !== 'Estimated');
    const hours = Array.from({ length: businessHours.closeHour - businessHours.openHour + 1 }, (_, i) => i + businessHours.openHour);

    return (
      <div className="flex-1 min-w-[200px] border-r border-zinc-900/50 relative">

        {/* Grid Background Lines */}
        <div className="relative" style={{ height: (businessHours.closeHour - businessHours.openHour + 1) * 60 * PIXELS_PER_MINUTE }}>
          {hours.map(hour => (
            <div 
              key={hour} 
              className="absolute w-full border-t border-zinc-900/40"
              style={{ top: (hour - businessHours.openHour) * 60 * PIXELS_PER_MINUTE }}
              onClick={() => {
                setBookingSlot({ day, hour: `${hour.toString().padStart(2, '0')}:00`, barberName: barber.name });
                setSelectedBarberId(barber.id);
              }}
            >
              <div className="absolute inset-0 hover:bg-zinc-900/20 transition-colors cursor-pointer" style={{ height: 60 * PIXELS_PER_MINUTE }} />
            </div>
          ))}

          {/* Render Blocks */}
          {barberEntries.map(entry => {
            const startM = parseStartMinutes(entry.timeRange);
            if (startM === null) return null;
            const topPx = startM * PIXELS_PER_MINUTE;
            const heightPx = Math.max((entry.durationMinutes || 30) * PIXELS_PER_MINUTE, 24);

            return (
              <div
                key={entry.id}
                onClick={() => setActiveSlotDetails({ day, timeRange: entry.timeRange, entry })}
                className={`absolute left-1 right-1 rounded-xl p-2 cursor-pointer transition-all hover:z-10 hover:shadow-lg ${getStatusBadgeStyles(entry.status)} shadow-black/40 backdrop-blur-sm bg-opacity-80 overflow-hidden`}
                style={{ top: topPx, height: heightPx }}
              >
                <div className="font-bold text-[11px] text-white truncate leading-tight">{entry.customerName}</div>
                <div className="text-[9px] mt-0.5 truncate flex items-center gap-1 opacity-80">
                  <span className="font-mono">{entry.timeRange.replace('~', '')}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const activeBarbers = barbers
    .filter(b => b.status !== 'off')
    .filter(b => filterBarberId === 'all' || b.id === filterBarberId);

  return (
    <div className="space-y-6 max-w-full overflow-hidden flex flex-col h-[calc(100vh-120px)]">
      {/* HEADER & FILTERS */}
      <div className="flex-none space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-display font-extrabold text-white tracking-tight">
              {t('schedule.hqTitle')}
            </h1>
            <p className="text-sm text-gray-400 font-sans mt-0.5">
              {t('schedule.hqSubtitle')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-[#0A0A0A] p-2 rounded-2xl border border-zinc-900 justify-between">
          <div className="flex items-center gap-2">
            <SegmentedToggle
              options={[
                { value: 'Daily', label: t('schedule.daily') as string },
                { value: 'Weekly', label: t('schedule.weekly') as string },
                { value: 'Monthly', label: t('schedule.monthly') as string },
              ]}
              value={viewMode}
              onChange={(v: string) => setViewMode(v as 'Daily' | 'Weekly' | 'Monthly')}
              size="md"
              idPrefix="schedule-view"
            />
            
            <button
              onClick={() => {
                setWeekOffset(0);
                setMonthOffset(0);
                setSelectedDay(todayKey as DayType);
                setViewMode('Daily');
              }}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-gray-300 text-xs font-semibold rounded-xl transition-all cursor-pointer"
            >
              {t('schedule.today')}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl">
              <Filter size={12} className="text-gray-500" />
              <select 
                value={filterBarberId} 
                onChange={e => setFilterBarberId(e.target.value)}
                className="bg-transparent text-xs text-gray-300 outline-none cursor-pointer"
              >
                <option value="all">{t('schedule.filterBarber')}: {t('schedule.filterAll')}</option>
                {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl">
              <select 
                value={filterServiceId} 
                onChange={e => setFilterServiceId(e.target.value)}
                className="bg-transparent text-xs text-gray-300 outline-none cursor-pointer"
              >
                <option value="all">{t('schedule.filterService')}: {t('schedule.filterAll')}</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* VIEWS */}
      <div className="flex-1 min-h-0 flex flex-col">
        {viewMode === 'Daily' && (
          <div className="flex-1 flex flex-col bg-[#050505] border border-zinc-900 rounded-2xl overflow-hidden relative">
            <div className="flex items-center justify-between p-3 border-b border-zinc-900 bg-[#0A0A0A]">
              <div className="flex items-center gap-3">
                <button onClick={() => setWeekOffset(o => o - 1)} className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-zinc-800 rounded-lg text-gray-400 cursor-pointer"><ChevronLeft size={18}/></button>
                <span className="font-bold text-white min-w-[120px] text-center">{weekDates.find(d => d.day === selectedDay)?.label}</span>
                <button onClick={() => setWeekOffset(o => o + 1)} className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-zinc-800 rounded-lg text-gray-400 cursor-pointer"><ChevronRight size={18}/></button>
              </div>
            </div>

            {/* Mobile Barber Tabs */}
            <div className="flex lg:hidden border-b border-zinc-900 overflow-x-auto scrollbar-none bg-[#0A0A0A]">
              {activeBarbers.map((b, idx) => (
                <button
                  key={b.id}
                  onClick={() => setActiveMobileBarberIndex(idx)}
                  className={`flex-1 min-w-0 py-2.5 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all border-b-2 ${
                    activeMobileBarberIndex === idx
                      ? 'border-amber-500 text-amber-500 bg-amber-500/5'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {b.name.split(' ')[0]}
                </button>
              ))}
            </div>

            {/* Scrollable Grid Area (Handles both H & V scrolling, ensuring perfect alignment) */}
            <div className="flex-1 overflow-auto min-h-0 relative">
              <div className="flex flex-col min-w-max">
                
                {/* Fixed Barber Header Row (Inside scroll container to sync widths) */}
                <div className="flex flex-none border-b border-zinc-900 bg-[#0A0A0A] sticky top-0 z-20">
                  <div className="w-[60px] flex-none bg-[#0A0A0A] sticky left-0 z-30" /> {/* Spacer for time axis */}
                  <div className="flex w-full">
                    {activeBarbers.map((b, idx) => (
                      <div key={b.id} className={`w-[250px] lg:min-w-[200px] lg:flex-1 p-3 text-center border-r border-zinc-900/50 ${activeMobileBarberIndex === idx ? 'block' : 'hidden lg:block'}`}>
                        <div className="font-bold text-sm text-white">{b.name}</div>
                        <div className="text-[10px] text-gray-500 uppercase font-mono tracking-wider mt-0.5 flex justify-center gap-1">
                          {b.status === 'break' && <span className="text-amber-500">{t('overview.statusBreak')}</span>}
                          {b.status === 'active' && <span className="text-teal-500">{t('overview.statusOnSeat')}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Grid Body */}
                <div className="flex flex-1 relative">
                  {/* Time Axis */}
                  <div className="w-[60px] flex-none border-r border-zinc-900 bg-[#0A0A0A] sticky left-0 z-10">
                   {Array.from({ length: businessHours.closeHour - businessHours.openHour + 1 }, (_, i) => i + businessHours.openHour).map(hour => (
                     <div key={hour} className={`absolute w-full text-right pr-2 text-[10px] text-gray-500 font-mono ${hour === businessHours.openHour ? 'translate-y-1' : '-translate-y-2'}`} style={{ top: (hour - businessHours.openHour) * 60 * PIXELS_PER_MINUTE }}>
                       {hour.toString().padStart(2, '0')}:00
                     </div>
                   ))}
                </div>
                
                {/* Columns */}
                <div className="flex w-full">
                  {activeBarbers.map((b, idx) => (
                    <div key={b.id} className={`w-[250px] lg:flex-1 lg:min-w-[200px] ${activeMobileBarberIndex === idx ? 'block' : 'hidden lg:block'}`}>
                      {renderTimeGridColumn(b, selectedDay)}
                    </div>
                  ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'Weekly' && (
          <div className="flex-1 overflow-y-auto bg-[#050505] rounded-2xl border border-zinc-900 p-4 space-y-4">
             <div className="flex items-center gap-3 mb-4">
                <button onClick={() => setWeekOffset(o => o - 1)} className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-zinc-900 rounded-full text-gray-400 hover:text-white cursor-pointer"><ChevronLeft size={18}/></button>
                <span className="font-bold text-white text-lg">{weekRangeStr}</span>
                <button onClick={() => setWeekOffset(o => o + 1)} className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-zinc-900 rounded-full text-gray-400 hover:text-white cursor-pointer"><ChevronRight size={18}/></button>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
               {weekDates.map(date => {
                 const dayEntries = filteredEntries.filter(e => e.day === date.day && e.status !== 'Estimated');
                 return (
                   <div key={date.day} className={`bg-[#0A0A0A] border rounded-2xl p-4 flex flex-col gap-3 ${date.isToday ? 'border-amber-500/50 shadow-lg shadow-amber-500/5' : 'border-zinc-900'}`}>
                     <div className="flex justify-between items-center">
                       <div>
                         <div className="text-[10px] font-mono uppercase text-gray-500">{date.day}</div>
                         <div className={`font-bold text-xl ${date.isToday ? 'text-amber-500' : 'text-white'}`}>{date.dayNum}</div>
                       </div>
                       <button onClick={() => { setSelectedDay(date.day); setViewMode('Daily'); }} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-xs bg-zinc-900 rounded-xl text-gray-400 hover:text-white cursor-pointer transition-colors">View</button>
                     </div>
                     <div className="space-y-2 flex-1">
                       {dayEntries.length === 0 ? (
                         <div className="text-xs text-zinc-400 italic py-2">{t('schedule.noEntriesForDay')}</div>
                       ) : (
                         dayEntries.slice(0, 5).map(e => (
                           <div key={e.id} onClick={() => { setSelectedDay(date.day); setViewMode('Daily'); }} className={`p-2 rounded-xl border text-xs flex justify-between items-center cursor-pointer hover:opacity-80 transition-opacity ${getStatusBadgeStyles(e.status)}`}>
                             <span className="font-bold truncate">{e.customerName}</span>
                             <span className="font-mono text-[9px] opacity-80 shrink-0 ml-2">{e.timeRange.replace('~','').split('-')[0]}</span>
                           </div>
                         ))
                       )}
                       {dayEntries.length > 5 && (
                         <div className="text-[10px] text-center text-gray-500 py-1">{t('schedule.moreEntries').replace('{n}', (dayEntries.length - 5).toString())}</div>
                       )}
                     </div>
                   </div>
                 );
               })}
             </div>
          </div>
        )}

        {viewMode === 'Monthly' && (
          <div className="bg-[#050505] rounded-2xl border border-zinc-900 p-4">
             <div className="flex items-center justify-between mb-4 flex-none">
                <h2 className="text-xl font-bold text-white flex items-center gap-3">
                  <button onClick={() => setMonthOffset(o => o - 1)} className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-zinc-900 rounded-full text-gray-400 hover:text-white cursor-pointer"><ChevronLeft size={18}/></button>
                  {monthName}
                  <button onClick={() => setMonthOffset(o => o + 1)} className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-zinc-900 rounded-full text-gray-400 hover:text-white cursor-pointer"><ChevronRight size={18}/></button>
                </h2>
             </div>
             
             <div className="grid grid-cols-7 gap-2 mb-2">
               {DAYS_OF_WEEK.map(d => <div key={d} className="text-center text-xs font-mono font-bold text-gray-500 uppercase">{d}</div>)}
             </div>
             
             <div className="grid grid-cols-7 gap-[1px] bg-zinc-900/50 rounded-xl overflow-hidden">
               {monthDays.map((md, idx) => {
                 if (!md) return <div key={`empty-${idx}`} className="bg-[#050505] min-h-[70px] sm:min-h-[90px]" />;
                 const dayEntries = filteredEntries.filter(e => e.day === md.day);
                 const uniqueStatuses = [...new Set(dayEntries.map(e => e.status))].slice(0, 3);
                 const hasOverflow = [...new Set(dayEntries.map(e => e.status))].length > 3;

                 return (
                   <div 
                     key={idx} 
                     onClick={() => { setSelectedDay(md.day); setViewMode('Daily'); }} 
                     className={`bg-[#0A0A0A] hover:bg-zinc-900 min-h-[70px] sm:min-h-[90px] cursor-pointer transition-colors flex flex-col p-2 gap-1 ${md.isToday ? 'ring-1 ring-inset ring-amber-500/50' : ''}`}
                   >
                     <span className={`text-xs font-bold self-end ${md.isToday ? 'text-amber-500' : 'text-gray-400'}`}>{md.dayNum}</span>
                     <div className="flex items-center gap-1 flex-wrap mt-auto">
                       {uniqueStatuses.map(status => (
                         <span
                           key={status}
                           className={`h-1.5 w-1.5 rounded-full ${
                             status === 'Confirmed' ? 'bg-emerald-400' :
                             status === 'Estimated' ? 'bg-amber-400' :
                             status === 'Pending Reply' ? 'bg-sky-400' :
                             'bg-blue-400 opacity-50'
                           }`}
                         />
                       ))}
                       {hasOverflow && <span className="h-1.5 w-1.5 rounded-full bg-gray-500" />}
                     </div>
                   </div>
                 );
               })}
             </div>
          </div>
        )}
      </div>

      {/* ESTIMATED QUEUE PANEL */}
      {filteredEntries.some(e => e.day === selectedDay && e.status === 'Estimated') && (
        <div className="flex-none bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
             <Clock size={16} className="text-amber-500" />
             <h3 className="font-bold text-amber-500 text-sm">{t('schedule.estimatedQueue')}</h3>
             <span className="text-xs text-amber-500/70 ml-2 hidden sm:inline">({t('schedule.estimatedQueueDesc')})</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
            {filteredEntries.filter(e => e.day === selectedDay && e.status === 'Estimated').map(entry => (
              <div key={entry.id} onClick={() => setActiveSlotDetails({ day: selectedDay, timeRange: entry.timeRange, entry })} className="flex-none bg-[#0A0A0A] border border-amber-500/30 rounded-xl p-3 w-[200px] cursor-pointer hover:bg-zinc-900 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div className="font-bold text-white text-sm truncate">{entry.customerName}</div>
                  {entry.queueNumber && <div className="bg-amber-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded">No. {entry.queueNumber}</div>}
                </div>
                <div className="text-xs text-gray-400 truncate flex items-center gap-1.5"><User size={10}/> {entry.barber}</div>
                <div className="text-xs text-gray-400 truncate flex items-center gap-1.5"><Scissors size={10}/> {entry.service}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODALS */}
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
                    <h3 className="font-bold text-white text-base">{t('schedule.quickBookTitle')}</h3>
                    <p className="text-xs text-gray-500 font-sans mt-0.5">
                      {bookingSlot.day} — {t('schedule.slot')} {bookingSlot.hour}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setBookingSlot(null)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 text-gray-400 hover:text-white rounded-lg transition-all cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleConfirmQuickBook} className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider font-mono font-bold block">{t('schedule.customerName')}</label>
                  <input type="text" required value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} placeholder={t('schedule.customerNamePlaceholder')} className="w-full bg-[#121212] border border-zinc-850 text-white text-sm rounded-xl px-3.5 py-2.5 focus:border-amber-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider font-mono font-bold block">{t('schedule.selectService')}</label>
                  <select value={selectedServiceId} onChange={e => setSelectedServiceId(e.target.value)} className="w-full bg-[#121212] border border-zinc-850 text-white text-sm rounded-xl px-3.5 py-2.5 focus:border-amber-500 outline-none cursor-pointer">
                    {services.map(s => <option key={s.id} value={s.id}>{s.name} — Rp {s.price.toLocaleString()}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider font-mono font-bold block">{t('schedule.selectBarber')}</label>
                  <select value={selectedBarberId} onChange={e => setSelectedBarberId(e.target.value)} className="w-full bg-[#121212] border border-zinc-850 text-white text-sm rounded-xl px-3.5 py-2.5 focus:border-amber-500 outline-none cursor-pointer">
                    {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2.5 pt-2">
                  <button type="submit" className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/10 cursor-pointer"><Check size={14} /> {t('schedule.confirmBooking')}</button>
                  <button type="button" onClick={() => setBookingSlot(null)} className="px-4 py-2.5 bg-zinc-900 border border-zinc-850 text-gray-400 hover:text-white rounded-xl text-xs cursor-pointer">{t('requests.cancel')}</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeSlotDetails && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0, scale: 0.95, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 15 }} className="bg-[#0F0F0F] border border-zinc-800 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl">
               <div className="p-5 border-b border-zinc-900 flex justify-between items-center">
                 <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400"><User size={16}/></div>
                    <div>
                      <div className="font-bold text-white text-base">{t('schedule.appointmentDetails')}</div>
                      <div className="text-xs text-gray-500 font-sans mt-0.5">{activeSlotDetails.day} — {activeSlotDetails.timeRange}</div>
                    </div>
                 </div>
                 <button onClick={() => setActiveSlotDetails(null)} className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 rounded-lg text-gray-400 cursor-pointer"><X size={15}/></button>
               </div>
               
               <div className="p-5 space-y-4">
                 <div className="bg-[#121212] border border-zinc-850 p-4 rounded-xl space-y-1">
                   <div className="text-[9px] text-gray-500 uppercase font-mono font-bold">{t('schedule.customerName')}</div>
                   <div className="text-base font-bold text-white flex items-center gap-2">
                     {activeSlotDetails.entry.customerName}
                     {activeSlotDetails.entry.queueNumber && <span className="text-[10px] bg-amber-500/10 text-amber-500 font-mono px-1.5 py-0.5 rounded">No. {activeSlotDetails.entry.queueNumber}</span>}
                   </div>
                   <div className="text-xs text-gray-400 font-mono">{t('schedule.phone')} {activeSlotDetails.entry.phone}</div>
                 </div>
                 <div className="grid grid-cols-2 gap-3.5">
                   <div className="bg-[#121212] border border-zinc-850 p-3 rounded-xl">
                     <div className="text-[9px] text-gray-500 uppercase font-mono font-bold mb-1 flex items-center gap-1"><Scissors size={10} className="text-amber-500"/> {t('requests.service')}</div>
                     <div className="text-xs font-semibold text-gray-200 truncate">{activeSlotDetails.entry.service}</div>
                   </div>
                   <div className="bg-[#121212] border border-zinc-850 p-3 rounded-xl">
                     <div className="text-[9px] text-gray-500 uppercase font-mono font-bold mb-1 flex items-center gap-1"><User size={10} className="text-teal-400"/> {t('schedule.assignedBarber')}</div>
                     <div className="text-xs font-semibold text-gray-200 truncate">{activeSlotDetails.entry.barber}</div>
                   </div>
                 </div>
                 
                 <div className="border-t border-zinc-900 pt-4 space-y-2.5">
                    {activeSlotDetails.entry.status === 'Pending Reply' && (
                      <button onClick={() => handleWhatsAppAction(activeSlotDetails.entry)} className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-bold py-2.5 px-4 rounded-xl text-xs flex justify-center gap-1.5 cursor-pointer transition-colors">
                        <MessageSquarePlus size={14} /> {t('schedule.sendWhatsAppNudge')}
                      </button>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => { onUpdateStatus(activeSlotDetails.entry.id, 'Confirmed'); setActiveSlotDetails(null); }} className="flex-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-850 text-emerald-400 font-bold rounded-xl text-[11px] flex justify-center items-center min-h-[44px] gap-1 cursor-pointer transition-colors"><Check size={11} /> {t('schedule.confirm')}</button>
                      <button onClick={() => { onRemoveBooking && onRemoveBooking(activeSlotDetails.entry.id); setActiveSlotDetails(null); }} className="min-w-[44px] min-h-[44px] bg-zinc-900 hover:bg-red-900/20 border border-red-950 text-red-400 rounded-xl flex justify-center items-center cursor-pointer transition-colors"><Trash2 size={13}/></button>
                    </div>
                 </div>
               </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

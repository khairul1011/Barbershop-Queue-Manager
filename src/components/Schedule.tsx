import React, { useState } from 'react';
import { QueueEntry, QueueStatus, Barber, Service } from '../types';
import { 
  Calendar, Clock, MapPin, User, ChevronRight, ChevronLeft, ChevronDown, 
  Phone, MessageSquarePlus, Info, X, Plus, Trash2, Check, Sparkles, 
  Scissors, Bell, Filter, Edit2
} from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from '../i18n';
import { SegmentedToggle } from './ui/SegmentedToggle';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface ScheduleProps {
  queue: QueueEntry[];
  servingSessions?: Record<string, QueueEntry | null>;
  completedEntries: QueueEntry[];
  onUpdateStatus: (id: string, newStatus: QueueStatus, scheduledTime?: string) => void;
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
  currentTime?: Date;
  businessHours: { openHour: number; closeHour: number };
}

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type DayType = typeof DAYS_OF_WEEK[number];

const PIXELS_PER_MINUTE = 2.5;

export default function Schedule({ 
  queue, 
  servingSessions,
  completedEntries,
  onUpdateStatus, 
  onSendWhatsApp,
  barbers,
  services,
  onAddBooking,
  onRemoveBooking,
  todayKey = 'Wed',
  currentTime,
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
  const [confirmTime, setConfirmTime] = useState('');
  const [bookingSlot, setBookingSlot] = useState<{ day: DayType; hour: string; barberName: string } | null>(null);

  // Quick book form states
  const [newCustomerName, setNewCustomerName] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState(services[0]?.id || '');
  const [selectedBarberId, setSelectedBarberId] = useState(''); // Populated dynamically

  // Date calculation helpers
  const jumpToDate = (targetDate: Date) => {
    const systemToday = currentTime || new Date();
    
    const today = new Date(systemToday.getFullYear(), systemToday.getMonth(), systemToday.getDate());
    const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    
    const todayDay = today.getDay();
    const diffToMondayToday = todayDay === 0 ? -6 : 1 - todayDay;
    const mondayToday = new Date(today);
    mondayToday.setDate(today.getDate() + diffToMondayToday);
    
    const targetDay = target.getDay();
    const diffToMondayTarget = targetDay === 0 ? -6 : 1 - targetDay;
    const mondayTarget = new Date(target);
    mondayTarget.setDate(target.getDate() + diffToMondayTarget);
    
    const diffTime = mondayTarget.getTime() - mondayToday.getTime();
    const diffWeeks = Math.round(diffTime / (1000 * 60 * 60 * 24 * 7));
    
    setWeekOffset(diffWeeks);
    
    const targetDayOfWeek = DAYS_OF_WEEK[targetDay === 0 ? 6 : targetDay - 1];
    setSelectedDay(targetDayOfWeek as DayType);
    setViewMode('Daily');
  };

  const getDatesForWeek = (offsetWeeks: number) => {
    const systemToday = currentTime || new Date();
    const anchorDate = new Date(systemToday);
    anchorDate.setDate(systemToday.getDate() + offsetWeeks * 7);

    const dayOfWeek = anchorDate.getDay(); 
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(anchorDate);
    monday.setDate(anchorDate.getDate() + diffToMonday);

    const dates: { day: DayType; label: string; dayNum: number; fullDate: Date; fullDateString: string; isToday: boolean }[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const isToday = d.toDateString() === systemToday.toDateString();
      const fullDateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dates.push({
        day: DAYS_OF_WEEK[i],
        label: `${DAYS_OF_WEEK[i]} ${d.getDate()}`,
        dayNum: d.getDate(),
        fullDate: d,
        fullDateString,
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
    const systemToday = currentTime || new Date();
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
       const fullDateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
       days.push({
         dayNum: i,
         day: DAYS_OF_WEEK[d.getDay() === 0 ? 6 : d.getDay() - 1],
         isToday: d.toDateString() === systemToday.toDateString(),
         fullDate: d,
         fullDateString
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

  const servingEntries = servingSessions ? (Object.values(servingSessions).filter(Boolean) as QueueEntry[]) : [];
  const allEntries = [...queue, ...completedEntries, ...servingEntries];

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

  const getStatusBadgeStyles = (entry: QueueEntry) => {
    if (entry.completedAt) {
      return 'bg-zinc-800/80 text-gray-500 border border-zinc-700/50 opacity-60';
    }
    if (entry.startedAt && !entry.completedAt) {
      return 'bg-violet-500/20 text-violet-300 border border-violet-500/50 shadow-[0_0_15px_rgba(139,92,246,0.15)] ring-1 ring-violet-500/50';
    }
    switch (entry.status) {
      case 'Confirmed': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'Estimated': return 'bg-amber-500/10 text-amber-500 border border-amber-500/20';
      case 'Pending Reply': return 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
      case 'Completed': return 'bg-zinc-800/80 text-gray-500 border border-zinc-700/50 opacity-60';
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
    const currentDateString = weekDates.find(d => d.day === day)?.fullDateString;
    const barberEntries = filteredEntries.filter(e => e.barber === barber.name && e.scheduledDate === currentDateString && e.status !== 'Estimated');
    const hours = Array.from({ length: businessHours.closeHour - businessHours.openHour + 1 }, (_, i) => i + businessHours.openHour);

    // 1. Process entries with start/end minutes
    const entriesWithTime = barberEntries.map(entry => {
      const startM = parseStartMinutes(entry.timeRange);
      const duration = entry.durationMinutes || 30; // Fallback to 30 mins
      return {
        ...entry,
        startM,
        endM: startM !== null ? startM + duration : null
      };
    }).filter((e): e is (QueueEntry & { startM: number; endM: number }) => e.startM !== null);

    // 2. Sort entries
    entriesWithTime.sort((a, b) => a.startM - b.startM || b.endM - a.endM);

    // 3. Group into overlapping clusters
    const clusters: (typeof entriesWithTime)[] = [];
    let currentCluster: typeof entriesWithTime = [];
    let clusterEnd = 0;

    entriesWithTime.forEach(entry => {
      if (currentCluster.length > 0 && entry.startM >= clusterEnd) {
        clusters.push(currentCluster);
        currentCluster = [];
      }
      currentCluster.push(entry);
      clusterEnd = Math.max(clusterEnd, entry.endM);
    });
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    // 4. Position entries within clusters
    const positionedEntries: { entry: QueueEntry, topPx: number, heightPx: number, left: string, width: string }[] = [];

    clusters.forEach(cluster => {
      const columns: (typeof entriesWithTime)[] = [];
      cluster.forEach(entry => {
        let placed = false;
        for (let i = 0; i < columns.length; i++) {
          const col = columns[i];
          const overlaps = col.some(e => Math.max(entry.startM, e.startM) < Math.min(entry.endM, e.endM));
          if (!overlaps) {
            col.push(entry);
            placed = true;
            break;
          }
        }
        if (!placed) {
          columns.push([entry]);
        }
      });

      const numCols = columns.length;
      columns.forEach((col, colIdx) => {
        col.forEach(entry => {
          // Calculate colspan greedily
          let colspan = 1;
          for (let i = colIdx + 1; i < columns.length; i++) {
            const overlaps = columns[i].some(e => Math.max(entry.startM, e.startM) < Math.min(entry.endM, e.endM));
            if (!overlaps) {
              colspan++;
            } else {
              break;
            }
          }

          positionedEntries.push({
            entry,
            topPx: entry.startM * PIXELS_PER_MINUTE,
            heightPx: Math.max((entry.endM - entry.startM) * PIXELS_PER_MINUTE, 44),
            left: `calc(${colIdx * 100 / numCols}% + 8px)`, // 8px for left margin per UI/UX rules
            width: `calc(${colspan * 100 / numCols}% - 16px)`, // 16px for left+right margins
          });
        });
      });
    });

    return (
      <>
        {/* Grid Background Lines */}
        <div className="relative w-full" style={{ height: (businessHours.closeHour - businessHours.openHour + 1) * 60 * PIXELS_PER_MINUTE }}>
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
              <div className="absolute inset-0 active:bg-amber-500/10 hover:bg-zinc-900/20 transition-colors cursor-pointer" style={{ height: 60 * PIXELS_PER_MINUTE }} />
            </div>
          ))}

          {/* Render Blocks */}
          {positionedEntries.map(({ entry, topPx, heightPx, left, width }) => {
            const isSmall = heightPx <= 60;
            return (
              <div
                key={entry.id}
                onClick={() => setActiveSlotDetails({ day, timeRange: entry.timeRange, entry })}
                className={`absolute rounded-xl ${isSmall ? 'py-1 px-2 justify-center' : 'p-2'} cursor-pointer transition-all hover:z-20 ${getStatusBadgeStyles(entry)} shadow-black/40 backdrop-blur-sm bg-opacity-80 overflow-hidden flex flex-col`}
                style={{ top: topPx, height: heightPx, left, width }}
              >
                <div className="flex justify-between items-start gap-1">
                  <div className="font-bold text-[11px] text-white truncate leading-tight">
                    {entry.customerName}
                    {isSmall && <span className="font-normal opacity-70 ml-1">· {entry.service}</span>}
                  </div>
                  {entry.startedAt && !entry.completedAt && (
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0 mt-1 animate-pulse" />
                  )}
                </div>
                {!isSmall && (
                  <div className="text-[9px] font-mono opacity-60 flex items-center mt-0.5">
                    ~{entry.timeRange.replace('~', '').trim()}
                  </div>
                )}
                {!isSmall && (
                  <div className="text-[9px] font-medium opacity-80 mt-1.5 flex items-center gap-1 truncate">
                    <Scissors size={8} className="shrink-0" />
                    <span className="truncate">{entry.service}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  const activeBarbers = barbers
    .filter(b => b.status !== 'off')
    .filter(b => filterBarberId === 'all' || b.id === filterBarberId);

  return (
    <div className="space-y-6 max-w-full">
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
            <p className="text-[10px] sm:hidden text-amber-500/70 font-mono mt-2">
              (Ketuk area grid kosong untuk menjadwalkan)
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
            
            <Button
              variant="secondary"
              className="h-[42px] px-4 text-xs font-semibold"
              onClick={() => {
                setWeekOffset(0);
                setMonthOffset(0);
                setSelectedDay(todayKey as DayType);
                setViewMode('Daily');
              }}
            >
              {t('schedule.today')}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 h-[42px] bg-zinc-950 border border-zinc-800 rounded-xl">
              <Filter size={14} className="text-gray-500" />
              <Select value={filterBarberId} onValueChange={setFilterBarberId}>
                <SelectTrigger className="w-[130px] h-full border-none bg-transparent shadow-none px-0 py-0 focus:ring-0 text-xs text-gray-300">
                  <SelectValue placeholder={t('schedule.filterAll')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('schedule.filterBarber')}: {t('schedule.filterAll')}</SelectItem>
                  {barbers.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 px-3 h-[42px] bg-zinc-950 border border-zinc-800 rounded-xl">
              <Select value={filterServiceId} onValueChange={setFilterServiceId}>
                <SelectTrigger className="w-[120px] h-full border-none bg-transparent shadow-none px-0 py-0 focus:ring-0 text-xs text-gray-300">
                  <SelectValue placeholder={t('schedule.filterAll')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('requests.service')}: {t('schedule.filterAll')}</SelectItem>
                  {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* VIEWS */}
      <div className="flex flex-col">
        {viewMode === 'Daily' && (
          <div className="flex flex-col bg-[#050505] border border-zinc-900 rounded-2xl overflow-hidden relative">
            <div className="flex items-center justify-between p-3 border-b border-zinc-900 bg-[#0A0A0A]">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const currentIndex = DAYS_OF_WEEK.indexOf(selectedDay);
                    if (currentIndex === 0) {
                      setWeekOffset(o => o - 1);
                      setSelectedDay('Sun');
                    } else {
                      setSelectedDay(DAYS_OF_WEEK[currentIndex - 1]);
                    }
                  }} 
                  className="hover:bg-zinc-800 text-gray-400"
                >
                  <ChevronLeft size={18}/>
                </Button>
                <span className="font-bold text-white min-w-[120px] text-center">{weekDates.find(d => d.day === selectedDay)?.label}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const currentIndex = DAYS_OF_WEEK.indexOf(selectedDay);
                    if (currentIndex === 6) {
                      setWeekOffset(o => o + 1);
                      setSelectedDay('Mon');
                    } else {
                      setSelectedDay(DAYS_OF_WEEK[currentIndex + 1]);
                    }
                  }} 
                  className="hover:bg-zinc-800 text-gray-400"
                >
                  <ChevronRight size={18}/>
                </Button>
              </div>
            </div>

            {/* Mobile Barber Tabs */}
            <div className="flex lg:hidden border-b border-zinc-900 overflow-x-auto scrollbar-none bg-[#0A0A0A] sticky top-[64px] md:top-[72px] z-30">
              {activeBarbers.map((b, idx) => (
                <Button
                  variant="ghost"
                  key={b.id}
                  onClick={() => setActiveMobileBarberIndex(idx)}
                  className={`flex-1 rounded-none border-b-2 py-2.5 h-auto ${
                    activeMobileBarberIndex === idx
                      ? 'border-amber-500 text-amber-500 bg-amber-500/5'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {b.name.split(' ')[0]}
                </Button>
              ))}
            </div>

            {/* Scrollable Container for both Headers and Grid */}
            <div className="relative flex flex-col overflow-x-auto bg-[#0A0A0A]">
              
              {/* BARBER HEADERS (Sticky Desktop) */}
              <div className="hidden lg:flex border-b border-zinc-900 bg-[#0A0A0A] sticky top-[64px] md:top-[72px] z-30 min-w-min">
                <div className="w-[60px] flex-none border-r border-zinc-900 bg-[#0A0A0A] sticky left-0 z-40"></div>
                <div className="flex flex-1">
                  {activeBarbers.map(b => (
                    <div key={b.id} className="w-[250px] lg:flex-1 lg:min-w-[200px] p-3 text-center border-r border-zinc-900/50">
                      <div className="font-bold text-sm text-white">{b.name}</div>
                      <div className="text-[10px] text-gray-500 uppercase font-mono tracking-wider mt-0.5 flex justify-center gap-1">
                        {b.status === 'break' && <span className="text-amber-500">{t('overview.statusBreak')}</span>}
                        {b.status === 'active' && <span className="text-teal-500">{t('overview.statusOnSeat')}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Grid Area */}
              <div className="relative flex min-w-min pt-4 pb-4">
                {/* Time Axis */}
                <div className="w-[60px] flex-none border-r border-zinc-900 bg-[#0A0A0A] sticky left-0 z-20">
                     {Array.from({ length: businessHours.closeHour - businessHours.openHour + 1 }, (_, i) => i + businessHours.openHour).map(hour => (
                       <div key={hour} className={`absolute w-full text-right pr-2 text-xs text-gray-500 font-mono ${hour === businessHours.openHour ? 'translate-y-1' : '-translate-y-2'}`} style={{ top: (hour - businessHours.openHour) * 60 * PIXELS_PER_MINUTE }}>
                         {hour.toString().padStart(2, '0')}:00
                       </div>
                     ))}
                  </div>
                  
                  {/* Columns */}
                  <div className="flex flex-1">
                    {activeBarbers.map((b, idx) => (
                      <div key={b.id} className={`w-[250px] lg:flex-1 lg:min-w-[200px] ${activeMobileBarberIndex === idx ? 'block' : 'hidden lg:block'}`}>
                        {renderTimeGridColumn(b, selectedDay)}
                      </div>
                    ))}
                  </div>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'Weekly' && (
          <div className="flex-1 overflow-y-auto bg-[#050505] rounded-2xl border border-zinc-900 p-4 space-y-4">
             <div className="flex items-center gap-3 mb-4">
                <Button variant="secondary" size="icon" onClick={() => setWeekOffset(o => o - 1)}>
                  <ChevronLeft size={18}/>
                </Button>
                <span className="font-bold text-white text-lg">{weekRangeStr}</span>
                <Button variant="secondary" size="icon" onClick={() => setWeekOffset(o => o + 1)}>
                  <ChevronRight size={18}/>
                </Button>
             </div>
             
             <div className="flex flex-col gap-4">
               {weekDates.map(date => {
                 const dayEntries = filteredEntries.filter(e => e.scheduledDate === date.fullDateString && e.status !== 'Estimated');
                 // Sort entries by time
                 dayEntries.sort((a, b) => {
                   const startA = parseStartMinutes(a.timeRange) || 0;
                   const startB = parseStartMinutes(b.timeRange) || 0;
                   return startA - startB;
                 });
                 
                 return (
                   <div key={date.day} className={`bg-[#0A0A0A] border rounded-2xl flex overflow-hidden ${date.isToday ? 'border-amber-500/50 shadow-lg shadow-amber-500/5 ring-1 ring-inset ring-amber-500/20' : 'border-zinc-900'}`}>
                     
                     {/* Left: Date Header */}
                     <div className="w-[72px] sm:w-[80px] p-3 sm:p-4 flex flex-col items-center justify-center border-r border-zinc-900/80 bg-[#050505] shrink-0">
                       <div className="text-[10px] font-mono uppercase text-gray-500">{date.day}</div>
                       <div className={`mt-1 flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full ${date.isToday ? 'bg-amber-500/10 text-amber-500 font-extrabold text-lg sm:text-xl' : 'text-white font-bold text-lg sm:text-xl'}`}>
                         {date.dayNum}
                       </div>
                       <Button variant="ghost" size="sm" onClick={() => { setSelectedDay(date.day); setViewMode('Daily'); }} className="mt-2 sm:mt-3 text-[9px] uppercase tracking-wider text-gray-500 hover:text-amber-500 font-bold transition-colors">
                         View
                       </Button>
                     </div>

                     {/* Right: Entries List */}
                     <div className="flex-1 p-3 sm:p-4 flex flex-col gap-2 relative min-w-0">
                       {dayEntries.length === 0 ? (
                         <div className="h-full flex items-center justify-center min-h-[60px]">
                           <span className="text-xs text-zinc-500 italic">{t('schedule.noEntriesForDay')}</span>
                         </div>
                       ) : (
                         <div className="flex flex-col gap-2">
                           {dayEntries.slice(0, 4).map(e => {
                             const isConfirmed = e.status === 'Confirmed';
                             const isCompleted = !!e.completedAt;
                             const isServing = e.startedAt && !e.completedAt;
                             
                             let borderLeftColor = 'border-l-zinc-700';
                             if (isServing) borderLeftColor = 'border-l-violet-500';
                             else if (isConfirmed) borderLeftColor = 'border-l-emerald-500';
                             else if (e.status === 'Pending Reply') borderLeftColor = 'border-l-sky-500';
                             
                             return (
                               <div 
                                 key={e.id} 
                                 onClick={() => { setSelectedDay(date.day); setViewMode('Daily'); }} 
                                 className={`p-2.5 sm:p-3 rounded-xl border border-zinc-800 bg-[#121212] border-l-[3px] ${borderLeftColor} text-xs flex justify-between items-center cursor-pointer hover:bg-zinc-800/50 transition-colors ${isCompleted ? 'opacity-50 grayscale' : ''}`}
                               >
                                 <div className="flex flex-col gap-1 min-w-0 flex-1 pr-2 sm:pr-4">
                                   <div className="flex items-center gap-2">
                                     <span className="font-bold text-sm text-white truncate">{e.customerName}</span>
                                     {isServing && (
                                       <span className="text-[8px] font-black bg-violet-500/20 text-violet-400 border border-violet-500/30 px-1.5 py-0.5 rounded animate-pulse shrink-0">LIVE</span>
                                     )}
                                     {isCompleted && (
                                       <span className="text-[8px] font-bold bg-zinc-800 text-gray-400 px-1.5 py-0.5 rounded">DONE</span>
                                     )}
                                   </div>
                                   <div className="text-[10px] text-gray-400 flex items-center gap-2 truncate">
                                     <span className="flex items-center gap-1 shrink-0"><User size={10}/> <span className="truncate max-w-[60px] sm:max-w-none">{e.barber}</span></span>
                                     <span className="flex items-center gap-1 shrink-0"><Scissors size={10}/> <span className="truncate">{e.service}</span></span>
                                   </div>
                                 </div>
                                 <div className="flex flex-col items-end shrink-0 pl-2 sm:pl-4 border-l border-zinc-800">
                                   <span className="font-mono text-[11px] font-bold text-gray-300">{e.timeRange.replace('~','').split('-')[0].trim()}</span>
                                   <span className="font-mono text-[9px] text-gray-600">{e.timeRange.replace('~','').split('-')[1]?.trim() || ''}</span>
                                 </div>
                               </div>
                             );
                           })}
                           
                           {dayEntries.length > 4 && (
                             <div className="flex items-center justify-center pt-1">
                               <Button
                                 variant="secondary"
                                 size="sm"
                                 onClick={() => { setSelectedDay(date.day); setViewMode('Daily'); }} 
                                 className="rounded-full text-[10px]"
                               >
                                 + {dayEntries.length - 4} {t('schedule.moreEntries').replace('{n}', '').trim()}
                               </Button>
                             </div>
                           )}
                         </div>
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
                  <Button variant="secondary" size="icon" onClick={() => setMonthOffset(o => o - 1)}>
                    <ChevronLeft size={18}/>
                  </Button>
                  {monthName}
                  <Button variant="secondary" size="icon" onClick={() => setMonthOffset(o => o + 1)}>
                    <ChevronRight size={18}/>
                  </Button>
                </h2>
             </div>
             
             <div className="grid grid-cols-7 gap-2 mb-2">
               {DAYS_OF_WEEK.map(d => <div key={d} className="text-center text-xs font-mono font-bold text-gray-500 uppercase">{d}</div>)}
             </div>
             
             <div className="grid grid-cols-7 gap-[1px] bg-zinc-900/50 rounded-xl overflow-hidden">
               {monthDays.map((md, idx) => {
                 if (!md) return <div key={`empty-${idx}`} className="bg-[#050505] min-h-[80px] sm:min-h-[100px] opacity-30" />;
                 const dayEntries = filteredEntries.filter(e => e.scheduledDate === md.fullDateString);
                 dayEntries.sort((a, b) => {
                   const startA = parseStartMinutes(a.timeRange) || 0;
                   const startB = parseStartMinutes(b.timeRange) || 0;
                   return startA - startB;
                 });
                 
                 const firstEntry = dayEntries[0];
                 const isCompleted = firstEntry?.completedAt;
                 const isServing = firstEntry?.startedAt && !firstEntry?.completedAt;
                 const isConfirmed = firstEntry?.status === 'Confirmed';
                 
                 let borderColor = 'border-l-transparent';
                 if (firstEntry) {
                   if (isServing) borderColor = 'border-l-violet-500';
                   else if (isConfirmed) borderColor = 'border-l-emerald-500';
                   else if (firstEntry.status === 'Pending Reply') borderColor = 'border-l-sky-500';
                   else borderColor = 'border-l-zinc-700';
                 }

                 return (
                   <div 
                     key={idx} 
                     onClick={() => jumpToDate(md.fullDate)} 
                     className={`bg-[#0A0A0A] hover:bg-zinc-900 min-h-[80px] sm:min-h-[100px] cursor-pointer transition-colors flex flex-col p-1.5 sm:p-2 gap-1 border-l-2 ${borderColor} ${md.isToday ? 'bg-zinc-900/60 ring-2 ring-inset ring-amber-500/40' : ''}`}
                   >
                     <div className="flex justify-between items-start w-full">
                       <div className="flex gap-0.5 flex-wrap flex-1 max-w-[60%] pt-1">
                         {dayEntries.slice(0, 3).map((e, i) => {
                           let dotColor = 'bg-zinc-600';
                           if (e.startedAt && !e.completedAt) dotColor = 'bg-violet-400';
                           else if (e.status === 'Confirmed') dotColor = 'bg-emerald-400';
                           else if (e.status === 'Pending Reply') dotColor = 'bg-sky-400';
                           else if (e.status === 'Estimated') dotColor = 'bg-amber-400';
                           return <span key={i} className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />;
                         })}
                         {dayEntries.length > 3 && <span className="text-[7px] text-gray-500 font-bold ml-0.5 leading-none">+{dayEntries.length - 3}</span>}
                       </div>
                       <div className={`flex items-center justify-center rounded-full shrink-0 ${md.isToday ? 'w-5 h-5 bg-amber-500 text-black text-[10px] font-extrabold' : 'text-xs font-bold text-gray-400'}`}>
                         {md.dayNum}
                       </div>
                     </div>
                     
                     {firstEntry && (
                       <div className={`mt-auto flex flex-col gap-0.5 overflow-hidden ${isCompleted ? 'opacity-40 grayscale' : ''}`}>
                         <span className="text-[9px] sm:text-[10px] font-semibold text-white truncate w-full leading-tight">
                           {firstEntry.customerName}
                         </span>
                         <span className="text-[8px] sm:text-[9px] font-mono text-gray-500">
                           {firstEntry.timeRange.replace('~','').split('-')[0].trim()}
                         </span>
                       </div>
                     )}
                   </div>
                 );
               })}
             </div>
          </div>
        )}
      </div>

      {/* ESTIMATED QUEUE PANEL */}
      {filteredEntries.some(e => e.scheduledDate === weekDates.find(d => d.day === selectedDay)?.fullDateString && e.status === 'Estimated' && !e.completedAt) && (
        <div className="flex-none bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
             <Clock size={16} className="text-amber-500" />
             <h3 className="font-bold text-amber-500 text-sm">{t('schedule.estimatedQueue')}</h3>
             <span className="text-xs text-amber-500/70 ml-2 hidden sm:inline">({t('schedule.estimatedQueueDesc')})</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
            {filteredEntries.filter(e => e.scheduledDate === weekDates.find(d => d.day === selectedDay)?.fullDateString && e.status === 'Estimated' && !e.completedAt).map(entry => (
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
      <Dialog open={!!bookingSlot} onOpenChange={(open) => !open && setBookingSlot(null)}>
        <DialogContent className="p-0 sm:rounded-2xl gap-0 overflow-hidden bg-[#0F0F0F] border-zinc-800 shadow-2xl">
          <div className="p-5 border-b border-zinc-900">
            <DialogTitle className="flex items-center gap-2 m-0 p-0">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                <Calendar size={16} />
              </div>
              <div className="flex flex-col text-left">
                <span className="font-bold text-white text-base leading-none mb-1">{t('schedule.quickBookTitle')}</span>
                <span className="text-xs text-gray-500 font-sans normal-case">
                  {bookingSlot?.day} — {t('schedule.slot')} {bookingSlot?.hour}
                </span>
              </div>
            </DialogTitle>
          </div>

          <form onSubmit={handleConfirmQuickBook} className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider font-mono font-bold block">{t('schedule.customerName')}</label>
              <input type="text" required value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} placeholder={t('schedule.customerNamePlaceholder')} className="w-full bg-[#121212] border border-zinc-850 text-white text-sm rounded-xl px-3.5 py-2.5 focus:border-amber-500 outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider font-mono font-bold block">{t('schedule.selectService')}</label>
              <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                <SelectTrigger className="w-full bg-[#121212] border border-zinc-850 text-white text-sm rounded-xl px-3.5 py-2.5 h-auto">
                  <SelectValue placeholder="Select Service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name} — Rp {s.price.toLocaleString()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider font-mono font-bold block">{t('schedule.selectBarber')}</label>
              <Select value={selectedBarberId} onValueChange={setSelectedBarberId}>
                <SelectTrigger className="w-full bg-[#121212] border border-zinc-850 text-white text-sm rounded-xl px-3.5 py-2.5 h-auto">
                  <SelectValue placeholder="Select Barber" />
                </SelectTrigger>
                <SelectContent>
                  {barbers.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2.5 pt-2">
              <Button variant="default" type="submit" className="flex-1 w-full">
                <Check size={14} className="mr-1.5" /> {t('schedule.confirmBooking')}
              </Button>
              <Button variant="secondary" type="button" onClick={() => setBookingSlot(null)}>
                {t('requests.cancel')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!activeSlotDetails} onOpenChange={(open) => {
        if (!open) {
          setActiveSlotDetails(null);
          setConfirmTime('');
        }
      }}>
        <DialogContent className="p-0 sm:rounded-2xl gap-0 overflow-hidden bg-[#0F0F0F] border-zinc-800 shadow-2xl">
          <div className="p-5 border-b border-zinc-900">
            <DialogTitle className="flex items-center gap-2 m-0 p-0">
              <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400">
                <User size={16}/>
              </div>
              <div className="flex flex-col text-left">
                <span className="font-bold text-white text-base leading-none mb-1">{t('schedule.appointmentDetails')}</span>
                <span className="text-xs text-gray-500 font-sans normal-case">
                  {activeSlotDetails?.day} — {activeSlotDetails?.timeRange}
                </span>
              </div>
            </DialogTitle>
          </div>
          
          {activeSlotDetails && (
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
                   <Button 
                     variant="default"
                     onClick={() => handleWhatsAppAction(activeSlotDetails.entry)} 
                     className="w-full bg-emerald-500 hover:bg-emerald-600 text-black"
                   >
                     <MessageSquarePlus size={14} className="mr-1.5" /> {t('schedule.sendWhatsAppNudge')}
                   </Button>
                 )}
                 <div className="flex flex-col gap-2">
                   {activeSlotDetails.entry.status === 'Estimated' && (
                     <div className="bg-[#121212] border border-zinc-850 p-3 rounded-xl flex items-center justify-between">
                        <div className="text-[10px] text-gray-400 font-mono font-bold uppercase">{t('schedule.scheduledTime', 'Set Time')}</div>
                        <input 
                          type="time" 
                          value={confirmTime}
                          onChange={(e) => setConfirmTime(e.target.value)}
                          className="bg-[#1A1A1A] text-white text-sm font-bold p-1.5 rounded-lg border border-zinc-800 outline-none"
                        />
                     </div>
                   )}
                   <div className="flex gap-2 mt-2">
                     <Button 
                       variant="secondary"
                       className="flex-1 text-emerald-400"
                       onClick={() => { 
                         if (activeSlotDetails.entry.status === 'Estimated') {
                           if (!confirmTime) {
                             alert('Silakan isi jam terlebih dahulu!');
                             return;
                           }
                           onUpdateStatus(activeSlotDetails.entry.id, 'Confirmed', confirmTime);
                         } else {
                           onUpdateStatus(activeSlotDetails.entry.id, 'Confirmed');
                         }
                         setActiveSlotDetails(null); 
                         setConfirmTime('');
                       }} 
                     >
                       <Check size={14} className="mr-1.5" /> {t('schedule.confirm')}
                     </Button>
                     <Button 
                       variant="destructive"
                       size="icon"
                       onClick={() => { 
                         onRemoveBooking && onRemoveBooking(activeSlotDetails.entry.id); 
                         setActiveSlotDetails(null); 
                         setConfirmTime('');
                       }} 
                     >
                       <Trash2 size={14}/>
                     </Button>
                   </div>
                 </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import React, { useState } from 'react';
import { QueueEntry, QueueStatus, Barber, Service } from '../types';
import {
  Calendar, Clock, MapPin, User, ChevronRight, ChevronLeft, ChevronDown,
  Phone, MessageSquarePlus, Info, X, Plus, Trash2, Check, Sparkles,
  Scissors, Bell, Filter, Edit2, CalendarDays, CalendarRange, LayoutGrid
} from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from '../i18n';
import { SegmentedToggle } from './ui/SegmentedToggle';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TimePicker } from '@/components/ui/TimePicker';
import { getQueueStatusVariant, QueueStatusVariant } from '@/lib/queueStatus';

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
  businessHours: { openHour: number; closeHour: number; shopName: string; logoUrl: string | null };
}

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type DayType = typeof DAYS_OF_WEEK[number];

const PIXELS_PER_MINUTE = 2.5;

const STATUS_VARIANT_STYLES: Record<QueueStatusVariant, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  amber: 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
  sky: 'bg-sky-500/10 text-sky-400 border border-sky-500/20',
  violet: 'bg-violet-500/10 text-violet-400 border border-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.3)]',
  blue: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  gray: 'bg-muted text-muted-foreground border border-border',
};

// Slightly more opaque than the badge background, used for the small
// initials avatar chip on entry cards so it reads as a "photo" accent.
const AVATAR_VARIANT_STYLES: Record<QueueStatusVariant, string> = {
  emerald: 'bg-emerald-500/25 text-emerald-100',
  amber: 'bg-amber-500/25 text-amber-950',
  sky: 'bg-sky-500/25 text-sky-100',
  violet: 'bg-violet-500/30 text-violet-100',
  blue: 'bg-blue-500/25 text-blue-100',
  gray: 'bg-muted-foreground/20 text-foreground',
};

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
  const [expandedWeeklyDays, setExpandedWeeklyDays] = useState<string[]>([]);

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

  const getStatusBadgeStyles = (entry: QueueEntry) => STATUS_VARIANT_STYLES[getQueueStatusVariant(entry)];
  const getAvatarStyles = (entry: QueueEntry) => AVATAR_VARIANT_STYLES[getQueueStatusVariant(entry)];

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
    const text = `Halo ${entry.customerName}, konfirmasi jadwal pangkas Anda di ${businessHours.shopName} untuk hari ${entry.day} ${entry.timeRange}.`;
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
              className="absolute w-full border-t border-border group/slot"
              style={{ top: (hour - businessHours.openHour) * 60 * PIXELS_PER_MINUTE }}
              onClick={() => {
                setBookingSlot({ day, hour: `${hour.toString().padStart(2, '0')}:00`, barberName: barber.name });
                setSelectedBarberId(barber.id);
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center active:bg-accent hover:bg-accent/40 transition-colors cursor-pointer" style={{ height: 60 * PIXELS_PER_MINUTE }}>
                <Plus size={16} className="text-muted-foreground opacity-0 group-hover/slot:opacity-60 transition-opacity" />
              </div>
            </div>
          ))}

          {/* Render Blocks */}
          {positionedEntries.map(({ entry, topPx, heightPx, left, width }) => {
            const isSmall = heightPx <= 60;
            const initial = entry.customerName.trim().charAt(0).toUpperCase() || '?';
            return (
              <div
                key={entry.id}
                onClick={() => setActiveSlotDetails({ day, timeRange: entry.timeRange, entry })}
                className={`absolute rounded-xl ${isSmall ? 'py-1 px-2' : 'p-2'} cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md hover:z-20 ${getStatusBadgeStyles(entry)} shadow-sm overflow-hidden flex items-start gap-1.5`}
                style={{ top: topPx + 5, height: Math.max(heightPx - 10, 24), left, width }}
              >
                <div className={`shrink-0 rounded-full flex items-center justify-center font-bold ${getAvatarStyles(entry)} ${isSmall ? 'w-4 h-4 text-[9px]' : 'w-6 h-6 text-[10px] mt-0.5'}`}>
                  {initial}
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex justify-between items-start gap-1">
                    <div className="font-bold text-[11px] truncate leading-tight">
                      {entry.customerName}
                      {isSmall && <span className="font-normal opacity-70 ml-1">· {entry.service}</span>}
                    </div>
                    {entry.startedAt && !entry.completedAt && (
                      <div className="w-1.5 h-1.5 rounded-full bg-violet-700 shrink-0 mt-1 animate-pulse" />
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
            <h1 className="text-3xl md:text-4xl font-display font-extrabold text-foreground tracking-tight">
              {businessHours.shopName} HQ
            </h1>
            <p className="text-sm text-muted-foreground font-sans mt-0.5">
              {t('schedule.hqSubtitle')}
            </p>
            <p className="text-[10px] sm:hidden text-muted-foreground font-mono mt-2">
              (Ketuk area grid kosong untuk menjadwalkan)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-card p-2 rounded-xl border border-border justify-between">
          <div className="flex items-center gap-2">
            <SegmentedToggle
              options={[
                { value: 'Daily', label: t('schedule.daily') as string, icon: <CalendarDays size={14} /> },
                { value: 'Weekly', label: t('schedule.weekly') as string, icon: <CalendarRange size={14} /> },
                { value: 'Monthly', label: t('schedule.monthly') as string, icon: <LayoutGrid size={14} /> },
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

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-muted-foreground font-mono uppercase text-[10px]">
              <Info size={12} /> {t('schedule.statusGuide')}
            </span>
            <Badge variant="emerald" className="text-[10px] px-2 py-0.5" title={t('schedule.exactSlotLocked')}>{t('status.Confirmed')}</Badge>
            <Badge variant="amber" className="text-[10px] px-2 py-0.5" title={t('schedule.queueOrder')}>{t('status.Estimated')}</Badge>
            <Badge variant="sky" className="text-[10px] px-2 py-0.5" title={t('schedule.waitingResponse')}>{t('status.PendingReply')}</Badge>
            <Badge variant="violet" className="text-[10px] px-2 py-0.5">{t('status.InProgress')}</Badge>
            <Badge variant="blue" className="text-[10px] px-2 py-0.5">{t('status.Completed')}</Badge>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 h-[42px] bg-background border border-border rounded-lg">
              <Filter size={14} className="text-muted-foreground" />
              <Select value={filterBarberId} onValueChange={setFilterBarberId}>
                <SelectTrigger className="w-[130px] h-full border-none bg-transparent shadow-none px-0 py-0 focus:ring-0 text-xs text-muted-foreground">
                  <SelectValue placeholder={t('schedule.filterAll')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('schedule.filterBarber')}: {t('schedule.filterAll')}</SelectItem>
                  {barbers.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 px-3 h-[42px] bg-background border border-border rounded-lg">
              <Select value={filterServiceId} onValueChange={setFilterServiceId}>
                <SelectTrigger className="w-[120px] h-full border-none bg-transparent shadow-none px-0 py-0 focus:ring-0 text-xs text-muted-foreground">
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
          <div className="flex flex-col bg-background border border-border rounded-xl relative">
            <div className="flex items-center justify-between p-3 border-b border-border bg-card rounded-t-xl">
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
                  className="hover:bg-accent text-muted-foreground"
                >
                  <ChevronLeft size={18}/>
                </Button>
                <span className="font-bold text-foreground min-w-[120px] text-center">{weekDates.find(d => d.day === selectedDay)?.label}</span>
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
                  className="hover:bg-accent text-muted-foreground"
                >
                  <ChevronRight size={18}/>
                </Button>
              </div>
            </div>

            {/* Mobile Barber Tabs */}
            <div className="flex lg:hidden border-b border-border overflow-x-auto scrollbar-none bg-card sticky top-[64px] md:top-[72px] z-30">
              {activeBarbers.map((b, idx) => (
                <Button
                  variant="ghost"
                  key={b.id}
                  onClick={() => setActiveMobileBarberIndex(idx)}
                  className={`flex-1 rounded-none border-b-2 py-2.5 h-auto ${
                    activeMobileBarberIndex === idx
                      ? 'border-foreground text-foreground bg-accent'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {b.name.split(' ')[0]}
                </Button>
              ))}
            </div>

            {/* Single horizontal scrollable row: time axis + barber columns (each with own header) */}
            <div className="relative flex overflow-x-auto overflow-y-hidden bg-card rounded-b-xl">

              {/* Time Axis */}
              <div className="w-[60px] flex-none shrink-0 border-r border-border bg-background sticky left-0 z-20 pt-[64px]"
                   style={{ height: `calc(${(businessHours.closeHour - businessHours.openHour + 1) * 60 * PIXELS_PER_MINUTE}px + 64px)` }}>
                {Array.from({ length: businessHours.closeHour - businessHours.openHour + 1 }, (_, i) => i + businessHours.openHour).map(hour => (
                  <div key={hour}
                       className={`absolute w-full text-right pr-2 text-xs text-muted-foreground font-mono ${hour === businessHours.openHour ? 'translate-y-1' : '-translate-y-2'}`}
                       style={{ top: `calc(64px + ${(hour - businessHours.openHour) * 60 * PIXELS_PER_MINUTE}px)` }}>
                    {hour.toString().padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {/* Barber Columns — each owns its own header + grid */}
              {activeBarbers.map((b, idx) => (
                <div key={b.id}
                     className={`flex-1 min-w-[200px] flex flex-col border-r border-border ${activeMobileBarberIndex === idx ? 'flex' : 'hidden lg:flex'}`}>

                  {/* Column Header */}
                  <div className="h-[64px] flex flex-col items-center justify-center border-b border-border bg-card shrink-0">
                    <div className="flex items-center gap-1.5">
                      {b.avatar ? (
                        <img src={b.avatar} alt={b.name} className="w-5 h-5 rounded-full object-cover border border-border shrink-0" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-[9px] font-bold flex items-center justify-center shrink-0">
                          {b.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="font-bold text-sm text-foreground">{b.name}</div>
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider mt-0.5 flex justify-center gap-1">
                      {b.status === 'break' && <span className="text-amber-500">{t('overview.statusBreak')}</span>}
                      {b.status === 'active' && <span className="text-teal-500">{t('overview.statusOnSeat')}</span>}
                    </div>
                  </div>

                  {/* Grid */}
                  <div className="relative flex-1">
                    {renderTimeGridColumn(b, selectedDay)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {viewMode === 'Weekly' && (
          <div className="bg-background rounded-xl border border-border p-4 space-y-4">
             <div className="flex items-center gap-3 mb-4">
                <Button variant="secondary" size="icon" onClick={() => setWeekOffset(o => o - 1)}>
                  <ChevronLeft size={18}/>
                </Button>
                <span className="font-bold text-foreground text-lg">{weekRangeStr}</span>
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
                   <div key={date.day} className={`bg-card border rounded-xl flex overflow-hidden ${date.isToday ? 'border-ring/50 shadow-lg shadow-black/20 ring-1 ring-inset ring-ring/20' : 'border-border'}`}>

                     {/* Left: Date Header */}
                     <div className="w-[72px] sm:w-[80px] p-3 sm:p-4 flex flex-col items-center justify-center border-r border-border bg-background shrink-0">
                       <div className="text-[10px] font-mono uppercase text-muted-foreground">{date.day}</div>
                       <div className={`mt-1 flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full ${date.isToday ? 'bg-primary text-primary-foreground font-extrabold text-lg sm:text-xl' : 'text-foreground font-bold text-lg sm:text-xl'}`}>
                         {date.dayNum}
                       </div>
                       <Button variant="ghost" size="sm" onClick={() => { setSelectedDay(date.day); setViewMode('Daily'); }} className="mt-2 sm:mt-3 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground font-bold transition-colors">
                         View
                       </Button>
                     </div>

                     {/* Right: Entries List */}
                     <div className="flex-1 p-3 sm:p-4 flex flex-col gap-2 relative min-w-0">
                       {dayEntries.length === 0 ? (
                         <div className="h-full flex items-center justify-center min-h-[60px]">
                           <span className="text-sm text-muted-foreground italic">{t('schedule.noEntriesForDay')}</span>
                         </div>
                       ) : (
                         <div className="flex flex-col gap-2">
                           {dayEntries.slice(0, expandedWeeklyDays.includes(date.fullDateString) ? undefined : 4).map(e => {
                             const isCompleted = !!e.completedAt;
                             const isServing = e.startedAt && !e.completedAt;

                             return (
                               <div
                                 key={e.id}
                                 onClick={() => { setSelectedDay(date.day); setViewMode('Daily'); }}
                                 className={`p-2.5 sm:p-3 rounded-lg ${getStatusBadgeStyles(e)} text-xs flex justify-between items-center cursor-pointer hover:opacity-90 transition-opacity ${isCompleted ? 'opacity-80' : ''}`}
                               >
                                 <div className="flex flex-col gap-1 min-w-0 flex-1 pr-2 sm:pr-4">
                                   <div className="flex items-center gap-2">
                                     <span className="font-bold text-sm truncate">{e.customerName}</span>
                                     {isServing && (
                                       <span className="text-[10px] font-black bg-violet-900 text-violet-100 px-1.5 py-0.5 rounded animate-pulse shrink-0">LIVE</span>
                                     )}
                                     {isCompleted && (
                                       <span className="text-[10px] font-bold bg-blue-900 text-blue-100 px-1.5 py-0.5 rounded">DONE</span>
                                     )}
                                   </div>
                                   <div className="text-[11px] opacity-70 flex items-center gap-2 truncate">
                                     <span className="flex items-center gap-1 shrink-0"><User size={12}/> <span className="truncate max-w-[60px] sm:max-w-none">{e.barber}</span></span>
                                     <span className="flex items-center gap-1 shrink-0"><Scissors size={12}/> <span className="truncate">{e.service}</span></span>
                                   </div>
                                 </div>
                                 <div className="flex flex-col items-end shrink-0 pl-2 sm:pl-4 border-l border-current/15">
                                   <span className="font-mono text-xs font-bold opacity-90">{e.timeRange.replace('~','').split('-')[0].trim()}</span>
                                   <span className="font-mono text-[10px] opacity-60">{e.timeRange.replace('~','').split('-')[1]?.trim() || ''}</span>
                                 </div>
                               </div>
                             );
                           })}
                           
                           {dayEntries.length > 4 && !expandedWeeklyDays.includes(date.fullDateString) && (
                              <div className="flex items-center justify-center pt-1">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={(e) => { e.stopPropagation(); setExpandedWeeklyDays(prev => [...prev, date.fullDateString]); }}
                                  className="rounded-full text-[10px]"
                                >
                                  + {dayEntries.length - 4} {t('schedule.moreEntries').replace('{n}', '').trim()}
                                </Button>
                              </div>
                            )}

                            {dayEntries.length > 4 && expandedWeeklyDays.includes(date.fullDateString) && (
                              <div className="flex items-center justify-center pt-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => { e.stopPropagation(); setExpandedWeeklyDays(prev => prev.filter(d => d !== date.fullDateString)); }}
                                  className="rounded-full text-[10px] text-muted-foreground hover:text-foreground"
                                >
                                  Sembunyikan
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
          <div className="bg-background rounded-xl border border-border p-4">
             <div className="flex items-center justify-between mb-4 flex-none">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-3">
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
               {DAYS_OF_WEEK.map(d => <div key={d} className="text-center text-xs font-mono font-bold text-muted-foreground uppercase">{d}</div>)}
             </div>

             <div className="grid grid-cols-7 gap-[1px] bg-border border border-border rounded-lg overflow-hidden">
               {monthDays.map((md, idx) => {
                 if (!md) return <div key={`empty-${idx}`} className="bg-muted/30 min-h-[80px] sm:min-h-[100px]" />;
                 const dayEntries = filteredEntries.filter(e => e.scheduledDate === md.fullDateString);
                 dayEntries.sort((a, b) => {
                   const startA = parseStartMinutes(a.timeRange) || 0;
                   const startB = parseStartMinutes(b.timeRange) || 0;
                   return startA - startB;
                 });
                 
                 return (
                   <div
                     key={idx}
                     onClick={() => jumpToDate(md.fullDate)}
                     className={`bg-card hover:bg-accent/80 min-h-[80px] sm:min-h-[100px] cursor-pointer transition-colors flex flex-col p-1.5 sm:p-2 gap-1 ${md.isToday ? 'bg-accent' : ''}`}
                   >
                     <div className="flex justify-between items-start w-full">
                       <div className={`flex items-center justify-center rounded-full shrink-0 ${md.isToday ? 'w-5 h-5 bg-primary text-primary-foreground text-[10px] font-extrabold' : 'text-xs font-bold text-muted-foreground'}`}>
                         {md.dayNum}
                       </div>
                     </div>

                     <div className="flex flex-col gap-0.5 overflow-hidden">
                       {dayEntries.slice(0, 2).map((e) => (
                         <div key={e.id} className={`px-1 py-0.5 rounded text-[8px] sm:text-[9px] font-semibold truncate ${getStatusBadgeStyles(e)}`}>
                           {e.customerName}
                         </div>
                       ))}
                       {dayEntries.length > 2 && (
                         <span className="text-[7px] text-muted-foreground font-bold pl-0.5">+{dayEntries.length - 2} lagi</span>
                       )}
                     </div>
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
              <div key={entry.id} onClick={() => setActiveSlotDetails({ day: selectedDay, timeRange: entry.timeRange, entry })} className="flex-none bg-amber-200 text-amber-950 border border-amber-300 rounded-lg p-3 w-[200px] cursor-pointer hover:opacity-90 transition-opacity">
                <div className="flex justify-between items-start mb-2">
                  <div className="font-bold text-sm truncate">{entry.customerName}</div>
                  {entry.queueNumber && <div className="bg-amber-950 text-amber-100 text-[10px] font-bold px-1.5 py-0.5 rounded">No. {entry.queueNumber}</div>}
                </div>
                <div className="text-xs opacity-70 truncate flex items-center gap-1.5"><User size={10}/> {entry.barber}</div>
                <div className="text-xs opacity-70 truncate flex items-center gap-1.5"><Scissors size={10}/> {entry.service}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODALS */}
      <Dialog open={!!bookingSlot} onOpenChange={(open) => !open && setBookingSlot(null)}>
        <DialogContent className="p-0 sm:rounded-xl gap-0 overflow-hidden bg-popover border-border shadow-2xl">
          <div className="p-5 border-b border-border">
            <DialogTitle className="flex items-center gap-2 m-0 p-0">
              <Calendar size={16} className="text-muted-foreground shrink-0" />
              <div className="flex flex-col text-left">
                <span className="font-bold text-foreground text-base leading-none mb-1">{t('schedule.quickBookTitle')}</span>
                <span className="text-xs text-muted-foreground font-sans normal-case">
                  {bookingSlot?.day} — {t('schedule.slot')} {bookingSlot?.hour}
                </span>
              </div>
            </DialogTitle>
          </div>

          <form onSubmit={handleConfirmQuickBook} className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono font-bold block">{t('schedule.customerName')}</label>
              <input type="text" required value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} placeholder={t('schedule.customerNamePlaceholder')} className="w-full bg-background border border-border text-foreground text-sm rounded-lg px-3.5 py-2.5 focus:border-ring outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono font-bold block">{t('schedule.selectService')}</label>
              <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                <SelectTrigger className="w-full bg-background border border-border text-foreground text-sm rounded-lg px-3.5 py-2.5 h-auto">
                  <SelectValue placeholder="Select Service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name} — Rp {s.price.toLocaleString()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono font-bold block">{t('schedule.selectBarber')}</label>
              <Select value={selectedBarberId} onValueChange={setSelectedBarberId}>
                <SelectTrigger className="w-full bg-background border border-border text-foreground text-sm rounded-lg px-3.5 py-2.5 h-auto">
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
        <DialogContent className="p-0 sm:rounded-xl gap-0 overflow-hidden bg-popover border-border shadow-2xl">
          <div className="p-5 border-b border-border">
            <DialogTitle className="flex items-center gap-2 m-0 p-0">
              <User size={16} className="text-muted-foreground shrink-0" />
              <div className="flex flex-col text-left">
                <span className="font-bold text-foreground text-base leading-none mb-1">{t('schedule.appointmentDetails')}</span>
                <span className="text-xs text-muted-foreground font-sans normal-case">
                  {activeSlotDetails?.day} <span className="mx-1">•</span> {activeSlotDetails?.timeRange.replace('~', '').trim()}
                </span>
              </div>
            </DialogTitle>
          </div>

          {activeSlotDetails && (
            <div className="p-5 space-y-4">
              <div className="bg-background border border-border p-4 rounded-lg space-y-1">
                <div className="text-[10px] sm:text-xs text-muted-foreground uppercase font-mono font-bold">{t('schedule.customerName')}</div>
                <div className="text-base font-bold text-foreground flex items-center gap-2">
                  {activeSlotDetails.entry.customerName}
                  {activeSlotDetails.entry.queueNumber && <span className="text-[10px] bg-amber-500/10 text-amber-500 font-mono px-1.5 py-0.5 rounded">No. {activeSlotDetails.entry.queueNumber}</span>}
                </div>
                <div className="text-xs text-muted-foreground font-mono">{t('schedule.phone')} {activeSlotDetails.entry.phone}</div>
              </div>
              <div className="grid grid-cols-2 gap-3.5">
                <div className="bg-background border border-border p-3 rounded-lg">
                  <div className="text-[10px] sm:text-xs text-muted-foreground uppercase font-mono font-bold mb-1 flex items-center gap-1.5"><Scissors size={12} className="text-muted-foreground"/> {t('requests.service')}</div>
                  <div className="text-sm font-semibold text-foreground truncate">{activeSlotDetails.entry.service}</div>
                </div>
                <div className="bg-background border border-border p-3 rounded-lg">
                  <div className="text-[10px] sm:text-xs text-muted-foreground uppercase font-mono font-bold mb-1 flex items-center gap-1.5"><User size={12} className="text-muted-foreground"/> {t('schedule.assignedBarber')}</div>
                  <div className="text-sm font-semibold text-foreground truncate">{activeSlotDetails.entry.barber}</div>
                </div>
              </div>

              <div className="border-t border-border pt-4 space-y-2.5">
                 {activeSlotDetails.entry.status === 'Pending Reply' && (
                   <Button
                     variant="default"
                     onClick={() => handleWhatsAppAction(activeSlotDetails.entry)}
                     className="w-full font-semibold"
                   >
                     <MessageSquarePlus size={16} className="mr-2" /> {t('schedule.sendWhatsAppNudge')}
                   </Button>
                 )}
                 <div className="flex flex-col gap-2">
                   {activeSlotDetails.entry.status === 'Estimated' && (
                     <div className="bg-background border border-border p-3 rounded-lg flex items-center justify-between">
                        <div className="text-xs text-muted-foreground font-mono font-bold uppercase">{t('schedule.scheduledTime')}</div>
                        <TimePicker value={confirmTime} onChange={setConfirmTime} />
                     </div>
                   )}
                   <div className="flex gap-2 mt-2">
                     {(!activeSlotDetails.entry.completedAt && !activeSlotDetails.entry.startedAt) && (
                       <Button 
                         variant="secondary"
                         className="flex-1 text-emerald-400 font-semibold h-11"
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
                         <Check size={16} className="mr-2" /> {activeSlotDetails.entry.status === 'Confirmed' ? 'Tutup & Simpan' : t('schedule.confirm')}
                       </Button>
                     )}
                     {activeSlotDetails.entry.completedAt || activeSlotDetails.entry.startedAt ? (
                       <Button
                         variant="secondary"
                         className="flex-1 font-semibold h-11"
                         onClick={() => {
                           setActiveSlotDetails(null); 
                           setConfirmTime('');
                         }} 
                       >
                         Tutup
                       </Button>
                     ) : (
                       <Button 
                         variant="destructive"
                         size="icon"
                         className="h-11 w-11 shrink-0"
                         onClick={() => { 
                           onRemoveBooking && onRemoveBooking(activeSlotDetails.entry.id); 
                           setActiveSlotDetails(null); 
                           setConfirmTime('');
                         }} 
                       >
                         <Trash2 size={16}/>
                       </Button>
                     )}
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

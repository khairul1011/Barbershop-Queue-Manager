import React, { useState, useEffect } from 'react';
import {
  Users,
  Clock,
  DollarSign,
  CheckCircle2,
  Sparkles,
  UserCheck,
  TrendingUp,
  ArrowRight,
  PlusCircle,
  Play,
  Pause,
  RotateCcw
} from 'lucide-react';
import { QueueEntry, Service, Barber } from '../types';
import { AnimatePresence, motion } from 'motion/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar as CalendarIcon, UserPlus } from 'lucide-react';
import { BentoCard } from './ui/BentoCard';
import { useTranslation } from '../i18n';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface OverviewProps {
  queue: QueueEntry[];
  servingSessions: Record<string, QueueEntry | null>;
  onCompleteSession: (barberId: string, actualDuration: number, serviceId?: string, customerName?: string) => void;
  onCallNextForBarber: (barberId: string) => void;
  onServeNow: (entry: QueueEntry, barberId: string) => void;
  onQuickStart: (barberId: string) => void;
  onAddWalkIn: (name: string, service: string, barber: string) => void;
  barbers: Barber[];
  services: Service[];
  completedCount: number;
  revenueToday: number;
  todayKey: string;
}

interface BarberSeatCardProps {
  barber: Barber;
  session: QueueEntry | null;
  todayQueue: QueueEntry[];
  services: Service[];
  onCompleteSession: (barberId: string, duration: number, serviceId?: string, customerName?: string) => void;
  onCallNext: (barberId: string) => void;
  onQuickStart: (barberId: string) => void;
}

const BarberSeatCard: React.FC<BarberSeatCardProps> = ({
  barber,
  session,
  todayQueue,
  services,
  onCompleteSession,
  onCallNext,
  onQuickStart
}) => {
  const { t } = useTranslation();

  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [completeServiceId, setCompleteServiceId] = useState('');
  const [completeCustomerName, setCompleteCustomerName] = useState('');

  // Hitung detik yang sudah berlalu sejak sesi dimulai (bertahan setelah refresh)
  const getElapsedFromSession = (sess: typeof session) => {
    if (!sess?.startedAt) return 0;
    const diffMs = Date.now() - new Date(sess.startedAt).getTime();
    return Math.max(0, Math.floor(diffMs / 1000));
  };

  const [elapsedSeconds, setElapsedSeconds] = useState(() => getElapsedFromSession(session));
  const [isTimerRunning, setIsTimerRunning] = useState(!!session);

  useEffect(() => {
    let interval: any = null;
    if (session && isTimerRunning) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [session, isTimerRunning]);

  useEffect(() => {
    if (session) {
      // Sinkronisasi ulang ketika sesi berganti (panggil pelanggan baru)
      setElapsedSeconds(getElapsedFromSession(session));
      setIsTimerRunning(true);
    } else {
      setElapsedSeconds(0);
      setIsTimerRunning(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.startedAt]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDoneClick = () => {
    if (!session) return;
    
    // Set default values before opening dialog
    const potongRambut = services.find(s => s.name.toLowerCase().includes('potong rambut'));
    setCompleteServiceId(session.service && session.service !== 'TBD' ? 
      (services.find(s => s.name === session.service)?.id || (potongRambut ? potongRambut.id : services[0]?.id || '')) : 
      (potongRambut ? potongRambut.id : services[0]?.id || '')
    );
    setCompleteCustomerName(session.customerName && session.customerName !== 'TBD' ? session.customerName : '');
    
    setShowCompleteDialog(true);
  };

  const submitComplete = () => {
    if (!session) return;
    const finalName = completeCustomerName.trim() || 'Anonymous';
    onCompleteSession(barber.id, elapsedSeconds / 60, completeServiceId, finalName);
    setElapsedSeconds(0);
    setIsTimerRunning(false);
    setShowCompleteDialog(false);
  };

  const nextInLine = todayQueue.find(q => q.barber === barber.name);

  if (barber.status === 'off') {
    return null; // Do not render seat for off barbers
  }

  if (barber.status === 'break') {
    return (
      <BentoCard variant="default" badge={{ label: t('overview.statusBreak') as string || 'BREAK', color: 'gray' }} title={barber.name}>
        <div className="py-6 flex flex-col items-center justify-center text-muted-foreground">
          <UserCheck size={24} className="mb-2 opacity-50" />
          <p className="font-sans text-sm font-medium">{t('overview.onBreak') as string || 'On Break'}</p>
        </div>
      </BentoCard>
    );
  }

  return (
    <BentoCard
      variant={session ? "featured" : "default"}
      badge={session ? { label: 'LIVE', color: 'amber', dot: true } : undefined}
      title={barber.name}
    >
      <AnimatePresence mode="wait">
        {session ? (
          <motion.div
            key={session.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-xl font-bold text-foreground font-sans tracking-tight">
                  {session.customerName}
                </h4>
                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5 font-sans">
                  <span className="text-foreground font-medium">{session.service}</span>
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs text-muted-foreground font-mono block">{t('overview.estimatedTime')}</span>
                <span className="text-sm font-semibold text-muted-foreground font-mono block mt-0.5">
                  {session.timeRange}
                </span>
              </div>
            </div>

            {/* Active Timer Display */}
            <div className="bg-background border border-border rounded-lg p-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-muted-foreground font-sans uppercase tracking-wider block">{t('overview.serviceTimer')}</span>
                <span className="text-2xl font-bold font-mono text-foreground tracking-widest block mt-0.5">
                  {formatTime(elapsedSeconds)}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant={isTimerRunning ? "outline" : "default"}
                  size="icon"
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  title={isTimerRunning ? "Pause Timer" : "Resume Timer"}
                >
                  {isTimerRunning ? <Pause size={18} /> : <Play size={18} />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setElapsedSeconds(0)}
                  title="Reset Timer"
                >
                  <RotateCcw size={18} />
                </Button>
              </div>
            </div>

            {/* Done Action Button */}
            <Button
              variant="default"
              className="w-full"
              onClick={handleDoneClick}
            >
              <CheckCircle2 size={18} className="mr-2" />
              {t('overview.completeSession')}
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-6 flex flex-col items-center text-center space-y-3"
          >
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-muted-foreground border border-border">
              <UserCheck size={24} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground font-sans">{t('overview.seatEmpty') as string || 'Seat Available'}</h4>
            </div>
            <div className="flex gap-2 w-full mt-2">
              {nextInLine && (
                <Button
                  variant="default"
                  onClick={() => onCallNext(barber.id)}
                  className="flex-1 h-10 font-bold"
                >
                  <span className="truncate">Panggil {nextInLine.customerName}</span>
                  <ArrowRight size={16} className="ml-1.5 shrink-0" />
                </Button>
              )}

              <Button
                variant={!nextInLine ? "default" : "outline"}
                onClick={() => onQuickStart(barber.id)}
                className="flex-1 h-10 font-medium"
              >
                <PlusCircle size={16} className="mr-1.5 shrink-0" />
                Mulai Cepat
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent className="sm:max-w-[400px] border border-border bg-popover p-0 overflow-hidden shadow-2xl">
          <div className="bg-gradient-to-b from-accent/40 to-popover p-6 pb-4 border-b border-border">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold font-display text-foreground tracking-tight">Selesaikan Sesi</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">Konfirmasi layanan dan nama pelanggan.</p>
            </DialogHeader>
          </div>

          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Layanan <span className="text-destructive">*</span></label>
              <Select value={completeServiceId} onValueChange={setCompleteServiceId}>
                <SelectTrigger className="w-full bg-background border-border text-foreground h-11 rounded-lg">
                  <SelectValue placeholder="Pilih layanan" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border text-popover-foreground rounded-lg">
                  {services.map((svc) => (
                    <SelectItem key={svc.id} value={svc.id} className="focus:bg-accent focus:text-accent-foreground">
                      <div className="flex items-center justify-between w-full">
                        <span>{svc.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Nama Pelanggan</label>
              <input
                type="text"
                value={completeCustomerName}
                onChange={(e) => setCompleteCustomerName(e.target.value)}
                placeholder="Biarkan kosong untuk Anonymous"
                className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring transition-colors h-11"
              />
            </div>

            <Button onClick={submitComplete} className="w-full mt-2" disabled={!completeServiceId}>
              <CheckCircle2 size={16} className="mr-2" /> Simpan & Selesai
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </BentoCard>
  );
}

export default function Overview({
  queue,
  servingSessions,
  onCompleteSession,
  onCallNextForBarber,
  onServeNow,
  onAddWalkIn,
  onQuickStart,
  barbers,
  services,
  completedCount,
  revenueToday,
  todayKey
}: OverviewProps) {
  const { t } = useTranslation();

  // Walk-in form modal
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [walkInService, setWalkInService] = useState(services[0]?.name || '');
  const [walkInBarber, setWalkInBarber] = useState(barbers[0]?.name || '');

  // Sync state dengan data yang baru di-load dari Supabase
  useEffect(() => {
    if (services.length > 0 && !walkInService) {
      setWalkInService(services[0].name);
    }
  }, [services, walkInService]);

  useEffect(() => {
    if (barbers.length > 0 && !walkInBarber) {
      setWalkInBarber(barbers[0].name);
    }
  }, [barbers, walkInBarber]);

  const handleWalkInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkInName.trim()) return;

    // Safety net fallback sesuai kesepakatan
    const finalService = walkInService || services[0]?.name || '';
    const finalBarber = walkInBarber || barbers[0]?.name || '';

    onAddWalkIn(walkInName, finalService, finalBarber);
    setWalkInName('');
    setShowWalkInModal(false);
  };

  const todayQueue = queue.filter(q => q.day === todayKey);

  // Active seats calculation
  const activeBarberCount = barbers.filter(b => b.status === 'active').length || 1;
  const occupiedSeats = Object.values(servingSessions || {}).filter(Boolean).length;
  const estimatedWaitTime = Math.ceil(todayQueue.length / activeBarberCount) * 20 + (occupiedSeats > 0 ? 10 : 0);

  const totalVisits = completedCount + todayQueue.length + occupiedSeats;

  return (
    <div className="space-y-6">
      {/* Overview Header & Quick Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground tracking-tight">{t('overview.title')}</h1>
          <p className="text-sm text-muted-foreground font-sans mt-0.5">{t('overview.subtitle')}</p>
        </div>
        <Button
          variant="default"
          onClick={() => setShowWalkInModal(true)}
          className="active:scale-95 px-4"
          id="add-walk-in-btn"
        >
          <PlusCircle size={18} className="sm:mr-2" />
          <span className="hidden sm:inline">{t('overview.newWalkIn')}</span>
        </Button>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        {/* Stat 1: Total Customers Today */}
        <BentoCard className="!p-4 md:!p-5 justify-between group">
          <div className="flex items-center justify-between">
            <span className="text-xs md:text-sm text-muted-foreground font-sans">{t('overview.todaysVisits')}</span>
            <Users size={16} className="text-muted-foreground" />
          </div>
          <div className="mt-4 md:mt-6">
            <h3 className="text-2xl md:text-4xl font-display font-bold text-foreground font-mono leading-none">
              {totalVisits}
            </h3>
            <p className="text-[10px] md:text-xs text-muted-foreground font-sans mt-1 flex items-center gap-1">
              <TrendingUp size={12} />
              <span>+{completedCount} {t('overview.completed')}</span>
            </p>
          </div>
        </BentoCard>

        {/* Stat 2: Avg Wait Time */}
        <BentoCard className="!p-4 md:!p-5 justify-between group">
          <div className="flex items-center justify-between">
            <span className="text-xs md:text-sm text-muted-foreground font-sans">{t('overview.avgWaitTime')}</span>
            <Clock size={16} className="text-muted-foreground" />
          </div>
          <div className="mt-4 md:mt-6">
            <h3 className="text-2xl md:text-4xl font-display font-bold text-foreground font-mono leading-none">
              {estimatedWaitTime} <span className="text-xs md:text-sm font-sans font-normal text-muted-foreground">{t('overview.mins')}</span>
            </h3>
            <p className="text-[10px] md:text-xs text-muted-foreground font-sans mt-1">
              {t('overview.basedOnFlow')}
            </p>
          </div>
        </BentoCard>

        {/* Stat 3: Revenue Today */}
        <BentoCard className="!p-4 md:!p-5 justify-between group">
          <div className="flex items-center justify-between">
            <span className="text-xs md:text-sm text-muted-foreground font-sans">{t('overview.revenue')}</span>
            <DollarSign size={16} className="text-muted-foreground" />
          </div>
          <div className="mt-4 md:mt-6">
            <h3 className="text-xl md:text-3xl font-display font-bold text-foreground font-mono leading-none">
              {(revenueToday / 1000).toLocaleString()}<span className="text-xs font-normal text-muted-foreground">{t('overview.kIDR')}</span>
            </h3>
            <p className="text-[10px] md:text-xs text-muted-foreground font-sans mt-1">
              {t('overview.confirmedServices')}
            </p>
          </div>
        </BentoCard>
      </div>

      {/* Main Grid: Seats & AI assistant panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Column 1: Seats Grid (Left) */}
        <div className="col-span-1 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-bold text-foreground font-display tracking-tight">{t('overview.allSeats') as string || 'Active Barber Seats'}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {barbers.map(barber => (
              <BarberSeatCard
                key={barber.id}
                barber={barber}
                session={servingSessions[barber.id] || null}
                todayQueue={queue.filter(q => q.day === todayKey)}
                services={services}
                onCompleteSession={onCompleteSession}
                onCallNext={onCallNextForBarber}
                onQuickStart={onQuickStart}
              />
            ))}
          </div>
        </div>

        {/* Column 2: AI Panel & Quick Stats (Right) */}
        <div className="col-span-1 space-y-6 lg:pt-[44px]">
          {/* Glassmorphic AI assistant panel */}
          <BentoCard
            variant="default"
            title={t('overview.aiEstimatorTitle')}
            icon={<Sparkles size={18} className="animate-pulse text-teal-400" />}
            className="group"
          >
            {/* Futuristic backing design details */}
            <div className="absolute -top-12 -left-12 w-40 h-40 bg-teal-500/5 rounded-full blur-2xl pointer-events-none" />

            <p className="text-sm text-muted-foreground font-sans leading-relaxed">
              "{t('overview.aiEstimatorDesc1')}
              <span className="text-teal-400 font-medium"> {barbers.filter(b => b.status === 'active').length} Barbers</span>{t('overview.aiEstimatorDesc2')} <span className="text-teal-400 font-medium font-mono">{estimatedWaitTime} {t('overview.mins')}</span> {t('overview.aiEstimatorDesc3')}"
            </p>

            <div className="mt-5 space-y-3 pt-4 border-t border-border">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-sans">{t('overview.currentCapacity')}</span>
                <span className="text-teal-400 font-semibold font-mono">{t('overview.optimalFlow')} (78%)</span>
              </div>
              <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-teal-500 to-teal-300 h-full w-[78%] rounded-full" />
              </div>
            </div>

            <div className="mt-4 p-3 rounded-lg bg-teal-500/5 border border-teal-500/10 flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-sans">{t('overview.suggestedAutoResponse')}</span>
              <span className="text-[10px] text-teal-400 font-mono font-medium bg-teal-500/10 px-2 py-0.5 rounded-md">{t('overview.smartReplyActive')}</span>
            </div>
          </BentoCard>

          {/* Barber Status Card */}
          <BentoCard
            variant="default"
            title={t('overview.activeBarbers')}
          >
            <div className="space-y-4">
              {barbers.map((barber) => (
                <div key={barber.id} className="flex items-center justify-between p-2.5 rounded-lg bg-background border border-border">
                  <div className="flex items-center gap-3">
                    <img
                      src={barber.avatar}
                      alt={barber.name}
                      className="w-10 h-10 rounded-lg object-cover border border-border"
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <h4 className="text-sm font-bold text-foreground font-sans">{barber.name}</h4>
                      <p className="text-xs text-muted-foreground font-sans">{barber.specialty}</p>
                    </div>
                  </div>
                  <Badge variant={
                    barber.status === 'active' ? 'teal' :
                    barber.status === 'break' ? 'amber' : 'gray'
                  } className="font-mono text-[11px]">
                    {barber.status === 'active' ? t('overview.statusOnSeat') : barber.status === 'break' ? t('overview.statusBreak') : t('overview.statusOff')}
                  </Badge>
                </div>
              ))}
            </div>
          </BentoCard>
        </div>
      </div>

      {/* WALK-IN DIALOG */}
      <Dialog open={showWalkInModal} onOpenChange={setShowWalkInModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl font-display font-bold text-foreground tracking-tight mb-4">{t('overview.walkInTitle')}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleWalkInSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider font-mono mb-1.5">{t('overview.customerName')}</label>
              <input
                type="text"
                required
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                placeholder={t('overview.customerNamePlaceholder')}
                className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground text-sm focus:outline-none focus:border-ring font-sans placeholder-muted-foreground"
                id="walkin-name-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wider font-mono mb-1.5">{t('overview.selectService')}</label>
                <Select value={walkInService} onValueChange={setWalkInService}>
                  <SelectTrigger id="walkin-service-select">
                    <SelectValue placeholder="Select Service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map(s => (
                      <SelectItem key={s.id} value={s.name}>{s.name} - {s.price / 1000}k</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wider font-mono mb-1.5">{t('overview.selectBarber')}</label>
                <Select value={walkInBarber} onValueChange={setWalkInBarber}>
                  <SelectTrigger id="walkin-barber-select">
                    <SelectValue placeholder="Select Barber" />
                  </SelectTrigger>
                  <SelectContent>
                    {barbers.map(b => (
                      <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-3 pt-3">
              <Button
                variant="secondary"
                onClick={() => setShowWalkInModal(false)}
                className="flex-1"
                id="walkin-cancel-btn"
              >
                {t('overview.cancel')}
              </Button>
              <Button
                variant="default"
                neon
                type="submit"
                className="flex-1"
                id="walkin-submit-btn"
              >
                {t('overview.addToQueue')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
import { BentoCard } from './ui/BentoCard';
import { useTranslation } from '../i18n';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface OverviewProps {
  queue: QueueEntry[];
  servingSessions: Record<string, QueueEntry | null>;
  onCompleteSession: (barberId: string, actualDuration: number) => void;
  onCallNextForBarber: (barberId: string) => void;
  onServeNow: (entry: QueueEntry, barberId: string) => void;
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
  onCompleteSession: (barberId: string, duration: number) => void;
  onCallNext: (barberId: string) => void;
}

const BarberSeatCard: React.FC<BarberSeatCardProps> = ({
  barber,
  session,
  todayQueue,
  onCompleteSession,
  onCallNext
}) => {
  const { t } = useTranslation();
  const [elapsedSeconds, setElapsedSeconds] = useState(session ? 420 : 0);
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
      setElapsedSeconds(420);
      setIsTimerRunning(true);
    } else {
      setElapsedSeconds(0);
      setIsTimerRunning(false);
    }
  }, [session]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDoneClick = () => {
    if (!session) return;
    onCompleteSession(barber.id, elapsedSeconds / 60);
    setElapsedSeconds(0);
    setIsTimerRunning(false);
  };

  const nextInLine = todayQueue.find(q => q.barber === barber.name);

  if (barber.status === 'off') {
    return null; // Do not render seat for off barbers
  }

  if (barber.status === 'break') {
    return (
      <BentoCard variant="default" badge={{ label: t('overview.statusBreak') as string || 'BREAK', color: 'gray' }} title={barber.name}>
        <div className="py-6 flex flex-col items-center justify-center text-gray-500">
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
                <h4 className="text-xl font-bold text-white font-sans tracking-tight">
                  {session.customerName}
                </h4>
                <p className="text-sm text-gray-400 mt-1 flex items-center gap-1.5 font-sans">
                  <span className="text-amber-500 font-medium">{session.service}</span>
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs text-gray-500 font-mono block">{t('overview.estimatedTime')}</span>
                <span className="text-sm font-semibold text-gray-300 font-mono block mt-0.5">
                  {session.timeRange}
                </span>
              </div>
            </div>

            {/* Active Timer Display */}
            <div className="bg-[#050505] border border-border-subtle rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-gray-500 font-sans uppercase tracking-wider block">{t('overview.serviceTimer')}</span>
                <span className="text-2xl font-bold font-mono text-white tracking-widest block mt-0.5">
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
              className="w-full shadow-xl shadow-amber-500/5 hover:shadow-amber-500/15"
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
            <div className="w-12 h-12 rounded-2xl bg-[#151515] flex items-center justify-center text-gray-500 border border-border-subtle">
              <UserCheck size={24} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white font-sans">{t('overview.seatEmpty') as string || 'Seat Available'}</h4>
            </div>
            {nextInLine && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onCallNext(barber.id)}
                className="text-amber-500 hover:text-amber-400 font-semibold border-border-subtle hover:border-amber-500/20"
              >
                <span>{t('overview.callNextFor') as string || 'Call'} {nextInLine.customerName}</span>
                <ArrowRight size={14} className="ml-1.5" />
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </BentoCard>
  );
}

export default function Overview({
  queue,
  servingSessions,
  onCompleteSession,
  onCallNextForBarber,
  onAddWalkIn,
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
          <h1 className="text-2xl md:text-3xl font-display font-bold text-white tracking-tight">{t('overview.title')}</h1>
          <p className="text-sm text-gray-400 font-sans mt-0.5">{t('overview.subtitle')}</p>
        </div>
        <Button
          variant="default"
          onClick={() => setShowWalkInModal(true)}
          className="shadow-lg shadow-amber-500/10 hover:shadow-amber-500/25 active:scale-95 px-4"
          id="add-walk-in-btn"
        >
          <PlusCircle size={18} className="mr-2" />
          <span className="hidden sm:inline">{t('overview.newWalkIn')}</span>
        </Button>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-3 gap-4">
        {/* Stat 1: Total Customers Today */}
        <BentoCard className="!p-4 md:!p-5 justify-between group">
          <div className="flex items-center justify-between">
            <span className="text-xs md:text-sm text-gray-400 font-sans">{t('overview.todaysVisits')}</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <Users size={16} />
            </div>
          </div>
          <div className="mt-4 md:mt-6">
            <h3 className="text-2xl md:text-4xl font-display font-bold text-white font-mono leading-none">
              {totalVisits}
            </h3>
            <p className="text-[10px] md:text-xs text-teal-400 font-sans mt-1 flex items-center gap-1">
              <TrendingUp size={12} />
              <span>+{completedCount} {t('overview.completed')}</span>
            </p>
          </div>
        </BentoCard>

        {/* Stat 2: Avg Wait Time */}
        <BentoCard className="!p-4 md:!p-5 justify-between group">
          <div className="flex items-center justify-between">
            <span className="text-xs md:text-sm text-gray-400 font-sans">{t('overview.avgWaitTime')}</span>
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400">
              <Clock size={16} />
            </div>
          </div>
          <div className="mt-4 md:mt-6">
            <h3 className="text-2xl md:text-4xl font-display font-bold text-white font-mono leading-none">
              {estimatedWaitTime} <span className="text-xs md:text-sm font-sans font-normal text-gray-500">{t('overview.mins')}</span>
            </h3>
            <p className="text-[10px] md:text-xs text-gray-400 font-sans mt-1">
              {t('overview.basedOnFlow')}
            </p>
          </div>
        </BentoCard>

        {/* Stat 3: Revenue Today */}
        <BentoCard className="!p-4 md:!p-5 justify-between group">
          <div className="flex items-center justify-between">
            <span className="text-xs md:text-sm text-gray-400 font-sans">{t('overview.revenue')}</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="mt-4 md:mt-6">
            <h3 className="text-xl md:text-3xl font-display font-bold text-emerald-400 font-mono leading-none">
              {(revenueToday / 1000).toLocaleString()}<span className="text-xs font-normal text-gray-500">{t('overview.kIDR')}</span>
            </h3>
            <p className="text-[10px] md:text-xs text-gray-400 font-sans mt-1">
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
            <h2 className="text-lg font-bold text-white font-display tracking-tight">{t('overview.allSeats') as string || 'Active Barber Seats'}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {barbers.map(barber => (
              <BarberSeatCard
                key={barber.id}
                barber={barber}
                session={servingSessions[barber.id] || null}
                todayQueue={todayQueue}
                onCompleteSession={onCompleteSession}
                onCallNext={onCallNextForBarber}
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

            <p className="text-sm text-gray-300 font-sans leading-relaxed">
              "{t('overview.aiEstimatorDesc1')}
              <span className="text-teal-400 font-medium"> {barbers.filter(b => b.status === 'active').length} Barbers</span>{t('overview.aiEstimatorDesc2')} <span className="text-amber-500 font-medium font-mono">{estimatedWaitTime} {t('overview.mins')}</span> {t('overview.aiEstimatorDesc3')}"
            </p>

            <div className="mt-5 space-y-3 pt-4 border-t border-border-subtle">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400 font-sans">{t('overview.currentCapacity')}</span>
                <span className="text-teal-400 font-semibold font-mono">{t('overview.optimalFlow')} (78%)</span>
              </div>
              <div className="w-full bg-[#151515] h-1.5 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-teal-500 to-amber-500 h-full w-[78%] rounded-full" />
              </div>
            </div>

            <div className="mt-4 p-3 rounded-xl bg-teal-500/5 border border-teal-500/10 flex items-center justify-between">
              <span className="text-xs text-gray-400 font-sans">{t('overview.suggestedAutoResponse')}</span>
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
                <div key={barber.id} className="flex items-center justify-between p-2.5 rounded-xl bg-[#070707] border border-border-subtle">
                  <div className="flex items-center gap-3">
                    <img
                      src={barber.avatar}
                      alt={barber.name}
                      className="w-10 h-10 rounded-xl object-cover border border-border-subtle"
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <h4 className="text-sm font-bold text-white font-sans">{barber.name}</h4>
                      <p className="text-xs text-gray-400 font-sans">{barber.specialty}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 text-[11px] font-mono font-semibold rounded-full border ${barber.status === 'active'
                    ? 'bg-teal-500/10 text-teal-400 border-teal-500/20'
                    : barber.status === 'break'
                      ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                      : 'bg-gray-500/10 text-gray-500 border-gray-500/20'
                    }`}>
                    {barber.status === 'active' ? t('overview.statusOnSeat') : barber.status === 'break' ? t('overview.statusBreak') : t('overview.statusOff')}
                  </span>
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
            <DialogTitle className="text-xl font-display font-bold text-white tracking-tight mb-4">{t('overview.walkInTitle')}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleWalkInSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wider font-mono mb-1.5">{t('overview.customerName')}</label>
              <input
                type="text"
                required
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                placeholder={t('overview.customerNamePlaceholder')}
                className="w-full bg-[#070707] border border-border-subtle rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500 font-sans placeholder-gray-600"
                id="walkin-name-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider font-mono mb-1.5">{t('overview.selectService')}</label>
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
                <label className="block text-xs text-gray-400 uppercase tracking-wider font-mono mb-1.5">{t('overview.selectBarber')}</label>
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

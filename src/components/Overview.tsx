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
import { motion, AnimatePresence } from 'motion/react';
import { BentoCard } from './ui/BentoCard';
import { useTranslation } from '../i18n';

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
                <button
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border transition-all cursor-pointer ${isTimerRunning
                      ? 'bg-transparent border-border-subtle text-amber-500 hover:bg-[#151515]'
                      : 'bg-amber-500 border-amber-500 text-black hover:bg-amber-600 shadow-md shadow-amber-500/10'
                    }`}
                  title={isTimerRunning ? "Pause Timer" : "Resume Timer"}
                >
                  {isTimerRunning ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button
                  onClick={() => setElapsedSeconds(0)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-border-subtle hover:bg-[#151515] text-gray-400 hover:text-white transition-all cursor-pointer"
                  title="Reset Timer"
                >
                  <RotateCcw size={18} />
                </button>
              </div>
            </div>

            {/* Done Action Button */}
            <button
              onClick={handleDoneClick}
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-bold py-3 rounded-xl shadow-xl shadow-amber-500/5 hover:shadow-amber-500/15 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <CheckCircle2 size={18} />
              {t('overview.completeSession')}
            </button>
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
              <button
                onClick={() => onCallNext(barber.id)}
                className="flex items-center gap-1.5 bg-[#121212] hover:bg-[#1A1A1A] text-amber-500 font-semibold border border-border-subtle hover:border-amber-500/20 px-4 py-2 rounded-xl transition-all text-xs cursor-pointer"
              >
                <span>{t('overview.callNextFor') as string || 'Call'} {nextInLine.customerName}</span>
                <ArrowRight size={14} />
              </button>
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

  const handleWalkInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkInName.trim()) return;
    onAddWalkIn(walkInName, walkInService, walkInBarber);
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
        <button
          onClick={() => setShowWalkInModal(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold px-4 py-3 rounded-xl shadow-lg shadow-amber-500/10 hover:shadow-amber-500/25 transition-all text-sm cursor-pointer active:scale-95"
          id="add-walk-in-btn"
        >
          <PlusCircle size={18} />
          <span className="hidden sm:inline">{t('overview.newWalkIn')}</span>
        </button>
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

      {/* WALK-IN DIALOG (AnimatePresence) */}
      <AnimatePresence>
        {showWalkInModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWalkInModal(false)}
              className="fixed inset-0 bg-black z-50 flex items-center justify-center p-4"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-[#0A0A0A] border border-border-subtle rounded-2xl p-6 z-50 shadow-2xl"
            >
              <h3 className="text-xl font-display font-bold text-white tracking-tight mb-4">{t('overview.walkInTitle')}</h3>

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
                    <select
                      value={walkInService}
                      onChange={(e) => setWalkInService(e.target.value)}
                      className="w-full bg-[#070707] border border-border-subtle rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:border-amber-500 font-sans cursor-pointer"
                      id="walkin-service-select"
                    >
                      {services.map(s => (
                        <option key={s.id} value={s.name}>{s.name} - {s.price / 1000}k</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wider font-mono mb-1.5">{t('overview.selectBarber')}</label>
                    <select
                      value={walkInBarber}
                      onChange={(e) => setWalkInBarber(e.target.value)}
                      className="w-full bg-[#070707] border border-border-subtle rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:border-amber-500 font-sans cursor-pointer"
                      id="walkin-barber-select"
                    >
                      {barbers.map(b => (
                        <option key={b.id} value={b.name}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowWalkInModal(false)}
                    className="flex-1 bg-[#121212] hover:bg-[#1A1A1A] border border-border-subtle text-gray-300 font-semibold py-3 rounded-xl text-sm transition-colors cursor-pointer"
                    id="walkin-cancel-btn"
                  >
                    {t('overview.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-bold py-3 rounded-xl text-sm transition-all cursor-pointer shadow-lg shadow-amber-500/10"
                    id="walkin-submit-btn"
                  >
                    {t('overview.addToQueue')}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

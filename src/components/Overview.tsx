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
import { QueueEntry, Service, Barber, QueueStatus } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { BentoCard } from './ui/BentoCard';

interface OverviewProps {
  queue: QueueEntry[];
  currentlyServing: QueueEntry | null;
  onCompleteServing: (id: string, actualDuration: number) => void;
  onAddWalkIn: (name: string, service: string, barber: string) => void;
  onServeNow: (entry: QueueEntry) => void;
  barbers: Barber[];
  services: Service[];
  completedCount: number;
  revenueToday: number;
  todayKey: string;
}

export default function Overview({
  queue,
  currentlyServing,
  onCompleteServing,
  onServeNow,
  onAddWalkIn,
  barbers,
  services,
  completedCount,
  revenueToday,
  todayKey
}: OverviewProps) {
  // Timer State
  const [elapsedSeconds, setElapsedSeconds] = useState(720); // starts at 12 minutes (720s) for demonstration
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  
  // Walk-in form modal
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [walkInService, setWalkInService] = useState(services[0]?.name || '');
  const [walkInBarber, setWalkInBarber] = useState(barbers[0]?.name || '');

  // Live Timer Effect
  useEffect(() => {
    let interval: any = null;
    if (currentlyServing && isTimerRunning) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentlyServing, isTimerRunning]);

  // Reset timer if currently serving customer changes
  useEffect(() => {
    if (currentlyServing) {
      setElapsedSeconds(420); // 7 minutes already passed as simulation
      setIsTimerRunning(true);
    } else {
      setElapsedSeconds(0);
      setIsTimerRunning(false);
    }
  }, [currentlyServing]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDoneClick = () => {
    if (currentlyServing) {
      onCompleteServing(currentlyServing.id, Math.ceil(elapsedSeconds / 60));
    }
  };

  const handleWalkInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkInName.trim()) return;
    onAddWalkIn(walkInName, walkInService, walkInBarber);
    setWalkInName('');
    setShowWalkInModal(false);
  };

  // Calculate live average wait time based on queue length
  // Filter today's queue using todayKey from App.tsx (single source of truth)
  const todayQueue = queue.filter(q => q.day === todayKey);
  const estimatedWaitTime = todayQueue.length * 20 + (currentlyServing ? 15 : 0);

  return (
    <div className="space-y-6">
      {/* Overview Header & Quick Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-white tracking-tight">Store Overview</h1>
          <p className="text-sm text-gray-400 font-sans mt-0.5">Real-time barber shop queue flow and analytics.</p>
        </div>
        <button
          onClick={() => setShowWalkInModal(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold px-4 py-3 rounded-xl shadow-lg shadow-amber-500/10 hover:shadow-amber-500/25 transition-all text-sm cursor-pointer active:scale-95"
          id="add-walk-in-btn"
        >
          <PlusCircle size={18} />
          <span className="hidden sm:inline">New Walk-In</span>
        </button>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-3 gap-4">
        {/* Stat 1: Total Customers Today */}
        <BentoCard className="!p-4 md:!p-5 justify-between group">
          <div className="flex items-center justify-between">
            <span className="text-xs md:text-sm text-gray-400 font-sans">Today's Visits</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <Users size={16} />
            </div>
          </div>
          <div className="mt-4 md:mt-6">
            <h3 className="text-2xl md:text-4xl font-display font-bold text-white font-mono leading-none">
              {completedCount + todayQueue.length + (currentlyServing ? 1 : 0)}
            </h3>
            <p className="text-[10px] md:text-xs text-teal-400 font-sans mt-1 flex items-center gap-1">
              <TrendingUp size={12} />
              <span>+{completedCount} completed</span>
            </p>
          </div>
        </BentoCard>

        {/* Stat 2: Avg Wait Time */}
        <BentoCard className="!p-4 md:!p-5 justify-between group">
          <div className="flex items-center justify-between">
            <span className="text-xs md:text-sm text-gray-400 font-sans">Avg. Wait Time</span>
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400">
              <Clock size={16} />
            </div>
          </div>
          <div className="mt-4 md:mt-6">
            <h3 className="text-2xl md:text-4xl font-display font-bold text-white font-mono leading-none">
              {estimatedWaitTime} <span className="text-xs md:text-sm font-sans font-normal text-gray-500">mins</span>
            </h3>
            <p className="text-[10px] md:text-xs text-gray-400 font-sans mt-1">
              Based on today's flow
            </p>
          </div>
        </BentoCard>

        {/* Stat 3: Revenue Today */}
        <BentoCard className="!p-4 md:!p-5 justify-between group">
          <div className="flex items-center justify-between">
            <span className="text-xs md:text-sm text-gray-400 font-sans">Revenue</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="mt-4 md:mt-6">
            <h3 className="text-xl md:text-3xl font-display font-bold text-emerald-400 font-mono leading-none">
              {(revenueToday / 1000).toLocaleString()}<span className="text-xs font-normal text-gray-500">k IDR</span>
            </h3>
            <p className="text-[10px] md:text-xs text-gray-400 font-sans mt-1">
              Confirmed services
            </p>
          </div>
        </BentoCard>
      </div>

      {/* Main Grid: Serving & AI assistant panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Column 1: Currently Serving (Left) */}
        <div className="col-span-1 lg:col-span-2 space-y-6">
          <BentoCard
            variant="featured"
            badge={{ label: 'LIVE', color: 'amber', dot: true }}
            title="Currently Serving"
            tags={currentlyServing ? ["Seat #1"] : []}
          >
            <AnimatePresence mode="wait">
              {currentlyServing ? (
                <motion.div
                  key={currentlyServing.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-2xl font-bold text-white font-sans tracking-tight">
                        {currentlyServing.customerName}
                      </h4>
                      <p className="text-sm text-gray-400 mt-1 flex items-center gap-1.5 font-sans">
                        <span className="text-amber-500 font-medium">{currentlyServing.service}</span>
                        <span className="text-gray-600">•</span>
                        <span>Barber: {currentlyServing.barber}</span>
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-gray-500 font-mono block">ESTIMATED TIME</span>
                      <span className="text-sm font-semibold text-gray-300 font-mono block mt-0.5">
                        {currentlyServing.timeRange}
                      </span>
                    </div>
                  </div>

                  {/* Active Timer Display */}
                  <div className="bg-[#050505] border border-border-subtle rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-gray-500 font-sans uppercase tracking-wider block">Service Session Timer</span>
                      <span className="text-3xl md:text-4xl font-bold font-mono text-white tracking-widest block mt-1">
                        {formatTime(elapsedSeconds)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsTimerRunning(!isTimerRunning)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                          isTimerRunning 
                            ? 'bg-transparent border-border-subtle text-amber-500 hover:bg-[#151515]' 
                            : 'bg-amber-500 border-amber-500 text-black hover:bg-amber-600 shadow-md shadow-amber-500/10'
                        }`}
                        title={isTimerRunning ? "Pause Timer" : "Resume Timer"}
                        id="toggle-timer-btn"
                      >
                        {isTimerRunning ? <Pause size={18} /> : <Play size={18} />}
                      </button>
                      <button
                        onClick={() => setElapsedSeconds(0)}
                        className="p-3 rounded-xl border border-border-subtle hover:bg-[#151515] text-gray-400 hover:text-white transition-all cursor-pointer"
                        title="Reset Timer"
                        id="reset-timer-btn"
                      >
                        <RotateCcw size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Big Done Action Button */}
                  <button
                    onClick={handleDoneClick}
                    className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-bold py-4 rounded-xl shadow-xl shadow-amber-500/5 hover:shadow-amber-500/15 transition-all text-base flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                    id="complete-serving-btn"
                  >
                    <CheckCircle2 size={20} />
                    Complete Session & Next Customer
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-12 flex flex-col items-center text-center space-y-4"
                >
                  <div className="w-16 h-16 rounded-2xl bg-[#151515] flex items-center justify-center text-gray-500 border border-border-subtle">
                    <UserCheck size={28} />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white font-sans">No Customer Active</h4>
                    <p className="text-sm text-gray-500 mt-1 max-w-sm font-sans">
                      Start serving the next customer from today's live queue.
                    </p>
                  </div>
                  {todayQueue.length > 0 && (
                    <button
                      onClick={() => onServeNow(todayQueue[0])} // triggers pull next
                      className="flex items-center gap-1.5 bg-[#121212] hover:bg-[#1A1A1A] text-amber-500 font-semibold border border-border-subtle hover:border-amber-500/20 px-4 py-2.5 rounded-xl transition-all text-xs cursor-pointer"
                      id="serve-next-prompt-btn"
                    >
                      <span>Call Next Customer ({todayQueue[0].customerName})</span>
                      <ArrowRight size={14} />
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </BentoCard>

          {/* Mini Next Customer Quick View */}
          {todayQueue.length > 0 && (
            <BentoCard 
              variant="default"
              badge={{ 
                label: todayQueue[0].status, 
                color: todayQueue[0].status === 'Confirmed' ? 'teal' : todayQueue[0].status === 'Estimated' ? 'amber' : 'gray' 
              }}
              tags={['UP NEXT IN QUEUE']}
              className="!p-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#151515] border border-border-subtle flex items-center justify-center text-amber-500 text-sm font-bold font-mono">
                  #2
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white font-sans mt-0.5">
                    {todayQueue[0].customerName}
                  </h4>
                  <p className="text-xs text-gray-400 mt-0.5 font-sans">
                    {todayQueue[0].service} • {todayQueue[0].barber}
                  </p>
                </div>
              </div>
            </BentoCard>
          )}
        </div>

        {/* Column 2: AI Panel & Quick Stats (Right) */}
        <div className="col-span-1 space-y-6">
          {/* Glassmorphic AI assistant panel */}
          <BentoCard 
            variant="default"
            title="AI Wait-Time Estimator"
            icon={<Sparkles size={18} className="animate-pulse text-teal-400" />}
            className="group"
          >
            {/* Futuristic backing design details */}
            <div className="absolute -top-12 -left-12 w-40 h-40 bg-teal-500/5 rounded-full blur-2xl pointer-events-none" />

            <p className="text-sm text-gray-300 font-sans leading-relaxed">
              "AI is estimating wait times based on today's queue density. 
              <span className="text-teal-400 font-medium"> Marcus Vance's</span> skin fades are averaging <span className="text-amber-500 font-medium font-mono">38 minutes</span> right now, while overall shop throughput is at a high efficiency today."
            </p>

            <div className="mt-5 space-y-3 pt-4 border-t border-border-subtle">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400 font-sans">Current Capacity Rate</span>
                <span className="text-teal-400 font-semibold font-mono">Optimal Flow (78%)</span>
              </div>
              <div className="w-full bg-[#151515] h-1.5 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-teal-500 to-amber-500 h-full w-[78%] rounded-full" />
              </div>
            </div>

            <div className="mt-4 p-3 rounded-xl bg-teal-500/5 border border-teal-500/10 flex items-center justify-between">
              <span className="text-xs text-gray-400 font-sans">Suggested Auto-Response:</span>
              <span className="text-[10px] text-teal-400 font-mono font-medium bg-teal-500/10 px-2 py-0.5 rounded-md">WhatsApp SmartReply Active</span>
            </div>
          </BentoCard>

          {/* Barber Status Card */}
          <BentoCard 
            variant="default"
            title="Active Barbers Today"
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
                  <span className={`px-2 py-0.5 text-[11px] font-mono font-semibold rounded-full border ${
                    barber.status === 'active' 
                      ? 'bg-teal-500/10 text-teal-400 border-teal-500/20' 
                      : barber.status === 'break' 
                      ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' 
                      : 'bg-gray-500/10 text-gray-500 border-gray-500/20'
                  }`}>
                    {barber.status === 'active' ? 'ON SEAT' : barber.status === 'break' ? 'BREAK' : 'OFF'}
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
              <h3 className="text-xl font-display font-bold text-white tracking-tight mb-4">Add New Walk-In</h3>
              
              <form onSubmit={handleWalkInSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wider font-mono mb-1.5">Customer Name</label>
                  <input
                    type="text"
                    required
                    value={walkInName}
                    onChange={(e) => setWalkInName(e.target.value)}
                    placeholder="Enter customer name..."
                    className="w-full bg-[#070707] border border-border-subtle rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500 font-sans placeholder-gray-600"
                    id="walkin-name-input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wider font-mono mb-1.5">Select Service</label>
                    <select
                      value={walkInService}
                      onChange={(e) => setWalkInService(e.target.value)}
                      className="w-full bg-[#070707] border border-border-subtle rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:border-amber-500 font-sans cursor-pointer"
                      id="walkin-service-select"
                    >
                      {services.map(s => (
                        <option key={s.id} value={s.name}>{s.name} - {s.price/1000}k</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wider font-mono mb-1.5">Select Barber</label>
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
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-bold py-3 rounded-xl text-sm transition-all cursor-pointer shadow-lg shadow-amber-500/10"
                    id="walkin-submit-btn"
                  >
                    Add to Queue
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

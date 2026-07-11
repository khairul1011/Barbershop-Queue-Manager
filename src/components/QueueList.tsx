import React, { useState } from 'react';
import { QueueEntry, Barber, QueueStatus } from '../types';
import { 
  Users, 
  Clock, 
  Trash2, 
  Sparkles, 
  Search, 
  UserPlus, 
  MessageCircle, 
  Play, 
  Filter, 
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface QueueListProps {
  queue: QueueEntry[];
  servingSessions: Record<string, QueueEntry | null>;
  barbers: Barber[];
  todayKey: string;
  onServeNow: (entry: QueueEntry, barberId: string) => void;
  onRemove: (id: string) => void;
  onSendWhatsApp: (phone: string, text: string) => void;
}

export default function QueueList({
  queue,
  servingSessions,
  barbers,
  todayKey,
  onServeNow,
  onRemove,
  onSendWhatsApp
}: QueueListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBarberFilter, setSelectedBarberFilter] = useState('All Barbers');

  // Filter today's queue using todayKey from App.tsx (single source of truth)
  const todayQueue = queue.filter(q => q.day === todayKey);

  const filteredQueue = todayQueue.filter((item) => {
    const matchesSearch = item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.service.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBarber = selectedBarberFilter === 'All Barbers' || item.barber === selectedBarberFilter;
    return matchesSearch && matchesBarber;
  });

  const getStatusBadge = (status: QueueStatus) => {
    switch (status) {
      case 'Confirmed':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'Estimated':
        return 'bg-amber-500/10 text-amber-500 border border-amber-500/20';
      case 'Pending Reply':
        return 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
    }
  };

  const handleWhatsAppNudge = (item: QueueEntry) => {
    const text = `Halo ${item.customerName}, giliran Anda di Golden Shears hampir tiba! Silakan bersiap-siap menuju outlet. Terima kasih.`;
    onSendWhatsApp(item.phone, text);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold text-white tracking-tight">Today's Live Queue</h1>
        <p className="text-sm text-gray-400 font-sans mt-0.5">
          Real-time customer list for Wednesday. Serve or dispatch next slots.
        </p>
      </div>

      {/* Filter and Search controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search customer, service..."
            className="w-full bg-[#070707] border border-border-subtle rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500 font-sans placeholder-gray-600"
            id="queue-search-input"
          />
        </div>

        {/* Barber Filter */}
        <div className="flex items-center gap-2 bg-card-bg border border-border-subtle rounded-xl px-3 py-1">
          <Filter size={16} className="text-amber-500" />
          <select
            value={selectedBarberFilter}
            onChange={(e) => setSelectedBarberFilter(e.target.value)}
            className="bg-transparent text-gray-300 text-sm focus:outline-none pr-4 py-2 cursor-pointer font-sans"
            id="queue-barber-filter"
          >
            <option value="All Barbers">All Barbers</option>
            {barbers.map((b) => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Queue Listing Container */}
      <div className="bg-card-bg border border-border-subtle rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-subtle text-gray-500 text-xs font-mono uppercase tracking-wider bg-[#070707]">
                <th className="py-4 px-5">Order / Name</th>
                <th className="py-4 px-4">Est. Time Range</th>
                <th className="py-4 px-4">Service Details</th>
                <th className="py-4 px-4">Barber Seat</th>
                <th className="py-4 px-4">Status Tag</th>
                <th className="py-4 px-5 text-right">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle text-sm">
              <AnimatePresence mode="popLayout">
                {filteredQueue.length > 0 ? (
                  filteredQueue.map((item, index) => (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -30 }}
                      className="hover:bg-[#121212]/50 transition-colors"
                    >
                      {/* Name / Index */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-[#151515] border border-border-subtle flex items-center justify-center font-mono text-[11px] text-gray-400">
                            {index + 1}
                          </span>
                          <div>
                            <span className="font-bold text-gray-100 font-sans block">{item.customerName}</span>
                            <span className="text-xs text-gray-500 font-mono">{item.phone}</span>
                          </div>
                        </div>
                      </td>

                      {/* Time Range */}
                      <td className="py-4 px-4 font-mono text-xs text-gray-300">
                        {item.timeRange}
                      </td>

                      {/* Service */}
                      <td className="py-4 px-4 text-gray-300 font-sans">
                        {item.service}
                      </td>

                      {/* Barber */}
                      <td className="py-4 px-4 font-sans font-medium text-amber-500">
                        {item.barber}
                      </td>

                      {/* Status Tag */}
                      <td className="py-4 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusBadge(item.status)}`}>
                          {item.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-5 text-right space-x-2">
                        {/* Serve Now */}
                        <button
                          onClick={() => {
                            const targetBarber = barbers.find(b => b.name === item.barber);
                            if (targetBarber) onServeNow(item, targetBarber.id);
                          }}
                          disabled={!!(barbers.find(b => b.name === item.barber) && servingSessions[barbers.find(b => b.name === item.barber)!.id])}
                          className={`inline-flex items-center justify-center min-h-[44px] min-w-[80px] px-3 gap-1 rounded-xl text-xs transition-all ${
                            (barbers.find(b => b.name === item.barber) && servingSessions[barbers.find(b => b.name === item.barber)!.id])
                              ? 'bg-gray-800/50 text-gray-500 cursor-not-allowed border border-gray-800'
                              : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-black hover:font-bold border border-amber-500/20 cursor-pointer'
                          }`}
                          title={(barbers.find(b => b.name === item.barber) && servingSessions[barbers.find(b => b.name === item.barber)!.id]) ? "Seat is currently occupied" : "Call to chair"}
                          id={`serve-btn-${item.id}`}
                        >
                          <Play size={12} fill="currentColor" className="stroke-none" />
                          <span>Serve</span>
                        </button>

                        {/* WhatsApp nudge */}
                        <button
                          onClick={() => handleWhatsAppNudge(item)}
                          className="min-w-[44px] min-h-[44px] bg-[#121212] border border-border-subtle text-teal-400 hover:bg-teal-500/10 rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center"
                          title="WhatsApp Nudge"
                          id={`nudge-btn-${item.id}`}
                        >
                          <MessageCircle size={14} />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => onRemove(item.id)}
                          className="min-w-[44px] min-h-[44px] bg-[#121212] border border-red-500/10 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center"
                          title="Remove from queue"
                          id={`delete-btn-${item.id}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </motion.tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-500 font-sans">
                      <div className="flex flex-col items-center gap-2">
                        <Users size={24} className="text-gray-700" />
                        <span>No queue entries match your search filters today.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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

  const getBadgeVariant = (status: QueueStatus) => {
    switch (status) {
      case 'Confirmed': return 'emerald';
      case 'Estimated': return 'amber';
      case 'Pending Reply': return 'sky';
      default: return 'default';
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
        <div className="flex items-center gap-2 bg-[#141414] border border-[#222222] rounded-xl px-3 h-[46px]">
          <Filter size={16} className="text-amber-500" />
          <Select value={selectedBarberFilter} onValueChange={setSelectedBarberFilter}>
            <SelectTrigger id="queue-barber-filter" className="w-[140px] border-none bg-transparent shadow-none px-0 focus:ring-0 text-sm text-gray-300">
              <SelectValue placeholder="All Barbers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All Barbers">All Barbers</SelectItem>
              {barbers.map((b) => (
                <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Queue Listing Container */}
      
      {/* Mobile Card List (< md) */}
      <div className="md:hidden space-y-3">
        <AnimatePresence mode="popLayout">
          {filteredQueue.length > 0 ? filteredQueue.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="bg-card-bg border border-border-subtle rounded-2xl overflow-hidden"
            >
              {/* Card Header: name + badge */}
              <div className="flex items-start justify-between p-4 pb-3">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-[#151515] border border-border-subtle flex items-center justify-center font-mono text-[11px] text-gray-400 flex-none">
                    {index + 1}
                  </span>
                  <div>
                    <div className="font-bold text-gray-100 font-sans">{item.customerName}</div>
                    <div className="text-xs text-gray-500 font-mono">{item.phone}</div>
                  </div>
                </div>
                <Badge variant={getBadgeVariant(item.status) as any} className="shrink-0 ml-2">
                  {item.status}
                </Badge>
              </div>
              
              {/* Card Body: service, barber, time */}
              <div className="px-4 pb-3 space-y-1">
                <div className="text-xs text-gray-400 font-sans flex items-center gap-2">
                  <Sparkles size={11} className="text-amber-500" />
                  {item.service}
                  <span className="text-gray-600">•</span>
                  <span className="text-amber-500 font-medium">{item.barber}</span>
                </div>
                <div className="text-xs text-gray-500 font-mono flex items-center gap-2">
                  <Clock size={11} />
                  {item.timeRange}
                </div>
              </div>
              
              {/* Card Footer: actions */}
              <div className="flex items-center gap-2 px-4 py-3 bg-[#070707] border-t border-border-subtle">
                <Button
                  variant="outline"
                  onClick={() => { const b = barbers.find(b => b.name === item.barber); if (b) onServeNow(item, b.id); }}
                  disabled={!!(barbers.find(b => b.name === item.barber) && servingSessions[barbers.find(b => b.name === item.barber)!.id])}
                  className={`flex-1 min-h-[44px] ${
                    (barbers.find(b => b.name === item.barber) && servingSessions[barbers.find(b => b.name === item.barber)!.id])
                      ? ''
                      : 'border-amber-500/20 text-amber-500 hover:bg-amber-500 hover:text-black'
                  }`}
                  title={(barbers.find(b => b.name === item.barber) && servingSessions[barbers.find(b => b.name === item.barber)!.id]) ? "Seat is currently occupied" : "Call to chair"}
                >
                  <Play size={13} fill="currentColor" className="mr-1.5 stroke-none" />
                  Serve
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => handleWhatsAppNudge(item)}
                  className="text-teal-400 hover:text-teal-300"
                  title="WhatsApp Nudge"
                >
                  <MessageCircle size={16} />
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => onRemove(item.id)}
                  title="Remove from queue"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </motion.div>
          )) : (
            <div className="py-12 text-center text-gray-500 font-sans bg-card-bg border border-border-subtle rounded-2xl">
              <div className="flex flex-col items-center gap-2">
                <Users size={24} className="text-gray-700" />
                <span>No queue entries match your search filters today.</span>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>

      <div className="hidden md:block bg-card-bg border border-border-subtle rounded-2xl overflow-hidden">
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

                      <td className="py-4 px-4">
                        <Badge variant={getBadgeVariant(item.status) as any}>
                          {item.status}
                        </Badge>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-5 text-right space-x-2">
                        {/* Serve Now */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const targetBarber = barbers.find(b => b.name === item.barber);
                            if (targetBarber) onServeNow(item, targetBarber.id);
                          }}
                          disabled={!!(barbers.find(b => b.name === item.barber) && servingSessions[barbers.find(b => b.name === item.barber)!.id])}
                          className={`min-h-[44px] ${
                            (barbers.find(b => b.name === item.barber) && servingSessions[barbers.find(b => b.name === item.barber)!.id])
                              ? ''
                              : 'border-amber-500/20 text-amber-500 hover:bg-amber-500 hover:text-black'
                          }`}
                          title={(barbers.find(b => b.name === item.barber) && servingSessions[barbers.find(b => b.name === item.barber)!.id]) ? "Seat is currently occupied" : "Call to chair"}
                          id={`serve-btn-${item.id}`}
                        >
                          <Play size={12} fill="currentColor" className="mr-1.5 stroke-none" />
                          <span>Serve</span>
                        </Button>

                        {/* WhatsApp nudge */}
                        <Button
                          variant="secondary"
                          size="icon"
                          onClick={() => handleWhatsAppNudge(item)}
                          className="text-teal-400 hover:text-teal-300"
                          title="WhatsApp Nudge"
                          id={`nudge-btn-${item.id}`}
                        >
                          <MessageCircle size={16} />
                        </Button>

                        {/* Delete */}
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => onRemove(item.id)}
                          title="Remove from queue"
                          id={`delete-btn-${item.id}`}
                        >
                          <Trash2 size={16} />
                        </Button>
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

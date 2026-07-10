import React, { useState } from 'react';
import { QueueEntry, Barber } from '../types';
import { 
  History as HistoryIcon, 
  Search, 
  Filter,
  Scissors,
  User,
  Clock,
  CalendarCheck
} from 'lucide-react';
import { BentoCard } from './ui/BentoCard';
import { motion, AnimatePresence } from 'motion/react';

interface HistoryProps {
  completedEntries: QueueEntry[];
  barbers: Barber[];
}

export default function History({ completedEntries, barbers }: HistoryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBarberFilter, setSelectedBarberFilter] = useState('All Barbers');

  // Sort completed entries by completedAt descending (newest first)
  const sortedEntries = [...completedEntries].sort((a, b) => {
    if (!a.completedAt) return 1;
    if (!b.completedAt) return -1;
    return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
  });

  const filteredEntries = sortedEntries.filter((item) => {
    const matchesSearch = item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.service.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBarber = selectedBarberFilter === 'All Barbers' || item.barber === selectedBarberFilter;
    return matchesSearch && matchesBarber;
  });

  const formatTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold text-white tracking-tight">Customer History</h1>
        <p className="text-sm text-gray-400 font-sans mt-0.5">
          Record of all completed sessions today. {completedEntries.length} total completed.
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
            placeholder="Search completed customer or service..."
            className="w-full bg-[#0A0A0A] border border-border-subtle rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-sans"
          />
        </div>

        {/* Barber Filter */}
        <div className="relative">
          <Filter size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <select
            value={selectedBarberFilter}
            onChange={(e) => setSelectedBarberFilter(e.target.value)}
            className="w-full sm:w-auto min-w-[180px] bg-[#0A0A0A] border border-border-subtle rounded-xl pl-10 pr-10 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-sans appearance-none cursor-pointer"
          >
            <option value="All Barbers">All Barbers</option>
            {barbers.map(b => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* History List */}
      <div className="space-y-4">
        <AnimatePresence>
          {filteredEntries.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-[#0A0A0A] border border-dashed border-border-subtle rounded-2xl p-12 flex flex-col items-center justify-center text-center"
            >
              <div className="w-16 h-16 rounded-full bg-[#121212] flex items-center justify-center mb-4">
                <HistoryIcon size={24} className="text-gray-500" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">No completed sessions</h3>
              <p className="text-gray-500 text-sm max-w-sm mx-auto">
                {searchTerm || selectedBarberFilter !== 'All Barbers'
                  ? "No matching completed sessions found."
                  : "Completed customers will appear here."}
              </p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEntries.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  layout
                >
                  <BentoCard
                    variant="default"
                    badge={{ label: 'Completed', color: 'blue' }}
                  >
                    <div className="flex flex-col gap-4">
                      {/* Customer Info */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
                          <span className="font-bold text-blue-500 font-display">
                            {item.customerName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="overflow-hidden">
                          <h3 className="font-bold text-white font-display text-lg truncate">{item.customerName}</h3>
                          <div className="flex items-center gap-3 text-xs text-gray-400 font-sans mt-0.5">
                            <span className="flex items-center gap-1 shrink-0">
                              <CalendarCheck size={12} className="text-blue-500" />
                              {item.day}
                            </span>
                            <span className="flex items-center gap-1 shrink-0">
                              <Clock size={12} className="text-blue-500" />
                              {formatTime(item.completedAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Service Details */}
                      <div className="grid grid-cols-2 gap-2 bg-[#121212] rounded-xl p-3 border border-border-subtle/50">
                        <div className="flex items-center gap-2">
                          <Scissors size={14} className="text-amber-500 shrink-0" />
                          <span className="text-xs text-gray-300 font-sans truncate">{item.service}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <User size={14} className="text-teal-400 shrink-0" />
                          <span className="text-xs text-gray-300 font-sans truncate">{item.barber}</span>
                        </div>
                      </div>
                    </div>
                  </BentoCard>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

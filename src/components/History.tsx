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
import { useTranslation } from '../i18n';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, X, LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HistoryProps {
  completedEntries: QueueEntry[];
  barbers: Barber[];
}

export default function History({ completedEntries, barbers }: HistoryProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBarberFilter, setSelectedBarberFilter] = useState(t('history.allBarbers'));
  const [selectedDateFilter, setSelectedDateFilter] = useState<Date | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Sort completed entries by completedAt descending (newest first)
  const sortedEntries = [...completedEntries].sort((a, b) => {
    if (!a.completedAt) return 1;
    if (!b.completedAt) return -1;
    return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
  });

  const filteredEntries = sortedEntries.filter((item) => {
    const matchesSearch = item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.service.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBarber = selectedBarberFilter === t('history.allBarbers') || item.barber === selectedBarberFilter;
    const matchesDate = !selectedDateFilter || item.scheduledDate === format(selectedDateFilter, "yyyy-MM-dd");
    return matchesSearch && matchesBarber && matchesDate;
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
        <h1 className="text-2xl md:text-3xl font-display font-bold text-white tracking-tight">{t('history.title')}</h1>
        <p className="text-sm text-gray-400 font-sans mt-0.5">
          {t('history.subtitle')} {completedEntries.length} {t('history.totalCompleted')}
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
            placeholder={t('history.searchPlaceholder')}
            className="w-full bg-[#0A0A0A] border border-border-subtle rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-sans"
          />
        </div>

        <div className="relative flex items-center gap-2 bg-[#0A0A0A] border border-border-subtle rounded-xl px-3 h-[46px] w-full sm:w-auto min-w-[180px]">
          <Filter size={16} className="text-gray-500 shrink-0" />
          <Select value={selectedBarberFilter} onValueChange={setSelectedBarberFilter}>
            <SelectTrigger className="w-full border-none bg-transparent shadow-none px-0 focus:ring-0 text-sm text-white">
              <SelectValue placeholder={t('history.allBarbers')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={t('history.allBarbers') as string}>{t('history.allBarbers')}</SelectItem>
              {barbers.map(b => (
                <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date Filter */}
        <div className="relative flex items-center bg-[#0A0A0A] border border-border-subtle rounded-xl w-full sm:w-auto overflow-hidden shrink-0">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-2 w-full sm:w-[180px] h-[46px] px-3 text-sm text-left font-normal bg-transparent text-white focus:outline-none transition-colors",
                  !selectedDateFilter && "text-gray-500"
                )}
              >
                <CalendarIcon size={16} className="text-gray-500 shrink-0" />
                <span className="truncate">
                  {selectedDateFilter ? format(selectedDateFilter, "PP") : "Semua Tanggal"}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 border-[#222222] bg-[#0A0A0A]" align="start">
              <Calendar
                mode="single"
                selected={selectedDateFilter}
                onSelect={setSelectedDateFilter}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {selectedDateFilter && (
            <button
              onClick={() => setSelectedDateFilter(undefined)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-red-400 bg-[#0A0A0A] transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center bg-[#0A0A0A] p-1 rounded-xl border border-border-subtle shrink-0 h-[46px] w-full sm:w-auto justify-center sm:justify-start mt-2 sm:mt-0">
          <button
            onClick={() => setViewMode('grid')}
            className={`w-[44px] sm:w-[38px] h-[38px] rounded-lg transition-colors flex items-center justify-center ${viewMode === 'grid' ? 'bg-[#222222] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
            title="Mode Kartu"
          >
            <LayoutGrid size={18} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`w-[44px] sm:w-[38px] h-[38px] rounded-lg transition-colors flex items-center justify-center ${viewMode === 'table' ? 'bg-[#222222] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
            title="Mode Tabel"
          >
            <List size={18} />
          </button>
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
              <h3 className="text-lg font-bold text-white mb-1">{t('history.noCompletedSessions')}</h3>
              <p className="text-gray-500 text-sm max-w-sm mx-auto">
                {searchTerm || selectedBarberFilter !== t('history.allBarbers')
                  ? t('history.noMatchingFound')
                  : t('history.appearHere')}
              </p>
            </motion.div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEntries.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  layout
                >
                  <BentoCard variant="default">
                    <div className="flex flex-col gap-4">
                      {/* Customer Info */}
                      <div className="flex items-start justify-between">
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
                        
                        <div className="shrink-0 pt-0.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 font-sans">
                            {t('status.Completed')}
                          </span>
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
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-card-bg border border-border-subtle rounded-2xl overflow-hidden"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border-subtle text-gray-500 text-xs font-mono uppercase tracking-wider bg-[#070707]">
                      <th className="py-4 px-5">Nama Pelanggan</th>
                      <th className="py-4 px-4">Waktu Selesai</th>
                      <th className="py-4 px-4">Layanan</th>
                      <th className="py-4 px-4">Kapster</th>
                      <th className="py-4 px-5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle text-sm">
                    {filteredEntries.map((item, index) => (
                      <motion.tr
                        key={item.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="hover:bg-[#121212]/50 transition-colors"
                      >
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
                              <span className="font-bold text-blue-500 font-display text-[10px]">
                                {item.customerName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="font-bold text-gray-100 font-sans block">{item.customerName}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 font-mono text-xs text-gray-300">
                          {item.day} {formatTime(item.completedAt)}
                        </td>
                        <td className="py-4 px-4 text-gray-300 font-sans">
                          {item.service}
                        </td>
                        <td className="py-4 px-4 font-sans font-medium text-amber-500">
                          {item.barber}
                        </td>
                        <td className="py-4 px-5 text-right">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono uppercase">
                            Selesai
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

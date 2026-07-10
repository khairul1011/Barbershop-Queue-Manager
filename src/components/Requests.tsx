import React, { useState } from 'react';
import { WhatsAppRequest, Service, Barber, QueueEntry } from '../types';
import { MessageSquare, Calendar, Clock, Scissors, UserCheck, ShieldCheck, Check, X, Edit3, Trash, Phone, CornerDownRight, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BentoCard } from './ui/BentoCard';

interface RequestsProps {
  requests: WhatsAppRequest[];
  onApprove: (id: string, customDay?: string, customTime?: string, customService?: string) => void;
  onReject: (id: string) => void;
  onEdit: (id: string, updated: Partial<WhatsAppRequest>) => void;
  services: Service[];
  barbers: Barber[];
}

export default function Requests({
  requests,
  onApprove,
  onReject,
  onEdit,
  services,
  barbers
}: RequestsProps) {
  // Local state to track which card is currently being edited
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Local edit values
  const [editDay, setEditDay] = useState<'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'>('Mon');
  const [editTime, setEditTime] = useState('');
  const [editService, setEditService] = useState('');
  const [editName, setEditName] = useState('');

  const startEdit = (req: WhatsAppRequest) => {
    setEditingId(req.id);
    setEditDay(req.extractedDay);
    setEditTime(req.extractedTime);
    setEditService(req.extractedService);
    setEditName(req.senderName);
  };

  const saveEdit = (id: string) => {
    onEdit(id, {
      senderName: editName,
      extractedDay: editDay,
      extractedTime: editTime,
      extractedService: editService
    });
    setEditingId(null);
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold text-white tracking-tight">WhatsApp Booking Requests</h1>
        <p className="text-sm text-gray-400 font-sans mt-0.5">
          Incoming booking intents parsed by AI from WhatsApp messages. Review and queue.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        <AnimatePresence mode="popLayout">
          {pendingRequests.length > 0 ? (
            pendingRequests.map((req) => {
              const isEditing = editingId === req.id;

              return (
                <motion.div
                  key={req.id}
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, x: -50 }}
                >
                  <BentoCard
                    variant="default"
                    badge={{ label: 'Incoming WA', color: 'emerald' }}
                    tags={[req.extractedDay, req.extractedTime, req.extractedService]}
                    actions={
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(req.id)}
                              className="flex-1 bg-teal-500 text-black hover:bg-teal-600 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                              id={`save-btn-${req.id}`}
                            >
                              <Save size={13} />
                              Save changes
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-3 py-2 bg-[#121212] border border-border-subtle text-gray-400 hover:text-white rounded-xl text-xs cursor-pointer"
                              id={`cancel-edit-btn-${req.id}`}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            {/* Approve Button */}
                            <button
                              onClick={() => onApprove(req.id)}
                              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1 shadow-lg shadow-teal-500/5 hover:shadow-teal-500/15 cursor-pointer active:scale-95"
                              id={`approve-btn-${req.id}`}
                            >
                              <Check size={14} />
                              Approve Book
                            </button>
  
                            {/* Edit Button */}
                            <button
                              onClick={() => startEdit(req)}
                              className="p-2.5 bg-[#121212] border border-border-subtle text-amber-500 hover:bg-[#1A1A1A] rounded-xl text-xs cursor-pointer"
                              title="Modify Slots"
                              id={`edit-btn-${req.id}`}
                            >
                              <Edit3 size={14} />
                            </button>
  
                            {/* Reject Button */}
                            <button
                              onClick={() => onReject(req.id)}
                              className="p-2.5 bg-[#121212] border border-red-500/20 hover:border-red-500/40 text-red-400 hover:bg-red-500/10 rounded-xl text-xs cursor-pointer"
                              title="Reject Request"
                              id={`reject-btn-${req.id}`}
                            >
                              <X size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      {/* Card top: WhatsApp Logo & Sender info */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center font-bold">
                            <MessageSquare size={18} />
                          </div>
                          <div>
                            {isEditing ? (
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="bg-[#070707] border border-border-subtle rounded px-2 py-0.5 text-sm text-white focus:outline-none"
                                id={`edit-sendername-${req.id}`}
                              />
                            ) : (
                              <h4 className="text-[15px] font-bold text-white font-sans">{req.senderName}</h4>
                            )}
                            <p className="text-xs text-gray-500 font-mono flex items-center gap-1 mt-0.5">
                              <Phone size={10} />
                              <span>{req.senderPhone}</span>
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-mono text-gray-600 font-medium">
                          {req.receivedTime}
                        </span>
                      </div>
  
                      {/* Quoted original message (WhatsApp vibe) */}
                      <div className="bg-[#070707] border-l-2 border-teal-500 rounded-r-xl p-3 text-xs text-gray-400 font-sans italic leading-relaxed">
                        "{req.message}"
                      </div>
  
                      {/* Extracted Booking Slots Frame */}
                      <div className="bg-[#070707] border border-border-subtle rounded-xl p-3.5 space-y-3">
                        <span className="text-[10px] text-teal-400 uppercase tracking-wider font-mono font-bold flex items-center gap-1.5">
                          <ShieldCheck size={12} />
                          AI Extracted Intent
                        </span>
  
                        {isEditing ? (
                          <div className="space-y-3 text-sm">
                            {/* Day & Time Selection */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] text-gray-500 block uppercase font-mono mb-1">Day</label>
                                <select
                                    value={editDay}
                                    onChange={(e) => setEditDay(e.target.value as any)}
                                    className="w-full bg-[#121212] border border-border-subtle text-white text-xs rounded p-1.5 focus:outline-none focus:border-amber-500 cursor-pointer"
                                    id={`edit-day-select-${req.id}`}
                                  >
                                    {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                                      <option key={d} value={d}>{d}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] text-gray-500 block uppercase font-mono mb-1">Time</label>
                                  <input
                                    type="text"
                                    value={editTime}
                                    onChange={(e) => setEditTime(e.target.value)}
                                    placeholder="e.g. 14:00"
                                    className="w-full bg-[#121212] border border-border-subtle text-white text-xs rounded p-1.5 focus:outline-none focus:border-amber-500"
                                    id={`edit-time-input-${req.id}`}
                                  />
                                </div>
                              </div>
  
                              {/* Service Selection */}
                              <div>
                                <label className="text-[10px] text-gray-500 block uppercase font-mono mb-1">Service</label>
                                <select
                                  value={editService}
                                  onChange={(e) => setEditService(e.target.value)}
                                  className="w-full bg-[#121212] border border-border-subtle text-white text-xs rounded p-1.5 focus:outline-none focus:border-amber-500 cursor-pointer"
                                  id={`edit-service-select-${req.id}`}
                                >
                                  {services.map(s => (
                                    <option key={s.id} value={s.name}>{s.name}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              {/* Day */}
                              <div className="flex items-center gap-1.5">
                                <Calendar size={13} className="text-amber-500 shrink-0" />
                                <span className="text-gray-300 font-sans font-medium">{req.extractedDay}</span>
                              </div>
                              {/* Time */}
                              <div className="flex items-center gap-1.5">
                                <Clock size={13} className="text-amber-500 shrink-0" />
                                <span className="text-gray-300 font-mono">{req.extractedTime}</span>
                              </div>
                              {/* Service */}
                              <div className="flex items-center gap-1.5 col-span-1 truncate">
                                <Scissors size={13} className="text-amber-500 shrink-0" />
                                <span className="text-gray-300 font-sans truncate">{req.extractedService}</span>
                              </div>
                            </div>
                          )}
                        </div>
                    </div>
                  </BentoCard>
                </motion.div>
                );
              })
            ) : (
              <motion.div
                layout
                className="col-span-full py-16 flex flex-col items-center text-center justify-center text-gray-500 space-y-3"
              >
                <div className="w-14 h-14 rounded-full bg-card-bg border border-border-subtle flex items-center justify-center text-teal-400">
                  <ShieldCheck size={26} />
                </div>
              <div>
                <h4 className="text-base font-bold text-white font-sans">No Pending WhatsApp Requests</h4>
                <p className="text-xs text-gray-500 mt-1 max-w-sm font-sans mx-auto">
                  Nice work! All incoming WhatsApp queue bookings are approved or addressed.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

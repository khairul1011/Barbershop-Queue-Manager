import React, { useState } from 'react';
import { WhatsAppRequest } from '../types';
import { MessageSquare, Calendar, Clock, Scissors, UserCheck, ShieldCheck, Check, X, Edit3, Trash, Phone, CornerDownRight, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BentoCard } from './ui/BentoCard';
import { useTranslation } from '../i18n';
import { Button } from '@/components/ui/button';

interface RequestsProps {
  requests: WhatsAppRequest[];
  requestsLoading: boolean;
  requestsError: string | null;
  onApprove: (id: string, customDay?: string, customTime?: string, customService?: string) => void;
  onReject: (id: string) => void;
  onEdit: (id: string, updated: Partial<WhatsAppRequest>) => void;
}

export default function Requests({
  requests,
  requestsLoading,
  requestsError,
  onApprove,
  onReject,
  onEdit
}: RequestsProps) {
  const { t } = useTranslation();
  // Local state to track which card is currently being edited
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Local edit values — only the sender name is editable. Day/time/service
  // come straight from what the customer actually said and get sent back to
  // them as confirmation on approve, so staff can't quietly reassign a
  // customer's booking to different terms than they agreed to; if the AI
  // extraction is wrong or incomplete, reject and let the bot clarify with
  // the customer directly instead.
  const [editName, setEditName] = useState('');

  const startEdit = (req: WhatsAppRequest) => {
    setEditingId(req.id);
    setEditName(req.senderName);
  };

  const formatReceivedTime = (isoString: string) => {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const datePart = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
    const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    return `${datePart}, ${time}`;
  };

  const saveEdit = (id: string) => {
    onEdit(id, { senderName: editName });
    setEditingId(null);
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground tracking-tight">{t('requests.title')}</h1>
        <p className="text-sm text-muted-foreground font-sans mt-0.5">
          {t('requests.subtitle')}
        </p>
      </div>

      {requestsError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive flex items-center gap-3">
          <X className="shrink-0" size={18} />
          <div>
            <p className="font-bold font-sans">Error Sinkronisasi</p>
            <p className="font-sans mt-0.5">{requests.length > 0 ? "Gagal memuat data terbaru, menampilkan data terakhir yang tersimpan." : "Tidak bisa terhubung ke server."}</p>
          </div>
        </div>
      )}

      {requestsLoading && requests.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-muted-foreground space-y-4">
          <div className="w-8 h-8 border-2 border-foreground/40 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-sans">Memuat data dari server...</p>
        </div>
      ) : (
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
                    badge={{ label: t('requests.incomingWA'), color: 'emerald' }}
                    tags={[req.extractedDay, req.extractedTime, req.extractedService]}
                    actions={
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <Button
                              variant="default"
                              onClick={() => saveEdit(req.id)}
                              className="flex-1 font-bold"
                              id={`save-btn-${req.id}`}
                            >
                              <Save size={13} className="mr-1.5" />
                              {t('requests.saveChanges')}
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => setEditingId(null)}
                              id={`cancel-edit-btn-${req.id}`}
                            >
                              {t('requests.cancel')}
                            </Button>
                          </>
                        ) : (
                          <>
                            {/* Approve Button */}
                            <Button
                              variant="default"
                              onClick={() => onApprove(req.id)}
                              className="flex-1 font-bold"
                              id={`approve-btn-${req.id}`}
                            >
                              <Check size={14} className="mr-1" />
                              {t('requests.approveBook')}
                            </Button>

                            {/* Edit Button */}
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => startEdit(req)}
                              title={t('requests.editSenderName')}
                              id={`edit-btn-${req.id}`}
                            >
                              <Edit3 size={14} />
                            </Button>
  
                            {/* Reject Button */}
                            <Button
                              variant="destructive"
                              size="icon"
                              onClick={() => onReject(req.id)}
                              title={t('requests.rejectRequest')}
                              id={`reject-btn-${req.id}`}
                            >
                              <X size={14} />
                            </Button>
                          </>
                        )}
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      {/* Card top: WhatsApp Logo & Sender info */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-bold">
                            <MessageSquare size={18} />
                          </div>
                          <div>
                            {isEditing ? (
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="bg-background border border-border rounded px-2 py-0.5 text-sm text-foreground focus:outline-none"
                                id={`edit-sendername-${req.id}`}
                              />
                            ) : (
                              <h4 className="text-[15px] font-bold text-foreground font-sans">{req.senderName}</h4>
                            )}
                            <p className="text-xs text-muted-foreground font-mono flex items-center gap-1 mt-0.5">
                              <Phone size={10} />
                              <span>{req.senderPhone}</span>
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-mono text-muted-foreground/70 font-medium">
                          {formatReceivedTime(req.receivedTime)}
                        </span>
                      </div>

                      {/* Quoted original message (WhatsApp vibe) */}
                      <div className="bg-background border-l-2 border-muted-foreground/30 rounded-r-lg p-3 text-xs text-muted-foreground font-sans italic leading-relaxed">
                        "{req.message}"
                      </div>

                      {/* Extracted Booking Slots Frame */}
                      <div className="bg-background border border-border rounded-lg p-3.5 space-y-3">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono font-bold flex items-center gap-1.5">
                          <ShieldCheck size={12} />
                          {t('requests.aiExtractedIntent')}
                        </span>
  
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          {/* Day */}
                          <div className="flex items-center gap-1.5">
                            <Calendar size={13} className="text-muted-foreground shrink-0" />
                            <span className="text-foreground font-sans font-medium">{req.extractedDay}</span>
                          </div>
                          {/* Time */}
                          <div className="flex items-center gap-1.5">
                            <Clock size={13} className="text-muted-foreground shrink-0" />
                            <span className="text-foreground font-mono">{req.extractedTime}</span>
                          </div>
                          {/* Service */}
                          <div className="flex items-center gap-1.5 col-span-1 truncate">
                            <Scissors size={13} className="text-muted-foreground shrink-0" />
                            <span className="text-foreground font-sans truncate">{req.extractedService}</span>
                          </div>
                        </div>
                        </div>
                    </div>
                  </BentoCard>
                </motion.div>
                );
              })
            ) : (
              <motion.div
                layout
                className="col-span-full py-16 flex flex-col items-center text-center justify-center text-muted-foreground space-y-3"
              >
                <div className="w-14 h-14 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground">
                  <ShieldCheck size={26} />
                </div>
              <div>
                <h4 className="text-base font-bold text-foreground font-sans">{t('requests.noPending')}</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm font-sans mx-auto">
                  {t('requests.noPendingDesc')}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      )}
    </div>
  );
}

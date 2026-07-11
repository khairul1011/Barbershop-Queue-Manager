import React, { useState } from 'react';
import { Service, Barber } from '../types';
import { 
  Settings, 
  Scissors, 
  Clock, 
  DollarSign, 
  UserCheck, 
  MessageSquare, 
  Plus, 
  Trash, 
  Save, 
  Check, 
  BellRing,
  Edit3,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '../i18n';

interface SettingsProps {
  services: Service[];
  barbers: Barber[];
  onAddService: (newService: Omit<Service, 'id'>) => void;
  onRemoveService: (id: string) => void;
  onUpdateBarberStatus: (id: string, status: 'active' | 'break' | 'off') => void;
  onAddBarber: (newBarber: Omit<Barber, 'id'>) => void;
  onEditBarber: (id: string, updatedBarber: Partial<Barber>) => void;
  onRemoveBarber: (id: string) => void;
}

export default function SettingsView({
  services,
  barbers,
  onAddService,
  onRemoveService,
  onUpdateBarberStatus,
  onAddBarber,
  onEditBarber,
  onRemoveBarber
}: SettingsProps) {
  const { t } = useTranslation();
  // Service form states
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState(100000);
  const [newServiceDuration, setNewServiceDuration] = useState(30);

  // Barber form states
  const [isBarberFormOpen, setIsBarberFormOpen] = useState(false);
  const [editingBarberId, setEditingBarberId] = useState<string | null>(null);
  const [barberName, setBarberName] = useState('');
  const [barberSpecialty, setBarberSpecialty] = useState('');
  const [barberAvatar, setBarberAvatar] = useState('');

  // Template states
  const [welcomeTemplate, setWelcomeTemplate] = useState(
    'Halo [name], booking Anda di Golden Shears telah DIKONFIRMASI untuk hari [day] pukul [time]. Harap datang 10 menit sebelum waktu pangkas Anda.'
  );
  const [nudgeTemplate, setNudgeTemplate] = useState(
    'Halo [name], giliran Anda di Golden Shears hampir tiba! Silakan bersiap-siap menuju outlet kami. Terima kasih.'
  );

  const [isTemplateSaved, setIsTemplateSaved] = useState(false);

  const handleAddServiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServiceName.trim() || newServicePrice <= 0 || newServiceDuration <= 0) return;
    onAddService({
      name: newServiceName,
      price: newServicePrice,
      duration: newServiceDuration
    });
    setNewServiceName('');
    setNewServicePrice(100000);
    setNewServiceDuration(30);
  };

  const handleSaveTemplates = () => {
    setIsTemplateSaved(true);
    setTimeout(() => setIsTemplateSaved(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      alert('Peringatan: Ukuran file melebihi 500KB. Harap pilih gambar yang lebih kecil untuk menjaga kapasitas localStorage.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setBarberAvatar(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleBarberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barberName.trim() || !barberSpecialty.trim() || !barberAvatar) return;
    
    if (editingBarberId) {
      onEditBarber(editingBarberId, { name: barberName, specialty: barberSpecialty, avatar: barberAvatar });
    } else {
      onAddBarber({ name: barberName, specialty: barberSpecialty, avatar: barberAvatar, status: 'active' });
    }
    resetBarberForm();
  };

  const resetBarberForm = () => {
    setBarberName('');
    setBarberSpecialty('');
    setBarberAvatar('');
    setEditingBarberId(null);
    setIsBarberFormOpen(false);
  };

  const startEditBarber = (b: Barber) => {
    setBarberName(b.name);
    setBarberSpecialty(b.specialty);
    setBarberAvatar(b.avatar);
    setEditingBarberId(b.id);
    setIsBarberFormOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold text-white tracking-tight">{t('settings.title')}</h1>
        <p className="text-sm text-gray-400 font-sans mt-0.5">
          {t('settings.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Services List Management */}
        <div className="bg-card-bg border border-border-subtle rounded-2xl p-5 md:p-6 space-y-5">
          <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
            <Scissors size={18} className="text-amber-500" />
            <h2 className="text-lg font-display font-bold text-white tracking-tight">{t('settings.servicesPricing')}</h2>
          </div>

          {/* Service Adder Form */}
          <form onSubmit={handleAddServiceSubmit} className="space-y-3 bg-[#070707] border border-border-subtle p-4 rounded-xl">
            <span className="text-[10px] text-amber-500 font-mono font-bold uppercase block">{t('settings.addCustomService')}</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
                placeholder={t('settings.serviceName')}
                className="col-span-1 sm:col-span-1 bg-[#121212] border border-border-subtle text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500 font-sans placeholder-gray-600"
                id="setting-service-name"
              />
              <input
                type="number"
                required
                value={newServicePrice}
                onChange={(e) => setNewServicePrice(Number(e.target.value))}
                placeholder={t('settings.priceIdr')}
                className="bg-[#121212] border border-border-subtle text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500 font-mono"
                id="setting-service-price"
              />
              <input
                type="number"
                required
                value={newServiceDuration}
                onChange={(e) => setNewServiceDuration(Number(e.target.value))}
                placeholder={t('settings.durationMin')}
                className="bg-[#121212] border border-border-subtle text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500 font-mono"
                id="setting-service-duration"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
              id="setting-service-add-btn"
            >
              <Plus size={14} />
              {t('settings.addServiceItem')}
            </button>
          </form>

          {/* Active Services list */}
          <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
            {services.map((svc) => (
              <div key={svc.id} className="flex items-center justify-between p-3 rounded-xl bg-[#070707] border border-border-subtle">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-bold text-gray-200 font-sans">{svc.name}</h4>
                  <p className="text-xs text-gray-400 font-mono flex items-center gap-2">
                    <span>Rp {svc.price.toLocaleString()}</span>
                    <span className="text-gray-600">•</span>
                    <span className="flex items-center gap-0.5"><Clock size={10} /> {svc.duration} {t('settings.mins')}</span>
                  </p>
                </div>
                
                <button
                  onClick={() => onRemoveService(svc.id)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-[#121212] border border-border-subtle text-red-400 hover:bg-red-500/15 hover:border-red-500/30 rounded-lg transition-all cursor-pointer"
                  title={t('settings.deleteService')}
                  id={`remove-service-${svc.id}`}
                >
                  <Trash size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Barber Duty / Status Panel */}
        <div className="bg-card-bg border border-border-subtle rounded-2xl p-5 md:p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            <div className="flex items-center gap-2">
              <UserCheck size={18} className="text-teal-400" />
              <h2 className="text-lg font-display font-bold text-white tracking-tight">{t('settings.barberDutyStatus')}</h2>
            </div>
            {!isBarberFormOpen && (
              <button
                onClick={() => setIsBarberFormOpen(true)}
                className="bg-teal-500 hover:bg-teal-600 text-black font-semibold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus size={14} /> Add Barber
              </button>
            )}
          </div>

          <AnimatePresence>
            {isBarberFormOpen && (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleBarberSubmit}
                className="space-y-3 bg-[#070707] border border-border-subtle p-4 rounded-xl overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-teal-400 font-mono font-bold uppercase block">
                    {editingBarberId ? 'Edit Barber' : 'Add New Barber'}
                  </span>
                  <button type="button" onClick={resetBarberForm} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 hover:text-white">
                    <X size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    value={barberName}
                    onChange={(e) => setBarberName(e.target.value)}
                    placeholder="Barber Name"
                    className="bg-[#121212] border border-border-subtle text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-teal-400 font-sans"
                  />
                  <input
                    type="text"
                    required
                    value={barberSpecialty}
                    onChange={(e) => setBarberSpecialty(e.target.value)}
                    placeholder="Specialty (e.g. Master Fade)"
                    className="bg-[#121212] border border-border-subtle text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-teal-400 font-sans"
                  />
                  <div className="sm:col-span-2">
                    <label className="text-[10px] text-gray-400 uppercase tracking-wider font-mono block mb-1">
                      Upload Photo (Max 500KB)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="w-full text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-500/10 file:text-teal-400 hover:file:bg-teal-500/20 cursor-pointer"
                    />
                    {barberAvatar && (
                      <div className="mt-2">
                        <img src={barberAvatar} alt="Preview" className="w-10 h-10 rounded-lg object-cover border border-border-subtle" />
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full bg-teal-500 hover:bg-teal-600 text-black font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Save size={14} />
                  {editingBarberId ? 'Save Changes' : 'Save Barber'}
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
            {barbers.map((barber) => (
              <div key={barber.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 rounded-xl bg-[#070707] border border-border-subtle gap-3">
                <div className="flex items-center gap-3 w-full sm:w-auto overflow-hidden">
                  <img
                    src={barber.avatar}
                    alt={barber.name}
                    className="w-10 h-10 shrink-0 rounded-xl object-cover border border-border-subtle"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white font-sans truncate">{barber.name}</h4>
                    <p className="text-xs text-gray-400 font-sans truncate">{barber.specialty}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end shrink-0">
                  <div className="flex gap-1 bg-[#121212] border border-border-subtle p-1 rounded-xl">
                  {(['active', 'break', 'off'] as const).map((statusOption) => (
                    <button
                      key={statusOption}
                      onClick={() => onUpdateBarberStatus(barber.id, statusOption)}
                      className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg uppercase cursor-pointer transition-all ${
                        barber.status === statusOption
                          ? statusOption === 'active'
                            ? 'bg-teal-500 text-black font-semibold'
                            : statusOption === 'break'
                            ? 'bg-amber-500 text-black font-semibold'
                            : 'bg-gray-500 text-black font-semibold'
                          : 'text-gray-500 hover:text-white'
                      }`}
                      id={`barber-status-${barber.id}-${statusOption}`}
                    >
                      {statusOption === 'active' ? t('settings.active') : statusOption === 'break' ? t('settings.break') : t('settings.off')}
                    </button>
                  ))}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEditBarber(barber)}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-[#121212] border border-border-subtle text-amber-500 hover:bg-amber-500/15 rounded-lg transition-all cursor-pointer"
                      title="Edit"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      onClick={() => onRemoveBarber(barber.id)}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-[#121212] border border-border-subtle text-red-400 hover:bg-red-500/15 hover:border-red-500/30 rounded-lg transition-all cursor-pointer"
                      title="Delete"
                    >
                      <Trash size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* WhatsApp Smart templates (Full width bottom on big screens) */}
        <div className="lg:col-span-2 bg-card-bg border border-border-subtle rounded-2xl p-5 md:p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            <div className="flex items-center gap-2">
              <MessageSquare size={18} className="text-amber-500" />
              <h2 className="text-lg font-display font-bold text-white tracking-tight">{t('settings.whatsappTemplatesTitle')}</h2>
            </div>
            
            <button
              onClick={handleSaveTemplates}
              className="bg-amber-500 text-black font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1 hover:bg-amber-600 transition-colors cursor-pointer"
              id="save-templates-btn"
            >
              {isTemplateSaved ? <Check size={14} /> : <Save size={14} />}
              <span>{isTemplateSaved ? t('settings.saved') : t('settings.saveTemplates')}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Template 1 */}
            <div className="space-y-2">
              <label className="text-xs text-gray-400 uppercase tracking-wider font-mono block">{t('settings.welcomeTemplateLabel')}</label>
              <textarea
                value={welcomeTemplate}
                onChange={(e) => setWelcomeTemplate(e.target.value)}
                rows={4}
                className="w-full bg-[#070707] border border-border-subtle focus:border-amber-500 rounded-xl p-3 text-xs text-gray-300 font-sans focus:outline-none resize-none leading-relaxed"
                id="template-welcome"
              />
              <span className="text-[10px] text-gray-500 block">{t('settings.welcomeTemplateHint')}</span>
            </div>

            {/* Template 2 */}
            <div className="space-y-2">
              <label className="text-xs text-gray-400 uppercase tracking-wider font-mono block">{t('settings.nudgeTemplateLabel')}</label>
              <textarea
                value={nudgeTemplate}
                onChange={(e) => setNudgeTemplate(e.target.value)}
                rows={4}
                className="w-full bg-[#070707] border border-border-subtle focus:border-amber-500 rounded-xl p-3 text-xs text-gray-300 font-sans focus:outline-none resize-none leading-relaxed"
                id="template-nudge"
              />
              <span className="text-[10px] text-gray-500 block">{t('settings.nudgeTemplateHint')}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

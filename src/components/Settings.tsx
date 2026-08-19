import React, { useState, useEffect } from 'react';
import { Service, Barber } from '../types';
import {
  Settings,
  Scissors,
  Clock,
  DollarSign,
  UserCheck,
  Plus,
  Trash,
  Save,
  BellRing,
  Edit3,
  X,
  AlertCircle,
  ChevronDown,
  Store,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '../i18n';
import { SegmentedToggle, SegmentOption } from './ui/SegmentedToggle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { compressImage } from '@/lib/imageCompression';

interface SettingsProps {
  services: Service[];
  servicesLoading?: boolean;
  barbers: Barber[];
  barbersLoading?: boolean;
  onAddService: (newService: Omit<Service, 'id'>) => void;
  onRemoveService: (id: string) => void;
  onUpdateBarberStatus: (id: string, status: 'active' | 'break' | 'off') => void;
  onAddBarber: (newBarber: Omit<Barber, 'id'>) => void;
  onEditBarber: (id: string, updatedBarber: Partial<Barber>) => void;
  onRemoveBarber: (id: string) => void;
  businessHours: { openHour: number; closeHour: number; shopName: string; logoUrl: string | null };
  onUpdateBusinessHours: (openHour: number, closeHour: number) => void;
  onUpdateShopProfile: (shopName: string, logoUrl: string | null) => void;
}

export default function SettingsView({
  services,
  servicesLoading,
  barbers,
  barbersLoading,
  onAddService,
  onRemoveService,
  onUpdateBarberStatus,
  onAddBarber,
  onEditBarber,
  onRemoveBarber,
  businessHours,
  onUpdateBusinessHours,
  onUpdateShopProfile
}: SettingsProps) {
  const { t } = useTranslation();
  // Service form states
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState(100000);
  const [newServiceDuration, setNewServiceDuration] = useState(30);

  // Shop profile form states
  const [shopNameInput, setShopNameInput] = useState(businessHours.shopName);
  const [shopLogoInput, setShopLogoInput] = useState<string | null>(businessHours.logoUrl);
  const [shopProfileSaved, setShopProfileSaved] = useState(false);

  useEffect(() => {
    setShopNameInput(businessHours.shopName);
    setShopLogoInput(businessHours.logoUrl);
  }, [businessHours.shopName, businessHours.logoUrl]);

  // Barber form states
  const [isBarberFormOpen, setIsBarberFormOpen] = useState(false);
  const [editingBarberId, setEditingBarberId] = useState<string | null>(null);
  const [barberName, setBarberName] = useState('');
  const [barberSpecialty, setBarberSpecialty] = useState('');
  const [barberAvatar, setBarberAvatar] = useState('');

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      alert('Peringatan: Ukuran file terlalu besar (maks 15MB).');
      e.target.value = '';
      return;
    }
    try {
      setBarberAvatar(await compressImage(file));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal memproses gambar.');
    }
  };

  const handleShopLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      alert('Peringatan: Ukuran file terlalu besar (maks 15MB).');
      e.target.value = '';
      return;
    }
    try {
      setShopLogoInput(await compressImage(file));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal memproses gambar.');
    }
  };

  const handleShopProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopNameInput.trim()) return;
    onUpdateShopProfile(shopNameInput.trim(), shopLogoInput);
    setShopProfileSaved(true);
    setTimeout(() => setShopProfileSaved(false), 2000);
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
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground tracking-tight">{t('settings.title')}</h1>
        <p className="text-sm text-muted-foreground font-sans mt-0.5">
          {t('settings.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Services List Management */}
        <div className="bg-card border border-border rounded-xl p-5 md:p-6 space-y-5">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Scissors size={18} className="text-muted-foreground" />
            <h2 className="text-lg font-display font-bold text-foreground tracking-tight">{t('settings.servicesPricing')}</h2>
          </div>

          {/* Service Adder Form */}
          <form onSubmit={handleAddServiceSubmit} className="space-y-3 bg-background border border-border p-4 rounded-lg">
            <span className="text-[10px] text-muted-foreground font-mono font-bold uppercase block">{t('settings.addCustomService')}</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
                placeholder={t('settings.serviceName')}
                className="col-span-1 sm:col-span-1 bg-card border border-border text-foreground text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-ring font-sans placeholder-muted-foreground"
                id="setting-service-name"
              />
              <input
                type="text"
                inputMode="numeric"
                required
                value={newServicePrice.toLocaleString('id-ID')}
                onChange={(e) => setNewServicePrice(Number(e.target.value.replace(/\D/g, '')))}
                placeholder={t('settings.priceIdr')}
                className="bg-card border border-border text-foreground text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-ring font-mono"
                id="setting-service-price"
              />
              <input
                type="number"
                required
                value={newServiceDuration}
                onChange={(e) => setNewServiceDuration(Number(e.target.value))}
                placeholder={t('settings.durationMin')}
                className="bg-card border border-border text-foreground text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-ring font-mono"
                id="setting-service-duration"
              />
            </div>
            <Button
              variant="default"
              type="submit"
              className="w-full"
              id="setting-service-add-btn"
            >
              <Plus size={14} className="mr-1.5" />
              {t('settings.addServiceItem')}
            </Button>
          </form>

          {/* Active Services list */}
          <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
            {servicesLoading ? (
              <div className="p-4 text-center">
                <span className="text-sm font-sans text-muted-foreground">Memuat layanan...</span>
              </div>
            ) : services.length === 0 ? (
              <div className="p-4 text-center">
                <span className="text-sm font-sans text-muted-foreground">Belum ada layanan — tambahkan via form di atas</span>
              </div>
            ) : (
              services.map((svc) => (
                <div key={svc.id} className="flex items-center justify-between p-3 rounded-lg bg-background border border-border">
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-bold text-foreground font-sans">{svc.name}</h4>
                    <p className="text-xs text-muted-foreground font-mono flex items-center gap-2">
                      <span>Rp {svc.price.toLocaleString()}</span>
                      <span className="text-muted-foreground/50">•</span>
                      <span className="flex items-center gap-0.5"><Clock size={10} /> {svc.duration} {t('settings.mins')}</span>
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => onRemoveService(svc.id)}
                    title={t('settings.deleteService')}
                    id={`remove-service-${svc.id}`}
                  >
                    <Trash size={14} />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Barber Duty / Status Panel */}
        <div className="bg-card border border-border rounded-xl p-5 md:p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <UserCheck size={18} className="text-muted-foreground" />
              <h2 className="text-lg font-display font-bold text-foreground tracking-tight">{t('settings.barberDutyStatus')}</h2>
            </div>
            {!isBarberFormOpen && (
              <Button
                variant="default"
                onClick={() => setIsBarberFormOpen(true)}
                className="px-4"
              >
                <Plus size={14} className="mr-1.5" /> Add Barber
              </Button>
            )}
          </div>

          <AnimatePresence>
            {isBarberFormOpen && (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleBarberSubmit}
                className="space-y-3 bg-background border border-border p-4 rounded-lg overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground font-mono font-bold uppercase block">
                    {editingBarberId ? 'Edit Barber' : 'Add New Barber'}
                  </span>
                  <Button variant="ghost" size="icon" type="button" onClick={resetBarberForm}>
                    <X size={14} />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    value={barberName}
                    onChange={(e) => setBarberName(e.target.value)}
                    placeholder="Barber Name"
                    className="bg-card border border-border text-foreground text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-ring font-sans"
                  />
                  <input
                    type="text"
                    required
                    value={barberSpecialty}
                    onChange={(e) => setBarberSpecialty(e.target.value)}
                    placeholder="Specialty (e.g. Master Fade)"
                    className="bg-card border border-border text-foreground text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-ring font-sans"
                  />
                  <div className="sm:col-span-2">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono block mb-1">
                      Upload Photo (otomatis dikompres)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-accent file:text-accent-foreground hover:file:bg-accent/80 cursor-pointer"
                    />
                    {barberAvatar && (
                      <div className="mt-2">
                        <img src={barberAvatar} alt="Preview" className="w-10 h-10 rounded-lg object-cover border border-border" />
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  variant="default"
                  type="submit"
                  className="w-full"
                >
                  <Save size={14} className="mr-1.5" />
                  {editingBarberId ? 'Save Changes' : 'Save Barber'}
                </Button>
              </motion.form>
            )}
          </AnimatePresence>

          <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
            {barbersLoading ? (
              <div className="p-4 text-center">
                <span className="text-sm font-sans text-muted-foreground">Memuat kapster...</span>
              </div>
            ) : barbers.length === 0 ? (
              <div className="p-4 text-center">
                <span className="text-sm font-sans text-muted-foreground">Belum ada kapster — tambahkan via form di atas</span>
              </div>
            ) : (
              barbers.map((barber) => (
                <div key={barber.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 rounded-lg bg-background border border-border gap-3">
                  <div className="flex items-center gap-3 w-full sm:w-auto overflow-hidden">
                    <img
                      src={barber.avatar}
                      alt={barber.name}
                      className="w-10 h-10 shrink-0 rounded-lg object-cover border border-border"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-foreground font-sans truncate">{barber.name}</h4>
                      <p className="text-xs text-muted-foreground font-sans truncate">{barber.specialty}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end shrink-0">
                    <SegmentedToggle
                      options={[
                        { value: 'active', label: t('settings.active') as string, activeColor: 'teal' },
                        { value: 'break', label: t('settings.break') as string, activeColor: 'amber' },
                        { value: 'off', label: t('settings.off') as string, activeColor: 'gray' },
                      ]}
                      value={barber.status}
                      onChange={(v: string) => onUpdateBarberStatus(barber.id, v as 'active' | 'break' | 'off')}
                      size="sm"
                      idPrefix={`barber-status-${barber.id}`}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => startEditBarber(barber)}
                        title="Edit"
                      >
                        <Edit3 size={14} />
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => onRemoveBarber(barber.id)}
                        title="Delete"
                      >
                        <Trash size={14} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* BUSINESS HOURS */}
        <div className="bg-card border border-border rounded-xl p-6">
           <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                <Clock size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground font-display">Jam Operasional (Global)</h2>
                <p className="text-sm text-muted-foreground font-sans">Mengatur jam kerja untuk seluruh kapster</p>
              </div>
           </div>

           <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-6 flex gap-3">
             <AlertCircle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
             <p className="text-xs text-amber-500/90 leading-relaxed font-sans">
               Catatan: Mengubah jam operasional tidak membatalkan booking yang sudah masuk sebelumnya di luar jam baru ini.
             </p>
           </div>

           <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
             <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-mono">Jam Buka</label>
                <Select
                  value={businessHours.openHour.toString()}
                  onValueChange={(v) => {
                    const newOpen = parseInt(v);
                    if (newOpen < businessHours.closeHour) {
                      onUpdateBusinessHours(newOpen, businessHours.closeHour);
                    }
                  }}
                >
                  <SelectTrigger className="w-full bg-background border border-border text-foreground text-sm rounded-lg px-4 py-3 h-auto">
                    <SelectValue placeholder="Pilih Jam Buka" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }).map((_, i) => (
                      <SelectItem key={i} value={i.toString()}>
                        {i.toString().padStart(2, '0')}:00
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-mono">Jam Tutup</label>
                <Select
                  value={businessHours.closeHour.toString()}
                  onValueChange={(v) => {
                    const newClose = parseInt(v);
                    if (newClose > businessHours.openHour) {
                      onUpdateBusinessHours(businessHours.openHour, newClose);
                    }
                  }}
                >
                  <SelectTrigger className="w-full bg-background border border-border text-foreground text-sm rounded-lg px-4 py-3 h-auto">
                    <SelectValue placeholder="Pilih Jam Tutup" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }).map((_, i) => (
                      <SelectItem key={`close-${i}`} value={i.toString()} disabled={i <= businessHours.openHour}>
                        {i.toString().padStart(2, '0')}:00
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
           </div>
        </div>

        {/* SHOP PROFILE */}
        <div className="bg-card border border-border rounded-xl p-5 md:p-6 space-y-5">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Store size={18} className="text-muted-foreground" />
            <h2 className="text-lg font-display font-bold text-foreground tracking-tight">Profil Toko</h2>
          </div>

          <form onSubmit={handleShopProfileSubmit} className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-primary flex items-center justify-center overflow-hidden shrink-0 border border-border">
                {shopLogoInput ? (
                  <img src={shopLogoInput} alt="Logo toko" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-display font-bold text-primary-foreground text-2xl">
                    {shopNameInput.charAt(0).toUpperCase() || '?'}
                  </span>
                )}
              </div>
              <div className="flex-1 space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono block">
                  Logo Toko (otomatis dikompres)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleShopLogoChange}
                  className="w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-accent file:text-accent-foreground hover:file:bg-accent/80 cursor-pointer"
                  id="setting-shop-logo"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="setting-shop-name" className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono block">
                Nama Toko
              </label>
              <input
                id="setting-shop-name"
                type="text"
                required
                value={shopNameInput}
                onChange={(e) => setShopNameInput(e.target.value)}
                placeholder="Nama barbershop Anda"
                className="w-full bg-background border border-border text-foreground text-sm rounded-lg px-3.5 py-2.5 focus:outline-none focus:border-ring font-sans"
              />
              <span className="text-[10px] text-muted-foreground/70 block">
                Dipakai di sidebar, halaman login, dan pesan WhatsApp ke pelanggan.
              </span>
            </div>

            <Button variant="default" type="submit" className="w-full" id="setting-shop-profile-save-btn">
              {shopProfileSaved ? <Check size={14} className="mr-1.5" /> : <Save size={14} className="mr-1.5" />}
              {shopProfileSaved ? 'Tersimpan!' : 'Simpan Profil Toko'}
            </Button>
          </form>
        </div>

      </div>
    </div>
  );
}

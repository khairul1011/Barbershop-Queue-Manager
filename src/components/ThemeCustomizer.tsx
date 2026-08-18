import React, { useState } from 'react';
import { SlidersHorizontal, Sun, Moon, Monitor } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter
} from './ui/sheet';
import { Button } from './ui/button';
import { SegmentedToggle } from './ui/SegmentedToggle';
import { useThemeSettings } from '../theme-settings';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      {children}
    </div>
  );
}

export default function ThemeCustomizer() {
  const [open, setOpen] = useState(false);
  const s = useThemeSettings();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative p-2 bg-card border border-border hover:bg-accent hover:text-foreground rounded-lg transition-all cursor-pointer"
        title="Kustomisasi Tema"
        id="topbar-theme-customizer-btn"
      >
        <SlidersHorizontal size={16} className="text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Kustomisasi Tema</SheetTitle>
            <SheetDescription>Sesuaikan tampilan dashboard sesuai preferensi.</SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-6 px-4">
            <Row label="Mode Warna">
              <SegmentedToggle
                options={[
                  { value: 'light', label: 'Terang', icon: <Sun size={14} />, disabled: true },
                  { value: 'dark', label: 'Gelap', icon: <Moon size={14} /> },
                  { value: 'system', label: 'Sistem', icon: <Monitor size={14} />, disabled: true }
                ]}
                value="dark"
                onChange={() => {}}
                size="sm"
                idPrefix="theme-color-mode"
              />
            </Row>

            <Row label="Radius">
              <SegmentedToggle
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'sm', label: 'SM' },
                  { value: 'md', label: 'MD' },
                  { value: 'lg', label: 'LG' }
                ]}
                value={s.radius}
                onChange={s.setRadius}
                size="sm"
                idPrefix="theme-radius"
              />
            </Row>

            <Row label="Tata Letak Konten">
              <SegmentedToggle
                options={[
                  { value: 'compact', label: 'Compact' },
                  { value: 'full', label: 'Full' }
                ]}
                value={s.contentLayout}
                onChange={s.setContentLayout}
                size="sm"
                idPrefix="theme-content-layout"
              />
            </Row>

            <Row label="Skala">
              <SegmentedToggle
                options={[
                  { value: 'sm', label: 'SM' },
                  { value: 'md', label: 'MD' },
                  { value: 'lg', label: 'LG' }
                ]}
                value={s.scale}
                onChange={s.setScale}
                size="sm"
                idPrefix="theme-scale"
              />
            </Row>

            <Row label="Varian Sidebar">
              <SegmentedToggle
                options={[
                  { value: 'sidebar', label: 'Default' },
                  { value: 'inset', label: 'Inset' },
                  { value: 'floating', label: 'Floating' }
                ]}
                value={s.sidebarVariant}
                onChange={s.setSidebarVariant}
                size="sm"
                idPrefix="theme-sidebar-variant"
              />
            </Row>

            <Row label="Mode Sidebar">
              <SegmentedToggle
                options={[
                  { value: 'offcanvas', label: 'Default' },
                  { value: 'icon', label: 'Icon' },
                  { value: 'none', label: 'Full' }
                ]}
                value={s.sidebarMode}
                onChange={s.setSidebarMode}
                size="sm"
                idPrefix="theme-sidebar-mode"
              />
            </Row>
          </div>

          <SheetFooter>
            <Button variant="secondary" className="w-full" onClick={s.reset} id="theme-reset-btn">
              Reset ke Default
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

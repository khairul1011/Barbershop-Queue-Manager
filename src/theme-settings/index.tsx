import React, { createContext, useContext, useLayoutEffect } from 'react';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

export type RadiusOption = 'none' | 'sm' | 'md' | 'lg';
export type ContentLayout = 'compact' | 'full';
export type ScaleOption = 'sm' | 'md' | 'lg';
export type SidebarVariant = 'sidebar' | 'floating' | 'inset';
export type SidebarMode = 'offcanvas' | 'icon' | 'none';

export interface ThemeSettings {
  radius: RadiusOption;
  contentLayout: ContentLayout;
  scale: ScaleOption;
  sidebarVariant: SidebarVariant;
  sidebarMode: SidebarMode;
}

// Nilai default setiap field harus sama persis dengan perilaku aplikasi sebelum
// fitur ini ada, sehingga tidak ada perubahan visual bagi pengguna yang belum
// menyentuh panel ini — KECUALI sidebarVariant, yang sengaja diubah menjadi
// 'inset' agar sesuai dengan referensi desain Figma (AdminCN dashboard template).
export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  radius: 'md',
  contentLayout: 'full',
  scale: 'md',
  sidebarVariant: 'inset',
  sidebarMode: 'icon',
};

const RADIUS_MAP: Record<RadiusOption, string> = {
  none: '0rem',
  sm: '0.3rem',
  md: '0.625rem',
  lg: '1rem',
};

const SCALE_MAP: Record<ScaleOption, string> = {
  sm: '93.75%',
  md: '100%',
  lg: '106.25%',
};

interface ThemeSettingsContextValue extends ThemeSettings {
  setRadius: (v: RadiusOption) => void;
  setContentLayout: (v: ContentLayout) => void;
  setScale: (v: ScaleOption) => void;
  setSidebarVariant: (v: SidebarVariant) => void;
  setSidebarMode: (v: SidebarMode) => void;
  reset: () => void;
}

const ThemeSettingsContext = createContext<ThemeSettingsContextValue>(null!);

export function ThemeSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useLocalStorageState<ThemeSettings>(
    'barberflow_theme_settings',
    DEFAULT_THEME_SETTINGS
  );

  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--radius', RADIUS_MAP[settings.radius]);
  }, [settings.radius]);

  useLayoutEffect(() => {
    document.documentElement.style.fontSize = SCALE_MAP[settings.scale];
  }, [settings.scale]);

  const patch = (partial: Partial<ThemeSettings>) =>
    setSettings(prev => ({ ...prev, ...partial }));

  const value: ThemeSettingsContextValue = {
    ...settings,
    setRadius: radius => patch({ radius }),
    setContentLayout: contentLayout => patch({ contentLayout }),
    setScale: scale => patch({ scale }),
    setSidebarVariant: sidebarVariant => patch({ sidebarVariant }),
    setSidebarMode: sidebarMode => patch({ sidebarMode }),
    reset: () => setSettings(DEFAULT_THEME_SETTINGS),
  };

  return (
    <ThemeSettingsContext.Provider value={value}>
      {children}
    </ThemeSettingsContext.Provider>
  );
}

export const useThemeSettings = () => useContext(ThemeSettingsContext);

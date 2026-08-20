import React from 'react';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  CalendarDays,
  Settings,
  History,
  TrendingUp,
} from 'lucide-react';
import { useTranslation } from '../i18n';
import type { SidebarVariant, SidebarMode } from '../theme-settings';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

interface AppSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingRequestsCount: number;
  sidebarVariant: SidebarVariant;
  sidebarMode: SidebarMode;
  shopName: string;
  logoUrl: string | null;
}

export default function AppSidebar({ activeTab, setActiveTab, pendingRequestsCount, sidebarVariant, sidebarMode, shopName, logoUrl }: AppSidebarProps) {
  const { t } = useTranslation();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const isCollapsed = state === 'collapsed';

  // Di mobile, sidebar SELALU harus lewat jalur Sheet drawer (offcanvas) --
  // primitif <Sidebar> cek collapsible==='none' SEBELUM cek isMobile, jadi
  // kalau setting "Mode Sidebar: Full" (collapsible='none') diteruskan mentah
  // di mobile, drawer/hamburger-nya bakal hilang total. Paksa offcanvas di
  // mobile, apa pun setting desktop-nya.
  const effectiveCollapsible = isMobile ? 'offcanvas' : sidebarMode;

  const menuItems = [
    { id: 'overview', label: t('sidebar.overview') as string, icon: LayoutDashboard },
    { id: 'queue', label: t('sidebar.liveQueue') as string, icon: Users },
    { id: 'history', label: t('sidebar.history') as string, icon: History },
    { id: 'requests', label: t('sidebar.requests') as string, icon: MessageSquare, badge: pendingRequestsCount },
    { id: 'schedule', label: t('sidebar.schedule') as string, icon: CalendarDays },
    { id: 'settings', label: t('sidebar.settings') as string, icon: Settings },
  ];

  const handleNav = (id: string) => {
    setActiveTab(id);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible={effectiveCollapsible} variant={sidebarVariant}>
      <SidebarHeader>
        <div className={`flex items-center mt-3 mb-6 ${isCollapsed ? 'justify-center' : 'px-4'}`}>
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="font-display font-bold text-black text-xl">{shopName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-sans font-medium tracking-wide text-white text-lg leading-tight truncate">{shopName}</span>
                <span className="text-[13px] text-zinc-400 font-sans mt-0.5">Queue Engine</span>
              </div>
            )}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!isCollapsed && (
            <SidebarGroupLabel className="text-xs font-medium tracking-[0.1em] uppercase text-zinc-500 px-4 mb-2">
              DASHBOARD & LAYOUTS
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      className="group-data-[collapsible=icon]:p-2! h-11 text-zinc-300 hover:text-white data-[active=true]:text-white data-[active=true]:bg-[#1f1f1f] rounded-xl px-4 font-normal data-[active=true]:font-medium transition-all"
                      onClick={() => handleNav(item.id)}
                      tooltip={item.label}
                      id={`nav-item-${item.id}`}
                    >
                      <Icon className="w-[18px] h-[18px] mr-3 shrink-0" />
                      <span className="font-sans text-[15px]">{item.label}</span>
                    </SidebarMenuButton>
                    {!!item.badge && item.badge > 0 && (
                      <SidebarMenuBadge className="bg-primary text-primary-foreground rounded-full animate-pulse font-semibold">
                        {item.badge}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {!isCollapsed ? (
          <div className="bg-[#1f1f1f] border border-white/5 p-3 rounded-xl flex items-center gap-3 mx-2 mb-2">
            <TrendingUp size={16} className="text-teal-400 shrink-0" />
            <div>
              <p className="text-xs text-zinc-400 font-sans">{t('sidebar.queueEfficiency')}</p>
              <p className="text-sm font-medium text-white font-mono mt-0.5">94.2% <span className="text-[10px] text-teal-400/80 font-normal ml-1">+1.4%</span></p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center text-teal-400">
            <TrendingUp size={16} />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

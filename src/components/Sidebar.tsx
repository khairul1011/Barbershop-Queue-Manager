import React from 'react';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  CalendarDays,
  Settings,
  History,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useTranslation } from '../i18n';
import type { SidebarVariant, SidebarMode } from '../theme-settings';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
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
  const { state, toggleSidebar, isMobile, setOpenMobile } = useSidebar();
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
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={`flex items-center py-2 ${isCollapsed ? 'justify-center' : 'justify-between px-1'}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="font-display font-bold text-primary-foreground text-lg">{shopName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-display font-bold tracking-wide text-foreground leading-tight truncate">{shopName.toUpperCase()}</span>
                <span className="text-[10px] text-muted-foreground font-mono tracking-wider">QUEUE ENGINE</span>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="w-8 h-8 min-w-0 min-h-0 hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
              id="desktop-collapse-btn"
            >
              <ChevronLeft size={16} />
            </Button>
          )}
        </div>
        {isCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="mx-auto w-8 h-8 min-w-0 min-h-0 hover:bg-accent text-muted-foreground hover:text-foreground"
            id="desktop-expand-btn"
          >
            <ChevronRight size={16} />
          </Button>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      size="lg"
                      className="group-data-[collapsible=icon]:p-2!"
                      onClick={() => handleNav(item.id)}
                      tooltip={item.label}
                      id={`nav-item-${item.id}`}
                    >
                      <Icon size={20} />
                      <span className="font-sans font-medium text-[15px]">{item.label}</span>
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

      <SidebarFooter className="border-t border-sidebar-border">
        {!isCollapsed ? (
          <div className="bg-card border border-border p-3 rounded-lg flex items-center gap-3">
            <TrendingUp size={16} className="text-teal-400 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-sans">{t('sidebar.queueEfficiency')}</p>
              <p className="text-sm font-bold text-foreground font-mono">94.2% <span className="text-[10px] text-teal-400 font-normal">+1.4%</span></p>
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

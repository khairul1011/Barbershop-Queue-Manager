import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  MessageSquare, 
  CalendarDays, 
  Settings, 
  Menu, 
  X, 
  ChevronLeft, 
  ChevronRight,
  TrendingUp,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '../i18n';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isOpenMobile: boolean;
  setIsOpenMobile: (open: boolean) => void;
  pendingRequestsCount: number;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  isCollapsed,
  setIsCollapsed,
  isOpenMobile,
  setIsOpenMobile,
  pendingRequestsCount
}: SidebarProps) {

  const { t } = useTranslation();

  const menuItems = [
    { id: 'overview', label: t('sidebar.overview'), icon: LayoutDashboard },
    { id: 'queue', label: t('sidebar.liveQueue'), icon: Users },
    { id: 'history', label: t('sidebar.history'), icon: History },
    { id: 'requests', label: t('sidebar.requests'), icon: MessageSquare, badge: pendingRequestsCount },
    { id: 'schedule', label: t('sidebar.schedule'), icon: CalendarDays },
    { id: 'settings', label: t('sidebar.settings'), icon: Settings },
  ];

  const handleNav = (id: string) => {
    setActiveTab(id);
    setIsOpenMobile(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-sidebar-bg border-r border-border-subtle text-gray-200">
      {/* Brand Header */}
      <div className={`py-4 flex items-center justify-between border-b border-border-subtle h-[72px] ${isCollapsed ? 'px-3 gap-1.5' : 'px-6'}`}>
        <div className={`flex items-center ${isCollapsed ? 'gap-1' : 'gap-3'}`}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/10 shrink-0">
            <span className="font-display font-bold text-black text-lg">G</span>
          </div>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col"
            >
              <span className="font-display font-bold tracking-wide text-white leading-tight">GOLDEN SHEARS</span>
              <span className="text-[10px] text-amber-500 font-mono tracking-wider">QUEUE ENGINE</span>
            </motion.div>
          )}
        </div>

        {/* Collapse button for desktop */}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex min-w-[44px] min-h-[44px] items-center justify-center rounded-lg border border-border-subtle hover:bg-[#151515] text-gray-400 hover:text-amber-500 transition-colors shrink-0 cursor-pointer"
          id="desktop-collapse-btn"
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation Links */}
      <div className={`flex-1 py-6 space-y-2 overflow-y-auto ${isCollapsed ? 'px-2.5' : 'px-4'}`}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={`w-full flex items-center rounded-xl transition-all duration-200 group relative cursor-pointer ${
                isCollapsed ? 'justify-center p-3' : 'gap-4 p-4 md:p-3.5 text-left'
              } ${
                isActive 
                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                  : 'text-gray-400 hover:text-white hover:bg-[#121212] border border-transparent'
              }`}
              id={`nav-item-${item.id}`}
            >
              <div className={`flex items-center w-full ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                  <Icon size={20} className={`transition-colors shrink-0 ${isActive ? 'text-amber-500' : 'text-gray-400 group-hover:text-amber-400'}`} />
                  {(!isCollapsed || isOpenMobile) && (
                    <span className="font-sans font-medium text-[15px]">{item.label}</span>
                  )}
                </div>
                
                {item.badge && item.badge > 0 && (!isCollapsed || isOpenMobile) && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500 text-black animate-pulse">
                    {item.badge}
                  </span>
                )}
              </div>
              
              {/* Active Indicator bar */}
              {isActive && (
                <div className="absolute left-0 top-1/4 bottom-1/4 w-[3px] bg-amber-500 rounded-r-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Footer Branding or Quick Stats (Collapses beautifully) */}
      <div className="p-4 border-t border-border-subtle bg-[#070707]">
        {(!isCollapsed || isOpenMobile) ? (
          <div className="bg-card-bg border border-border-subtle p-3 rounded-xl flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
              <TrendingUp size={16} />
            </div>
            <div>
              <p className="text-xs text-gray-400 font-sans">{t('sidebar.queueEfficiency')}</p>
              <p className="text-sm font-bold text-white font-mono">94.2% <span className="text-[10px] text-teal-400 font-normal">+1.4%</span></p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center text-teal-400">
            <TrendingUp size={16} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop/Tablet Sidebar (Hidden on mobile) */}
      <aside 
        className={`hidden md:block h-dvh sticky top-0 transition-all duration-300 z-30 ${
          isCollapsed ? 'w-24' : 'w-64'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Header Top Bar (Sticky on mobile only) */}
      <div className="md:hidden flex items-center justify-between bg-[#0A0A0A] border-b border-border-subtle px-5 h-[64px] sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center">
            <span className="font-display font-bold text-black text-sm">G</span>
          </div>
          <span className="font-display font-semibold tracking-wide text-white text-base">GOLDEN SHEARS</span>
        </div>
        
        <div className="flex items-center gap-3">
          {pendingRequestsCount > 0 && (
            <button 
              onClick={() => handleNav('requests')}
              className="relative min-w-[44px] min-h-[44px] flex items-center justify-center text-amber-500 cursor-pointer"
              id="mobile-requests-badge-btn"
            >
              <MessageSquare size={20} />
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-black text-[9px] font-bold flex items-center justify-center">
                {pendingRequestsCount}
              </span>
            </button>
          )}
          <button
            onClick={() => setIsOpenMobile(true)}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#151515] rounded-xl cursor-pointer"
            id="mobile-menu-toggle-btn"
          >
            <Menu size={22} />
          </button>
        </div>
      </div>

      {/* Mobile Drawer (AnimatePresence slide-in) */}
      <AnimatePresence>
        {isOpenMobile && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpenMobile(false)}
              className="fixed inset-0 bg-black z-50 md:hidden"
            />
            
            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-[280px] max-w-[85vw] bg-[#0A0A0A] z-50 md:hidden shadow-2xl flex flex-col"
            >
              {/* Close Button Inside Drawer */}
              <div className="p-4 flex justify-end border-b border-border-subtle h-[64px] items-center">
                <button
                  onClick={() => setIsOpenMobile(false)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-white rounded-lg hover:bg-[#151515] cursor-pointer"
                  id="mobile-menu-close-btn"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1">
                {sidebarContent}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

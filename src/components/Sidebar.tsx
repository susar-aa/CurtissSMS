import React from 'react';
import { 
  LayoutDashboard, 
  GraduationCap, 
  CreditCard, 
  FileText, 
  Settings,
  HardDrive,
  Calendar
} from 'lucide-react';
import { NavigationTab, UserRole } from '../../shared/types';

interface SidebarProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  userRole?: UserRole;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, userRole }) => {
  const allNavItems = [
    { id: 'dashboard' as NavigationTab, label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
    { id: 'students' as NavigationTab, label: 'Students', icon: GraduationCap, adminOnly: false },
    { id: 'promotions' as NavigationTab, label: 'Academic Promotions', icon: Calendar, adminOnly: false },
    { id: 'fees' as NavigationTab, label: 'Fee Management', icon: CreditCard, adminOnly: false },
    { id: 'reports' as NavigationTab, label: 'Reports & Print', icon: FileText, adminOnly: false },
    { id: 'settings' as NavigationTab, label: 'System Settings', icon: Settings, adminOnly: true },
  ];

  // RBAC: Staff cannot see Settings
  const navItems = allNavItems.filter(item => !item.adminOnly || userRole === 'Admin');

  return (
    <aside className="w-56 bg-slate-900 text-slate-300 flex flex-col justify-between select-none border-r border-slate-800">
      <div>
        {/* Navigation Section */}
        <div className="p-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 px-3 py-2">
            Main Navigation
          </p>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'hover:bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-slate-900' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center space-x-2 px-2 py-1.5 rounded text-[11px] text-slate-400">
          <HardDrive className="w-3.5 h-3.5 text-slate-500" />
          <div className="flex flex-col">
            <span className="font-medium text-slate-300">Offline Desktop</span>
            <span className="text-[10px] text-slate-500">Curtiss Architecture</span>
          </div>
        </div>
      </div>
    </aside>
  );
};

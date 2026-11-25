import React from 'react';
import { Minus, Square, X, Database, AlertCircle, LogOut, User } from 'lucide-react';
import { IDatabaseHealth, ISystemInfo, IAuthSession } from '../../shared/types';
import { Badge } from './Card';

interface HeaderProps {
  systemInfo: ISystemInfo | null;
  dbHealth: IDatabaseHealth | null;
  currentUser: IAuthSession | null;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  systemInfo, 
  dbHealth, 
  currentUser, 
  onLogout 
}) => {
  const isHealthy = dbHealth?.status === 'ok';

  return (
    <header className="h-11 bg-white border-b border-slate-200 flex items-center justify-between px-3 select-none titlebar-drag z-50">
      {/* Left: Brand & DB Status */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 bg-slate-900 rounded flex items-center justify-center">
            <span className="text-[11px] font-bold text-white tracking-tighter">C</span>
          </div>
          <span className="font-semibold text-xs tracking-tight text-slate-900">CurtissSMS</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
            v{systemInfo?.appVersion || '1.0.0'}
          </span>
        </div>

        <div className="h-3 w-px bg-slate-200 mx-2" />

        {/* Database Health Indicator */}
        <div className="titlebar-no-drag flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[11px] bg-slate-50 border border-slate-200">
          <Database className="w-3 h-3 text-slate-500" />
          {isHealthy ? (
            <span className="flex items-center text-emerald-700 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
              SQLite Active
            </span>
          ) : (
            <span className="flex items-center text-amber-700 font-medium">
              <AlertCircle className="w-3 h-3 text-amber-500 mr-1" />
              Degraded
            </span>
          )}
        </div>
      </div>

      {/* Right: User Profile & Window Controls */}
      <div className="titlebar-no-drag flex items-center space-x-3">
        {currentUser && (
          <div className="flex items-center space-x-2 pr-2 border-r border-slate-200">
            <div className="flex items-center space-x-1.5 text-xs text-slate-700">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-medium">{currentUser.displayName}</span>
              <Badge variant={currentUser.role === 'Admin' ? 'default' : 'neutral'}>
                {currentUser.role}
              </Badge>
            </div>
            <button
              onClick={onLogout}
              className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-rose-600 transition-colors ml-1"
              title="Log Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Window controls */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => window.api?.minimizeWindow?.()}
            className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition-colors"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => window.api?.maximizeWindow?.()}
            className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition-colors"
            title="Maximize"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={() => window.api?.closeWindow?.()}
            className="p-1 hover:bg-rose-500 hover:text-white rounded text-slate-600 transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};

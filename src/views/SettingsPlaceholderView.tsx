import React, { useState } from 'react';
import { Settings, Shield, HardDrive, Info, Users, Building2, Layers } from 'lucide-react';
import { Card, Badge, Button } from '../components/Card';
import { ISystemInfo, IDatabaseHealth } from '../../shared/types';
import { UserManagementView } from './UserManagementView';
import { SchoolProfileSettingsView } from './SchoolProfileSettingsView';
import { LookupManagementView } from './LookupManagementView';

interface SettingsPlaceholderViewProps {
  systemInfo: ISystemInfo | null;
  dbHealth: IDatabaseHealth | null;
}

export const SettingsPlaceholderView: React.FC<SettingsPlaceholderViewProps> = ({
  systemInfo,
  dbHealth
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'lookups' | 'users' | 'diagnostics'>('profile');

  return (
    <div className="space-y-6">
      {/* Settings Navigation Bar */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveSubTab('profile')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeSubTab === 'profile'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>School Profile</span>
        </button>
        <button
          onClick={() => setActiveSubTab('lookups')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeSubTab === 'lookups'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Quick Create & Lookups</span>
        </button>
        <button
          onClick={() => setActiveSubTab('users')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeSubTab === 'users'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>User Accounts & Security</span>
        </button>
        <button
          onClick={() => setActiveSubTab('diagnostics')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeSubTab === 'diagnostics'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Info className="w-3.5 h-3.5" />
          <span>Diagnostics</span>
        </button>
      </div>

      {/* Subtab Contents */}
      {activeSubTab === 'profile' && <SchoolProfileSettingsView />}
      {activeSubTab === 'lookups' && <LookupManagementView />}
      {activeSubTab === 'users' && <UserManagementView />}

      {activeSubTab === 'diagnostics' && (
        <Card title="System Diagnostics" subtitle="Current Hardware & Database Architecture">
          <div className="divide-y divide-slate-100 text-xs">
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-600">Application Identity</span>
              <span className="font-semibold text-slate-900">CurtissSMS Desktop</span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-600">Application Version</span>
              <span className="font-mono text-slate-800">{systemInfo?.appVersion || '1.0.0'}</span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-600">Database Engine</span>
              <span className="font-medium text-slate-900">SQLite 3 (better-sqlite3)</span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-600">Active Migrations Version</span>
              <span className="font-mono text-slate-800">Version {dbHealth?.migrationVersion ?? 0}</span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-600">Data Directory</span>
              <span className="font-mono text-[11px] text-slate-800">{systemInfo?.databasePath || 'N/A'}</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

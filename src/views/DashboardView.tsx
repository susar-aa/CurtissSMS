import React, { useState } from 'react';
import { 
  Database, 
  Activity, 
  Layers, 
  HardDriveDownload, 
  CheckCircle2, 
  AlertTriangle,
  RefreshCw,
  FolderOpen
} from 'lucide-react';
import { Card, Badge, Button } from '../components/Card';
import { IDatabaseHealth, ISystemInfo, IBackupResult } from '../../shared/types';

interface DashboardViewProps {
  systemInfo: ISystemInfo | null;
  dbHealth: IDatabaseHealth | null;
  onRefreshHealth: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  systemInfo,
  dbHealth,
  onRefreshHealth,
}) => {
  const [backupLoading, setBackupLoading] = useState(false);
  const [lastBackupResult, setLastBackupResult] = useState<IBackupResult | null>(null);

  const handleBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await window.api?.triggerBackup();
      if (res && res.data) {
        setLastBackupResult(res.data);
      }
    } finally {
      setBackupLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">System Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1">
            CurtissSMS Architecture & Diagnostics Foundation (Stage 01)
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={onRefreshHealth}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh Diagnostics
          </Button>
          <Button variant="primary" size="sm" onClick={handleBackup} disabled={backupLoading}>
            <HardDriveDownload className="w-3.5 h-3.5 mr-1.5" />
            {backupLoading ? 'Creating Backup...' : 'Backup SQLite DB'}
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">SQLite Engine</span>
            <Database className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900">
              {dbHealth?.status === 'ok' ? 'Healthy' : 'Degraded'}
            </span>
            <Badge variant={dbHealth?.status === 'ok' ? 'success' : 'warning'}>
              WAL Active
            </Badge>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Foreign keys: {dbHealth?.foreignKeysOk ? 'Enforced' : 'Disabled'}
          </p>
        </Card>

        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Schema Version</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900">
              v{dbHealth?.migrationVersion ?? 0}
            </span>
            <Badge variant="neutral">Initial Schema</Badge>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Active Tables: {dbHealth?.tableCount ?? 0}
          </p>
        </Card>

        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Database File Size</span>
            <Activity className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900">
              {formatBytes(dbHealth?.databaseSizeBytes ?? 0)}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Storage: Local Electron userData
          </p>
        </Card>

        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Desktop Runtime</span>
            <FolderOpen className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-xl font-bold text-slate-900">
              Electron {systemInfo?.electronVersion || 'N/A'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Node: {systemInfo?.nodeVersion || 'N/A'}
          </p>
        </Card>
      </div>

      {/* Backup notification if triggered */}
      {lastBackupResult && (
        <div className={`p-4 rounded-lg border text-xs flex items-start space-x-3 ${
          lastBackupResult.success 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
            : 'bg-rose-50 border-rose-200 text-rose-900'
        }`}>
          {lastBackupResult.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
          )}
          <div className="space-y-1">
            <p className="font-semibold">
              {lastBackupResult.success ? 'SQLite Safe Backup Completed' : 'Backup Failed'}
            </p>
            {lastBackupResult.backupPath && (
              <p className="font-mono text-[11px] text-emerald-800 break-all">
                Path: {lastBackupResult.backupPath} ({formatBytes(lastBackupResult.bytesCopied || 0)})
              </p>
            )}
            {lastBackupResult.error && (
              <p className="text-rose-700">{lastBackupResult.error}</p>
            )}
          </div>
        </div>
      )}

      {/* Database Diagnostic Details */}
      <Card title="Database & IPC System Status" subtitle="Stage 01 Architecture Verification">
        <div className="divide-y divide-slate-100 text-xs">
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-slate-600">Database Location</span>
            <span className="font-mono text-slate-900 text-[11px]">
              {systemInfo?.databasePath || 'Connecting...'}
            </span>
          </div>
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-slate-600">Integrity Check</span>
            <span className="font-medium text-emerald-600">
              {dbHealth?.integrity || 'unknown'}
            </span>
          </div>
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-slate-600">Process Security</span>
            <span className="font-medium text-slate-900">
              Context Isolation Enabled · Node Integration Disabled
            </span>
          </div>
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-slate-600">Next Implementation Phase</span>
            <Badge variant="neutral">Stage 02: Full Database Architecture & Schemas</Badge>
          </div>
        </div>
      </Card>
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Users,
  GraduationCap,
  ArrowRight,
  ShieldAlert,
  ChevronRight,
  AlertCircle,
  FileText,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { Card, Badge, Button } from '../components/Card';
import {
  IAuthSession,
  IPromotionSystemStatus,
  IAcademicYear,
  IAnnualProcessingLog,
  IStudentGradeHistoryRecord,
  IPromotionResult,
  ICatchupPromotionResult
} from '../../electron/shared/types';
import { useTranslation } from '../context/I18nContext';

interface AcademicPromotionViewProps {
  currentUser: IAuthSession | null;
}

export const AcademicPromotionView: React.FC<AcademicPromotionViewProps> = ({ currentUser }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<IPromotionSystemStatus | null>(null);
  const [logs, setLogs] = useState<IAnnualProcessingLog[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [yearGradeRecords, setYearGradeRecords] = useState<IStudentGradeHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [retryModalYear, setRetryModalYear] = useState<number | null>(null);

  const isAdmin = currentUser?.role === 'Admin';

  const loadData = useCallback(async () => {
    if (!window.api) return;
    setIsLoading(true);
    try {
      const [statusRes, logsRes] = await Promise.all([
        window.api.getPromotionSystemStatus(),
        window.api.getPromotionLogs()
      ]);

      if (statusRes.success && statusRes.data) {
        setStatus(statusRes.data);
        if (!selectedYear) {
          setSelectedYear(statusRes.data.currentAcademicYear);
        }
      }

      if (logsRes.success && logsRes.data) {
        setLogs(logsRes.data);
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', message: (err as Error).message });
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load student grade progression details when selectedYear changes
  useEffect(() => {
    if (!selectedYear || !window.api) return;
    window.api.getGradeHistoryForYear(selectedYear, 100).then(res => {
      if (res.success && res.data) {
        setYearGradeRecords(res.data);
      } else {
        setYearGradeRecords([]);
      }
    }).catch(() => setYearGradeRecords([]));
  }, [selectedYear]);

  // Handle manual promotion trigger (Admin only)
  const handleTriggerPromotion = async (year: number) => {
    if (!isAdmin || !window.api) return;

    const confirmed = window.confirm(
      `Are you sure you want to process grade promotion for Academic Year ${year}?\n\n` +
      `• Active students in Grades 1–12 will advance by +1 Grade.\n` +
      `• Active students in Grade 13 will be updated to "Passed Out".\n` +
      `• Leaved and already Passed Out students will remain unchanged.\n\n` +
      `Once completed, this academic year's promotion cannot be repeated.`
    );
    if (!confirmed) return;

    setIsProcessing(true);
    setFeedbackMsg(null);
    try {
      const res = await window.api.processPromotion(year);
      if (res.success && res.data) {
        setFeedbackMsg({
          type: 'success',
          message: `Academic Year ${year} promotion completed successfully! Promoted: ${res.data.promotedCount}, Passed Out: ${res.data.passedOutCount}.`
        });
        await loadData();
      } else {
        setFeedbackMsg({ type: 'error', message: res.error || 'Promotion execution failed.' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', message: (err as Error).message });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle manual catch-up trigger (Admin only)
  const handleTriggerCatchup = async () => {
    if (!isAdmin || !window.api) return;
    setIsProcessing(true);
    setFeedbackMsg(null);
    try {
      const res = await window.api.runCatchupPromotions();
      if (res.success && res.data) {
        setFeedbackMsg({
          type: res.data.hasFailures ? 'error' : 'success',
          message: res.data.message
        });
        await loadData();
      } else {
        setFeedbackMsg({ type: 'error', message: res.error || 'Catch-up execution failed.' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', message: (err as Error).message });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle retry of failed promotion
  const handleConfirmRetry = async () => {
    if (!isAdmin || !retryModalYear || !window.api) return;
    setIsRetrying(true);
    setFeedbackMsg(null);
    try {
      const res = await window.api.retryFailedPromotion(retryModalYear);
      if (res.success && res.data) {
        setFeedbackMsg({
          type: 'success',
          message: `Retry for Academic Year ${retryModalYear} completed successfully! Promoted: ${res.data.promotedCount}, Passed Out: ${res.data.passedOutCount}.`
        });
        setRetryModalYear(null);
        await loadData();
      } else {
        setFeedbackMsg({ type: 'error', message: res.error || 'Retry attempt failed.' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', message: (err as Error).message });
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-slate-800" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Academic Year & Grade Promotion</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Automated calendar-year promotion (Jan 1), reliable offline catch-up, and chronological grade audit history.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {isAdmin && status?.isPromotionPending && (
            <Button
              variant="primary"
              size="sm"
              disabled={isProcessing}
              onClick={handleTriggerCatchup}
              className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 text-white"
            >
              {isProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Process Pending Promotion</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            disabled={isLoading || isProcessing}
            onClick={loadData}
            className="flex items-center space-x-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div className={`p-3.5 rounded-lg text-xs flex items-center justify-between border ${
          feedbackMsg.type === 'success' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' :
          feedbackMsg.type === 'error' ? 'bg-red-50 text-red-900 border-red-200' :
          'bg-slate-100 text-slate-800 border-slate-200'
        }`}>
          <div className="flex items-center space-x-2">
            {feedbackMsg.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {feedbackMsg.type === 'error' && <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
            <span className="font-medium">{feedbackMsg.message}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-xs opacity-60 hover:opacity-100 font-bold ml-2">✕</button>
        </div>
      )}

      {/* KPI Cards: Current Academic Year, Last Promotion Date, Student Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Card 1: Current Academic Year */}
        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Academic Year</span>
            <Calendar className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {status?.currentAcademicYear || new Date().getFullYear()}
          </div>
          <div className="text-[11px] text-slate-500 pt-1 flex items-center space-x-1">
            <span>Calendar Cycle:</span>
            <span className="font-semibold text-slate-700">Jan 1 – Dec 31</span>
          </div>
        </Card>

        {/* Card 2: Promotion Status */}
        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Promotion Status</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="pt-0.5">
            {status?.isPromotionPending ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Catch-up Pending ({status.pendingYears.join(', ')})
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Up to Date
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 pt-1">
            {status?.lastPromotion?.completedAt 
              ? `Last completed on ${new Date(status.lastPromotion.completedAt).toLocaleDateString()}` 
              : 'Automatic on Jan 1 with offline catch-up'}
          </div>
        </Card>

        {/* Card 3: Active & Promoted Students */}
        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Active Enrolled Students</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {status?.totalActiveStudents ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 pt-1 flex items-center justify-between">
            <span>Grades 1–13 enrolled</span>
            <span className="text-slate-700 font-semibold">{status?.totalPromotedStudents ?? 0} historic promotions</span>
          </div>
        </Card>

        {/* Card 4: Passed Out & Leaved */}
        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Passed Out & Leaved</span>
            <GraduationCap className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline space-x-3">
            <span className="text-2xl font-bold font-mono text-slate-900">{status?.totalPassedOutStudents ?? 0}</span>
            <span className="text-xs text-slate-400 font-mono">/ {status?.totalSkippedLeavedStudents ?? 0} Leaved</span>
          </div>
          <div className="text-[11px] text-slate-500 pt-1">
            <span>Grade 13 graduates & preserved leaved records</span>
          </div>
        </Card>
      </div>

      {/* Safety Notice Card */}
      <div className="p-3.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-700 space-y-1">
        <div className="flex items-center space-x-1.5 font-semibold text-slate-900">
          <ShieldAlert className="w-4 h-4 text-slate-800" />
          <span>System Promotion Governance & Integrity</span>
        </div>
        <p className="text-slate-600 text-[11px] leading-relaxed">
          Student grade progression is strictly determined through annual academic promotion. Direct manual editing of student grades in registration or profile forms is prohibited. Every successful promotion is recorded with atomic transaction guarantees and permanent audit trails.
        </p>
      </div>

      {/* Main Two-Column Layout: History Logs Table & Selected Year Records */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Academic Year Promotion Logs (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-slate-700" />
                <h3 className="text-sm font-semibold text-slate-900">Academic Year Promotion Logs</h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">{logs.length} Logged Years</span>
            </div>

            {logs.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No annual promotion logs recorded yet. Pending promotions will be processed automatically on startup or via Admin manual catch-up.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold text-[11px]">
                      <th className="py-2.5 px-3">Year</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Promoted</th>
                      <th className="py-2.5 px-3 text-right">Passed Out</th>
                      <th className="py-2.5 px-3 text-right">Skipped</th>
                      <th className="py-2.5 px-3">Executed At</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {logs.map(log => {
                      const isSelected = selectedYear === log.academicYear;
                      return (
                        <tr
                          key={log.id}
                          onClick={() => setSelectedYear(log.academicYear)}
                          className={`cursor-pointer transition hover:bg-slate-50 ${
                            isSelected ? 'bg-slate-100/70 font-semibold' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {log.academicYear}
                          </td>
                          <td className="py-2.5 px-3 font-sans">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              log.status === 'Success' ? 'bg-emerald-100 text-emerald-800' :
                              log.status === 'Failed' ? 'bg-red-100 text-red-800' :
                              'bg-amber-100 text-amber-800'
                            }`}>
                              {log.status === 'Success' ? <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> : <AlertTriangle className="w-2.5 h-2.5 mr-1" />}
                              {log.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-700">
                            {log.promotedCount}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-700">
                            {log.passedOutCount}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-400">
                            {log.skippedLeavedCount}
                          </td>
                          <td className="py-2.5 px-3 font-sans text-[11px] text-slate-500">
                            {new Date(log.executedAt).toLocaleDateString()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-sans">
                            {log.status === 'Failed' && isAdmin ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRetryModalYear(log.academicYear);
                                }}
                                className="px-2 py-0.5 bg-red-600 text-white rounded text-[10px] font-medium hover:bg-red-700 transition"
                              >
                                Retry
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400">Completed</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Grade Progression Details for Selected Year */}
        <div className="space-y-4">
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <GraduationCap className="w-4 h-4 text-slate-700" />
                <h3 className="text-sm font-semibold text-slate-900">
                  {selectedYear ? `Year ${selectedYear} Progression` : 'Student Progression'}
                </h3>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">{yearGradeRecords.length} Records</span>
            </div>

            {yearGradeRecords.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                {selectedYear 
                  ? `No grade progression records found for Academic Year ${selectedYear}.`
                  : 'Select an academic year to inspect student progression records.'}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-1">
                {yearGradeRecords.map(rec => (
                  <div key={rec.id} className="py-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-mono font-semibold text-slate-900">{rec.admissionNumber}</span>
                        <span className="text-slate-700 truncate max-w-[120px]">{rec.fullName}</span>
                      </div>
                      <div className="flex items-center space-x-1 font-mono text-[11px]">
                        <span className="text-slate-500">Gr {rec.previousGrade}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400 inline" />
                        <span className="font-bold text-slate-900">
                          {rec.newGrade === 14 ? 'Passed Out' : `Gr ${rec.newGrade}`}
                        </span>
                      </div>
                    </div>
                    {rec.newStatus === 'Passed Out' && (
                      <div className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded font-medium inline-block">
                        Graduated / Passed Out
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Confirmation Dialog for Manual Retry */}
      {retryModalYear && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden p-6 space-y-4">
            <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
              <RotateCcw className="w-4 h-4 text-red-600" />
              <span>Confirm Retry of Academic Promotion</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to retry grade promotion for <strong>Academic Year {retryModalYear}</strong>?
            </p>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900 space-y-1">
              <strong>Safety Warning:</strong>
              <p>
                The promotion will be executed within an atomic database transaction. If any failure occurs, all changes will be completely rolled back without partial corruption.
              </p>
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={isRetrying}
                onClick={() => setRetryModalYear(null)}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRetrying}
                onClick={handleConfirmRetry}
                className="px-4 py-1.5 text-xs bg-slate-900 text-white rounded font-semibold hover:bg-slate-800 disabled:opacity-50 flex items-center space-x-1.5"
              >
                {isRetrying && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm & Retry</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  CreditCard, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  AlertTriangle, 
  CheckCircle, 
  X, 
  Clock, 
  ShieldAlert, 
  DollarSign, 
  Calendar,
  Layers,
  History,
  Info
} from 'lucide-react';
import { 
  IAuthSession, 
  IAnnualFeeSetting, 
  IFeeConfigAuditLog, 
  IAcademicYear 
} from '../electron/shared/types';

interface FeeConfigurationViewProps {
  currentUser: IAuthSession;
}

export const FeeConfigurationView: React.FC<FeeConfigurationViewProps> = ({ currentUser }) => {
  // Navigation & Data States
  const [configurations, setConfigurations] = useState<IAnnualFeeSetting[]>([]);
  const [academicYears, setAcademicYears] = useState<IAcademicYear[]>([]);
  const [auditLogs, setAuditLogs] = useState<IFeeConfigAuditLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'configurations' | 'audit'>('configurations');

  // Modal / Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [feeAmountStr, setFeeAmountStr] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete Confirmation State
  const [deleteTarget, setDeleteTarget] = useState<IAnnualFeeSetting | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Notification Banner State
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Clear banner after 5 seconds
  useEffect(() => {
    if (banner) {
      const timer = setTimeout(() => setBanner(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [banner]);

  // Load fee configurations
  const loadConfigurations = useCallback(async () => {
    try {
      setIsLoading(true);
      if (!window.api) return;

      const [configsRes, yearsRes, auditRes] = await Promise.all([
        window.api.getFeeConfigurations({ page: currentPage, pageSize, search: searchQuery }),
        window.api.getAllAcademicYears(),
        window.api.getFeeConfigAuditLogs(50)
      ]);

      if (configsRes?.success && configsRes.data) {
        setConfigurations(configsRes.data.items);
        setTotalCount(configsRes.data.total);
      } else if (configsRes?.error) {
        setBanner({ type: 'error', message: configsRes.error });
      }

      if (yearsRes?.success && yearsRes.data) {
        setAcademicYears(yearsRes.data);
      }

      if (auditRes?.success && auditRes.data) {
        setAuditLogs(auditRes.data);
      }
    } catch (err) {
      setBanner({ type: 'error', message: (err as Error).message });
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, searchQuery]);

  useEffect(() => {
    loadConfigurations();
  }, [loadConfigurations]);

  // Set of configured years for easy badge lookup
  const configuredYearsSet = useMemo(() => {
    return new Set(configurations.map(c => c.academicYear));
  }, [configurations]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setModalMode('create');
    // Default to the first unconfigured year or next year
    const currentYear = new Date().getFullYear();
    const candidateYear = configuredYearsSet.has(currentYear) ? currentYear + 1 : currentYear;
    setSelectedYear(candidateYear);
    setFeeAmountStr('');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (config: IAnnualFeeSetting) => {
    setModalMode('edit');
    setSelectedYear(config.academicYear);
    setFeeAmountStr(String(config.feeAmount));
    setFormError(null);
    setIsModalOpen(true);
  };

  // Handle Form Submit
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedAmount = Number(feeAmountStr);
    if (isNaN(parsedAmount) || !Number.isInteger(parsedAmount) || parsedAmount < 0) {
      setFormError('Please enter a valid whole-rupee integer amount (no decimals, non-negative).');
      return;
    }

    if (parsedAmount > 1000000) {
      setFormError('Amount exceeds maximum allowable threshold of LKR 1,000,000.');
      return;
    }

    if (modalMode === 'create' && configuredYearsSet.has(selectedYear)) {
      setFormError(`Academic Year ${selectedYear} is already configured. Please choose another year or edit the existing configuration.`);
      return;
    }

    try {
      setIsSubmitting(true);
      if (modalMode === 'create') {
        const res = await window.api.createAnnualFee({
          academicYear: selectedYear,
          feeAmount: parsedAmount
        });
        if (res.success) {
          setBanner({ type: 'success', message: `Development & Facility Fee for Academic Year ${selectedYear} configured successfully.` });
          setIsModalOpen(false);
          loadConfigurations();
        } else {
          setFormError(res.error || 'Failed to create fee configuration.');
        }
      } else {
        const res = await window.api.updateAnnualFee({
          academicYear: selectedYear,
          feeAmount: parsedAmount
        });
        if (res.success) {
          setBanner({ type: 'success', message: `Development & Facility Fee for Academic Year ${selectedYear} updated to LKR ${parsedAmount.toLocaleString()}. Existing student invoices retain their historical snapshots.` });
          setIsModalOpen(false);
          loadConfigurations();
        } else {
          setFormError(res.error || 'Failed to update fee configuration.');
        }
      }
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Confirmation
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    try {
      setIsDeleting(true);
      const res = await window.api.deleteAnnualFee(deleteTarget.academicYear);
      if (res.success) {
        setBanner({ type: 'success', message: res.data?.message || `Fee configuration for Academic Year ${deleteTarget.academicYear} deleted.` });
        setDeleteTarget(null);
        loadConfigurations();
      } else {
        setBanner({ type: 'error', message: res.error || 'Failed to delete fee configuration.' });
      }
    } catch (err) {
      setBanner({ type: 'error', message: (err as Error).message });
    } finally {
      setIsDeleting(false);
    }
  };

  // RBAC Guard
  if (currentUser.role !== 'Admin') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center text-red-800">
        <ShieldAlert className="w-12 h-12 text-red-600 mx-auto mb-3" />
        <h3 className="text-base font-semibold">Access Restricted</h3>
        <p className="text-xs text-red-600 mt-1">
          Only Administrators have permission to manage Annual Development & Facility Fee configurations.
        </p>
      </div>
    );
  }

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6">
      {/* Top Banner / Notification */}
      {banner && (
        <div className={`p-4 rounded-lg flex items-center justify-between text-xs font-medium ${
          banner.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <div className="flex items-center space-x-2">
            {banner.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
            <span>{banner.message}</span>
          </div>
          <button onClick={() => setBanner(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Card */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-600">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Annual Fee Configuration</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure annual Development & Facility Fee whole-rupee amounts for each academic year.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('configurations')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center space-x-1.5 ${
              activeTab === 'configurations'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Configurations</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center space-x-1.5 ${
              activeTab === 'audit'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit Trail</span>
          </button>
          <button
            onClick={handleOpenCreate}
            className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 shadow-sm transition-colors flex items-center space-x-1.5 ml-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Fee Configuration</span>
          </button>
        </div>
      </div>

      {/* Main Content: Configurations Tab */}
      {activeTab === 'configurations' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          {/* Filter & Search Bar */}
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by academic year..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              Showing {configurations.length} of {totalCount} configured academic year(s)
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Academic Year</th>
                  <th className="py-3 px-4">Fee Amount (LKR)</th>
                  <th className="py-3 px-4">Status & Invoices</th>
                  <th className="py-3 px-4">Last Updated</th>
                  <th className="py-3 px-4">Updated By</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                        <span>Loading annual fee configurations...</span>
                      </div>
                    </td>
                  </tr>
                ) : configurations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <CreditCard className="w-8 h-8 text-slate-300 stroke-[1.5]" />
                        <span className="font-medium text-slate-500">No fee configurations found</span>
                        <p className="text-[11px] text-slate-400 max-w-sm">
                          {searchQuery 
                            ? 'No configurations match your search query.' 
                            : 'Click "Add Fee Configuration" above to define the annual Development & Facility Fee.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  configurations.map((config) => {
                    return (
                      <tr key={config.academicYear} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-800 flex items-center space-x-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Academic Year {config.academicYear}</span>
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-slate-900">
                          Rs. {config.feeAmount.toLocaleString()}.00
                        </td>
                        <td className="py-3 px-4">
                          {config.hasInvoices ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              <Info className="w-3 h-3 mr-1" />
                              {config.invoiceCount} Generated Invoice(s)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
                              Ready (No Invoices)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">
                          {new Date(config.updatedAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {config.updatedByName || config.createdByName || 'System'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => handleOpenEdit(config)}
                              title="Edit fee amount"
                              className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(config)}
                              disabled={config.hasInvoices}
                              title={config.hasInvoices ? "Cannot delete: Invoices already generated" : "Delete configuration"}
                              className={`p-1 rounded transition-colors ${
                                config.hasInvoices 
                                  ? 'text-slate-300 cursor-not-allowed' 
                                  : 'text-rose-600 hover:text-rose-800 hover:bg-rose-50'
                              }`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs bg-slate-50/50">
              <span className="text-[11px] text-slate-500">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center space-x-1">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="px-2.5 py-1 text-xs border border-slate-200 rounded bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600"
                >
                  Previous
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 text-xs border border-slate-200 rounded bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Content: Audit Trail Tab */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden p-4">
          <div className="flex items-center space-x-2 mb-4">
            <History className="w-4 h-4 text-indigo-600" />
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Configuration Change History</h2>
          </div>

          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No fee configuration audit entries recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-3 border border-slate-100 rounded-md bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
                  <div className="flex items-start space-x-2.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-slate-800 font-medium">{log.details}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Academic Year {log.academicYear} • Performed by <span className="font-semibold text-slate-600">{log.userName || 'Admin'}</span>
                      </p>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 shrink-0 self-end sm:self-auto font-mono">
                    {new Date(log.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <CreditCard className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  {modalMode === 'create' ? 'Add Annual Fee Configuration' : `Edit Fee for Year ${selectedYear}`}
                </h3>
              </div>
              <button 
                onClick={() => !isSubmitting && setIsModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Academic Year Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Academic Year
                </label>
                {modalMode === 'create' ? (
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value, 10) || 2026)}
                    required
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                ) : (
                  <div className="px-3 py-2 text-xs font-semibold bg-slate-100 rounded text-slate-700 border border-slate-200">
                    Academic Year {selectedYear}
                  </div>
                )}
                <p className="text-[10px] text-slate-400 mt-1">Calendar year between 2000 and 2100.</p>
              </div>

              {/* Fee Amount Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Development & Facility Fee Amount (LKR)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                    Rs.
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    step={1}
                    placeholder="e.g. 5000"
                    value={feeAmountStr}
                    onChange={(e) => setFeeAmountStr(e.target.value)}
                    required
                    className="w-full pl-10 pr-3 py-2 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Whole rupees only. Decimal fractions and cents are strictly rejected.
                </p>
              </div>

              {/* Snapshot Preservation Notice */}
              {modalMode === 'edit' && (
                <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded text-[11px] text-indigo-700 flex items-start space-x-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Editing this configuration will apply to future invoice generations. Existing student fee records will retain their original fee snapshot.
                  </span>
                </div>
              )}

              {/* Modal Buttons */}
              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50 font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium shadow-sm disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {isSubmitting && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <span>{modalMode === 'create' ? 'Create Configuration' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-sm w-full p-5 text-center">
            <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">Delete Fee Configuration?</h3>
            <p className="text-xs text-slate-500 mt-2">
              Are you sure you want to delete the Development & Facility Fee configuration for{' '}
              <span className="font-semibold text-slate-700">Academic Year {deleteTarget.academicYear}</span> (Rs. {deleteTarget.feeAmount.toLocaleString()})?
            </p>
            <div className="mt-5 flex items-center justify-center space-x-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50 font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-medium shadow-sm disabled:opacity-50 flex items-center space-x-1.5"
              >
                {isDeleting && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

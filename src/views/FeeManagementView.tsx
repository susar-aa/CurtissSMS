import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  CreditCard, 
  Search, 
  Filter, 
  RotateCw, 
  CheckCircle, 
  AlertTriangle, 
  Printer, 
  FileText, 
  Calendar, 
  DollarSign, 
  User, 
  X, 
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Settings
} from 'lucide-react';
import { 
  IAuthSession, 
  IStudentAnnualFeeItem, 
  IFeeGenerationStatus, 
  IReceiptDetails, 
  FeeStatus 
} from '../electron/shared/types';
import { FeeConfigurationView } from './FeeConfigurationView';
import { useTranslation } from '../context/I18nContext';

interface FeeManagementViewProps {
  currentUser: IAuthSession;
}

export const FeeManagementView: React.FC<FeeManagementViewProps> = ({ currentUser }) => {
  const { t, formatCurrency } = useTranslation();
  // Navigation tabs: 'fees' (Fee Records & Cash Payments) or 'config' (Fee Configuration - Admin only)
  const [activeTab, setActiveTab] = useState<'fees' | 'config'>('fees');

  // Generation status
  const [generationStatus, setGenerationStatus] = useState<IFeeGenerationStatus | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Fee List state
  const [feeRecords, setFeeRecords] = useState<IStudentAnnualFeeItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(15);
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Payment Recording Modal
  const [paymentModalFee, setPaymentModalFee] = useState<IStudentAnnualFeeItem | null>(null);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentAmountStr, setPaymentAmountStr] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  // Receipt Modal / Print view
  const [receiptDetails, setReceiptDetails] = useState<IReceiptDetails | null>(null);
  const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);

  // Banner
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (banner) {
      const timer = setTimeout(() => setBanner(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [banner]);

  // Load Status
  const loadGenerationStatus = useCallback(async () => {
    try {
      if (!window.api) return;
      const res = await window.api.getFeeGenerationStatus();
      if (res?.success && res.data) {
        setGenerationStatus(res.data);
      }
    } catch (err) {
      console.error('Failed to load fee status:', err);
    }
  }, []);

  // Load Fees
  const loadFees = useCallback(async () => {
    try {
      setIsLoading(true);
      if (!window.api) return;

      const query: any = {
        page: currentPage,
        pageSize,
        search: searchQuery.trim() || undefined
      };
      if (selectedYear) query.academicYear = selectedYear;
      if (selectedGrade !== '') query.grade = parseInt(selectedGrade, 10);
      if (selectedStatus !== '') query.status = selectedStatus as FeeStatus;

      const res = await window.api.getStudentFees(query);
      if (res?.success && res.data) {
        setFeeRecords(res.data.items);
        setTotalCount(res.data.total);
      } else if (res?.error) {
        setBanner({ type: 'error', message: res.error });
      }
    } catch (err) {
      setBanner({ type: 'error', message: (err as Error).message });
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, selectedYear, selectedGrade, selectedStatus, searchQuery]);

  useEffect(() => {
    loadGenerationStatus();
    loadFees();
  }, [loadGenerationStatus, loadFees]);

  // Trigger Annual Fee Generation (Admin only)
  const handleGenerateAnnualFees = async () => {
    if (!generationStatus) return;
    try {
      setIsGenerating(true);
      setBanner(null);
      const res = await window.api.generateAnnualFees(generationStatus.currentCalendarYear);
      if (res.success && res.data) {
        setBanner({ type: 'success', message: res.data.message });
        loadGenerationStatus();
        loadFees();
      } else {
        setBanner({ type: 'error', message: res.error || 'Fee generation failed.' });
      }
    } catch (err) {
      setBanner({ type: 'error', message: (err as Error).message });
    } finally {
      setIsGenerating(false);
    }
  };

  // Open Payment Modal
  const handleOpenPaymentModal = (fee: IStudentAnnualFeeItem) => {
    setPaymentModalFee(fee);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentAmountStr(String(fee.feeAmount));
    setPaymentNotes('');
    setPaymentError(null);
  };

  // Submit Payment
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalFee) return;

    setPaymentError(null);
    const amount = Number(paymentAmountStr);
    if (isNaN(amount) || !Number.isInteger(amount) || amount <= 0) {
      setPaymentError('Payment amount must be a positive whole-rupee integer.');
      return;
    }

    if (amount !== paymentModalFee.feeAmount) {
      setPaymentError(`Only exact full payment is accepted. Must match fee amount: LKR ${paymentModalFee.feeAmount.toLocaleString()}`);
      return;
    }

    try {
      setIsRecordingPayment(true);
      const res = await window.api.recordCashPayment({
        studentAnnualFeeId: paymentModalFee.id,
        paymentDate,
        amount,
        notes: paymentNotes.trim() || undefined
      });

      if (res.success && res.data) {
        setBanner({ type: 'success', message: `Cash payment recorded successfully. Receipt No: ${res.data.receiptNumber}` });
        setPaymentModalFee(null);
        setReceiptDetails(res.data);
        loadGenerationStatus();
        loadFees();
      } else {
        setPaymentError(res.error || 'Failed to record payment.');
      }
    } catch (err) {
      setPaymentError((err as Error).message);
    } finally {
      setIsRecordingPayment(false);
    }
  };

  // View Receipt
  const handleViewReceipt = async (paymentId: number) => {
    try {
      setIsLoadingReceipt(true);
      const res = await window.api.getReceiptDetails(paymentId);
      if (res.success && res.data) {
        setReceiptDetails(res.data);
      } else {
        setBanner({ type: 'error', message: res.error || 'Failed to load receipt.' });
      }
    } catch (err) {
      setBanner({ type: 'error', message: (err as Error).message });
    } finally {
      setIsLoadingReceipt(false);
    }
  };

  // Print Receipt
  const handlePrint = () => {
    window.print();
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6">
      {/* Print Styles for Compact A4 Receipt */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-receipt, #printable-receipt * {
            visibility: visible;
          }
          #printable-receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20px;
            margin: 0;
            box-shadow: none;
            border: 1px solid #ccc;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Header & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center space-x-2">
            <CreditCard className="w-5 h-5 text-indigo-600" />
            <span>Development & Facility Fees</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Annual fee generation, cash payment recording, and official receipts ledger
          </p>
        </div>

        {currentUser.role === 'Admin' && (
          <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-md">
            <button
              onClick={() => setActiveTab('fees')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                activeTab === 'fees' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Fee Invoices & Payments
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                activeTab === 'config' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Annual Fee Configuration</span>
            </button>
          </div>
        )}
      </div>

      {/* Banner */}
      {banner && (
        <div className={`p-3 rounded-md text-xs flex items-center justify-between shadow-xs ${
          banner.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <div className="flex items-center space-x-2">
            {banner.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{banner.message}</span>
          </div>
          <button onClick={() => setBanner(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Render Fee Configuration if activeTab === 'config' */}
      {activeTab === 'config' && currentUser.role === 'Admin' ? (
        <FeeConfigurationView currentUser={currentUser} />
      ) : (
        <>
          {/* Generation & Metric Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                Academic Year {generationStatus?.currentCalendarYear || new Date().getFullYear()} Fee
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-lg font-bold text-slate-900">
                  {generationStatus?.isCurrentYearConfigured
                    ? (generationStatus.currentYearConfigAmount === 0 ? 'LKR 0 (Fee-Exempt)' : `LKR ${generationStatus.currentYearConfigAmount?.toLocaleString()}`)
                    : 'Not Configured'}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  generationStatus?.isGenerated ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {generationStatus?.isGenerated ? 'Generated' : 'Pending'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {generationStatus?.isGenerated ? 'Generated on Jan 1 or startup catch-up' : 'Requires generation for active students'}
              </p>
            </div>

            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                Active Students
              </span>
              <div className="mt-2 text-lg font-bold text-slate-900">
                {generationStatus?.totalActiveStudents ?? 0}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Excludes Leaved & Passed Out</p>
            </div>

            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                Paid / Exempt Invoices ({generationStatus?.currentCalendarYear})
              </span>
              <div className="mt-2 text-lg font-bold text-emerald-600 flex items-center space-x-2">
                <span>{generationStatus?.paidCount ?? 0}</span>
                {Boolean(generationStatus?.exemptCount) && (
                  <span className="text-xs font-normal text-slate-500">
                    (+{generationStatus?.exemptCount} exempt)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Cash receipts collected</p>
            </div>

            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                  Unpaid Invoices ({generationStatus?.currentCalendarYear})
                </span>
                <div className="mt-2 text-lg font-bold text-amber-600">
                  {generationStatus?.unpaidCount ?? 0}
                </div>
              </div>
              {currentUser.role === 'Admin' && !generationStatus?.isGenerated && (
                <button
                  type="button"
                  disabled={isGenerating || !generationStatus?.isCurrentYearConfigured}
                  onClick={handleGenerateAnnualFees}
                  className="mt-2 w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium shadow-xs disabled:opacity-50 flex items-center justify-center space-x-1"
                >
                  {isGenerating && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />}
                  <span>Generate Fees Now</span>
                </button>
              )}
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Year Filter */}
              <div className="flex items-center space-x-1.5 text-xs text-slate-600">
                <span className="font-medium text-slate-500">Year:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(parseInt(e.target.value, 10));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  {[2023, 2024, 2025, 2026, 2027, 2028].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              {/* Grade Filter */}
              <div className="flex items-center space-x-1.5 text-xs text-slate-600">
                <span className="font-medium text-slate-500">Grade:</span>
                <select
                  value={selectedGrade}
                  onChange={(e) => {
                    setSelectedGrade(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">All Grades</option>
                  {Array.from({ length: 13 }, (_, i) => i + 1).map(g => (
                    <option key={g} value={g}>Grade {g}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center space-x-1.5 text-xs text-slate-600">
                <span className="font-medium text-slate-500">Status:</span>
                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="Unpaid">Unpaid</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search name, adm no, receipt..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Fee Records Table */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Adm No</th>
                    <th className="px-4 py-3">Student Name</th>
                    <th className="px-4 py-3">Grade</th>
                    <th className="px-4 py-3">Year</th>
                    <th className="px-4 py-3">Fee Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Receipt / Payment</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                        <RotateCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-300" />
                        Loading student fee records...
                      </td>
                    </tr>
                  ) : feeRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                        No fee invoices found for the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    feeRecords.map((fee) => (
                      <tr key={fee.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-slate-900">
                          {fee.admissionNumber}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {fee.fullName}
                        </td>
                        <td className="px-4 py-3">
                          Grade {fee.currentGrade}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {fee.academicYear}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          LKR {fee.feeAmount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            fee.isFeeExempt
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : fee.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}>
                            {fee.isFeeExempt ? 'Fee Exempt' : fee.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[11px]">
                          {fee.isFeeExempt ? (
                            <span className="text-blue-600 font-medium text-[10px] italic">
                              Rs. 0 Configuration (Exempt)
                            </span>
                          ) : fee.status === 'Paid' && fee.receiptNumber ? (
                            <div className="space-y-0.5">
                              <span className="font-mono font-medium text-indigo-700 block">
                                {fee.receiptNumber}
                              </span>
                              <span className="text-slate-400 text-[10px]">
                                {fee.paymentDate} ({fee.recordedByName})
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Pending payment</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {fee.isFeeExempt ? (
                            <span className="text-slate-400 text-[11px] italic">No payment required</span>
                          ) : fee.status === 'Unpaid' ? (
                            <button
                              onClick={() => handleOpenPaymentModal(fee)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-medium shadow-xs transition-colors"
                            >
                              Collect Cash
                            </button>
                          ) : fee.paymentId ? (
                            <button
                              onClick={() => handleViewReceipt(fee.paymentId!)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium border border-slate-300 transition-colors inline-flex items-center space-x-1"
                            >
                              <Printer className="w-3 h-3 text-slate-500" />
                              <span>Receipt</span>
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">Fee Exempt</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <div>
                Showing <span className="font-medium text-slate-700">{feeRecords.length}</span> of{' '}
                <span className="font-medium text-slate-700">{totalCount}</span> records
              </div>
              <div className="flex items-center space-x-2">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1 border border-slate-300 rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="p-1 border border-slate-300 rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Collect Cash Payment Modal */}
      {paymentModalFee && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span>Record Cash Payment</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Development & Facility Fee ({paymentModalFee.academicYear})
                </p>
              </div>
              <button
                onClick={() => setPaymentModalFee(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitPayment} className="mt-4 space-y-4">
              {paymentError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700 flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{paymentError}</span>
                </div>
              )}

              {/* Student Details Summary */}
              <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Student:</span>
                  <span className="font-semibold text-slate-900">{paymentModalFee.fullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Admission No:</span>
                  <span className="font-mono text-slate-800">{paymentModalFee.admissionNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Grade:</span>
                  <span className="text-slate-800">Grade {paymentModalFee.currentGrade}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200 font-bold">
                  <span className="text-slate-700">Fee Amount:</span>
                  <span className="text-emerald-700">LKR {paymentModalFee.feeAmount.toLocaleString()}</span>
                </div>
              </div>

              {/* Payment Date */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Payment Date
                </label>
                <input
                  type="date"
                  max={new Date().toISOString().split('T')[0]}
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Amount (Full Payment Only) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Amount Received (LKR)
                  </label>
                  <span className="text-[10px] text-slate-500">Cash only • Exact amount</span>
                </div>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={paymentAmountStr}
                  onChange={(e) => setPaymentAmountStr(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notes / Reference (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Paid in full at school counter"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  disabled={isRecordingPayment}
                  onClick={() => setPaymentModalFee(null)}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRecordingPayment}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium shadow-xs disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {isRecordingPayment && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <span>Confirm Cash Receipt</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Official Receipt Modal (Compact A4 Printable) */}
      {receiptDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="no-print flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                <FileText className="w-4 h-4 text-indigo-600" />
                <span>Payment Receipt Preview</span>
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handlePrint}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium flex items-center space-x-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Receipt</span>
                </button>
                <button
                  onClick={() => setReceiptDetails(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Printable Receipt Layout */}
            <div id="printable-receipt" className="border border-slate-300 p-6 rounded bg-white text-slate-900 space-y-4 font-sans">
              {/* Receipt Header: School Info */}
              <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                <div className="space-y-0.5">
                  <h2 className="text-base font-bold text-slate-900 uppercase tracking-tight">
                    {receiptDetails.schoolSettings.schoolName || 'Curtiss School'}
                  </h2>
                  <p className="text-[11px] text-slate-600">
                    {receiptDetails.schoolSettings.addressLine1}
                    {receiptDetails.schoolSettings.city ? `, ${receiptDetails.schoolSettings.city}` : ''}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Tel: {receiptDetails.schoolSettings.contactNumber1 || 'N/A'} {receiptDetails.schoolSettings.email ? `• ${receiptDetails.schoolSettings.email}` : ''}
                  </p>
                </div>
                {receiptDetails.schoolLogoDataUrl && (
                  <img
                    src={receiptDetails.schoolLogoDataUrl}
                    alt="School Logo"
                    className="w-12 h-12 object-contain"
                  />
                )}
              </div>

              {/* Receipt Meta */}
              <div className="flex justify-between items-center text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Receipt Number</span>
                  <span className="font-mono font-bold text-sm text-slate-900">{receiptDetails.receiptNumber}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Payment Date</span>
                  <span className="font-medium text-slate-900">{receiptDetails.paymentDate}</span>
                </div>
              </div>

              {/* Student Details */}
              <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-1.5 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Student Name</span>
                    <span className="font-bold text-slate-900">{receiptDetails.studentName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Admission Number</span>
                    <span className="font-mono font-bold text-slate-900">{receiptDetails.admissionNumber}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Grade</span>
                    <span className="font-medium text-slate-800">Grade {receiptDetails.currentGrade}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Academic Year</span>
                    <span className="font-medium text-slate-800">{receiptDetails.academicYear}</span>
                  </div>
                </div>
              </div>

              {/* Fee Breakdown Table */}
              <table className="w-full text-xs border border-slate-200">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold">
                  <tr>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-center">Method</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2.5 font-medium">{receiptDetails.feeDescription}</td>
                    <td className="px-3 py-2.5 text-center">{receiptDetails.paymentMethod}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                      LKR {receiptDetails.amount.toLocaleString()}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-200 bg-slate-50 font-bold">
                    <td colSpan={2} className="px-3 py-2 text-right">Total Paid (Cash):</td>
                    <td className="px-3 py-2 text-right text-emerald-800">
                      LKR {receiptDetails.amount.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>

              {receiptDetails.notes && (
                <div className="text-[11px] text-slate-500 italic">
                  Note: {receiptDetails.notes}
                </div>
              )}

              {/* Receipt Footer Signatures */}
              <div className="pt-6 mt-4 border-t border-slate-200 flex justify-between items-end text-[11px] text-slate-600">
                <div>
                  <span className="block text-slate-400">Issued by:</span>
                  <span className="font-medium text-slate-800">{receiptDetails.recordedByName} ({receiptDetails.recordedByRole})</span>
                </div>
                <div className="text-center">
                  <div className="w-32 border-b border-slate-400 mb-1" />
                  <span className="text-[10px] text-slate-500 uppercase">Cashier Signature</span>
                </div>
              </div>
            </div>

            <div className="no-print mt-4 flex justify-end">
              <button
                onClick={() => setReceiptDetails(null)}
                className="px-4 py-1.5 border border-slate-300 rounded text-xs text-slate-700 hover:bg-slate-50 font-medium"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

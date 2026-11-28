import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText,
  Users,
  CreditCard,
  Printer,
  Download,
  Search,
  Filter,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  X,
  Calendar,
  Building,
  Bus,
  Shield,
  Layers,
  ArrowRight,
  ExternalLink,
  Info
} from 'lucide-react';
import {
  IAuthSession,
  IStudentReportFilter,
  IStudentReportSummary,
  IStudentReportItem,
  IFeeReportFilter,
  IFeeReportSummary,
  IFeeReportItem,
  ITwoPageStudentPrintProfile,
  StudentStatus,
  StudentGender,
  FeeStatus
} from '../electron/shared/types';
import { useTranslation } from '../context/I18nContext';

interface ReportsViewProps {
  currentUser: IAuthSession;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ currentUser }) => {
  const { t, formatCurrency } = useTranslation();
  const [activeReportTab, setActiveReportTab] = useState<'students' | 'fees'>('students');

  // ==========================================
  // Student Report State
  // ==========================================
  const [studentSummary, setStudentSummary] = useState<IStudentReportSummary | null>(null);
  const [studentItems, setStudentItems] = useState<IStudentReportItem[]>([]);
  const [studentTotal, setStudentTotal] = useState<number>(0);
  const [studentPage, setStudentPage] = useState<number>(1);
  const [studentPageSize] = useState<number>(15);
  const [isLoadingStudents, setIsLoadingStudents] = useState<boolean>(false);

  // Student Filters
  const [gradeFilter, setGradeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [genderFilter, setGenderFilter] = useState<string>('');
  const [houseFilter, setHouseFilter] = useState<string>('');
  const [tmFilter, setTmFilter] = useState<string>('');
  const [admFromFilter, setAdmFromFilter] = useState<string>('');
  const [admToFilter, setAdmToFilter] = useState<string>('');
  const [studentSearch, setStudentSearch] = useState<string>('');

  // Lookup items for dropdown filters
  const [houses, setHouses] = useState<Array<{ id: number; name: string }>>([]);
  const [transportations, setTransportations] = useState<Array<{ id: number; name: string }>>([]);

  // ==========================================
  // Fee Report State
  // ==========================================
  const [feeAcademicYear, setFeeAcademicYear] = useState<number>(new Date().getFullYear());
  const [feeSummary, setFeeSummary] = useState<IFeeReportSummary | null>(null);
  const [feeItems, setFeeItems] = useState<IFeeReportItem[]>([]);
  const [feeTotal, setFeeTotal] = useState<number>(0);
  const [feePage, setFeePage] = useState<number>(1);
  const [feePageSize] = useState<number>(15);
  const [isLoadingFees, setIsLoadingFees] = useState<boolean>(false);

  // Fee Filters
  const [feeGradeFilter, setFeeGradeFilter] = useState<string>('');
  const [feeStatusFilter, setFeeStatusFilter] = useState<string>('');
  const [payDateFrom, setPayDateFrom] = useState<string>('');
  const [payDateTo, setPayDateTo] = useState<string>('');
  const [feeSearch, setFeeSearch] = useState<string>('');

  // ==========================================
  // Two-Page Student Print Profile State
  // ==========================================
  const [printProfile, setPrintProfile] = useState<ITwoPageStudentPrintProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(false);

  // Notification Banner
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (banner) {
      const timer = setTimeout(() => setBanner(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [banner]);

  // Load Lookups on mount
  useEffect(() => {
    const loadLookups = async () => {
      if (!window.api) return;
      try {
        const [housesRes, tmRes] = await Promise.all([
          window.api.getLookups('houses'),
          window.api.getLookups('transportation_methods')
        ]);
        if (housesRes?.success && housesRes.data) {
          setHouses(housesRes.data.map((h: any) => ({ id: h.id, name: h.name })));
        }
        if (tmRes?.success && tmRes.data) {
          setTransportations(tmRes.data.map((t: any) => ({ id: t.id, name: t.name })));
        }
      } catch (err) {
        console.error('Failed to load lookups for reports:', err);
      }
    };
    loadLookups();
  }, []);

  // ==========================================
  // Fetch Student Report
  // ==========================================
  const fetchStudentReports = useCallback(async () => {
    if (!window.api) return;
    try {
      setIsLoadingStudents(true);
      const filter: IStudentReportFilter = {
        page: studentPage,
        pageSize: studentPageSize,
        search: studentSearch.trim() || undefined
      };
      if (gradeFilter !== '') filter.grade = parseInt(gradeFilter, 10);
      if (statusFilter !== '') filter.status = statusFilter as StudentStatus;
      if (genderFilter !== '') filter.gender = genderFilter as StudentGender;
      if (houseFilter !== '') filter.houseId = parseInt(houseFilter, 10);
      if (tmFilter !== '') filter.transportationMethodId = parseInt(tmFilter, 10);
      if (admFromFilter !== '') filter.admissionDateFrom = admFromFilter;
      if (admToFilter !== '') filter.admissionDateTo = admToFilter;

      const [summaryRes, reportRes] = await Promise.all([
        window.api.getStudentReportSummary(filter),
        window.api.getStudentReport(filter)
      ]);

      if (summaryRes?.success && summaryRes.data) {
        setStudentSummary(summaryRes.data);
      }
      if (reportRes?.success && reportRes.data) {
        setStudentItems(reportRes.data.items);
        setStudentTotal(reportRes.data.total);
      } else if (reportRes?.error) {
        setBanner({ type: 'error', message: reportRes.error });
      }
    } catch (err) {
      setBanner({ type: 'error', message: (err as Error).message });
    } finally {
      setIsLoadingStudents(false);
    }
  }, [
    studentPage,
    studentPageSize,
    gradeFilter,
    statusFilter,
    genderFilter,
    houseFilter,
    tmFilter,
    admFromFilter,
    admToFilter,
    studentSearch
  ]);

  useEffect(() => {
    if (activeReportTab === 'students') {
      fetchStudentReports();
    }
  }, [activeReportTab, fetchStudentReports]);

  // ==========================================
  // Fetch Fee Report
  // ==========================================
  const fetchFeeReports = useCallback(async () => {
    if (!window.api) return;
    try {
      setIsLoadingFees(true);
      const filter: IFeeReportFilter = {
        page: feePage,
        pageSize: feePageSize,
        academicYear: feeAcademicYear,
        search: feeSearch.trim() || undefined
      };
      if (feeGradeFilter !== '') filter.grade = parseInt(feeGradeFilter, 10);
      if (feeStatusFilter === 'Exempt') {
        filter.isFeeExempt = true;
      } else if (feeStatusFilter !== '') {
        filter.status = feeStatusFilter as FeeStatus;
        filter.isFeeExempt = false;
      }
      if (payDateFrom !== '') filter.paymentDateFrom = payDateFrom;
      if (payDateTo !== '') filter.paymentDateTo = payDateTo;

      const [summaryRes, reportRes] = await Promise.all([
        window.api.getFeeReportSummary(feeAcademicYear, payDateFrom || undefined, payDateTo || undefined),
        window.api.getFeeReport(filter)
      ]);

      if (summaryRes?.success && summaryRes.data) {
        setFeeSummary(summaryRes.data);
      }
      if (reportRes?.success && reportRes.data) {
        setFeeItems(reportRes.data.items);
        setFeeTotal(reportRes.data.total);
      } else if (reportRes?.error) {
        setBanner({ type: 'error', message: reportRes.error });
      }
    } catch (err) {
      setBanner({ type: 'error', message: (err as Error).message });
    } finally {
      setIsLoadingFees(false);
    }
  }, [
    feePage,
    feePageSize,
    feeAcademicYear,
    feeGradeFilter,
    feeStatusFilter,
    payDateFrom,
    payDateTo,
    feeSearch
  ]);

  useEffect(() => {
    if (activeReportTab === 'fees') {
      fetchFeeReports();
    }
  }, [activeReportTab, fetchFeeReports]);

  // ==========================================
  // CSV Export Handlers
  // ==========================================
  const handleExportStudentsCsv = async () => {
    try {
      if (!window.api) return;
      const filter: IStudentReportFilter = {
        search: studentSearch.trim() || undefined
      };
      if (gradeFilter !== '') filter.grade = parseInt(gradeFilter, 10);
      if (statusFilter !== '') filter.status = statusFilter as StudentStatus;
      if (genderFilter !== '') filter.gender = genderFilter as StudentGender;
      if (houseFilter !== '') filter.houseId = parseInt(houseFilter, 10);
      if (tmFilter !== '') filter.transportationMethodId = parseInt(tmFilter, 10);
      if (admFromFilter !== '') filter.admissionDateFrom = admFromFilter;
      if (admToFilter !== '') filter.admissionDateTo = admToFilter;

      const res = await window.api.exportStudentsCsv(filter);
      if (res.success && res.data) {
        const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Student_Directory_Report_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setBanner({ type: 'success', message: 'Student report exported to CSV successfully.' });
      } else {
        setBanner({ type: 'error', message: res.error || 'Failed to export CSV.' });
      }
    } catch (err) {
      setBanner({ type: 'error', message: (err as Error).message });
    }
  };

  const handleExportFeesCsv = async () => {
    try {
      if (!window.api) return;
      const filter: IFeeReportFilter = {
        academicYear: feeAcademicYear,
        search: feeSearch.trim() || undefined
      };
      if (feeGradeFilter !== '') filter.grade = parseInt(feeGradeFilter, 10);
      if (feeStatusFilter === 'Exempt') {
        filter.isFeeExempt = true;
      } else if (feeStatusFilter !== '') {
        filter.status = feeStatusFilter as FeeStatus;
        filter.isFeeExempt = false;
      }
      if (payDateFrom !== '') filter.paymentDateFrom = payDateFrom;
      if (payDateTo !== '') filter.paymentDateTo = payDateTo;

      const res = await window.api.exportFeesCsv(filter);
      if (res.success && res.data) {
        const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Development_Fee_Report_${feeAcademicYear}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setBanner({ type: 'success', message: 'Fee report exported to CSV successfully.' });
      } else {
        setBanner({ type: 'error', message: res.error || 'Failed to export CSV.' });
      }
    } catch (err) {
      setBanner({ type: 'error', message: (err as Error).message });
    }
  };

  // ==========================================
  // Load Two-Page Print Profile
  // ==========================================
  const handleOpenPrintProfile = async (studentId: number) => {
    try {
      setIsLoadingProfile(true);
      if (!window.api) return;
      const res = await window.api.getStudentPrintProfile(studentId);
      if (res.success && res.data) {
        setPrintProfile(res.data);
      } else {
        setBanner({ type: 'error', message: res.error || 'Failed to load student print profile.' });
      }
    } catch (err) {
      setBanner({ type: 'error', message: (err as Error).message });
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const studentTotalPages = Math.ceil(studentTotal / studentPageSize) || 1;
  const feeTotalPages = Math.ceil(feeTotal / feePageSize) || 1;

  return (
    <div className="space-y-6">
      {/* Print Styles for Two-Page A4 Student Profile */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 10mm 12mm 10mm 12mm;
        }
        @media print {
          html, body {
            width: 210mm;
            height: auto;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body * {
            visibility: hidden;
          }
          #two-page-student-document, #two-page-student-document * {
            visibility: visible;
          }
          #two-page-student-document {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
          }
          .page-break {
            page-break-before: always !important;
            break-before: page !important;
          }
          .a4-page {
            width: 100% !important;
            box-sizing: border-box;
            background: white !important;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 no-print">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center space-x-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            <span>Reports & Student Printing</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Demographic directories, Development & Facility Fee ledgers, and official 2-Page A4 student dossiers
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-md">
          <button
            onClick={() => setActiveReportTab('students')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeReportTab === 'students' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Student Reports</span>
          </button>
          <button
            onClick={() => setActiveReportTab('fees')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeReportTab === 'fees' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Development Fee Reports</span>
          </button>
        </div>
      </div>

      {/* Banner */}
      {banner && (
        <div className={`p-3 rounded-md text-xs flex items-center justify-between shadow-xs no-print ${
          banner.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <span>{banner.message}</span>
          <button onClick={() => setBanner(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: STUDENT REPORTS                                    */}
      {/* ========================================================= */}
      {activeReportTab === 'students' && (
        <div className="space-y-6 no-print">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">Total Students</span>
              <span className="text-xl font-bold text-slate-900 mt-1 block">{studentSummary?.totalStudents ?? 0}</span>
              <span className="text-[10px] text-slate-400">All registered records</span>
            </div>
            <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 block">Active Students</span>
              <span className="text-xl font-bold text-emerald-700 mt-1 block">{studentSummary?.activeCount ?? 0}</span>
              <span className="text-[10px] text-slate-400">Currently enrolled</span>
            </div>
            <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 block">Leaved Students</span>
              <span className="text-xl font-bold text-amber-700 mt-1 block">{studentSummary?.leavedCount ?? 0}</span>
              <span className="text-[10px] text-slate-400">Transferred / Left</span>
            </div>
            <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 block">Passed Out</span>
              <span className="text-xl font-bold text-indigo-700 mt-1 block">{studentSummary?.passedOutCount ?? 0}</span>
              <span className="text-[10px] text-slate-400">Graduated (Post-Gr 13)</span>
            </div>
            <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">Male Students</span>
              <span className="text-xl font-bold text-slate-800 mt-1 block">{studentSummary?.maleCount ?? 0}</span>
              <span className="text-[10px] text-slate-400">Gender distribution</span>
            </div>
            <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">Female Students</span>
              <span className="text-xl font-bold text-slate-800 mt-1 block">{studentSummary?.femaleCount ?? 0}</span>
              <span className="text-[10px] text-slate-400">Gender distribution</span>
            </div>
          </div>

          {/* Demographic Breakdown Panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Grade Breakdown */}
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Grade Distribution (1–13)</span>
                <span className="text-[10px] font-normal text-slate-500">Student count</span>
              </h3>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {Array.from({ length: 13 }, (_, i) => i + 1).map((g) => {
                  const count = studentSummary?.gradeCounts[g] ?? 0;
                  return (
                    <div key={g} className="text-center p-2 rounded bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-500 block">Gr {g}</span>
                      <span className="text-xs font-bold text-slate-800">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* House & Transportation Breakdown */}
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">House Roster</h3>
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {studentSummary?.houseCounts && studentSummary.houseCounts.length > 0 ? (
                    studentSummary.houseCounts.map((h, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                        <div className="flex items-center space-x-1.5 truncate">
                          {h.colorHex && (
                            <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: h.colorHex }} />
                          )}
                          <span className="text-slate-700 truncate">{h.houseName}</span>
                        </div>
                        <span className="font-bold text-slate-900 shrink-0">{h.count}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 italic">No house data</span>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Transport Methods</h3>
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {studentSummary?.transportationCounts && studentSummary.transportationCounts.length > 0 ? (
                    studentSummary.transportationCounts.map((tm, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                        <span className="text-slate-700 truncate">{tm.transportationMethodName}</span>
                        <span className="font-bold text-slate-900 shrink-0">{tm.count}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 italic">No transport data</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Filter Bar & Export Actions */}
          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-800">Filter Directory</span>
              </div>
              <button
                onClick={handleExportStudentsCsv}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium shadow-xs flex items-center space-x-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Filtered CSV</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
              {/* Grade */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase">Grade</label>
                <select
                  value={gradeFilter}
                  onChange={(e) => { setGradeFilter(e.target.value); setStudentPage(1); }}
                  className="w-full mt-1 px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">All Grades</option>
                  {Array.from({ length: 13 }, (_, i) => i + 1).map((g) => (
                    <option key={g} value={g}>Grade {g}</option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setStudentPage(1); }}
                  className="w-full mt-1 px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Leaved">Leaved</option>
                  <option value="Passed Out">Passed Out</option>
                </select>
              </div>

              {/* Gender */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase">Gender</label>
                <select
                  value={genderFilter}
                  onChange={(e) => { setGenderFilter(e.target.value); setStudentPage(1); }}
                  className="w-full mt-1 px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">All Genders</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              {/* House */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase">House</label>
                <select
                  value={houseFilter}
                  onChange={(e) => { setHouseFilter(e.target.value); setStudentPage(1); }}
                  className="w-full mt-1 px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">All Houses</option>
                  {houses.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>

              {/* Transportation */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase">Transport</label>
                <select
                  value={tmFilter}
                  onChange={(e) => { setTmFilter(e.target.value); setStudentPage(1); }}
                  className="w-full mt-1 px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">All Methods</option>
                  {transportations.map((tm) => (
                    <option key={tm.id} value={tm.id}>{tm.name}</option>
                  ))}
                </select>
              </div>

              {/* Admission Date From */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase">Adm From</label>
                <input
                  type="date"
                  value={admFromFilter}
                  onChange={(e) => { setAdmFromFilter(e.target.value); setStudentPage(1); }}
                  className="w-full mt-1 px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Admission Date To */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase">Adm To</label>
                <input
                  type="date"
                  value={admToFilter}
                  onChange={(e) => { setAdmToFilter(e.target.value); setStudentPage(1); }}
                  className="w-full mt-1 px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search by student full name or admission number..."
                value={studentSearch}
                onChange={(e) => { setStudentSearch(e.target.value); setStudentPage(1); }}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Student Report Table */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Adm No</th>
                    <th className="px-4 py-3">Student Name</th>
                    <th className="px-4 py-3">Grade</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Gender</th>
                    <th className="px-4 py-3">House</th>
                    <th className="px-4 py-3">Transport</th>
                    <th className="px-4 py-3">Adm Date</th>
                    <th className="px-4 py-3 text-right">A4 Profile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {isLoadingStudents ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                        <RotateCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-300" />
                        Loading student records...
                      </td>
                    </tr>
                  ) : studentItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                        No students matched the active filter criteria.
                      </td>
                    </tr>
                  ) : (
                    studentItems.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-slate-900">{st.admissionNumber}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{st.fullName}</td>
                        <td className="px-4 py-3">Grade {st.currentGrade}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            st.status === 'Active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : st.status === 'Leaved'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}>
                            {st.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">{st.gender}</td>
                        <td className="px-4 py-3">
                          {st.houseName ? (
                            <span className="flex items-center space-x-1.5">
                              {st.houseColor && (
                                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: st.houseColor }} />
                              )}
                              <span>{st.houseName}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">None</span>
                          )}
                        </td>
                        <td className="px-4 py-3">{st.transportationMethodName || <span className="text-slate-400 italic">None</span>}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-600">{st.admissionDate}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleOpenPrintProfile(st.id)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium border border-slate-300 inline-flex items-center space-x-1"
                          >
                            <Printer className="w-3 h-3 text-slate-500" />
                            <span>Print 2-Page</span>
                          </button>
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
                Showing <span className="font-medium text-slate-700">{studentItems.length}</span> of{' '}
                <span className="font-medium text-slate-700">{studentTotal}</span> students
              </div>
              <div className="flex items-center space-x-2">
                <button
                  disabled={studentPage <= 1}
                  onClick={() => setStudentPage((p) => Math.max(1, p - 1))}
                  className="p-1 border border-slate-300 rounded hover:bg-white disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs">
                  Page {studentPage} of {studentTotalPages}
                </span>
                <button
                  disabled={studentPage >= studentTotalPages}
                  onClick={() => setStudentPage((p) => Math.min(studentTotalPages, p + 1))}
                  className="p-1 border border-slate-300 rounded hover:bg-white disabled:opacity-40"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: FEE REPORTS                                        */}
      {/* ========================================================= */}
      {activeReportTab === 'fees' && (
        <div className="space-y-6 no-print">
          {/* Year selector & Export button */}
          <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-700">Academic Year:</span>
              <select
                value={feeAcademicYear}
                onChange={(e) => { setFeeAcademicYear(parseInt(e.target.value, 10)); setFeePage(1); }}
                className="px-2.5 py-1 border border-slate-300 rounded text-xs font-semibold focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                {[2023, 2024, 2025, 2026, 2027, 2028].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleExportFeesCsv}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium shadow-xs flex items-center space-x-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Fee Ledger CSV</span>
            </button>
          </div>

          {/* Financial Reconciled Totals Cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">Total Invoices</span>
              <span className="text-xl font-bold text-slate-900 mt-1 block">{feeSummary?.totalInvoices ?? 0}</span>
              <span className="text-[10px] text-slate-400">Generated records</span>
            </div>
            <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 block">Paid Count</span>
              <span className="text-xl font-bold text-emerald-700 mt-1 block">{feeSummary?.paidCount ?? 0}</span>
              <span className="text-[10px] text-slate-400">Cash receipts</span>
            </div>
            <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 block">Fee Exempt</span>
              <span className="text-xl font-bold text-blue-700 mt-1 block">{feeSummary?.exemptCount ?? 0}</span>
              <span className="text-[10px] text-slate-400">Rs. 0 Configuration</span>
            </div>
            <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 block">Unpaid Count</span>
              <span className="text-xl font-bold text-amber-700 mt-1 block">{feeSummary?.unpaidCount ?? 0}</span>
              <span className="text-[10px] text-slate-400">Pending payment</span>
            </div>
            <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 block">Actual Cash Collected</span>
              <span className="text-base font-bold text-emerald-800 mt-1 block truncate">
                LKR {(feeSummary?.actualCollectedLkr ?? 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400">
                {feeSummary?.filteredCollectedLkr !== null && feeSummary?.filteredCollectedLkr !== undefined
                  ? `(LKR ${feeSummary.filteredCollectedLkr.toLocaleString()} in date range)`
                  : 'Reconciled payments'}
              </span>
            </div>
            <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 block">Outstanding Balance</span>
              <span className="text-base font-bold text-rose-700 mt-1 block truncate">
                LKR {(feeSummary?.outstandingLkr ?? 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400">Uncollected fees</span>
            </div>
          </div>

          {/* Grade-wise Fee Collection Breakdown */}
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
              Grade-wise Development & Facility Fee Breakdown ({feeAcademicYear})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-semibold">
                  <tr>
                    <th className="px-3 py-2">Grade</th>
                    <th className="px-3 py-2 text-center">Invoices</th>
                    <th className="px-3 py-2 text-center text-emerald-700">Paid</th>
                    <th className="px-3 py-2 text-center text-blue-700">Exempt</th>
                    <th className="px-3 py-2 text-center text-amber-700">Unpaid</th>
                    <th className="px-3 py-2 text-right text-emerald-700">Collected (LKR)</th>
                    <th className="px-3 py-2 text-right text-rose-700">Outstanding (LKR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {feeSummary?.gradeBreakdown && feeSummary.gradeBreakdown.length > 0 ? (
                    feeSummary.gradeBreakdown.map((gb) => (
                      <tr key={gb.grade} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2 font-semibold text-slate-800">Grade {gb.grade}</td>
                        <td className="px-3 py-2 text-center">{gb.totalStudents}</td>
                        <td className="px-3 py-2 text-center font-medium text-emerald-700">{gb.paidCount}</td>
                        <td className="px-3 py-2 text-center font-medium text-blue-700">{gb.exemptCount}</td>
                        <td className="px-3 py-2 text-center font-medium text-amber-700">{gb.unpaidCount}</td>
                        <td className="px-3 py-2 text-right font-medium text-emerald-800">{gb.collectedLkr.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-medium text-rose-800">{gb.outstandingLkr.toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-3 py-4 text-center text-slate-400 italic">
                        No fee generation records found for Academic Year {feeAcademicYear}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Fee Filter & Search Bar */}
          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Grade */}
              <div className="flex items-center space-x-1 text-xs">
                <span className="text-slate-500">Grade:</span>
                <select
                  value={feeGradeFilter}
                  onChange={(e) => { setFeeGradeFilter(e.target.value); setFeePage(1); }}
                  className="px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">All</option>
                  {Array.from({ length: 13 }, (_, i) => i + 1).map((g) => (
                    <option key={g} value={g}>Gr {g}</option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div className="flex items-center space-x-1 text-xs">
                <span className="text-slate-500">Status:</span>
                <select
                  value={feeStatusFilter}
                  onChange={(e) => { setFeeStatusFilter(e.target.value); setFeePage(1); }}
                  className="px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="Paid">Paid (Cash)</option>
                  <option value="Unpaid">Unpaid</option>
                  <option value="Exempt">Fee-Exempt</option>
                </select>
              </div>

              {/* Payment Date Range */}
              <div className="flex items-center space-x-1 text-xs">
                <span className="text-slate-500">Paid:</span>
                <input
                  type="date"
                  value={payDateFrom}
                  onChange={(e) => { setPayDateFrom(e.target.value); setFeePage(1); }}
                  className="px-2 py-0.5 border border-slate-300 rounded text-xs"
                />
                <span className="text-slate-400">–</span>
                <input
                  type="date"
                  value={payDateTo}
                  onChange={(e) => { setPayDateTo(e.target.value); setFeePage(1); }}
                  className="px-2 py-0.5 border border-slate-300 rounded text-xs"
                />
              </div>
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search name, adm no, receipt..."
                value={feeSearch}
                onChange={(e) => { setFeeSearch(e.target.value); setFeePage(1); }}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Fee Invoices Table */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Adm No</th>
                    <th className="px-4 py-3">Student Name</th>
                    <th className="px-4 py-3">Grade</th>
                    <th className="px-4 py-3">Fee Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Receipt No</th>
                    <th className="px-4 py-3">Payment Date</th>
                    <th className="px-4 py-3">Paid Amount</th>
                    <th className="px-4 py-3 text-right">Cashier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {isLoadingFees ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                        <RotateCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-300" />
                        Loading fee records...
                      </td>
                    </tr>
                  ) : feeItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                        No fee invoices matched the active filters.
                      </td>
                    </tr>
                  ) : (
                    feeItems.map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-slate-900">{f.admissionNumber}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{f.fullName}</td>
                        <td className="px-4 py-3">Grade {f.currentGrade}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">LKR {f.feeAmount.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            f.isFeeExempt
                              ? 'bg-blue-100 text-blue-800'
                              : f.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {f.isFeeExempt ? 'Fee Exempt' : f.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-indigo-700 font-medium">
                          {f.receiptNumber || <span className="text-slate-400 font-normal italic">N/A</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-600">
                          {f.paymentDate || <span className="text-slate-400 italic">N/A</span>}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {f.paymentAmount !== null ? `LKR ${f.paymentAmount.toLocaleString()}` : (f.isFeeExempt ? 'LKR 0' : '—')}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 text-[11px]">
                          {f.recordedByName || (f.isFeeExempt ? 'System (Exempt)' : '—')}
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
                Showing <span className="font-medium text-slate-700">{feeItems.length}</span> of{' '}
                <span className="font-medium text-slate-700">{feeTotal}</span> invoices
              </div>
              <div className="flex items-center space-x-2">
                <button
                  disabled={feePage <= 1}
                  onClick={() => setFeePage((p) => Math.max(1, p - 1))}
                  className="p-1 border border-slate-300 rounded hover:bg-white disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs">
                  Page {feePage} of {feeTotalPages}
                </span>
                <button
                  disabled={feePage >= feeTotalPages}
                  onClick={() => setFeePage((p) => Math.min(feeTotalPages, p + 1))}
                  className="p-1 border border-slate-300 rounded hover:bg-white disabled:opacity-40"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TWO-PAGE A4 STUDENT PROFILE PRINT PREVIEW MODAL           */}
      {/* ========================================================= */}
      {printProfile && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg border border-slate-300 shadow-2xl max-w-4xl w-full my-8 overflow-hidden">
            {/* Modal action bar (hidden on print) */}
            <div className="no-print bg-slate-900 text-white p-3.5 px-6 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Printer className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold tracking-wide uppercase">
                  Official 2-Page A4 Student Dossier Preview
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handlePrint}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium flex items-center space-x-1.5 shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Document</span>
                </button>
                <button
                  onClick={() => setPrintProfile(null)}
                  className="p-1 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Document Content */}
            <div id="two-page-student-document" className="bg-white p-8 space-y-8 font-sans text-slate-900">
              {/* ========================================== */}
              {/* PAGE 1: STUDENT & FAMILY PROFILE           */}
              {/* ========================================== */}
              <div className="a4-page space-y-6">
                {/* School Header */}
                <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4">
                  <div className="space-y-1">
                    <h1 className="text-lg font-black uppercase tracking-tight text-slate-900">
                      {printProfile.schoolSettings.schoolName || 'CURTISS COLLEGE'}
                    </h1>
                    <p className="text-xs text-slate-600">
                      {printProfile.schoolSettings.addressLine1}
                      {printProfile.schoolSettings.city ? `, ${printProfile.schoolSettings.city}` : ''}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Tel: {printProfile.schoolSettings.contactNumber1 || 'N/A'}{' '}
                      {printProfile.schoolSettings.email ? `• Email: ${printProfile.schoolSettings.email}` : ''}
                    </p>
                  </div>
                  {printProfile.schoolLogoDataUrl ? (
                    <img
                      src={printProfile.schoolLogoDataUrl}
                      alt="School Logo"
                      className="w-16 h-16 object-contain"
                    />
                  ) : (
                    <div className="w-16 h-16 border border-slate-300 rounded flex items-center justify-center text-[10px] text-slate-400 font-medium">
                      School Logo
                    </div>
                  )}
                </div>

                <div className="text-center py-1 bg-slate-100 border border-slate-300 font-bold text-xs uppercase tracking-wider text-slate-800">
                  Page 1 – Student & Family Dossier
                </div>

                {/* Top Section: Photo and Core Identity */}
                <div className="grid grid-cols-4 gap-6 items-start">
                  <div className="col-span-1">
                    <div className="w-32 h-40 border-2 border-slate-300 rounded bg-slate-50 flex items-center justify-center overflow-hidden mx-auto shadow-xs">
                      {printProfile.student.photoPreviewUrl ? (
                        <img
                          src={printProfile.student.photoPreviewUrl}
                          alt="Student"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center p-2 text-slate-400 text-[10px] leading-tight">
                          <Users className="w-8 h-8 mx-auto mb-1 text-slate-300" />
                          <span>No Photo Provided</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="col-span-3 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-3 pb-2 border-b border-slate-200">
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-slate-500 block">Full Name</span>
                        <span className="text-sm font-bold text-slate-900 block">{printProfile.student.fullName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-slate-500 block">Admission Number</span>
                        <span className="font-mono text-sm font-bold text-indigo-700 block">{printProfile.student.admissionNumber}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-slate-500 block">Current Grade</span>
                        <span className="font-semibold text-slate-800">Grade {printProfile.student.currentGrade}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-slate-500 block">Student Status</span>
                        <span className="font-semibold text-slate-800">{printProfile.student.status}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-slate-500 block">Gender</span>
                        <span className="font-semibold text-slate-800">{printProfile.student.gender}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-slate-500 block">Date of Birth</span>
                        <span className="font-semibold text-slate-800">{printProfile.student.dateOfBirth}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-slate-500 block">Admission Date</span>
                        <span className="font-semibold text-slate-800">{printProfile.student.admissionDate}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-slate-500 block">Family Code</span>
                        <span className="font-mono font-semibold text-slate-800">{printProfile.student.familyCode}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: Residence, House & Transport */}
                <div className="border border-slate-200 rounded p-3 bg-slate-50/50 space-y-2 text-xs">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-600 block border-b border-slate-200 pb-1">
                    Residence & Extracurricular Affiliation
                  </span>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <span className="text-[10px] text-slate-500 uppercase block">Complete Residential Address</span>
                      <span className="text-slate-800 font-medium">
                        {printProfile.student.fullAddress || [
                          printProfile.student.houseNo,
                          printProfile.student.streetName,
                          printProfile.student.cityName
                        ].filter(Boolean).join(', ') || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Transportation Method</span>
                      <span className="text-slate-800 font-medium">
                        {printProfile.student.transportationMethodName || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">House Affiliation</span>
                      <span className="text-slate-800 font-medium flex items-center space-x-1.5">
                        {printProfile.student.houseColor && (
                          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: printProfile.student.houseColor }} />
                        )}
                        <span>{printProfile.student.houseName || 'N/A'}</span>
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] text-slate-500 uppercase block">Previous School History</span>
                      <span className="text-slate-800 font-medium">
                        {printProfile.student.previousSchoolName
                          ? `${printProfile.student.previousSchoolName} (ID: ${printProfile.student.previousSchoolIdNumber || 'N/A'})`
                          : 'None / First Enrollment'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section: Parents & Guardians */}
                <div className="border border-slate-200 rounded p-3 bg-slate-50/50 space-y-2 text-xs">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-600 block border-b border-slate-200 pb-1">
                    Parent & Guardian Records
                  </span>
                  <table className="w-full text-left text-xs border border-slate-200">
                    <thead className="bg-slate-100 text-[10px] font-semibold text-slate-600 uppercase">
                      <tr>
                        <th className="px-2.5 py-1.5">Relation</th>
                        <th className="px-2.5 py-1.5">Name</th>
                        <th className="px-2.5 py-1.5">Contact No</th>
                        <th className="px-2.5 py-1.5">WhatsApp</th>
                        <th className="px-2.5 py-1.5">Occupation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {printProfile.student.familyMembers && printProfile.student.familyMembers.length > 0 ? (
                        printProfile.student.familyMembers.map((m) => (
                          <tr key={m.id}>
                            <td className="px-2.5 py-1.5 font-semibold text-slate-800">{m.relationshipType}</td>
                            <td className="px-2.5 py-1.5">{m.name}</td>
                            <td className="px-2.5 py-1.5 font-mono">{m.contactNumber || '—'}</td>
                            <td className="px-2.5 py-1.5 font-mono">{m.whatsappNumber || '—'}</td>
                            <td className="px-2.5 py-1.5">{m.occupationName || '—'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-2.5 py-2 text-center text-slate-400 italic">No family member records found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Section: Linked Siblings */}
                <div className="border border-slate-200 rounded p-3 bg-slate-50/50 space-y-1.5 text-xs">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-600 block border-b border-slate-200 pb-1">
                    Linked Siblings
                  </span>
                  <div className="flex flex-wrap gap-3">
                    {printProfile.student.linkedStudents && printProfile.student.linkedStudents.filter(s => s.id !== printProfile.student.id).length > 0 ? (
                      printProfile.student.linkedStudents.filter(s => s.id !== printProfile.student.id).map((sib) => (
                        <div key={sib.id} className="p-2 border border-slate-200 rounded bg-white text-xs">
                          <span className="font-bold text-slate-900 block">{sib.fullName}</span>
                          <span className="font-mono text-[11px] text-indigo-700">Adm: {sib.admissionNumber}</span>
                          <span className="text-slate-500 text-[10px] ml-2">Grade {sib.currentGrade} ({sib.status})</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 italic">No linked siblings recorded.</span>
                    )}
                  </div>
                </div>

                {/* Performance Description & Student Notes */}
                <div className="border border-slate-200 rounded p-3 bg-slate-50/50 space-y-2 text-xs">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-600 block border-b border-slate-200 pb-1">
                    Special Remarks & Student Notes
                  </span>
                  {printProfile.student.performanceDescription && (
                    <p className="text-xs text-slate-700 italic">
                      Performance / Remarks: {printProfile.student.performanceDescription}
                    </p>
                  )}
                  {printProfile.student.notes && printProfile.student.notes.length > 0 ? (
                    <div className="space-y-1">
                      {printProfile.student.notes.map((n) => (
                        <div key={n.id} className="text-[11px] text-slate-600 flex justify-between border-b border-slate-100 py-0.5">
                          <span>• {n.noteText}</span>
                          <span className="text-slate-400 text-[10px] shrink-0 font-mono">{n.createdAt?.split(' ')[0]}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">No notes recorded.</span>
                  )}
                </div>

                {/* Page 1 Footer */}
                <div className="pt-4 border-t border-slate-300 flex justify-between items-center text-[10px] text-slate-400">
                  <span>Dossier Printed: {printProfile.printedAt?.replace('T', ' ').split('.')[0]}</span>
                  <span>Issued By: {printProfile.printedBy}</span>
                  <span>Page 1 of 2</span>
                </div>
              </div>

              {/* ========================================== */}
              {/* PAGE 2: DEVELOPMENT & FACILITY FEE HISTORY */}
              {/* ========================================== */}
              <div className="a4-page space-y-6 page-break pt-4">
                {/* School Mini Header for Page 2 */}
                <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3">
                  <div>
                    <h2 className="text-base font-bold uppercase tracking-tight text-slate-900">
                      {printProfile.schoolSettings.schoolName || 'CURTISS COLLEGE'}
                    </h2>
                    <p className="text-[11px] text-slate-500">Official Student Financial History</p>
                  </div>
                  <div className="text-right text-xs">
                    <span className="font-bold text-slate-900 block">{printProfile.student.fullName}</span>
                    <span className="font-mono text-indigo-700 font-semibold block">Adm No: {printProfile.student.admissionNumber}</span>
                  </div>
                </div>

                <div className="text-center py-1 bg-slate-100 border border-slate-300 font-bold text-xs uppercase tracking-wider text-slate-800">
                  Page 2 – School Development & Facility Fee Register
                </div>

                <p className="text-xs text-slate-600">
                  This official ledger documents all Development & Facility Fee annual assessments and cash payments recorded in the school system for this student.
                </p>

                {/* Historical Fee Records Table */}
                <table className="w-full text-left text-xs border border-slate-300">
                  <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold text-[10px] uppercase">
                    <tr>
                      <th className="px-3 py-2.5">Academic Year</th>
                      <th className="px-3 py-2.5">Assessment Amount</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Receipt No</th>
                      <th className="px-3 py-2.5">Payment Date</th>
                      <th className="px-3 py-2.5 text-right">Cash Paid</th>
                      <th className="px-3 py-2.5">Recorded By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {printProfile.feeHistory && printProfile.feeHistory.length > 0 ? (
                      printProfile.feeHistory.map((fh, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 font-bold text-slate-800">{fh.academicYear}</td>
                          <td className="px-3 py-2.5 font-semibold text-slate-900">LKR {fh.feeAmount.toLocaleString()}</td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              fh.isFeeExempt
                                ? 'bg-blue-100 text-blue-900'
                                : fh.status === 'Paid'
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-rose-100 text-rose-900'
                            }`}>
                              {fh.isFeeExempt ? 'Fee Exempt' : fh.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-indigo-700">{fh.receiptNumber || '—'}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-600">{fh.paymentDate || '—'}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                            {fh.paymentAmount !== null ? `LKR ${fh.paymentAmount.toLocaleString()}` : (fh.isFeeExempt ? 'LKR 0' : '—')}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600 text-[11px]">{fh.recordedByName || (fh.isFeeExempt ? 'System' : '—')}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-slate-400 italic">
                          No annual Development & Facility Fee records found for this student.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Financial Verification & Reconciled Summary */}
                <div className="grid grid-cols-2 gap-4 border border-slate-200 rounded p-4 bg-slate-50">
                  <div className="space-y-1 text-xs">
                    <span className="font-bold text-slate-800 block">Ledger Verification Note</span>
                    <p className="text-[11px] text-slate-500">
                      All receipts are authenticated with cryptographic database constraint enforcement. Partial payments are prohibited under school finance guidelines.
                    </p>
                  </div>
                  <div className="space-y-1 text-xs text-right">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total Assessed Fees:</span>
                      <span className="font-bold text-slate-900">
                        LKR {printProfile.feeHistory.reduce((sum, f) => sum + f.feeAmount, 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total Cash Collected:</span>
                      <span className="font-bold text-emerald-700">
                        LKR {printProfile.feeHistory.reduce((sum, f) => sum + (f.paymentAmount || 0), 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Signatures & Stamp */}
                <div className="pt-16 mt-8 border-t border-slate-300 grid grid-cols-3 gap-6 text-center text-xs">
                  <div>
                    <div className="border-b border-slate-400 w-40 mx-auto mb-1" />
                    <span className="text-[10px] uppercase font-semibold text-slate-500">Prepared By (Cashier)</span>
                  </div>
                  <div>
                    <div className="border-b border-slate-400 w-40 mx-auto mb-1" />
                    <span className="text-[10px] uppercase font-semibold text-slate-500">Verified By (Bursar)</span>
                  </div>
                  <div>
                    <div className="border-b border-slate-400 w-40 mx-auto mb-1" />
                    <span className="text-[10px] uppercase font-semibold text-slate-500">Principal / Registrar</span>
                  </div>
                </div>

                {/* Page 2 Footer */}
                <div className="pt-8 border-t border-slate-300 flex justify-between items-center text-[10px] text-slate-400">
                  <span>CurtissSMS Financial Certification</span>
                  <span>System Generated Document</span>
                  <span>Page 2 of 2</span>
                </div>
              </div>
            </div>

            {/* Modal bottom close button (hidden on print) */}
            <div className="no-print bg-slate-100 p-3 px-6 flex justify-end border-t border-slate-200">
              <button
                onClick={() => setPrintProfile(null)}
                className="px-4 py-1.5 border border-slate-300 rounded text-xs text-slate-700 hover:bg-slate-200 font-medium"
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

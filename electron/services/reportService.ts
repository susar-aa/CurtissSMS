import Database from 'better-sqlite3';
import {
  IAuthSession,
  IStudentReportFilter,
  IStudentReportSummary,
  IStudentReportItem,
  IFeeReportFilter,
  IFeeReportSummary,
  IFeeReportItem,
  IStudentFeeHistoryRecord,
  ITwoPageStudentPrintProfile,
  IPaginatedResult,
  StudentStatus,
  StudentGender
} from '../shared/types';
import { StudentService } from './studentService';
import { SchoolSettingsService } from './schoolSettingsService';

export class ReportService {
  private db: Database.Database;
  private studentService: StudentService;
  private schoolSettingsService: SchoolSettingsService;

  constructor(db: Database.Database, studentService?: StudentService) {
    this.db = db;
    this.studentService = studentService || new StudentService(db);
    this.schoolSettingsService = new SchoolSettingsService(db);
  }

  /**
   * Sanitizes values for CSV export to strictly prevent Spreadsheet Formula Injection (=, +, -, @, \t, \r).
   */
  public static sanitizeCsvCell(value: unknown): string {
    if (value === null || value === undefined) {
      return '""';
    }
    let str = String(value).trim();
    // Neutralize dangerous formula prefixes
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    // Escape internal double quotes
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  // ==========================================
  // 1. Student Reports
  // ==========================================

  private buildStudentWhereClause(filter: IStudentReportFilter): { whereSql: string; params: unknown[] } {
    const clauses: string[] = ['1=1'];
    const params: unknown[] = [];

    if (filter.status) {
      clauses.push('s.status = ?');
      params.push(filter.status);
    }

    if (filter.gender) {
      clauses.push('s.gender = ?');
      params.push(filter.gender);
    }

    if (filter.grade !== undefined && filter.grade !== null && Number.isInteger(Number(filter.grade))) {
      clauses.push('s.current_grade = ?');
      params.push(Number(filter.grade));
    }

    if (filter.houseId !== undefined && filter.houseId !== null && Number.isInteger(Number(filter.houseId))) {
      clauses.push('s.house_id = ?');
      params.push(Number(filter.houseId));
    }

    if (filter.transportationMethodId !== undefined && filter.transportationMethodId !== null && Number.isInteger(Number(filter.transportationMethodId))) {
      clauses.push('s.transportation_method_id = ?');
      params.push(Number(filter.transportationMethodId));
    }

    if (filter.admissionDateFrom && /^\d{4}-\d{2}-\d{2}$/.test(filter.admissionDateFrom)) {
      clauses.push('s.admission_date >= ?');
      params.push(filter.admissionDateFrom);
    }

    if (filter.admissionDateTo && /^\d{4}-\d{2}-\d{2}$/.test(filter.admissionDateTo)) {
      clauses.push('s.admission_date <= ?');
      params.push(filter.admissionDateTo);
    }

    if (filter.search && filter.search.trim()) {
      const term = filter.search.trim();
      clauses.push('(s.admission_number LIKE ? OR s.full_name LIKE ?)');
      params.push(`${term}%`, `%${term}%`);
    }

    return {
      whereSql: clauses.join(' AND '),
      params
    };
  }

  public getStudentReportSummary(filter: IStudentReportFilter = {}): IStudentReportSummary {
    const { whereSql, params } = this.buildStudentWhereClause(filter);

    // Total and status/gender counts
    const overviewSql = `
      SELECT 
        COUNT(s.id) as total_students,
        SUM(CASE WHEN s.status = 'Active' THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN s.status = 'Leaved' THEN 1 ELSE 0 END) as leaved_count,
        SUM(CASE WHEN s.status = 'Passed Out' THEN 1 ELSE 0 END) as passed_out_count,
        SUM(CASE WHEN s.gender = 'Male' THEN 1 ELSE 0 END) as male_count,
        SUM(CASE WHEN s.gender = 'Female' THEN 1 ELSE 0 END) as female_count
      FROM students s
      LEFT JOIN houses h ON s.house_id = h.id
      LEFT JOIN transportation_methods tm ON s.transportation_method_id = tm.id
      WHERE ${whereSql}
    `;
    const overview = this.db.prepare(overviewSql).get(...params) as Record<string, number | null>;

    // Grade counts (1 through 13)
    const gradeSql = `
      SELECT s.current_grade, COUNT(s.id) as count
      FROM students s
      LEFT JOIN houses h ON s.house_id = h.id
      LEFT JOIN transportation_methods tm ON s.transportation_method_id = tm.id
      WHERE ${whereSql}
      GROUP BY s.current_grade
    `;
    const gradeRows = this.db.prepare(gradeSql).all(...params) as Array<{ current_grade: number; count: number }>;
    const gradeCounts: Record<number, number> = {};
    for (let g = 1; g <= 13; g++) gradeCounts[g] = 0;
    for (const r of gradeRows) {
      if (r.current_grade >= 1 && r.current_grade <= 13) {
        gradeCounts[r.current_grade] = Number(r.count);
      }
    }

    // House counts
    const houseSql = `
      SELECT h.id as house_id, COALESCE(h.name, 'Unassigned') as house_name, h.color_hex, COUNT(s.id) as count
      FROM students s
      LEFT JOIN houses h ON s.house_id = h.id
      LEFT JOIN transportation_methods tm ON s.transportation_method_id = tm.id
      WHERE ${whereSql}
      GROUP BY s.house_id
      ORDER BY count DESC
    `;
    const houseRows = this.db.prepare(houseSql).all(...params) as Array<{ house_id: number | null; house_name: string; color_hex: string | null; count: number }>;
    const houseCounts = houseRows.map(r => ({
      houseId: r.house_id !== null ? Number(r.house_id) : null,
      houseName: r.house_name,
      count: Number(r.count),
      colorHex: r.color_hex
    }));

    // Transportation counts
    const tmSql = `
      SELECT tm.id as tm_id, COALESCE(tm.name, 'Unassigned') as tm_name, COUNT(s.id) as count
      FROM students s
      LEFT JOIN transportation_methods tm ON s.transportation_method_id = tm.id
      LEFT JOIN houses h ON s.house_id = h.id
      WHERE ${whereSql}
      GROUP BY s.transportation_method_id
      ORDER BY count DESC
    `;
    const tmRows = this.db.prepare(tmSql).all(...params) as Array<{ tm_id: number | null; tm_name: string; count: number }>;
    const transportationCounts = tmRows.map(r => ({
      transportationMethodId: r.tm_id !== null ? Number(r.tm_id) : null,
      transportationMethodName: r.tm_name,
      count: Number(r.count)
    }));

    return {
      totalStudents: Number(overview?.total_students || 0),
      activeCount: Number(overview?.active_count || 0),
      leavedCount: Number(overview?.leaved_count || 0),
      passedOutCount: Number(overview?.passed_out_count || 0),
      maleCount: Number(overview?.male_count || 0),
      femaleCount: Number(overview?.female_count || 0),
      gradeCounts,
      houseCounts,
      transportationCounts
    };
  }

  public getStudentReport(filter: IStudentReportFilter = {}): IPaginatedResult<IStudentReportItem> {
    const page = Math.max(1, Number(filter.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(filter.pageSize || 20)));
    const offset = (page - 1) * pageSize;

    const { whereSql, params } = this.buildStudentWhereClause(filter);

    const countSql = `
      SELECT COUNT(s.id) as total
      FROM students s
      INNER JOIN families f ON s.family_id = f.id
      LEFT JOIN houses h ON s.house_id = h.id
      LEFT JOIN transportation_methods tm ON s.transportation_method_id = tm.id
      WHERE ${whereSql}
    `;
    const countRow = this.db.prepare(countSql).get(...params) as { total: number };
    const total = countRow ? Number(countRow.total) : 0;

    const itemsSql = `
      SELECT 
        s.id,
        s.admission_number,
        s.full_name,
        s.gender,
        s.date_of_birth,
        s.current_grade,
        s.status,
        s.admission_date,
        s.previous_school_name,
        s.previous_school_id_number,
        h.name as house_name,
        h.color_hex as house_color,
        tm.name as transportation_method_name,
        f.full_address
      FROM students s
      INNER JOIN families f ON s.family_id = f.id
      LEFT JOIN houses h ON s.house_id = h.id
      LEFT JOIN transportation_methods tm ON s.transportation_method_id = tm.id
      WHERE ${whereSql}
      ORDER BY s.current_grade ASC, s.admission_number ASC
      LIMIT ? OFFSET ?
    `;
    const rows = this.db.prepare(itemsSql).all(...params, pageSize, offset) as Array<Record<string, unknown>>;

    const items: IStudentReportItem[] = rows.map(r => ({
      id: Number(r.id),
      admissionNumber: String(r.admission_number),
      fullName: String(r.full_name),
      gender: r.gender as StudentGender,
      dateOfBirth: String(r.date_of_birth),
      currentGrade: Number(r.current_grade),
      status: r.status as StudentStatus,
      admissionDate: String(r.admission_date),
      houseName: r.house_name ? String(r.house_name) : null,
      houseColor: r.house_color ? String(r.house_color) : null,
      transportationMethodName: r.transportation_method_name ? String(r.transportation_method_name) : null,
      fullAddress: r.full_address ? String(r.full_address) : null,
      previousSchoolName: r.previous_school_name ? String(r.previous_school_name) : null,
      previousSchoolIdNumber: r.previous_school_id_number ? String(r.previous_school_id_number) : null
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1
    };
  }

  public exportStudentsCsv(filter: IStudentReportFilter = {}, limit: number = 50000): string {
    const { whereSql, params } = this.buildStudentWhereClause(filter);

    const safeLimit = Math.min(100000, Math.max(1, limit));

    const sql = `
      SELECT 
        s.admission_number,
        s.full_name,
        s.gender,
        s.current_grade,
        s.status,
        s.admission_date,
        s.date_of_birth,
        h.name as house_name,
        tm.name as transportation_method_name,
        f.full_address,
        s.previous_school_name,
        s.previous_school_id_number
      FROM students s
      INNER JOIN families f ON s.family_id = f.id
      LEFT JOIN houses h ON s.house_id = h.id
      LEFT JOIN transportation_methods tm ON s.transportation_method_id = tm.id
      WHERE ${whereSql}
      ORDER BY s.current_grade ASC, s.admission_number ASC
      LIMIT ?
    `;
    const rows = this.db.prepare(sql).all(...params, safeLimit) as Array<Record<string, unknown>>;

    const headers = [
      'Admission No',
      'Full Name',
      'Gender',
      'Current Grade',
      'Status',
      'Admission Date',
      'Date of Birth',
      'House',
      'Transportation Method',
      'Full Address',
      'Previous School',
      'Previous School ID'
    ];

    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([
        ReportService.sanitizeCsvCell(r.admission_number),
        ReportService.sanitizeCsvCell(r.full_name),
        ReportService.sanitizeCsvCell(r.gender),
        ReportService.sanitizeCsvCell(`Grade ${r.current_grade}`),
        ReportService.sanitizeCsvCell(r.status),
        ReportService.sanitizeCsvCell(r.admission_date),
        ReportService.sanitizeCsvCell(r.date_of_birth),
        ReportService.sanitizeCsvCell(r.house_name || 'N/A'),
        ReportService.sanitizeCsvCell(r.transportation_method_name || 'N/A'),
        ReportService.sanitizeCsvCell(r.full_address || 'N/A'),
        ReportService.sanitizeCsvCell(r.previous_school_name || 'N/A'),
        ReportService.sanitizeCsvCell(r.previous_school_id_number || 'N/A')
      ].join(','));
    }

    // Prepend UTF-8 BOM (\uFEFF) so Excel and spreadsheet applications correctly recognize Sinhala Unicode
    return '\uFEFF' + lines.join('\r\n');
  }

  // ==========================================
  // 2. Fee Reports
  // ==========================================

  private buildFeeWhereClause(filter: IFeeReportFilter): { whereSql: string; params: unknown[] } {
    const clauses: string[] = ['1=1'];
    const params: unknown[] = [];

    if (filter.academicYear) {
      clauses.push('saf.academic_year = ?');
      params.push(Number(filter.academicYear));
    }

    if (filter.status) {
      clauses.push('saf.status = ?');
      params.push(filter.status);
    }

    if (filter.grade !== undefined && filter.grade !== null && Number.isInteger(Number(filter.grade))) {
      clauses.push('st.current_grade = ?');
      params.push(Number(filter.grade));
    }

    if (filter.isFeeExempt !== undefined) {
      if (filter.isFeeExempt) {
        clauses.push('saf.fee_amount = 0');
      } else {
        clauses.push('saf.fee_amount > 0');
      }
    }

    if (filter.paymentDateFrom && /^\d{4}-\d{2}-\d{2}$/.test(filter.paymentDateFrom)) {
      clauses.push('fp.payment_date >= ?');
      params.push(filter.paymentDateFrom);
    }

    if (filter.paymentDateTo && /^\d{4}-\d{2}-\d{2}$/.test(filter.paymentDateTo)) {
      clauses.push('fp.payment_date <= ?');
      params.push(filter.paymentDateTo);
    }

    if (filter.search && filter.search.trim()) {
      const term = filter.search.trim();
      clauses.push('(st.admission_number LIKE ? OR st.full_name LIKE ? OR fp.receipt_number LIKE ?)');
      params.push(`${term}%`, `%${term}%`, `${term}%`);
    }

    return {
      whereSql: clauses.join(' AND '),
      params
    };
  }

  public getFeeReportSummary(academicYear?: number, paymentDateFrom?: string, paymentDateTo?: string): IFeeReportSummary {
    const targetYear = academicYear || new Date().getFullYear();

    // 1. Overall Annual Financial totals for targetYear (always true annual benchmark)
    const overallSql = `
      SELECT 
        COUNT(saf.id) as total_invoices,
        SUM(CASE WHEN saf.status = 'Paid' AND saf.fee_amount > 0 THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN saf.status = 'Unpaid' THEN 1 ELSE 0 END) as unpaid_count,
        SUM(CASE WHEN saf.fee_amount = 0 THEN 1 ELSE 0 END) as exempt_count,
        COALESCE(SUM(saf.fee_amount), 0) as expected_amount,
        COALESCE(SUM(fp.amount), 0) as actual_collected
      FROM student_annual_fees saf
      LEFT JOIN fee_payments fp ON saf.id = fp.student_annual_fee_id
      WHERE saf.academic_year = ?
    `;
    const overall = this.db.prepare(overallSql).get(targetYear) as Record<string, number | null>;

    const expectedLkr = Number(overall?.expected_amount || 0);
    const collectedLkr = Number(overall?.actual_collected || 0);
    const outstandingLkr = Math.max(0, expectedLkr - collectedLkr);

    // Optional payment date range filtering for cash collected
    let filteredCollectedLkr: number | null = null;
    if (paymentDateFrom || paymentDateTo) {
      const payClauses = ['saf.academic_year = ?'];
      const payParams: unknown[] = [targetYear];
      if (paymentDateFrom) {
        payClauses.push('fp.payment_date >= ?');
        payParams.push(paymentDateFrom);
      }
      if (paymentDateTo) {
        payClauses.push('fp.payment_date <= ?');
        payParams.push(paymentDateTo);
      }
      const filteredSql = `
        SELECT COALESCE(SUM(fp.amount), 0) as filtered_collected
        FROM fee_payments fp
        INNER JOIN student_annual_fees saf ON fp.student_annual_fee_id = saf.id
        WHERE ${payClauses.join(' AND ')}
      `;
      const filteredRow = this.db.prepare(filteredSql).get(...payParams) as { filtered_collected: number };
      filteredCollectedLkr = Number(filteredRow?.filtered_collected || 0);
    }

    // 2. Grade-wise fee breakdown
    const gradeBreakdownSql = `
      SELECT 
        st.current_grade as grade,
        COUNT(saf.id) as total_students,
        SUM(CASE WHEN saf.status = 'Paid' AND saf.fee_amount > 0 THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN saf.status = 'Unpaid' THEN 1 ELSE 0 END) as unpaid_count,
        SUM(CASE WHEN saf.fee_amount = 0 THEN 1 ELSE 0 END) as exempt_count,
        COALESCE(SUM(fp.amount), 0) as collected_lkr,
        COALESCE(SUM(CASE WHEN saf.status = 'Unpaid' THEN saf.fee_amount ELSE 0 END), 0) as outstanding_lkr
      FROM student_annual_fees saf
      INNER JOIN students st ON saf.student_id = st.id
      LEFT JOIN fee_payments fp ON saf.id = fp.student_annual_fee_id
      WHERE saf.academic_year = ?
      GROUP BY st.current_grade
      ORDER BY st.current_grade ASC
    `;
    const gradeRows = this.db.prepare(gradeBreakdownSql).all(targetYear) as Array<{
      grade: number;
      total_students: number;
      paid_count: number;
      unpaid_count: number;
      exempt_count: number;
      collected_lkr: number;
      outstanding_lkr: number;
    }>;

    const gradeBreakdown = gradeRows.map(r => ({
      grade: Number(r.grade),
      totalStudents: Number(r.total_students),
      paidCount: Number(r.paid_count || 0),
      unpaidCount: Number(r.unpaid_count || 0),
      exemptCount: Number(r.exempt_count || 0),
      collectedLkr: Number(r.collected_lkr || 0),
      outstandingLkr: Number(r.outstanding_lkr || 0)
    }));

    return {
      academicYear: targetYear,
      totalInvoices: Number(overall?.total_invoices || 0),
      paidCount: Number(overall?.paid_count || 0),
      unpaidCount: Number(overall?.unpaid_count || 0),
      exemptCount: Number(overall?.exempt_count || 0),
      expectedAmountLkr: expectedLkr,
      actualCollectedLkr: collectedLkr,
      outstandingLkr,
      filteredCollectedLkr,
      gradeBreakdown
    };
  }

  public getFeeReport(filter: IFeeReportFilter = {}): IPaginatedResult<IFeeReportItem> {
    const page = Math.max(1, Number(filter.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(filter.pageSize || 20)));
    const offset = (page - 1) * pageSize;

    const { whereSql, params } = this.buildFeeWhereClause(filter);

    const countSql = `
      SELECT COUNT(saf.id) as total
      FROM student_annual_fees saf
      INNER JOIN students st ON saf.student_id = st.id
      LEFT JOIN fee_payments fp ON saf.id = fp.student_annual_fee_id
      LEFT JOIN users u ON fp.recorded_by = u.id
      WHERE ${whereSql}
    `;
    const countRow = this.db.prepare(countSql).get(...params) as { total: number };
    const total = countRow ? Number(countRow.total) : 0;

    const itemsSql = `
      SELECT 
        saf.id,
        saf.student_id,
        saf.academic_year,
        saf.fee_amount,
        saf.status,
        st.admission_number,
        st.full_name,
        st.current_grade,
        fp.id as payment_id,
        fp.receipt_number,
        fp.payment_date,
        fp.amount as payment_amount,
        fp.payment_method,
        fp.notes as payment_notes,
        u.display_name as recorded_by_name
      FROM student_annual_fees saf
      INNER JOIN students st ON saf.student_id = st.id
      LEFT JOIN fee_payments fp ON saf.id = fp.student_annual_fee_id
      LEFT JOIN users u ON fp.recorded_by = u.id
      WHERE ${whereSql}
      ORDER BY saf.academic_year DESC, saf.id DESC
      LIMIT ? OFFSET ?
    `;
    const rows = this.db.prepare(itemsSql).all(...params, pageSize, offset) as Array<Record<string, unknown>>;

    const items: IFeeReportItem[] = rows.map(r => ({
      id: Number(r.id),
      studentId: Number(r.student_id),
      admissionNumber: String(r.admission_number),
      fullName: String(r.full_name),
      currentGrade: Number(r.current_grade),
      academicYear: Number(r.academic_year),
      feeAmount: Number(r.fee_amount),
      status: r.status as 'Unpaid' | 'Paid',
      isFeeExempt: Number(r.fee_amount) === 0,
      paymentId: r.payment_id ? Number(r.payment_id) : null,
      receiptNumber: r.receipt_number ? String(r.receipt_number) : null,
      paymentDate: r.payment_date ? String(r.payment_date) : null,
      paymentAmount: r.payment_amount ? Number(r.payment_amount) : null,
      paymentMethod: r.payment_method ? String(r.payment_method) : null,
      recordedByName: r.recorded_by_name ? String(r.recorded_by_name) : null,
      notes: r.payment_notes ? String(r.payment_notes) : null
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1
    };
  }

  public exportFeesCsv(filter: IFeeReportFilter = {}, limit: number = 50000): string {
    const { whereSql, params } = this.buildFeeWhereClause(filter);

    const safeLimit = Math.min(100000, Math.max(1, limit));

    const sql = `
      SELECT 
        st.admission_number,
        st.full_name,
        st.current_grade,
        saf.academic_year,
        saf.fee_amount,
        saf.status,
        fp.receipt_number,
        fp.payment_date,
        fp.amount as payment_amount,
        fp.payment_method,
        u.display_name as recorded_by_name,
        fp.notes as payment_notes
      FROM student_annual_fees saf
      INNER JOIN students st ON saf.student_id = st.id
      LEFT JOIN fee_payments fp ON saf.id = fp.student_annual_fee_id
      LEFT JOIN users u ON fp.recorded_by = u.id
      WHERE ${whereSql}
      ORDER BY saf.academic_year DESC, saf.id DESC
      LIMIT ?
    `;
    const rows = this.db.prepare(sql).all(...params, safeLimit) as Array<Record<string, unknown>>;

    const headers = [
      'Admission No',
      'Student Name',
      'Grade',
      'Academic Year',
      'Fee Amount (LKR)',
      'Status',
      'Receipt No',
      'Payment Date',
      'Paid Amount (LKR)',
      'Method',
      'Recorded By',
      'Notes'
    ];

    const lines = [headers.join(',')];
    for (const r of rows) {
      const isExempt = Number(r.fee_amount) === 0;
      const displayStatus = isExempt ? 'Fee Exempt' : String(r.status);
      lines.push([
        ReportService.sanitizeCsvCell(r.admission_number),
        ReportService.sanitizeCsvCell(r.full_name),
        ReportService.sanitizeCsvCell(`Grade ${r.current_grade}`),
        ReportService.sanitizeCsvCell(r.academic_year),
        ReportService.sanitizeCsvCell(r.fee_amount),
        ReportService.sanitizeCsvCell(displayStatus),
        ReportService.sanitizeCsvCell(r.receipt_number || 'N/A'),
        ReportService.sanitizeCsvCell(r.payment_date || 'N/A'),
        ReportService.sanitizeCsvCell(r.payment_amount !== null ? r.payment_amount : (isExempt ? 0 : 'N/A')),
        ReportService.sanitizeCsvCell(r.payment_method || (isExempt ? 'Exempt' : 'N/A')),
        ReportService.sanitizeCsvCell(r.recorded_by_name || 'N/A'),
        ReportService.sanitizeCsvCell(r.payment_notes || 'N/A')
      ].join(','));
    }

    // Prepend UTF-8 BOM (\uFEFF) so Excel and spreadsheet applications correctly recognize Sinhala Unicode
    return '\uFEFF' + lines.join('\r\n');
  }

  // ==========================================
  // 3. Two-Page A4 Student Profile Printing
  // ==========================================

  public getTwoPageStudentPrintProfile(studentId: number, printedByUser: IAuthSession): ITwoPageStudentPrintProfile {
    const student = this.studentService.getStudentById(studentId);
    if (!student) {
      throw new Error(`Student with ID ${studentId} was not found.`);
    }

    const schoolSettings = this.schoolSettingsService.getSchoolSettings();
    const logoDataUrl = this.schoolSettingsService.getLogoPreview();

    // Query Development & Facility Fee History strictly
    const historySql = `
      SELECT 
        saf.academic_year,
        saf.fee_amount,
        saf.status,
        fp.payment_date,
        fp.receipt_number,
        fp.amount as payment_amount,
        u.display_name as recorded_by_name,
        fp.notes
      FROM student_annual_fees saf
      LEFT JOIN fee_payments fp ON saf.id = fp.student_annual_fee_id
      LEFT JOIN users u ON fp.recorded_by = u.id
      WHERE saf.student_id = ?
      ORDER BY saf.academic_year DESC
    `;
    const rows = this.db.prepare(historySql).all(studentId) as Array<Record<string, unknown>>;

    const feeHistory: IStudentFeeHistoryRecord[] = rows.map(r => ({
      academicYear: Number(r.academic_year),
      feeAmount: Number(r.fee_amount),
      status: r.status as 'Unpaid' | 'Paid',
      isFeeExempt: Number(r.fee_amount) === 0,
      paymentDate: r.payment_date ? String(r.payment_date) : null,
      receiptNumber: r.receipt_number ? String(r.receipt_number) : null,
      paymentAmount: r.payment_amount ? Number(r.payment_amount) : null,
      recordedByName: r.recorded_by_name ? String(r.recorded_by_name) : null,
      notes: r.notes ? String(r.notes) : null
    }));

    return {
      student,
      schoolSettings,
      schoolLogoDataUrl: logoDataUrl,
      feeHistory,
      printedAt: new Date().toISOString(),
      printedBy: `${printedByUser.displayName} (${printedByUser.role})`
    };
  }
}

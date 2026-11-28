import Database from 'better-sqlite3';
import {
  IAuthSession,
  IStudentAnnualFeeItem,
  IStudentFeeFilterQuery,
  IPaginatedResult,
  IRecordPaymentInput,
  IReceiptDetails,
  IFeeGenerationResult,
  IFeeGenerationStatus,
  IAnnualProcessingLog,
  ISchoolSettings
} from '../shared/types';
import { SchoolSettingsService } from './schoolSettingsService';

export class FeePaymentService {
  private db: Database.Database;
  private schoolSettingsService: SchoolSettingsService;

  constructor(db: Database.Database) {
    this.db = db;
    this.schoolSettingsService = new SchoolSettingsService(db);
  }

  /**
   * Retrieves current calendar year.
   */
  public getCurrentCalendarYear(): number {
    return new Date().getFullYear();
  }

  /**
   * Checks setting auto_generate_new_student_fee from system_settings.
   */
  public getNewStudentFeeSetting(): boolean {
    const row = this.db.prepare("SELECT value FROM system_settings WHERE key = 'auto_generate_new_student_fee'").get() as { value: string } | undefined;
    return row?.value === '1';
  }

  /**
   * Updates setting auto_generate_new_student_fee.
   */
  public setNewStudentFeeSetting(user: IAuthSession, enabled: boolean): boolean {
    const valStr = enabled ? '1' : '0';
    this.db.prepare(`
      INSERT INTO system_settings (key, value, description, updated_at)
      VALUES ('auto_generate_new_student_fee', ?, 'Auto-generate current-year fee when registering student (0=OFF, 1=ON)', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(valStr);

    try {
      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'UPDATE_SYSTEM_SETTING', 'system_settings', 'auto_generate_new_student_fee', ?)
      `).run(user.id, `Set auto_generate_new_student_fee to ${enabled ? 'ENABLED' : 'DISABLED'}`);
    } catch {}

    return enabled;
  }

  /**
   * Returns fee generation system status for current year.
   */
  public getFeeGenerationStatus(): IFeeGenerationStatus {
    const currentYear = this.getCurrentCalendarYear();

    const configRow = this.db.prepare('SELECT fee_amount FROM annual_fee_settings WHERE academic_year = ?').get(currentYear) as { fee_amount: number } | undefined;
    const isConfigured = Boolean(configRow);
    const configAmount = configRow ? Number(configRow.fee_amount) : null;

    const logRow = this.db.prepare(`
      SELECT 
        id, academic_year, job_type, attempt_number, status, started_at, completed_at, 
        records_processed, promoted_count, passed_out_count, skipped_leaved_count, failed_count, 
        executed_by, error_details, details
      FROM annual_processing_logs
      WHERE academic_year = ? AND job_type = 'FeeGeneration'
      ORDER BY attempt_number DESC, id DESC
      LIMIT 1
    `).get(currentYear) as Record<string, unknown> | undefined;

    let lastLog: IAnnualProcessingLog | null = null;
    if (logRow) {
      lastLog = {
        id: Number(logRow.id),
        academicYear: Number(logRow.academic_year),
        jobType: 'FeeGeneration',
        status: logRow.status as 'Success' | 'Failed' | 'Partial',
        executedAt: String(logRow.started_at),
        completedAt: logRow.completed_at ? String(logRow.completed_at) : null,
        recordsProcessed: Number(logRow.records_processed || 0),
        promotedCount: Number(logRow.promoted_count || 0),
        passedOutCount: Number(logRow.passed_out_count || 0),
        skippedLeavedCount: Number(logRow.skipped_leaved_count || 0),
        failedCount: Number(logRow.failed_count || 0),
        executedBy: logRow.executed_by ? Number(logRow.executed_by) : null,
        errorMessage: logRow.error_details ? String(logRow.error_details) : null,
        details: logRow.details ? String(logRow.details) : null
      };
    }

    const isGenerated = lastLog?.status === 'Success';

    const activeCountRow = this.db.prepare("SELECT COUNT(id) as cnt FROM students WHERE status = 'Active'").get() as { cnt: number };
    const totalActiveStudents = Number(activeCountRow?.cnt || 0);

    const countsRow = this.db.prepare(`
      SELECT 
        COUNT(id) as total_gen,
        SUM(CASE WHEN status = 'Paid' AND fee_amount > 0 THEN 1 ELSE 0 END) as paid_cnt,
        SUM(CASE WHEN status = 'Unpaid' THEN 1 ELSE 0 END) as unpaid_cnt,
        SUM(CASE WHEN fee_amount = 0 THEN 1 ELSE 0 END) as exempt_cnt
      FROM student_annual_fees
      WHERE academic_year = ?
    `).get(currentYear) as { total_gen: number; paid_cnt: number | null; unpaid_cnt: number | null; exempt_cnt: number | null };

    return {
      currentCalendarYear: currentYear,
      isCurrentYearConfigured: isConfigured,
      currentYearConfigAmount: configAmount,
      isGenerated,
      lastLog,
      totalActiveStudents,
      generatedCount: Number(countsRow?.total_gen || 0),
      paidCount: Number(countsRow?.paid_cnt || 0),
      unpaidCount: Number(countsRow?.unpaid_cnt || 0),
      exemptCount: Number(countsRow?.exempt_cnt || 0),
      autoGenerateNewStudentFee: this.getNewStudentFeeSetting()
    };
  }

  /**
   * Generates annual fees for active students for a given academic year.
   * Admin-only or system catch-up.
   */
  public generateAnnualFees(targetYear: number, executedByUserId?: number): IFeeGenerationResult {
    const currentYear = this.getCurrentCalendarYear();
    if (targetYear !== currentYear) {
      throw new Error(`Annual fee generation can only be performed for the current academic year (${currentYear}). Generating fees for ${targetYear > currentYear ? 'future' : 'historical'} years using the current active student list is prohibited.`);
    }

    // Ensure academic_years record exists before touching annual_processing_logs
    const acYearRow = this.db.prepare('SELECT year FROM academic_years WHERE year = ?').get(targetYear);
    if (!acYearRow) {
      this.db.prepare(`
        INSERT INTO academic_years (year, is_active, created_at)
        VALUES (?, 0, CURRENT_TIMESTAMP)
      `).run(targetYear);
    }

    // Check fee configuration
    const configRow = this.db.prepare('SELECT fee_amount FROM annual_fee_settings WHERE academic_year = ?').get(targetYear) as { fee_amount: number } | undefined;
    
    // Determine next attempt number
    const maxAttemptRow = this.db.prepare(`
      SELECT MAX(attempt_number) as max_attempt 
      FROM annual_processing_logs 
      WHERE academic_year = ? AND job_type = 'FeeGeneration'
    `).get(targetYear) as { max_attempt: number | null };
    const nextAttempt = (maxAttemptRow?.max_attempt || 0) + 1;

    // Check if a successful fee generation has already occurred
    const existingSuccess = this.db.prepare(`
      SELECT id 
      FROM annual_processing_logs 
      WHERE academic_year = ? AND job_type = 'FeeGeneration' AND status = 'Success'
    `).get(targetYear);

    // If configuration is missing, log failure in annual_processing_logs and throw/return
    if (!configRow) {
      const errorMsg = `Fee configuration for academic year ${targetYear} has not been configured. Generation aborted.`;
      try {
        this.db.prepare(`
          INSERT INTO annual_processing_logs (
            academic_year, job_type, attempt_number, status, started_at, completed_at,
            records_processed, promoted_count, passed_out_count, skipped_leaved_count, failed_count,
            executed_by, error_details, details
          ) VALUES (?, 'FeeGeneration', ?, 'Failed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 0, 0, 0, 1, ?, ?, ?)
        `).run(targetYear, nextAttempt, executedByUserId || null, errorMsg, 'Missing annual_fee_settings configuration');
      } catch {}

      return {
        academicYear: targetYear,
        status: 'Failed',
        recordsGenerated: 0,
        recordsSkipped: 0,
        exemptZeroFeeCount: 0,
        error: errorMsg,
        message: errorMsg
      };
    }

    const feeAmount = Number(configRow.fee_amount);

    // Eligible active students: status = 'Active', excluding Leaved and Passed Out
    const activeStudents = this.db.prepare(`
      SELECT s.id, s.admission_number, s.full_name, s.current_grade
      FROM students s
      WHERE s.status = 'Active'
      ORDER BY s.id ASC
    `).all() as Array<{ id: number; admission_number: string; full_name: string; current_grade: number }>;

    // Identify already generated students for this year
    const existingFees = this.db.prepare(`
      SELECT student_id 
      FROM student_annual_fees 
      WHERE academic_year = ?
    `).all(targetYear) as Array<{ student_id: number }>;
    const existingStudentSet = new Set(existingFees.map(f => f.student_id));

    let generatedCount = 0;
    let skippedCount = 0;
    let zeroFeeExemptCount = 0;

    // Transactional batch insert
    const insertFeeStmt = this.db.prepare(`
      INSERT INTO student_annual_fees (student_id, academic_year, fee_amount, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const logStmt = this.db.prepare(`
      INSERT INTO annual_processing_logs (
        academic_year, job_type, attempt_number, status, started_at, completed_at,
        records_processed, promoted_count, passed_out_count, skipped_leaved_count, failed_count,
        executed_by, error_details, details
      ) VALUES (?, 'FeeGeneration', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, 0, ?, 0, ?, NULL, ?)
    `);

    const auditStmt = this.db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'ANNUAL_FEE_GENERATION', 'student_annual_fees', ?, ?)
    `);

    const runTx = this.db.transaction(() => {
      for (const student of activeStudents) {
        if (existingStudentSet.has(student.id)) {
          skippedCount++;
          continue;
        }

        // If feeAmount is 0, record as Paid (fee-exempt), else Unpaid
        const initialStatus = feeAmount === 0 ? 'Paid' : 'Unpaid';
        if (feeAmount === 0) {
          zeroFeeExemptCount++;
        }

        insertFeeStmt.run(student.id, targetYear, feeAmount, initialStatus);
        generatedCount++;
      }

      const totalProcessed = generatedCount + skippedCount;
      const detailsMsg = `Generated ${generatedCount} fees, skipped ${skippedCount} existing. Fee amount snapshot: LKR ${feeAmount}.`;

      // Log success in annual_processing_logs if not already logged as Success
      if (!existingSuccess) {
        logStmt.run(
          targetYear,
          nextAttempt,
          'Success',
          totalProcessed,
          generatedCount, // stored in promoted_count column for metrics
          skippedCount,   // stored in skipped_leaved_count column
          executedByUserId || null,
          detailsMsg
        );
      }

      // Audit log
      auditStmt.run(
        executedByUserId || null,
        String(targetYear),
        `Annual fee generation completed for year ${targetYear}: ${generatedCount} created, ${skippedCount} skipped, snapshot LKR ${feeAmount}`
      );
    });

    try {
      runTx();
      return {
        academicYear: targetYear,
        status: 'Success',
        recordsGenerated: generatedCount,
        recordsSkipped: skippedCount,
        exemptZeroFeeCount: zeroFeeExemptCount,
        message: `Successfully generated annual fee records for ${generatedCount} active student(s) in Academic Year ${targetYear} (Snapshot: LKR ${feeAmount.toLocaleString()}).`
      };
    } catch (err: unknown) {
      const errorMsg = (err instanceof Error) ? err.message : String(err);
      try {
        this.db.prepare(`
          INSERT INTO annual_processing_logs (
            academic_year, job_type, attempt_number, status, started_at, completed_at,
            records_processed, promoted_count, passed_out_count, skipped_leaved_count, failed_count,
            executed_by, error_details, details
          ) VALUES (?, 'FeeGeneration', ?, 'Failed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 0, 0, 0, 1, ?, ?, ?)
        `).run(targetYear, nextAttempt, executedByUserId || null, errorMsg, 'Transaction failed');
      } catch {}

      return {
        academicYear: targetYear,
        status: 'Failed',
        recordsGenerated: 0,
        recordsSkipped: 0,
        exemptZeroFeeCount: 0,
        error: errorMsg,
        message: `Fee generation failed: ${errorMsg}`
      };
    }
  }

  /**
   * Startup catch-up: Checks if current calendar year's annual fee has been generated.
   * If not generated, and fee configuration exists, generates it.
   * If fee configuration is missing, logs warning without throwing.
   */
  public runStartupCatchupFeeGeneration(): { processed: boolean; message: string } {
    const currentYear = this.getCurrentCalendarYear();

    // Check if successful generation already exists
    const successLog = this.db.prepare(`
      SELECT id 
      FROM annual_processing_logs 
      WHERE academic_year = ? AND job_type = 'FeeGeneration' AND status = 'Success'
    `).get(currentYear);

    if (successLog) {
      return { processed: false, message: `Fee generation for Academic Year ${currentYear} has already been completed.` };
    }

    // Check if annual fee configuration exists for currentYear
    const configRow = this.db.prepare('SELECT fee_amount FROM annual_fee_settings WHERE academic_year = ?').get(currentYear);
    if (!configRow) {
      return { processed: false, message: `Fee configuration for current year ${currentYear} is not set. Awaiting Admin configuration.` };
    }

    // Run generation for current year
    const res = this.generateAnnualFees(currentYear);
    return {
      processed: res.status === 'Success',
      message: res.message
    };
  }

  /**
   * Generates a single student's fee for the current academic year during new admission.
   * Respects system setting auto_generate_new_student_fee.
   */
  public generateNewAdmissionFee(studentId: number, currentGrade: number, registeredByUserId?: number): { generated: boolean; feeId?: number; message?: string } {
    if (!this.getNewStudentFeeSetting()) {
      return { generated: false, message: 'Auto-generation of new student fee is disabled in settings.' };
    }

    const currentYear = this.getCurrentCalendarYear();

    // Verify student is Active
    const student = this.db.prepare("SELECT id, status, full_name, admission_number FROM students WHERE id = ?").get(studentId) as {
      id: number;
      status: string;
      full_name: string;
      admission_number: string;
    } | undefined;

    if (!student || student.status !== 'Active') {
      return { generated: false, message: 'Student is not active or does not exist.' };
    }

    // Verify fee configuration for current year exists
    const configRow = this.db.prepare('SELECT fee_amount FROM annual_fee_settings WHERE academic_year = ?').get(currentYear) as { fee_amount: number } | undefined;
    if (!configRow) {
      return { generated: false, message: `Annual fee setting for year ${currentYear} is not configured yet.` };
    }

    // Check if already exists
    const existing = this.db.prepare('SELECT id FROM student_annual_fees WHERE student_id = ? AND academic_year = ?').get(studentId, currentYear) as { id: number } | undefined;
    if (existing) {
      return { generated: false, feeId: existing.id, message: 'Fee already exists for this academic year.' };
    }

    const feeAmount = Number(configRow.fee_amount);
    const initialStatus = feeAmount === 0 ? 'Paid' : 'Unpaid';

    // Insert fee record
    const result = this.db.prepare(`
      INSERT INTO student_annual_fees (student_id, academic_year, fee_amount, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(studentId, currentYear, feeAmount, initialStatus);

    const feeId = Number(result.lastInsertRowid);

    try {
      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'NEW_ADMISSION_FEE_GENERATED', 'student_annual_fees', ?, ?)
      `).run(
        registeredByUserId || null,
        String(feeId),
        `Auto-generated ${currentYear} fee record for newly admitted student ${student.admission_number} (${student.full_name}): LKR ${feeAmount}`
      );
    } catch {}

    return { generated: true, feeId, message: 'Fee record generated successfully.' };
  }

  /**
   * Generates a unique sequential receipt number in format: REC-YYYY-XXXXX
   */
  public generateReceiptNumber(paymentDate: string): string {
    const year = paymentDate ? new Date(paymentDate).getFullYear() : this.getCurrentCalendarYear();
    const prefix = `REC-${year}-`;

    // Query highest sequential receipt number for this year prefix
    const rows = this.db.prepare(`
      SELECT receipt_number 
      FROM fee_payments 
      WHERE receipt_number LIKE ?
      ORDER BY length(receipt_number) DESC, receipt_number DESC
      LIMIT 200
    `).all(`${prefix}%`) as Array<{ receipt_number: string }>;

    let maxSeq = 0;
    for (const r of rows) {
      const match = r.receipt_number.match(/^REC-\d{4}-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }

    const nextSeq = maxSeq + 1;
    // Format with at least 5 digits (e.g. 00001), gracefully expanding if exceeding 99,999 (e.g. 100000)
    const seqStr = nextSeq < 100000 ? String(nextSeq).padStart(5, '0') : String(nextSeq);
    let candidate = `${prefix}${seqStr}`;

    // Collision check loop (case-insensitive) against database
    let counter = nextSeq;
    while (this.db.prepare('SELECT id FROM fee_payments WHERE LOWER(receipt_number) = LOWER(?)').get(candidate)) {
      counter++;
      const cStr = counter < 100000 ? String(counter).padStart(5, '0') : String(counter);
      candidate = `${prefix}${cStr}`;
    }

    return candidate;
  }

  /**
   * Records a cash payment for a student's annual fee.
   * Full payment only. Staff & Admin allowed.
   */
  public recordCashPayment(user: IAuthSession, input: IRecordPaymentInput): IReceiptDetails {
    if (!input || !input.studentAnnualFeeId) {
      throw new Error('Student annual fee record ID is required.');
    }

    // Validate payment date
    if (!input.paymentDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate)) {
      throw new Error('Payment date must be in YYYY-MM-DD format.');
    }
    const payDate = new Date(input.paymentDate);
    if (isNaN(payDate.getTime())) {
      throw new Error('Payment date is an invalid calendar date.');
    }
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (payDate > today) {
      throw new Error('Payment date cannot be in the future.');
    }

    // Validate payment amount (must be positive integer)
    if (input.amount === null || input.amount === undefined || typeof input.amount !== 'number') {
      throw new Error('Payment amount must be a valid number.');
    }
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new Error('Payment amount must be a positive whole-rupee integer greater than 0.');
    }

    // Fetch the student fee record
    const feeRecord = this.db.prepare(`
      SELECT 
        s.id, s.student_id, s.academic_year, s.fee_amount, s.status,
        st.admission_number, st.full_name, st.current_grade, st.status as student_status
      FROM student_annual_fees s
      INNER JOIN students st ON s.student_id = st.id
      WHERE s.id = ?
    `).get(input.studentAnnualFeeId) as {
      id: number;
      student_id: number;
      academic_year: number;
      fee_amount: number;
      status: string;
      admission_number: string;
      full_name: string;
      current_grade: number;
      student_status: string;
    } | undefined;

    if (!feeRecord) {
      throw new Error(`Annual fee record with ID ${input.studentAnnualFeeId} does not exist.`);
    }

    if (feeRecord.status === 'Paid') {
      throw new Error(`This fee invoice (Academic Year ${feeRecord.academic_year}) is already marked as Paid. Duplicate payments are strictly prohibited.`);
    }

    // Enforce exact full payment match
    if (input.amount !== feeRecord.fee_amount) {
      throw new Error(`Payment amount (LKR ${input.amount.toLocaleString()}) does not match the outstanding fee amount (LKR ${feeRecord.fee_amount.toLocaleString()}). Only exact full payments are accepted.`);
    }

    const notes = input.notes ? input.notes.trim() : null;
    let paymentId = 0;

    // Transactional payment recording
    const payTx = this.db.transaction(() => {
      // Re-verify in transaction to prevent concurrent race condition
      const checkCurrent = this.db.prepare('SELECT status FROM student_annual_fees WHERE id = ?').get(input.studentAnnualFeeId) as { status: string } | undefined;
      if (!checkCurrent) {
        throw new Error(`Annual fee record with ID ${input.studentAnnualFeeId} does not exist.`);
      }
      if (checkCurrent.status === 'Paid') {
        throw new Error(`This fee invoice (Academic Year ${feeRecord.academic_year}) is already marked as Paid. Duplicate payments are strictly prohibited.`);
      }

      // Generate receipt number inside transaction for sequential accuracy
      const currentReceiptNumber = this.generateReceiptNumber(input.paymentDate);

      // 1. Insert into fee_payments (unique constraint on student_annual_fee_id strictly prevents double payment)
      const insertResult = this.db.prepare(`
        INSERT INTO fee_payments (
          student_annual_fee_id, receipt_number, payment_date, amount, payment_method, recorded_by, notes, created_at
        ) VALUES (?, ?, ?, ?, 'Cash', ?, ?, CURRENT_TIMESTAMP)
      `).run(
        input.studentAnnualFeeId,
        currentReceiptNumber,
        input.paymentDate,
        input.amount,
        user.id,
        notes
      );
      paymentId = Number(insertResult.lastInsertRowid);

      // 2. Update student_annual_fees status to 'Paid'
      this.db.prepare(`
        UPDATE student_annual_fees 
        SET status = 'Paid', updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(input.studentAnnualFeeId);

      // 3. Log audit trail
      try {
        this.db.prepare(`
          INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
          VALUES (?, 'RECORD_FEE_PAYMENT', 'fee_payments', ?, ?)
        `).run(
          user.id,
          String(paymentId),
          `Recorded Cash payment ${currentReceiptNumber} of LKR ${input.amount} for student ${feeRecord.admission_number} (${feeRecord.full_name}) - Year ${feeRecord.academic_year}`
        );
      } catch {}
    });

    payTx();

    return this.getReceiptDetails(paymentId);
  }

  /**
   * Retrieves complete receipt details by payment ID or receipt number.
   */
  public getReceiptDetails(paymentIdentifier: number | string): IReceiptDetails {
    const isId = typeof paymentIdentifier === 'number';

    const row = this.db.prepare(`
      SELECT 
        p.id as payment_id,
        p.student_annual_fee_id,
        p.receipt_number,
        p.payment_date,
        p.amount,
        p.payment_method,
        p.notes,
        p.created_at as payment_created_at,
        u.display_name as recorded_by_name,
        u.role as recorded_by_role,
        s.student_id,
        s.academic_year,
        s.fee_amount,
        st.admission_number,
        st.full_name as student_name,
        st.current_grade
      FROM fee_payments p
      INNER JOIN student_annual_fees s ON p.student_annual_fee_id = s.id
      INNER JOIN students st ON s.student_id = st.id
      INNER JOIN users u ON p.recorded_by = u.id
      WHERE ${isId ? 'p.id = ?' : 'LOWER(p.receipt_number) = LOWER(?)'}
    `).get(paymentIdentifier) as Record<string, unknown> | undefined;

    if (!row) {
      throw new Error(`Receipt record not found for identifier: ${paymentIdentifier}`);
    }

    const schoolSettings = this.schoolSettingsService.getSchoolSettings();
    const logoDataUrl = this.schoolSettingsService.getLogoPreview();

    return {
      paymentId: Number(row.payment_id),
      studentAnnualFeeId: Number(row.student_annual_fee_id),
      receiptNumber: String(row.receipt_number),
      paymentDate: String(row.payment_date),
      amount: Number(row.amount),
      paymentMethod: 'Cash',
      recordedByName: String(row.recorded_by_name || 'System'),
      recordedByRole: String(row.recorded_by_role || 'Staff'),
      notes: row.notes ? String(row.notes) : null,
      studentId: Number(row.student_id),
      admissionNumber: String(row.admission_number),
      studentName: String(row.student_name),
      currentGrade: Number(row.current_grade),
      academicYear: Number(row.academic_year),
      feeAmount: Number(row.fee_amount),
      feeDescription: `Annual Development & Facility Fee (${row.academic_year})`,
      schoolSettings,
      schoolLogoDataUrl: logoDataUrl,
      issuedAt: String(row.payment_created_at)
    };
  }

  /**
   * Searchable, paginated query of student fee records with payments and filters.
   */
  public getStudentFees(query: IStudentFeeFilterQuery): IPaginatedResult<IStudentAnnualFeeItem> {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 15)));
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = ['1=1'];
    const params: unknown[] = [];

    if (query.academicYear) {
      whereClauses.push('saf.academic_year = ?');
      params.push(Number(query.academicYear));
    }

    if (query.status) {
      whereClauses.push('saf.status = ?');
      params.push(query.status);
    }

    if (query.grade !== undefined && query.grade !== null && Number.isInteger(Number(query.grade))) {
      whereClauses.push('st.current_grade = ?');
      params.push(Number(query.grade));
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      whereClauses.push('(st.admission_number LIKE ? OR st.full_name LIKE ? OR fp.receipt_number LIKE ?)');
      params.push(`${term}%`, `%${term}%`, `${term}%`);
    }

    const whereSql = whereClauses.join(' AND ');

    // Count query
    const countSql = `
      SELECT COUNT(saf.id) as total
      FROM student_annual_fees saf
      INNER JOIN students st ON saf.student_id = st.id
      LEFT JOIN fee_payments fp ON saf.id = fp.student_annual_fee_id
      WHERE ${whereSql}
    `;
    const countRow = this.db.prepare(countSql).get(...params) as { total: number };
    const total = countRow ? Number(countRow.total) : 0;

    // Items query with explicit columns and joins
    const itemsSql = `
      SELECT 
        saf.id,
        saf.student_id,
        saf.academic_year,
        saf.fee_amount,
        saf.status,
        saf.created_at,
        saf.updated_at,
        st.admission_number,
        st.full_name,
        st.current_grade,
        st.status as student_status,
        fp.id as payment_id,
        fp.receipt_number,
        fp.payment_date,
        fp.amount as payment_amount,
        fp.notes as payment_notes,
        fp.recorded_by,
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

    const items: IStudentAnnualFeeItem[] = rows.map(r => ({
      id: Number(r.id),
      studentId: Number(r.student_id),
      admissionNumber: String(r.admission_number),
      fullName: String(r.full_name),
      currentGrade: Number(r.current_grade),
      studentStatus: r.student_status as any,
      academicYear: Number(r.academic_year),
      feeAmount: Number(r.fee_amount),
      status: r.status as 'Unpaid' | 'Paid',
      isFeeExempt: Number(r.fee_amount) === 0,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      paymentId: r.payment_id ? Number(r.payment_id) : null,
      receiptNumber: r.receipt_number ? String(r.receipt_number) : null,
      paymentDate: r.payment_date ? String(r.payment_date) : null,
      paymentAmount: r.payment_amount ? Number(r.payment_amount) : null,
      recordedBy: r.recorded_by ? Number(r.recorded_by) : null,
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
}

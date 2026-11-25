import Database from 'better-sqlite3';
import {
  IAuthSession,
  IAcademicYear,
  IAnnualProcessingLog,
  IStudentGradeHistoryRecord,
  IPromotionSystemStatus,
  IPromotionResult,
  ICatchupPromotionResult
} from '../shared/types';

export class AcademicYearService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Returns current calendar year (Jan 1 to Dec 31).
   */
  public getCurrentCalendarYear(): number {
    return new Date().getFullYear();
  }

  /**
   * Ensures an academic_year record exists for a given year.
   */
  public ensureAcademicYearExists(year: number): void {
    if (year < 2000 || year > 2100) {
      throw new Error(`Academic year ${year} is out of valid range (2000-2100).`);
    }

    const row = this.db.prepare('SELECT year FROM academic_years WHERE year = ?').get(year);
    if (!row) {
      this.db.prepare(`
        INSERT INTO academic_years (year, is_active, created_at)
        VALUES (?, 0, CURRENT_TIMESTAMP)
      `).run(year);
    }
  }

  /**
   * Sets the active academic year in academic_years table.
   */
  public setActiveAcademicYear(year: number): void {
    this.ensureAcademicYearExists(year);
    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE academic_years SET is_active = 0').run();
      this.db.prepare('UPDATE academic_years SET is_active = 1 WHERE year = ?').run(year);
    });
    tx();
  }

  /**
   * Retrieves all academic year records ordered descending.
   */
  public getAcademicYears(): IAcademicYear[] {
    const rows = this.db.prepare(`
      SELECT year, is_active, created_at 
      FROM academic_years 
      ORDER BY year DESC
    `).all() as Array<{ year: number; is_active: number; created_at: string }>;

    return rows.map(r => ({
      year: Number(r.year),
      isActive: Boolean(r.is_active),
      createdAt: String(r.created_at)
    }));
  }

  /**
   * Retrieves the current active academic year, or sets and returns current calendar year if none active.
   */
  public getActiveAcademicYear(): number {
    const row = this.db.prepare('SELECT year FROM academic_years WHERE is_active = 1').get() as { year: number } | undefined;
    if (row) {
      return Number(row.year);
    }
    const currentYear = this.getCurrentCalendarYear();
    this.setActiveAcademicYear(currentYear);
    return currentYear;
  }

  /**
   * Returns overall system promotion status and statistics for UI & startup checks.
   */
  public getPromotionSystemStatus(): IPromotionSystemStatus {
    const currentYear = this.getCurrentCalendarYear();
    this.ensureAcademicYearExists(currentYear);

    const activeRow = this.db.prepare('SELECT year FROM academic_years WHERE is_active = 1').get() as { year: number } | undefined;
    const isActiveYearSet = Boolean(activeRow);

    // Find pending promotion years up to current year
    const pendingYears = this.getPendingPromotionYears();

    // Last completed or attempted promotion log
    const lastLogRaw = this.db.prepare(`
      SELECT 
        l.id, l.academic_year, l.job_type, l.status, l.records_processed,
        l.promoted_count, l.passed_out_count, l.skipped_leaved_count, l.failed_count,
        l.started_at, l.completed_at, l.executed_by, u.display_name as executed_by_name,
        l.error_details, l.details
      FROM annual_processing_logs l
      LEFT JOIN users u ON l.executed_by = u.id
      WHERE l.job_type = 'GradePromotion'
      ORDER BY l.academic_year DESC, l.id DESC
      LIMIT 1
    `).get() as Record<string, unknown> | undefined;

    let lastPromotion: IAnnualProcessingLog | null = null;
    if (lastLogRaw) {
      lastPromotion = this.mapLogRecord(lastLogRaw);
    }

    // Live student counts
    const counts = this.db.prepare(`
      SELECT 
        SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN status = 'Passed Out' THEN 1 ELSE 0 END) as passed_out_count,
        SUM(CASE WHEN status = 'Leaved' THEN 1 ELSE 0 END) as leaved_count
      FROM students
    `).get() as { active_count: number | null; passed_out_count: number | null; leaved_count: number | null };

    // Total promoted student records ever logged
    const promotedTotalRow = this.db.prepare(`
      SELECT COUNT(*) as total FROM student_grade_history WHERE new_grade > previous_grade AND new_status = 'Active'
    `).get() as { total: number };

    return {
      currentAcademicYear: currentYear,
      isActiveYearSet,
      isPromotionPending: pendingYears.length > 0,
      pendingYears,
      lastPromotion,
      totalActiveStudents: counts.active_count || 0,
      totalPromotedStudents: promotedTotalRow.total || 0,
      totalPassedOutStudents: counts.passed_out_count || 0,
      totalSkippedLeavedStudents: counts.leaved_count || 0
    };
  }

  /**
   * Initializes or verifies the safe academic-year baseline for a first-time installation.
   * If CurtissSMS is installed for the first time during an academic year, we must NOT automatically
   * promote students for that year merely because no successful processing log exists.
   *
   * Distinguishes:
   * 1. First Installation: No previous baseline recorded. Sets the current calendar year as the baseline
   *    and active year without running promotion, and records an audit/system_metadata log.
   * 2. Existing Installation: Baseline already established. Any academic year between the baseline
   *    and current year that missed Jan 1 will be caught up reliably.
   */
  public ensureInitialAcademicYearBaseline(customDate?: Date): { isFirstInstall: boolean; baselineYear: number } {
    const now = customDate || new Date();
    const currentYear = now.getFullYear();

    const baselineMeta = this.db.prepare("SELECT value FROM system_metadata WHERE key = 'academic_promotion_baseline_year'").get() as { value: string } | undefined;

    if (!baselineMeta) {
      // Check if existing student records exist (upgraded database without prior baseline)
      const studentCountRow = this.db.prepare("SELECT COUNT(*) as count FROM students").get() as { count: number };
      const hasExistingStudents = studentCountRow && studentCountRow.count > 0;

      this.ensureAcademicYearExists(currentYear);
      this.setActiveAcademicYear(currentYear);

      this.db.prepare(`
        INSERT OR REPLACE INTO system_metadata (key, value, updated_at)
        VALUES ('academic_promotion_baseline_year', ?, CURRENT_TIMESTAMP)
      `).run(String(currentYear));

      this.db.prepare(`
        INSERT OR REPLACE INTO system_metadata (key, value, updated_at)
        VALUES ('academic_promotion_baseline_date', ?, CURRENT_TIMESTAMP)
      `).run(now.toISOString());

      try {
        const userRow = this.db.prepare("SELECT id FROM users LIMIT 1").get() as { id: number } | undefined;
        const auditUserId = userRow?.id || null;
        const logAction = hasExistingStudents ? 'UPGRADED_DATABASE_BASELINE_ESTABLISHED' : 'ACADEMIC_YEAR_BASELINE_INITIALIZED';
        const logDetails = hasExistingStudents
          ? 'Upgraded database baseline established for current Academic Year ' + currentYear + ' with ' + studentCountRow.count + ' existing students. Historical promotions will not be re-run.'
          : 'First installation baseline established for Academic Year ' + currentYear + '. Automatic catch-up promotion will not promote newly enrolled students for the installation year.';

        this.db.prepare(`
          INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
          VALUES (?, ?, 'academic_years', ?, ?)
        `).run(auditUserId, logAction, String(currentYear), logDetails);
      } catch {}

      return { isFirstInstall: !hasExistingStudents, baselineYear: currentYear };
    }

    const baselineYear = parseInt(baselineMeta.value, 10) || currentYear;
    return { isFirstInstall: false, baselineYear };
  }

  /**
   * Identifies which academic years have not yet been successfully promoted.
   * Scans from the established baseline year up to the eligible promotion years.
   *
   * Rules:
   * 1. A promotion for year Y is only eligible once year Y has concluded (i.e. on or after Jan 1 of year Y+1).
   * 2. If year Y is the current calendar year in progress, it is NOT pending promotion until Jan 1 of year Y+1 arrives!
   * 3. For an existing installation that was established in year Y_base, if current year is Y_now (where Y_now > Y_base),
   *    all years from Y_base up to Y_now - 1 that haven't succeeded yet are pending catch-up.
   */
  public getPendingPromotionYears(customDate?: Date): number[] {
    const now = customDate || new Date();
    const currentCalendarYear = now.getFullYear();

    // Ensure baseline is established
    const { baselineYear } = this.ensureInitialAcademicYearBaseline(now);

    // Retrieve all years that have ALREADY succeeded
    const successfulLogs = this.db.prepare(`
      SELECT academic_year 
      FROM annual_processing_logs 
      WHERE job_type = 'GradePromotion' AND status = 'Success'
    `).all() as Array<{ academic_year: number }>;

    const succeededSet = new Set<number>(successfulLogs.map(l => Number(l.academic_year)));

    const pending: number[] = [];

    // Eligible promotion years are past calendar years that have concluded (i.e. < currentCalendarYear)
    // or if the installation has historical years that missed Jan 1.
    for (let y = baselineYear; y < currentCalendarYear; y++) {
      if (!succeededSet.has(y)) {
        pending.push(y);
      }
    }

    return pending.sort((a, b) => a - b);
  }

  /**
   * Executes grade promotion for a specific academic year inside an atomic transaction.
   *
   * Promotion Rules:
   * - Active students in Grades 1–12: grade -> grade + 1
   * - Active students in Grade 13: status -> 'Passed Out', new_grade -> 14
   * - Leaved students: unchanged, skipped (no promotion history entry)
   * - Passed Out students: unchanged, skipped
   * - Preserves all student details (names, dates, family_id, photos, notes, fees)
   * - Records student_grade_history and student_status_history
   * - Enforces unique successful processing per academic year
   */
  public processAcademicYearPromotion(
    targetYear: number,
    executedByUserId?: number | null
  ): IPromotionResult {
    this.ensureAcademicYearExists(targetYear);

    // 1. Guard against duplicate execution if already succeeded
    const existingLog = this.db.prepare(`
      SELECT id, status FROM annual_processing_logs 
      WHERE academic_year = ? AND job_type = 'GradePromotion'
    `).get(targetYear) as { id: number; status: string } | undefined;

    if (existingLog && existingLog.status === 'Success') {
      throw new Error(`Academic Year ${targetYear} grade promotion has already been successfully completed and cannot be repeated.`);
    }

    // 2. Fetch all students with explicit columns
    const students = this.db.prepare(`
      SELECT id, admission_number, full_name, current_grade, status 
      FROM students
      ORDER BY id ASC
    `).all() as Array<{
      id: number;
      admission_number: string;
      full_name: string;
      current_grade: number;
      status: string;
    }>;

    let promotedCount = 0;
    let passedOutCount = 0;
    let skippedLeavedCount = 0;
    let failedCount = 0;

    // 3. Atomically execute promotion
    const promotionTx = this.db.transaction(() => {
      // Prepared statements
      const updateStudentGradeStmt = this.db.prepare(`
        UPDATE students 
        SET current_grade = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);

      const updateStudentPassedOutStmt = this.db.prepare(`
        UPDATE students 
        SET status = 'Passed Out', updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);

      const insertGradeHistoryStmt = this.db.prepare(`
        INSERT INTO student_grade_history (
          student_id, academic_year, previous_grade, new_grade, grade, previous_status, new_status, promoted_at, promoted_by, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
        ON CONFLICT(student_id, academic_year) DO UPDATE SET
          previous_grade = excluded.previous_grade,
          new_grade = excluded.new_grade,
          grade = excluded.grade,
          previous_status = excluded.previous_status,
          new_status = excluded.new_status,
          promoted_at = CURRENT_TIMESTAMP,
          promoted_by = excluded.promoted_by,
          notes = excluded.notes
      `);

      const insertStatusHistoryStmt = this.db.prepare(`
        INSERT INTO student_status_history (
          student_id, from_status, to_status, reason, changed_by, changed_at
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      const userRow = this.db.prepare("SELECT id FROM users LIMIT 1").get() as { id: number } | undefined;
      const validUserId = (executedByUserId && this.db.prepare("SELECT id FROM users WHERE id = ?").get(executedByUserId))
        ? executedByUserId
        : (userRow?.id || null);

      for (const s of students) {
        if (s.status === 'Leaved') {
          // Leaved students remain unchanged and do not receive false promotion history entries
          skippedLeavedCount++;
          continue;
        }

        if (s.status === 'Passed Out') {
          // Already passed out students are preserved unchanged
          continue;
        }

        if (s.status === 'Active') {
          if (s.current_grade >= 1 && s.current_grade <= 12) {
            const prevGrade = s.current_grade;
            const nextGrade = prevGrade + 1;

            updateStudentGradeStmt.run(nextGrade, s.id);
            insertGradeHistoryStmt.run(
              s.id,
              targetYear,
              prevGrade,
              nextGrade,
              nextGrade, // regular grade column
              'Active',
              'Active',
              validUserId,
              `Annual grade promotion for Academic Year ${targetYear}`
            );
            promotedCount++;
          } else if (s.current_grade === 13) {
            // Grade 13 students pass out
            const prevGrade = s.current_grade;
            updateStudentPassedOutStmt.run(s.id);

            // Record grade history (new_grade = 14 denotes completed curriculum/passed out, grade = 13 remains highest grade level)
            insertGradeHistoryStmt.run(
              s.id,
              targetYear,
              prevGrade,
              14,
              13, // regular grade column
              'Active',
              'Passed Out',
              validUserId,
              `Completed Grade 13 and graduated / passed out for Academic Year ${targetYear}`
            );

            // Record status transition
            insertStatusHistoryStmt.run(
              s.id,
              'Active',
              'Passed Out',
              `Completed Grade 13 in Academic Year ${targetYear}`,
              validUserId
            );

            passedOutCount++;
          }
        }
      }

      // Record annual processing log
      const totalProcessed = promotedCount + passedOutCount;
      const detailsMsg = `Promoted: ${promotedCount}, Passed Out: ${passedOutCount}, Skipped Leaved: ${skippedLeavedCount}, Failures: ${failedCount}`;

      // Calculate next attempt_number for annual_processing_logs
      const lastAttemptRow = this.db.prepare(`
        SELECT MAX(attempt_number) as max_attempt 
        FROM annual_processing_logs 
        WHERE academic_year = ? AND job_type = 'GradePromotion'
      `).get(targetYear) as { max_attempt: number | null };
      const nextAttempt = (lastAttemptRow?.max_attempt || 0) + 1;

      this.db.prepare(`
        INSERT INTO annual_processing_logs (
          academic_year, job_type, attempt_number, status, records_processed,
          promoted_count, passed_out_count, skipped_leaved_count, failed_count,
          started_at, completed_at, executed_by, details
        ) VALUES (?, 'GradePromotion', ?, 'Success', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)
      `).run(
        targetYear,
        nextAttempt,
        totalProcessed,
        promotedCount,
        passedOutCount,
        skippedLeavedCount,
        failedCount,
        validUserId,
        detailsMsg
      );

      // Set active academic year to target year (or latest)
      this.db.prepare('UPDATE academic_years SET is_active = 0').run();
      this.db.prepare('UPDATE academic_years SET is_active = 1 WHERE year = ?').run(targetYear);

      // Audit log
      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'GRADE_PROMOTION_SUCCESS', 'academic_years', ?, ?)
      `).run(
        validUserId,
        String(targetYear),
        `Completed annual promotion for Academic Year ${targetYear}. ${detailsMsg}`
      );
    });

    try {
      promotionTx();
      return {
        academicYear: targetYear,
        status: 'Success',
        recordsProcessed: promotedCount + passedOutCount,
        promotedCount,
        passedOutCount,
        skippedLeavedCount,
        failedCount,
        details: `Promoted: ${promotedCount}, Passed Out: ${passedOutCount}`
      };
    } catch (err) {
      // Record failure log outside the rolled-back transaction so failure is visible
      const errorMsg = (err as Error).message || String(err);
      const lastAttemptRow = this.db.prepare(`
        SELECT MAX(attempt_number) as max_attempt 
        FROM annual_processing_logs 
        WHERE academic_year = ? AND job_type = 'GradePromotion'
      `).get(targetYear) as { max_attempt: number | null };
      const nextAttempt = (lastAttemptRow?.max_attempt || 0) + 1;

      this.db.prepare(`
        INSERT INTO annual_processing_logs (
          academic_year, job_type, attempt_number, status, records_processed,
          promoted_count, passed_out_count, skipped_leaved_count, failed_count,
          started_at, completed_at, executed_by, error_details, details
        ) VALUES (?, 'GradePromotion', ?, 'Failed', 0, 0, 0, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)
      `).run(
        targetYear,
        nextAttempt,
        executedByUserId || null,
        errorMsg,
        `Promotion failed: ${errorMsg}`
      );

      throw err;
    }
  }

  /**
   * Reliable Offline Catch-up Processing:
   * Called on application startup. Scans for any pending academic years and processes them sequentially.
   * If the app missed Jan 1 or multiple years, each is processed in order safely and idempotently.
   */
  public runCatchupPromotions(executedByUserId?: number | null, customDate?: Date): ICatchupPromotionResult {
    const pendingYears = this.getPendingPromotionYears(customDate);
    const results: IPromotionResult[] = [];
    let hasFailures = false;

    if (pendingYears.length === 0) {
      return {
        yearsProcessed: [],
        hasFailures: false,
        message: 'All academic years are fully up to date. No catch-up promotion needed.'
      };
    }

    for (const year of pendingYears) {
      try {
        const res = this.processAcademicYearPromotion(year, executedByUserId);
        results.push(res);
      } catch (err) {
        hasFailures = true;
        results.push({
          academicYear: year,
          status: 'Failed',
          recordsProcessed: 0,
          promotedCount: 0,
          passedOutCount: 0,
          skippedLeavedCount: 0,
          failedCount: 1,
          errorMessage: (err as Error).message
        });
        // Stop sequential catch-up if a year fails so dependent subsequent years are not processed out of order
        break;
      }
    }

    const msg = hasFailures
      ? `Catch-up promotion encountered errors while processing academic years: ${results.filter(r => r.status === 'Failed').map(r => r.academicYear).join(', ')}`
      : `Successfully processed catch-up promotion for ${results.length} academic year(s): ${results.map(r => r.academicYear).join(', ')}`;

    return {
      yearsProcessed: results,
      hasFailures,
      message: msg
    };
  }

  /**
   * Retrieves full chronological promotion processing history logs.
   */
  public getPromotionHistoryLogs(): IAnnualProcessingLog[] {
    const rows = this.db.prepare(`
      SELECT 
        l.id, l.academic_year, l.job_type, l.status, l.records_processed,
        l.promoted_count, l.passed_out_count, l.skipped_leaved_count, l.failed_count,
        l.started_at, l.completed_at, l.executed_by, u.display_name as executed_by_name,
        l.error_details, l.details
      FROM annual_processing_logs l
      LEFT JOIN users u ON l.executed_by = u.id
      WHERE l.job_type = 'GradePromotion'
      ORDER BY l.academic_year DESC, l.id DESC
    `).all() as Array<Record<string, unknown>>;

    return rows.map(r => this.mapLogRecord(r));
  }

  /**
   * Retrieves student grade progression records for an academic year.
   */
  public getGradeHistoryForYear(year: number, limit = 100): IStudentGradeHistoryRecord[] {
    const rows = this.db.prepare(`
      SELECT 
        h.id, h.student_id, s.admission_number, s.full_name,
        h.academic_year, h.previous_grade, h.new_grade,
        h.previous_status, h.new_status, h.promoted_at,
        h.promoted_by, u.display_name as promoted_by_name,
        h.notes
      FROM student_grade_history h
      INNER JOIN students s ON h.student_id = s.id
      LEFT JOIN users u ON h.promoted_by = u.id
      WHERE h.academic_year = ?
      ORDER BY s.admission_number ASC
      LIMIT ?
    `).all(year, limit) as Array<Record<string, unknown>>;

    return rows.map(r => ({
      id: Number(r.id),
      studentId: Number(r.student_id),
      admissionNumber: String(r.admission_number),
      fullName: String(r.full_name),
      academicYear: Number(r.academic_year),
      previousGrade: r.previous_grade !== null && r.previous_grade !== undefined ? Number(r.previous_grade) : null,
      newGrade: Number(r.new_grade),
      grade: Number(r.new_grade),
      previousStatus: r.previous_status ? String(r.previous_status) : null,
      newStatus: r.new_status ? String(r.new_status) : null,
      promotedAt: String(r.promoted_at),
      promotedBy: r.promoted_by ? Number(r.promoted_by) : null,
      promotedByName: r.promoted_by_name ? String(r.promoted_by_name) : null,
      notes: r.notes ? String(r.notes) : null
    }));
  }

  /**
   * Safe Admin retry mechanism for failed promotions.
   */
  public retryFailedPromotion(user: IAuthSession, year: number): IPromotionResult {
    if (user.role !== 'Admin') {
      throw new Error('Unauthorized: Only Administrators can retry failed academic promotions.');
    }

    const log = this.db.prepare(`
      SELECT id, status FROM annual_processing_logs 
      WHERE academic_year = ? AND job_type = 'GradePromotion'
    `).get(year) as { id: number; status: string } | undefined;

    if (!log) {
      throw new Error(`No promotion record found for academic year ${year} to retry.`);
    }

    if (log.status === 'Success') {
      throw new Error(`Academic year ${year} promotion already succeeded. It cannot be repeated.`);
    }

    return this.processAcademicYearPromotion(year, user.id);
  }

  private mapLogRecord(raw: Record<string, unknown>): IAnnualProcessingLog {
    return {
      id: Number(raw.id),
      academicYear: Number(raw.academic_year),
      jobType: 'GradePromotion',
      status: raw.status as any,
      recordsProcessed: Number(raw.records_processed || 0),
      promotedCount: Number(raw.promoted_count || 0),
      passedOutCount: Number(raw.passed_out_count || 0),
      skippedLeavedCount: Number(raw.skipped_leaved_count || 0),
      failedCount: Number(raw.failed_count || 0),
      executedAt: String(raw.started_at || raw.executed_at),
      completedAt: raw.completed_at ? String(raw.completed_at) : null,
      executedBy: raw.executed_by ? Number(raw.executed_by) : null,
      executedByName: raw.executed_by_name ? String(raw.executed_by_name) : null,
      errorMessage: (raw.error_details || raw.error_message) ? String(raw.error_details || raw.error_message) : null,
      details: raw.details ? String(raw.details) : null
    };
  }
}

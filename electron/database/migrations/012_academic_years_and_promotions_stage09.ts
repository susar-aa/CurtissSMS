import { IMigration } from '../migrator';

export const migration012: IMigration = {
  version: 12,
  name: 'academic_years_and_promotions_stage09',
  up: (db) => {
    // 1. Upgrade annual_processing_logs table
    db.exec(`
      CREATE TABLE IF NOT EXISTS annual_processing_logs_v3 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        academic_year INTEGER NOT NULL REFERENCES academic_years(year) ON DELETE RESTRICT,
        job_type TEXT NOT NULL CHECK(job_type IN ('GradePromotion', 'FeeGeneration')),
        attempt_number INTEGER NOT NULL DEFAULT 1 CHECK(attempt_number >= 1),
        status TEXT NOT NULL CHECK(status IN ('Success', 'Failed', 'Partial')),
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        records_processed INTEGER NOT NULL DEFAULT 0,
        promoted_count INTEGER NOT NULL DEFAULT 0,
        passed_out_count INTEGER NOT NULL DEFAULT 0,
        skipped_leaved_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        executed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        error_details TEXT,
        details TEXT
      );

      -- Populate from existing annual_processing_logs if any
      INSERT OR IGNORE INTO annual_processing_logs_v3 (
        id, academic_year, job_type, attempt_number, status, started_at, completed_at, records_processed, error_details
      )
      SELECT id, academic_year, job_type, attempt_number, status, started_at, completed_at, records_processed, error_details 
      FROM annual_processing_logs;

      DROP TABLE annual_processing_logs;
      ALTER TABLE annual_processing_logs_v3 RENAME TO annual_processing_logs;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_successful_annual_job 
        ON annual_processing_logs(academic_year, job_type) 
        WHERE status = 'Success';

      CREATE UNIQUE INDEX IF NOT EXISTS idx_annual_processing_attempt_unique
        ON annual_processing_logs(academic_year, job_type, attempt_number);
    `);

    // 2. Enhance student_grade_history table with previous_grade, previous_status, new_status, promoted_by, and backward-compatible regular grade column
    // Safely preserves historical records without fabricating false previous_grade, previous_status, or new_status
    db.exec(`
      CREATE TABLE IF NOT EXISTS student_grade_history_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
        academic_year INTEGER NOT NULL REFERENCES academic_years(year) ON DELETE RESTRICT,
        previous_grade INTEGER CHECK(previous_grade IS NULL OR (previous_grade BETWEEN 1 AND 13)),
        new_grade INTEGER DEFAULT 1 CHECK(new_grade IS NULL OR (new_grade BETWEEN 1 AND 14)), -- 14 denotes Passed Out beyond 13
        grade INTEGER DEFAULT 1 CHECK(grade IS NULL OR (grade BETWEEN 1 AND 14)), -- Backward compatibility for legacy tests & queries
        previous_status TEXT CHECK(previous_status IS NULL OR previous_status IN ('Active', 'Leaved', 'Passed Out')),
        new_status TEXT CHECK(new_status IS NULL OR new_status IN ('Active', 'Leaved', 'Passed Out')),
        promoted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        promoted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        CONSTRAINT uq_student_year_history UNIQUE(student_id, academic_year)
      );

      -- Migrate existing student_grade_history preserving factual data without fabricating non-existent previous states or new statuses
      INSERT OR IGNORE INTO student_grade_history_v2 (
        id, student_id, academic_year, previous_grade, new_grade, grade, previous_status, new_status, promoted_at, notes
      )
      SELECT 
        id, 
        student_id, 
        academic_year, 
        NULL, -- Do not invent previous grade when unrecorded
        grade,
        grade, 
        NULL, -- Do not invent previous status when unrecorded
        NULL, -- Do not invent new_status when unrecorded
        promoted_at, 
        notes 
      FROM student_grade_history;

      DROP TABLE student_grade_history;
      ALTER TABLE student_grade_history_v2 RENAME TO student_grade_history;

      CREATE INDEX IF NOT EXISTS idx_grade_history_student ON student_grade_history(student_id, academic_year);
      CREATE INDEX IF NOT EXISTS idx_grade_history_year ON student_grade_history(academic_year);
    `);

    // 3. Covering indexes on academic_years
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_academic_years_active ON academic_years(is_active);
    `);

    // 4. Deterministic migration-time baseline policy:
    // When upgrading an existing database (or installing fresh) without baseline metadata,
    // establish a safe baseline at the current academic year during migration.
    // Never infer historical promotion dates from admission dates or promote old students for historical years!
    const baselineCheck = db.prepare("SELECT value FROM system_metadata WHERE key = 'academic_promotion_baseline_year'").get() as { value: string } | undefined;
    if (!baselineCheck) {
      const currentYear = new Date().getFullYear();
      const studentCountRow = db.prepare("SELECT COUNT(*) as count FROM students").get() as { count: number };
      const hasExistingStudents = studentCountRow && studentCountRow.count > 0;

      db.prepare(`
        INSERT OR REPLACE INTO system_metadata (key, value, updated_at)
        VALUES ('academic_promotion_baseline_year', ?, CURRENT_TIMESTAMP)
      `).run(String(currentYear));

      db.prepare(`
        INSERT OR REPLACE INTO system_metadata (key, value, updated_at)
        VALUES ('academic_promotion_baseline_date', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run();

      try {
        const userRow = db.prepare("SELECT id FROM users LIMIT 1").get() as { id: number } | undefined;
        const auditUserId = userRow?.id || null;
        const logAction = hasExistingStudents ? 'UPGRADED_DATABASE_BASELINE_ESTABLISHED' : 'ACADEMIC_YEAR_BASELINE_INITIALIZED';
        const logDetails = hasExistingStudents
          ? 'Upgraded database baseline established for current Academic Year ' + currentYear + ' with ' + studentCountRow.count + ' existing students. Historical promotions will not be re-run.'
          : 'First installation baseline established for Academic Year ' + currentYear + '.';

        db.prepare(`
          INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
          VALUES (?, ?, 'academic_years', ?, ?)
        `).run(auditUserId, logAction, String(currentYear), logDetails);
      } catch {}
    }
  }
};


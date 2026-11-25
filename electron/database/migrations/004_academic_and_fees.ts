import { IMigration } from '../migrator';

export const migration004: IMigration = {
  version: 4,
  name: 'academic_and_fees',
  up: (db) => {
    db.exec(`
      -- Academic Years
      CREATE TABLE IF NOT EXISTS academic_years (
        year INTEGER PRIMARY KEY CHECK(year BETWEEN 2000 AND 2100),
        is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0, 1)),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Student Grade Progression History
      CREATE TABLE IF NOT EXISTS student_grade_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        academic_year INTEGER NOT NULL REFERENCES academic_years(year) ON DELETE RESTRICT,
        grade INTEGER NOT NULL CHECK(grade BETWEEN 1 AND 13),
        promoted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        CONSTRAINT uq_student_year_grade UNIQUE(student_id, academic_year)
      );

      CREATE INDEX IF NOT EXISTS idx_grade_history_student ON student_grade_history(student_id, academic_year);

      -- Student Status Transition History (Active, Leaved, Passed Out)
      CREATE TABLE IF NOT EXISTS student_status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        from_status TEXT NOT NULL,
        to_status TEXT NOT NULL,
        reason TEXT,
        changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_status_history_student ON student_status_history(student_id, changed_at);

      -- Annual Processing Audit Logs (Idempotent Jan 1 Operations)
      CREATE TABLE IF NOT EXISTS annual_processing_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        academic_year INTEGER NOT NULL REFERENCES academic_years(year) ON DELETE RESTRICT,
        job_type TEXT NOT NULL CHECK(job_type IN ('GradePromotion', 'FeeGeneration')),
        status TEXT NOT NULL CHECK(status IN ('Success', 'Failed', 'Partial')),
        records_processed INTEGER NOT NULL DEFAULT 0,
        executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        details TEXT,
        CONSTRAINT uq_year_job UNIQUE(academic_year, job_type)
      );

      CREATE INDEX IF NOT EXISTS idx_processing_logs_year_job ON annual_processing_logs(academic_year, job_type);

      -- Annual Fee Amount Settings per Academic Year
      CREATE TABLE IF NOT EXISTS annual_fee_settings (
        academic_year INTEGER PRIMARY KEY REFERENCES academic_years(year) ON DELETE RESTRICT,
        fee_amount NUMERIC NOT NULL CHECK(fee_amount >= 0),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Student Annual Fee Invoices
      CREATE TABLE IF NOT EXISTS student_annual_fees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
        academic_year INTEGER NOT NULL REFERENCES academic_years(year) ON DELETE RESTRICT,
        fee_amount NUMERIC NOT NULL CHECK(fee_amount >= 0),
        status TEXT NOT NULL DEFAULT 'Unpaid' CHECK(status IN ('Unpaid', 'Paid')),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_student_annual_fee UNIQUE(student_id, academic_year)
      );

      CREATE INDEX IF NOT EXISTS idx_student_annual_fees_lookup ON student_annual_fees(student_id, academic_year);
      CREATE INDEX IF NOT EXISTS idx_student_annual_fees_year_status ON student_annual_fees(academic_year, status);

      -- Fee Payments (Cash only, Full payment, Exactly one payment per fee record)
      CREATE TABLE IF NOT EXISTS fee_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_annual_fee_id INTEGER NOT NULL UNIQUE REFERENCES student_annual_fees(id) ON DELETE RESTRICT,
        receipt_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
        payment_date DATE NOT NULL,
        amount NUMERIC NOT NULL CHECK(amount > 0),
        payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK(payment_method = 'Cash'),
        recorded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        notes TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_fee_payments_receipt ON fee_payments(receipt_number);
      CREATE INDEX IF NOT EXISTS idx_fee_payments_date ON fee_payments(payment_date);
      CREATE INDEX IF NOT EXISTS idx_fee_payments_recorder ON fee_payments(recorded_by);
    `);
  }
};

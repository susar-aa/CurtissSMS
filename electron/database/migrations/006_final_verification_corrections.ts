import { IMigration } from '../migrator';

export const migration006: IMigration = {
  version: 6,
  name: 'final_verification_corrections_stage02_2',
  up: (db) => {
    // 1. PIN Security: Add deterministic keyed HMAC column (pin_hmac) with UNIQUE constraint
    // while keeping the cryptographically salted verification hash (pin_hash)
    db.exec(`
      CREATE TABLE IF NOT EXISTS users_v3 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        display_name TEXT NOT NULL DEFAULT 'User',
        pin_hash TEXT NOT NULL,
        pin_hmac TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK(role IN ('Admin', 'Staff')),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Migrate existing users safely by using pin_hash as initial pin_hmac fallback if not already formatted
      INSERT OR IGNORE INTO users_v3 (id, display_name, pin_hash, pin_hmac, role, is_active, created_at, updated_at)
      SELECT id, display_name, pin_hash, pin_hash, role, is_active, created_at, updated_at FROM users;

      DROP TABLE users;
      ALTER TABLE users_v3 RENAME TO users;
      CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active);
    `);

    // 2. Enforce strict whole-rupee integer amounts (reject decimal floats) on annual_fee_settings
    db.exec(`
      CREATE TABLE IF NOT EXISTS annual_fee_settings_v2 (
        academic_year INTEGER PRIMARY KEY REFERENCES academic_years(year) ON DELETE RESTRICT,
        fee_amount INTEGER NOT NULL CHECK(typeof(fee_amount) = 'integer' AND fee_amount >= 0),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT OR IGNORE INTO annual_fee_settings_v2 (academic_year, fee_amount, created_at, updated_at)
      SELECT academic_year, CAST(fee_amount AS INTEGER), created_at, updated_at FROM annual_fee_settings;

      DROP TABLE annual_fee_settings;
      ALTER TABLE annual_fee_settings_v2 RENAME TO annual_fee_settings;
    `);

    // 3. Enforce strict whole-rupee integer amounts on student_annual_fees with ON DELETE RESTRICT
    db.exec(`
      CREATE TABLE IF NOT EXISTS student_annual_fees_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
        academic_year INTEGER NOT NULL REFERENCES academic_years(year) ON DELETE RESTRICT,
        fee_amount INTEGER NOT NULL CHECK(typeof(fee_amount) = 'integer' AND fee_amount >= 0),
        status TEXT NOT NULL DEFAULT 'Unpaid' CHECK(status IN ('Unpaid', 'Paid')),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_student_annual_fee UNIQUE(student_id, academic_year)
      );

      INSERT OR IGNORE INTO student_annual_fees_v2 (id, student_id, academic_year, fee_amount, status, created_at, updated_at)
      SELECT id, student_id, academic_year, CAST(fee_amount AS INTEGER), status, created_at, updated_at FROM student_annual_fees;

      DROP TABLE student_annual_fees;
      ALTER TABLE student_annual_fees_v2 RENAME TO student_annual_fees;
      CREATE INDEX IF NOT EXISTS idx_student_annual_fees_lookup ON student_annual_fees(student_id, academic_year);
      CREATE INDEX IF NOT EXISTS idx_student_annual_fees_year_status ON student_annual_fees(academic_year, status);
    `);

    // 4. Enforce strict whole-rupee integer amounts on fee_payments with ON DELETE RESTRICT
    db.exec(`
      CREATE TABLE IF NOT EXISTS fee_payments_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_annual_fee_id INTEGER NOT NULL UNIQUE REFERENCES student_annual_fees(id) ON DELETE RESTRICT,
        receipt_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
        payment_date DATE NOT NULL,
        amount INTEGER NOT NULL CHECK(typeof(amount) = 'integer' AND amount > 0),
        payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK(payment_method = 'Cash'),
        recorded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        notes TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT OR IGNORE INTO fee_payments_v2 (id, student_annual_fee_id, receipt_number, payment_date, amount, payment_method, recorded_by, notes, created_at)
      SELECT id, student_annual_fee_id, receipt_number, payment_date, CAST(amount AS INTEGER), payment_method, recorded_by, notes, created_at FROM fee_payments;

      DROP TABLE fee_payments;
      ALTER TABLE fee_payments_v2 RENAME TO fee_payments;
      CREATE INDEX IF NOT EXISTS idx_fee_payments_receipt ON fee_payments(receipt_number);
      CREATE INDEX IF NOT EXISTS idx_fee_payments_date ON fee_payments(payment_date);
      CREATE INDEX IF NOT EXISTS idx_fee_payments_recorder ON fee_payments(recorded_by);
    `);

    // 5. Enforce unique attempt numbers on annual_processing_logs
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
        error_details TEXT,
        CONSTRAINT uq_year_job_attempt UNIQUE(academic_year, job_type, attempt_number)
      );

      INSERT OR IGNORE INTO annual_processing_logs_v3 (id, academic_year, job_type, attempt_number, status, started_at, completed_at, records_processed, error_details)
      SELECT id, academic_year, job_type, attempt_number, status, started_at, completed_at, records_processed, error_details FROM annual_processing_logs;

      DROP TABLE annual_processing_logs;
      ALTER TABLE annual_processing_logs_v3 RENAME TO annual_processing_logs;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_successful_annual_job ON annual_processing_logs(academic_year, job_type) WHERE status = 'Success';
      CREATE INDEX IF NOT EXISTS idx_annual_processing_lookup ON annual_processing_logs(academic_year, job_type, attempt_number);
    `);

    // Record migration metadata
    db.exec(`
      INSERT OR REPLACE INTO system_metadata (key, value, updated_at)
      VALUES ('stage02_2_verification_applied', 'true', CURRENT_TIMESTAMP);
    `);
  }
};

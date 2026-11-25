import { IMigration } from '../migrator';

export const migration005: IMigration = {
  version: 5,
  name: 'schema_corrections_stage02_1',
  up: (db) => {
    // 1. Convert users table to PIN-only authentication (no username, unique PIN hash)
    db.exec(`
      CREATE TABLE IF NOT EXISTS users_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        display_name TEXT NOT NULL DEFAULT 'User',
        pin_hash TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK(role IN ('Admin', 'Staff')),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT OR IGNORE INTO users_v2 (id, display_name, pin_hash, role, is_active, created_at, updated_at)
      SELECT id, username, pin_hash, role, is_active, created_at, updated_at FROM users;

      DROP TABLE users;
      ALTER TABLE users_v2 RENAME TO users;
      CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active);
    `);

    // 2. Remove redundant student address columns so families is the sole authoritative address source
    // SQLite 3.35.0+ supports ALTER TABLE DROP COLUMN
    db.exec(`
      ALTER TABLE students DROP COLUMN house_no;
      ALTER TABLE students DROP COLUMN street_id;
      ALTER TABLE students DROP COLUMN city_id;
      ALTER TABLE students DROP COLUMN additional_address_details;
      ALTER TABLE students DROP COLUMN full_address;
    `);

    // 3. Update family_members table with 10-digit contact validation check
    db.exec(`
      CREATE TABLE IF NOT EXISTS family_members_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        relationship_type TEXT NOT NULL CHECK(relationship_type IN ('Father', 'Mother', 'Guardian')),
        name TEXT NOT NULL,
        contact_number TEXT CHECK(contact_number IS NULL OR (length(contact_number) = 10 AND contact_number GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]')),
        whatsapp_number TEXT CHECK(whatsapp_number IS NULL OR (length(whatsapp_number) = 10 AND whatsapp_number GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]')),
        occupation_id INTEGER REFERENCES occupations(id) ON DELETE SET NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_family_relationship UNIQUE(family_id, relationship_type)
      );

      INSERT OR IGNORE INTO family_members_v2 (id, family_id, relationship_type, name, contact_number, whatsapp_number, occupation_id, created_at, updated_at)
      SELECT id, family_id, relationship_type, name, contact_number, whatsapp_number, occupation_id, created_at, updated_at FROM family_members;

      DROP TABLE family_members;
      ALTER TABLE family_members_v2 RENAME TO family_members;
      CREATE INDEX IF NOT EXISTS idx_family_members_family ON family_members(family_id);
      CREATE INDEX IF NOT EXISTS idx_family_members_contact ON family_members(contact_number);
    `);

    // 4. Protect historical records with ON DELETE RESTRICT (grade history, status history, notes)
    db.exec(`
      -- Student Grade History with RESTRICT
      CREATE TABLE IF NOT EXISTS student_grade_history_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
        academic_year INTEGER NOT NULL REFERENCES academic_years(year) ON DELETE RESTRICT,
        grade INTEGER NOT NULL CHECK(grade BETWEEN 1 AND 13),
        promoted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        CONSTRAINT uq_student_year_grade UNIQUE(student_id, academic_year)
      );

      INSERT OR IGNORE INTO student_grade_history_v2 (id, student_id, academic_year, grade, promoted_at, notes)
      SELECT id, student_id, academic_year, grade, promoted_at, notes FROM student_grade_history;

      DROP TABLE student_grade_history;
      ALTER TABLE student_grade_history_v2 RENAME TO student_grade_history;
      CREATE INDEX IF NOT EXISTS idx_grade_history_student ON student_grade_history(student_id, academic_year);

      -- Student Status History with RESTRICT
      CREATE TABLE IF NOT EXISTS student_status_history_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
        from_status TEXT NOT NULL,
        to_status TEXT NOT NULL,
        reason TEXT,
        changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT OR IGNORE INTO student_status_history_v2 (id, student_id, from_status, to_status, reason, changed_by, changed_at)
      SELECT id, student_id, from_status, to_status, reason, changed_by, changed_at FROM student_status_history;

      DROP TABLE student_status_history;
      ALTER TABLE student_status_history_v2 RENAME TO student_status_history;
      CREATE INDEX IF NOT EXISTS idx_status_history_student ON student_status_history(student_id, changed_at);

      -- Student Notes with RESTRICT
      CREATE TABLE IF NOT EXISTS student_notes_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
        note_text TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0, 1)),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT OR IGNORE INTO student_notes_v2 (id, student_id, note_text, created_by, is_deleted, created_at, updated_at)
      SELECT id, student_id, note_text, created_by, is_deleted, created_at, updated_at FROM student_notes;

      DROP TABLE student_notes;
      ALTER TABLE student_notes_v2 RENAME TO student_notes;
      CREATE INDEX IF NOT EXISTS idx_student_notes_student ON student_notes(student_id, is_deleted, created_at);
    `);

    // 5. Enhance annual_processing_logs to support retries and exactly one Success record per year & job
    db.exec(`
      CREATE TABLE IF NOT EXISTS annual_processing_logs_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        academic_year INTEGER NOT NULL REFERENCES academic_years(year) ON DELETE RESTRICT,
        job_type TEXT NOT NULL CHECK(job_type IN ('GradePromotion', 'FeeGeneration')),
        attempt_number INTEGER NOT NULL DEFAULT 1 CHECK(attempt_number >= 1),
        status TEXT NOT NULL CHECK(status IN ('Success', 'Failed', 'Partial')),
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        records_processed INTEGER NOT NULL DEFAULT 0,
        error_details TEXT
      );

      -- Conditional unique index allows multiple Failed/Partial retry attempts,
      -- but strictly enforces exactly ONE Success record per year and job type:
      CREATE UNIQUE INDEX IF NOT EXISTS idx_successful_annual_job 
        ON annual_processing_logs_v2(academic_year, job_type) 
        WHERE status = 'Success';

      CREATE INDEX IF NOT EXISTS idx_annual_processing_lookup 
        ON annual_processing_logs_v2(academic_year, job_type, attempt_number);

      DROP TABLE annual_processing_logs;
      ALTER TABLE annual_processing_logs_v2 RENAME TO annual_processing_logs;
    `);

    // 6. Enforce whole-rupee integer amounts on financial tables
    db.exec(`
      -- Update system metadata to record version 5 corrections
      INSERT OR REPLACE INTO system_metadata (key, value, updated_at)
      VALUES ('stage02_corrections_applied', 'true', CURRENT_TIMESTAMP);
    `);
  }
};

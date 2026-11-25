import { IMigration } from '../migrator';

export const migration009: IMigration = {
  version: 9,
  name: 'student_management_stage06',
  up: (db) => {
    // 1. Check for existing conflicting case-insensitive duplicate admission numbers
    const conflicts = db.prepare(`
      SELECT LOWER(TRIM(admission_number)) as lower_adm, COUNT(*) as cnt
      FROM students
      GROUP BY LOWER(TRIM(admission_number))
      HAVING cnt > 1
    `).all() as Array<{ lower_adm: string; cnt: number }>;

    if (conflicts.length === 0) {
      // Clean: enforce case-insensitive UNIQUE index directly at SQLite database level
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_students_admission_no_nocase 
        ON students(admission_number COLLATE NOCASE);
      `);
    } else {
      // Conflicts detected: Do NOT delete or modify student records!
      // Create non-unique index and preserve all existing student records safely
      console.warn(`[MIGRATION 009] Detected ${conflicts.length} conflicting admission number(s). Preserving records safely without data loss.`);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_students_adm_no_nocase 
        ON students(admission_number COLLATE NOCASE);
      `);
    }

    // 2. Optimized composite and single-column indexes for student searching, filtering, and sorting
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_students_house_id ON students(house_id);
      CREATE INDEX IF NOT EXISTS idx_students_gender ON students(gender);
      CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
      CREATE INDEX IF NOT EXISTS idx_students_grade ON students(current_grade);
      CREATE INDEX IF NOT EXISTS idx_students_name_prefix ON students(full_name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_students_grade_house ON students(current_grade, house_id);

      -- Archive table in backup databases for student photos
      CREATE TABLE IF NOT EXISTS backup_student_photos_archive (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admission_number TEXT NOT NULL,
        photo_filename TEXT NOT NULL,
        photo_blob BLOB NOT NULL,
        archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }
};

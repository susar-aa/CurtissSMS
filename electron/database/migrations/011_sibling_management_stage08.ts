import { IMigration } from '../migrator';

export const migration011: IMigration = {
  version: 11,
  name: 'sibling_management_stage08',
  up: (db) => {
    db.exec(`
      -- Sibling search and family relationship covering indexes
      CREATE INDEX IF NOT EXISTS idx_students_family_search ON students(family_id, id, admission_number);
      CREATE INDEX IF NOT EXISTS idx_students_candidate_search ON students(id, admission_number, full_name, current_grade, status);
      CREATE INDEX IF NOT EXISTS idx_students_family_status ON students(family_id, status);
    `);
  }
};

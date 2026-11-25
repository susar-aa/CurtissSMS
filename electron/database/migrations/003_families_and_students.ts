import { IMigration } from '../migrator';

export const migration003: IMigration = {
  version: 3,
  name: 'families_and_students',
  up: (db) => {
    db.exec(`
      -- Shared Families
      CREATE TABLE IF NOT EXISTS families (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_code TEXT NOT NULL UNIQUE,
        house_no TEXT,
        street_id INTEGER REFERENCES streets(id) ON DELETE SET NULL,
        city_id INTEGER REFERENCES cities(id) ON DELETE SET NULL,
        additional_address_details TEXT,
        full_address TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_families_code ON families(family_code);
      CREATE INDEX IF NOT EXISTS idx_families_city ON families(city_id);

      -- Shared Family Members (Father, Mother, Guardian)
      CREATE TABLE IF NOT EXISTS family_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        relationship_type TEXT NOT NULL CHECK(relationship_type IN ('Father', 'Mother', 'Guardian')),
        name TEXT NOT NULL,
        contact_number TEXT,
        whatsapp_number TEXT,
        occupation_id INTEGER REFERENCES occupations(id) ON DELETE SET NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_family_relationship UNIQUE(family_id, relationship_type)
      );

      CREATE INDEX IF NOT EXISTS idx_family_members_family ON family_members(family_id);
      CREATE INDEX IF NOT EXISTS idx_family_members_contact ON family_members(contact_number);

      -- Students
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
        admission_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
        admission_date DATE NOT NULL,
        full_name TEXT NOT NULL,
        gender TEXT NOT NULL CHECK(gender IN ('Male', 'Female')),
        date_of_birth DATE NOT NULL,
        current_grade INTEGER NOT NULL CHECK(current_grade BETWEEN 1 AND 13),
        status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Leaved', 'Passed Out')),
        transportation_method_id INTEGER REFERENCES transportation_methods(id) ON DELETE SET NULL,
        house_id INTEGER REFERENCES houses(id) ON DELETE SET NULL,
        house_no TEXT,
        street_id INTEGER REFERENCES streets(id) ON DELETE SET NULL,
        city_id INTEGER REFERENCES cities(id) ON DELETE SET NULL,
        additional_address_details TEXT,
        full_address TEXT,
        previous_school_name TEXT,
        previous_school_id_number TEXT,
        performance_description TEXT,
        photo_path TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_students_admission_no ON students(admission_number);
      CREATE INDEX IF NOT EXISTS idx_students_family_id ON students(family_id);
      CREATE INDEX IF NOT EXISTS idx_students_grade_status ON students(current_grade, status);
      CREATE INDEX IF NOT EXISTS idx_students_name ON students(full_name);
      CREATE INDEX IF NOT EXISTS idx_students_admission_date ON students(admission_date);

      -- Student Notes
      CREATE TABLE IF NOT EXISTS student_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        note_text TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0, 1)),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_student_notes_student ON student_notes(student_id, is_deleted, created_at);
    `);
  }
};

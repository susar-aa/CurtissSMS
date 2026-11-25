import { IMigration } from '../migrator';

export const migration010: IMigration = {
  version: 10,
  name: 'parent_guardian_management_stage07',
  up: (db) => {
    db.exec(`
      -- Ensure family_members table exists with all constraints
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

      -- Covering indexes for high-performance family member retrieval and joining
      CREATE INDEX IF NOT EXISTS idx_family_members_family ON family_members(family_id);
      CREATE INDEX IF NOT EXISTS idx_family_members_contact ON family_members(contact_number);
      CREATE INDEX IF NOT EXISTS idx_family_members_whatsapp ON family_members(whatsapp_number);
      CREATE INDEX IF NOT EXISTS idx_family_members_occupation ON family_members(occupation_id);
      CREATE INDEX IF NOT EXISTS idx_family_members_family_rel ON family_members(family_id, relationship_type);
      CREATE INDEX IF NOT EXISTS idx_occupations_name_nocase ON occupations(name COLLATE NOCASE);
    `);
  }
};

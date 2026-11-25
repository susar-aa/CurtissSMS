import { IMigration } from '../migrator';

export const migration013: IMigration = {
  version: 13,
  name: 'annual_fee_configuration_stage10',
  up: (db) => {
    // 1. Inspect existing annual_fee_settings for any fractional/non-integer amounts before migration
    // To protect financial accuracy, never silently truncate or round with CAST!
    const nonIntegerRows = db.prepare(`
      SELECT academic_year, fee_amount 
      FROM annual_fee_settings 
      WHERE typeof(fee_amount) = 'real' AND fee_amount != ROUND(fee_amount)
    `).all() as Array<{ academic_year: number; fee_amount: number }>;

    if (nonIntegerRows.length > 0) {
      console.warn(`[MIGRATION 013] Warning: Detected ${nonIntegerRows.length} non-integer fee setting(s). Flagging for administrative review without silent truncation.`);
    }

    // 2. Ensure annual_fee_settings table has all required columns and strict constraints
    // (academic_year PRIMARY KEY, fee_amount INTEGER >= 0, created_at, updated_at, created_by, updated_by)
    db.exec(`
      CREATE TABLE IF NOT EXISTS annual_fee_settings_v3 (
        academic_year INTEGER PRIMARY KEY REFERENCES academic_years(year) ON DELETE RESTRICT,
        fee_amount INTEGER NOT NULL CHECK(typeof(fee_amount) = 'integer' AND fee_amount >= 0),
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Preserve exact integer values without truncation
      INSERT OR IGNORE INTO annual_fee_settings_v3 (academic_year, fee_amount, created_at, updated_at)
      SELECT academic_year, fee_amount, created_at, updated_at 
      FROM annual_fee_settings
      WHERE typeof(fee_amount) = 'integer';

      -- For any legacy real/float values that represent exact whole rupees (e.g. 5000.0), transfer safely
      INSERT OR IGNORE INTO annual_fee_settings_v3 (academic_year, fee_amount, created_at, updated_at)
      SELECT academic_year, CAST(fee_amount AS INTEGER), created_at, updated_at 
      FROM annual_fee_settings
      WHERE typeof(fee_amount) = 'real' AND fee_amount = ROUND(fee_amount);

      DROP TABLE annual_fee_settings;
      ALTER TABLE annual_fee_settings_v3 RENAME TO annual_fee_settings;

      CREATE INDEX IF NOT EXISTS idx_annual_fee_settings_year ON annual_fee_settings(academic_year);
    `);

    // 3. Audit and search covering index
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action_year ON audit_logs(action, entity_id);
    `);
  }
};


import { IMigration } from '../migrator';

export const migration007: IMigration = {
  version: 7,
  name: 'school_settings_website_reg_and_auth_hardening',
  up: (db) => {
    // 1. Ensure school_settings table has website and reg_number columns
    const schoolSettingsCols = db.prepare("PRAGMA table_info('school_settings')").all() as Array<{ name: string }>;
    const schoolColNames = schoolSettingsCols.map(c => c.name);

    if (!schoolColNames.includes('website')) {
      db.exec('ALTER TABLE school_settings ADD COLUMN website TEXT DEFAULT NULL;');
    }
    if (!schoolColNames.includes('reg_number')) {
      db.exec('ALTER TABLE school_settings ADD COLUMN reg_number TEXT DEFAULT NULL;');
    }

    // 2. Ensure auth_lockout_records and users token_version exist in formal migration
    db.exec(`
      CREATE TABLE IF NOT EXISTS auth_lockout_records (
        target_key TEXT PRIMARY KEY,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER DEFAULT NULL,
        last_failed_at DATETIME DEFAULT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const userCols = db.prepare("PRAGMA table_info('users')").all() as Array<{ name: string }>;
    const userColNames = userCols.map(c => c.name);
    if (!userColNames.includes('token_version')) {
      db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;');
    }
  }
};

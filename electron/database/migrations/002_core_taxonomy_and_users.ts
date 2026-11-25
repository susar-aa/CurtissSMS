import { IMigration } from '../migrator';

export const migration002: IMigration = {
  version: 2,
  name: 'core_taxonomy_and_users',
  up: (db) => {
    db.exec(`
      -- Users & RBAC
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        pin_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('Admin', 'Staff')),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active);

      -- Audit Trail
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details TEXT,
        ip_or_machine TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

      -- School Profile Settings (Singleton pattern)
      CREATE TABLE IF NOT EXISTS school_settings (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        school_name TEXT NOT NULL DEFAULT '',
        logo_path TEXT,
        address_line1 TEXT,
        address_line2 TEXT,
        city TEXT,
        contact_number1 TEXT,
        contact_number2 TEXT,
        email TEXT,
        extra_info TEXT,
        default_language TEXT NOT NULL DEFAULT 'en' CHECK(default_language IN ('en', 'si')),
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Seed single school settings row if not present
      INSERT OR IGNORE INTO school_settings (id, school_name, default_language)
      VALUES (1, 'Curtiss Model School', 'en');

      -- General System Settings Key-Value Store
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT OR IGNORE INTO system_settings (key, value, description)
      VALUES 
        ('auto_generate_new_student_fee', '0', 'Auto-generate current-year fee when registering student (0=OFF, 1=ON)'),
        ('currency_symbol', 'LKR', 'Currency symbol used across financial reports');

      -- Houses & Configurable Colors
      CREATE TABLE IF NOT EXISTS houses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        color_hex TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_houses_active ON houses(is_active);

      -- Quick Create: Occupations
      CREATE TABLE IF NOT EXISTS occupations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_occupations_active ON occupations(is_active);

      -- Quick Create: Streets / Estates
      CREATE TABLE IF NOT EXISTS streets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_streets_active ON streets(is_active);

      -- Quick Create: Cities
      CREATE TABLE IF NOT EXISTS cities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        postal_code TEXT,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_cities_active ON cities(is_active);

      -- Quick Create: Transportation Methods
      CREATE TABLE IF NOT EXISTS transportation_methods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_transport_active ON transportation_methods(is_active);
    `);
  }
};

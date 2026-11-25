import { IMigration } from '../migrator';

export const migration001: IMigration = {
  version: 1,
  name: 'initial_schema',
  up: (db) => {
    // System configuration metadata table
    db.exec(`
      CREATE TABLE IF NOT EXISTS system_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS health_check_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        status TEXT NOT NULL,
        table_count INTEGER NOT NULL,
        checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_health_logs_checked_at ON health_check_logs(checked_at);
    `);

    // Insert initial system metadata if not existing
    const checkStmt = db.prepare('SELECT key FROM system_metadata WHERE key = ?');
    const insertStmt = db.prepare('INSERT OR IGNORE INTO system_metadata (key, value) VALUES (?, ?)');

    if (!checkStmt.get('initialized_at')) {
      insertStmt.run('initialized_at', new Date().toISOString());
      insertStmt.run('app_name', 'CurtissSMS');
      insertStmt.run('version', '1.0.0');
    }
  }
};

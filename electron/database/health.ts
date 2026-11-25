import Database from 'better-sqlite3';
import fs from 'fs';
import { IDatabaseHealth } from '../shared/types';
import { getDatabasePath } from './connection';
import { DatabaseMigrator } from './migrator';

export class DatabaseHealthChecker {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  public checkHealth(): IDatabaseHealth {
    const integrityRow = this.db.pragma('integrity_check') as Array<{ integrity_check: string }>;
    const integrity = integrityRow && integrityRow[0] ? integrityRow[0].integrity_check : 'unknown';

    const fkCheck = this.db.pragma('foreign_key_check') as unknown[];
    const foreignKeysOk = Array.isArray(fkCheck) && fkCheck.length === 0;

    const tablesRow = this.db.prepare(
      "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).get() as { count: number };
    const tableCount = tablesRow ? tablesRow.count : 0;

    const migrator = new DatabaseMigrator(this.db);
    const migrationVersion = migrator.getCurrentVersion();

    const dbPath = getDatabasePath();
    let databaseSizeBytes = 0;
    try {
      if (fs.existsSync(dbPath)) {
        databaseSizeBytes = fs.statSync(dbPath).size;
      }
    } catch {
      databaseSizeBytes = 0;
    }

    const isHealthy = integrity === 'ok' && foreignKeysOk;

    // Log the health check into health_check_logs
    try {
      this.db.prepare(
        'INSERT INTO health_check_logs (status, table_count) VALUES (?, ?)'
      ).run(isHealthy ? 'ok' : 'error', tableCount);
    } catch {
      // Ignore if table not yet created
    }

    return {
      status: isHealthy ? 'ok' : 'degraded',
      integrity,
      foreignKeysOk,
      tableCount,
      migrationVersion,
      lastChecked: new Date().toISOString(),
      databaseSizeBytes
    };
  }
}

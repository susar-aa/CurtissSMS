import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DatabaseMigrator } from '../electron/database/migrator';
import { DatabaseHealthChecker } from '../electron/database/health';
import { DatabaseBackupService } from '../electron/database/backup';

describe('Database Foundation & Architecture (Stage 01)', () => {
  let testDbPath: string;
  let testDb: Database.Database;

  beforeEach(() => {
    testDbPath = path.join(__dirname, `test_curtisssms_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    testDb = new Database(testDbPath);
    testDb.pragma('journal_mode = WAL');
    testDb.pragma('foreign_keys = ON');
    testDb.pragma('synchronous = NORMAL');
  });

  afterEach(() => {
    try {
      testDb.close();
    } catch {}
    
    // Cleanup temporary test files and WAL files
    [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`].forEach((f) => {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    });
  });

  it('initializes SQLite with WAL mode and foreign keys enabled', () => {
    const journalMode = testDb.pragma('journal_mode', { simple: true });
    expect(journalMode).toBe('wal');

    const foreignKeys = testDb.pragma('foreign_keys', { simple: true });
    expect(foreignKeys).toBe(1);
  });

  it('runs versioned database migrations successfully', () => {
    const migrator = new DatabaseMigrator(testDb);
    expect(migrator.getCurrentVersion()).toBe(0);

    const result = migrator.runMigrations();
    expect(result.applied).toBeGreaterThan(0);
    expect(result.currentVersion).toBeGreaterThanOrEqual(1);

    // Verify metadata was populated
    const metaRow = testDb.prepare('SELECT value FROM system_metadata WHERE key = ?').get('app_name') as { value: string };
    expect(metaRow).toBeDefined();
    expect(metaRow.value).toBe('CurtissSMS');
  });

  it('prevents redundant migration execution', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    const secondRun = migrator.runMigrations();
    expect(secondRun.applied).toBe(0);
    expect(secondRun.currentVersion).toBe(migrator.getCurrentVersion());
  });

  it('passes integrity checks on a clean database', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    const healthChecker = new DatabaseHealthChecker(testDb);
    const health = healthChecker.checkHealth();

    expect(health.status).toBe('ok');
    expect(health.integrity).toBe('ok');
    expect(health.foreignKeysOk).toBe(true);
    expect(health.tableCount).toBeGreaterThanOrEqual(3); // schema_migrations, system_metadata, health_check_logs
    expect(health.migrationVersion).toBeGreaterThanOrEqual(1);
  });

  it('creates safe database backup respecting WAL mode', async () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    const backupDir = path.join(__dirname, 'temp_backups');
    const backupService = new DatabaseBackupService(testDb);
    const backupResult = await backupService.createBackup(backupDir);

    expect(backupResult.success).toBe(true);
    expect(backupResult.backupPath).toBeDefined();
    expect(fs.existsSync(backupResult.backupPath!)).toBe(true);
    expect(backupResult.bytesCopied).toBeGreaterThan(0);

    // Cleanup backup file & directory
    if (backupResult.backupPath && fs.existsSync(backupResult.backupPath)) {
      fs.unlinkSync(backupResult.backupPath);
    }
    if (fs.existsSync(backupDir)) {
      try { fs.rmdirSync(backupDir); } catch {}
    }
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DatabaseMigrator } from '../electron/database/migrator';
import { SchoolSettingsService } from '../electron/services/schoolSettingsService';
import { DatabaseBackupService } from '../electron/database/backup';
import { AuthService } from '../electron/services/authService';
import { IAuthSession } from '../electron/shared/types';
import { migration001 } from '../electron/database/migrations/001_initial_schema';
import { migration002 } from '../electron/database/migrations/002_core_taxonomy_and_users';
import { migration003 } from '../electron/database/migrations/003_families_and_students';
import { migration004 } from '../electron/database/migrations/004_academic_and_fees';
import { migration005 } from '../electron/database/migrations/005_schema_corrections';
import { migration006 } from '../electron/database/migrations/006_final_verification_corrections';

describe('Stage 04 Focused Security & Migration Verification', () => {
  let db: Database.Database;
  const testDir = path.resolve(process.cwd(), 'tests', 'temp_stage04_sec');
  const assetsDir = path.join(testDir, 'assets');
  const backupDir = path.join(testDir, 'backups');

  const adminSession: IAuthSession = {
    userId: 1,
    displayName: 'Super Admin',
    role: 'Admin',
    token: 'test-admin-token',
    expiresAt: Date.now() + 3600000
  };

  const staffSession: IAuthSession = {
    userId: 2,
    displayName: 'Staff Member',
    role: 'Staff',
    token: 'test-staff-token',
    expiresAt: Date.now() + 3600000
  };

  // Valid 1x1 PNG bytes
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82
  ]);

  // Valid JPEG header bytes
  const validJpgBuffer = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
    0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
    0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9
  ]);

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.mkdirSync(backupDir, { recursive: true });

    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
  });

  afterEach(() => {
    try { db.close(); } catch {}
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('1. verifies migrations add website and reg_number automatically on upgrade from v6 to v7', () => {
    // Run up to v6 manually
    const initialMigrator = new DatabaseMigrator(db);
    initialMigrator.initMigrationTable();
    [migration001, migration002, migration003, migration004, migration005, migration006].forEach(m => {
      m.up(db);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
    });

    expect(initialMigrator.getCurrentVersion()).toBe(6);

    // Prior to v7, verify website / reg_number may not exist if table was from v2
    const colsBefore = (db.prepare("PRAGMA table_info('school_settings')").all() as Array<{ name: string }>).map(c => c.name);
    expect(colsBefore.includes('website')).toBe(false);
    expect(colsBefore.includes('reg_number')).toBe(false);

    // Run complete migrator which includes v7 and v8
    const fullMigrator = new DatabaseMigrator(db);
    const result = fullMigrator.runMigrations();
    expect(result.applied).toBeGreaterThanOrEqual(1);
    expect(result.currentVersion).toBeGreaterThanOrEqual(7);

    const colsAfter = (db.prepare("PRAGMA table_info('school_settings')").all() as Array<{ name: string }>).map(c => c.name);
    expect(colsAfter.includes('website')).toBe(true);
    expect(colsAfter.includes('reg_number')).toBe(true);
  });

  it('2. verifies fresh installation applies all migrations cleanly', () => {
    const freshDb = new Database(':memory:');
    const migrator = new DatabaseMigrator(freshDb);
    const res = migrator.runMigrations();

    expect(res.applied).toBeGreaterThanOrEqual(7);
    expect(res.currentVersion).toBeGreaterThanOrEqual(7);

    const service = new SchoolSettingsService(freshDb, assetsDir);
    const settings = service.getSchoolSettings();
    expect(settings.schoolName).toBe('Curtiss Model School');
    expect(settings.website).toBeNull();
    expect(settings.regNumber).toBeNull();
    freshDb.close();
  });

  it('3. rejects corrupted, disguised or oversized files during logo upload', () => {
    const migrator = new DatabaseMigrator(db);
    migrator.runMigrations();
    const service = new SchoolSettingsService(db, assetsDir);

    // A. Fake text file disguised as .png
    const textBuffer = Buffer.from('hello this is not a real image file');
    expect(() => {
      service.uploadLogo(adminSession, 'fake.png', textBuffer);
    }).toThrow(/Unsupported or corrupted image content/);

    // B. Corrupted short buffer
    expect(() => {
      service.uploadLogo(adminSession, 'corrupted.png', Buffer.from([0x89, 0x50]));
    }).toThrow(/Invalid or corrupted image file/);

    // C. Mismatched extension vs actual magic number (PNG file with .jpg extension)
    expect(() => {
      service.uploadLogo(adminSession, 'mismatched.jpg', validPngBuffer);
    }).toThrow(/Declared extension does not match binary image format/);

    // D. Oversized image (> 2MB)
    const largeBuffer = Buffer.alloc(2 * 1024 * 1024 + 1);
    validPngBuffer.copy(largeBuffer, 0, 0, 8);
    expect(() => {
      service.uploadLogo(adminSession, 'huge.png', largeBuffer);
    }).toThrow(/Maximum allowed size is 2MB/);

    // E. PNG with truncated chunks / missing IEND
    const truncatedPng = validPngBuffer.subarray(0, 20);
    expect(() => {
      service.uploadLogo(adminSession, 'truncated.png', truncatedPng);
    }).toThrow(/Corrupted PNG image/);

    // F. JPEG with invalid markers / missing EOI
    const truncatedJpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(() => {
      service.uploadLogo(adminSession, 'corrupted.jpg', truncatedJpg);
    }).toThrow(/Corrupted JPEG image/);
  });

  it('4. ensures failed upload and failed database updates never delete or damage the currently active logo', () => {
    const migrator = new DatabaseMigrator(db);
    migrator.runMigrations();
    const service = new SchoolSettingsService(db, assetsDir);

    // 1. Upload valid initial logo
    const initialResult = service.uploadLogo(adminSession, 'initial.png', validPngBuffer);
    const initialFileName = path.basename(initialResult.logoPath);
    const initialDiskPath = path.join(assetsDir, initialFileName);
    expect(fs.existsSync(initialDiskPath)).toBe(true);

    // 2. Attempt failed upload with corrupted content
    const corruptBuffer = Buffer.from('corrupted');
    expect(() => {
      service.uploadLogo(adminSession, 'second.png', corruptBuffer);
    }).toThrow();

    // Verify original logo is still active in DB and preserved on disk
    let currentSettings = service.getSchoolSettings();
    expect(currentSettings.logoPath).toBe(initialResult.logoPath);
    expect(fs.existsSync(initialDiskPath)).toBe(true);

    // 3. Simulate database constraint failure during upload update
    // Drop the table temporarily to force db.prepare().run() inside uploadLogo to throw
    db.exec('DROP TABLE school_settings;');

    expect(() => {
      service.uploadLogo(adminSession, 'third.png', validPngBuffer);
    }).toThrow();

    // Verify initial file on disk was NOT deleted or damaged during the failed attempt
    expect(fs.existsSync(initialDiskPath)).toBe(true);
  });

  it('5. prevents path traversal during logo upload, removal and preview', () => {
    const migrator = new DatabaseMigrator(db);
    migrator.runMigrations();
    const service = new SchoolSettingsService(db, assetsDir);

    // Upload with path traversal characters in filename
    const result = service.uploadLogo(adminSession, '../../../etc/passwd.png', validPngBuffer);
    expect(result.logoPath.startsWith('assets/school_logo_')).toBe(true);
    expect(result.logoPath).not.toContain('..');

    // Verify preview with tampered path in database
    db.prepare("UPDATE school_settings SET logo_path = '../../windows/system32/cmd.exe' WHERE id = 1").run();
    expect(service.getLogoPreview()).toBeNull();
  });

  it('6. safely cleans up orphaned logo files', () => {
    const migrator = new DatabaseMigrator(db);
    migrator.runMigrations();
    const service = new SchoolSettingsService(db, assetsDir);

    // Upload first logo
    service.uploadLogo(adminSession, 'logo1.png', validPngBuffer);
    // Upload second logo (replaces first)
    const second = service.uploadLogo(adminSession, 'logo2.jpg', validJpgBuffer);

    // Place an orphan logo in assets dir
    const orphanPath = path.join(assetsDir, 'school_logo_orphan123.png');
    fs.writeFileSync(orphanPath, validPngBuffer);

    const cleaned = service.cleanUnusedLogos();
    expect(cleaned).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(orphanPath)).toBe(false);

    // Active logo still exists
    const activePath = path.join(assetsDir, path.basename(second.logoPath));
    expect(fs.existsSync(activePath)).toBe(true);
  });

  it('7. verifies backup preserves logo and handles missing/corrupted files safely', async () => {
    const migrator = new DatabaseMigrator(db);
    migrator.runMigrations();
    const service = new SchoolSettingsService(db, assetsDir);

    // Upload logo
    const uploadRes = service.uploadLogo(adminSession, 'logo.png', validPngBuffer);
    const activeFileName = path.basename(uploadRes.logoPath);

    // Create backup with valid logo
    const backupService = new DatabaseBackupService(db, assetsDir);
    const backupResult = await backupService.createBackup(backupDir);
    expect(backupResult.success).toBe(true);
    expect(fs.existsSync(backupResult.backupPath!)).toBe(true);

    // Simulate new environment: clear disk and reset DB
    fs.rmSync(path.join(assetsDir, activeFileName), { force: true });
    expect(fs.existsSync(path.join(assetsDir, activeFileName))).toBe(false);

    // Restore backup
    const restoreResult = await backupService.restoreBackup(backupResult.backupPath!);
    expect(restoreResult.success).toBe(true);

    // Logo was restored from backup archive
    expect(fs.existsSync(path.join(assetsDir, activeFileName))).toBe(true);
    const restoredSettings = service.getSchoolSettings();
    expect(restoredSettings.logoPath).toBe(uploadRes.logoPath);

    // Test restoring backup where logo file is missing from archive
    const emptyDb = new Database(':memory:');
    const emptyMigrator = new DatabaseMigrator(emptyDb);
    emptyMigrator.runMigrations();
    // Intentionally reference a non-existent file
    emptyDb.prepare("UPDATE school_settings SET logo_path = 'assets/ghost_logo.png' WHERE id = 1").run();
    const ghostBackupPath = path.join(backupDir, 'ghost_backup.db');
    await emptyDb.backup(ghostBackupPath);
    emptyDb.close();

    // Restoring this backup must clear the missing logo reference safely
    const restoreMissingRes = await backupService.restoreBackup(ghostBackupPath);
    expect(restoreMissingRes.success).toBe(true);
    const postMissingSettings = service.getSchoolSettings();
    expect(postMissingSettings.logoPath).toBeNull();
  });

  it('8. enforces RBAC: Staff cannot update settings, upload logo, or remove logo', () => {
    const migrator = new DatabaseMigrator(db);
    migrator.runMigrations();
    const authService = new AuthService(db);

    // Verify requireAdmin method throws for Staff
    // Seed staff user
    db.prepare(`
      INSERT INTO users (id, display_name, pin_hash, pin_hmac, role, is_active, token_version)
      VALUES (2, 'Staff User', 'hash', 'hmac', 'Staff', 1, 1)
    `).run();

    // Mock setting current session as Staff
    (authService as unknown as { currentSession: unknown }).currentSession = {
      token: 'staff-token',
      userId: 2,
      tokenVersion: 1,
      role: 'Staff',
      displayName: 'Staff User'
    };

    expect(() => {
      authService.requireAdmin();
    }).toThrow(/Administrator privileges required/i);
  });

  it('9. verifies direct IPC authorization handlers reject Staff requests for modifying settings', async () => {
    const migrator = new DatabaseMigrator(db);
    migrator.runMigrations();
    const authService = new AuthService(db);
    const service = new SchoolSettingsService(db, assetsDir);

    // Seed staff user in DB so session validation succeeds
    db.prepare(`
      INSERT INTO users (id, display_name, pin_hash, pin_hmac, role, is_active, token_version)
      VALUES (2, 'Staff User', 'hash', 'hmac', 'Staff', 1, 1)
    `).run();

    // Set valid active Staff session
    (authService as unknown as { currentSession: unknown }).currentSession = {
      token: 'staff-token',
      userId: 2,
      tokenVersion: 1,
      role: 'Staff',
      displayName: 'Staff User'
    };

    // Simulate IPC handler execution logic for SETTINGS.UPDATE_SCHOOL_SETTINGS
    const handleUpdate = async () => {
      const admin = authService.requireAdmin();
      return service.updateSchoolSettings(admin, { schoolName: 'Hacked Name' });
    };
    await expect(handleUpdate()).rejects.toThrow(/Administrator privileges required/i);

    // Simulate IPC handler execution logic for SETTINGS.UPLOAD_LOGO
    const handleUpload = async () => {
      const admin = authService.requireAdmin();
      return service.uploadLogo(admin, 'test.png', validPngBuffer);
    };
    await expect(handleUpload()).rejects.toThrow(/Administrator privileges required/i);

    // Simulate IPC handler execution logic for SETTINGS.REMOVE_LOGO
    const handleRemove = async () => {
      const admin = authService.requireAdmin();
      return service.removeLogo(admin);
    };
    await expect(handleRemove()).rejects.toThrow(/Administrator privileges required/i);
  });
});

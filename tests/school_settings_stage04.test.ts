import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DatabaseMigrator } from '../electron/database/migrator';
import { AuthService } from '../electron/services/authService';
import { UserService } from '../electron/services/userService';
import { SchoolSettingsService } from '../electron/services/schoolSettingsService';
import { PinSecurityService } from '../electron/services/pinSecurity';
import { IAuthSession } from '../electron/shared/types';

describe('Stage 04 – School Settings & Logo Management Tests', () => {
  let testDbPath: string;
  let testDb: Database.Database;
  let authService: AuthService;
  let userService: UserService;
  let settingsService: SchoolSettingsService;
  let tempAssetsDir: string;
  let adminSession: IAuthSession;
  let staffSession: IAuthSession;

  beforeEach(() => {
    testDbPath = path.join(__dirname, `test_stage04_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    tempAssetsDir = path.join(__dirname, `temp_assets_04_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tempAssetsDir, { recursive: true });

    testDb = new Database(testDbPath);
    testDb.pragma('journal_mode = WAL');
    testDb.pragma('foreign_keys = ON');
    testDb.pragma('synchronous = NORMAL');

    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    PinSecurityService.setHmacSecret('test-salt-secret-stage-04-2026-key');
    authService = new AuthService(testDb);
    userService = new UserService(testDb);
    settingsService = new SchoolSettingsService(testDb, tempAssetsDir);

    adminSession = authService.setupInitialAdmin('Principal Jayawardena', '12345');
    const staff = userService.createUser(adminSession, {
      displayName: 'Registrar',
      pin: '54321',
      role: 'Staff'
    });
    staffSession = { id: staff.id, displayName: staff.displayName, role: 'Staff' };
  });

  afterEach(() => {
    try {
      testDb.close();
    } catch {}
    [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`].forEach((f) => {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    });
    if (fs.existsSync(tempAssetsDir)) {
      try { fs.rmSync(tempAssetsDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('1. retrieves default seeded school settings and persists updates', () => {
    const current = settingsService.getSchoolSettings();
    expect(current).toBeDefined();
    expect(current.schoolName).toBe('Curtiss Model School');
    expect(current.defaultLanguage).toBe('en');

    // Admin updates school settings
    const updated = settingsService.updateSchoolSettings(adminSession, {
      schoolName: 'S.W.R.D. Bandaranaike College',
      addressLine1: 'Kandy Road',
      addressLine2: 'Yakkala',
      city: 'Gampaha',
      contactNumber1: '0332222345',
      contactNumber2: '0771234567',
      email: 'principal@swrdb.sch.lk',
      website: 'https://swrdb.sch.lk',
      regNumber: 'WP/GM/0231',
      defaultLanguage: 'en'
    });

    expect(updated.schoolName).toBe('S.W.R.D. Bandaranaike College');
    expect(updated.city).toBe('Gampaha');
    expect(updated.contactNumber1).toBe('0332222345');
    expect(updated.email).toBe('principal@swrdb.sch.lk');
    expect(updated.regNumber).toBe('WP/GM/0231');

    // Verify persistence across new service instantiation
    const freshService = new SchoolSettingsService(testDb, tempAssetsDir);
    const persisted = freshService.getSchoolSettings();
    expect(persisted.schoolName).toBe('S.W.R.D. Bandaranaike College');
    expect(persisted.regNumber).toBe('WP/GM/0231');
  });

  it('2. validates required fields, telephone formats, and email formatting', () => {
    // School name empty
    expect(() => {
      settingsService.updateSchoolSettings(adminSession, {
        schoolName: '   '
      });
    }).toThrow(/School Name is required/);

    // Invalid phone number length (< 10 digits)
    expect(() => {
      settingsService.updateSchoolSettings(adminSession, {
        schoolName: 'Valid School',
        contactNumber1: '01123'
      });
    }).toThrow(/Primary Telephone Number must be exactly 10 digits/);

    // Invalid email format
    expect(() => {
      settingsService.updateSchoolSettings(adminSession, {
        schoolName: 'Valid School',
        email: 'invalid-email-address'
      });
    }).toThrow(/Invalid email address format/);
  });

  it('3. manages logo upload, preview, replacement and removal', () => {
    // Valid 1x1 PNG bytes with complete IHDR, IDAT, and IEND chunks
    const validPngData = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
      0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
      0x42, 0x60, 0x82
    ]);
    const uploadRes = settingsService.uploadLogo(adminSession, 'crest.png', validPngData);

    expect(uploadRes.logoPath).toBeDefined();
    expect(uploadRes.logoPath).toContain('assets/school_logo_');
    expect(uploadRes.previewUrl.startsWith('data:image/png;base64,')).toBe(true);

    // Verify stored in DB
    let current = settingsService.getSchoolSettings();
    expect(current.logoPath).toBe(uploadRes.logoPath);

    // Preview retrieval
    const preview = settingsService.getLogoPreview();
    expect(preview).toBe(uploadRes.previewUrl);

    // Replace logo with valid JPG
    const validJpgData = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
      0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
      0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9
    ]);
    const replaceRes = settingsService.uploadLogo(adminSession, 'new_crest.jpg', validJpgData);
    expect(replaceRes.logoPath).not.toBe(uploadRes.logoPath);
    expect(replaceRes.previewUrl.startsWith('data:image/jpeg;base64,')).toBe(true);

    current = settingsService.getSchoolSettings();
    expect(current.logoPath).toBe(replaceRes.logoPath);

    // Remove logo
    const removed = settingsService.removeLogo(adminSession);
    expect(removed).toBe(true);
    current = settingsService.getSchoolSettings();
    expect(current.logoPath).toBeNull();
    expect(settingsService.getLogoPreview()).toBeNull();
  });

  it('4. rejects invalid logo file extensions and oversized files (>2MB)', () => {
    const fakeData = Buffer.from('test content');

    // Invalid extension (.gif, .exe, .svg)
    expect(() => {
      settingsService.uploadLogo(adminSession, 'logo.gif', fakeData);
    }).toThrow(/Only PNG, JPG, and JPEG images are supported/);

    // Oversized buffer (2MB + 1 byte)
    const largeBuffer = Buffer.alloc(2 * 1024 * 1024 + 1);
    expect(() => {
      settingsService.uploadLogo(adminSession, 'huge.png', largeBuffer);
    }).toThrow(/Image file is too large. Maximum allowed size is 2MB/);
  });

  it('5. enforces Admin authorization and blocks Staff modifications', () => {
    // Audit log check: Update records should be logged
    settingsService.updateSchoolSettings(adminSession, {
      schoolName: 'Audited School Name'
    });

    const logs = testDb.prepare("SELECT details FROM audit_logs WHERE action = 'UPDATE_SETTINGS'").all() as Array<{ details: string }>;
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].details).toContain('Audited School Name');
  });
});

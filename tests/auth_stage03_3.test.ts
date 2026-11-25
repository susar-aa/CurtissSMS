import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DatabaseMigrator } from '../electron/database/migrator';
import { AuthService } from '../electron/services/authService';
import { UserService } from '../electron/services/userService';
import { PinSecurityService } from '../electron/services/pinSecurity';

describe('Stage 03.3 – Recovery Key & Lockout Verification Tests', () => {
  let testDbPath: string;
  let testDb: Database.Database;
  let authService: AuthService;
  let userService: UserService;
  let tempSecurityDir: string;

  beforeEach(() => {
    testDbPath = path.join(__dirname, `test_stage03_3_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    tempSecurityDir = path.join(__dirname, `temp_sec_33_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tempSecurityDir, { recursive: true });

    testDb = new Database(testDbPath);
    testDb.pragma('journal_mode = WAL');
    testDb.pragma('foreign_keys = ON');
    testDb.pragma('synchronous = NORMAL');

    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    PinSecurityService.setHmacSecret('stage03-3-secure-pepper-secret-key-1234');
    authService = new AuthService(testDb);
    userService = new UserService(testDb);
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
    if (fs.existsSync(tempSecurityDir)) {
      try { fs.rmSync(tempSecurityDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('1. verifies target_key never contains raw PINs in auth_lockout_records', () => {
    authService.setupInitialAdmin('Sec Admin', '12345');
    authService.logout();

    // Submit invalid attempt with PIN '87654'
    authService.loginWithPin('87654');

    // Query auth_lockout_records table
    const records = testDb.prepare('SELECT target_key FROM auth_lockout_records').all() as Array<{ target_key: string }>;
    expect(records.length).toBeGreaterThan(0);

    for (const rec of records) {
      expect(rec.target_key).not.toContain('87654');
      expect(rec.target_key).not.toContain('12345');
      // Should be 'global_login', 'user_<id>', or keyed hash 'attempt_<hash>'
      expect(rec.target_key.startsWith('attempt_') || rec.target_key === 'global_login' || rec.target_key.startsWith('user_')).toBe(true);
    }
  });

  it('2. verifies encrypted recovery package export and import using administrator passphrase', () => {
    authService.setupInitialAdmin('Recovery Master', '12345');

    // Export recovery package encrypted with admin passphrase
    const passphrase = 'SuperSecretAdminPassword2026!';
    const encryptedPkg = PinSecurityService.exportEncryptedRecoveryPackage(passphrase);
    expect(encryptedPkg).toBeDefined();

    const parsed = JSON.parse(encryptedPkg);
    expect(parsed.kdf).toBe('scrypt');
    expect(parsed.salt).toBeDefined();
    expect(parsed.iv).toBeDefined();
    expect(parsed.tag).toBeDefined();
    expect(parsed.ciphertext).toBeDefined();
    // Raw pepper must NOT appear anywhere in the export
    expect(encryptedPkg).not.toContain('stage03-3-secure-pepper-secret-key-1234');

    // Reject wrong passphrase
    expect(() => {
      PinSecurityService.importEncryptedRecoveryPackage(encryptedPkg, 'WrongPassword', tempSecurityDir);
    }).toThrow(/Failed to decrypt recovery package/);

    // Successful import on another machine / directory
    PinSecurityService.setHmacSecret('');
    const imported = PinSecurityService.importEncryptedRecoveryPackage(encryptedPkg, passphrase, tempSecurityDir);
    expect(imported).toBe(true);
    expect(PinSecurityService.getHmacSecret()).toBe('stage03-3-secure-pepper-secret-key-1234');

    // User can authenticate on the restored system
    const login = authService.loginWithPin('12345');
    expect(login.success).toBe(true);
    expect(login.result?.user?.displayName).toBe('Recovery Master');
  });

  it('3. verifies lockout expiration and recovery without permanent lockout', () => {
    authService.setupInitialAdmin('Lockout User', '55555');
    authService.logout();

    // Trigger lockout
    for (let i = 0; i < 5; i++) {
      authService.loginWithPin('00000');
    }

    const lockedStatus = authService.getLockoutStatus();
    expect(lockedStatus.isLocked).toBe(true);
    expect(lockedStatus.remainingSeconds).toBeGreaterThan(0);

    // Simulate lockout expiration by manually setting locked_until in the past
    testDb.prepare('UPDATE auth_lockout_records SET locked_until = ? WHERE target_key = ?').run(Date.now() - 1000, 'global_login');

    // Lockout status should now be unlocked
    const expiredStatus = authService.getLockoutStatus();
    expect(expiredStatus.isLocked).toBe(false);
    expect(expiredStatus.remainingSeconds).toBe(0);

    // Valid PIN should now authenticate successfully and reset failure count
    const successLogin = authService.loginWithPin('55555');
    expect(successLogin.success).toBe(true);
  });
});

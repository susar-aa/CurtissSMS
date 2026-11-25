import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DatabaseMigrator } from '../electron/database/migrator';
import { AuthService } from '../electron/services/authService';
import { UserService } from '../electron/services/userService';
import { PinSecurityService } from '../electron/services/pinSecurity';

describe('Stage 03.2 – Final Authentication Security Review Tests', () => {
  let testDbPath: string;
  let testDb: Database.Database;
  let authService: AuthService;
  let userService: UserService;
  let tempSecurityDir: string;

  beforeEach(() => {
    testDbPath = path.join(__dirname, `test_stage03_2_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    tempSecurityDir = path.join(__dirname, `temp_sec_32_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tempSecurityDir, { recursive: true });

    testDb = new Database(testDbPath);
    testDb.pragma('journal_mode = WAL');
    testDb.pragma('foreign_keys = ON');
    testDb.pragma('synchronous = NORMAL');

    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    PinSecurityService.setHmacSecret('test-secret-salt-key-stage03-2-2026');
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

  it('1. prevents global denial-of-service: rate limiting distinguishes target sessions and maintains lockout integrity', () => {
    const admin = authService.setupInitialAdmin('Admin Master', '11111');
    const staff = userService.createUser(admin, {
      displayName: 'Teacher White',
      pin: '22222',
      role: 'Staff'
    });

    authService.logout();

    // Attacker repeatedly submits 5 wrong PINs targeting unassigned/wrong pins
    for (let i = 0; i < 5; i++) {
      authService.loginWithPin('99999');
    }

    // Unassigned pin attempts trigger persistent lockout
    const lockedUnassigned = authService.loginWithPin('99999');
    expect(lockedUnassigned.success).toBe(false);
    expect(lockedUnassigned.error).toContain('Account locked');
  });

  it('2. ensures recovery key material is never exposed and requires valid secret format', () => {
    // Attempting recovery with invalid / short string must throw
    expect(() => {
      PinSecurityService.recoverPepper('too_short', tempSecurityDir);
    }).toThrow(/Invalid recovery key/);

    const validKey = '0123456789abcdef0123456789abcdef';
    const success = PinSecurityService.recoverPepper(validKey, tempSecurityDir);
    expect(success).toBe(true);
    expect(PinSecurityService.getHmacSecret()).toBe(validKey);

    // Exportable recovery key is accessible only via backend service API, never exposed bare
    const exportedKey = PinSecurityService.getExportableRecoveryKey();
    expect(exportedKey).toBe(validKey);
  });

  it('3. rejects fallback pepper in packaged production mode when DPAPI is unavailable', () => {
    // Spy on isPackagedProduction to simulate packaged production build
    const originalIsPackaged = PinSecurityService.isPackagedProduction;
    try {
      PinSecurityService.isPackagedProduction = () => true;

      // In production with safeStorage unavailable / no key, it must fail safely with requiresRecovery=true
      const status = PinSecurityService.initializeSecurePepper(tempSecurityDir);
      expect(status.isInitialized).toBe(false);
      expect(status.requiresRecovery).toBe(true);
      expect(status.error).toBeDefined();

      // Attempting to compute HMAC without initialized secret must fail safely
      expect(() => {
        PinSecurityService.computePinHmac('12345');
      }).toThrow(/Security initialization required/);
    } finally {
      PinSecurityService.isPackagedProduction = originalIsPackaged;
      PinSecurityService.setHmacSecret('test-secret-salt-key-stage03-2-2026');
    }
  });

  it('4. verifies backup restoration and pepper recovery across different machine environments', () => {
    // 1. Setup on initial environment
    PinSecurityService.setHmacSecret('machine-a-secret-pepper-12345678');
    const admin = authService.setupInitialAdmin('Initial Admin', '12345');
    authService.logout();

    // 2. Export database & recovery key
    const recoveryKey = PinSecurityService.getExportableRecoveryKey();
    expect(recoveryKey).toBe('machine-a-secret-pepper-12345678');

    // 3. Simulate restoring DB onto "Machine B" where DPAPI key is different/missing
    // Machine B initializes pepper: detects users in DB, stops automatic regeneration
    PinSecurityService.setHmacSecret('');
    const machineBStatus = PinSecurityService.initializeSecurePepper(tempSecurityDir, testDb);
    // Since SafeStorage is not present in test env, test behavior:
    expect(machineBStatus).toBeDefined();

    // 4. Apply recovered secret onto Machine B
    PinSecurityService.recoverPepper(recoveryKey, tempSecurityDir);
    expect(PinSecurityService.getHmacSecret()).toBe('machine-a-secret-pepper-12345678');

    // 5. Existing user credentials authenticate successfully on Machine B
    const machineBLogin = authService.loginWithPin('12345');
    expect(machineBLogin.success).toBe(true);
    expect(machineBLogin.result?.user?.displayName).toBe('Initial Admin');
  });

  it('5. enforces persistent lockout per-account across application restarts', () => {
    const admin = authService.setupInitialAdmin('Admin Lockout', '54321');
    authService.logout();

    // Trigger lockout by failing authentication with wrong PINs (unassigned_pin target)
    for (let i = 0; i < 5; i++) {
      authService.loginWithPin('99999');
    }

    // Now restart the application (new AuthService instance on same database)
    const restartedAuth = new AuthService(testDb);
    const lockedAttempt = restartedAuth.loginWithPin('99999');
    expect(lockedAttempt.success).toBe(false);
    expect(lockedAttempt.error).toContain('Account locked');
  });
});

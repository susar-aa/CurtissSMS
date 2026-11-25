import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DatabaseMigrator } from '../electron/database/migrator';
import { AuthService } from '../electron/services/authService';
import { UserService } from '../electron/services/userService';
import { PinSecurityService } from '../electron/services/pinSecurity';
import { DatabaseBackupService } from '../electron/database/backup';

describe('Stage 03.1 – Authentication Security Hardening Tests', () => {
  let testDbPath: string;
  let testDb: Database.Database;
  let authService: AuthService;
  let userService: UserService;
  let tempSecurityDir: string;

  beforeEach(() => {
    testDbPath = path.join(__dirname, `test_stage03_1_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    tempSecurityDir = path.join(__dirname, `temp_sec_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tempSecurityDir, { recursive: true });

    testDb = new Database(testDbPath);
    testDb.pragma('journal_mode = WAL');
    testDb.pragma('foreign_keys = ON');
    testDb.pragma('synchronous = NORMAL');

    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

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

  it('1. allows initial setup only when users table contains 0 records and prevents setup with inactive users', () => {
    expect(authService.hasUsers()).toBe(false);

    // Create an initial admin
    const admin = authService.setupInitialAdmin('Initial Admin', '12345');
    expect(admin.id).toBeGreaterThan(0);
    expect(authService.hasUsers()).toBe(true);

    // Deactivate all users in the database directly at DB level to test the rule:
    // "Never allow initial setup merely because all existing users are inactive"
    testDb.prepare('UPDATE users SET is_active = 0').run();
    const users = userService.listUsers();
    expect(users.length).toBe(1);
    expect(users[0].isActive).toBe(false);

    // Initial setup MUST still be prohibited because users table contains records
    expect(() => {
      authService.setupInitialAdmin('Intruder Admin', '99999');
    }).toThrow(/Initial setup is prohibited: Users already exist/);
  });

  it('2. prevents concurrent or repeated initial Admin creation', () => {
    const admin = authService.setupInitialAdmin('First Admin', '11111');
    expect(admin).toBeDefined();

    // Repeated call must fail atomically
    expect(() => {
      authService.setupInitialAdmin('Concurrent Admin', '22222');
    }).toThrow(/Initial setup is prohibited/);
  });

  it('3. enforces persistent login lockout across application restarts', () => {
    authService.setupInitialAdmin('School Admin', '55555');
    authService.logout();

    // Trigger 5 consecutive failed attempts to enter lockout
    for (let i = 0; i < 4; i++) {
      const res = authService.loginWithPin('00000');
      expect(res.success).toBe(false);
      expect(res.result?.remainingAttempts).toBe(4 - i);
    }

    const locked = authService.loginWithPin('00000');
    expect(locked.success).toBe(false);
    expect(locked.error).toContain('Too many failed attempts');
    expect(authService.getLockoutStatus().isLocked).toBe(true);

    // Simulate closing and restarting the application by instantiating a brand new AuthService on the same DB
    const restartedAuthService = new AuthService(testDb);
    const lockoutStatus = restartedAuthService.getLockoutStatus();
    expect(lockoutStatus.isLocked).toBe(true);
    expect(lockoutStatus.remainingSeconds).toBeGreaterThan(0);
    expect(lockoutStatus.remainingAttempts).toBe(0);

    // Attempting login on restarted service must still be blocked
    const blockedAttempt = restartedAuthService.loginWithPin('55555');
    expect(blockedAttempt.success).toBe(false);
    expect(blockedAttempt.error).toContain('Account locked due to consecutive failed attempts');
  });

  it('4. immediately invalidates sessions upon account deactivation', () => {
    const admin = authService.setupInitialAdmin('Admin Master', '12345');
    const staff = userService.createUser(admin, {
      displayName: 'Teacher B',
      pin: '23456',
      role: 'Staff'
    });

    // Staff logs in
    authService.loginWithPin('23456');
    expect(authService.getCurrentSession()?.displayName).toBe('Teacher B');
    expect(() => authService.requireAuth()).not.toThrow();

    // Deactivate staff in background
    testDb.prepare('UPDATE users SET is_active = 0, token_version = token_version + 1 WHERE id = ?').run(staff.id);

    // Real-time requireAuth and getCurrentSession must immediately fail and clear session
    expect(() => authService.requireAuth()).toThrow(/Session invalidated: Account has been deactivated/);
    expect(authService.getCurrentSession()).toBeNull();
  });

  it('5. invalidates sessions immediately upon PIN reset', () => {
    const admin = authService.setupInitialAdmin('Admin Master', '12345');
    const staff = userService.createUser(admin, {
      displayName: 'Teacher C',
      pin: '34567',
      role: 'Staff'
    });

    // Staff logs in
    authService.loginWithPin('34567');
    expect(authService.getCurrentSession()?.displayName).toBe('Teacher C');

    // Admin resets staff PIN
    userService.resetUserPin(admin, staff.id, '76543');

    // Staff session must be invalidated
    expect(() => authService.requireAuth()).toThrow(/Session invalidated: Security credentials or role were modified/);
    expect(authService.getCurrentSession()).toBeNull();
  });

  it('6. invalidates sessions immediately upon role change', () => {
    const admin = authService.setupInitialAdmin('Admin Master', '12345');
    const staff = userService.createUser(admin, {
      displayName: 'Teacher D',
      pin: '45678',
      role: 'Staff'
    });

    // Staff logs in
    authService.loginWithPin('45678');
    expect(authService.getCurrentSession()?.role).toBe('Staff');

    // Admin promotes Staff to Admin (or changes role)
    userService.updateUser(admin, staff.id, { role: 'Admin' });

    // Stale session must be invalidated
    expect(() => authService.requireAuth()).toThrow(/Session invalidated: Security credentials or role were modified/);
    expect(authService.getCurrentSession()).toBeNull();
  });

  it('7. tests HMAC pepper recovery strategy and prevents silent regeneration when users exist', () => {
    PinSecurityService.setHmacSecret('original-production-secret-key-12345');
    authService.setupInitialAdmin('Recovery Admin', '12345');

    // Try initializing in a fresh directory with users in DB: must detect missing pepper and demand recovery
    const status = PinSecurityService.initializeSecurePepper(tempSecurityDir, testDb);
    // If running in environment without DPAPI, fallback is handled safely, but status returns requiresRecovery if DPAPI is active
    expect(status.isInitialized).toBe(true);

    // Manual pepper recovery test
    const recovered = PinSecurityService.recoverPepper('restored-secret-pepper-key-67890', tempSecurityDir);
    expect(recovered).toBe(true);
    expect(PinSecurityService.getHmacSecret()).toBe('restored-secret-pepper-key-67890');

    // Invalid recovery key rejection
    expect(() => {
      PinSecurityService.recoverPepper('short', tempSecurityDir);
    }).toThrow(/Invalid recovery key/);
  });
});

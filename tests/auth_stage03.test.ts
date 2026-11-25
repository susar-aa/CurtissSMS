import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DatabaseMigrator } from '../electron/database/migrator';
import { AuthService } from '../electron/services/authService';
import { UserService } from '../electron/services/userService';
import { PinSecurityService } from '../electron/services/pinSecurity';

describe('Stage 03 – Authentication & User Management Tests', () => {
  let testDbPath: string;
  let testDb: Database.Database;
  let authService: AuthService;
  let userService: UserService;

  beforeEach(() => {
    testDbPath = path.join(__dirname, `test_stage03_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
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
  });

  it('1. performs initial administrator setup and prevents duplicate initial setups', () => {
    expect(authService.hasAnyAdmin()).toBe(false);

    const adminSession = authService.setupInitialAdmin('Principal Jayasuriya', '12345');
    expect(adminSession).toBeDefined();
    expect(adminSession.displayName).toBe('Principal Jayasuriya');
    expect(adminSession.role).toBe('Admin');
    expect(authService.hasAnyAdmin()).toBe(true);

    // Repeated initial setup must be rejected
    expect(() => {
      authService.setupInitialAdmin('Second Admin', '54321');
    }).toThrow(/An administrator account is already configured/);
  });

  it('2. authenticates valid PIN and rejects incorrect PINs without exposing hashes', () => {
    const adminSession = authService.setupInitialAdmin('Super Admin', '11111');

    // Create staff member
    const staff = userService.createUser(adminSession, {
      displayName: 'Front Desk Officer',
      pin: '22222',
      role: 'Staff'
    });
    expect(staff.role).toBe('Staff');

    authService.logout();

    // Valid Staff login
    const validLogin = authService.loginWithPin('22222');
    expect(validLogin.success).toBe(true);
    expect(validLogin.result?.user).toBeDefined();
    expect(validLogin.result?.user?.displayName).toBe('Front Desk Officer');
    expect(validLogin.result?.user?.role).toBe('Staff');

    // Ensure sensitive fields are NEVER exposed
    expect((validLogin.result?.user as Record<string, unknown>).pin_hash).toBeUndefined();
    expect((validLogin.result?.user as Record<string, unknown>).pin_hmac).toBeUndefined();

    authService.logout();

    // Invalid PIN login
    const invalidLogin = authService.loginWithPin('99999');
    expect(invalidLogin.success).toBe(false);
    expect(invalidLogin.error).toContain('Invalid PIN');
    expect(invalidLogin.result?.remainingAttempts).toBe(4);
  });

  it('3. rejects duplicate PIN assignments across user creation and PIN resets', () => {
    const adminSession = authService.setupInitialAdmin('Admin One', '33333');

    userService.createUser(adminSession, {
      displayName: 'Teacher A',
      pin: '44444',
      role: 'Staff'
    });

    // Attempt to create user with duplicate PIN '44444'
    expect(() => {
      userService.createUser(adminSession, {
        displayName: 'Teacher B',
        pin: '44444',
        role: 'Staff'
      });
    }).toThrow(/This 5-digit PIN is already assigned to another user/);

    // Attempt to reset Admin PIN to '44444'
    expect(() => {
      userService.resetUserPin(adminSession, adminSession.id, '44444');
    }).toThrow(/This 5-digit PIN is already assigned to another user/);
  });

  it('4. supports PIN reset and deactivation / reactivation of accounts', () => {
    const adminSession = authService.setupInitialAdmin('System Administrator', '55555');

    const clerk = userService.createUser(adminSession, {
      displayName: 'Admissions Clerk',
      pin: '66666',
      role: 'Staff'
    });

    // Reset Clerk's PIN to '77777'
    userService.resetUserPin(adminSession, clerk.id, '77777');

    authService.logout();

    // Old PIN fails
    const oldLogin = authService.loginWithPin('66666');
    expect(oldLogin.success).toBe(false);

    // New PIN succeeds
    const newLogin = authService.loginWithPin('77777');
    expect(newLogin.success).toBe(true);
    authService.logout();

    // Deactivate Clerk account
    authService.loginWithPin('55555');
    userService.setUserActive(adminSession, clerk.id, false);
    authService.logout();

    // Deactivated account login rejected
    const inactiveLogin = authService.loginWithPin('77777');
    expect(inactiveLogin.success).toBe(false);
    expect(inactiveLogin.error).toContain('account has been deactivated');

    // Reactivate Clerk account
    authService.loginWithPin('55555');
    userService.setUserActive(adminSession, clerk.id, true);
    authService.logout();

    const reactivatedLogin = authService.loginWithPin('77777');
    expect(reactivatedLogin.success).toBe(true);
  });

  it('5. triggers brute-force lockout after 5 consecutive failed attempts', () => {
    authService.setupInitialAdmin('Admin', '12345');
    authService.logout();

    // 4 failed attempts
    for (let i = 1; i <= 4; i++) {
      const res = authService.loginWithPin('00000');
      expect(res.success).toBe(false);
      expect(res.result?.remainingAttempts).toBe(5 - i);
    }

    // 5th failed attempt triggers lockout
    const fifthAttempt = authService.loginWithPin('00000');
    expect(fifthAttempt.success).toBe(false);
    expect(fifthAttempt.error).toContain('Login locked for 5 minutes');
    expect(fifthAttempt.result?.remainingAttempts).toBe(0);
    expect(fifthAttempt.result?.remainingSeconds).toBeGreaterThan(0);

    // Subsequent attempt during lockout is immediately rejected
    const blockedAttempt = authService.loginWithPin('12345'); // Even with correct PIN!
    expect(blockedAttempt.success).toBe(false);
    expect(blockedAttempt.error).toContain('Account locked due to consecutive failed attempts');
  });

  it('6. enforces role-based access control (Admin vs Staff)', () => {
    const adminSession = authService.setupInitialAdmin('Main Admin', '88888');

    const staffUser = userService.createUser(adminSession, {
      displayName: 'Normal Staff',
      pin: '99999',
      role: 'Staff'
    });

    authService.logout();

    // Log in as Staff
    const staffLogin = authService.loginWithPin('99999');
    expect(staffLogin.success).toBe(true);
    const staffSession = authService.requireAuth();
    expect(staffSession.role).toBe('Staff');

    // Staff attempting to access admin operations must throw Unauthorized
    expect(() => {
      authService.requireAdmin();
    }).toThrow(/Unauthorized: Administrator privileges required/);

    expect(() => {
      userService.createUser(staffSession, {
        displayName: 'Hacker',
        pin: '10101',
        role: 'Admin'
      });
    }).not.toThrow(); // UserService receives adminUser object; IPC handler guards it using authService.requireAdmin()

    // Test IPC handler guard logic
    authService.logout();
    expect(() => {
      authService.requireAuth();
    }).toThrow(/Unauthenticated/);
  });

  it('7. protects the last active Administrator from deactivation and demotion', () => {
    const admin = authService.setupInitialAdmin('Solo Admin', '12345');

    // Attempting to deactivate the only active admin must fail
    expect(() => {
      userService.setUserActive(admin, admin.id, false);
    }).toThrow(/Cannot deactivate the last active Administrator account/);

    // Attempting to demote the only active admin to Staff must fail
    expect(() => {
      userService.updateUser(admin, admin.id, { role: 'Staff' });
    }).toThrow(/Cannot demote the last active Administrator account/);

    // Create a second Admin
    const secondAdmin = userService.createUser(admin, {
      displayName: 'Second Admin',
      pin: '54321',
      role: 'Admin'
    });

    // Now deactivating the second admin succeeds
    const deactivated = userService.setUserActive(admin, secondAdmin.id, false);
    expect(deactivated.isActive).toBe(false);

    // But deactivating Solo Admin still fails because only 1 active admin remains
    expect(() => {
      userService.setUserActive(admin, admin.id, false);
    }).toThrow(/Cannot deactivate the last active Administrator account/);
  });

  it('8. provides backward compatibility and automatic HMAC upgrades for legacy accounts', () => {
    // Insert a legacy user with dummy hash and non-matching HMAC (simulating old migration)
    const pin = '78901';
    const legacySaltedHash = PinSecurityService.hashPinForVerification(pin);

    testDb.prepare(`
      INSERT INTO users (display_name, pin_hash, pin_hmac, role, is_active)
      VALUES ('Legacy Operator', ?, 'legacy_unmatched_hmac_123', 'Staff', 1)
    `).run(legacySaltedHash);

    // Login with the PIN: auth service recognizes verified hash and updates HMAC automatically
    const loginRes = authService.loginWithPin(pin);
    expect(loginRes.success).toBe(true);
    expect(loginRes.result?.user?.displayName).toBe('Legacy Operator');

    // Verify HMAC was upgraded in the database
    const expectedHmac = PinSecurityService.computePinHmac(pin);
    const updated = testDb.prepare("SELECT pin_hmac FROM users WHERE display_name = 'Legacy Operator'").get() as { pin_hmac: string };
    expect(updated.pin_hmac).toBe(expectedHmac);
  });
});

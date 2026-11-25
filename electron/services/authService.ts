import Database from 'better-sqlite3';
import crypto from 'crypto';
import { IAuthSession, ILoginResult, UserRole } from '../shared/types';
import { PinSecurityService } from './pinSecurity';

export interface ILockoutState {
  failedAttempts: number;
  lockedUntil: number | null;
}

interface ISessionRecord {
  token: string;
  userId: number;
  tokenVersion: number;
  role: UserRole;
  displayName: string;
}

export class AuthService {
  private db: Database.Database;
  private currentSession: ISessionRecord | null = null;

  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

  constructor(db: Database.Database) {
    this.db = db;
    this.ensureLockoutTable();
  }

  private ensureLockoutTable(): void {
    try {
      // Per-target/identifier lockout table to prevent denial of service (global lockout)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS auth_lockout_records (
          target_key TEXT PRIMARY KEY,
          failed_attempts INTEGER NOT NULL DEFAULT 0,
          locked_until INTEGER DEFAULT NULL,
          last_failed_at DATETIME DEFAULT NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      const tableInfo = this.db.prepare("PRAGMA table_info('users')").all() as Array<{ name: string }>;
      const hasTokenVersion = tableInfo.some(col => col.name === 'token_version');
      if (!hasTokenVersion) {
        this.db.exec(`
          ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;
        `);
      }
    } catch {
      // Handled if already present
    }
  }

  private getPersistentLockout(targetKey: string = 'global_login'): ILockoutState {
    this.ensureLockoutTable();
    const row = this.db.prepare('SELECT failed_attempts, locked_until FROM auth_lockout_records WHERE target_key = ?').get(targetKey) as {
      failed_attempts: number;
      locked_until: number | null;
    } | undefined;

    return {
      failedAttempts: row ? row.failed_attempts : 0,
      lockedUntil: row && row.locked_until !== null ? Number(row.locked_until) : null
    };
  }

  private setPersistentLockout(targetKey: string, failedAttempts: number, lockedUntil: number | null): void {
    this.ensureLockoutTable();
    this.db.prepare(`
      INSERT INTO auth_lockout_records (target_key, failed_attempts, locked_until, last_failed_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(target_key) DO UPDATE SET
        failed_attempts = excluded.failed_attempts,
        locked_until = excluded.locked_until,
        last_failed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `).run(targetKey, failedAttempts, lockedUntil);
  }

  public getLockoutRemainingSeconds(targetKey: string = 'global_login'): number {
    const state = this.getPersistentLockout(targetKey);
    if (!state.lockedUntil) return 0;
    const remainingMs = state.lockedUntil - Date.now();
    if (remainingMs <= 0) {
      this.setPersistentLockout(targetKey, state.failedAttempts, null);
      return 0;
    }
    return Math.ceil(remainingMs / 1000);
  }

  public getLockoutStatus(targetKey: string = 'global_login'): { isLocked: boolean; remainingSeconds: number; remainingAttempts: number } {
    const remainingSeconds = this.getLockoutRemainingSeconds(targetKey);
    const isLocked = remainingSeconds > 0;
    const state = this.getPersistentLockout(targetKey);
    const remainingAttempts = isLocked ? 0 : Math.max(0, this.MAX_FAILED_ATTEMPTS - state.failedAttempts);
    return { isLocked, remainingSeconds, remainingAttempts };
  }

  public hasAnyUsers(): boolean {
    const row = this.db.prepare('SELECT count(*) as count FROM users').get() as { count: number };
    return row && row.count > 0;
  }

  public hasUsers(): boolean {
    return this.hasAnyUsers();
  }

  public hasAnyAdmin(): boolean {
    const row = this.db.prepare("SELECT count(*) as count FROM users WHERE role = 'Admin'").get() as { count: number };
    return row && row.count > 0;
  }

  public setupInitialAdmin(displayName: string, pin: string): IAuthSession {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      throw new Error('Administrator display name cannot be empty.');
    }

    PinSecurityService.validatePinFormat(pin);
    const credentials = PinSecurityService.createSecurePinCredentials(pin);

    // Atomic transaction: strictly ensure users table has 0 total records
    const insertTransaction = this.db.transaction(() => {
      const userCount = (this.db.prepare('SELECT count(*) as count FROM users').get() as { count: number }).count;
      if (userCount > 0) {
        throw new Error('An administrator account is already configured in the system. Initial setup is prohibited: Users already exist in the database.');
      }

      const result = this.db.prepare(`
        INSERT INTO users (display_name, pin_hash, pin_hmac, role, is_active, token_version)
        VALUES (?, ?, ?, 'Admin', 1, 1)
      `).run(trimmedName, credentials.pinHash, credentials.pinHmac);

      const userId = Number(result.lastInsertRowid);

      // Audit log
      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'INITIAL_SETUP', 'users', ?, 'Initial administrator setup completed')
      `).run(userId, String(userId));

      return userId;
    });

    const userId = insertTransaction();

    const sessionUser: IAuthSession = {
      id: userId,
      displayName: trimmedName,
      role: 'Admin'
    };

    this.currentSession = {
      token: crypto.randomBytes(32).toString('hex'),
      userId,
      tokenVersion: 1,
      role: 'Admin',
      displayName: trimmedName
    };

    return sessionUser;
  }

  public loginWithPin(pin: string): { success: boolean; result?: ILoginResult; error?: string } {
    // Global progressive backoff on repeated failures:
    // If consecutive failed attempts reach 5 across the terminal, a temporary 5-minute lockout activates
    // to protect the local desktop application against brute-force automation.
    const remainingGlobalLockout = this.getLockoutRemainingSeconds('global_login');
    if (remainingGlobalLockout > 0) {
      const state = this.getPersistentLockout('global_login');
      return {
        success: false,
        error: `Account locked due to consecutive failed attempts. Please wait ${remainingGlobalLockout} seconds before trying again.`,
        result: {
          lockedUntil: state.lockedUntil!,
          remainingSeconds: remainingGlobalLockout,
          remainingAttempts: 0
        }
      };
    }

    try {
      PinSecurityService.validatePinFormat(pin);
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }

    // 1. Compute HMAC to identify the user (if exists)
    const pinHmac = PinSecurityService.computePinHmac(pin);

    let user = this.db.prepare(`
      SELECT id, display_name, pin_hash, pin_hmac, role, is_active, token_version
      FROM users
      WHERE pin_hmac = ?
    `).get(pinHmac) as { id: number; display_name: string; pin_hash: string; pin_hmac: string; role: UserRole; is_active: number; token_version: number } | undefined;

    // Backward compatibility for pre-hmac records (legacy upgrade)
    if (!user) {
      const candidates = this.db.prepare(`
        SELECT id, display_name, pin_hash, pin_hmac, role, is_active, token_version
        FROM users
      `).all() as Array<{ id: number; display_name: string; pin_hash: string; pin_hmac: string; role: UserRole; is_active: number; token_version: number }>;

      for (const candidate of candidates) {
        if (PinSecurityService.verifyPin(pin, candidate.pin_hash)) {
          this.db.prepare('UPDATE users SET pin_hmac = ? WHERE id = ?').run(pinHmac, candidate.id);
          user = { ...candidate, pin_hmac: pinHmac };
          break;
        }
      }
    }

    // Rate-limiting target key:
    // If user is matched, keyed as user_${user.id}
    // If PIN is invalid/unmatched, keyed as a deterministic SHA-256 hash digest (e.g. attempt_${hash})
    // NEVER store raw PINs in target_key or auth_lockout_records table.
    const targetKey = user ? `user_${user.id}` : `attempt_${crypto.createHash('sha256').update(pin).digest('hex').slice(0, 16)}`;

    // 2. If user found, check active status and verify cryptographic hash
    if (user) {
      if (user.is_active !== 1) {
        return { success: false, error: 'This account has been deactivated. Please contact an Administrator.' };
      }

      const isValid = PinSecurityService.verifyPin(pin, user.pin_hash);
      if (isValid) {
        // Successful login: Reset failure count and lockout persistently
        this.setPersistentLockout('global_login', 0, null);
        this.setPersistentLockout(targetKey, 0, null);

        const sessionUser: IAuthSession = {
          id: user.id,
          displayName: user.display_name,
          role: user.role
        };

        this.currentSession = {
          token: crypto.randomBytes(32).toString('hex'),
          userId: user.id,
          tokenVersion: user.token_version || 1,
          role: user.role,
          displayName: user.display_name
        };

        // Audit log
        try {
          this.db.prepare(`
            INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
            VALUES (?, 'USER_LOGIN', 'users', ?, 'Successful PIN authentication')
          `).run(user.id, String(user.id));
        } catch {}

        return {
          success: true,
          result: { user: sessionUser }
        };
      }
    }

    // 3. Failed login attempt handling (persistent across restarts)
    const currentLockout = this.getPersistentLockout('global_login');
    const newFailedAttempts = currentLockout.failedAttempts + 1;
    const remainingAttempts = Math.max(0, this.MAX_FAILED_ATTEMPTS - newFailedAttempts);

    if (newFailedAttempts >= this.MAX_FAILED_ATTEMPTS) {
      const lockedUntil = Date.now() + this.LOCKOUT_DURATION_MS;
      this.setPersistentLockout('global_login', newFailedAttempts, lockedUntil);
      return {
        success: false,
        error: `Too many failed attempts. Login locked for 5 minutes.`,
        result: {
          lockedUntil,
          remainingSeconds: 300,
          remainingAttempts: 0
        }
      };
    }

    this.setPersistentLockout('global_login', newFailedAttempts, null);
    return {
      success: false,
      error: `Invalid PIN. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining before temporary lockout.`,
      result: { remainingAttempts }
    };
  }

  public logout(): void {
    if (this.currentSession) {
      try {
        this.db.prepare(`
          INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
          VALUES (?, 'USER_LOGOUT', 'users', ?, 'User logged out')
        `).run(this.currentSession.userId, String(this.currentSession.userId));
      } catch {}
      this.currentSession = null;
    }
  }

  public invalidateSession(userId?: number): void {
    if (this.currentSession) {
      if (userId === undefined || this.currentSession.userId === userId) {
        this.currentSession = null;
      }
    }
  }

  public getCurrentSession(): IAuthSession | null {
    if (!this.currentSession) return null;
    try {
      return this.requireAuth();
    } catch {
      return null;
    }
  }

  /**
   * Rechecks user active status, token version, and role directly against the database on each call.
   */
  public requireAuth(): IAuthSession {
    if (!this.currentSession) {
      throw new Error('Unauthenticated: Please log in to proceed.');
    }

    // Recheck against database directly for real-time invalidation
    const user = this.db.prepare(`
      SELECT id, display_name, role, is_active, token_version
      FROM users
      WHERE id = ?
    `).get(this.currentSession.userId) as {
      id: number;
      display_name: string;
      role: UserRole;
      is_active: number;
      token_version: number;
    } | undefined;

    if (!user || user.is_active !== 1) {
      this.currentSession = null;
      throw new Error('Session invalidated: Account has been deactivated or deleted.');
    }

    if (user.token_version !== this.currentSession.tokenVersion) {
      this.currentSession = null;
      throw new Error('Session invalidated: Security credentials or role were modified. Please log in again.');
    }

    return {
      id: user.id,
      displayName: user.display_name,
      role: user.role
    };
  }

  public requireAdmin(): IAuthSession {
    const session = this.requireAuth();
    if (session.role !== 'Admin') {
      throw new Error('Unauthorized: Administrator privileges required.');
    }
    return session;
  }
}

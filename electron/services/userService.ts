import Database from 'better-sqlite3';
import { IAuthSession, ICreateUserInput, IUpdateUserInput, IUserProfile, UserRole } from '../shared/types';
import { PinSecurityService } from './pinSecurity';

export class UserService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  public listUsers(): IUserProfile[] {
    const rows = this.db.prepare(`
      SELECT id, display_name, role, is_active, created_at, updated_at
      FROM users
      ORDER BY id ASC
    `).all() as Array<{
      id: number;
      display_name: string;
      role: UserRole;
      is_active: number;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      displayName: r.display_name,
      role: r.role,
      isActive: r.is_active === 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  public createUser(adminUser: IAuthSession, input: ICreateUserInput): IUserProfile {
    const displayName = input.displayName ? input.displayName.trim() : '';
    if (!displayName) {
      throw new Error('User display name is required.');
    }

    if (input.role !== 'Admin' && input.role !== 'Staff') {
      throw new Error('Invalid role specified. Role must be Admin or Staff.');
    }

    PinSecurityService.validatePinFormat(input.pin);
    const pinHmac = PinSecurityService.computePinHmac(input.pin);

    // Duplicate PIN check via deterministic HMAC
    const existing = this.db.prepare('SELECT id FROM users WHERE pin_hmac = ?').get(pinHmac);
    if (existing) {
      throw new Error('This 5-digit PIN is already assigned to another user. Please choose a unique PIN.');
    }

    const pinHash = PinSecurityService.hashPinForVerification(input.pin);

    const result = this.db.prepare(`
      INSERT INTO users (display_name, pin_hash, pin_hmac, role, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(displayName, pinHash, pinHmac, input.role);

    const newId = Number(result.lastInsertRowid);

    try {
      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'CREATE_USER', 'users', ?, ?)
      `).run(adminUser.id, String(newId), `Created user ${displayName} with role ${input.role}`);
    } catch {}

    const row = this.db.prepare(`
      SELECT id, display_name, role, is_active, created_at, updated_at
      FROM users WHERE id = ?
    `).get(newId) as {
      id: number;
      display_name: string;
      role: UserRole;
      is_active: number;
      created_at: string;
      updated_at: string;
    };

    return {
      id: row.id,
      displayName: row.display_name,
      role: row.role,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  public updateUser(adminUser: IAuthSession, userId: number, input: IUpdateUserInput): IUserProfile {
    const existingUser = this.db.prepare('SELECT id, display_name, role, is_active FROM users WHERE id = ?').get(userId) as {
      id: number;
      display_name: string;
      role: UserRole;
      is_active: number;
    } | undefined;

    if (!existingUser) {
      throw new Error('User not found.');
    }

    let newRole = existingUser.role;
    if (input.role && input.role !== existingUser.role) {
      if (input.role !== 'Admin' && input.role !== 'Staff') {
        throw new Error('Invalid role specified.');
      }

      // Check last active admin rule if demoting Admin -> Staff
      if (existingUser.role === 'Admin' && input.role === 'Staff' && existingUser.is_active === 1) {
        const otherAdmins = this.db.prepare(`
          SELECT count(*) as count FROM users
          WHERE role = 'Admin' AND is_active = 1 AND id != ?
        `).get(userId) as { count: number };

        if (!otherAdmins || otherAdmins.count === 0) {
          throw new Error('Cannot demote the last active Administrator account.');
        }
      }
      newRole = input.role;
    }

    const newDisplayName = input.displayName ? input.displayName.trim() : existingUser.display_name;
    if (!newDisplayName) {
      throw new Error('User display name cannot be empty.');
    }

    this.db.prepare(`
      UPDATE users
      SET display_name = ?, role = ?, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newDisplayName, newRole, userId);

    try {
      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'UPDATE_USER', 'users', ?, ?)
      `).run(adminUser.id, String(userId), `Updated user details (Role: ${newRole}, Name: ${newDisplayName})`);
    } catch {}

    const updated = this.db.prepare(`
      SELECT id, display_name, role, is_active, created_at, updated_at
      FROM users WHERE id = ?
    `).get(userId) as {
      id: number;
      display_name: string;
      role: UserRole;
      is_active: number;
      created_at: string;
      updated_at: string;
    };

    return {
      id: updated.id,
      displayName: updated.display_name,
      role: updated.role,
      isActive: updated.is_active === 1,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at
    };
  }

  public setUserActive(adminUser: IAuthSession, userId: number, isActive: boolean): IUserProfile {
    const existing = this.db.prepare('SELECT id, display_name, role, is_active FROM users WHERE id = ?').get(userId) as {
      id: number;
      display_name: string;
      role: UserRole;
      is_active: number;
    } | undefined;

    if (!existing) {
      throw new Error('User not found.');
    }

    const newActiveState = isActive ? 1 : 0;

    // Check last active admin protection
    if (!isActive && existing.role === 'Admin' && existing.is_active === 1) {
      const otherAdmins = this.db.prepare(`
        SELECT count(*) as count FROM users
        WHERE role = 'Admin' AND is_active = 1 AND id != ?
      `).get(userId) as { count: number };

      if (!otherAdmins || otherAdmins.count === 0) {
        throw new Error('Cannot deactivate the last active Administrator account.');
      }
    }

    this.db.prepare(`
      UPDATE users
      SET is_active = ?, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newActiveState, userId);

    try {
      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'SET_USER_STATUS', 'users', ?, ?)
      `).run(adminUser.id, String(userId), `${isActive ? 'Activated' : 'Deactivated'} account for ${existing.display_name}`);
    } catch {}

    const updated = this.db.prepare(`
      SELECT id, display_name, role, is_active, created_at, updated_at
      FROM users WHERE id = ?
    `).get(userId) as {
      id: number;
      display_name: string;
      role: UserRole;
      is_active: number;
      created_at: string;
      updated_at: string;
    };

    return {
      id: updated.id,
      displayName: updated.display_name,
      role: updated.role,
      isActive: updated.is_active === 1,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at
    };
  }

  public resetUserPin(adminUser: IAuthSession, userId: number, newPin: string): void {
    const existing = this.db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(userId) as { id: number; display_name: string } | undefined;
    if (!existing) {
      throw new Error('User not found.');
    }

    PinSecurityService.validatePinFormat(newPin);
    const newHmac = PinSecurityService.computePinHmac(newPin);

    // Duplicate PIN check across other users
    const duplicate = this.db.prepare('SELECT id FROM users WHERE pin_hmac = ? AND id != ?').get(newHmac, userId);
    if (duplicate) {
      throw new Error('This 5-digit PIN is already assigned to another user. Please choose a unique PIN.');
    }

    const newHash = PinSecurityService.hashPinForVerification(newPin);

    this.db.prepare(`
      UPDATE users
      SET pin_hash = ?, pin_hmac = ?, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newHash, newHmac, userId);

    try {
      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'RESET_PIN', 'users', ?, ?)
      `).run(adminUser.id, String(userId), `Reset PIN for user ${existing.display_name}`);
    } catch {}
  }
}

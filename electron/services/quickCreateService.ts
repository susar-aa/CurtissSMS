import Database from 'better-sqlite3';
import { ILookupItem, LookupCategory, ICreateLookupInput, IUpdateLookupInput, IAuthSession } from '../shared/types';

export class QuickCreateService {
  private db: Database.Database;

  private readonly VALID_CATEGORIES: LookupCategory[] = [
    'houses',
    'occupations',
    'streets',
    'cities',
    'transportation_methods'
  ];

  constructor(db: Database.Database) {
    this.db = db;
  }

  private validateCategory(category: string): asserts category is LookupCategory {
    if (!this.VALID_CATEGORIES.includes(category as LookupCategory)) {
      throw new Error(`Invalid lookup category: ${category}`);
    }
  }

  private getUsageCount(category: LookupCategory, id: number): number {
    try {
      switch (category) {
        case 'houses': {
          const row = this.db.prepare('SELECT COUNT(*) as cnt FROM students WHERE house_id = ?').get(id) as { cnt: number };
          return row ? row.cnt : 0;
        }
        case 'occupations': {
          const row = this.db.prepare('SELECT COUNT(*) as cnt FROM family_members WHERE occupation_id = ?').get(id) as { cnt: number };
          return row ? row.cnt : 0;
        }
        case 'streets': {
          const fRow = this.db.prepare('SELECT COUNT(*) as cnt FROM families WHERE street_id = ?').get(id) as { cnt: number };
          return fRow ? fRow.cnt : 0;
        }
        case 'cities': {
          const fRow = this.db.prepare('SELECT COUNT(*) as cnt FROM families WHERE city_id = ?').get(id) as { cnt: number };
          return fRow ? fRow.cnt : 0;
        }
        case 'transportation_methods': {
          const row = this.db.prepare('SELECT COUNT(*) as cnt FROM students WHERE transportation_method_id = ?').get(id) as { cnt: number };
          return row ? row.cnt : 0;
        }
        default:
          return 0;
      }
    } catch {
      return 0;
    }
  }

  public getLookups(category: LookupCategory, includeInactive = false, searchQuery = ''): ILookupItem[] {
    this.validateCategory(category);

    const queryParams: (string | number)[] = [];
    const whereClauses: string[] = [];

    if (!includeInactive) {
      whereClauses.push('is_active = 1');
    }

    if (searchQuery && searchQuery.trim()) {
      whereClauses.push('name LIKE ?');
      queryParams.push(`%${searchQuery.trim()}%`);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    let sql = '';
    if (category === 'houses') {
      sql = `SELECT id, name, color_hex, is_active, created_at, updated_at FROM houses ${whereStr} ORDER BY is_active DESC, name ASC`;
    } else if (category === 'cities') {
      sql = `SELECT id, name, postal_code, is_active, created_at, updated_at FROM cities ${whereStr} ORDER BY is_active DESC, name ASC`;
    } else {
      sql = `SELECT id, name, is_active, created_at, updated_at FROM "${category}" ${whereStr} ORDER BY is_active DESC, name ASC`;
    }

    const rows = this.db.prepare(sql).all(...queryParams) as Array<{
      id: number;
      name: string;
      color_hex?: string;
      postal_code?: string;
      is_active: number;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      colorHex: r.color_hex || null,
      postalCode: r.postal_code || null,
      isActive: r.is_active === 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      usageCount: this.getUsageCount(category, r.id)
    }));
  }

  public createLookup(user: IAuthSession, input: ICreateLookupInput): ILookupItem {
    this.validateCategory(input.category);

    const trimmedName = input.name ? input.name.trim() : '';
    if (!trimmedName) {
      throw new Error('Name cannot be empty.');
    }

    // Check duplicate case-insensitively
    const existing = this.db.prepare(`
      SELECT id, is_active FROM "${input.category}" WHERE LOWER(TRIM(name)) = LOWER(?)
    `).get(trimmedName) as { id: number; is_active: number } | undefined;

    if (existing) {
      // If duplicate exists and is active, throw conflict error
      if (existing.is_active === 1) {
        throw new Error(`An entry with the name "${trimmedName}" already exists.`);
      } else {
        // If inactive, re-activate and return it
        this.db.prepare(`
          UPDATE "${input.category}" SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(existing.id);

        try {
          this.db.prepare(`
            INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
            VALUES (?, 'REACTIVATE_LOOKUP', ?, ?, ?)
          `).run(user.id, input.category, String(existing.id), `Reactivated existing lookup entry: ${trimmedName}`);
        } catch {}

        return this.getLookups(input.category, true).find(i => i.id === existing.id)!;
      }
    }

    // Category specific validations
    let colorHex: string | null = null;
    let postalCode: string | null = null;

    if (input.category === 'houses') {
      const hex = input.colorHex ? input.colorHex.trim() : '#3B82F6';
      if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        throw new Error('House color must be a valid 6-character hex code (e.g. #3B82F6).');
      }
      colorHex = hex.toUpperCase();
    }

    if (input.category === 'cities') {
      postalCode = input.postalCode ? input.postalCode.trim() : null;
    }

    let insertResult;
    if (input.category === 'houses') {
      insertResult = this.db.prepare(`
        INSERT INTO houses (name, color_hex, is_active)
        VALUES (?, ?, 1)
      `).run(trimmedName, colorHex);
    } else if (input.category === 'cities') {
      insertResult = this.db.prepare(`
        INSERT INTO cities (name, postal_code, is_active)
        VALUES (?, ?, 1)
      `).run(trimmedName, postalCode);
    } else {
      insertResult = this.db.prepare(`
        INSERT INTO "${input.category}" (name, is_active)
        VALUES (?, 1)
      `).run(trimmedName);
    }

    const newId = Number(insertResult.lastInsertRowid);

    try {
      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'CREATE_LOOKUP', ?, ?, ?)
      `).run(user.id, input.category, String(newId), `Created lookup: ${trimmedName}`);
    } catch {}

    const items = this.getLookups(input.category, true);
    const created = items.find(i => i.id === newId);
    if (!created) {
      throw new Error('Failed to retrieve newly created lookup.');
    }
    return created;
  }

  public updateLookup(adminUser: IAuthSession, input: IUpdateLookupInput): ILookupItem {
    this.validateCategory(input.category);

    const existing = this.db.prepare(`
      SELECT id, name, is_active FROM "${input.category}" WHERE id = ?
    `).get(input.id) as { id: number; name: string; is_active: number } | undefined;

    if (!existing) {
      throw new Error(`Record with ID ${input.id} not found in ${input.category}.`);
    }

    const trimmedName = input.name !== undefined ? input.name.trim() : existing.name;
    if (!trimmedName) {
      throw new Error('Name cannot be empty.');
    }

    // Check duplicate conflict on name change
    if (trimmedName.toLowerCase() !== existing.name.toLowerCase()) {
      const conflict = this.db.prepare(`
        SELECT id FROM "${input.category}" WHERE LOWER(TRIM(name)) = LOWER(?) AND id != ?
      `).get(trimmedName, input.id) as { id: number } | undefined;

      if (conflict) {
        throw new Error(`An entry with the name "${trimmedName}" already exists.`);
      }
    }

    const isActive = input.isActive !== undefined ? (input.isActive ? 1 : 0) : existing.is_active;

    if (input.category === 'houses') {
      let colorHex = input.colorHex ? input.colorHex.trim() : undefined;
      if (colorHex !== undefined) {
        if (!/^#[0-9A-Fa-f]{6}$/.test(colorHex)) {
          throw new Error('House color must be a valid 6-character hex code (e.g. #3B82F6).');
        }
        colorHex = colorHex.toUpperCase();
        this.db.prepare(`
          UPDATE houses
          SET name = ?, color_hex = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(trimmedName, colorHex, isActive, input.id);
      } else {
        this.db.prepare(`
          UPDATE houses
          SET name = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(trimmedName, isActive, input.id);
      }
    } else if (input.category === 'cities') {
      const postalCode = input.postalCode !== undefined ? (input.postalCode ? input.postalCode.trim() : null) : undefined;
      if (postalCode !== undefined) {
        this.db.prepare(`
          UPDATE cities
          SET name = ?, postal_code = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(trimmedName, postalCode, isActive, input.id);
      } else {
        this.db.prepare(`
          UPDATE cities
          SET name = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(trimmedName, isActive, input.id);
      }
    } else {
      this.db.prepare(`
        UPDATE "${input.category}"
        SET name = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(trimmedName, isActive, input.id);
    }

    try {
      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'UPDATE_LOOKUP', ?, ?, ?)
      `).run(adminUser.id, input.category, String(input.id), `Updated lookup ID ${input.id}: name=${trimmedName}, active=${isActive}`);
    } catch {}

    const updated = this.getLookups(input.category, true).find(i => i.id === input.id);
    if (!updated) {
      throw new Error('Failed to retrieve updated lookup item.');
    }
    return updated;
  }

  public setLookupActive(adminUser: IAuthSession, category: LookupCategory, id: number, isActive: boolean): ILookupItem {
    return this.updateLookup(adminUser, { category, id, isActive });
  }

  public deleteLookup(adminUser: IAuthSession, category: LookupCategory, id: number): boolean {
    this.validateCategory(category);

    const usageCount = this.getUsageCount(category, id);
    if (usageCount > 0) {
      throw new Error(`Cannot delete this entry because it is used by ${usageCount} existing record(s). Please deactivate it instead.`);
    }

    const item = this.db.prepare(`SELECT name FROM "${category}" WHERE id = ?`).get(id) as { name: string } | undefined;
    if (!item) {
      return false;
    }

    this.db.prepare(`DELETE FROM "${category}" WHERE id = ?`).run(id);

    try {
      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'DELETE_LOOKUP', ?, ?, ?)
      `).run(adminUser.id, category, String(id), `Deleted lookup: ${item.name}`);
    } catch {}

    return true;
  }

  // Quick Create method accessible to both Staff and Admin
  public quickCreate(
    user: IAuthSession, 
    category: LookupCategory, 
    name: string, 
    postalCode?: string | null,
    colorHex?: string | null
  ): ILookupItem {
    return this.createLookup(user, {
      category,
      name,
      postalCode,
      colorHex
    });
  }
}

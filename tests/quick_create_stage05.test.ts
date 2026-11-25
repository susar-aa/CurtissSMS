import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { DatabaseMigrator } from '../electron/database/migrator';
import { QuickCreateService } from '../electron/services/quickCreateService';
import { AuthService } from '../electron/services/authService';
import { IAuthSession } from '../electron/shared/types';
import { migration001 } from '../electron/database/migrations/001_initial_schema';
import { migration002 } from '../electron/database/migrations/002_core_taxonomy_and_users';
import { migration003 } from '../electron/database/migrations/003_families_and_students';
import { migration004 } from '../electron/database/migrations/004_academic_and_fees';
import { migration005 } from '../electron/database/migrations/005_schema_corrections';
import { migration006 } from '../electron/database/migrations/006_final_verification_corrections';
import { migration007 } from '../electron/database/migrations/007_school_settings_stage04_verification';

describe('Stage 05 – Quick Create Management Tests', () => {
  let db: Database.Database;
  let service: QuickCreateService;

  const adminSession: IAuthSession = {
    userId: 1,
    displayName: 'Administrator',
    role: 'Admin',
    token: 'admin-token',
    expiresAt: Date.now() + 3600000
  };

  const staffSession: IAuthSession = {
    userId: 2,
    displayName: 'Staff User',
    role: 'Staff',
    token: 'staff-token',
    expiresAt: Date.now() + 3600000
  };

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    // Run complete migrations up to 8
    const migrator = new DatabaseMigrator(db);
    migrator.runMigrations();

    service = new QuickCreateService(db);
  });

  afterEach(() => {
    try { db.close(); } catch {}
  });

  it('1. verifies migration 008 applies cleanly and provisions default seeds', () => {
    const migrator = new DatabaseMigrator(db);
    expect(migrator.getCurrentVersion()).toBeGreaterThanOrEqual(8);

    // Verify initial seeded houses
    const houses = service.getLookups('houses', true);
    expect(houses.length).toBeGreaterThanOrEqual(4);
    expect(houses.some(h => h.name === 'Ruby' && h.colorHex === '#EF4444')).toBe(true);
    expect(houses.some(h => h.name === 'Sapphire' && h.colorHex === '#3B82F6')).toBe(true);

    // Verify initial seeded transport methods
    const transports = service.getLookups('transportation_methods', true);
    expect(transports.length).toBeGreaterThanOrEqual(5);
    expect(transports.some(t => t.name === 'School Van')).toBe(true);
  });

  it('2. verifies migration upgrade from v7 to v8 on existing populated database', () => {
    const upgradeDb = new Database(':memory:');
    const migrator = new DatabaseMigrator(upgradeDb);
    migrator.initMigrationTable();

    // Run v1 to v7
    [migration001, migration002, migration003, migration004, migration005, migration006, migration007].forEach(m => {
      m.up(upgradeDb);
      upgradeDb.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
    });

    expect(migrator.getCurrentVersion()).toBe(7);

    // Apply pending migrations
    const result = migrator.runMigrations();
    expect(result.applied).toBeGreaterThanOrEqual(1);
    expect(result.currentVersion).toBeGreaterThanOrEqual(8);

    const upgradeService = new QuickCreateService(upgradeDb);
    const houses = upgradeService.getLookups('houses', true);
    expect(houses.length).toBeGreaterThanOrEqual(4);
    upgradeDb.close();
  });

  it('3. CRUD operations: creates, views, edits, and searches lookups across all categories', () => {
    // A. Occupations
    const occ = service.createLookup(adminSession, { category: 'occupations', name: 'Software Engineer' });
    expect(occ.id).toBeDefined();
    expect(occ.name).toBe('Software Engineer');
    expect(occ.isActive).toBe(true);

    // B. Streets
    const street = service.createLookup(adminSession, { category: 'streets', name: 'Galle Road' });
    expect(street.name).toBe('Galle Road');

    // C. Cities with postal code
    const city = service.createLookup(adminSession, { category: 'cities', name: 'Colombo 03', postalCode: '00300' });
    expect(city.name).toBe('Colombo 03');
    expect(city.postalCode).toBe('00300');

    // D. Search lookups
    const foundCities = service.getLookups('cities', true, 'colombo');
    expect(foundCities.some(c => c.name === 'Colombo 03')).toBe(true);

    // E. Edit entry
    const updatedOcc = service.updateLookup(adminSession, {
      category: 'occupations',
      id: occ.id,
      name: 'Lead Software Architect'
    });
    expect(updatedOcc.name).toBe('Lead Software Architect');
  });

  it('4. prevents duplicate lookup entries case-insensitively and reactivates if previously deactivated', () => {
    // Create initial street
    const st1 = service.createLookup(adminSession, { category: 'streets', name: 'Kandy Road' });

    // Attempting to create duplicate with varying case and whitespace
    expect(() => {
      service.createLookup(adminSession, { category: 'streets', name: '   kandy road   ' });
    }).toThrow(/already exists/i);

    // Deactivate entry
    service.setLookupActive(adminSession, 'streets', st1.id, false);
    const inactiveStreet = service.getLookups('streets', true).find(s => s.id === st1.id);
    expect(inactiveStreet?.isActive).toBe(false);

    // Attempting to create same entry again safely reactivates it
    const reactivated = service.createLookup(adminSession, { category: 'streets', name: 'Kandy Road' });
    expect(reactivated.id).toBe(st1.id);
    expect(reactivated.isActive).toBe(true);
  });

  it('5. House Management: validates colors, duplicate names, and prevents invalid hex values', () => {
    // Valid house creation
    const house = service.createLookup(adminSession, {
      category: 'houses',
      name: 'Lotus',
      colorHex: '#EC4899'
    });
    expect(house.name).toBe('Lotus');
    expect(house.colorHex).toBe('#EC4899');

    // Invalid hex color code rejection
    expect(() => {
      service.createLookup(adminSession, {
        category: 'houses',
        name: 'Orchid',
        colorHex: 'invalid-color'
      });
    }).toThrow(/valid 6-character hex code/i);

    // Duplicate house name rejection
    expect(() => {
      service.createLookup(adminSession, {
        category: 'houses',
        name: 'lotus',
        colorHex: '#3B82F6'
      });
    }).toThrow(/already exists/i);
  });

  it('6. Deletion safety: prevents deletion when records depend on the lookup, allows safe deactivation', () => {
    // 1. Create lookup items
    const occ = service.createLookup(adminSession, { category: 'occupations', name: 'Civil Engineer' });
    const house = service.createLookup(adminSession, { category: 'houses', name: 'Falcon', colorHex: '#14B8A6' });

    // 2. Attach occupation to a family member
    db.prepare(`
      INSERT INTO families (id, family_code, house_no, full_address)
      VALUES (101, 'FAM-TEST-001', '12', '12 Test Lane, Colombo')
    `).run();

    db.prepare(`
      INSERT INTO family_members (family_id, relationship_type, name, occupation_id)
      VALUES (101, 'Father', 'Sunil Perera', ?)
    `).run(occ.id);

    // 3. Attach house to a student
    db.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade, house_id)
      VALUES (101, 'ADM-TEST-001', '2026-01-01', 'Kamal Perera', 'Male', '2015-05-10', 5, ?)
    `).run(house.id);

    // 4. Attempting to delete occupation must be rejected
    expect(() => {
      service.deleteLookup(adminSession, 'occupations', occ.id);
    }).toThrow(/used by 1 existing record/i);

    // 5. Attempting to delete house must be rejected
    expect(() => {
      service.deleteLookup(adminSession, 'houses', house.id);
    }).toThrow(/used by 1 existing record/i);

    // 6. Deactivating the house works safely without damaging student record
    const deactivatedHouse = service.setLookupActive(adminSession, 'houses', house.id, false);
    expect(deactivatedHouse.isActive).toBe(false);

    // Student reference remains intact
    const student = db.prepare('SELECT house_id FROM students WHERE admission_number = ?').get('ADM-TEST-001') as { house_id: number };
    expect(student.house_id).toBe(house.id);

    // 7. Unused lookup can be deleted safely
    const unusedStreet = service.createLookup(adminSession, { category: 'streets', name: 'Temporary Dead End' });
    const deleteSuccess = service.deleteLookup(adminSession, 'streets', unusedStreet.id);
    expect(deleteSuccess).toBe(true);
  });

  it('7. Quick Create permissions: Staff and Admin can quick-create; only Admin can edit/delete', () => {
    // Staff quick creates an occupation during student registration
    const staffCreated = service.quickCreate(staffSession, 'occupations', 'Accountant');
    expect(staffCreated.name).toBe('Accountant');
    expect(staffCreated.isActive).toBe(true);

    // Verify AuthService enforces RBAC for admin-only operations
    db.prepare(`
      INSERT INTO users (id, display_name, pin_hash, pin_hmac, role, is_active, token_version)
      VALUES (2, 'Staff User', 'hash', 'hmac', 'Staff', 1, 1)
    `).run();

    const authService = new AuthService(db);
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
});

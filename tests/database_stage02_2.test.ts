import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DatabaseMigrator, ALL_MIGRATIONS } from '../electron/database/migrator';
import { PinSecurityService } from '../electron/services/pinSecurity';

describe('Stage 02.2 – Final Database Architecture Verification Tests', () => {
  let testDbPath: string;
  let testDb: Database.Database;

  beforeEach(() => {
    testDbPath = path.join(__dirname, `test_stage02_2_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    testDb = new Database(testDbPath);
    testDb.pragma('journal_mode = WAL');
    testDb.pragma('foreign_keys = ON');
    testDb.pragma('synchronous = NORMAL');
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

  it('1. rejects duplicate PINs using keyed HMAC even with different salted hashes', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    const pin = '45678';

    // Generate credentials for User 1
    const creds1 = PinSecurityService.createSecurePinCredentials(pin);

    // Generate credentials for User 2 with the same PIN (different random salt)
    const creds2 = PinSecurityService.createSecurePinCredentials(pin);

    // Salted verification hashes are different
    expect(creds1.pinHash).not.toBe(creds2.pinHash);

    // But deterministic HMACs are identical
    expect(creds1.pinHmac).toBe(creds2.pinHmac);

    // Insert User 1
    testDb.prepare(`
      INSERT INTO users (display_name, pin_hash, pin_hmac, role)
      VALUES ('Principal', ?, ?, 'Admin')
    `).run(creds1.pinHash, creds1.pinHmac);

    // Attempting to register User 2 with the same PIN must fail UNIQUE(pin_hmac)
    expect(() => {
      testDb.prepare(`
        INSERT INTO users (display_name, pin_hash, pin_hmac, role)
        VALUES ('Staff Member', ?, ?, 'Staff')
      `).run(creds2.pinHash, creds2.pinHmac);
    }).toThrow(/UNIQUE constraint failed: users\.pin_hmac/);
  });

  it('2. verifies correct PIN authentication across unique salts', () => {
    const pin = '98765';
    const credsA = PinSecurityService.createSecurePinCredentials(pin);
    const credsB = PinSecurityService.createSecurePinCredentials(pin);

    expect(credsA.pinHash).not.toBe(credsB.pinHash);
    expect(PinSecurityService.verifyPin(pin, credsA.pinHash)).toBe(true);
    expect(PinSecurityService.verifyPin(pin, credsB.pinHash)).toBe(true);
    expect(PinSecurityService.verifyPin('11111', credsA.pinHash)).toBe(false);
  });

  it('3. enforces unique attempt numbers per year & job in annual_processing_logs', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    testDb.prepare("INSERT INTO academic_years (year, is_active) VALUES (2026, 1)").run();

    testDb.prepare(`
      INSERT INTO annual_processing_logs (academic_year, job_type, attempt_number, status)
      VALUES (2026, 'GradePromotion', 1, 'Failed')
    `).run();

    // Duplicate attempt number 1 for same academic_year and job_type must fail
    expect(() => {
      testDb.prepare(`
        INSERT INTO annual_processing_logs (academic_year, job_type, attempt_number, status)
        VALUES (2026, 'GradePromotion', 1, 'Partial')
      `).run();
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('4. permits safe retries on failure and strictly prevents duplicate successful jobs', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    testDb.prepare("INSERT INTO academic_years (year, is_active) VALUES (2026, 1)").run();

    // Attempt 1: Failed
    testDb.prepare(`
      INSERT INTO annual_processing_logs (academic_year, job_type, attempt_number, status, error_details)
      VALUES (2026, 'FeeGeneration', 1, 'Failed', 'Timeout occurred')
    `).run();

    // Attempt 2: Partial
    testDb.prepare(`
      INSERT INTO annual_processing_logs (academic_year, job_type, attempt_number, status, records_processed, error_details)
      VALUES (2026, 'FeeGeneration', 2, 'Partial', 50, 'Process aborted')
    `).run();

    // Attempt 3: Success
    testDb.prepare(`
      INSERT INTO annual_processing_logs (academic_year, job_type, attempt_number, status, records_processed)
      VALUES (2026, 'FeeGeneration', 3, 'Success', 1500)
    `).run();

    // Attempt 4: Duplicate Success must fail
    expect(() => {
      testDb.prepare(`
        INSERT INTO annual_processing_logs (academic_year, job_type, attempt_number, status, records_processed)
        VALUES (2026, 'FeeGeneration', 4, 'Success', 1500)
      `).run();
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('5. enforces ON DELETE RESTRICT on financial records and users', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    testDb.prepare("INSERT INTO academic_years (year, is_active) VALUES (2026, 1)").run();
    testDb.prepare("INSERT INTO annual_fee_settings (academic_year, fee_amount) VALUES (2026, 3500)").run();

    const creds = PinSecurityService.createSecurePinCredentials('77777');
    testDb.prepare("INSERT INTO users (display_name, pin_hash, pin_hmac, role) VALUES ('Cashier 1', ?, ?, 'Staff')")
      .run(creds.pinHash, creds.pinHmac);
    const cashier = testDb.prepare("SELECT id FROM users WHERE pin_hmac = ?").get(creds.pinHmac) as { id: number };

    testDb.prepare("INSERT INTO families (family_code) VALUES ('FAM-FIN-01')").run();
    const family = testDb.prepare("SELECT id FROM families WHERE family_code = 'FAM-FIN-01'").get() as { id: number };

    const student = testDb.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade)
      VALUES (?, 'ADM-FIN-01', '2026-01-01', 'Financial Test Student', 'Male', '2015-01-01', 5)
    `).run(family.id);
    const studentId = student.lastInsertRowid;

    const fee = testDb.prepare(`
      INSERT INTO student_annual_fees (student_id, academic_year, fee_amount, status)
      VALUES (?, 2026, 3500, 'Paid')
    `).run(studentId);
    const feeId = fee.lastInsertRowid;

    testDb.prepare(`
      INSERT INTO fee_payments (student_annual_fee_id, receipt_number, payment_date, amount, payment_method, recorded_by)
      VALUES (?, 'REC-FIN-001', '2026-02-01', 3500, 'Cash', ?)
    `).run(feeId, cashier.id);

    // Deleting student must fail (referenced by student_annual_fees ON DELETE RESTRICT)
    expect(() => {
      testDb.prepare("DELETE FROM students WHERE id = ?").run(studentId);
    }).toThrow(/FOREIGN KEY constraint failed/);

    // Deleting fee record must fail (referenced by fee_payments ON DELETE RESTRICT)
    expect(() => {
      testDb.prepare("DELETE FROM student_annual_fees WHERE id = ?").run(feeId);
    }).toThrow(/FOREIGN KEY constraint failed/);

    // Deleting recording user must fail (referenced by fee_payments ON DELETE RESTRICT)
    expect(() => {
      testDb.prepare("DELETE FROM users WHERE id = ?").run(cashier.id);
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('6. strictly rejects decimal float values in financial amount fields', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    testDb.prepare("INSERT INTO academic_years (year, is_active) VALUES (2026, 1)").run();

    // Integer amounts succeed
    testDb.prepare("INSERT INTO annual_fee_settings (academic_year, fee_amount) VALUES (2026, 3500)").run();

    // Decimal float values are rejected by CHECK(typeof(...) = 'integer')
    expect(() => {
      testDb.prepare("UPDATE annual_fee_settings SET fee_amount = 3500.50 WHERE academic_year = 2026").run();
    }).toThrow(/CHECK constraint failed/);

    testDb.prepare("INSERT INTO families (family_code) VALUES ('FAM-DEC-01')").run();
    const family = testDb.prepare("SELECT id FROM families WHERE family_code = 'FAM-DEC-01'").get() as { id: number };

    const student = testDb.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade)
      VALUES (?, 'ADM-DEC-01', '2026-01-01', 'Decimal Test', 'Male', '2015-01-01', 5)
    `).run(family.id);

    // Decimal in student_annual_fees must fail
    expect(() => {
      testDb.prepare("INSERT INTO student_annual_fees (student_id, academic_year, fee_amount) VALUES (?, 2026, 3500.75)").run(student.lastInsertRowid);
    }).toThrow(/CHECK constraint failed/);
  });

  it('7. safely executes migrations v5 and v6 on a pre-populated database with foreign keys enabled', () => {
    // 1. Setup database up to migration 4 only
    const migrator = new DatabaseMigrator(testDb);
    migrator.initMigrationTable();
    const partialMigrations = ALL_MIGRATIONS.slice(0, 4);
    for (const m of partialMigrations) {
      m.up(testDb);
      testDb.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(m.version, m.name);
    }
    expect(migrator.getCurrentVersion()).toBe(4);

    // 2. Pre-populate database with records across ALL tables before migration 5 & 6
    testDb.prepare("INSERT INTO academic_years (year, is_active) VALUES (2025, 0), (2026, 1)").run();
    testDb.prepare("INSERT INTO annual_fee_settings (academic_year, fee_amount) VALUES (2026, 3500)").run();
    testDb.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('legacy_admin', 'old_hash_001', 'Admin')").run();
    const user = testDb.prepare("SELECT id FROM users WHERE username = 'legacy_admin'").get() as { id: number };

    testDb.prepare("INSERT INTO occupations (name) VALUES ('Engineer')").run();
    const occ = testDb.prepare("SELECT id FROM occupations WHERE name = 'Engineer'").get() as { id: number };

    testDb.prepare("INSERT INTO families (family_code, full_address) VALUES ('FAM-POP-01', 'Old Address 123')").run();
    const family = testDb.prepare("SELECT id FROM families WHERE family_code = 'FAM-POP-01'").get() as { id: number };

    testDb.prepare("INSERT INTO family_members (family_id, relationship_type, name, contact_number, occupation_id) VALUES (?, 'Father', 'Bandara', '0771234567', ?)").run(family.id, occ.id);

    const student = testDb.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade, house_no, full_address)
      VALUES (?, 'ADM-POP-001', '2025-01-01', 'Kamal Bandara', 'Male', '2015-05-10', 5, '12', 'Old Student Address')
    `).run(family.id);
    const studentId = student.lastInsertRowid;

    testDb.prepare("INSERT INTO student_notes (student_id, note_text, created_by) VALUES (?, 'Initial student note', ?)").run(studentId, user.id);
    testDb.prepare("INSERT INTO student_grade_history (student_id, academic_year, grade) VALUES (?, 2025, 5)").run(studentId);
    testDb.prepare("INSERT INTO student_status_history (student_id, from_status, to_status, reason, changed_by) VALUES (?, 'Active', 'Active', 'Enrolled', ?)").run(studentId, user.id);
    testDb.prepare("INSERT INTO annual_processing_logs (academic_year, job_type, status, records_processed) VALUES (2025, 'GradePromotion', 'Success', 10)").run();

    const fee = testDb.prepare("INSERT INTO student_annual_fees (student_id, academic_year, fee_amount, status) VALUES (?, 2026, 3500, 'Paid')").run(studentId);
    testDb.prepare("INSERT INTO fee_payments (student_annual_fee_id, receipt_number, payment_date, amount, payment_method, recorded_by) VALUES (?, 'REC-POP-001', '2026-01-15', 3500, 'Cash', ?)").run(fee.lastInsertRowid, user.id);

    // 3. Run remaining migrations (v5, v6, v7) with foreign keys enabled
    const upgradeResult = migrator.runMigrations();
    expect(upgradeResult.applied).toBeGreaterThanOrEqual(2);
    expect(upgradeResult.currentVersion).toBeGreaterThanOrEqual(6);

    // 4. Verify foreign key integrity post-migration
    const fkViolations = testDb.pragma('foreign_key_check') as unknown[];
    expect(fkViolations).toHaveLength(0);

    const integrity = testDb.pragma('integrity_check', { simple: true });
    expect(integrity).toBe('ok');

    // 5. Verify pre-populated data survived intact
    const migratedUser = testDb.prepare("SELECT display_name, pin_hmac, role FROM users WHERE id = ?").get(user.id) as { display_name: string; pin_hmac: string; role: string };
    expect(migratedUser.display_name).toBe('legacy_admin');
    expect(migratedUser.role).toBe('Admin');
    expect(migratedUser.pin_hmac).toBeDefined();

    const migratedStudent = testDb.prepare("SELECT admission_number, full_name, current_grade FROM students WHERE id = ?").get(studentId) as { admission_number: string; full_name: string; current_grade: number };
    expect(migratedStudent.admission_number).toBe('ADM-POP-001');
    expect(migratedStudent.full_name).toBe('Kamal Bandara');

    const migratedNote = testDb.prepare("SELECT note_text FROM student_notes WHERE student_id = ?").get(studentId) as { note_text: string };
    expect(migratedNote.note_text).toBe('Initial student note');

    const migratedPayment = testDb.prepare("SELECT receipt_number, amount FROM fee_payments WHERE student_annual_fee_id = ?").get(fee.lastInsertRowid) as { receipt_number: string; amount: number };
    expect(migratedPayment.receipt_number).toBe('REC-POP-001');
    expect(migratedPayment.amount).toBe(3500);
  });
});

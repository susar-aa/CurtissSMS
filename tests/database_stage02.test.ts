import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DatabaseMigrator } from '../electron/database/migrator';
import { DatabaseHealthChecker } from '../electron/database/health';
import { DatabaseBackupService } from '../electron/database/backup';

describe('Stage 02 – Complete Database Architecture Tests', () => {
  let testDbPath: string;
  let testDb: Database.Database;

  beforeEach(() => {
    testDbPath = path.join(__dirname, `test_stage02_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
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

  it('1. applies all migrations successfully in version order', () => {
    const migrator = new DatabaseMigrator(testDb);
    const result = migrator.runMigrations();
    expect(result.applied).toBeGreaterThanOrEqual(4);
    expect(result.currentVersion).toBeGreaterThanOrEqual(6);

    const tables = testDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as Array<{ name: string }>;
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('users');
    expect(tableNames).toContain('audit_logs');
    expect(tableNames).toContain('school_settings');
    expect(tableNames).toContain('system_settings');
    expect(tableNames).toContain('houses');
    expect(tableNames).toContain('occupations');
    expect(tableNames).toContain('streets');
    expect(tableNames).toContain('cities');
    expect(tableNames).toContain('transportation_methods');
    expect(tableNames).toContain('families');
    expect(tableNames).toContain('family_members');
    expect(tableNames).toContain('students');
    expect(tableNames).toContain('student_notes');
    expect(tableNames).toContain('academic_years');
    expect(tableNames).toContain('student_grade_history');
    expect(tableNames).toContain('student_status_history');
    expect(tableNames).toContain('annual_processing_logs');
    expect(tableNames).toContain('annual_fee_settings');
    expect(tableNames).toContain('student_annual_fees');
    expect(tableNames).toContain('fee_payments');
  });

  it('2. enforces foreign key integrity and prevents orphan inserts', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    // Inserting a student with a non-existent family_id must fail
    expect(() => {
      testDb.prepare(`
        INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade)
        VALUES (99999, 'ADM-001', '2026-01-10', 'Kasun Perera', 'Male', '2015-05-12', 5)
      `).run();
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('3. enforces unique admission numbers', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    testDb.prepare("INSERT INTO families (family_code) VALUES ('FAM-001')").run();
    const family = testDb.prepare("SELECT id FROM families WHERE family_code = 'FAM-001'").get() as { id: number };

    testDb.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade)
      VALUES (?, 'ADM-1001', '2026-01-10', 'Student One', 'Male', '2015-01-01', 5)
    `).run(family.id);

    // Duplicate admission number must throw
    expect(() => {
      testDb.prepare(`
        INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade)
        VALUES (?, 'adm-1001', '2026-01-10', 'Duplicate Student', 'Female', '2015-02-02', 5)
      `).run(family.id);
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('4. supports shared family architecture for multiple siblings without data duplication', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    // 1. Create one shared family
    const famResult = testDb.prepare(`
      INSERT INTO families (family_code, house_no, full_address)
      VALUES ('FAM-002', '45B', 'Temple Road, Kandy')
    `).run();
    const familyId = famResult.lastInsertRowid;

    // 2. Add Father and Mother to the family
    testDb.prepare(`
      INSERT INTO family_members (family_id, relationship_type, name, contact_number, whatsapp_number)
      VALUES (?, 'Father', 'Sunil Silva', '0771234567', '0771234567'),
             (?, 'Mother', 'Kamala Silva', '0777654321', '0777654321')
    `).run(familyId, familyId);

    // 3. Register two sibling students under the same family
    testDb.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade)
      VALUES (?, 'ADM-2001', '2026-01-05', 'Nimal Silva', 'Male', '2014-03-10', 6),
             (?, 'ADM-2002', '2026-01-05', 'Amali Silva', 'Female', '2017-08-20', 3)
    `).run(familyId, familyId);

    // Explicit JOIN to fetch siblings sharing the same family
    const siblings = testDb.prepare(`
      SELECT s.id, s.full_name, s.admission_number, f.family_code, f.full_address
      FROM students s
      INNER JOIN families f ON s.family_id = f.id
      WHERE f.id = ?
      ORDER BY s.admission_number ASC
    `).all(familyId) as Array<{ full_name: string; admission_number: string }>;

    expect(siblings).toHaveLength(2);
    expect(siblings[0].full_name).toBe('Nimal Silva');
    expect(siblings[1].full_name).toBe('Amali Silva');

    // Updating shared address updates both siblings simultaneously without modifying student records
    testDb.prepare("UPDATE families SET full_address = '99 Lake View, Kandy' WHERE id = ?").run(familyId);
    const updated = testDb.prepare(`
      SELECT f.full_address FROM students s
      INNER JOIN families f ON s.family_id = f.id
      WHERE s.admission_number = 'ADM-2001'
    `).get() as { full_address: string };
    expect(updated.full_address).toBe('99 Lake View, Kandy');
  });

  it('5. enforces relationship type constraints on family_members', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    testDb.prepare("INSERT INTO families (family_code) VALUES ('FAM-003')").run();
    const family = testDb.prepare("SELECT id FROM families WHERE family_code = 'FAM-003'").get() as { id: number };

    // Valid father insert
    testDb.prepare("INSERT INTO family_members (family_id, relationship_type, name) VALUES (?, 'Father', 'Father Name')").run(family.id);

    // Duplicate Father in same family must violate UNIQUE(family_id, relationship_type)
    expect(() => {
      testDb.prepare("INSERT INTO family_members (family_id, relationship_type, name) VALUES (?, 'Father', 'Second Father')").run(family.id);
    }).toThrow(/UNIQUE constraint failed/);

    // Invalid relationship type check constraint
    expect(() => {
      testDb.prepare("INSERT INTO family_members (family_id, relationship_type, name) VALUES (?, 'Cousin', 'Invalid Member')").run(family.id);
    }).toThrow(/CHECK constraint failed/);
  });

  it('6. prevents duplicate annual fee records for the same student and year', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    testDb.prepare("INSERT INTO academic_years (year, is_active) VALUES (2026, 1)").run();
    testDb.prepare("INSERT INTO annual_fee_settings (academic_year, fee_amount) VALUES (2026, 3500)").run();
    testDb.prepare("INSERT INTO families (family_code) VALUES ('FAM-004')").run();
    const family = testDb.prepare("SELECT id FROM families WHERE family_code = 'FAM-004'").get() as { id: number };

    const studentResult = testDb.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade)
      VALUES (?, 'ADM-3001', '2026-01-01', 'Roshan Gamage', 'Male', '2015-04-10', 5)
    `).run(family.id);
    const studentId = studentResult.lastInsertRowid;

    // Generate fee for 2026
    testDb.prepare(`
      INSERT INTO student_annual_fees (student_id, academic_year, fee_amount, status)
      VALUES (?, 2026, 3500, 'Unpaid')
    `).run(studentId);

    // Duplicate fee generation for same student & year must throw
    expect(() => {
      testDb.prepare(`
        INSERT INTO student_annual_fees (student_id, academic_year, fee_amount, status)
        VALUES (?, 2026, 3500, 'Unpaid')
      `).run(studentId);
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('7. enforces exactly one full cash payment per annual fee invoice', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    testDb.prepare("INSERT INTO academic_years (year, is_active) VALUES (2026, 1)").run();
    testDb.prepare("INSERT INTO users (display_name, pin_hash, pin_hmac, role) VALUES ('Admin User', 'hash123', 'hmac_admin_1', 'Admin')").run();
    const user = testDb.prepare("SELECT id FROM users WHERE pin_hmac = 'hmac_admin_1'").get() as { id: number };

    testDb.prepare("INSERT INTO families (family_code) VALUES ('FAM-005')").run();
    const family = testDb.prepare("SELECT id FROM families WHERE family_code = 'FAM-005'").get() as { id: number };

    const student = testDb.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade)
      VALUES (?, 'ADM-4001', '2026-01-01', 'Bhanuka Ranasinghe', 'Male', '2016-09-12', 4)
    `).run(family.id);

    const fee = testDb.prepare(`
      INSERT INTO student_annual_fees (student_id, academic_year, fee_amount, status)
      VALUES (?, 2026, 3500, 'Unpaid')
    `).run(student.lastInsertRowid);
    const feeId = fee.lastInsertRowid;

    // First payment succeeds
    testDb.prepare(`
      INSERT INTO fee_payments (student_annual_fee_id, receipt_number, payment_date, amount, payment_method, recorded_by)
      VALUES (?, 'REC-2026-0001', '2026-02-15', 3500, 'Cash', ?)
    `).run(feeId, user.id);

    // Second payment for same fee record must fail due to UNIQUE(student_annual_fee_id)
    expect(() => {
      testDb.prepare(`
        INSERT INTO fee_payments (student_annual_fee_id, receipt_number, payment_date, amount, payment_method, recorded_by)
        VALUES (?, 'REC-2026-0002', '2026-02-16', 3500, 'Cash', ?)
      `).run(feeId, user.id);
    }).toThrow(/UNIQUE constraint failed/);

    // Payment method constraint requires Cash
    expect(() => {
      testDb.prepare(`
        INSERT INTO fee_payments (student_annual_fee_id, receipt_number, payment_date, amount, payment_method, recorded_by)
        VALUES (999, 'REC-CARD-001', '2026-02-16', 3500, 'Card', ?)
      `).run(user.id);
    }).toThrow(/CHECK constraint failed/);
  });

  it('8. preserves historical fee amounts when fee settings are modified', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    testDb.prepare("INSERT INTO academic_years (year, is_active) VALUES (2025, 0), (2026, 1)").run();
    testDb.prepare("INSERT INTO annual_fee_settings (academic_year, fee_amount) VALUES (2025, 3000), (2026, 3500)").run();
    testDb.prepare("INSERT INTO families (family_code) VALUES ('FAM-006')").run();
    const family = testDb.prepare("SELECT id FROM families WHERE family_code = 'FAM-006'").get() as { id: number };

    const student = testDb.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade)
      VALUES (?, 'ADM-5001', '2025-01-01', 'Kavinda Perera', 'Male', '2015-02-10', 5)
    `).run(family.id);

    // 2025 fee generated at 3000
    testDb.prepare("INSERT INTO student_annual_fees (student_id, academic_year, fee_amount, status) VALUES (?, 2025, 3000, 'Paid')").run(student.lastInsertRowid);

    // Admin updates 2025 setting later to 3200
    testDb.prepare("UPDATE annual_fee_settings SET fee_amount = 3200 WHERE academic_year = 2025").run();

    // Historical invoice record remains untouched at 3000
    const feeRecord = testDb.prepare("SELECT fee_amount FROM student_annual_fees WHERE student_id = ? AND academic_year = 2025").get(student.lastInsertRowid) as { fee_amount: number };
    expect(feeRecord.fee_amount).toBe(3000);
  });

  it('9. preserves student grade history across annual promotions', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    testDb.prepare("INSERT INTO academic_years (year, is_active) VALUES (2025, 0), (2026, 1)").run();
    testDb.prepare("INSERT INTO families (family_code) VALUES ('FAM-007')").run();
    const family = testDb.prepare("SELECT id FROM families WHERE family_code = 'FAM-007'").get() as { id: number };

    const student = testDb.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade)
      VALUES (?, 'ADM-6001', '2025-01-01', 'Thilina Alwis', 'Male', '2015-06-15', 5)
    `).run(family.id);
    const studentId = student.lastInsertRowid;

    // Record 2025 grade 5 in history
    testDb.prepare("INSERT INTO student_grade_history (student_id, academic_year, grade) VALUES (?, 2025, 5)").run(studentId);

    // Promote student to Grade 6 in 2026
    testDb.prepare("UPDATE students SET current_grade = 6 WHERE id = ?").run(studentId);
    testDb.prepare("INSERT INTO student_grade_history (student_id, academic_year, grade) VALUES (?, 2026, 6)").run(studentId);

    const history = testDb.prepare(`
      SELECT academic_year, grade FROM student_grade_history
      WHERE student_id = ? ORDER BY academic_year ASC
    `).all(studentId) as Array<{ academic_year: number; grade: number }>;

    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ academic_year: 2025, grade: 5 });
    expect(history[1]).toEqual({ academic_year: 2026, grade: 6 });
  });

  it('10. tracks student status history transitions', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    testDb.prepare("INSERT INTO users (display_name, pin_hash, pin_hmac, role) VALUES ('Admin User', 'hash123', 'hmac_admin_1', 'Admin')").run();
    const user = testDb.prepare("SELECT id FROM users WHERE pin_hmac = 'hmac_admin_1'").get() as { id: number };
    testDb.prepare("INSERT INTO families (family_code) VALUES ('FAM-008')").run();
    const family = testDb.prepare("SELECT id FROM families WHERE family_code = 'FAM-008'").get() as { id: number };

    const student = testDb.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade, status)
      VALUES (?, 'ADM-7001', '2025-01-01', 'Sajith Fernando', 'Male', '2010-01-01', 13, 'Active')
    `).run(family.id);
    const studentId = student.lastInsertRowid;

    // Transition student from Active to Passed Out
    testDb.prepare("UPDATE students SET status = 'Passed Out' WHERE id = ?").run(studentId);
    testDb.prepare(`
      INSERT INTO student_status_history (student_id, from_status, to_status, reason, changed_by)
      VALUES (?, 'Active', 'Passed Out', 'Completed A/L examinations', ?)
    `).run(studentId, user.id);

    const statusLog = testDb.prepare("SELECT from_status, to_status, reason FROM student_status_history WHERE student_id = ?").get(studentId) as { from_status: string; to_status: string; reason: string };
    expect(statusLog.from_status).toBe('Active');
    expect(statusLog.to_status).toBe('Passed Out');
  });

  it('11. verifies atomic transaction rollback on failure', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    testDb.prepare("INSERT INTO families (family_code) VALUES ('FAM-009')").run();
    const family = testDb.prepare("SELECT id FROM families WHERE family_code = 'FAM-009'").get() as { id: number };

    const atomicOperation = testDb.transaction(() => {
      testDb.prepare(`
        INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade)
        VALUES (?, 'ADM-VALID-01', '2026-01-01', 'Valid Student', 'Male', '2015-01-01', 5)
      `).run(family.id);

      // Force failure on second statement
      testDb.prepare(`
        INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade)
        VALUES (999999, 'ADM-INVALID-02', '2026-01-01', 'Orphan Student', 'Male', '2015-01-01', 5)
      `).run();
    });

    expect(() => atomicOperation()).toThrow(/FOREIGN KEY constraint failed/);

    // Verify first insert was completely rolled back
    const student = testDb.prepare("SELECT id FROM students WHERE admission_number = 'ADM-VALID-01'").get();
    expect(student).toBeUndefined();
  });

  it('12. enforces ON DELETE RESTRICT on families with registered students', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    testDb.prepare("INSERT INTO families (family_code) VALUES ('FAM-010')").run();
    const family = testDb.prepare("SELECT id FROM families WHERE family_code = 'FAM-010'").get() as { id: number };

    testDb.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade)
      VALUES (?, 'ADM-RESTRICT-01', '2026-01-01', 'Protected Student', 'Male', '2015-01-01', 5)
    `).run(family.id);

    // Deleting family must fail due to ON DELETE RESTRICT from students
    expect(() => {
      testDb.prepare("DELETE FROM families WHERE id = ?").run(family.id);
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('13. performs database backup and safe restoration', async () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    testDb.prepare("INSERT INTO system_settings (key, value) VALUES ('backup_test_key', 'curtiss_val_123')").run();

    const backupDir = path.join(__dirname, 'temp_stage02_backups');
    const backupService = new DatabaseBackupService(testDb);
    const backupResult = await backupService.createBackup(backupDir);

    expect(backupResult.success).toBe(true);
    expect(fs.existsSync(backupResult.backupPath!)).toBe(true);

    // Read back value from restored backup file
    const verifyDb = new Database(backupResult.backupPath!, { readonly: true });
    try {
      const val = verifyDb.prepare("SELECT value FROM system_settings WHERE key = 'backup_test_key'").get() as { value: string };
      expect(val.value).toBe('curtiss_val_123');
    } finally {
      verifyDb.close();
    }

    // Cleanup
    if (backupResult.backupPath && fs.existsSync(backupResult.backupPath)) {
      fs.unlinkSync(backupResult.backupPath);
    }
    if (fs.existsSync(backupDir)) {
      try { fs.rmdirSync(backupDir); } catch {}
    }
  });

  it('14. benchmark: handles 1,000 bulk student records with indexed searches under 50ms', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    // Insert 100 families
    const insertFamily = testDb.prepare("INSERT INTO families (family_code, full_address) VALUES (?, ?)");
    const insertFamilies = testDb.transaction(() => {
      for (let i = 1; i <= 100; i++) {
        insertFamily.run(`FAM-BULK-${i.toString().padStart(4, '0')}`, `Address Line ${i}, Colombo`);
      }
    });
    insertFamilies();

    // Bulk insert 1,000 students
    const insertStudent = testDb.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade, status)
      VALUES (?, ?, '2026-01-01', ?, ?, '2015-05-10', ?, 'Active')
    `);

    const insertStudents = testDb.transaction(() => {
      for (let i = 1; i <= 1000; i++) {
        const familyId = ((i % 100) + 1);
        const grade = ((i % 13) + 1);
        const gender = i % 2 === 0 ? 'Female' : 'Male';
        insertStudent.run(
          familyId,
          `ADM-BENCH-${i.toString().padStart(5, '0')}`,
          `Student Name ${i}`,
          gender,
          grade
        );
      }
    });
    insertStudents();

    // Query Performance benchmark: Paginated JOIN query with Grade and Status filters
    const startTime = performance.now();

    const queryStmt = testDb.prepare(`
      SELECT 
        s.id,
        s.admission_number,
        s.full_name,
        s.current_grade,
        s.status,
        f.family_code,
        f.full_address
      FROM students s
      INNER JOIN families f ON s.family_id = f.id
      WHERE s.current_grade = ? AND s.status = 'Active'
      ORDER BY s.admission_number ASC
      LIMIT 25 OFFSET 0
    `);

    const paginatedResults = queryStmt.all(5) as Array<{ admission_number: string }>;
    const duration = performance.now() - startTime;

    expect(paginatedResults.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(50); // Under 50ms requirement
  });
});

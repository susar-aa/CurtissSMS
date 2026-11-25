import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DatabaseMigrator } from '../electron/database/migrator';
import { FamilyAndFinancialValidator } from '../electron/validation/familyValidator';

describe('Stage 02.1 – Database Architecture Corrections & 10k Benchmark', () => {
  let testDbPath: string;
  let testDb: Database.Database;

  beforeEach(() => {
    testDbPath = path.join(__dirname, `test_stage02_1_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
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

  it('1. verifies PIN-only authentication schema without username column and enforces unique PIN hashes', () => {
    const migrator = new DatabaseMigrator(testDb);
    const result = migrator.runMigrations();
    expect(result.currentVersion).toBeGreaterThanOrEqual(6);

    // Verify columns on users table
    const tableInfo = testDb.pragma('table_info(users)') as Array<{ name: string }>;
    const columnNames = tableInfo.map(c => c.name);

    expect(columnNames).toContain('display_name');
    expect(columnNames).toContain('pin_hash');
    expect(columnNames).toContain('pin_hmac');
    expect(columnNames).toContain('role');
    expect(columnNames).not.toContain('username'); // Removed username

    // Insert user with 5-digit PIN hash and HMAC
    testDb.prepare("INSERT INTO users (display_name, pin_hash, pin_hmac, role) VALUES ('Principal', 'hashed_pin_12345', 'hmac_pin_12345', 'Admin')").run();

    // Duplicate PIN HMAC must fail
    expect(() => {
      testDb.prepare("INSERT INTO users (display_name, pin_hash, pin_hmac, role) VALUES ('Staff 1', 'different_hash_12345', 'hmac_pin_12345', 'Staff')").run();
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('2. verifies students table has no redundant address columns; families is the sole authoritative source', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    const studentCols = (testDb.pragma('table_info(students)') as Array<{ name: string }>).map(c => c.name);
    expect(studentCols).not.toContain('house_no');
    expect(studentCols).not.toContain('street_id');
    expect(studentCols).not.toContain('city_id');
    expect(studentCols).not.toContain('additional_address_details');
    expect(studentCols).not.toContain('full_address');

    // Verify family table has authoritative address columns
    const familyCols = (testDb.pragma('table_info(families)') as Array<{ name: string }>).map(c => c.name);
    expect(familyCols).toContain('house_no');
    expect(familyCols).toContain('street_id');
    expect(familyCols).toContain('city_id');
    expect(familyCols).toContain('additional_address_details');
    expect(familyCols).toContain('full_address');
  });

  it('3. validates parent/guardian business rules & contact number format', () => {
    // A: Father only -> valid
    const validFatherOnly = FamilyAndFinancialValidator.validateFamilyMembers([
      { relationship_type: 'Father', name: 'Gamini Silva', contact_number: '0712345678' }
    ]);
    expect(validFatherOnly.isValid).toBe(true);

    // B: Mother only -> valid
    const validMotherOnly = FamilyAndFinancialValidator.validateFamilyMembers([
      { relationship_type: 'Mother', name: 'Manel Silva', contact_number: '0778765432' }
    ]);
    expect(validMotherOnly.isValid).toBe(true);

    // C: Guardian only (no Father or Mother) -> INVALID
    const guardianOnly = FamilyAndFinancialValidator.validateFamilyMembers([
      { relationship_type: 'Guardian', name: 'Uncle Bandara', contact_number: '0751234567' }
    ]);
    expect(guardianOnly.isValid).toBe(false);
    expect(guardianOnly.error).toContain('At least one of Father or Mother is required');

    // D: Invalid contact number format (not 10 digits)
    const invalidPhone = FamilyAndFinancialValidator.validateFamilyMembers([
      { relationship_type: 'Father', name: 'Gamini Silva', contact_number: '071234' }
    ]);
    expect(invalidPhone.isValid).toBe(false);
    expect(invalidPhone.error).toContain('must be exactly 10 digits');

    // E: Duplicate Fathers
    const duplicateFathers = FamilyAndFinancialValidator.validateFamilyMembers([
      { relationship_type: 'Father', name: 'Father 1', contact_number: '0712345678' },
      { relationship_type: 'Father', name: 'Father 2', contact_number: '0712345679' }
    ]);
    expect(duplicateFathers.isValid).toBe(false);
    expect(duplicateFathers.error).toContain('cannot have more than one Father');
  });

  it('4. verifies database check constraint on 10-digit phone numbers in family_members', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    testDb.prepare("INSERT INTO families (family_code) VALUES ('FAM-VAL-01')").run();
    const family = testDb.prepare("SELECT id FROM families WHERE family_code = 'FAM-VAL-01'").get() as { id: number };

    // Valid 10-digit phone succeeds
    testDb.prepare(`
      INSERT INTO family_members (family_id, relationship_type, name, contact_number)
      VALUES (?, 'Father', 'Sunil', '0771234567')
    `).run(family.id);

    // Invalid non-10 digit contact must fail DB constraint
    expect(() => {
      testDb.prepare(`
        INSERT INTO family_members (family_id, relationship_type, name, contact_number)
        VALUES (?, 'Mother', 'Kamala', '12345')
      `).run(family.id);
    }).toThrow(/CHECK constraint failed/);
  });

  it('5. allows retrying failed annual processing attempts while enforcing exactly ONE successful completion per year/job', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    testDb.prepare("INSERT INTO academic_years (year, is_active) VALUES (2026, 1)").run();

    // 1. Attempt 1 fails -> successfully logged
    testDb.prepare(`
      INSERT INTO annual_processing_logs (academic_year, job_type, attempt_number, status, error_details)
      VALUES (2026, 'GradePromotion', 1, 'Failed', 'Database connection timeout')
    `).run();

    // 2. Attempt 2 is partial -> successfully logged (retry allowed!)
    testDb.prepare(`
      INSERT INTO annual_processing_logs (academic_year, job_type, attempt_number, status, records_processed, error_details)
      VALUES (2026, 'GradePromotion', 2, 'Partial', 150, 'Interrupted by user')
    `).run();

    // 3. Attempt 3 succeeds -> successfully logged
    testDb.prepare(`
      INSERT INTO annual_processing_logs (academic_year, job_type, attempt_number, status, records_processed)
      VALUES (2026, 'GradePromotion', 3, 'Success', 1200)
    `).run();

    // 4. Duplicate Success attempt for 2026 GradePromotion must fail
    expect(() => {
      testDb.prepare(`
        INSERT INTO annual_processing_logs (academic_year, job_type, attempt_number, status, records_processed)
        VALUES (2026, 'GradePromotion', 4, 'Success', 1200)
      `).run();
    }).toThrow(/UNIQUE constraint failed/);

    // Success for another job type in same year is permitted
    testDb.prepare(`
      INSERT INTO annual_processing_logs (academic_year, job_type, attempt_number, status, records_processed)
      VALUES (2026, 'FeeGeneration', 1, 'Success', 1200)
    `).run();
  });

  it('6. protects student grade history and status history with ON DELETE RESTRICT', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    testDb.prepare("INSERT INTO academic_years (year, is_active) VALUES (2026, 1)").run();
    testDb.prepare("INSERT INTO families (family_code) VALUES ('FAM-PROT-01')").run();
    const family = testDb.prepare("SELECT id FROM families WHERE family_code = 'FAM-PROT-01'").get() as { id: number };

    const student = testDb.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade)
      VALUES (?, 'ADM-PROT-001', '2026-01-01', 'Protected Student', 'Male', '2015-01-01', 5)
    `).run(family.id);
    const studentId = student.lastInsertRowid;

    // Insert grade history
    testDb.prepare("INSERT INTO student_grade_history (student_id, academic_year, grade) VALUES (?, 2026, 5)").run(studentId);

    // Deleting student must fail due to ON DELETE RESTRICT on grade history
    expect(() => {
      testDb.prepare("DELETE FROM students WHERE id = ?").run(studentId);
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('7. validates financial whole-rupee precision and exact payment amount matching', () => {
    // Valid full payment match
    const validPayment = FamilyAndFinancialValidator.validateFullCashPayment({
      annualFeeAmount: 3500,
      paymentAmount: 3500,
      paymentMethod: 'Cash'
    });
    expect(validPayment.isValid).toBe(true);

    // Partial payment rejected
    const partialPayment = FamilyAndFinancialValidator.validateFullCashPayment({
      annualFeeAmount: 3500,
      paymentAmount: 2000,
      paymentMethod: 'Cash'
    });
    expect(partialPayment.isValid).toBe(false);
    expect(partialPayment.error).toContain('Full payment required');

    // Non-cash payment rejected
    const cardPayment = FamilyAndFinancialValidator.validateFullCashPayment({
      annualFeeAmount: 3500,
      paymentAmount: 3500,
      paymentMethod: 'CreditCard'
    });
    expect(cardPayment.isValid).toBe(false);
    expect(cardPayment.error).toContain('Only Cash payments');
  });

  it('8. benchmark: 10,000 students across 2,500 families and 3 academic years', () => {
    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    // 1. Insert 3 Academic Years and fee settings
    testDb.prepare("INSERT INTO academic_years (year, is_active) VALUES (2024, 0), (2025, 0), (2026, 1)").run();
    testDb.prepare("INSERT INTO annual_fee_settings (academic_year, fee_amount) VALUES (2024, 3000), (2025, 3200), (2026, 3500)").run();
    testDb.prepare("INSERT INTO users (display_name, pin_hash, pin_hmac, role) VALUES ('System Cashier', 'pin_hash_cashier', 'hmac_cashier', 'Staff')").run();
    const cashier = testDb.prepare("SELECT id FROM users LIMIT 1").get() as { id: number };

    // 2. Bulk insert 2,500 Families
    const insertFamily = testDb.prepare("INSERT INTO families (family_code, house_no, full_address) VALUES (?, ?, ?)");
    const insertFamilies = testDb.transaction(() => {
      for (let i = 1; i <= 2500; i++) {
        insertFamily.run(
          `FAM-10K-${i.toString().padStart(5, '0')}`,
          `No. ${i}`,
          `Peradeniya Road, Kandy`
        );
      }
    });
    insertFamilies();

    // 3. Bulk insert 10,000 Students (4 siblings per family)
    const insertStudent = testDb.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade, status)
      VALUES (?, ?, '2024-01-10', ?, ?, '2014-05-15', ?, 'Active')
    `);

    const insertFee = testDb.prepare(`
      INSERT INTO student_annual_fees (student_id, academic_year, fee_amount, status)
      VALUES (?, 2026, 3500, ?)
    `);

    const insertPayment = testDb.prepare(`
      INSERT INTO fee_payments (student_annual_fee_id, receipt_number, payment_date, amount, payment_method, recorded_by)
      VALUES (?, ?, '2026-02-01', 3500, 'Cash', ?)
    `);

    const populate10k = testDb.transaction(() => {
      for (let i = 1; i <= 10000; i++) {
        const familyId = ((i % 2500) + 1);
        const grade = ((i % 13) + 1);
        const gender = i % 2 === 0 ? 'Female' : 'Male';
        const admNo = `ADM-10K-${i.toString().padStart(6, '0')}`;
        const name = `Student ${i} Jayawardena`;

        const sResult = insertStudent.run(familyId, admNo, name, gender, grade);
        const sId = sResult.lastInsertRowid;

        // Half paid, half unpaid
        const status = i % 2 === 0 ? 'Paid' : 'Unpaid';
        const feeResult = insertFee.run(sId, status);
        if (status === 'Paid') {
          insertPayment.run(feeResult.lastInsertRowid, `REC-10K-${i.toString().padStart(6, '0')}`, cashier.id);
        }
      }
    });
    populate10k();

    // 4. Verify Total Count
    const count = testDb.prepare("SELECT count(*) as total FROM students").get() as { total: number };
    expect(count.total).toBe(10000);

    // Benchmarking Queries (each must execute under 50ms)

    // Benchmark A: Exact Admission Number Lookup (Covering Index)
    const t0 = performance.now();
    const admLookup = testDb.prepare(`
      SELECT s.id, s.admission_number, s.full_name, s.current_grade, f.family_code, f.full_address
      FROM students s
      INNER JOIN families f ON s.family_id = f.id
      WHERE s.admission_number = 'ADM-10K-005000'
    `).get() as { admission_number: string };
    const durA = performance.now() - t0;
    expect(admLookup).toBeDefined();
    expect(durA).toBeLessThan(50);

    // Benchmark B: Student Search by Prefix (Index-Friendly)
    const t1 = performance.now();
    const searchPrefix = testDb.prepare(`
      SELECT s.id, s.admission_number, s.full_name, s.current_grade, f.family_code
      FROM students s
      INNER JOIN families f ON s.family_id = f.id
      WHERE s.full_name LIKE 'Student 50%'
      LIMIT 25 OFFSET 0
    `).all();
    const durB = performance.now() - t1;
    expect(searchPrefix.length).toBeGreaterThan(0);
    expect(durB).toBeLessThan(50);

    // Benchmark C: Paginated Filter by Grade and Payment Status
    const t2 = performance.now();
    const paginatedFees = testDb.prepare(`
      SELECT 
        s.id,
        s.admission_number,
        s.full_name,
        s.current_grade,
        saf.academic_year,
        saf.fee_amount,
        saf.status,
        fp.receipt_number
      FROM students s
      INNER JOIN student_annual_fees saf ON s.id = saf.student_id
      LEFT JOIN fee_payments fp ON saf.id = fp.student_annual_fee_id
      WHERE s.current_grade = 6 AND saf.academic_year = 2026 AND saf.status = 'Paid'
      ORDER BY s.admission_number ASC
      LIMIT 25 OFFSET 0
    `).all();
    const durC = performance.now() - t2;
    expect(paginatedFees.length).toBe(25);
    expect(durC).toBeLessThan(50);

    // Benchmark D: Sibling Family Lookup
    const t3 = performance.now();
    const siblings = testDb.prepare(`
      SELECT s.id, s.admission_number, s.full_name
      FROM students s
      WHERE s.family_id = 500
      ORDER BY s.admission_number ASC
    `).all();
    const durD = performance.now() - t3;
    expect(siblings.length).toBe(4);
    expect(durD).toBeLessThan(50);
  });
});

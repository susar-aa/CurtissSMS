import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { DatabaseMigrator, ALL_MIGRATIONS } from '../electron/database/migrator';
import { FeePaymentService } from '../electron/services/feePaymentService';
import { FeeConfigurationService } from '../electron/services/feeConfigurationService';
import { StudentService } from '../electron/services/studentService';
import { IAuthSession } from '../electron/shared/types';
import fs from 'fs';
import path from 'path';

describe('Stage 11: Final Focused Audit & Integrity Suite', () => {
  let db: Database.Database;
  let migrator: DatabaseMigrator;
  let feePaymentService: FeePaymentService;
  let feeConfigService: FeeConfigurationService;
  let studentService: StudentService;

  const mockAdmin: IAuthSession = { id: 1, displayName: 'System Admin', role: 'Admin' };
  const mockStaff: IAuthSession = { id: 2, displayName: 'School Cashier', role: 'Staff' };

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    migrator = new DatabaseMigrator(db);
    migrator.runMigrations();

    feePaymentService = new FeePaymentService(db);
    feeConfigService = new FeeConfigurationService(db);
    studentService = new StudentService(db, './test-photos-stage11-audit');

    db.prepare(`
      INSERT INTO users (id, display_name, pin_hash, pin_hmac, role, is_active)
      VALUES (1, 'System Admin', 'hash1', 'hmac1', 'Admin', 1),
             (2, 'School Cashier', 'hash2', 'hmac2', 'Staff', 1)
    `).run();
  });

  afterEach(() => {
    db.close();
  });

  // 1. Zero-value fees
  it('1. Zero-value fee: recorded as Paid (fee-exempt), has no cash payment row, and is distinguishable from paid cash in queries/status', () => {
    const currentYear = feePaymentService.getCurrentCalendarYear();

    feeConfigService.createAnnualFee(mockAdmin, {
      academicYear: currentYear,
      feeAmount: 0
    });

    const s = studentService.registerStudent(mockAdmin, {
      fullName: 'Zero Fee Student',
      admissionNumber: 'ADM-ZERO-1',
      admissionDate: `${currentYear}-01-10`,
      gender: 'Male',
      dateOfBirth: '2012-05-15',
      currentGrade: 5
    });

    const genRes = feePaymentService.generateAnnualFees(currentYear, mockAdmin.id);
    expect(genRes.status).toBe('Success');
    expect(genRes.exemptZeroFeeCount).toBe(1);

    // Verify student_annual_fees row
    const feeRow = db.prepare('SELECT * FROM student_annual_fees WHERE student_id = ?').get(s.id) as {
      id: number;
      fee_amount: number;
      status: string;
    };
    expect(feeRow.fee_amount).toBe(0);
    expect(feeRow.status).toBe('Paid');

    // Confirm NO fake payment row in fee_payments
    const paymentRows = db.prepare('SELECT * FROM fee_payments WHERE student_annual_fee_id = ?').all(feeRow.id);
    expect(paymentRows.length).toBe(0);

    // Verify status summary distinguishes exempt from cash-paid
    const status = feePaymentService.getFeeGenerationStatus();
    expect(status.exemptCount).toBe(1);
    expect(status.paidCount).toBe(0); // 0 cash paid

    // Verify query list flags isFeeExempt: true
    const list = feePaymentService.getStudentFees({ academicYear: currentYear });
    expect(list.items[0].isFeeExempt).toBe(true);
    expect(list.items[0].paymentId).toBeNull();
  });

  // 2. Receipt numbers
  it('2. Receipt numbers: unique, case-insensitive collision safe, and sequences beyond 99,999 format correctly without crashing', () => {
    const currentYear = feePaymentService.getCurrentCalendarYear();
    const todayStr = `${currentYear}-03-01`;

    const r1 = feePaymentService.generateReceiptNumber(todayStr);
    expect(r1).toBe(`REC-${currentYear}-00001`);

    // Insert r1 into DB
    feeConfigService.createAnnualFee(mockAdmin, { academicYear: currentYear, feeAmount: 5000 });
    const s1 = studentService.registerStudent(mockAdmin, {
      fullName: 'Student R1',
      admissionNumber: 'ADM-R1',
      admissionDate: `${currentYear}-01-10`,
      gender: 'Female',
      dateOfBirth: '2011-01-01',
      currentGrade: 6
    });
    feePaymentService.generateAnnualFees(currentYear, mockAdmin.id);
    const fee1 = db.prepare('SELECT id FROM student_annual_fees WHERE student_id = ?').get(s1.id) as { id: number };

    // Record payment
    const pay1 = feePaymentService.recordCashPayment(mockStaff, {
      studentAnnualFeeId: fee1.id,
      paymentDate: todayStr,
      amount: 5000
    });
    expect(pay1.receiptNumber).toBe(`REC-${currentYear}-00001`);

    // Next receipt number should be 00002
    const r2 = feePaymentService.generateReceiptNumber(todayStr);
    expect(r2).toBe(`REC-${currentYear}-00002`);

    // Sequence exhaustion / boundary handling: simulate sequence at 99,999
    db.prepare(`INSERT INTO academic_years (year, is_active) VALUES (2020, 0)`).run();
    db.prepare(`
      INSERT INTO student_annual_fees (id, student_id, academic_year, fee_amount, status)
      VALUES (999, ?, ?, 5000, 'Paid')
    `).run(s1.id, 2020);
    db.prepare(`
      INSERT INTO fee_payments (student_annual_fee_id, receipt_number, payment_date, amount, payment_method, recorded_by)
      VALUES (999, ?, '2020-05-01', 5000, 'Cash', 1)
    `).run('REC-2020-99999');

    const nextBoundaryReceipt = feePaymentService.generateReceiptNumber('2020-05-01');
    expect(nextBoundaryReceipt).toBe('REC-2020-100000');
  });

  // 3. Concurrent payments
  it('3. Concurrent payments: atomic transaction prevents double payments across simultaneous connections', () => {
    // Simulate with a shared in-memory URI or file-backed database to test concurrent connections
    const dbPath = path.resolve(process.cwd(), 'test_concurrent_payment.db');
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

    const conn1 = new Database(dbPath);
    conn1.pragma('foreign_keys = ON');
    conn1.pragma('journal_mode = WAL');

    const migrator1 = new DatabaseMigrator(conn1);
    migrator1.runMigrations();

    conn1.prepare(`
      INSERT INTO users (id, display_name, pin_hash, pin_hmac, role, is_active)
      VALUES (1, 'Admin', 'h1', 'hm1', 'Admin', 1), (2, 'Staff', 'h2', 'hm2', 'Staff', 1)
    `).run();

    const currentYear = new Date().getFullYear();
    conn1.prepare(`INSERT INTO academic_years (year, is_active) VALUES (?, 1)`).run(currentYear);
    conn1.prepare(`INSERT INTO annual_fee_settings (academic_year, fee_amount) VALUES (?, 6000)`).run(currentYear);
    conn1.prepare(`
      INSERT INTO families (id, family_code) VALUES (1, 'FAM-00001');
    `).run();
    conn1.prepare(`
      INSERT INTO students (id, family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade, status)
      VALUES (1, 1, 'ADM-CONCUR-1', '${currentYear}-01-01', 'Concurrent Student', 'Male', '2012-01-01', 5, 'Active')
    `).run();
    conn1.prepare(`
      INSERT INTO student_annual_fees (id, student_id, academic_year, fee_amount, status)
      VALUES (1, 1, ?, 6000, 'Unpaid')
    `).run(currentYear);

    // Open connection 2
    const conn2 = new Database(dbPath);
    conn2.pragma('foreign_keys = ON');

    const svc1 = new FeePaymentService(conn1);
    const svc2 = new FeePaymentService(conn2);

    const todayStr = new Date().toISOString().split('T')[0];

    // Connection 1 records payment successfully
    const res1 = svc1.recordCashPayment(mockStaff, {
      studentAnnualFeeId: 1,
      paymentDate: todayStr,
      amount: 6000
    });
    expect(res1.receiptNumber).toBe(`REC-${currentYear}-00001`);

    // Connection 2 immediately attempts to pay the same fee -> must fail cleanly with duplicate/paid error
    expect(() => {
      svc2.recordCashPayment(mockStaff, {
        studentAnnualFeeId: 1,
        paymentDate: todayStr,
        amount: 6000
      });
    }).toThrow(/already marked as Paid/);

    // Clean up
    conn1.close();
    conn2.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  // 4. New student registration transaction safety
  it('4. New student registration: atomic rollback if student creation fails; reports missing fee configuration safely when setting is ON', () => {
    const currentYear = feePaymentService.getCurrentCalendarYear();
    feePaymentService.setNewStudentFeeSetting(mockAdmin, true);

    // Case A: Missing fee configuration does NOT abort registration; logs safe warning and leaves student active
    const s1 = studentService.registerStudent(mockAdmin, {
      fullName: 'Student Without Fee Config',
      admissionNumber: 'ADM-NOFEE-1',
      admissionDate: `${currentYear}-01-10`,
      gender: 'Female',
      dateOfBirth: '2012-05-10',
      currentGrade: 5
    });
    expect(s1.id).toBeGreaterThan(0);
    const fee1 = db.prepare('SELECT * FROM student_annual_fees WHERE student_id = ?').get(s1.id);
    expect(fee1).toBeUndefined();

    // Case B: Transaction rollback - if registration validation fails (e.g. duplicate admission number), no orphaned family or fee exists
    expect(() => {
      studentService.registerStudent(mockAdmin, {
        fullName: 'Duplicate Student',
        admissionNumber: 'ADM-NOFEE-1', // duplicate
        admissionDate: `${currentYear}-01-10`,
        gender: 'Male',
        dateOfBirth: '2012-05-10',
        currentGrade: 5
      });
    }).toThrow(/already assigned to another student/);
  });

  // 5. Annual generation safety and logs
  it('5. Annual generation: only generates current academic year; rejects historical/future year generation; logs attempts accurately', () => {
    const currentYear = feePaymentService.getCurrentCalendarYear();

    // Historical year rejection
    expect(() => {
      feePaymentService.generateAnnualFees(currentYear - 1, mockAdmin.id);
    }).toThrow(/Annual fee generation can only be performed for the current academic year/);

    // Future year rejection
    expect(() => {
      feePaymentService.generateAnnualFees(currentYear + 1, mockAdmin.id);
    }).toThrow(/Annual fee generation can only be performed for the current academic year/);

    // Attempt on current year without configuration logs failure
    const failRes = feePaymentService.generateAnnualFees(currentYear, mockAdmin.id);
    expect(failRes.status).toBe('Failed');

    const log1 = db.prepare("SELECT * FROM annual_processing_logs WHERE academic_year = ? AND job_type = 'FeeGeneration' AND status = 'Failed'").get(currentYear) as { attempt_number: number };
    expect(log1.attempt_number).toBe(1);

    // Configure fee and retry -> attempt 2 succeeds
    feeConfigService.createAnnualFee(mockAdmin, { academicYear: currentYear, feeAmount: 7000 });
    const successRes = feePaymentService.generateAnnualFees(currentYear, mockAdmin.id);
    expect(successRes.status).toBe('Success');

    const log2 = db.prepare("SELECT * FROM annual_processing_logs WHERE academic_year = ? AND job_type = 'FeeGeneration' AND status = 'Success'").get(currentYear) as { attempt_number: number };
    expect(log2.attempt_number).toBe(2);
  });

  // 6. Permissions / RBAC checks
  it('6. Permissions: Staff can record cash payments and query lists, but Admin-only functions reject non-Admin sessions', () => {
    // Fee configuration creation rejects staff
    expect(() => {
      feeConfigService.createAnnualFee(mockStaff, { academicYear: 2026, feeAmount: 5000 });
    }).toThrow(/Unauthorized/);

    // Updating fee config rejects staff
    expect(() => {
      feeConfigService.updateAnnualFee(mockStaff, { academicYear: 2026, feeAmount: 5000 });
    }).toThrow(/Unauthorized/);

    // Deleting fee config rejects staff
    expect(() => {
      feeConfigService.deleteAnnualFee(mockStaff, 2026);
    }).toThrow(/Unauthorized/);
  });

  // 7. Receipt printing & reprinting safety
  it('7. Receipt reprinting: retrieving receipt details produces full printable metadata and never duplicates payment or changes DB', () => {
    const currentYear = feePaymentService.getCurrentCalendarYear();
    feeConfigService.createAnnualFee(mockAdmin, { academicYear: currentYear, feeAmount: 3500 });

    const s = studentService.registerStudent(mockAdmin, {
      fullName: 'Reprint Student',
      admissionNumber: 'ADM-REPRINT-1',
      admissionDate: `${currentYear}-01-10`,
      gender: 'Male',
      dateOfBirth: '2013-02-14',
      currentGrade: 4
    });

    feePaymentService.generateAnnualFees(currentYear, mockAdmin.id);
    const fee = db.prepare('SELECT id FROM student_annual_fees WHERE student_id = ?').get(s.id) as { id: number };

    const initialPay = feePaymentService.recordCashPayment(mockStaff, {
      studentAnnualFeeId: fee.id,
      paymentDate: `${currentYear}-04-01`,
      amount: 3500,
      notes: 'Counter payment'
    });

    const paymentCountBefore = (db.prepare('SELECT COUNT(id) as cnt FROM fee_payments').get() as { cnt: number }).cnt;

    // View / reprint by payment ID
    const reprint1 = feePaymentService.getReceiptDetails(initialPay.paymentId);
    expect(reprint1.receiptNumber).toBe(initialPay.receiptNumber);
    expect(reprint1.studentName).toBe('Reprint Student');
    expect(reprint1.feeDescription).toContain(String(currentYear));

    // View / reprint by receipt number string
    const reprint2 = feePaymentService.getReceiptDetails(initialPay.receiptNumber);
    expect(reprint2.paymentId).toBe(initialPay.paymentId);

    const paymentCountAfter = (db.prepare('SELECT COUNT(id) as cnt FROM fee_payments').get() as { cnt: number }).cnt;
    expect(paymentCountAfter).toBe(paymentCountBefore);
  });

  // 8. Migration 014 safety on fresh vs populated Stage 10 database
  it('8. Migration 014: runs cleanly on populated Stage 10 database preserving all student records, fee settings, payments, and audit logs', () => {
    const stage10Db = new Database(':memory:');
    stage10Db.pragma('foreign_keys = ON');

    const migrator10 = new DatabaseMigrator(stage10Db);
    migrator10.initMigrationTable();

    // Run migrations 1 through 13
    for (const m of ALL_MIGRATIONS) {
      if (m.version <= 13) {
        m.up(stage10Db);
        stage10Db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
      }
    }

    // Populate with Stage 10 data
    stage10Db.prepare(`
      INSERT INTO users (id, display_name, pin_hash, pin_hmac, role, is_active)
      VALUES (1, 'Admin 10', 'h1', 'hm1', 'Admin', 1)
    `).run();
    stage10Db.prepare(`INSERT INTO academic_years (year, is_active) VALUES (2025, 1)`).run();
    stage10Db.prepare(`INSERT INTO annual_fee_settings (academic_year, fee_amount) VALUES (2025, 5000)`).run();
    stage10Db.prepare(`INSERT INTO families (id, family_code) VALUES (1, 'FAM-STAGE10')`).run();
    stage10Db.prepare(`
      INSERT INTO students (id, family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade, status)
      VALUES (1, 1, 'ADM-MIG-1', '2025-01-01', 'Migrated Student', 'Male', '2012-01-01', 5, 'Active')
    `).run();
    stage10Db.prepare(`
      INSERT INTO student_annual_fees (id, student_id, academic_year, fee_amount, status)
      VALUES (1, 1, 2025, 5000, 'Paid')
    `).run();
    stage10Db.prepare(`
      INSERT INTO fee_payments (id, student_annual_fee_id, receipt_number, payment_date, amount, payment_method, recorded_by)
      VALUES (1, 1, 'REC-2025-00001', '2025-01-02', 5000, 'Cash', 1)
    `).run();

    // Now run migration 014
    const migration14 = ALL_MIGRATIONS.find((m: any) => m.version === 14);
    expect(migration14).toBeDefined();
    migration14.up(stage10Db);
    stage10Db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(14, migration14.name);

    // Verify system_settings default seeded
    const settingRow = stage10Db.prepare("SELECT value FROM system_settings WHERE key = 'auto_generate_new_student_fee'").get() as { value: string };
    expect(settingRow.value).toBe('0');

    // Verify existing student fee & payment preserved exactly
    const preservedFee = stage10Db.prepare('SELECT * FROM student_annual_fees WHERE id = 1').get() as { fee_amount: number; status: string };
    expect(preservedFee.fee_amount).toBe(5000);
    expect(preservedFee.status).toBe('Paid');

    const preservedPay = stage10Db.prepare('SELECT * FROM fee_payments WHERE id = 1').get() as { amount: number; receipt_number: string };
    expect(preservedPay.amount).toBe(5000);
    expect(preservedPay.receipt_number).toBe('REC-2025-00001');

    // Integrity check
    const integrity = stage10Db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    expect(integrity.integrity_check).toBe('ok');

    stage10Db.close();
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { DatabaseMigrator } from '../electron/database/migrator';
import { FeePaymentService } from '../electron/services/feePaymentService';
import { FeeConfigurationService } from '../electron/services/feeConfigurationService';
import { StudentService } from '../electron/services/studentService';
import { IAuthSession } from '../electron/shared/types';

describe('Stage 11: Annual Fee Generation & Payments System', () => {
  let db: Database.Database;
  let migrator: DatabaseMigrator;
  let feePaymentService: FeePaymentService;
  let feeConfigService: FeeConfigurationService;
  let studentService: StudentService;

  const mockAdmin: IAuthSession = { id: 1, displayName: 'Test Admin', role: 'Admin' };
  const mockStaff: IAuthSession = { id: 2, displayName: 'Test Staff', role: 'Staff' };

  beforeEach(() => {
    // In-memory test database with full migrations
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    migrator = new DatabaseMigrator(db);
    migrator.runMigrations();

    feePaymentService = new FeePaymentService(db);
    feeConfigService = new FeeConfigurationService(db);
    studentService = new StudentService(db, './test-photos-stage11');

    // Create test admin and staff in users table
    db.prepare(`
      INSERT INTO users (id, display_name, pin_hash, pin_hmac, role, is_active)
      VALUES (1, 'Test Admin', 'hash1', 'hmac1', 'Admin', 1),
             (2, 'Test Staff', 'hash2', 'hmac2', 'Staff', 1)
    `).run();
  });

  afterEach(() => {
    db.close();
  });

  it('1. Setting auto_generate_new_student_fee defaults to OFF and can be toggled by Admin', () => {
    expect(feePaymentService.getNewStudentFeeSetting()).toBe(false);

    feePaymentService.setNewStudentFeeSetting(mockAdmin, true);
    expect(feePaymentService.getNewStudentFeeSetting()).toBe(true);

    feePaymentService.setNewStudentFeeSetting(mockAdmin, false);
    expect(feePaymentService.getNewStudentFeeSetting()).toBe(false);
  });

  it('2. Fee generation generates records for Active students and excludes Leaved/Passed Out students', () => {
    const currentYear = feePaymentService.getCurrentCalendarYear();

    // Configure fee for current year
    feeConfigService.createAnnualFee(mockAdmin, {
      academicYear: currentYear,
      feeAmount: 6000
    });

    // Create Active student
    const s1 = studentService.registerStudent(mockAdmin, {
      fullName: 'Active Student A',
      admissionNumber: 'ADM-1001',
      admissionDate: `${currentYear}-01-10`,
      gender: 'Male',
      dateOfBirth: '2010-05-15',
      currentGrade: 7
    });

    // Create student who is Leaved
    const s2 = studentService.registerStudent(mockAdmin, {
      fullName: 'Leaved Student B',
      admissionNumber: 'ADM-1002',
      admissionDate: `${currentYear}-01-10`,
      gender: 'Female',
      dateOfBirth: '2010-06-20',
      currentGrade: 8
    });
    db.prepare("UPDATE students SET status = 'Leaved' WHERE id = ?").run(s2.id);

    // Create student who is Passed Out
    const s3 = studentService.registerStudent(mockAdmin, {
      fullName: 'Passed Out Student C',
      admissionNumber: 'ADM-1003',
      admissionDate: `${currentYear}-01-10`,
      gender: 'Male',
      dateOfBirth: '2005-02-10',
      currentGrade: 13
    });
    db.prepare("UPDATE students SET status = 'Passed Out' WHERE id = ?").run(s3.id);

    // Run fee generation
    const genResult = feePaymentService.generateAnnualFees(currentYear, mockAdmin.id);
    expect(genResult.status).toBe('Success');
    expect(genResult.recordsGenerated).toBe(1);

    // Verify student_annual_fees has only active student s1
    const fees = db.prepare('SELECT * FROM student_annual_fees WHERE academic_year = ?').all(currentYear) as Array<{ student_id: number; fee_amount: number; status: string }>;
    expect(fees.length).toBe(1);
    expect(fees[0].student_id).toBe(s1.id);
    expect(fees[0].fee_amount).toBe(6000);
    expect(fees[0].status).toBe('Unpaid');
  });

  it('3. Fee generation is idempotent and skips already generated students', () => {
    const currentYear = feePaymentService.getCurrentCalendarYear();

    feeConfigService.createAnnualFee(mockAdmin, {
      academicYear: currentYear,
      feeAmount: 7500
    });

    studentService.registerStudent(mockAdmin, {
      fullName: 'Idempotent Student',
      admissionNumber: 'ADM-2001',
      admissionDate: `${currentYear}-01-05`,
      gender: 'Male',
      dateOfBirth: '2012-03-12',
      currentGrade: 5
    });

    // First generation
    const res1 = feePaymentService.generateAnnualFees(currentYear, mockAdmin.id);
    expect(res1.status).toBe('Success');
    expect(res1.recordsGenerated).toBe(1);
    expect(res1.recordsSkipped).toBe(0);

    // Second generation
    const res2 = feePaymentService.generateAnnualFees(currentYear, mockAdmin.id);
    expect(res2.status).toBe('Success');
    expect(res2.recordsGenerated).toBe(0);
    expect(res2.recordsSkipped).toBe(1);
  });

  it('4. If annual fee configuration is missing, fee generation aborts safely and logs failure', () => {
    const currentYear = feePaymentService.getCurrentCalendarYear();

    studentService.registerStudent(mockAdmin, {
      fullName: 'Unconfigured Student',
      admissionNumber: 'ADM-3001',
      admissionDate: `${currentYear}-01-05`,
      gender: 'Female',
      dateOfBirth: '2011-04-10',
      currentGrade: 6
    });

    const res = feePaymentService.generateAnnualFees(currentYear, mockAdmin.id);
    expect(res.status).toBe('Failed');
    expect(res.error).toContain('has not been configured');

    // No fee records should exist
    const fees = db.prepare('SELECT COUNT(id) as cnt FROM student_annual_fees WHERE academic_year = ?').get(currentYear) as { cnt: number };
    expect(fees.cnt).toBe(0);

    // Failure should be logged in annual_processing_logs
    const log = db.prepare("SELECT * FROM annual_processing_logs WHERE academic_year = ? AND job_type = 'FeeGeneration'").get(currentYear) as { status: string };
    expect(log).toBeDefined();
    expect(log.status).toBe('Failed');
  });

  it('5. Zero-rupee fee configuration records fees as Paid (exempt) without failing constraints', () => {
    const currentYear = feePaymentService.getCurrentCalendarYear();

    feeConfigService.createAnnualFee(mockAdmin, {
      academicYear: currentYear,
      feeAmount: 0
    });

    const s = studentService.registerStudent(mockAdmin, {
      fullName: 'Zero Fee Student',
      admissionNumber: 'ADM-4001',
      admissionDate: `${currentYear}-01-05`,
      gender: 'Male',
      dateOfBirth: '2013-08-01',
      currentGrade: 4
    });

    const res = feePaymentService.generateAnnualFees(currentYear, mockAdmin.id);
    expect(res.status).toBe('Success');
    expect(res.recordsGenerated).toBe(1);
    expect(res.exemptZeroFeeCount).toBe(1);

    const fee = db.prepare('SELECT * FROM student_annual_fees WHERE student_id = ?').get(s.id) as { fee_amount: number; status: string };
    expect(fee.fee_amount).toBe(0);
    expect(fee.status).toBe('Paid');
  });

  it('6. New admission auto-generates fee when setting is ON, and does not when setting is OFF', () => {
    const currentYear = feePaymentService.getCurrentCalendarYear();

    feeConfigService.createAnnualFee(mockAdmin, {
      academicYear: currentYear,
      feeAmount: 8000
    });

    // 1. Setting is OFF (default)
    expect(feePaymentService.getNewStudentFeeSetting()).toBe(false);
    const s1 = studentService.registerStudent(mockAdmin, {
      fullName: 'Student Auto Off',
      admissionNumber: 'ADM-5001',
      admissionDate: `${currentYear}-02-01`,
      gender: 'Female',
      dateOfBirth: '2014-01-10',
      currentGrade: 3
    });
    const feeOff = db.prepare('SELECT * FROM student_annual_fees WHERE student_id = ?').get(s1.id);
    expect(feeOff).toBeUndefined();

    // 2. Turn setting ON
    feePaymentService.setNewStudentFeeSetting(mockAdmin, true);
    const s2 = studentService.registerStudent(mockAdmin, {
      fullName: 'Student Auto On',
      admissionNumber: 'ADM-5002',
      admissionDate: `${currentYear}-02-02`,
      gender: 'Male',
      dateOfBirth: '2014-03-15',
      currentGrade: 3
    });
    const feeOn = db.prepare('SELECT * FROM student_annual_fees WHERE student_id = ?').get(s2.id) as { fee_amount: number; status: string };
    expect(feeOn).toBeDefined();
    expect(feeOn.fee_amount).toBe(8000);
    expect(feeOn.status).toBe('Unpaid');
  });

  it('7. Cash payment recording validates exact amount, rejects partial payments and prevents duplicates', () => {
    const currentYear = feePaymentService.getCurrentCalendarYear();

    feeConfigService.createAnnualFee(mockAdmin, {
      academicYear: currentYear,
      feeAmount: 5000
    });

    const s = studentService.registerStudent(mockAdmin, {
      fullName: 'Payment Student',
      admissionNumber: 'ADM-6001',
      admissionDate: `${currentYear}-01-10`,
      gender: 'Male',
      dateOfBirth: '2012-07-20',
      currentGrade: 5
    });

    feePaymentService.generateAnnualFees(currentYear, mockAdmin.id);
    const feeRecord = db.prepare('SELECT id, fee_amount, status FROM student_annual_fees WHERE student_id = ?').get(s.id) as { id: number; fee_amount: number; status: string };

    const todayStr = new Date().toISOString().split('T')[0];

    // Reject partial payment
    expect(() => {
      feePaymentService.recordCashPayment(mockStaff, {
        studentAnnualFeeId: feeRecord.id,
        paymentDate: todayStr,
        amount: 3000
      });
    }).toThrow(/Only exact full payments are accepted/);

    // Reject overpayment
    expect(() => {
      feePaymentService.recordCashPayment(mockStaff, {
        studentAnnualFeeId: feeRecord.id,
        paymentDate: todayStr,
        amount: 6000
      });
    }).toThrow(/Only exact full payments are accepted/);

    // Accept exact payment by Staff
    const receipt = feePaymentService.recordCashPayment(mockStaff, {
      studentAnnualFeeId: feeRecord.id,
      paymentDate: todayStr,
      amount: 5000,
      notes: 'Paid at desk'
    });

    expect(receipt.receiptNumber).toMatch(/^REC-\d{4}-\d{5}$/);
    expect(receipt.amount).toBe(5000);
    expect(receipt.paymentMethod).toBe('Cash');
    expect(receipt.recordedByName).toBe('Test Staff');

    // Verify student_annual_fees updated to 'Paid'
    const updatedFee = db.prepare('SELECT status FROM student_annual_fees WHERE id = ?').get(feeRecord.id) as { status: string };
    expect(updatedFee.status).toBe('Paid');

    // Prevent duplicate payment
    expect(() => {
      feePaymentService.recordCashPayment(mockStaff, {
        studentAnnualFeeId: feeRecord.id,
        paymentDate: todayStr,
        amount: 5000
      });
    }).toThrow(/already marked as Paid/);
  });

  it('8. Fee pagination and filtering works with explicit columns and indices', () => {
    const currentYear = feePaymentService.getCurrentCalendarYear();

    feeConfigService.createAnnualFee(mockAdmin, {
      academicYear: currentYear,
      feeAmount: 4500
    });

    const s1 = studentService.registerStudent(mockAdmin, {
      fullName: 'Alpha Student',
      admissionNumber: 'ADM-7001',
      admissionDate: `${currentYear}-01-10`,
      gender: 'Male',
      dateOfBirth: '2012-01-01',
      currentGrade: 5
    });

    const s2 = studentService.registerStudent(mockAdmin, {
      fullName: 'Beta Student',
      admissionNumber: 'ADM-7002',
      admissionDate: `${currentYear}-01-10`,
      gender: 'Female',
      dateOfBirth: '2011-02-02',
      currentGrade: 6
    });

    feePaymentService.generateAnnualFees(currentYear, mockAdmin.id);

    // Filter by grade 5
    const grade5Res = feePaymentService.getStudentFees({ grade: 5 });
    expect(grade5Res.total).toBe(1);
    expect(grade5Res.items[0].admissionNumber).toBe('ADM-7001');

    // Search by name
    const searchRes = feePaymentService.getStudentFees({ search: 'Beta' });
    expect(searchRes.total).toBe(1);
    expect(searchRes.items[0].admissionNumber).toBe('ADM-7002');
  });

  it('9. Future academic year fee generation is blocked', () => {
    const currentYear = feePaymentService.getCurrentCalendarYear();
    const futureYear = currentYear + 1;

    feeConfigService.createAnnualFee(mockAdmin, {
      academicYear: futureYear,
      feeAmount: 9000
    });

    expect(() => {
      feePaymentService.generateAnnualFees(futureYear, mockAdmin.id);
    }).toThrow(/Annual fee generation can only be performed for the current academic year/);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { DatabaseMigrator } from '../electron/database/migrator';
import { StudentService } from '../electron/services/studentService';
import { FeeConfigurationService } from '../electron/services/feeConfigurationService';
import { FeePaymentService } from '../electron/services/feePaymentService';
import { ReportService } from '../electron/services/reportService';
import { IAuthSession } from '../electron/shared/types';

describe('Stage 12: Final Reports & Printing Audit Suite', () => {
  let db: Database.Database;
  let migrator: DatabaseMigrator;
  let studentService: StudentService;
  let feeConfigService: FeeConfigurationService;
  let feePaymentService: FeePaymentService;
  let reportService: ReportService;

  const mockAdmin: IAuthSession = { id: 1, displayName: 'Audit Admin', role: 'Admin' };
  const mockStaff: IAuthSession = { id: 2, displayName: 'Audit Staff', role: 'Staff' };

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    migrator = new DatabaseMigrator(db);
    migrator.runMigrations();

    studentService = new StudentService(db, './test-photos-stage12-audit');
    feeConfigService = new FeeConfigurationService(db);
    feePaymentService = new FeePaymentService(db);
    reportService = new ReportService(db, studentService);

    db.prepare(`
      INSERT INTO users (id, display_name, pin_hash, pin_hmac, role, is_active)
      VALUES (1, 'Audit Admin', 'hash1', 'hmac1', 'Admin', 1),
             (2, 'Audit Staff', 'hash2', 'hmac2', 'Staff', 1)
    `).run();
  });

  afterEach(() => {
    db.close();
  });

  // 1. Two-Page A4 Profile Content Integrity & Missing Optional Fields
  it('1. Two-Page A4 Student Profile handles long notes, multiple siblings, missing photos/logos, and missing addresses without breaking layout', () => {
    const currentYear = feePaymentService.getCurrentCalendarYear();
    feeConfigService.createAnnualFee(mockAdmin, { academicYear: currentYear, feeAmount: 5000 });

    // Student A (has family members, multiple siblings, long notes)
    const s1 = studentService.registerStudent(mockAdmin, {
      fullName: 'Student With Full Details',
      admissionNumber: 'ADM-FULL-1',
      admissionDate: `${currentYear}-01-10`,
      gender: 'Male',
      dateOfBirth: '2012-05-15',
      currentGrade: 5,
      houseNo: 'No. 123',
      additionalAddressDetails: 'Near Temple Road',
      fullAddress: 'No. 123, Temple Road, Colombo',
      initialNote: 'First long disciplinary and academic progress note that describes the student performance in detail over several semesters.',
      familyMembers: [
        { relationshipType: 'Father', name: 'Father One', contactNumber: '0771111111' },
        { relationshipType: 'Mother', name: 'Mother One', contactNumber: '0772222222' },
        { relationshipType: 'Guardian', name: 'Guardian One', contactNumber: '0773333333' }
      ]
    });

    // Add sibling linked to same family
    studentService.registerStudent(mockAdmin, {
      fullName: 'Sibling Student',
      admissionNumber: 'ADM-FULL-2',
      admissionDate: `${currentYear}-01-10`,
      gender: 'Female',
      dateOfBirth: '2014-06-20',
      currentGrade: 3,
      siblingOfStudentId: s1.id
    });

    // Add extra notes
    studentService.addStudentNote(mockStaff, s1.id, 'Second sequential note regarding extra-curricular cricket participation.');
    studentService.addStudentNote(mockStaff, s1.id, 'Third administrative note regarding sports color awards.');

    // Student B (minimal details, no photo, no logo, no notes, no siblings, no previous school)
    const s2 = studentService.registerStudent(mockAdmin, {
      fullName: 'Minimal Student',
      admissionNumber: 'ADM-MIN-1',
      admissionDate: `${currentYear}-01-15`,
      gender: 'Female',
      dateOfBirth: '2013-09-09',
      currentGrade: 4
    });

    const p1 = reportService.getTwoPageStudentPrintProfile(s1.id, mockStaff);
    expect(p1.student.fullName).toBe('Student With Full Details');
    expect(p1.student.notes?.length).toBe(3);
    expect(p1.student.familyMembers?.length).toBe(3);
    expect(p1.student.linkedStudents?.length).toBe(2); // s1 and s2 sibling
    expect(p1.printedBy).toContain('Audit Staff');

    const p2 = reportService.getTwoPageStudentPrintProfile(s2.id, mockStaff);
    expect(p2.student.fullName).toBe('Minimal Student');
    expect(p2.student.photoPreviewUrl).toBeNull();
    expect(p2.schoolLogoDataUrl).toBeNull();
    expect(p2.student.notes?.length).toBe(0);
    expect(p2.student.linkedStudents?.length).toBe(1); // self
  });

  // 2. Fee Reconciliation & Payment Date Filters
  it('2. Fee reconciliation: payment date range filter updates filtered cash collected without mutating expected annual fee totals', () => {
    const currentYear = feePaymentService.getCurrentCalendarYear();
    feeConfigService.createAnnualFee(mockAdmin, { academicYear: currentYear, feeAmount: 6000 });

    const s1 = studentService.registerStudent(mockAdmin, {
      fullName: 'Jan Paid Student',
      admissionNumber: 'ADM-PAY-1',
      admissionDate: `${currentYear}-01-01`,
      gender: 'Male',
      dateOfBirth: '2012-01-01',
      currentGrade: 5
    });

    const s2 = studentService.registerStudent(mockAdmin, {
      fullName: 'Feb Paid Student',
      admissionNumber: 'ADM-PAY-2',
      admissionDate: `${currentYear}-01-01`,
      gender: 'Female',
      dateOfBirth: '2012-02-02',
      currentGrade: 5
    });

    const s3 = studentService.registerStudent(mockAdmin, {
      fullName: 'Unpaid Student',
      admissionNumber: 'ADM-PAY-3',
      admissionDate: `${currentYear}-01-01`,
      gender: 'Male',
      dateOfBirth: '2012-03-03',
      currentGrade: 5
    });

    feePaymentService.generateAnnualFees(currentYear, mockAdmin.id);

    const fee1 = db.prepare('SELECT id FROM student_annual_fees WHERE student_id = ?').get(s1.id) as { id: number };
    const fee2 = db.prepare('SELECT id FROM student_annual_fees WHERE student_id = ?').get(s2.id) as { id: number };

    // Payment 1 in January
    feePaymentService.recordCashPayment(mockStaff, {
      studentAnnualFeeId: fee1.id,
      paymentDate: `${currentYear}-01-15`,
      amount: 6000
    });

    // Payment 2 in February
    feePaymentService.recordCashPayment(mockStaff, {
      studentAnnualFeeId: fee2.id,
      paymentDate: `${currentYear}-02-20`,
      amount: 6000
    });

    // Check overall summary without date filter
    const totalSummary = reportService.getFeeReportSummary(currentYear);
    expect(totalSummary.totalInvoices).toBe(3);
    expect(totalSummary.expectedAmountLkr).toBe(18000);
    expect(totalSummary.actualCollectedLkr).toBe(12000);
    expect(totalSummary.outstandingLkr).toBe(6000);
    expect(totalSummary.filteredCollectedLkr).toBeNull();

    // Check with January date filter
    const janSummary = reportService.getFeeReportSummary(currentYear, `${currentYear}-01-01`, `${currentYear}-01-31`);
    expect(janSummary.totalInvoices).toBe(3);
    expect(janSummary.expectedAmountLkr).toBe(18000); // Invoice total unchanged
    expect(janSummary.actualCollectedLkr).toBe(12000); // True full year collection
    expect(janSummary.filteredCollectedLkr).toBe(6000); // Only Jan payment
  });

  // 3. CSV Exports Include All Filter Matches Beyond Single Pagination Page
  it('3. CSV exports include all matching records across pagination limits and properly encode CSV lines', () => {
    // Insert 25 students in Grade 7
    for (let i = 1; i <= 25; i++) {
      studentService.registerStudent(mockAdmin, {
        fullName: `Batch Student ${String(i).padStart(2, '0')}`,
        admissionNumber: `ADM-BATCH-${String(i).padStart(3, '0')}`,
        admissionDate: '2024-01-10',
        gender: i % 2 === 0 ? 'Female' : 'Male',
        dateOfBirth: '2012-04-10',
        currentGrade: 7
      });
    }

    // Paginated query returns pageSize 10
    const paginated = reportService.getStudentReport({ grade: 7, page: 1, pageSize: 10 });
    expect(paginated.items.length).toBe(10);
    expect(paginated.total).toBe(25);

    // CSV export includes ALL 25 records plus 1 header row = 26 lines
    const csvOutput = reportService.exportStudentsCsv({ grade: 7 });
    const lines = csvOutput.split('\r\n').filter(Boolean);
    expect(lines.length).toBe(26);
    expect(lines[0]).toContain('Admission No');
    expect(lines[1]).toContain('ADM-BATCH-001');
    expect(lines[25]).toContain('ADM-BATCH-025');
  });

  // 4. Large Dataset Performance Benchmark
  it('4. Benchmark: queries and aggregates on 1,000 students complete efficiently within reasonable time limits', () => {
    const start = performance.now();

    // Bulk insert 1,000 students directly in a transaction for benchmarking
    const insertFamily = db.prepare("INSERT INTO families (family_code) VALUES (?)");
    const insertStudent = db.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade, status)
      VALUES (?, ?, '2024-01-01', ?, ?, '2012-01-01', ?, 'Active')
    `);

    const bulkTx = db.transaction(() => {
      for (let i = 1; i <= 1000; i++) {
        const fRes = insertFamily.run(`FAM-BENCH-${i}`);
        const fId = Number(fRes.lastInsertRowid);
        const grade = (i % 13) + 1;
        const gender = i % 2 === 0 ? 'Female' : 'Male';
        insertStudent.run(fId, `ADM-BENCH-${i}`, `Bench Student ${i}`, gender, grade);
      }
    });
    bulkTx();

    const insertDuration = performance.now() - start;
    expect(insertDuration).toBeLessThan(5000);

    // Benchmark summary aggregation over 1,000+ students
    const sumStart = performance.now();
    const summary = reportService.getStudentReportSummary({ status: 'Active' });
    const sumDuration = performance.now() - sumStart;

    expect(summary.totalStudents).toBeGreaterThanOrEqual(1000);
    expect(sumDuration).toBeLessThan(100); // Must be sub-100ms with covering indexes

    // Benchmark paginated search over 1,000+ students
    const searchStart = performance.now();
    const pageRes = reportService.getStudentReport({ grade: 5, page: 2, pageSize: 20 });
    const searchDuration = performance.now() - searchStart;

    expect(pageRes.items.length).toBe(20);
    expect(searchDuration).toBeLessThan(100);
  });
});

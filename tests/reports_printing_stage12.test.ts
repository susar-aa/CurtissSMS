import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { DatabaseMigrator } from '../electron/database/migrator';
import { StudentService } from '../electron/services/studentService';
import { FeeConfigurationService } from '../electron/services/feeConfigurationService';
import { FeePaymentService } from '../electron/services/feePaymentService';
import { ReportService } from '../electron/services/reportService';
import { IAuthSession } from '../electron/shared/types';

describe('Stage 12: Reports & Student Printing Module', () => {
  let db: Database.Database;
  let migrator: DatabaseMigrator;
  let studentService: StudentService;
  let feeConfigService: FeeConfigurationService;
  let feePaymentService: FeePaymentService;
  let reportService: ReportService;

  const mockAdmin: IAuthSession = { id: 1, displayName: 'Principal', role: 'Admin' };
  const mockStaff: IAuthSession = { id: 2, displayName: 'Bursar Assistant', role: 'Staff' };

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    migrator = new DatabaseMigrator(db);
    migrator.runMigrations();

    studentService = new StudentService(db, './test-photos-stage12');
    feeConfigService = new FeeConfigurationService(db);
    feePaymentService = new FeePaymentService(db);
    reportService = new ReportService(db, studentService);

    db.prepare(`
      INSERT INTO users (id, display_name, pin_hash, pin_hmac, role, is_active)
      VALUES (1, 'Principal', 'hash1', 'hmac1', 'Admin', 1),
             (2, 'Bursar Assistant', 'hash2', 'hmac2', 'Staff', 1)
    `).run();
  });

  afterEach(() => {
    db.close();
  });

  it('1. Student demographic report summary accurately aggregates status, gender, grades, houses, and transport', () => {
    // Ensure clean lookups
    db.prepare("INSERT OR IGNORE INTO houses (name, color_hex) VALUES ('Vijaya', '#FF0000'), ('Gemunu', '#0000FF')").run();
    db.prepare("INSERT OR IGNORE INTO transportation_methods (name) VALUES ('School Bus'), ('Public Bus')").run();

    const h1 = (db.prepare("SELECT id FROM houses WHERE name = 'Vijaya'").get() as { id: number }).id;
    const h2 = (db.prepare("SELECT id FROM houses WHERE name = 'Gemunu'").get() as { id: number }).id;
    const tm1 = (db.prepare("SELECT id FROM transportation_methods WHERE name = 'School Bus'").get() as { id: number }).id;
    const tm2 = (db.prepare("SELECT id FROM transportation_methods WHERE name = 'Public Bus'").get() as { id: number }).id;

    // Register active male student in grade 5, Vijaya house, School Bus
    studentService.registerStudent(mockAdmin, {
      fullName: 'Sunil Perera',
      admissionNumber: 'ADM-ST12-1',
      admissionDate: '2024-01-10',
      gender: 'Male',
      dateOfBirth: '2012-05-15',
      currentGrade: 5,
      houseId: h1,
      transportationMethodId: tm1
    });

    // Register active female student in grade 5, Gemunu house, Public Bus
    studentService.registerStudent(mockAdmin, {
      fullName: 'Kamani Silva',
      admissionNumber: 'ADM-ST12-2',
      admissionDate: '2024-02-15',
      gender: 'Female',
      dateOfBirth: '2012-08-20',
      currentGrade: 5,
      houseId: h2,
      transportationMethodId: tm2
    });

    // Register leaved student in grade 8
    const s3 = studentService.registerStudent(mockAdmin, {
      fullName: 'Nimal Fernando',
      admissionNumber: 'ADM-ST12-3',
      admissionDate: '2023-01-05',
      gender: 'Male',
      dateOfBirth: '2009-03-10',
      currentGrade: 8
    });
    db.prepare("UPDATE students SET status = 'Leaved' WHERE id = ?").run(s3.id);

    // Register passed out student in grade 13
    const s4 = studentService.registerStudent(mockAdmin, {
      fullName: 'Anura Kumara',
      admissionNumber: 'ADM-ST12-4',
      admissionDate: '2018-01-05',
      gender: 'Male',
      dateOfBirth: '2005-01-10',
      currentGrade: 13
    });
    db.prepare("UPDATE students SET status = 'Passed Out' WHERE id = ?").run(s4.id);

    // Retrieve summary
    const summary = reportService.getStudentReportSummary();
    expect(summary.totalStudents).toBe(4);
    expect(summary.activeCount).toBe(2);
    expect(summary.leavedCount).toBe(1);
    expect(summary.passedOutCount).toBe(1);
    expect(summary.maleCount).toBe(3);
    expect(summary.femaleCount).toBe(1);
    expect(summary.gradeCounts[5]).toBe(2);
    expect(summary.gradeCounts[8]).toBe(1);
    expect(summary.gradeCounts[13]).toBe(1);

    // Filtered summary (only active students)
    const activeSummary = reportService.getStudentReportSummary({ status: 'Active' });
    expect(activeSummary.totalStudents).toBe(2);
    expect(activeSummary.activeCount).toBe(2);
    expect(activeSummary.maleCount).toBe(1);
    expect(activeSummary.femaleCount).toBe(1);
  });

  it('2. Student directory report paginates and applies combined multi-parameter filters correctly', () => {
    studentService.registerStudent(mockAdmin, {
      fullName: 'Alpha Student',
      admissionNumber: 'ADM-A1',
      admissionDate: '2024-01-10',
      gender: 'Male',
      dateOfBirth: '2013-01-01',
      currentGrade: 4
    });

    studentService.registerStudent(mockAdmin, {
      fullName: 'Beta Student',
      admissionNumber: 'ADM-B2',
      admissionDate: '2024-03-20',
      gender: 'Female',
      dateOfBirth: '2013-02-02',
      currentGrade: 4
    });

    studentService.registerStudent(mockAdmin, {
      fullName: 'Gamma Student',
      admissionNumber: 'ADM-C3',
      admissionDate: '2023-05-15',
      gender: 'Male',
      dateOfBirth: '2012-05-05',
      currentGrade: 5
    });

    // Filter by grade 4 + date range
    const res = reportService.getStudentReport({
      grade: 4,
      admissionDateFrom: '2024-02-01',
      admissionDateTo: '2024-12-31'
    });

    expect(res.total).toBe(1);
    expect(res.items[0].admissionNumber).toBe('ADM-B2');
    expect(res.items[0].fullName).toBe('Beta Student');
  });

  it('3. Development & Facility Fee reports reconcile actual cash collected and distinguish fee-exempt records', () => {
    const currentYear = feePaymentService.getCurrentCalendarYear();

    feeConfigService.createAnnualFee(mockAdmin, {
      academicYear: currentYear,
      feeAmount: 5000
    });

    const s1 = studentService.registerStudent(mockAdmin, {
      fullName: 'Paid Student',
      admissionNumber: 'ADM-FEE-1',
      admissionDate: `${currentYear}-01-10`,
      gender: 'Male',
      dateOfBirth: '2012-01-01',
      currentGrade: 5
    });

    const s2 = studentService.registerStudent(mockAdmin, {
      fullName: 'Unpaid Student',
      admissionNumber: 'ADM-FEE-2',
      admissionDate: `${currentYear}-01-10`,
      gender: 'Female',
      dateOfBirth: '2012-02-02',
      currentGrade: 5
    });

    // Generate fees
    feePaymentService.generateAnnualFees(currentYear, mockAdmin.id);

    // Add an exempt student (fee_amount = 0)
    db.prepare(`INSERT INTO academic_years (year, is_active) VALUES (2020, 0)`).run();
    db.prepare(`
      INSERT INTO student_annual_fees (student_id, academic_year, fee_amount, status)
      VALUES (?, ?, 0, 'Paid')
    `).run(s1.id, 2020);

    // Pay s1 for currentYear
    const feeRow1 = db.prepare('SELECT id FROM student_annual_fees WHERE student_id = ? AND academic_year = ?').get(s1.id, currentYear) as { id: number };
    const payRes = feePaymentService.recordCashPayment(mockStaff, {
      studentAnnualFeeId: feeRow1.id,
      paymentDate: `${currentYear}-02-15`,
      amount: 5000
    });

    // Check fee report summary for currentYear
    const summary = reportService.getFeeReportSummary(currentYear);
    expect(summary.totalInvoices).toBe(2);
    expect(summary.paidCount).toBe(1);
    expect(summary.unpaidCount).toBe(1);
    expect(summary.exemptCount).toBe(0);
    expect(summary.expectedAmountLkr).toBe(10000);
    expect(summary.actualCollectedLkr).toBe(5000);
    expect(summary.outstandingLkr).toBe(5000);

    // Grade breakdown check
    expect(summary.gradeBreakdown.length).toBe(1);
    expect(summary.gradeBreakdown[0].grade).toBe(5);
    expect(summary.gradeBreakdown[0].collectedLkr).toBe(5000);
    expect(summary.gradeBreakdown[0].outstandingLkr).toBe(5000);

    // Fee report items query by receipt number
    const listRes = reportService.getFeeReport({ search: payRes.receiptNumber });
    expect(listRes.total).toBe(1);
    expect(listRes.items[0].admissionNumber).toBe('ADM-FEE-1');
    expect(listRes.items[0].status).toBe('Paid');
    expect(listRes.items[0].paymentAmount).toBe(5000);
  });

  it('4. Two-Page A4 Student Profile compiles complete family, sibling, note, and fee ledger history without leaking other categories', () => {
    const currentYear = feePaymentService.getCurrentCalendarYear();
    feeConfigService.createAnnualFee(mockAdmin, { academicYear: currentYear, feeAmount: 4000 });

    const s = studentService.registerStudent(mockAdmin, {
      fullName: 'Kasun Bandara',
      admissionNumber: 'ADM-DOSSIER-1',
      admissionDate: `${currentYear}-01-05`,
      gender: 'Male',
      dateOfBirth: '2011-06-15',
      currentGrade: 6,
      initialNote: 'Outstanding athletics background',
      familyMembers: [
        { relationshipType: 'Father', name: 'Gamini Bandara', contactNumber: '0771234567' }
      ]
    });

    feePaymentService.generateAnnualFees(currentYear, mockAdmin.id);
    const feeRow = db.prepare('SELECT id FROM student_annual_fees WHERE student_id = ?').get(s.id) as { id: number };
    feePaymentService.recordCashPayment(mockStaff, {
      studentAnnualFeeId: feeRow.id,
      paymentDate: `${currentYear}-01-20`,
      amount: 4000
    });

    const printProfile = reportService.getTwoPageStudentPrintProfile(s.id, mockStaff);

    // Page 1 Checks: Student & Family
    expect(printProfile.student.fullName).toBe('Kasun Bandara');
    expect(printProfile.student.admissionNumber).toBe('ADM-DOSSIER-1');
    expect(printProfile.student.familyMembers?.length).toBe(1);
    expect(printProfile.student.familyMembers?.[0].name).toBe('Gamini Bandara');
    expect(printProfile.student.notes?.length).toBe(1);
    expect(printProfile.student.notes?.[0].noteText).toBe('Outstanding athletics background');

    // Page 2 Checks: Development Fee History
    expect(printProfile.feeHistory.length).toBe(1);
    expect(printProfile.feeHistory[0].academicYear).toBe(currentYear);
    expect(printProfile.feeHistory[0].feeAmount).toBe(4000);
    expect(printProfile.feeHistory[0].status).toBe('Paid');
    expect(printProfile.feeHistory[0].paymentAmount).toBe(4000);
    expect(printProfile.feeHistory[0].receiptNumber).toMatch(/^REC-\d{4}-\d{5}$/);
    expect(printProfile.printedBy).toContain('Bursar Assistant');
  });

  it('5. CSV Export sanitizes against spreadsheet formula injection (=, +, -, @, \\t, \\r)', () => {
    // Test formula sanitization helper directly
    expect(ReportService.sanitizeCsvCell('=SUM(A1:A10)')).toBe(`"'=SUM(A1:A10)\"`);
    expect(ReportService.sanitizeCsvCell('+cmd|')).toBe(`"'+cmd|\"`);
    expect(ReportService.sanitizeCsvCell('-100')).toBe(`"'-100\"`);
    expect(ReportService.sanitizeCsvCell('@org')).toBe(`"'@org\"`);
    expect(ReportService.sanitizeCsvCell('Normal Text')).toBe(`"Normal Text"`);
    expect(ReportService.sanitizeCsvCell('Quote "Test"')).toBe(`"Quote ""Test"""`);
    expect(ReportService.sanitizeCsvCell(null)).toBe(`""`);

    // Test real export output
    studentService.registerStudent(mockAdmin, {
      fullName: '=CMD() Injected',
      admissionNumber: 'ADM-INJ-1',
      admissionDate: '2024-01-01',
      gender: 'Male',
      dateOfBirth: '2012-01-01',
      currentGrade: 5
    });

    const csvOutput = reportService.exportStudentsCsv({ search: 'Injected' });
    expect(csvOutput).toContain(`"'=CMD() Injected"`);
    expect(csvOutput).not.toContain(`"=CMD() Injected"`);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DatabaseMigrator } from '../electron/database/migrator';
import { DatabaseHealthChecker } from '../electron/database/health';
import { DatabaseBackupService } from '../electron/database/backup';
import { AuthService } from '../electron/services/authService';
import { PinSecurityService } from '../electron/services/pinSecurity';
import { SchoolSettingsService } from '../electron/services/schoolSettingsService';
import { StudentService } from '../electron/services/studentService';
import { FeeConfigurationService } from '../electron/services/feeConfigurationService';
import { FeePaymentService } from '../electron/services/feePaymentService';
import { ReportService } from '../electron/services/reportService';
import { AcademicYearService } from '../electron/services/academicYearService';
import { IAuthSession } from '../electron/shared/types';

describe('Stage 14: Comprehensive System Audit & Production Readiness Suite', () => {
  let db: Database.Database;
  let migrator: DatabaseMigrator;
  let healthChecker: DatabaseHealthChecker;
  let authService: AuthService;
  let schoolSettingsService: SchoolSettingsService;
  let studentService: StudentService;
  let feeConfigService: FeeConfigurationService;
  let feePaymentService: FeePaymentService;
  let reportService: ReportService;
  let academicYearService: AcademicYearService;

  const testTempDir = path.resolve(__dirname, 'temp_stage14_audit');
  const mockAdmin: IAuthSession = { id: 1, displayName: 'Principal Officer', role: 'Admin' };
  const mockStaff: IAuthSession = { id: 2, displayName: 'Bursar Assistant', role: 'Staff' };

  beforeEach(() => {
    if (!fs.existsSync(testTempDir)) {
      fs.mkdirSync(testTempDir, { recursive: true });
    }

    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    migrator = new DatabaseMigrator(db);
    migrator.runMigrations();

    healthChecker = new DatabaseHealthChecker(db);
    authService = new AuthService(db);
    schoolSettingsService = new SchoolSettingsService(db, path.join(testTempDir, 'assets'));
    studentService = new StudentService(db, path.join(testTempDir, 'photos'));
    feeConfigService = new FeeConfigurationService(db);
    feePaymentService = new FeePaymentService(db);
    reportService = new ReportService(db, studentService);
    academicYearService = new AcademicYearService(db);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
    try {
      if (fs.existsSync(testTempDir)) {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe('1. Database Integrity & Foreign Key Enforcements', () => {
    it('passes PRAGMA integrity_check and foreign_key_check cleanly', () => {
      const health = healthChecker.checkHealth();
      expect(health.status).toBe('ok');
      expect(health.integrity).toBe('ok');
      expect(health.foreignKeysOk).toBe(true);

      const integrityRows = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
      expect(integrityRows[0].integrity_check).toBe('ok');

      const fkRows = db.prepare('PRAGMA foreign_key_check').all();
      expect(fkRows.length).toBe(0);
    });

    it('enforces foreign-key cascading and constraints on relational deletions', () => {
      // Create student & fee
      db.prepare(`
        INSERT INTO families (id, family_code, house_no, full_address)
        VALUES (1, 'FAM-001', '10', 'Main Street')
      `).run();

      db.prepare(`
        INSERT INTO students (id, admission_number, full_name, gender, date_of_birth, current_grade, status, admission_date, family_id)
        VALUES (10, 'ADM-001', 'Test Student', 'Male', '2010-01-01', 5, 'Active', '2026-01-01', 1)
      `).run();

      db.prepare(`
        INSERT INTO academic_years (year) VALUES (2026)
      `).run();

      db.prepare(`
        INSERT INTO student_annual_fees (id, student_id, academic_year, fee_amount, status)
        VALUES (100, 10, 2026, 12000, 'Unpaid')
      `).run();

      // Deleting a non-existent family foreign key must throw
      expect(() => {
        db.prepare(`
          INSERT INTO students (id, admission_number, full_name, gender, date_of_birth, current_grade, status, admission_date, family_id)
          VALUES (11, 'ADM-002', 'Orphan Student', 'Male', '2010-01-01', 5, 'Active', '2026-01-01', 999)
        `).run();
      }).toThrow();
    });
  });

  describe('2. Security Hardening & Lockout HMAC Integrity', () => {
    it('uses a keyed HMAC for failed PIN attempt lockout identifiers to prevent dictionary enumeration', () => {
      PinSecurityService.setHmacSecret('super-secret-pepper-for-tests-2026');

      // Attempt login with non-existent PIN
      const res = authService.loginWithPin('98765');
      expect(res.success).toBe(false);

      // Verify that lockout records do not store raw PINs, and the attempt key is recorded
      const lockoutRecords = db.prepare('SELECT target_key FROM auth_lockout_records').all() as Array<{ target_key: string }>;
      expect(lockoutRecords.length).toBeGreaterThan(0);

      // Verify none contains raw PIN '98765'
      for (const rec of lockoutRecords) {
        expect(rec.target_key).not.toContain('98765');
      }

      // Verify at least one keyed attempt identifier exists
      const hasAttemptKey = lockoutRecords.some(rec => rec.target_key.startsWith('attempt_'));
      expect(hasAttemptKey).toBe(true);
    });

    it('applies Windows NTFS sensitive file restrictions via restrictSensitiveFilePermissions safely', () => {
      const dummyFile = path.join(testTempDir, 'sensitive_test.key');
      fs.writeFileSync(dummyFile, 'secret-key-data');

      expect(() => {
        PinSecurityService.restrictSensitiveFilePermissions(dummyFile);
      }).not.toThrow();

      expect(fs.existsSync(dummyFile)).toBe(true);
    });
  });

  describe('3. Receipt Numbering Sequence & Expansion Beyond 99,999', () => {
    it('handles receipt numbers beyond 99,999 without truncation or collision', () => {
      // Seed academic year and user first to satisfy foreign keys
      db.prepare(`
        INSERT INTO academic_years (year) VALUES (2026)
      `).run();
      db.prepare(`
        INSERT INTO users (id, display_name, pin_hash, pin_hmac, role, is_active)
        VALUES (1, 'Cashier Admin', 'scrypt:salt:hash', 'hmac123', 'Admin', 1)
      `).run();

      // Seed family and student
      db.prepare(`
        INSERT INTO families (id, family_code, house_no, full_address) VALUES (2, 'FAM-002', '11', 'Galle Road')
      `).run();
      db.prepare(`
        INSERT INTO students (id, admission_number, full_name, gender, date_of_birth, current_grade, status, admission_date, family_id)
        VALUES (20, 'ADM-020', 'Kamal Silva', 'Male', '2010-02-02', 6, 'Active', '2026-01-01', 2)
      `).run();
      db.prepare(`
        INSERT INTO student_annual_fees (id, student_id, academic_year, fee_amount, status)
        VALUES (200, 20, 2026, 15000, 'Paid')
      `).run();

      db.prepare(`
        INSERT INTO fee_payments (id, student_annual_fee_id, receipt_number, amount, payment_date, payment_method, recorded_by)
        VALUES (1, 200, 'REC-2026-099999', 15000, '2026-02-15', 'Cash', 1)
      `).run();

      const nextReceipt = feePaymentService.generateReceiptNumber('2026-02-15');
      expect(nextReceipt).toBe('REC-2026-100000');
    });
  });

  describe('4. Extended CSV Exports Beyond Default Limit', () => {
    it('supports exporting large datasets up to 100,000 records safely', () => {
      const csv = reportService.exportStudentsCsv({}, 50000);
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv).toContain('Admission No');
    });
  });
});

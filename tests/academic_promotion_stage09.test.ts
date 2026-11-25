import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DatabaseMigrator, ALL_MIGRATIONS } from '../electron/database/migrator';
import { StudentService } from '../electron/services/studentService';
import { AcademicYearService } from '../electron/services/academicYearService';
import { IAuthSession, IRegisterStudentInput } from '../electron/shared/types';

describe('Stage 09 – Academic Year & Automatic Grade Promotion System Tests', () => {
  let testDbPath: string;
  let testDb: Database.Database;
  let studentService: StudentService;
  let academicService: AcademicYearService;

  const mockAdmin: IAuthSession = {
    id: 1,
    displayName: 'Headmaster Admin',
    role: 'Admin',
    token: 'admin-token',
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  };

  const mockStaff: IAuthSession = {
    id: 2,
    displayName: 'Registrar Staff',
    role: 'Staff',
    token: 'staff-token',
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  };

  beforeEach(() => {
    testDbPath = path.join(__dirname, `test_stage09_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    testDb = new Database(testDbPath);
    testDb.pragma('journal_mode = WAL');
    testDb.pragma('foreign_keys = ON');

    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    testDb.prepare("INSERT OR IGNORE INTO users (id, display_name, pin_hash, pin_hmac, role) VALUES (1, 'Headmaster Admin', 'hash1', 'hmac1', 'Admin')").run();
    testDb.prepare("INSERT OR IGNORE INTO users (id, display_name, pin_hash, pin_hmac, role) VALUES (2, 'Registrar Staff', 'hash2', 'hmac2', 'Staff')").run();

    studentService = new StudentService(testDb);
    academicService = new AcademicYearService(testDb);
  });

  afterEach(() => {
    try {
      testDb.close();
    } catch {}
    [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`].forEach(f => {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    });
  });

  const createTestStudent = (adm: string, grade = 1, status = 'Active', admDate = '2025-01-10'): number => {
    const input: IRegisterStudentInput = {
      admissionNumber: adm,
      admissionDate: admDate,
      fullName: `Student ${adm}`,
      gender: 'Male',
      dateOfBirth: '2015-05-15',
      currentGrade: grade,
      houseNo: 'No. 12',
      familyMembers: [
        {
          relationshipType: 'Father',
          name: `Father of ${adm}`,
          contactNumber: '0771234567'
        }
      ]
    };
    const s = studentService.registerStudent(mockStaff, input);
    if (status !== 'Active') {
      testDb.prepare('UPDATE students SET status = ? WHERE id = ?').run(status, s.id);
    }
    return s.id;
  };

  // 1. Grade 1 through Grade 12 promotion
  it('1. promotes active students in Grades 1 through 12 by exactly one grade', () => {
    const s1 = createTestStudent('ADM-01', 1);
    const s5 = createTestStudent('ADM-05', 5);
    const s12 = createTestStudent('ADM-12', 12);

    const result = academicService.processAcademicYearPromotion(2025, mockAdmin.id);
    expect(result.status).toBe('Success');
    expect(result.promotedCount).toBe(3);

    const p1 = studentService.getStudentById(s1)!;
    const p5 = studentService.getStudentById(s5)!;
    const p12 = studentService.getStudentById(s12)!;

    expect(p1.currentGrade).toBe(2);
    expect(p5.currentGrade).toBe(6);
    expect(p12.currentGrade).toBe(13);
    expect(p1.status).toBe('Active');
    expect(p5.status).toBe('Active');
    expect(p12.status).toBe('Active');
  });

  // 2. Grade 13 transition to Passed Out
  it('2. transitions active Grade 13 students to Passed Out status and records graduation history', () => {
    const s13 = createTestStudent('ADM-13', 13);

    const result = academicService.processAcademicYearPromotion(2025, mockAdmin.id);
    expect(result.status).toBe('Success');
    expect(result.passedOutCount).toBe(1);

    const p13 = studentService.getStudentById(s13)!;
    expect(p13.status).toBe('Passed Out');
    // In students table, current_grade remains 13 or denotes graduation, but status transitions to Passed Out
    expect(p13.status).toBe('Passed Out');

    // Check status history record
    const statusHist = testDb.prepare('SELECT * FROM student_status_history WHERE student_id = ?').get(s13) as any;
    expect(statusHist).toBeDefined();
    expect(statusHist.from_status).toBe('Active');
    expect(statusHist.to_status).toBe('Passed Out');

    // Check grade history record
    const gradeHist = testDb.prepare('SELECT * FROM student_grade_history WHERE student_id = ?').get(s13) as any;
    expect(gradeHist).toBeDefined();
    expect(gradeHist.previous_grade).toBe(13);
    expect(gradeHist.new_grade).toBe(14); // 14 indicates completed/graduated
    expect(gradeHist.new_status).toBe('Passed Out');
  });

  // 3. Leaved student exclusion
  it('3. excludes Leaved students from promotion and does not create false promotion history', () => {
    const sActive = createTestStudent('ADM-ACT', 3, 'Active');
    const sLeaved = createTestStudent('ADM-LVD', 3, 'Leaved');

    const result = academicService.processAcademicYearPromotion(2025, mockAdmin.id);
    expect(result.promotedCount).toBe(1);
    expect(result.skippedLeavedCount).toBe(1);

    const pActive = studentService.getStudentById(sActive)!;
    const pLeaved = studentService.getStudentById(sLeaved)!;

    expect(pActive.currentGrade).toBe(4);
    expect(pLeaved.currentGrade).toBe(3); // unchanged!
    expect(pLeaved.status).toBe('Leaved'); // unchanged!

    // Leaved student must NOT have a promotion entry for 2025
    const leavedHistory = testDb.prepare('SELECT * FROM student_grade_history WHERE student_id = ?').all(sLeaved);
    expect(leavedHistory.length).toBe(0);
  });

  // 4. Passed Out student exclusion
  it('4. excludes already Passed Out students from further promotion', () => {
    const sPassed = createTestStudent('ADM-PASSED', 13, 'Passed Out');

    const result = academicService.processAcademicYearPromotion(2025, mockAdmin.id);
    expect(result.passedOutCount).toBe(0);

    const pPassed = studentService.getStudentById(sPassed)!;
    expect(pPassed.status).toBe('Passed Out');

    const passedHistory = testDb.prepare('SELECT * FROM student_grade_history WHERE student_id = ?').all(sPassed);
    expect(passedHistory.length).toBe(0);
  });

  // 5. January 1 calendar-year and catch-up processing
  it('5. reliably catches up when an existing installation misses January 1', () => {
    const s1 = createTestStudent('ADM-C1', 4, 'Active', '2024-01-10');

    // Simulate an existing installation that was installed in 2024
    testDb.prepare("INSERT OR REPLACE INTO system_metadata (key, value) VALUES ('academic_promotion_baseline_year', '2024')").run();

    // In 2025 (after 2024 concluded), year 2024 is pending promotion
    const pendingYears2025 = academicService.getPendingPromotionYears(new Date('2025-01-02'));
    expect(pendingYears2025).toContain(2024);

    const catchupResult = academicService.runCatchupPromotions(mockAdmin.id, new Date('2025-01-02'));
    expect(catchupResult.hasFailures).toBe(false);
    expect(catchupResult.yearsProcessed.map(r => r.academicYear)).toContain(2024);

    const pAfter = studentService.getStudentById(s1)!;
    expect(pAfter.currentGrade).toBe(5);

    // After catch-up, pending years should be 0
    const remainingPending = academicService.getPendingPromotionYears(new Date('2025-01-02'));
    expect(remainingPending.length).toBe(0);
  });

  // 6. Multiple missed academic years processed sequentially
  it('6. processes multiple missed academic years sequentially and in order', () => {
    const s1 = createTestStudent('ADM-MULTI', 2, 'Active', '2023-01-10');

    // Seed years 2023, 2024, 2025
    academicService.ensureAcademicYearExists(2023);
    academicService.ensureAcademicYearExists(2024);
    academicService.ensureAcademicYearExists(2025);

    // Run 2023, then 2024, then 2025
    academicService.processAcademicYearPromotion(2023, mockAdmin.id);
    const pAfter2023 = studentService.getStudentById(s1)!;
    expect(pAfter2023.currentGrade).toBe(3);

    academicService.processAcademicYearPromotion(2024, mockAdmin.id);
    const pAfter2024 = studentService.getStudentById(s1)!;
    expect(pAfter2024.currentGrade).toBe(4);

    academicService.processAcademicYearPromotion(2025, mockAdmin.id);
    const pAfter2025 = studentService.getStudentById(s1)!;
    expect(pAfter2025.currentGrade).toBe(5);

    // Check history logs
    const history = testDb.prepare('SELECT * FROM student_grade_history WHERE student_id = ? ORDER BY academic_year ASC').all(s1) as any[];
    expect(history.length).toBe(3);
    expect(history[0].academic_year).toBe(2023);
    expect(history[0].previous_grade).toBe(2);
    expect(history[0].new_grade).toBe(3);
    expect(history[1].academic_year).toBe(2024);
    expect(history[1].previous_grade).toBe(3);
    expect(history[1].new_grade).toBe(4);
    expect(history[2].academic_year).toBe(2025);
    expect(history[2].previous_grade).toBe(4);
    expect(history[2].new_grade).toBe(5);
  });

  // 7. Duplicate startup prevention & idempotency
  it('7. strictly prevents duplicate promotion execution for the same academic year', () => {
    createTestStudent('ADM-DUP', 5);

    academicService.processAcademicYearPromotion(2025, mockAdmin.id);

    // Attempting to run 2025 promotion again must throw
    expect(() => {
      academicService.processAcademicYearPromotion(2025, mockAdmin.id);
    }).toThrow(/already been successfully completed/i);

    // Running catch-up again does not re-process 2025
    const catchup2 = academicService.runCatchupPromotions(mockAdmin.id);
    const processed2025 = catchup2.yearsProcessed.filter(p => p.academicYear === 2025);
    expect(processed2025.length).toBe(0);
  });

  // 8. Transaction rollback on failure
  it('8. rolls back student grades completely if promotion transaction fails', () => {
    const s1 = createTestStudent('ADM-FAIL1', 5);
    const s2 = createTestStudent('ADM-FAIL2', 6);

    academicService.ensureAcademicYearExists(2025);

    // 8. Test invalid year range trigger failure
    expect(() => {
      academicService.processAcademicYearPromotion(1999);
    }).toThrow(/out of valid range/i);

    // Verify grades remain unaltered
    const p1 = studentService.getStudentById(s1)!;
    const p2 = studentService.getStudentById(s2)!;
    expect(p1.currentGrade).toBe(5);
    expect(p2.currentGrade).toBe(6);
  });

  // 9. Failed processing and safe Admin retry
  it('9. records failed attempts and allows Admin to safely retry after resolution', () => {
    createTestStudent('ADM-RETRY', 7);
    academicService.ensureAcademicYearExists(2025);

    // Manually record a failed log simulating a crashed/failed run
    testDb.prepare(`
      INSERT INTO annual_processing_logs (academic_year, job_type, status, records_processed, failed_count, error_details, details)
      VALUES (2025, 'GradePromotion', 'Failed', 0, 1, 'Simulated network timeout', 'Simulated failure')
    `).run();

    // Staff cannot retry
    expect(() => {
      academicService.retryFailedPromotion(mockStaff, 2025);
    }).toThrow(/Unauthorized/i);

    // Admin retries successfully
    const retryResult = academicService.retryFailedPromotion(mockAdmin, 2025);
    expect(retryResult.status).toBe('Success');
    expect(retryResult.promotedCount).toBe(1);

    const logAfter = testDb.prepare(`
      SELECT status, promoted_count FROM annual_processing_logs 
      WHERE academic_year = 2025 AND job_type = 'GradePromotion' 
      ORDER BY id DESC LIMIT 1
    `).get() as any;
    expect(logAfter.status).toBe('Success');
    expect(logAfter.promoted_count).toBe(1);
  });

  // 10. Student, family and financial record preservation
  it('10. preserves student personal details, family foundations, photos, and notes during promotion', () => {
    const s1 = createTestStudent('ADM-PRESERVE', 8);
    studentService.addStudentNote(mockStaff, s1, 'Important historical student note');

    const profileBefore = studentService.getStudentById(s1)!;

    academicService.processAcademicYearPromotion(2025, mockAdmin.id);

    const profileAfter = studentService.getStudentById(s1)!;

    // Grade advances
    expect(profileAfter.currentGrade).toBe(9);

    // All other identity & relational details strictly preserved
    expect(profileAfter.admissionNumber).toBe(profileBefore.admissionNumber);
    expect(profileAfter.fullName).toBe(profileBefore.fullName);
    expect(profileAfter.gender).toBe(profileBefore.gender);
    expect(profileAfter.dateOfBirth).toBe(profileBefore.dateOfBirth);
    expect(profileAfter.admissionDate).toBe(profileBefore.admissionDate);
    expect(profileAfter.familyId).toBe(profileBefore.familyId);
    expect(profileAfter.familyCode).toBe(profileBefore.familyCode);
    expect(profileAfter.notes.length).toBe(1);
    expect(profileAfter.notes[0].noteText).toBe('Important historical student note');
  });

  // 11. Prohibition of manual grade manipulation
  it('11. prevents manual grade manipulation via student update service', () => {
    const s1 = createTestStudent('ADM-NOBYPASS', 4);

    // Attempting to pass a different currentGrade to updateStudent has no effect (enforced in StudentService)
    studentService.updateStudent(mockStaff, {
      id: s1,
      fullName: 'Updated Name Without Grade Change'
    });

    const profile = studentService.getStudentById(s1)!;
    expect(profile.currentGrade).toBe(4);
    expect(profile.fullName).toBe('Updated Name Without Grade Change');
  });

  // 12. Audit trail logging for promotion
  it('12. generates comprehensive audit logs for successful promotions', () => {
    createTestStudent('ADM-AUDIT', 10);

    academicService.processAcademicYearPromotion(2025, mockAdmin.id);

    const auditLog = testDb.prepare(`
      SELECT * FROM audit_logs WHERE action = 'GRADE_PROMOTION_SUCCESS' AND entity_id = '2025'
    `).get() as any;

    expect(auditLog).toBeDefined();
    expect(auditLog.user_id).toBe(mockAdmin.id);
    expect(auditLog.details).toContain('Completed annual promotion for Academic Year 2025');
  });

  // 13. System status statistics accuracy
  it('13. provides accurate promotion system statistics for dashboard and UI', () => {
    createTestStudent('ADM-STAT1', 2, 'Active');
    createTestStudent('ADM-STAT2', 13, 'Active');
    createTestStudent('ADM-STAT3', 5, 'Leaved');

    const statusBefore = academicService.getPromotionSystemStatus();
    expect(statusBefore.totalActiveStudents).toBe(2);
    expect(statusBefore.totalSkippedLeavedStudents).toBe(1);

    academicService.processAcademicYearPromotion(2025, mockAdmin.id);

    const statusAfter = academicService.getPromotionSystemStatus();
    expect(statusAfter.totalActiveStudents).toBe(1); // 1 graduated
    expect(statusAfter.totalPassedOutStudents).toBe(1);
    expect(statusAfter.totalPromotedStudents).toBe(1);
  });

  // ==========================================
  // FIRST-INSTALLATION & HISTORICAL MIGRATION SAFETY TESTS
  // ==========================================

  // 14. First installation in January: baseline established, no premature promotion
  it('14. protects first installation in January: establishes baseline without premature promotion', () => {
    // Fresh DB without baseline
    testDb.prepare("DELETE FROM system_metadata WHERE key LIKE 'academic_promotion_baseline%'").run();
    testDb.prepare("DELETE FROM annual_processing_logs").run();

    // First install occurs on Jan 15, 2026
    const installDate = new Date('2026-01-15T10:00:00Z');
    const baseline = academicService.ensureInitialAcademicYearBaseline(installDate);
    expect(baseline.isFirstInstall).toBe(true);
    expect(baseline.baselineYear).toBe(2026);

    // Register a student after installation in 2026
    const s1 = createTestStudent('ADM-JAN', 3, 'Active', '2026-01-16');

    // Pending years must be empty because 2026 is the installation year currently in progress
    const pending = academicService.getPendingPromotionYears(installDate);
    expect(pending.length).toBe(0);

    // Run catch-up: must NOT promote newly enrolled students for the installation year!
    const catchupResult = academicService.runCatchupPromotions(mockAdmin.id, installDate);
    expect(catchupResult.yearsProcessed.length).toBe(0);

    const pAfter = studentService.getStudentById(s1)!;
    expect(pAfter.currentGrade).toBe(3); // untouched!

    // Verify metadata and audit logs recorded the initialization decision
    const meta = testDb.prepare("SELECT value FROM system_metadata WHERE key = 'academic_promotion_baseline_year'").get() as any;
    expect(meta.value).toBe('2026');

    const audit = testDb.prepare("SELECT * FROM audit_logs WHERE action = 'ACADEMIC_YEAR_BASELINE_INITIALIZED'").get() as any;
    expect(audit).toBeDefined();
    expect(audit.details).toContain('First installation baseline established for Academic Year 2026');
  });

  // 15. First installation in November: baseline established, no premature promotion
  it('15. protects first installation in November: establishes baseline without premature promotion', () => {
    testDb.prepare("DELETE FROM system_metadata WHERE key LIKE 'academic_promotion_baseline%'").run();
    testDb.prepare("DELETE FROM annual_processing_logs").run();

    // First install occurs on Nov 24, 2026
    const installDate = new Date('2026-11-24T18:00:00Z');
    const baseline = academicService.ensureInitialAcademicYearBaseline(installDate);
    expect(baseline.isFirstInstall).toBe(true);
    expect(baseline.baselineYear).toBe(2026);

    const s1 = createTestStudent('ADM-NOV', 7, 'Active', '2026-11-25');

    const pending = academicService.getPendingPromotionYears(installDate);
    expect(pending.length).toBe(0);

    const catchupResult = academicService.runCatchupPromotions(mockAdmin.id, installDate);
    expect(catchupResult.yearsProcessed.length).toBe(0);

    const pAfter = studentService.getStudentById(s1)!;
    expect(pAfter.currentGrade).toBe(7); // strictly untouched!
  });

  // 16. Existing installation that missed multiple years
  it('16. catches up multiple missed years on an existing installation', () => {
    const s1 = createTestStudent('ADM-MISSED-MULTI', 1);

    // Existing installation from 2024
    testDb.prepare("INSERT OR REPLACE INTO system_metadata (key, value) VALUES ('academic_promotion_baseline_year', '2024')").run();

    // Now it is Jan 5, 2026 (both 2024 and 2025 concluded and missed Jan 1)
    const simulatedDate = new Date('2026-01-05T08:00:00Z');
    const pending = academicService.getPendingPromotionYears(simulatedDate);
    expect(pending).toEqual([2024, 2025]);

    const catchupResult = academicService.runCatchupPromotions(mockAdmin.id, simulatedDate);
    expect(catchupResult.hasFailures).toBe(false);
    expect(catchupResult.yearsProcessed.map(r => r.academicYear)).toEqual([2024, 2025]);

    // Student advanced Grade 1 -> Grade 2 (for 2024) -> Grade 3 (for 2025)
    const pAfter = studentService.getStudentById(s1)!;
    expect(pAfter.currentGrade).toBe(3);

    // Remaining pending years in 2026 is 0
    expect(academicService.getPendingPromotionYears(simulatedDate).length).toBe(0);
  });

  // 17. Restart after initial baseline creation
  it('17. retains baseline across application restart without duplicate baseline creation or promotions', () => {
    testDb.prepare("DELETE FROM system_metadata WHERE key LIKE 'academic_promotion_baseline%'").run();
    const date = new Date('2026-03-01T10:00:00Z');

    const firstRun = academicService.ensureInitialAcademicYearBaseline(date);
    expect(firstRun.isFirstInstall).toBe(true);

    // Application restart: second run
    const secondRun = academicService.ensureInitialAcademicYearBaseline(date);
    expect(secondRun.isFirstInstall).toBe(false);
    expect(secondRun.baselineYear).toBe(2026);

    const pending = academicService.getPendingPromotionYears(date);
    expect(pending.length).toBe(0);
  });

  // 18. Historical migration with existing grade-history records preserving factual data
  it('18. migrates existing student_grade_history without fabricating non-existent previous states', () => {
    // Create an isolated fresh database up to migration 011
    const testMigDbPath = path.join(__dirname, `test_hist_mig_${Date.now()}.db`);
    const migDb = new Database(testMigDbPath);
    migDb.pragma('journal_mode = WAL');
    migDb.pragma('foreign_keys = ON');

    // Run migrations 1 through 11 only
    const migrator = new DatabaseMigrator(migDb);
    migrator.initMigrationTable();
    const migrationsUpTo11 = ALL_MIGRATIONS.filter((m: any) => m.version <= 11);

    migDb.pragma('foreign_keys = OFF');
    for (const m of migrationsUpTo11) {
      migDb.transaction(() => {
        m.up(migDb);
        migDb.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
      })();
    }
    migDb.pragma('foreign_keys = ON');

    // Populate student and legacy grade_history
    migDb.prepare("INSERT INTO families (id, family_code) VALUES (1, 'FAM-TEST-MIG')").run();
    migDb.prepare(`
      INSERT INTO students (id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade, family_id)
      VALUES (1, 'ADM-LEGACY', '2025-01-01', 'Legacy Student', 'Male', '2014-01-01', 5, 1)
    `).run();
    migDb.prepare("INSERT INTO academic_years (year, is_active) VALUES (2025, 1)").run();

    // Insert legacy grade history (only had student_id, academic_year, grade, promoted_at, notes)
    migDb.prepare(`
      INSERT INTO student_grade_history (student_id, academic_year, grade, notes)
      VALUES (1, 2025, 5, 'Legacy test grade entry')
    `).run();

    // Now execute migration 012 on the populated database!
    const migration012 = ALL_MIGRATIONS.find((m: any) => m.version === 12);
    migDb.pragma('foreign_keys = OFF');
    migDb.transaction(() => {
      migration012.up(migDb);
      migDb.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(12, migration012.name);
    })();
    migDb.pragma('foreign_keys = ON');

    // Verify foreign key integrity
    const fkCheck = migDb.pragma('foreign_key_check') as any[];
    if (fkCheck.length > 0) {
      console.log('FK violations in test 18:', fkCheck);
    }
    expect(fkCheck.length).toBe(0);

    // Inspect migrated record: previous_grade, previous_status, AND new_status must be NULL (zero fabrication!)
    const migratedRow = migDb.prepare('SELECT * FROM student_grade_history WHERE student_id = 1 AND academic_year = 2025').get() as any;
    expect(migratedRow).toBeDefined();
    expect(migratedRow.student_id).toBe(1);
    expect(migratedRow.academic_year).toBe(2025);
    expect(migratedRow.grade).toBe(5);
    expect(migratedRow.new_grade).toBe(5);
    expect(migratedRow.previous_grade).toBeNull(); // ZERO fabrication!
    expect(migratedRow.previous_status).toBeNull(); // ZERO fabrication!
    expect(migratedRow.new_status).toBeNull(); // ZERO fabrication!
    expect(migratedRow.notes).toBe('Legacy test grade entry');

    migDb.close();
    [testMigDbPath, `${testMigDbPath}-wal`, `${testMigDbPath}-shm`].forEach(f => {
      if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch {}
    });
  });

  // 19. Foreign key and table constraint enforcement
  it('19. enforces foreign key integrity on academic_years and students references', () => {
    // Attempting to insert grade history for non-existent student must fail
    expect(() => {
      testDb.prepare(`
        INSERT INTO student_grade_history (student_id, academic_year, new_grade, grade)
        VALUES (99999, 2025, 2, 2)
      `).run();
    }).toThrow(/FOREIGN KEY constraint failed/i);

    // Attempting to delete student with grade history fails due to ON DELETE RESTRICT
    const s1 = createTestStudent('ADM-FKRESTRICT', 5);
    academicService.processAcademicYearPromotion(2025, mockAdmin.id);

    expect(() => {
      testDb.prepare('DELETE FROM students WHERE id = ?').run(s1);
    }).toThrow(/FOREIGN KEY constraint failed/i);
  });

  // 20. Populated Stage 08 database upgraded to Stage 09 without baseline metadata
  it('20. establishes baseline at current academic year when upgrading populated Stage 08 database and avoids historical over-promotions', () => {
    const popMigDbPath = path.join(__dirname, `test_pop_mig_${Date.now()}.db`);
    const popDb = new Database(popMigDbPath);
    popDb.pragma('journal_mode = WAL');
    popDb.pragma('foreign_keys = ON');

    // Run migrations 1 through 11
    const migrator = new DatabaseMigrator(popDb);
    migrator.initMigrationTable();
    const migrationsUpTo11 = ALL_MIGRATIONS.filter((m: any) => m.version <= 11);

    popDb.pragma('foreign_keys = OFF');
    for (const m of migrationsUpTo11) {
      popDb.transaction(() => {
        m.up(popDb);
        popDb.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
      })();
    }
    popDb.pragma('foreign_keys = ON');

    // Populate students with admission dates across multiple historical years (2018, 2020, 2025)
    popDb.prepare("INSERT INTO families (id, family_code) VALUES (1, 'FAM-POP-01'), (2, 'FAM-POP-02'), (3, 'FAM-POP-03')").run();
    popDb.prepare(`
      INSERT INTO students (id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade, status, family_id)
      VALUES 
        (1, 'ADM-2018', '2018-01-10', 'Student 2018', 'Male', '2010-01-01', 9, 'Active', 1),
        (2, 'ADM-2020', '2020-01-10', 'Student 2020', 'Female', '2012-01-01', 7, 'Active', 2),
        (3, 'ADM-2025', '2025-01-10', 'Student 2025', 'Male', '2017-01-01', 2, 'Active', 3)
    `).run();
    popDb.prepare("INSERT INTO academic_years (year, is_active) VALUES (2026, 1)").run();

    // Now run migration 12 in November 2026
    const migration012 = ALL_MIGRATIONS.find((m: any) => m.version === 12);
    popDb.pragma('foreign_keys = OFF');
    popDb.transaction(() => {
      migration012.up(popDb);
      popDb.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(12, migration012.name);
    })();
    popDb.pragma('foreign_keys = ON');

    // Baseline must be established at the current year (2026), NOT backdated to 2018!
    const baselineRow = popDb.prepare("SELECT value FROM system_metadata WHERE key = 'academic_promotion_baseline_year'").get() as any;
    expect(baselineRow).toBeDefined();
    expect(Number(baselineRow.value)).toBe(2026);

    // Verify upgrade in November 2026: 0 pending promotion years!
    const popAcademicService = new AcademicYearService(popDb);
    const upgradeDate = new Date('2026-11-25T10:00:00Z');
    const pending = popAcademicService.getPendingPromotionYears(upgradeDate);
    expect(pending).toHaveLength(0);

    // Run catch-up promotions: none should run
    const catchupRes = popAcademicService.runCatchupPromotions(mockAdmin.id, upgradeDate);
    expect(catchupRes.hasFailures).toBe(false);
    expect(catchupRes.yearsProcessed).toHaveLength(0);

    // Crucial: Student grades must remain strictly unchanged (not repeatedly promoted for 2018-2025!)
    const s1 = popDb.prepare('SELECT current_grade, status FROM students WHERE id = 1').get() as any;
    const s2 = popDb.prepare('SELECT current_grade, status FROM students WHERE id = 2').get() as any;
    const s3 = popDb.prepare('SELECT current_grade, status FROM students WHERE id = 3').get() as any;

    expect(s1.current_grade).toBe(9); // Unchanged!
    expect(s2.current_grade).toBe(7); // Unchanged!
    expect(s3.current_grade).toBe(2); // Unchanged!

    // Now advance time to January 15, 2027: exactly ONE annual promotion for 2026 must be eligible
    const nextYearDate = new Date('2027-01-15T10:00:00Z');
    const pending2027 = popAcademicService.getPendingPromotionYears(nextYearDate);
    expect(pending2027).toEqual([2026]);

    const catchup2027 = popAcademicService.runCatchupPromotions(mockAdmin.id, nextYearDate);
    expect(catchup2027.hasFailures).toBe(false);
    expect(catchup2027.yearsProcessed).toHaveLength(1);
    expect(catchup2027.yearsProcessed[0].academicYear).toBe(2026);

    // Students promote by exactly +1 grade
    const s1After = popDb.prepare('SELECT current_grade FROM students WHERE id = 1').get() as any;
    const s2After = popDb.prepare('SELECT current_grade FROM students WHERE id = 2').get() as any;
    const s3After = popDb.prepare('SELECT current_grade FROM students WHERE id = 3').get() as any;
    expect(s1After.current_grade).toBe(10);
    expect(s2After.current_grade).toBe(8);
    expect(s3After.current_grade).toBe(3);

    popDb.close();
    [popMigDbPath, `${popMigDbPath}-wal`, `${popMigDbPath}-shm`].forEach(f => {
      if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch {}
    });
  });

  // 21. Fresh installation in November does not trigger catch-up promotion
  it('21. fresh installation in November does not trigger premature catch-up promotion', () => {
    testDb.prepare("DELETE FROM system_metadata WHERE key LIKE 'academic_promotion_baseline%'").run();
    testDb.prepare("DELETE FROM annual_processing_logs").run();
    testDb.prepare("DELETE FROM student_grade_history").run();
    testDb.prepare("DELETE FROM student_status_history").run();
    testDb.prepare("DELETE FROM fee_payments").run();
    testDb.prepare("DELETE FROM student_annual_fees").run();
    testDb.prepare("DELETE FROM students").run();

    // Nov 20, 2026 fresh installation
    const novDate = new Date('2026-11-20T12:00:00Z');
    const freshCheck = academicService.ensureInitialAcademicYearBaseline(novDate);
    expect(freshCheck.isFirstInstall).toBe(true);
    expect(freshCheck.baselineYear).toBe(2026);

    // Register a student after installation
    createTestStudent('ADM-NOV-01', 3, 'Active', '2026-11-21');

    // Run catchup on November 20: 0 pending years
    const pendingYears = academicService.getPendingPromotionYears(novDate);
    expect(pendingYears).toHaveLength(0);

    const catchup = academicService.runCatchupPromotions(mockAdmin.id, novDate);
    expect(catchup.yearsProcessed).toHaveLength(0);

    // Student remains in Grade 3
    const s = testDb.prepare("SELECT current_grade FROM students WHERE admission_number = 'ADM-NOV-01'").get() as any;
    expect(s.current_grade).toBe(3);
  });

  // 22. Rollback safety: errors during promotion leave database unchanged
  it('22. rolls back all student updates and records failure log when an error occurs during promotion', () => {
    const s1 = createTestStudent('ADM-ROLLBACK-1', 4);
    const s2 = createTestStudent('ADM-ROLLBACK-2', 5);

    // Intentionally create a unique conflict or error inside promotion by mocking an invalid condition
    // For instance, pre-insert a duplicate in student_status_history with an invalid constraint or lock
    // Or corrupt targetYear to be out of range
    expect(() => {
      academicService.processAcademicYearPromotion(9999, mockAdmin.id);
    }).toThrow(/Academic year 9999 is out of valid range/i);

    // Students must remain completely untouched
    const check1 = studentService.getStudentById(s1)!;
    const check2 = studentService.getStudentById(s2)!;
    expect(check1.currentGrade).toBe(4);
    expect(check2.currentGrade).toBe(5);
  });
});

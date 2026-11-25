import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DatabaseMigrator } from '../electron/database/migrator';
import { StudentService } from '../electron/services/studentService';
import { QuickCreateService } from '../electron/services/quickCreateService';
import { DatabaseBackupService } from '../electron/database/backup';
import { AuthService } from '../electron/services/authService';
import { migration001 } from '../electron/database/migrations/001_initial_schema';
import { migration002 } from '../electron/database/migrations/002_core_taxonomy_and_users';
import { migration003 } from '../electron/database/migrations/003_families_and_students';
import { migration004 } from '../electron/database/migrations/004_academic_and_fees';
import { migration005 } from '../electron/database/migrations/005_schema_corrections';
import { migration006 } from '../electron/database/migrations/006_final_verification_corrections';
import { migration007 } from '../electron/database/migrations/007_school_settings_stage04_verification';
import { migration008 } from '../electron/database/migrations/008_quick_create_lookup_stage05';
import { migration009 } from '../electron/database/migrations/009_student_management_stage06';
import { IAuthSession, IRegisterStudentInput } from '../electron/shared/types';

describe('Stage 06 – Complete Student Management Tests', () => {
  let testDbPath: string;
  let testDb: Database.Database;
  let customStorageDir: string;
  let customBackupDir: string;

  const mockAdmin: IAuthSession = {
    id: 1,
    displayName: 'Headmaster Admin',
    role: 'Admin',
    token: 'admin-test-token',
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  };

  const mockStaff: IAuthSession = {
    id: 2,
    displayName: 'Registrar Staff',
    role: 'Staff',
    token: 'staff-test-token',
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  };

  beforeEach(() => {
    testDbPath = path.join(__dirname, `test_stage06_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    customStorageDir = path.join(__dirname, `photos_stage06_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    customBackupDir = path.join(__dirname, `backups_stage06_${Date.now()}_${Math.random().toString(36).slice(2)}`);

    testDb = new Database(testDbPath);
    testDb.pragma('journal_mode = WAL');
    testDb.pragma('foreign_keys = ON');

    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    // Seed test users
    testDb.prepare("INSERT OR IGNORE INTO users (id, display_name, pin_hash, pin_hmac, role) VALUES (1, 'Headmaster Admin', 'pin_hash_1', 'hmac_1', 'Admin')").run();
    testDb.prepare("INSERT OR IGNORE INTO users (id, display_name, pin_hash, pin_hmac, role) VALUES (2, 'Registrar Staff', 'pin_hash_2', 'hmac_2', 'Staff')").run();
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

    if (fs.existsSync(customStorageDir)) {
      try { fs.rmSync(customStorageDir, { recursive: true, force: true }); } catch {}
    }
    if (fs.existsSync(customBackupDir)) {
      try { fs.rmSync(customBackupDir, { recursive: true, force: true }); } catch {}
    }
  });

  // Valid 1x1 PNG image buffer for testing
  const validPngBuffer = Buffer.from(
    '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6360606060000000050001A7E3E1880000000049454E44AE426082',
    'hex'
  );

  it('1. verifies migration 009 applied cleanly and created performance indexes', () => {
    const migrator = new DatabaseMigrator(testDb);
    const version = migrator.getCurrentVersion();
    expect(version).toBeGreaterThanOrEqual(9);

    const indexes = testDb.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as Array<{ name: string }>;
    const indexNames = indexes.map(i => i.name);

    expect(indexNames).toContain('idx_students_house_id');
    expect(indexNames).toContain('idx_students_gender');
    expect(indexNames).toContain('idx_students_status');
    expect(indexNames).toContain('idx_students_grade');
    expect(indexNames).toContain('uq_students_admission_no_nocase');
    expect(indexNames).toContain('idx_students_name_prefix');
  });

  it('2. registers student with family residence foundation and enforces admission number uniqueness', () => {
    const studentService = new StudentService(testDb, customStorageDir);

    const regInput: IRegisterStudentInput = {
      admissionNumber: 'ADM-2026-001',
      admissionDate: '2026-01-10',
      fullName: 'Kasun Chamara Perera',
      gender: 'Male',
      dateOfBirth: '2015-05-20',
      currentGrade: 5,
      houseNo: 'No. 45/A',
      additionalAddressDetails: 'Opposite Clock Tower',
      fullAddress: 'No. 45/A, Opposite Clock Tower, Kandy'
    };

    const student = studentService.registerStudent(mockStaff, regInput);

    expect(student.id).toBeGreaterThan(0);
    expect(student.admissionNumber).toBe('ADM-2026-001');
    expect(student.fullName).toBe('Kasun Chamara Perera');
    expect(student.currentGrade).toBe(5);
    expect(student.status).toBe('Active');
    expect(student.familyCode).toMatch(/^FAM-\d{5}$/);
    expect(student.fullAddress).toBe('No. 45/A, Opposite Clock Tower, Kandy');

    // Verify address is in families table, not duplicated in students table
    const studentCols = (testDb.pragma('table_info(students)') as Array<{ name: string }>).map(c => c.name);
    expect(studentCols).not.toContain('full_address');
    expect(studentCols).not.toContain('house_no');

    const familyRow = testDb.prepare('SELECT house_no, full_address FROM families WHERE id = ?').get(student.familyId) as { house_no: string; full_address: string };
    expect(familyRow.house_no).toBe('No. 45/A');
    expect(familyRow.full_address).toBe('No. 45/A, Opposite Clock Tower, Kandy');

    // Duplicate admission number (case-insensitive) must be rejected
    expect(() => {
      studentService.registerStudent(mockStaff, {
        ...regInput,
        admissionNumber: 'adm-2026-001', // Lowercase test
        fullName: 'Another Student'
      });
    }).toThrow(/already assigned to another student/i);
  });

  it('3. integrates Quick Create lookups (houses, transport, streets, cities) directly during student registration', () => {
    const quickCreateService = new QuickCreateService(testDb);
    const studentService = new StudentService(testDb, customStorageDir);

    // Staff quick-creates lookup items
    const newHouse = quickCreateService.quickCreate(mockStaff, 'houses', 'Diamond House', null, '#0284C7');
    const newTransport = quickCreateService.quickCreate(mockStaff, 'transportation_methods', 'School Express Bus');
    const newStreet = quickCreateService.quickCreate(mockStaff, 'streets', 'Victoria Crescent');
    const newCity = quickCreateService.quickCreate(mockStaff, 'cities', 'Peradeniya', '20400');

    expect(newHouse.id).toBeGreaterThan(0);
    expect(newHouse.colorHex).toBe('#0284C7');

    // Register student linking to newly quick-created records
    const student = studentService.registerStudent(mockStaff, {
      admissionNumber: 'ADM-2026-QC01',
      admissionDate: '2026-01-15',
      fullName: 'Sanduni Nimesha Silva',
      gender: 'Female',
      dateOfBirth: '2016-08-12',
      currentGrade: 4,
      houseId: newHouse.id,
      transportationMethodId: newTransport.id,
      houseNo: 'No. 12',
      streetId: newStreet.id,
      cityId: newCity.id,
      fullAddress: 'No. 12, Victoria Crescent, Peradeniya'
    });

    expect(student.houseName).toBe('Diamond House');
    expect(student.houseColor).toBe('#0284C7');
    expect(student.transportationMethodName).toBe('School Express Bus');
    expect(student.streetName).toBe('Victoria Crescent');
    expect(student.cityName).toBe('Peradeniya');
    expect(student.postalCode).toBe('20400');
  });

  it('4. performs search, filtering, and server-side pagination with explicit column selection', () => {
    const studentService = new StudentService(testDb, customStorageDir);

    // Insert 25 students across various grades and genders
    for (let i = 1; i <= 25; i++) {
      studentService.registerStudent(mockStaff, {
        admissionNumber: `STU-${String(i).padStart(3, '0')}`,
        admissionDate: '2026-01-01',
        fullName: i % 2 === 0 ? `Nuwan Bandara ${i}` : `Anoma Kaluarachchi ${i}`,
        gender: i % 2 === 0 ? 'Male' : 'Female',
        dateOfBirth: '2015-01-01',
        currentGrade: (i % 6) + 1, // Grades 1-6
        fullAddress: `Address for student ${i}`
      });
    }

    // Test 1: Page 1 with pageSize 10
    const page1 = studentService.getStudents({ page: 1, pageSize: 10 });
    expect(page1.items.length).toBe(10);
    expect(page1.total).toBe(25);
    expect(page1.totalPages).toBe(3);

    // Test 2: Page 3 has remaining 5 items
    const page3 = studentService.getStudents({ page: 3, pageSize: 10 });
    expect(page3.items.length).toBe(5);

    // Test 3: Filter by gender
    const maleOnly = studentService.getStudents({ gender: 'Male', pageSize: 50 });
    expect(maleOnly.total).toBe(12);
    expect(maleOnly.items.every(s => s.gender === 'Male')).toBe(true);

    // Test 4: Search by name prefix
    const searchRes = studentService.getStudents({ search: 'Nuwan' });
    expect(searchRes.items.length).toBeGreaterThan(0);
    expect(searchRes.items.every(s => s.fullName.startsWith('Nuwan'))).toBe(true);

    // Test 5: Search by admission number prefix
    const admSearch = studentService.getStudents({ search: 'STU-01' });
    expect(admSearch.items.length).toBe(10); // STU-010 to STU-019
  });

  it('5. records student notes in chronological order with creator metadata and preserves them on edit', () => {
    const studentService = new StudentService(testDb, customStorageDir);

    const student = studentService.registerStudent(mockStaff, {
      admissionNumber: 'ADM-NOTE-01',
      admissionDate: '2026-01-10',
      fullName: 'Janaka Senanayake',
      gender: 'Male',
      dateOfBirth: '2014-04-10',
      currentGrade: 6,
      initialNote: 'First initial note on registration.'
    });

    // Add note 2 by Staff
    const note2 = studentService.addStudentNote(mockStaff, student.id, 'Second note: Parent attended meeting.');
    // Add note 3 by Admin
    const note3 = studentService.addStudentNote(mockAdmin, student.id, 'Third note: Won school athletics trophy.');

    expect(note2.id).toBeGreaterThan(0);
    expect(note3.createdByName).toBe('Headmaster Admin');

    // Retrieve notes: must be in chronological order
    const notes = studentService.getStudentNotes(student.id);
    expect(notes.length).toBe(3);
    expect(notes[0].noteText).toBe('First initial note on registration.');
    expect(notes[1].noteText).toBe('Second note: Parent attended meeting.');
    expect(notes[2].noteText).toBe('Third note: Won school athletics trophy.');

    // Edit student details must not overwrite or clear notes
    studentService.updateStudent(mockStaff, {
      id: student.id,
      fullName: 'Janaka Senanayake (Updated)'
    });

    const refreshed = studentService.getStudentById(student.id);
    expect(refreshed?.fullName).toBe('Janaka Senanayake (Updated)');
    expect(refreshed?.notes.length).toBe(3);
  });

  it('6. protects against manual academic grade bypass and records status history', () => {
    const studentService = new StudentService(testDb, customStorageDir);

    const student = studentService.registerStudent(mockStaff, {
      admissionNumber: 'ADM-STAT-01',
      admissionDate: '2026-01-10',
      fullName: 'Chathura Fernando',
      gender: 'Male',
      dateOfBirth: '2015-02-14',
      currentGrade: 7
    });

    // Update status to Leaved with reason
    const updated = studentService.updateStudent(mockStaff, {
      id: student.id,
      status: 'Leaved',
      statusReason: 'Family transferred to Colombo'
    });

    expect(updated.status).toBe('Leaved');
    expect(updated.statusHistory.length).toBe(1);
    expect(updated.statusHistory[0].fromStatus).toBe('Active');
    expect(updated.statusHistory[0].toStatus).toBe('Leaved');
    expect(updated.statusHistory[0].reason).toBe('Family transferred to Colombo');

    // Attempting to set 'Passed Out' manually must be rejected (reserved for grade 13 graduation)
    expect(() => {
      studentService.updateStudent(mockStaff, {
        id: student.id,
        status: 'Passed Out' as unknown as 'Active'
      });
    }).toThrow(/Passed Out.*is reserved/i);
  });

  it('7. safely validates, uploads, previews, replaces, and removes student photos', () => {
    const studentService = new StudentService(testDb, customStorageDir);

    const base64Png = `data:image/png;base64,${validPngBuffer.toString('base64')}`;

    const student = studentService.registerStudent(mockStaff, {
      admissionNumber: 'ADM-PHOTO-01',
      admissionDate: '2026-01-10',
      fullName: 'Dilani Samarasinghe',
      gender: 'Female',
      dateOfBirth: '2015-07-22',
      currentGrade: 5,
      photoDataBase64: base64Png,
      photoFileName: 'photo.png'
    });

    expect(student.photoPath).toMatch(/^photos\/student_ADM_PHOTO_01_.*\.png$/);
    expect(student.photoPreviewUrl).toContain('data:image/png;base64,');

    // Replace photo
    const newPreview = studentService.uploadStudentPhoto(mockStaff, student.id, 'replacement.png', base64Png);
    expect(newPreview).toContain('data:image/png;base64,');

    // Remove photo
    const removed = studentService.removeStudentPhoto(mockStaff, student.id);
    expect(removed).toBe(true);

    const studentAfterRemove = studentService.getStudentById(student.id);
    expect(studentAfterRemove?.photoPath).toBeNull();
    expect(studentAfterRemove?.photoPreviewUrl).toBeNull();

    // Rejects corrupted image buffer
    expect(() => {
      studentService.uploadStudentPhoto(mockStaff, student.id, 'corrupt.jpg', 'data:image/jpeg;base64,bm90YW5pbWFnZQ==');
    }).toThrow(/Invalid or corrupted image file/);
  });

  it('8. enforces safe student deletion restrictions when historical records exist and allows admin deletion of clean records', () => {
    const studentService = new StudentService(testDb, customStorageDir);

    const student1 = studentService.registerStudent(mockStaff, {
      admissionNumber: 'ADM-DEL-01',
      admissionDate: '2026-01-10',
      fullName: 'Student With History',
      gender: 'Male',
      dateOfBirth: '2015-01-01',
      currentGrade: 5
    });

    // Add note to student1 -> historical record exists
    studentService.addStudentNote(mockStaff, student1.id, 'Important remark');

    // Attempt to delete student1 must fail
    expect(() => {
      studentService.deleteStudent(mockAdmin, student1.id);
    }).toThrow(/historical records exist.*change the student's status to "Leaved"/i);

    // Staff cannot delete (Admin only)
    const cleanStudent = studentService.registerStudent(mockStaff, {
      admissionNumber: 'ADM-CLEAN-01',
      admissionDate: '2026-01-10',
      fullName: 'Clean Accidental Student',
      gender: 'Female',
      dateOfBirth: '2015-01-01',
      currentGrade: 5
    });

    expect(() => {
      studentService.deleteStudent(mockStaff, cleanStudent.id);
    }).toThrow(/Unauthorized: Only Administrators/);

    // Admin deletes clean student -> succeeds
    const deleted = studentService.deleteStudent(mockAdmin, cleanStudent.id);
    expect(deleted).toBe(true);

    const lookup = studentService.getStudentById(cleanStudent.id);
    expect(lookup).toBeNull();
  });

  it('9. backs up and restores student records, family foundations, and archived photos safely', async () => {
    const studentService = new StudentService(testDb, customStorageDir);
    const backupService = new DatabaseBackupService(testDb, undefined, customStorageDir);

    const base64Png = `data:image/png;base64,${validPngBuffer.toString('base64')}`;
    const student = studentService.registerStudent(mockStaff, {
      admissionNumber: 'ADM-BACKUP-01',
      admissionDate: '2026-01-10',
      fullName: 'Backup Test Student',
      gender: 'Male',
      dateOfBirth: '2015-03-15',
      currentGrade: 3,
      houseNo: 'No. 99',
      fullAddress: 'No. 99, Hill Street, Kandy',
      photoDataBase64: base64Png,
      photoFileName: 'photo.png'
    });

    // Create backup
    const backupResult = await backupService.createBackup(customBackupDir);
    expect(backupResult.success).toBe(true);
    expect(backupResult.backupPath).toBeDefined();

    // Verify backup contains backup_student_photos_archive table and photo blob
    const backupDb = new Database(backupResult.backupPath!);
    const archiveTable = backupDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='backup_student_photos_archive'").get();
    expect(archiveTable).toBeDefined();

    const archivedPhoto = backupDb.prepare('SELECT admission_number, photo_filename FROM backup_student_photos_archive WHERE admission_number = ?').get('ADM-BACKUP-01') as { admission_number: string; photo_filename: string };
    expect(archivedPhoto.admission_number).toBe('ADM-BACKUP-01');
    backupDb.close();

    // Restore backup into a new fresh DB
    const restoredDbPath = path.join(__dirname, `restored_stage06_${Date.now()}.db`);
    const restoredStorageDir = path.join(__dirname, `restored_photos_stage06_${Date.now()}`);
    const restoredDb = new Database(restoredDbPath);
    restoredDb.pragma('foreign_keys = ON');

    const restoredBackupService = new DatabaseBackupService(restoredDb, undefined, restoredStorageDir);
    const restoreResult = await restoredBackupService.restoreBackup(backupResult.backupPath!);
    expect(restoreResult.success).toBe(true);

    const restoredStudentService = new StudentService(restoredDb, restoredStorageDir);
    const restoredStudent = restoredStudentService.getStudentById(student.id);
    expect(restoredStudent).not.toBeNull();
    expect(restoredStudent?.admissionNumber).toBe('ADM-BACKUP-01');
    expect(restoredStudent?.fullAddress).toBe('No. 99, Hill Street, Kandy');

    // Clean up
    try { restoredDb.close(); } catch {}
    [restoredDbPath, `${restoredDbPath}-wal`, `${restoredDbPath}-shm`].forEach((f) => {
      if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch {} }
    });
    if (fs.existsSync(restoredStorageDir)) {
      try { fs.rmSync(restoredStorageDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('10. handles pre-existing conflicting duplicate admission numbers safely during migration without deleting records', () => {
    const conflictDb = new Database(':memory:');
    
    // Create legacy table structure where admission_number had case-sensitive duplicate entries
    conflictDb.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS families (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_code TEXT NOT NULL UNIQUE,
        house_no TEXT,
        street_id INTEGER,
        city_id INTEGER,
        additional_address_details TEXT,
        full_address TEXT
      );
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id INTEGER NOT NULL REFERENCES families(id),
        admission_number TEXT NOT NULL,
        admission_date DATE NOT NULL,
        full_name TEXT NOT NULL,
        gender TEXT NOT NULL,
        date_of_birth DATE NOT NULL,
        current_grade INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Active',
        transportation_method_id INTEGER,
        house_id INTEGER,
        photo_path TEXT
      );
    `);

    // Record v1-v8 applied
    for (let v = 1; v <= 8; v++) {
      conflictDb.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(v, `migration_v${v}`);
    }

    // Insert 2 families and 2 students with conflicting case-insensitive admission numbers (adm-conflict-01 vs ADM-CONFLICT-01)
    conflictDb.prepare("INSERT INTO families (id, family_code) VALUES (1, 'FAM-001'), (2, 'FAM-002')").run();
    conflictDb.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade)
      VALUES (1, 'adm-conflict-01', '2026-01-01', 'Student Lowercase', 'Male', '2015-01-01', 5)
    `).run();
    conflictDb.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade)
      VALUES (2, 'ADM-CONFLICT-01', '2026-01-01', 'Student Uppercase', 'Female', '2015-01-01', 5)
    `).run();

    // Verify 2 students exist before migration
    const beforeCount = (conflictDb.prepare('SELECT COUNT(*) as cnt FROM students').get() as { cnt: number }).cnt;
    expect(beforeCount).toBe(2);

    // Run migration 009 on DB with pre-existing conflicts
    expect(() => {
      migration009.up(conflictDb);
    }).not.toThrow();

    // Both records must be preserved intact without data loss or record modification
    const afterCount = (conflictDb.prepare('SELECT COUNT(*) as cnt FROM students').get() as { cnt: number }).cnt;
    expect(afterCount).toBe(2);

    const s1 = conflictDb.prepare("SELECT admission_number, full_name FROM students WHERE full_name = 'Student Lowercase'").get() as { admission_number: string };
    const s2 = conflictDb.prepare("SELECT admission_number, full_name FROM students WHERE full_name = 'Student Uppercase'").get() as { admission_number: string };
    expect(s1.admission_number).toBe('adm-conflict-01');
    expect(s2.admission_number).toBe('ADM-CONFLICT-01');

    conflictDb.close();
  });

  it('11. enforces case-insensitive duplicate admission numbers and handles concurrent registration attempts', () => {
    const studentService = new StudentService(testDb, customStorageDir);

    // Initial registration
    studentService.registerStudent(mockStaff, {
      admissionNumber: 'ADM-RACE-001',
      admissionDate: '2026-01-10',
      fullName: 'Primary Registrant',
      gender: 'Male',
      dateOfBirth: '2015-04-10',
      currentGrade: 4
    });

    // 1. Lowercase duplicate attempt
    expect(() => {
      studentService.registerStudent(mockStaff, {
        admissionNumber: 'adm-race-001',
        admissionDate: '2026-01-11',
        fullName: 'Lowercase Attempter',
        gender: 'Male',
        dateOfBirth: '2015-04-10',
        currentGrade: 4
      });
    }).toThrow(/Admission Number "adm-race-001" is already assigned to another student/);

    // 2. Mixed-case duplicate attempt
    expect(() => {
      studentService.registerStudent(mockStaff, {
        admissionNumber: 'Adm-Race-001',
        admissionDate: '2026-01-11',
        fullName: 'MixedCase Attempter',
        gender: 'Male',
        dateOfBirth: '2015-04-10',
        currentGrade: 4
      });
    }).toThrow(/Admission Number "Adm-Race-001" is already assigned to another student/);

    // 3. Simulate race condition where pre-validation is bypassed and SQLite UNIQUE constraint catches it
    testDb.prepare("INSERT INTO families (id, family_code) VALUES (9999, 'FAM-RACE-99')").run();
    expect(() => {
      testDb.prepare(`
        INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade)
        VALUES (9999, 'adm-race-001', '2026-01-10', 'Direct SQL Bypass', 'Female', '2015-01-01', 3)
      `).run();
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('12. performs partial student name and partial admission number search with pagination and filtering', () => {
    const studentService = new StudentService(testDb, customStorageDir);

    studentService.registerStudent(mockStaff, {
      admissionNumber: 'ADM-2026-888',
      admissionDate: '2026-01-01',
      fullName: 'Kasun Chamara Perera',
      gender: 'Male',
      dateOfBirth: '2015-01-01',
      currentGrade: 5
    });

    studentService.registerStudent(mockStaff, {
      admissionNumber: 'ADM-2026-999',
      admissionDate: '2026-01-02',
      fullName: 'Sanduni Nimesha Silva',
      gender: 'Female',
      dateOfBirth: '2015-02-02',
      currentGrade: 5
    });

    // 1. Partial middle name search
    const middleNameRes = studentService.getStudents({ search: 'Chamara' });
    expect(middleNameRes.items.length).toBe(1);
    expect(middleNameRes.items[0].fullName).toBe('Kasun Chamara Perera');

    // 2. Partial last name search
    const lastNameRes = studentService.getStudents({ search: 'Silva' });
    expect(lastNameRes.items.length).toBe(1);
    expect(lastNameRes.items[0].fullName).toBe('Sanduni Nimesha Silva');

    // 3. Partial admission number search
    const admPartialRes = studentService.getStudents({ search: '888' });
    expect(admPartialRes.items.length).toBe(1);
    expect(admPartialRes.items[0].admissionNumber).toBe('ADM-2026-888');

    // 4. Common partial admission number search (matches both)
    const commonAdmRes = studentService.getStudents({ search: '2026' });
    expect(commonAdmRes.items.length).toBe(2);

    // 5. Pagination with partial search
    const pagedRes = studentService.getStudents({ search: '2026', page: 1, pageSize: 1 });
    expect(pagedRes.items.length).toBe(1);
    expect(pagedRes.total).toBe(2);
    expect(pagedRes.totalPages).toBe(2);
  });

  it('13. verifies direct IPC handlers enforce authentication and Admin-only deletion', async () => {
    const authService = new AuthService(testDb);
    const studentService = new StudentService(testDb, customStorageDir);

    // 1. Unauthenticated state (no active session)
    (authService as unknown as { currentSession: unknown }).currentSession = null;

    expect(() => authService.requireAuth()).toThrow(/Unauthenticated: Please log in to proceed/i);
    expect(() => authService.requireAdmin()).toThrow(/Unauthenticated: Please log in to proceed/i);

    // 2. Authenticated as Staff
    (authService as unknown as { currentSession: unknown }).currentSession = {
      token: 'staff-token',
      userId: 2,
      tokenVersion: 1,
      role: 'Staff',
      displayName: 'Registrar Staff'
    };

    // Staff can access requireAuth()
    const staffSession = authService.requireAuth();
    expect(staffSession.role).toBe('Staff');

    // Staff CANNOT access requireAdmin()
    expect(() => authService.requireAdmin()).toThrow(/Administrator privileges required/i);

    // Create a student to test delete
    const student = studentService.registerStudent(mockStaff, {
      admissionNumber: 'ADM-AUTH-01',
      admissionDate: '2026-01-01',
      fullName: 'Auth Test Student',
      gender: 'Male',
      dateOfBirth: '2015-01-01',
      currentGrade: 2
    });

    // Staff attempting deleteStudent IPC must fail
    const handleStaffDelete = async () => {
      const admin = authService.requireAdmin();
      return studentService.deleteStudent(admin, student.id);
    };
    await expect(handleStaffDelete()).rejects.toThrow(/Administrator privileges required/i);

    // 3. Authenticated as Admin
    (authService as unknown as { currentSession: unknown }).currentSession = {
      token: 'admin-token',
      userId: 1,
      tokenVersion: 1,
      role: 'Admin',
      displayName: 'Headmaster Admin'
    };

    const adminSession = authService.requireAdmin();
    expect(adminSession.role).toBe('Admin');

    // Admin can delete clean student
    const deleteRes = studentService.deleteStudent(adminSession, student.id);
    expect(deleteRes).toBe(true);
  });

  it('14. verifies backup and restoration with multiple photos, replaced photos, and missing/corrupted file safeguards', async () => {
    const studentService = new StudentService(testDb, customStorageDir);
    const backupService = new DatabaseBackupService(testDb, undefined, customStorageDir);

    const base64Png = `data:image/png;base64,${validPngBuffer.toString('base64')}`;

    // Register Student 1 with Photo
    const s1 = studentService.registerStudent(mockStaff, {
      admissionNumber: 'ADM-PHOTO-A',
      admissionDate: '2026-01-01',
      fullName: 'Student A',
      gender: 'Male',
      dateOfBirth: '2015-01-01',
      currentGrade: 1,
      photoDataBase64: base64Png,
      photoFileName: 'a.png'
    });

    // Register Student 2 with Photo
    const s2 = studentService.registerStudent(mockStaff, {
      admissionNumber: 'ADM-PHOTO-B',
      admissionDate: '2026-01-01',
      fullName: 'Student B',
      gender: 'Female',
      dateOfBirth: '2015-01-01',
      currentGrade: 2,
      photoDataBase64: base64Png,
      photoFileName: 'b.png'
    });

    // Replace Student 1 photo with a new one
    const newPhotoPreview = studentService.uploadStudentPhoto(mockStaff, s1.id, 'a_replaced.png', base64Png);
    expect(newPhotoPreview).toContain('data:image/png;base64,');

    // Create Backup
    const backupRes = await backupService.createBackup(customBackupDir);
    expect(backupRes.success).toBe(true);

    // Restore into new database
    const restoredDbPath = path.join(__dirname, `restored_multi_${Date.now()}.db`);
    const restoredStorageDir = path.join(__dirname, `restored_photos_multi_${Date.now()}`);
    const restoredDb = new Database(restoredDbPath);
    restoredDb.pragma('foreign_keys = ON');

    const restoredBackupService = new DatabaseBackupService(restoredDb, undefined, restoredStorageDir);
    const restoreRes = await restoredBackupService.restoreBackup(backupRes.backupPath!);
    expect(restoreRes.success).toBe(true);

    const restoredStudentService = new StudentService(restoredDb, restoredStorageDir);
    const restoredS1 = restoredStudentService.getStudentById(s1.id);
    const restoredS2 = restoredStudentService.getStudentById(s2.id);

    expect(restoredS1?.photoPath).not.toBeNull();
    expect(restoredS1?.photoPreviewUrl).toContain('data:image/png;base64,');
    expect(restoredS2?.photoPath).not.toBeNull();
    expect(restoredS2?.photoPreviewUrl).toContain('data:image/png;base64,');

    // Test missing photo safety: delete one photo file from disk and trigger restore check
    const s1PhotoDisk = path.resolve(restoredStorageDir, path.basename(restoredS1!.photoPath!));
    if (fs.existsSync(s1PhotoDisk)) {
      fs.unlinkSync(s1PhotoDisk);
    }

    // Creating backup of a DB where photo file is missing on disk safely excludes missing file without crashing
    const secondBackup = await restoredBackupService.createBackup(customBackupDir);
    expect(secondBackup.success).toBe(true);

    // Restore to third environment: student with missing photo file safely has photo_path set to NULL
    const env3DbPath = path.join(__dirname, `env3_${Date.now()}.db`);
    const env3Storage = path.join(__dirname, `env3_photos_${Date.now()}`);
    const env3Db = new Database(env3DbPath);
    env3Db.pragma('foreign_keys = ON');

    const env3BackupService = new DatabaseBackupService(env3Db, undefined, env3Storage);
    const env3RestoreRes = await env3BackupService.restoreBackup(secondBackup.backupPath!);
    expect(env3RestoreRes.success).toBe(true);

    const env3Service = new StudentService(env3Db, env3Storage);
    const env3S1 = env3Service.getStudentById(s1.id);
    expect(env3S1?.photoPath).toBeNull(); // Missing photo cleaned up safely!

    // Cleanup
    try { restoredDb.close(); } catch {}
    try { env3Db.close(); } catch {}
    [restoredDbPath, env3DbPath].forEach(f => {
      if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch {} }
    });
    [restoredStorageDir, env3Storage].forEach(d => {
      if (fs.existsSync(d)) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
    });
  });
});

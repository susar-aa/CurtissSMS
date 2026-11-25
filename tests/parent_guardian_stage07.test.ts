import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DatabaseMigrator } from '../electron/database/migrator';
import { StudentService } from '../electron/services/studentService';
import { FamilyService } from '../electron/services/familyService';
import { QuickCreateService } from '../electron/services/quickCreateService';
import { IAuthSession, IRegisterStudentInput } from '../electron/shared/types';

describe('Stage 07 – Complete Parent & Guardian Management Tests', () => {
  let testDbPath: string;
  let testDb: Database.Database;
  let studentService: StudentService;
  let familyService: FamilyService;
  let quickCreateService: QuickCreateService;

  const mockAdmin: IAuthSession = {
    id: 1,
    displayName: 'Super Admin',
    role: 'Admin',
    token: 'admin-token',
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  };

  const mockStaff: IAuthSession = {
    id: 2,
    displayName: 'Staff Member',
    role: 'Staff',
    token: 'staff-token',
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  };

  beforeEach(() => {
    testDbPath = path.join(__dirname, `test_stage07_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    testDb = new Database(testDbPath);
    testDb.pragma('journal_mode = WAL');
    testDb.pragma('foreign_keys = ON');

    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    // Seed test users
    testDb.prepare("INSERT OR IGNORE INTO users (id, display_name, pin_hash, pin_hmac, role) VALUES (1, 'Super Admin', 'hash1', 'hmac1', 'Admin')").run();
    testDb.prepare("INSERT OR IGNORE INTO users (id, display_name, pin_hash, pin_hmac, role) VALUES (2, 'Staff Member', 'hash2', 'hmac2', 'Staff')").run();

    studentService = new StudentService(testDb);
    familyService = new FamilyService(testDb);
    quickCreateService = new QuickCreateService(testDb);
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

  // Helper to create a base student registration input
  const makeStudentInput = (adm: string, name: string): IRegisterStudentInput => ({
    admissionNumber: adm,
    admissionDate: '2026-01-15',
    fullName: name,
    gender: 'Male',
    dateOfBirth: '2015-05-10',
    currentGrade: 5
  });

  // ----------------------------------------------------
  // Test 1: Family with Father only succeeds
  // ----------------------------------------------------
  it('1. registers a student with Father only successfully', () => {
    const input = makeStudentInput('ADM-F01', 'Nimal Perera');
    input.familyMembers = [
      {
        relationshipType: 'Father',
        name: 'Sunil Perera',
        contactNumber: '0771234567',
        whatsappNumber: '0771234567'
      }
    ];

    const student = studentService.registerStudent(mockStaff, input);
    expect(student).toBeDefined();
    expect(student.familyMembers).toBeDefined();
    expect(student.familyMembers!.length).toBe(1);
    expect(student.familyMembers![0].relationshipType).toBe('Father');
    expect(student.familyMembers![0].name).toBe('Sunil Perera');
    expect(student.familyMembers![0].contactNumber).toBe('0771234567');
  });

  // ----------------------------------------------------
  // Test 2: Family with Mother only succeeds
  // ----------------------------------------------------
  it('2. registers a student with Mother only successfully', () => {
    const input = makeStudentInput('ADM-M01', 'Kamal Silva');
    input.familyMembers = [
      {
        relationshipType: 'Mother',
        name: 'Sunethra Silva',
        contactNumber: '0712345678'
      }
    ];

    const student = studentService.registerStudent(mockStaff, input);
    expect(student.familyMembers).toBeDefined();
    expect(student.familyMembers!.length).toBe(1);
    expect(student.familyMembers![0].relationshipType).toBe('Mother');
    expect(student.familyMembers![0].name).toBe('Sunethra Silva');
    expect(student.familyMembers![0].contactNumber).toBe('0712345678');
  });

  // ----------------------------------------------------
  // Test 3: Family with Father and Mother succeeds
  // ----------------------------------------------------
  it('3. registers a student with both Father and Mother', () => {
    const input = makeStudentInput('ADM-FM01', 'Ruwan Fernando');
    input.familyMembers = [
      {
        relationshipType: 'Father',
        name: 'Anura Fernando',
        contactNumber: '0777123456'
      },
      {
        relationshipType: 'Mother',
        name: 'Malkanthi Fernando',
        contactNumber: '0711123456',
        whatsappNumber: '0711123456'
      }
    ];

    const student = studentService.registerStudent(mockStaff, input);
    expect(student.familyMembers!.length).toBe(2);
    expect(student.familyMembers![0].relationshipType).toBe('Father');
    expect(student.familyMembers![1].relationshipType).toBe('Mother');
  });

  // ----------------------------------------------------
  // Test 4: Family with Father, Mother and Guardian succeeds
  // ----------------------------------------------------
  it('4. registers a student with Father, Mother, and Guardian', () => {
    const input = makeStudentInput('ADM-FMG01', 'Dulan Wickrama');
    input.familyMembers = [
      { relationshipType: 'Father', name: 'Sarath Wickrama', contactNumber: '0771112233' },
      { relationshipType: 'Mother', name: 'Chandra Wickrama', contactNumber: '0712223344' },
      { relationshipType: 'Guardian', name: 'Gamini Wickrama', contactNumber: '0112334455' }
    ];

    const student = studentService.registerStudent(mockStaff, input);
    expect(student.familyMembers!.length).toBe(3);
    const types = student.familyMembers!.map(m => m.relationshipType);
    expect(types).toEqual(['Father', 'Mother', 'Guardian']);
  });

  // ----------------------------------------------------
  // Test 5: Family with Guardian only is strictly rejected
  // ----------------------------------------------------
  it('5. strictly rejects family with Guardian only', () => {
    const input = makeStudentInput('ADM-G01', 'Kasun Bandara');
    input.familyMembers = [
      {
        relationshipType: 'Guardian',
        name: 'Wimal Bandara',
        contactNumber: '0779998877'
      }
    ];

    expect(() => {
      studentService.registerStudent(mockStaff, input);
    }).toThrow(/Guardian cannot be the sole relationship/i);
  });

  // ----------------------------------------------------
  // Test 6: Family with empty parent list is strictly rejected
  // ----------------------------------------------------
  it('6. strictly rejects family with no parents or empty member array', () => {
    expect(() => {
      familyService.validateFamilyMembers([]);
    }).toThrow(/At least one parent \(Father or Mother\) must be provided/i);
  });

  // ----------------------------------------------------
  // Test 7: Duplicate relationship types within one family rejected
  // ----------------------------------------------------
  it('7. rejects duplicate relationships within the same family', () => {
    const input = makeStudentInput('ADM-DUP01', 'Saman Kumara');
    input.familyMembers = [
      { relationshipType: 'Father', name: 'First Father', contactNumber: '0771234567' },
      { relationshipType: 'Father', name: 'Second Father', contactNumber: '0777654321' }
    ];

    expect(() => {
      studentService.registerStudent(mockStaff, input);
    }).toThrow(/cannot have duplicate Father records/i);
  });

  // ----------------------------------------------------
  // Test 8: Sri Lankan 10-digit phone number validation
  // ----------------------------------------------------
  it('8. validates Sri Lankan 10-digit telephone numbers', () => {
    // Valid phone numbers (mobile 07X, landline 011/081, with hyphens/spaces)
    expect(FamilyService.validateSriLankanPhone('0771234567', 'Contact Number')).toBe('0771234567');
    expect(FamilyService.validateSriLankanPhone('0112345678', 'Contact Number')).toBe('0112345678');
    expect(FamilyService.validateSriLankanPhone('077-1234567', 'Contact Number')).toBe('0771234567');
    expect(FamilyService.validateSriLankanPhone('077 123 4567', 'Contact Number')).toBe('0771234567');

    // Invalid phone numbers
    expect(() => FamilyService.validateSriLankanPhone('771234567', 'Contact Number')).toThrow(/10-digit Sri Lankan telephone number starting with 0/);
    expect(() => FamilyService.validateSriLankanPhone('077123456', 'Contact Number')).toThrow(/10-digit Sri Lankan telephone number starting with 0/);
    expect(() => FamilyService.validateSriLankanPhone('07712345678', 'Contact Number')).toThrow(/10-digit Sri Lankan telephone number starting with 0/);
    expect(() => FamilyService.validateSriLankanPhone('077abc1234', 'Contact Number')).toThrow(/10-digit Sri Lankan telephone number starting with 0/);
    expect(() => FamilyService.validateSriLankanPhone('', 'Contact Number', true)).toThrow(/is required/);
  });

  // ----------------------------------------------------
  // Test 9: WhatsApp number validation
  // ----------------------------------------------------
  it('9. validates optional WhatsApp numbers', () => {
    // Optional (null / empty) accepted
    expect(FamilyService.validateSriLankanPhone(null, 'WhatsApp', false)).toBeNull();
    expect(FamilyService.validateSriLankanPhone('', 'WhatsApp', false)).toBeNull();

    // Valid if provided
    expect(FamilyService.validateSriLankanPhone('0771234567', 'WhatsApp', false)).toBe('0771234567');

    // Invalid rejected
    expect(() => FamilyService.validateSriLankanPhone('12345', 'WhatsApp', false)).toThrow(/10-digit Sri Lankan telephone number starting with 0/);
  });

  // ----------------------------------------------------
  // Test 10: Occupation selection & Quick Create integration
  // ----------------------------------------------------
  it('10. handles occupation selection, quick create, and invalid occupation ID rejection', () => {
    // Quick create a new occupation
    const doctorOcc = quickCreateService.quickCreate(mockStaff, 'occupations', 'Medical Doctor');
    expect(doctorOcc.id).toBeDefined();

    const input = makeStudentInput('ADM-OCC01', 'Nuwan Dissanayake');
    input.familyMembers = [
      {
        relationshipType: 'Father',
        name: 'Dr. Ranjith Dissanayake',
        contactNumber: '0772223344',
        occupationId: doctorOcc.id
      }
    ];

    const student = studentService.registerStudent(mockStaff, input);
    expect(student.familyMembers![0].occupationId).toBe(doctorOcc.id);
    expect(student.familyMembers![0].occupationName).toBe('Medical Doctor');

    // Non-existent occupation ID rejected
    const invalidInput = makeStudentInput('ADM-OCC02', 'Bawantha Dissanayake');
    invalidInput.familyMembers = [
      {
        relationshipType: 'Mother',
        name: 'Champa Dissanayake',
        contactNumber: '0712223344',
        occupationId: 999999
      }
    ];

    expect(() => {
      studentService.registerStudent(mockStaff, invalidInput);
    }).toThrow(/Selected occupation for Mother does not exist/i);
  });

  // ----------------------------------------------------
  // Test 11: Sibling sharing: 2 students sharing family ID share parent records
  // ----------------------------------------------------
  it('11. verifies that sibling students linked to the same family share parent records', () => {
    // Register first student (creates new family)
    const elderSiblingInput = makeStudentInput('ADM-SIB01', 'Sachintha Jayawardena');
    elderSiblingInput.familyMembers = [
      {
        relationshipType: 'Father',
        name: 'Jayampathi Jayawardena',
        contactNumber: '0773334455',
        whatsappNumber: '0773334455'
      },
      {
        relationshipType: 'Mother',
        name: 'Renuka Jayawardena',
        contactNumber: '0713334455'
      }
    ];

    const elderSibling = studentService.registerStudent(mockStaff, elderSiblingInput);
    const familyId = elderSibling.familyId;
    expect(familyId).toBeGreaterThan(0);

    // Register second student directly linked to the same family (simulating sibling registration)
    testDb.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade, status)
      VALUES (?, 'ADM-SIB02', '2026-02-01', 'Kavindu Jayawardena', 'Male', '2017-08-20', 3, 'Active')
    `).run(familyId);

    const youngerSibling = studentService.getStudentById(2)!;
    expect(youngerSibling.familyId).toBe(familyId);
    expect(youngerSibling.familyMembers).toBeDefined();
    expect(youngerSibling.familyMembers!.length).toBe(2);
    expect(youngerSibling.familyMembers![0].name).toBe('Jayampathi Jayawardena');

    // Verify linked students list contains both siblings
    const linked = familyService.getLinkedStudents(familyId);
    expect(linked.length).toBe(2);
    expect(linked.map(s => s.admissionNumber)).toEqual(['ADM-SIB01', 'ADM-SIB02']);
  });

  // ----------------------------------------------------
  // Test 12: Updating parent information on the family reflects on all siblings
  // ----------------------------------------------------
  it('12. updates parent details on family and reflects automatically on all linked student profiles', () => {
    // Create family with student 1 and student 2
    const input = makeStudentInput('ADM-UPD01', 'Anuki Senanayake');
    input.familyMembers = [
      { relationshipType: 'Father', name: 'Nalaka Senanayake', contactNumber: '0774445566' },
      { relationshipType: 'Mother', name: 'Deepika Senanayake', contactNumber: '0714445566' }
    ];
    const s1 = studentService.registerStudent(mockStaff, input);
    const familyId = s1.familyId;

    // Link sibling
    testDb.prepare(`
      INSERT INTO students (family_id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade, status)
      VALUES (?, 'ADM-UPD02', '2026-02-01', 'Dinuki Senanayake', 'Female', '2018-03-12', 2, 'Active')
    `).run(familyId);

    // Update family members: Update Father's phone, add Guardian
    const updateResult = familyService.updateFamilyMembers(mockStaff, {
      familyId,
      members: [
        { relationshipType: 'Father', name: 'Nalaka Senanayake', contactNumber: '0779991122', whatsappNumber: '0779991122' },
        { relationshipType: 'Mother', name: 'Deepika Senanayake', contactNumber: '0714445566' },
        { relationshipType: 'Guardian', name: 'Sunil Senanayake', contactNumber: '0112556677' }
      ]
    });

    expect(updateResult.length).toBe(3);

    // Sibling 1 profile reflects update
    const p1 = studentService.getStudentById(s1.id)!;
    expect(p1.familyMembers!.length).toBe(3);
    const father1 = p1.familyMembers!.find(m => m.relationshipType === 'Father')!;
    expect(father1.contactNumber).toBe('0779991122');
    expect(father1.whatsappNumber).toBe('0779991122');

    // Sibling 2 profile reflects the exact same update
    const p2 = studentService.getStudentById(2)!;
    expect(p2.familyMembers!.length).toBe(3);
    const father2 = p2.familyMembers!.find(m => m.relationshipType === 'Father')!;
    expect(father2.contactNumber).toBe('0779991122');
  });

  // ----------------------------------------------------
  // Test 13: Transaction rollback on failure
  // ----------------------------------------------------
  it('13. rolls back transaction on family member update failure preserving previous state', () => {
    const input = makeStudentInput('ADM-RB01', 'Tharindu Fernando');
    input.familyMembers = [
      { relationshipType: 'Father', name: 'Prasanna Fernando', contactNumber: '0775556677' }
    ];
    const s = studentService.registerStudent(mockStaff, input);
    const familyId = s.familyId;

    // Attempt an invalid update: Second member has an invalid phone number
    expect(() => {
      familyService.updateFamilyMembers(mockStaff, {
        familyId,
        members: [
          { relationshipType: 'Father', name: 'Updated Name', contactNumber: '0775556677' },
          { relationshipType: 'Mother', name: 'Incomplete Phone Mother', contactNumber: '123' } // Invalid
        ]
      });
    }).toThrow();

    // Verify original state is untouched
    const members = familyService.getFamilyMembers(familyId);
    expect(members.length).toBe(1);
    expect(members[0].name).toBe('Prasanna Fernando');
  });

  // ----------------------------------------------------
  // Test 14: Authorization checks for family member operations
  // ----------------------------------------------------
  it('14. allows Staff and Admin to manage family members and logs audit records', () => {
    const input = makeStudentInput('ADM-AUTH01', 'Chamari Silva');
    input.familyMembers = [
      { relationshipType: 'Mother', name: 'Kusum Silva', contactNumber: '0716667788' }
    ];
    const s = studentService.registerStudent(mockStaff, input);
    const familyId = s.familyId;

    // Staff can update
    const staffUpdated = familyService.updateFamilyMembers(mockStaff, {
      familyId,
      members: [
        { relationshipType: 'Mother', name: 'Kusum Silva Updated', contactNumber: '0716667788' }
      ]
    });
    expect(staffUpdated[0].name).toBe('Kusum Silva Updated');

    // Admin can update
    const adminUpdated = familyService.updateFamilyMembers(mockAdmin, {
      familyId,
      members: [
        { relationshipType: 'Mother', name: 'Kusum Silva Final', contactNumber: '0716667788' }
      ]
    });
    expect(adminUpdated[0].name).toBe('Kusum Silva Final');

    // Verify audit logs were written
    const auditLogs = testDb.prepare("SELECT action, entity_id FROM audit_logs WHERE entity_type = 'families'").all() as Array<{ action: string; entity_id: string }>;
    expect(auditLogs.length).toBeGreaterThanOrEqual(2);
    expect(auditLogs[0].action).toBe('UPDATE_FAMILY_MEMBERS');
  });

  // ----------------------------------------------------
  // Test 15: Migration verification for migration 010
  // ----------------------------------------------------
  it('15. verifies that migration 010 creates composite indexes and handles NOCASE collation safely', () => {
    // Check that indexes created by migration010 exist in SQLite
    const indexRows = testDb.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'family_members'").all() as Array<{ name: string }>;
    const indexNames = indexRows.map(r => r.name);

    expect(indexNames).toContain('idx_family_members_family');
    expect(indexNames).toContain('idx_family_members_contact');
    expect(indexNames).toContain('idx_family_members_whatsapp');
    expect(indexNames).toContain('idx_family_members_occupation');
    expect(indexNames).toContain('idx_family_members_family_rel');

    // Verify occupations NOCASE index exists
    const occIndexRows = testDb.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'occupations'").all() as Array<{ name: string }>;
    const occIndexNames = occIndexRows.map(r => r.name);
    expect(occIndexNames).toContain('idx_occupations_name_nocase');
  });
});

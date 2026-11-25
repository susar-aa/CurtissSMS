import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DatabaseMigrator } from '../electron/database/migrator';
import { StudentService } from '../electron/services/studentService';
import { FamilyService } from '../electron/services/familyService';
import { IAuthSession, IRegisterStudentInput } from '../electron/shared/types';

describe('Stage 08 – Sibling Management Tests', () => {
  let testDbPath: string;
  let testDb: Database.Database;
  let studentService: StudentService;
  let familyService: FamilyService;

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
    testDbPath = path.join(__dirname, `test_stage08_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    testDb = new Database(testDbPath);
    testDb.pragma('journal_mode = WAL');
    testDb.pragma('foreign_keys = ON');

    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    // Seed test users
    testDb.prepare("INSERT OR IGNORE INTO users (id, display_name, pin_hash, pin_hmac, role) VALUES (1, 'Headmaster Admin', 'hash1', 'hmac1', 'Admin')").run();
    testDb.prepare("INSERT OR IGNORE INTO users (id, display_name, pin_hash, pin_hmac, role) VALUES (2, 'Registrar Staff', 'hash2', 'hmac2', 'Staff')").run();

    studentService = new StudentService(testDb);
    familyService = new FamilyService(testDb);
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

  const createStudent = (adm: string, name: string, grade = 5, phone = '0771234567'): number => {
    const input: IRegisterStudentInput = {
      admissionNumber: adm,
      admissionDate: '2026-01-10',
      fullName: name,
      gender: 'Male',
      dateOfBirth: '2015-05-15',
      currentGrade: grade,
      houseNo: 'No. 12',
      familyMembers: [
        {
          relationshipType: 'Father',
          name: `Father of ${name}`,
          contactNumber: phone
        }
      ]
    };
    const s = studentService.registerStudent(mockStaff, input);
    return s.id;
  };

  // ----------------------------------------------------
  // Test 1: Search candidate siblings excluding current student and already linked siblings
  // ----------------------------------------------------
  it('1. searches candidate siblings excluding target student and existing family members', () => {
    const s1 = createStudent('ADM-101', 'Kasun Perera');
    const s2 = createStudent('ADM-102', 'Amal Perera');
    const s3 = createStudent('ADM-103', 'Sunil Silva');

    // Search for 'Perera' with excludeStudentId = s1
    const candidates = familyService.searchCandidateSiblings({
      search: 'Perera',
      excludeStudentId: s1
    });

    expect(candidates.length).toBe(1);
    expect(candidates[0].id).toBe(s2);
    expect(candidates[0].admissionNumber).toBe('ADM-102');

    // Link s2 to s1
    familyService.linkSiblings(mockStaff, { primaryStudentId: s1, siblingStudentId: s2 });

    // Now searching from s1 should return 0 candidates for 'Perera' because s2 is already in the same family
    const candidatesAfterLink = familyService.searchCandidateSiblings({
      search: 'Perera',
      excludeStudentId: s1
    });
    expect(candidatesAfterLink.length).toBe(0);

    // Searching 'Silva' from s1 returns s3
    const silvaCandidates = familyService.searchCandidateSiblings({
      search: 'Silva',
      excludeStudentId: s1
    });
    expect(silvaCandidates.length).toBe(1);
    expect(silvaCandidates[0].id).toBe(s3);
  });

  // ----------------------------------------------------
  // Test 2: Link siblings and verify shared family foundation
  // ----------------------------------------------------
  it('2. links two existing students into a shared family and updates linked student lists', () => {
    const s1 = createStudent('ADM-201', 'Dilshan Mendis');
    const s2 = createStudent('ADM-202', 'Kusal Mendis');

    const profile1Before = studentService.getStudentById(s1)!;
    const profile2Before = studentService.getStudentById(s2)!;
    expect(profile1Before.familyId).not.toBe(profile2Before.familyId);

    // Link s2 into s1's family
    const updatedFamily = familyService.linkSiblings(mockStaff, {
      primaryStudentId: s1,
      siblingStudentId: s2
    });

    expect(updatedFamily.id).toBe(profile1Before.familyId);
    expect(updatedFamily.linkedStudents!.length).toBe(2);

    const profile1After = studentService.getStudentById(s1)!;
    const profile2After = studentService.getStudentById(s2)!;

    // Both now share the exact same familyId and familyCode
    expect(profile2After.familyId).toBe(profile1After.familyId);
    expect(profile2After.familyCode).toBe(profile1After.familyCode);

    // Both profiles show both students in linkedStudents
    expect(profile1After.linkedStudents!.length).toBe(2);
    expect(profile2After.linkedStudents!.length).toBe(2);
    expect(profile1After.linkedStudents!.map(s => s.admissionNumber)).toEqual(['ADM-201', 'ADM-202']);
    expect(profile2After.linkedStudents!.map(s => s.admissionNumber)).toEqual(['ADM-201', 'ADM-202']);
  });

  // ----------------------------------------------------
  // Test 3: Solitary abandoned family is safely cleaned up
  // ----------------------------------------------------
  it('3. cleans up abandoned solitary family when a lone student is linked to another family', () => {
    const s1 = createStudent('ADM-301', 'Student A');
    const s2 = createStudent('ADM-302', 'Student B');

    const s2OldFamilyId = studentService.getStudentById(s2)!.familyId;

    familyService.linkSiblings(mockStaff, {
      primaryStudentId: s1,
      siblingStudentId: s2
    });

    // The old family of s2 should be deleted from families and family_members
    const oldFamilyRow = testDb.prepare('SELECT id FROM families WHERE id = ?').get(s2OldFamilyId);
    expect(oldFamilyRow).toBeUndefined();

    const oldMembers = testDb.prepare('SELECT id FROM family_members WHERE family_id = ?').all(s2OldFamilyId);
    expect(oldMembers.length).toBe(0);
  });

  // ----------------------------------------------------
  // Test 4: Preserves original family when linking a student from a multi-student family
  // ----------------------------------------------------
  it('4. preserves remaining siblings in original family when moving one sibling to a new family', () => {
    const s1 = createStudent('ADM-401', 'Target Student');
    const s2 = createStudent('ADM-402', 'Moving Student');
    const s3 = createStudent('ADM-403', 'Remaining Sibling');

    // Put s2 and s3 in the same family first
    familyService.linkSiblings(mockStaff, { primaryStudentId: s2, siblingStudentId: s3 });
    const s2FamilyId = studentService.getStudentById(s2)!.familyId;

    // Move s2 to s1's family
    familyService.linkSiblings(mockStaff, { primaryStudentId: s1, siblingStudentId: s2 });

    // s3 must still belong to s2FamilyId and s2FamilyId must still exist!
    const s3Profile = studentService.getStudentById(s3)!;
    expect(s3Profile.familyId).toBe(s2FamilyId);
    expect(s3Profile.linkedStudents!.length).toBe(1);
    expect(s3Profile.linkedStudents![0].id).toBe(s3);
  });

  // ----------------------------------------------------
  // Test 5: Rejects self-linking
  // ----------------------------------------------------
  it('5. strictly rejects attempting to link a student to themselves', () => {
    const s1 = createStudent('ADM-501', 'Single Student');
    expect(() => {
      familyService.linkSiblings(mockStaff, {
        primaryStudentId: s1,
        siblingStudentId: s1
      });
    }).toThrow(/cannot be linked to themselves/i);
  });

  // ----------------------------------------------------
  // Test 6: Rejects duplicate linking of already-linked students
  // ----------------------------------------------------
  it('6. strictly rejects linking students who are already siblings in the same family', () => {
    const s1 = createStudent('ADM-601', 'Sibling One');
    const s2 = createStudent('ADM-602', 'Sibling Two');

    familyService.linkSiblings(mockStaff, { primaryStudentId: s1, siblingStudentId: s2 });

    expect(() => {
      familyService.linkSiblings(mockStaff, { primaryStudentId: s1, siblingStudentId: s2 });
    }).toThrow(/already linked in the same family/i);
  });

  // ----------------------------------------------------
  // Test 7: Rejects linking non-existent students
  // ----------------------------------------------------
  it('7. strictly rejects linking with non-existent student IDs', () => {
    const s1 = createStudent('ADM-701', 'Valid Student');
    expect(() => {
      familyService.linkSiblings(mockStaff, { primaryStudentId: s1, siblingStudentId: 99999 });
    }).toThrow(/not found/i);

    expect(() => {
      familyService.linkSiblings(mockStaff, { primaryStudentId: 99999, siblingStudentId: s1 });
    }).toThrow(/not found/i);
  });

  // ----------------------------------------------------
  // Test 8: Sibling information synchronization (updating family updates all linked siblings)
  // ----------------------------------------------------
  it('8. updates shared parents and reflects automatically across all linked sibling profiles', () => {
    const s1 = createStudent('ADM-801', 'Nadeesha Fernando');
    const s2 = createStudent('ADM-802', 'Mahesha Fernando');

    familyService.linkSiblings(mockStaff, { primaryStudentId: s1, siblingStudentId: s2 });
    const sharedFamilyId = studentService.getStudentById(s1)!.familyId;

    // Update shared parent information on the family
    familyService.updateFamilyMembers(mockStaff, {
      familyId: sharedFamilyId,
      members: [
        {
          relationshipType: 'Father',
          name: 'Gamini Fernando Updated',
          contactNumber: '0779876543',
          whatsappNumber: '0779876543'
        },
        {
          relationshipType: 'Mother',
          name: 'Sujatha Fernando Updated',
          contactNumber: '0719876543'
        }
      ]
    });

    // Check sibling 1
    const p1 = studentService.getStudentById(s1)!;
    expect(p1.familyMembers!.length).toBe(2);
    expect(p1.familyMembers![0].name).toBe('Gamini Fernando Updated');
    expect(p1.familyMembers![0].contactNumber).toBe('0779876543');

    // Check sibling 2
    const p2 = studentService.getStudentById(s2)!;
    expect(p2.familyMembers!.length).toBe(2);
    expect(p2.familyMembers![0].name).toBe('Gamini Fernando Updated');
    expect(p2.familyMembers![0].contactNumber).toBe('0779876543');
  });

  // ----------------------------------------------------
  // Test 9: Student-specific records remain isolated
  // ----------------------------------------------------
  it('9. ensures student-specific records (grade, notes, admission) remain isolated after linking', () => {
    const s1 = createStudent('ADM-901', 'Elder Brother', 10);
    const s2 = createStudent('ADM-902', 'Younger Sister', 3);

    studentService.addStudentNote(mockStaff, s1, 'Note exclusive to Elder Brother');

    familyService.linkSiblings(mockStaff, { primaryStudentId: s1, siblingStudentId: s2 });

    const p1 = studentService.getStudentById(s1)!;
    const p2 = studentService.getStudentById(s2)!;

    expect(p1.currentGrade).toBe(10);
    expect(p2.currentGrade).toBe(3);
    expect(p1.admissionNumber).toBe('ADM-901');
    expect(p2.admissionNumber).toBe('ADM-902');

    // Notes isolation
    expect(p1.notes.length).toBe(1);
    expect(p1.notes[0].noteText).toBe('Note exclusive to Elder Brother');
    expect(p2.notes.length).toBe(0);
  });

  // ----------------------------------------------------
  // Test 10: Unlink sibling creates new independent family and preserves parent & address records
  // ----------------------------------------------------
  it('10. unlinks a sibling, creating a new family record while preserving parent and address details', () => {
    const s1 = createStudent('ADM-1001', 'First Sibling');
    const s2 = createStudent('ADM-1002', 'Second Sibling');

    familyService.linkSiblings(mockStaff, { primaryStudentId: s1, siblingStudentId: s2 });

    const sharedFamilyId = studentService.getStudentById(s1)!.familyId;

    // Unlink s2
    familyService.unlinkSibling(mockStaff, { studentId: s2 });

    const p1After = studentService.getStudentById(s1)!;
    const p2After = studentService.getStudentById(s2)!;

    // s1 remains in original family, now sole member
    expect(p1After.familyId).toBe(sharedFamilyId);
    expect(p1After.linkedStudents!.length).toBe(1);
    expect(p1After.linkedStudents![0].id).toBe(s1);

    // s2 is in a brand-new independent family
    expect(p2After.familyId).not.toBe(sharedFamilyId);
    expect(p2After.familyCode).not.toBe(p1After.familyCode);
    expect(p2After.linkedStudents!.length).toBe(1);
    expect(p2After.linkedStudents![0].id).toBe(s2);

    // s2's parent records and address are preserved in the new family!
    expect(p2After.familyMembers).toBeDefined();
    expect(p2After.familyMembers!.length).toBeGreaterThanOrEqual(1);
    expect(p2After.familyMembers![0].name).toBe(p1After.familyMembers![0].name);
    expect(p2After.houseNo).toBe(p1After.houseNo);
  });

  // ----------------------------------------------------
  // Test 11: Rejects unlinking a student with no siblings
  // ----------------------------------------------------
  it('11. strictly rejects unlinking a student who is the sole member of their family', () => {
    const s1 = createStudent('ADM-1101', 'Lone Student');
    expect(() => {
      familyService.unlinkSibling(mockStaff, { studentId: s1 });
    }).toThrow(/no other siblings linked/i);
  });

  // ----------------------------------------------------
  // Test 12: Sibling registration shortcut
  // ----------------------------------------------------
  it('12. registers a new student directly linked to an existing sibling without duplicate family creation', () => {
    const elderSiblingId = createStudent('ADM-1201', 'Pradeep Kumara', 8);
    const elderProfile = studentService.getStudentById(elderSiblingId)!;

    // Register younger sibling using siblingOfStudentId
    const youngerInput: IRegisterStudentInput = {
      admissionNumber: 'ADM-1202',
      admissionDate: '2026-02-01',
      fullName: 'Sandun Kumara',
      gender: 'Male',
      dateOfBirth: '2019-03-10',
      currentGrade: 1,
      siblingOfStudentId: elderSiblingId
    };

    const youngerProfile = studentService.registerStudent(mockStaff, youngerInput);

    // Both belong to the exact same family
    expect(youngerProfile.familyId).toBe(elderProfile.familyId);
    expect(youngerProfile.familyCode).toBe(elderProfile.familyCode);

    // Younger student inherited elder student's parents and address
    expect(youngerProfile.familyMembers!.length).toBe(elderProfile.familyMembers!.length);
    expect(youngerProfile.familyMembers![0].name).toBe(elderProfile.familyMembers![0].name);

    // Both reflect linked status
    const reloadedElder = studentService.getStudentById(elderSiblingId)!;
    expect(reloadedElder.linkedStudents!.length).toBe(2);
    expect(youngerProfile.linkedStudents!.length).toBe(2);
  });

  // ----------------------------------------------------
  // Test 13: Sibling registration shortcut with invalid sibling ID rejected
  // ----------------------------------------------------
  it('13. rejects registration when referenced sibling ID does not exist', () => {
    const input: IRegisterStudentInput = {
      admissionNumber: 'ADM-1301',
      admissionDate: '2026-02-01',
      fullName: 'Invalid Sibling Student',
      gender: 'Male',
      dateOfBirth: '2019-03-10',
      currentGrade: 1,
      siblingOfStudentId: 888888
    };

    expect(() => {
      studentService.registerStudent(mockStaff, input);
    }).toThrow(/Referenced sibling student.*not found/i);
  });

  // ----------------------------------------------------
  // Test 14: Authorization & audit logging for sibling linking and unlinking
  // ----------------------------------------------------
  it('14. verifies Staff and Admin authorization and logs audit records for link and unlink operations', () => {
    const s1 = createStudent('ADM-1401', 'Auth Student One');
    const s2 = createStudent('ADM-1402', 'Auth Student Two');

    // Staff can link
    familyService.linkSiblings(mockStaff, { primaryStudentId: s1, siblingStudentId: s2 });

    const linkLog = testDb.prepare("SELECT * FROM audit_logs WHERE action IN ('LINK_SIBLINGS', 'MERGE_FAMILIES_LINK_SIBLINGS') AND user_id = ?").get(mockStaff.id);
    expect(linkLog).toBeDefined();

    // Admin can unlink
    familyService.unlinkSibling(mockAdmin, { studentId: s2 });

    const unlinkLog = testDb.prepare("SELECT * FROM audit_logs WHERE action = 'UNLINK_SIBLING' AND user_id = ?").get(mockAdmin.id);
    expect(unlinkLog).toBeDefined();
  });

  // ----------------------------------------------------
  // Test 15: Migration 011 verification
  // ----------------------------------------------------
  it('15. verifies migration 011 creates sibling search indexes and executes cleanly', () => {
    const indexRows = testDb.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'students'").all() as Array<{ name: string }>;
    const indexNames = indexRows.map(r => r.name);

    expect(indexNames).toContain('idx_students_family_search');
    expect(indexNames).toContain('idx_students_candidate_search');
    expect(indexNames).toContain('idx_students_family_status');
  });

  // ====================================================
  // STAGE 08 CORRECTION: 11 FAMILY MERGE & DATA PRESERVATION SCENARIOS
  // ====================================================

  // Scenario 1: Merging families with identical addresses and parent records
  it('16. handles merging families with identical addresses and parent records seamlessly without conflicts', () => {
    const s1 = createStudent('ADM-1601', 'Twin One', 6, '0771112233');
    const s2 = createStudent('ADM-1602', 'Twin Two', 6, '0771112233');

    // Both have same father contact, houseNo
    const preview = familyService.getFamilyMergePreview(s1, s2);
    expect(preview.destinationStudent.id).toBe(s1);
    expect(preview.sourceStudent.id).toBe(s2);
    // Differences exist only in student's name in father name ("Father of Twin One" vs "Father of Twin Two")
    expect(preview.differences.father.destination?.contactNumber).toBe('0771112233');
    expect(preview.differences.father.source?.contactNumber).toBe('0771112233');

    const result = familyService.linkSiblings(mockStaff, {
      primaryStudentId: s1,
      siblingStudentId: s2,
      resolutionStrategy: 'keep_destination'
    });
    expect(result.linkedStudents!.length).toBe(2);
  });

  // Scenario 2: Merging families with different addresses (destination retained vs source selected)
  it('17. resolves address differences according to chosen strategy (destination vs source)', () => {
    const s1 = createStudent('ADM-1701', 'Student Dest Address', 4);
    const s2 = createStudent('ADM-1702', 'Student Source Address', 4);

    // Update addresses on each family to distinct values
    const p1 = studentService.getStudentById(s1)!;
    const p2 = studentService.getStudentById(s2)!;

    testDb.prepare('UPDATE families SET house_no = ?, full_address = ? WHERE id = ?').run('No. 100 Dest', '100 Dest Street', p1.familyId);
    testDb.prepare('UPDATE families SET house_no = ?, full_address = ? WHERE id = ?').run('No. 200 Source', '200 Source Street', p2.familyId);

    const preview = familyService.getFamilyMergePreview(s1, s2);
    expect(preview.hasConflicts).toBe(true);
    expect(preview.conflicts.some(c => c.field === 'address')).toBe(true);

    // Merge using 'use_source'
    familyService.linkSiblings(mockStaff, {
      primaryStudentId: s1,
      siblingStudentId: s2,
      resolutionStrategy: 'use_source'
    });

    const mergedP1 = studentService.getStudentById(s1)!;
    const mergedP2 = studentService.getStudentById(s2)!;
    expect(mergedP1.houseNo).toBe('No. 200 Source');
    expect(mergedP1.fullAddress).toBe('200 Source Street');
    expect(mergedP2.houseNo).toBe('No. 200 Source');
    expect(mergedP2.fullAddress).toBe('200 Source Street');
  });

  // Scenario 3: Merging families with conflicting parent details (father, mother, guardian)
  it('18. identifies conflicts when both families have different parent and guardian details', () => {
    const s1 = createStudent('ADM-1801', 'Conflict Student One');
    const s2 = createStudent('ADM-1802', 'Conflict Student Two');
    const f1Id = studentService.getStudentById(s1)!.familyId;
    const f2Id = studentService.getStudentById(s2)!.familyId;

    // Set full distinct parent & guardian records
    familyService.updateFamilyMembers(mockStaff, {
      familyId: f1Id,
      members: [
        { relationshipType: 'Father', name: 'Father Dest', contactNumber: '0711111111' },
        { relationshipType: 'Mother', name: 'Mother Dest', contactNumber: '0722222222' },
        { relationshipType: 'Guardian', name: 'Guardian Dest', contactNumber: '0733333333' }
      ]
    });
    familyService.updateFamilyMembers(mockStaff, {
      familyId: f2Id,
      members: [
        { relationshipType: 'Father', name: 'Father Source', contactNumber: '0744444444' },
        { relationshipType: 'Mother', name: 'Mother Source', contactNumber: '0755555555' },
        { relationshipType: 'Guardian', name: 'Guardian Source', contactNumber: '0766666666' }
      ]
    });

    const preview = familyService.getFamilyMergePreview(s1, s2);
    expect(preview.hasConflicts).toBe(true);
    expect(preview.conflicts.length).toBeGreaterThanOrEqual(3);
    expect(preview.conflicts.map(c => c.field)).toContain('father');
    expect(preview.conflicts.map(c => c.field)).toContain('mother');
    expect(preview.conflicts.map(c => c.field)).toContain('guardian');
  });

  // Scenario 4: Retaining destination family details (keep_destination)
  it('19. keeps destination details while safely preserving non-conflicting source details in keep_destination mode', () => {
    const s1 = createStudent('ADM-1901', 'Dest Retain');
    const s2 = createStudent('ADM-1902', 'Source Retain');
    const f1Id = studentService.getStudentById(s1)!.familyId;
    const f2Id = studentService.getStudentById(s2)!.familyId;

    // Dest only has Father
    familyService.updateFamilyMembers(mockStaff, {
      familyId: f1Id,
      members: [
        { relationshipType: 'Father', name: 'Father Retained', contactNumber: '0711111111' }
      ]
    });
    // Source has different Father AND a Mother
    familyService.updateFamilyMembers(mockStaff, {
      familyId: f2Id,
      members: [
        { relationshipType: 'Father', name: 'Father Source Ignored', contactNumber: '0777777777' },
        { relationshipType: 'Mother', name: 'Mother Source Preserved', contactNumber: '0788888888' }
      ]
    });

    familyService.linkSiblings(mockStaff, {
      primaryStudentId: s1,
      siblingStudentId: s2,
      resolutionStrategy: 'keep_destination'
    });

    const mergedP1 = studentService.getStudentById(s1)!;
    expect(mergedP1.familyMembers!.length).toBe(2);
    const father = mergedP1.familyMembers!.find(m => m.relationshipType === 'Father');
    const mother = mergedP1.familyMembers!.find(m => m.relationshipType === 'Mother');
    expect(father?.name).toBe('Father Retained'); // Destination Father kept
    expect(mother?.name).toBe('Mother Source Preserved'); // Source Mother preserved (zero data loss!)
  });

  // Scenario 5: Applying source family details (use_source)
  it('20. applies source family details completely when use_source resolution strategy is selected', () => {
    const s1 = createStudent('ADM-2001', 'Dest Student');
    const s2 = createStudent('ADM-2002', 'Source Student');
    const f1Id = studentService.getStudentById(s1)!.familyId;
    const f2Id = studentService.getStudentById(s2)!.familyId;

    testDb.prepare('UPDATE families SET house_no = ? WHERE id = ?').run('Dest House', f1Id);
    testDb.prepare('UPDATE families SET house_no = ? WHERE id = ?').run('Source House', f2Id);

    familyService.updateFamilyMembers(mockStaff, {
      familyId: f1Id,
      members: [{ relationshipType: 'Father', name: 'Father Dest', contactNumber: '0711111111' }]
    });
    familyService.updateFamilyMembers(mockStaff, {
      familyId: f2Id,
      members: [
        { relationshipType: 'Father', name: 'Father Source', contactNumber: '0777777777' },
        { relationshipType: 'Mother', name: 'Mother Source', contactNumber: '0788888888' }
      ]
    });

    familyService.linkSiblings(mockStaff, {
      primaryStudentId: s1,
      siblingStudentId: s2,
      resolutionStrategy: 'use_source'
    });

    const mergedP1 = studentService.getStudentById(s1)!;
    expect(mergedP1.houseNo).toBe('Source House');
    const father = mergedP1.familyMembers!.find(m => m.relationshipType === 'Father');
    const mother = mergedP1.familyMembers!.find(m => m.relationshipType === 'Mother');
    expect(father?.name).toBe('Father Source');
    expect(mother?.name).toBe('Mother Source');
  });

  // Scenario 6: Granular manual resolution (custom resolution)
  it('21. applies granular custom resolution choosing address from destination and mother from source', () => {
    const s1 = createStudent('ADM-2101', 'Custom Dest');
    const s2 = createStudent('ADM-2102', 'Custom Source');
    const f1Id = studentService.getStudentById(s1)!.familyId;
    const f2Id = studentService.getStudentById(s2)!.familyId;

    testDb.prepare('UPDATE families SET house_no = ? WHERE id = ?').run('Keep Dest House', f1Id);
    testDb.prepare('UPDATE families SET house_no = ? WHERE id = ?').run('Ignore Source House', f2Id);

    familyService.updateFamilyMembers(mockStaff, {
      familyId: f1Id,
      members: [
        { relationshipType: 'Father', name: 'Dest Father', contactNumber: '0711111111' },
        { relationshipType: 'Mother', name: 'Dest Mother', contactNumber: '0722222222' }
      ]
    });
    familyService.updateFamilyMembers(mockStaff, {
      familyId: f2Id,
      members: [
        { relationshipType: 'Father', name: 'Source Father', contactNumber: '0777777777' },
        { relationshipType: 'Mother', name: 'Source Mother', contactNumber: '0788888888' }
      ]
    });

    familyService.linkSiblings(mockStaff, {
      primaryStudentId: s1,
      siblingStudentId: s2,
      resolutionStrategy: 'custom',
      customResolution: {
        addressChoice: 'destination', // choose Dest house
        fatherChoice: 'destination',  // choose Dest father
        motherChoice: 'source',       // choose Source mother
        guardianChoice: 'destination'
      }
    });

    const merged = studentService.getStudentById(s1)!;
    expect(merged.houseNo).toBe('Keep Dest House');
    const father = merged.familyMembers!.find(m => m.relationshipType === 'Father');
    const mother = merged.familyMembers!.find(m => m.relationshipType === 'Mother');
    expect(father?.name).toBe('Dest Father');
    expect(mother?.name).toBe('Source Mother');
  });

  // Scenario 7: Cancelling the merge causes zero database changes
  it('7. previewing and cancelling causes zero database changes', () => {
    const s1 = createStudent('ADM-2201', 'Cancel Student One');
    const s2 = createStudent('ADM-2202', 'Cancel Student Two');

    const snapStudents = testDb.prepare('SELECT * FROM students').all();
    const snapFamilies = testDb.prepare('SELECT * FROM families').all();
    const snapMembers = testDb.prepare('SELECT * FROM family_members').all();

    // Call getFamilyMergePreview (which simulates user opening preview modal)
    const preview = familyService.getFamilyMergePreview(s1, s2);
    expect(preview).toBeDefined();

    // User cancels -> no linkSiblings call made
    const afterStudents = testDb.prepare('SELECT * FROM students').all();
    const afterFamilies = testDb.prepare('SELECT * FROM families').all();
    const afterMembers = testDb.prepare('SELECT * FROM family_members').all();

    expect(afterStudents).toEqual(snapStudents);
    expect(afterFamilies).toEqual(snapFamilies);
    expect(afterMembers).toEqual(snapMembers);
  });

  // Scenario 8: Merging multi-student families transfers all students and leaves no fragmented families
  it('23. merges multi-student families transferring all students and leaving no fragmented families', () => {
    const s1 = createStudent('ADM-2301', 'Dest S1');
    const s2 = createStudent('ADM-2302', 'Source S1');
    const s3 = createStudent('ADM-2303', 'Source S2');
    const s4 = createStudent('ADM-2304', 'Source S3');

    // Link s2, s3, s4 together in family B
    familyService.linkSiblings(mockStaff, { primaryStudentId: s2, siblingStudentId: s3 });
    familyService.linkSiblings(mockStaff, { primaryStudentId: s2, siblingStudentId: s4 });

    const f1Id = studentService.getStudentById(s1)!.familyId;
    const f2Id = studentService.getStudentById(s2)!.familyId;

    // Check preview
    const preview = familyService.getFamilyMergePreview(s1, s2);
    expect(preview.sourceStudentCount).toBe(3);

    // Merge family B into family A
    familyService.linkSiblings(mockStaff, {
      primaryStudentId: s1,
      siblingStudentId: s2,
      mergeEntireFamily: true
    });

    // All 4 students now belong to f1Id
    const studentsInF1 = testDb.prepare('SELECT id FROM students WHERE family_id = ?').all(f1Id);
    expect(studentsInF1.length).toBe(4);

    // Old family B is cleaned up with zero orphans
    const oldFamilyB = testDb.prepare('SELECT id FROM families WHERE id = ?').get(f2Id);
    expect(oldFamilyB).toBeUndefined();

    const orphanMembers = testDb.prepare('SELECT id FROM family_members WHERE family_id = ?').all(f2Id);
    expect(orphanMembers.length).toBe(0);
  });

  // Scenario 9: Historical and student-specific records remain isolated
  it('24. verifies historical status history and fee/note records remain isolated during multi-family merge', () => {
    const s1 = createStudent('ADM-2401', 'Student High', 11);
    const s2 = createStudent('ADM-2402', 'Student Low', 2);

    studentService.updateStudent(mockStaff, {
      id: s1,
      status: 'Leaved',
      statusReason: 'Left school temporarily'
    });
    studentService.addStudentNote(mockStaff, s1, 'S1 confidential remark');
    studentService.addStudentNote(mockStaff, s2, 'S2 reading progress note');

    familyService.linkSiblings(mockStaff, { primaryStudentId: s1, siblingStudentId: s2 });

    const p1 = studentService.getStudentById(s1)!;
    const p2 = studentService.getStudentById(s2)!;

    expect(p1.status).toBe('Leaved');
    expect(p2.status).toBe('Active');
    expect(p1.notes.map(n => n.noteText)).toContain('S1 confidential remark');
    expect(p2.notes.map(n => n.noteText)).not.toContain('S1 confidential remark');
    expect(p2.notes.map(n => n.noteText)).toContain('S2 reading progress note');
  });

  // Scenario 10: Transaction rollback on simulated error leaves both families completely intact
  it('25. rolls back completely on simulated error leaving both families completely intact', () => {
    const s1 = createStudent('ADM-2501', 'Rollback S1');
    const s2 = createStudent('ADM-2502', 'Rollback S2');

    const f1Id = studentService.getStudentById(s1)!.familyId;
    const f2Id = studentService.getStudentById(s2)!.familyId;

    // Simulate error by intentionally passing invalid custom resolution with corrupted data or intercepting
    // We can test by attempting an invalid operation or mocking inside the transaction
    const beforeF1 = testDb.prepare('SELECT * FROM families WHERE id = ?').get(f1Id);
    const beforeF2 = testDb.prepare('SELECT * FROM families WHERE id = ?').get(f2Id);
    const beforeMembers = testDb.prepare('SELECT * FROM family_members').all();

    expect(() => {
      // Trigger a failure by passing invalid member with invalid contact number inside custom resolution
      familyService.linkSiblings(mockStaff, {
        primaryStudentId: s1,
        siblingStudentId: s2,
        resolutionStrategy: 'custom',
        customResolution: {
          addressChoice: 'destination',
          fatherChoice: 'custom',
          customFather: {
            relationshipType: 'Father',
            name: 'Corrupt Phone Father',
            contactNumber: 'INVALID_PHONE_NUMBER'
          }
        }
      });
    }).toThrow(/Contact Number.*Sri Lankan/i);

    // Verify complete rollback: neither family modified or deleted!
    const afterF1 = testDb.prepare('SELECT * FROM families WHERE id = ?').get(f1Id);
    const afterF2 = testDb.prepare('SELECT * FROM families WHERE id = ?').get(f2Id);
    const afterMembers = testDb.prepare('SELECT * FROM family_members').all();

    expect(afterF1).toEqual(beforeF1);
    expect(afterF2).toEqual(beforeF2);
    expect(afterMembers).toEqual(beforeMembers);
  });

  // Scenario 11: Audit logging for MERGE_FAMILIES_LINK_SIBLINGS
  it('26. logs comprehensive audit trail with strategy and conflict details', () => {
    const s1 = createStudent('ADM-2601', 'Audit S1');
    const s2 = createStudent('ADM-2602', 'Audit S2');

    familyService.linkSiblings(mockStaff, {
      primaryStudentId: s1,
      siblingStudentId: s2,
      resolutionStrategy: 'keep_destination'
    });

    const log = testDb.prepare("SELECT * FROM audit_logs WHERE action = 'MERGE_FAMILIES_LINK_SIBLINGS' ORDER BY id DESC LIMIT 1").get() as any;
    expect(log).toBeDefined();
    expect(log.user_id).toBe(mockStaff.id);
    const details = JSON.parse(log.details);
    expect(details.strategy).toBe('keep_destination');
    expect(details.primaryStudentId).toBe(s1);
    expect(details.siblingStudentId).toBe(s2);
  });
});

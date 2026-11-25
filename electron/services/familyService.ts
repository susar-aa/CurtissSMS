import Database from 'better-sqlite3';
import {
  IAuthSession,
  FamilyRelationshipType,
  IFamilyMember,
  IFamilyMemberInput,
  IUpdateFamilyMembersInput,
  ILinkedStudent,
  IFamilyDetail,
  ISiblingCandidate,
  ISiblingCandidateQuery,
  ILinkSiblingsInput,
  IUnlinkSiblingInput,
  StudentGender,
  StudentStatus,
  MergeResolutionStrategy,
  ICustomMergeResolution,
  IFamilyMergePreview
} from '../shared/types';

export class FamilyService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Generates a unique family code (e.g. FAM-00001).
   */
  public generateFamilyCode(): string {
    const row = this.db.prepare('SELECT MAX(id) as maxId FROM families').get() as { maxId: number | null };
    const nextId = (row?.maxId || 0) + 1;
    let code = `FAM-${String(nextId).padStart(5, '0')}`;
    let attempts = 0;
    while (this.db.prepare('SELECT id FROM families WHERE family_code = ?').get(code) && attempts < 100) {
      attempts++;
      code = `FAM-${String(nextId + attempts).padStart(5, '0')}`;
    }
    return code;
  }

  /**
   * Validates and cleans a Sri Lankan 10-digit phone number.
   * Format: exactly 10 digits starting with '0' (e.g. 0771234567, 0112345678).
   */
  public static validateSriLankanPhone(phone: string | null | undefined, fieldName: string, required = true): string | null {
    if (!phone || !phone.trim()) {
      if (required) {
        throw new Error(`${fieldName} is required.`);
      }
      return null;
    }

    // Strip whitespace, hyphens, dots, parentheses
    const cleaned = phone.replace(/[\s\-\.\(\)]/g, '');
    if (!/^0\d{9}$/.test(cleaned)) {
      throw new Error(`${fieldName} must be a valid 10-digit Sri Lankan telephone number starting with 0 (e.g. 07XXXXXXXX or 0XXXXXXXXX).`);
    }

    return cleaned;
  }

  /**
   * Validates a list of family member records according to core school family rules:
   * 1. At least one Father or Mother must be provided.
   * 2. Guardian cannot be the sole relationship.
   * 3. No duplicate relationship types within one family.
   * 4. Full names between 2 and 150 characters.
   * 5. Valid 10-digit Sri Lankan contact numbers.
   * 6. Valid WhatsApp numbers if provided.
   * 7. Valid occupation references if provided.
   */
  public validateFamilyMembers(members: IFamilyMemberInput[]): void {
    if (!Array.isArray(members) || members.length === 0) {
      throw new Error('At least one parent (Father or Mother) must be provided.');
    }

    const seenTypes = new Set<string>();
    let hasFather = false;
    let hasMother = false;

    for (const m of members) {
      if (!m || typeof m !== 'object') {
        throw new Error('Invalid family member data provided.');
      }

      const type = m.relationshipType;
      if (type !== 'Father' && type !== 'Mother' && type !== 'Guardian') {
        throw new Error(`Invalid relationship type: "${type}". Allowed types are Father, Mother, Guardian.`);
      }

      if (seenTypes.has(type)) {
        throw new Error(`A family cannot have duplicate ${type} records.`);
      }
      seenTypes.add(type);

      if (type === 'Father') hasFather = true;
      if (type === 'Mother') hasMother = true;

      // Validate Name
      const name = m.name ? m.name.trim() : '';
      if (!name || name.length < 2 || name.length > 150) {
        throw new Error(`${type}'s full name must be between 2 and 150 characters.`);
      }

      // Validate Contact Number (Required for every present relationship)
      FamilyService.validateSriLankanPhone(m.contactNumber, `${type}'s Contact Number`, true);

      // Validate WhatsApp Number (Optional, but if provided must follow Sri Lankan 10-digit format)
      if (m.whatsappNumber && m.whatsappNumber.trim()) {
        FamilyService.validateSriLankanPhone(m.whatsappNumber, `${type}'s WhatsApp Number`, false);
      }

      // Validate Occupation ID if specified
      if (m.occupationId) {
        const occ = this.db.prepare('SELECT id FROM occupations WHERE id = ?').get(m.occupationId);
        if (!occ) {
          throw new Error(`Selected occupation for ${type} does not exist.`);
        }
      }
    }

    // Core rule: A family cannot have ONLY a Guardian or NO parents
    if (!hasFather && !hasMother) {
      throw new Error('A family must have at least one parent (Father or Mother). A Guardian cannot be the sole relationship.');
    }
  }

  /**
   * Retrieves all members of a family ordered by Father, Mother, Guardian.
   * Uses explicit LEFT JOIN with occupations to avoid subqueries and N+1 lookups.
   */
  public getFamilyMembers(familyId: number): IFamilyMember[] {
    const sql = `
      SELECT 
        fm.id,
        fm.family_id as familyId,
        fm.relationship_type as relationshipType,
        fm.name,
        fm.contact_number as contactNumber,
        fm.whatsapp_number as whatsappNumber,
        fm.occupation_id as occupationId,
        o.name as occupationName,
        fm.created_at as createdAt,
        fm.updated_at as updatedAt
      FROM family_members fm
      LEFT JOIN occupations o ON fm.occupation_id = o.id
      WHERE fm.family_id = ?
      ORDER BY CASE fm.relationship_type 
        WHEN 'Father' THEN 1 
        WHEN 'Mother' THEN 2 
        WHEN 'Guardian' THEN 3 
        ELSE 4 END ASC
    `;

    const rows = this.db.prepare(sql).all(familyId) as Array<{
      id: number;
      familyId: number;
      relationshipType: FamilyRelationshipType;
      name: string;
      contactNumber: string;
      whatsappNumber: string | null;
      occupationId: number | null;
      occupationName: string | null;
      createdAt: string;
      updatedAt: string;
    }>;

    return rows.map(r => ({
      id: Number(r.id),
      familyId: Number(r.familyId),
      relationshipType: r.relationshipType,
      name: String(r.name),
      contactNumber: String(r.contactNumber),
      whatsappNumber: r.whatsappNumber ? String(r.whatsappNumber) : null,
      occupationId: r.occupationId ? Number(r.occupationId) : null,
      occupationName: r.occupationName ? String(r.occupationName) : null,
      createdAt: String(r.createdAt),
      updatedAt: String(r.updatedAt)
    }));
  }

  /**
   * Retrieves all students linked to the same family (shared family foundation).
   */
  public getLinkedStudents(familyId: number): ILinkedStudent[] {
    const sql = `
      SELECT 
        s.id,
        s.admission_number as admissionNumber,
        s.full_name as fullName,
        s.current_grade as currentGrade,
        s.status
      FROM students s
      WHERE s.family_id = ?
      ORDER BY s.admission_number ASC
    `;

    const rows = this.db.prepare(sql).all(familyId) as ILinkedStudent[];
    return rows;
  }

  /**
   * Retrieves full family detail including address, members, and linked students.
   */
  public getFamilyById(familyId: number): IFamilyDetail | null {
    const sql = `
      SELECT 
        f.id,
        f.family_code as familyCode,
        f.house_no as houseNo,
        f.street_id as streetId,
        str.name as streetName,
        f.city_id as cityId,
        c.name as cityName,
        c.postal_code as postalCode,
        f.additional_address_details as additionalAddressDetails,
        f.full_address as fullAddress
      FROM families f
      LEFT JOIN streets str ON f.street_id = str.id
      LEFT JOIN cities c ON f.city_id = c.id
      WHERE f.id = ?
    `;

    const raw = this.db.prepare(sql).get(familyId) as Record<string, unknown> | undefined;
    if (!raw) return null;

    const members = this.getFamilyMembers(familyId);
    const linkedStudents = this.getLinkedStudents(familyId);

    return {
      id: Number(raw.id),
      familyCode: String(raw.familyCode),
      houseNo: raw.houseNo ? String(raw.houseNo) : null,
      streetId: raw.streetId ? Number(raw.streetId) : null,
      streetName: raw.streetName ? String(raw.streetName) : null,
      cityId: raw.cityId ? Number(raw.cityId) : null,
      cityName: raw.cityName ? String(raw.cityName) : null,
      postalCode: raw.postalCode ? String(raw.postalCode) : null,
      additionalAddressDetails: raw.additionalAddressDetails ? String(raw.additionalAddressDetails) : null,
      fullAddress: raw.fullAddress ? String(raw.fullAddress) : null,
      members,
      linkedStudents
    };
  }

  /**
   * Atomically updates family members within a transaction.
   * Upserts provided members and removes any relationship types that were excluded.
   * Enforces that at least Father or Mother exists at all times.
   */
  public updateFamilyMembers(user: IAuthSession, input: IUpdateFamilyMembersInput): IFamilyMember[] {
    const familyId = Number(input.familyId);
    if (!familyId || !Number.isInteger(familyId)) {
      throw new Error('Valid Family ID is required.');
    }

    const family = this.db.prepare('SELECT id, family_code FROM families WHERE id = ?').get(familyId) as {
      id: number;
      family_code: string;
    } | undefined;

    if (!family) {
      throw new Error(`Family with ID ${familyId} was not found.`);
    }

    // 1. Strict validation of members
    this.validateFamilyMembers(input.members);

    // 2. Transactional execution
    const updateTx = this.db.transaction(() => {
      const activeTypes = input.members.map(m => m.relationshipType);

      // Remove relationships that were explicitly removed in this update
      if (activeTypes.length > 0) {
        const placeholders = activeTypes.map(() => '?').join(',');
        this.db.prepare(`
          DELETE FROM family_members 
          WHERE family_id = ? AND relationship_type NOT IN (${placeholders})
        `).run(familyId, ...activeTypes);
      }

      // Upsert each member
      const upsertStmt = this.db.prepare(`
        INSERT INTO family_members (
          family_id,
          relationship_type,
          name,
          contact_number,
          whatsapp_number,
          occupation_id,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(family_id, relationship_type) DO UPDATE SET
          name = excluded.name,
          contact_number = excluded.contact_number,
          whatsapp_number = excluded.whatsapp_number,
          occupation_id = excluded.occupation_id,
          updated_at = CURRENT_TIMESTAMP
      `);

      for (const m of input.members) {
        const cleanedContact = FamilyService.validateSriLankanPhone(m.contactNumber, `${m.relationshipType}'s Contact Number`, true);
        const cleanedWhatsApp = FamilyService.validateSriLankanPhone(m.whatsappNumber, `${m.relationshipType}'s WhatsApp Number`, false);

        upsertStmt.run(
          familyId,
          m.relationshipType,
          m.name.trim(),
          cleanedContact,
          cleanedWhatsApp,
          m.occupationId || null
        );
      }

      // Audit log
      try {
        const details = `Updated family members for ${family.family_code}: [${activeTypes.join(', ')}]`;
        this.db.prepare(`
          INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
          VALUES (?, 'UPDATE_FAMILY_MEMBERS', 'families', ?, ?)
        `).run(user.id, String(familyId), details);
      } catch {}
    });

    updateTx();

    return this.getFamilyMembers(familyId);
  }

  // ==========================================
  // Sibling Management (Stage 08)
  // ==========================================

  /**
   * Searches for candidate students that can be linked as a sibling.
   * Excludes the target student and any students already sharing the target student's family.
   * Adheres to Rule 5: explicit JOINs, no subqueries in WHERE clause, indexed lookups, limit.
   */
  public searchCandidateSiblings(query: ISiblingCandidateQuery): ISiblingCandidate[] {
    const term = (query.search || '').trim();
    if (!term) return [];

    const limit = Math.min(50, Math.max(1, query.limit || 20));
    const targetStudentId = Number(query.excludeStudentId);

    // Look up target student's family_id first to eliminate subqueries
    let targetFamilyId: number | null = null;
    if (targetStudentId) {
      const target = this.db.prepare('SELECT family_id FROM students WHERE id = ?').get(targetStudentId) as { family_id: number } | undefined;
      if (target) {
        targetFamilyId = target.family_id;
      }
    }

    const whereClauses: string[] = ['s.id != ?'];
    const params: (string | number)[] = [targetStudentId || 0];

    if (targetFamilyId) {
      whereClauses.push('s.family_id != ?');
      params.push(targetFamilyId);
    }

    whereClauses.push('(s.admission_number LIKE ? OR s.full_name LIKE ?)');
    params.push(`%${term}%`, `%${term}%`);

    const sql = `
      SELECT 
        s.id,
        s.admission_number as admissionNumber,
        s.full_name as fullName,
        s.gender,
        s.current_grade as currentGrade,
        s.status,
        s.family_id as familyId,
        f.family_code as familyCode,
        f.full_address as fullAddress,
        father.name as fatherName,
        mother.name as motherName
      FROM students s
      INNER JOIN families f ON s.family_id = f.id
      LEFT JOIN family_members father ON father.family_id = f.id AND father.relationship_type = 'Father'
      LEFT JOIN family_members mother ON mother.family_id = f.id AND mother.relationship_type = 'Mother'
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY s.admission_number ASC
      LIMIT ?
    `;

    const rows = this.db.prepare(sql).all(...params, limit) as ISiblingCandidate[];
    return rows;
  }

  /**
   * Generates a preview comparing two families before linking/merging.
   * Compares addresses and Father, Mother, Guardian relationships field-by-field.
   * Detects conflicts so user can review and resolve them explicitly.
   */
  public getFamilyMergePreview(primaryStudentId: number, siblingStudentId: number): IFamilyMergePreview {
    const primaryId = Number(primaryStudentId);
    const siblingId = Number(siblingStudentId);

    if (!primaryId || !siblingId) {
      throw new Error('Both primary student and sibling student must be specified.');
    }

    if (primaryId === siblingId) {
      throw new Error('A student cannot be linked to themselves as a sibling.');
    }

    const primaryStudent = this.db.prepare(`
      SELECT s.id, s.admission_number, s.full_name, s.current_grade, s.family_id 
      FROM students s
      WHERE s.id = ?
    `).get(primaryId) as { id: number; admission_number: string; full_name: string; current_grade: number; family_id: number } | undefined;

    if (!primaryStudent) {
      throw new Error(`Primary student with ID ${primaryId} was not found.`);
    }

    const siblingStudent = this.db.prepare(`
      SELECT s.id, s.admission_number, s.full_name, s.current_grade, s.family_id 
      FROM students s
      WHERE s.id = ?
    `).get(siblingId) as { id: number; admission_number: string; full_name: string; current_grade: number; family_id: number } | undefined;

    if (!siblingStudent) {
      throw new Error(`Sibling student with ID ${siblingId} was not found.`);
    }

    if (primaryStudent.family_id === siblingStudent.family_id) {
      throw new Error(`Students "${primaryStudent.full_name}" (${primaryStudent.admission_number}) and "${siblingStudent.full_name}" (${siblingStudent.admission_number}) are already linked in the same family.`);
    }

    const destinationFamily = this.getFamilyById(primaryStudent.family_id);
    const sourceFamily = this.getFamilyById(siblingStudent.family_id);

    if (!destinationFamily || !sourceFamily) {
      throw new Error('Could not retrieve family records for merge preview.');
    }

    // Student count in source family
    const sourceCountRow = this.db.prepare('SELECT COUNT(*) as count FROM students WHERE family_id = ?').get(sourceFamily.id) as { count: number };
    const sourceStudentCount = sourceCountRow ? sourceCountRow.count : 1;

    // Address comparison
    const destAddr = (destinationFamily.fullAddress || '').trim().toLowerCase();
    const srcAddr = (sourceFamily.fullAddress || '').trim().toLowerCase();
    const destHasAddr = Boolean(destinationFamily.houseNo || destinationFamily.streetId || destinationFamily.cityId || destAddr);
    const srcHasAddr = Boolean(sourceFamily.houseNo || sourceFamily.streetId || sourceFamily.cityId || srcAddr);

    // Address conflict exists if both families have an address and they differ
    const addressConflict = Boolean(destHasAddr && srcHasAddr && (
      destAddr !== srcAddr ||
      destinationFamily.houseNo !== sourceFamily.houseNo ||
      destinationFamily.streetId !== sourceFamily.streetId ||
      destinationFamily.cityId !== sourceFamily.cityId
    ));

    // Father comparison
    const destFather = destinationFamily.members.find(m => m.relationshipType === 'Father') || null;
    const srcFather = sourceFamily.members.find(m => m.relationshipType === 'Father') || null;
    let fatherConflict = false;
    if (destFather && srcFather) {
      fatherConflict = (
        destFather.name.trim().toLowerCase() !== srcFather.name.trim().toLowerCase() ||
        destFather.contactNumber !== srcFather.contactNumber ||
        (destFather.whatsappNumber || '') !== (srcFather.whatsappNumber || '') ||
        destFather.occupationId !== srcFather.occupationId
      );
    }

    // Mother comparison
    const destMother = destinationFamily.members.find(m => m.relationshipType === 'Mother') || null;
    const srcMother = sourceFamily.members.find(m => m.relationshipType === 'Mother') || null;
    let motherConflict = false;
    if (destMother && srcMother) {
      motherConflict = (
        destMother.name.trim().toLowerCase() !== srcMother.name.trim().toLowerCase() ||
        destMother.contactNumber !== srcMother.contactNumber ||
        (destMother.whatsappNumber || '') !== (srcMother.whatsappNumber || '') ||
        destMother.occupationId !== srcMother.occupationId
      );
    }

    // Guardian comparison
    const destGuardian = destinationFamily.members.find(m => m.relationshipType === 'Guardian') || null;
    const srcGuardian = sourceFamily.members.find(m => m.relationshipType === 'Guardian') || null;
    let guardianConflict = false;
    if (destGuardian && srcGuardian) {
      guardianConflict = (
        destGuardian.name.trim().toLowerCase() !== srcGuardian.name.trim().toLowerCase() ||
        destGuardian.contactNumber !== srcGuardian.contactNumber ||
        (destGuardian.whatsappNumber || '') !== (srcGuardian.whatsappNumber || '') ||
        destGuardian.occupationId !== srcGuardian.occupationId
      );
    }

    const hasConflicts = addressConflict || fatherConflict || motherConflict || guardianConflict;

    const conflictsList: Array<{ field: 'address' | 'father' | 'mother' | 'guardian'; description: string }> = [];
    if (addressConflict) {
      conflictsList.push({ field: 'address', description: 'Both families have different residence addresses' });
    }
    if (fatherConflict) {
      conflictsList.push({ field: 'father', description: 'Both families have different father details' });
    }
    if (motherConflict) {
      conflictsList.push({ field: 'mother', description: 'Both families have different mother details' });
    }
    if (guardianConflict) {
      conflictsList.push({ field: 'guardian', description: 'Both families have different guardian details' });
    }

    return {
      destinationStudent: {
        id: primaryStudent.id,
        admissionNumber: primaryStudent.admission_number,
        fullName: primaryStudent.full_name,
        grade: primaryStudent.current_grade
      },
      sourceStudent: {
        id: siblingStudent.id,
        admissionNumber: siblingStudent.admission_number,
        fullName: siblingStudent.full_name,
        grade: siblingStudent.current_grade
      },
      destinationFamily,
      sourceFamily,
      hasConflicts,
      conflicts: conflictsList,
      conflictSummary: {
        address: addressConflict,
        father: fatherConflict,
        mother: motherConflict,
        guardian: guardianConflict
      },
      differences: {
        address: addressConflict ? { destination: destinationFamily.fullAddress || null, source: sourceFamily.fullAddress || null } : undefined,
        father: (destFather || srcFather) ? { destination: destFather, source: srcFather } : undefined,
        mother: (destMother || srcMother) ? { destination: destMother, source: srcMother } : undefined,
        guardian: (destGuardian || srcGuardian) ? { destination: destGuardian, source: srcGuardian } : undefined
      },
      sourceStudentCount
    };
  }

  /**
   * Safely merges families and links siblings with explicit conflict resolution.
   * Compares addresses and parent details to avoid silent data loss.
   * Resolves conflicts according to strategy ('keep_destination', 'use_source', or 'custom').
   * Transacts atomically with rollback on any failure.
   */
  public linkSiblings(user: IAuthSession, input: ILinkSiblingsInput): IFamilyDetail {
    const primaryId = Number(input.primaryStudentId);
    const siblingId = Number(input.siblingStudentId);

    if (!primaryId || !siblingId) {
      throw new Error('Both primary student and sibling student must be specified.');
    }

    if (primaryId === siblingId) {
      throw new Error('A student cannot be linked to themselves as a sibling.');
    }

    const primaryStudent = this.db.prepare(`
      SELECT s.id, s.admission_number, s.full_name, s.family_id, f.family_code 
      FROM students s
      INNER JOIN families f ON s.family_id = f.id
      WHERE s.id = ?
    `).get(primaryId) as { id: number; admission_number: string; full_name: string; family_id: number; family_code: string } | undefined;

    if (!primaryStudent) {
      throw new Error(`Primary student with ID ${primaryId} was not found.`);
    }

    const siblingStudent = this.db.prepare(`
      SELECT s.id, s.admission_number, s.full_name, s.family_id, f.family_code 
      FROM students s
      INNER JOIN families f ON s.family_id = f.id
      WHERE s.id = ?
    `).get(siblingId) as { id: number; admission_number: string; full_name: string; family_id: number; family_code: string } | undefined;

    if (!siblingStudent) {
      throw new Error(`Sibling student with ID ${siblingId} was not found.`);
    }

    if (primaryStudent.family_id === siblingStudent.family_id) {
      throw new Error(`Students "${primaryStudent.full_name}" (${primaryStudent.admission_number}) and "${siblingStudent.full_name}" (${siblingStudent.admission_number}) are already linked in the same family.`);
    }

    const targetFamilyId = primaryStudent.family_id;
    const sourceFamilyId = siblingStudent.family_id;

    // Fetch full families
    const destFamily = this.getFamilyById(targetFamilyId);
    const srcFamily = this.getFamilyById(sourceFamilyId);

    if (!destFamily || !srcFamily) {
      throw new Error('Could not find destination or source family for linking.');
    }

    const strategy: MergeResolutionStrategy = input.resolutionStrategy || 'keep_destination';
    const custom = input.customResolution;
    // When mergeEntireFamily is explicitly set, use it. Otherwise, if not specified, default to false (move single student only)
    // so moving a single student from a multi-student family does not drag along the other siblings unless requested.
    const mergeEntireFamily = input.mergeEntireFamily === true;

    // 1. Resolve Address
    let finalHouseNo = destFamily.houseNo;
    let finalStreetId = destFamily.streetId;
    let finalCityId = destFamily.cityId;
    let finalAdditional = destFamily.additionalAddressDetails;
    let finalFullAddress = destFamily.fullAddress;

    if (strategy === 'use_source') {
      finalHouseNo = srcFamily.houseNo;
      finalStreetId = srcFamily.streetId;
      finalCityId = srcFamily.cityId;
      finalAdditional = srcFamily.additionalAddressDetails;
      finalFullAddress = srcFamily.fullAddress;
    } else if (strategy === 'custom' && custom) {
      if (custom.addressChoice === 'source') {
        finalHouseNo = srcFamily.houseNo;
        finalStreetId = srcFamily.streetId;
        finalCityId = srcFamily.cityId;
        finalAdditional = srcFamily.additionalAddressDetails;
        finalFullAddress = srcFamily.fullAddress;
      } else if (custom.addressChoice === 'custom' && custom.customAddress) {
        finalHouseNo = custom.customAddress.houseNo || null;
        finalStreetId = custom.customAddress.streetId || null;
        finalCityId = custom.customAddress.cityId || null;
        finalAdditional = custom.customAddress.additionalAddressDetails || null;
        finalFullAddress = custom.customAddress.fullAddress || null;
      }
    } else if (strategy === 'keep_destination') {
      // If destination family has no address, and source has address, inherit it safely
      if (!destFamily.fullAddress && srcFamily.fullAddress) {
        finalHouseNo = srcFamily.houseNo;
        finalStreetId = srcFamily.streetId;
        finalCityId = srcFamily.cityId;
        finalAdditional = srcFamily.additionalAddressDetails;
        finalFullAddress = srcFamily.fullAddress;
      }
    }

    // 2. Resolve Family Members (Father, Mother, Guardian)
    const destFather = destFamily.members.find(m => m.relationshipType === 'Father') || null;
    const srcFather = srcFamily.members.find(m => m.relationshipType === 'Father') || null;

    const destMother = destFamily.members.find(m => m.relationshipType === 'Mother') || null;
    const srcMother = srcFamily.members.find(m => m.relationshipType === 'Mother') || null;

    const destGuardian = destFamily.members.find(m => m.relationshipType === 'Guardian') || null;
    const srcGuardian = srcFamily.members.find(m => m.relationshipType === 'Guardian') || null;

    const resolvedMembers: IFamilyMemberInput[] = [];

    const addMemberInput = (m: IFamilyMember | IFamilyMemberInput | null) => {
      if (!m) return;
      resolvedMembers.push({
        relationshipType: m.relationshipType,
        name: m.name,
        contactNumber: m.contactNumber,
        whatsappNumber: m.whatsappNumber || null,
        occupationId: m.occupationId || null
      });
    };

    if (strategy === 'use_source') {
      addMemberInput(srcFather);
      addMemberInput(srcMother);
      addMemberInput(srcGuardian);
    } else if (strategy === 'custom' && custom) {
      // Father
      if (custom.fatherChoice === 'source') addMemberInput(srcFather);
      else if (custom.fatherChoice === 'destination') addMemberInput(destFather);
      else if (custom.fatherChoice === 'custom' && custom.customFather) addMemberInput(custom.customFather);
      else if (custom.fatherChoice !== 'none') addMemberInput(destFather || srcFather);

      // Mother
      if (custom.motherChoice === 'source') addMemberInput(srcMother);
      else if (custom.motherChoice === 'destination') addMemberInput(destMother);
      else if (custom.motherChoice === 'custom' && custom.customMother) addMemberInput(custom.customMother);
      else if (custom.motherChoice !== 'none') addMemberInput(destMother || srcMother);

      // Guardian
      if (custom.guardianChoice === 'source') addMemberInput(srcGuardian);
      else if (custom.guardianChoice === 'destination') addMemberInput(destGuardian);
      else if (custom.guardianChoice === 'custom' && custom.customGuardian) addMemberInput(custom.customGuardian);
      else if (custom.guardianChoice !== 'none') addMemberInput(destGuardian || srcGuardian);
    } else {
      // 'keep_destination': keep destination members, but preserve any non-conflicting member present only in source
      addMemberInput(destFather || srcFather);
      addMemberInput(destMother || srcMother);
      addMemberInput(destGuardian || srcGuardian);
    }

    // 3. Validate resolved family members before doing any DB write
    this.validateFamilyMembers(resolvedMembers);

    // 4. Perform Transactional merge
    const mergeTx = this.db.transaction(() => {
      // A. Update destination family address
      this.db.prepare(`
        UPDATE families 
        SET house_no = ?, street_id = ?, city_id = ?, additional_address_details = ?, full_address = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(finalHouseNo, finalStreetId, finalCityId, finalAdditional, finalFullAddress, targetFamilyId);

      // B. Upsert resolved family members for destination family
      const activeTypes = resolvedMembers.map(m => m.relationshipType);
      const placeholders = activeTypes.map(() => '?').join(',');
      this.db.prepare(`
        DELETE FROM family_members 
        WHERE family_id = ? AND relationship_type NOT IN (${placeholders})
      `).run(targetFamilyId, ...activeTypes);

      const memberUpsertStmt = this.db.prepare(`
        INSERT INTO family_members (
          family_id,
          relationship_type,
          name,
          contact_number,
          whatsapp_number,
          occupation_id,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(family_id, relationship_type) DO UPDATE SET
          name = excluded.name,
          contact_number = excluded.contact_number,
          whatsapp_number = excluded.whatsapp_number,
          occupation_id = excluded.occupation_id,
          updated_at = CURRENT_TIMESTAMP
      `);

      for (const m of resolvedMembers) {
        const contact = FamilyService.validateSriLankanPhone(m.contactNumber, `${m.relationshipType}'s Contact Number`, true);
        const whatsapp = FamilyService.validateSriLankanPhone(m.whatsappNumber, `${m.relationshipType}'s WhatsApp Number`, false);
        memberUpsertStmt.run(
          targetFamilyId,
          m.relationshipType,
          m.name.trim(),
          contact,
          whatsapp,
          m.occupationId || null
        );
      }

      // C. Move students
      let affectedStudentAdmissions: string[] = [];
      if (mergeEntireFamily) {
        const sourceStudents = this.db.prepare('SELECT id, admission_number FROM students WHERE family_id = ?').all(sourceFamilyId) as Array<{ id: number; admission_number: string }>;
        affectedStudentAdmissions = sourceStudents.map(s => s.admission_number);

        this.db.prepare(`
          UPDATE students 
          SET family_id = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE family_id = ?
        `).run(targetFamilyId, sourceFamilyId);
      } else {
        affectedStudentAdmissions = [siblingStudent.admission_number];
        this.db.prepare(`
          UPDATE students 
          SET family_id = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(targetFamilyId, siblingId);
      }

      // D. Verify if any students remain in source family before deleting it
      const remainingRow = this.db.prepare('SELECT COUNT(*) as count FROM students WHERE family_id = ?').get(sourceFamilyId) as { count: number };
      if (remainingRow.count === 0) {
        // Safe to remove empty source family now that all data is transferred and preserved
        this.db.prepare('DELETE FROM family_members WHERE family_id = ?').run(sourceFamilyId);
        this.db.prepare('DELETE FROM families WHERE id = ?').run(sourceFamilyId);
      }

      // E. Audit log
      try {
        const detailsObj = {
          message: `Merged Family ${srcFamily.familyCode} into ${destFamily.familyCode}`,
          strategy,
          primaryStudentId: primaryId,
          siblingStudentId: siblingId,
          sourceFamilyId,
          targetFamilyId,
          affectedStudents: affectedStudentAdmissions
        };
        this.db.prepare(`
          INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
          VALUES (?, 'MERGE_FAMILIES_LINK_SIBLINGS', 'families', ?, ?)
        `).run(user.id, String(targetFamilyId), JSON.stringify(detailsObj));
      } catch {}
    });

    mergeTx();

    const result = this.getFamilyById(targetFamilyId);
    if (!result) {
      throw new Error('Failed to retrieve updated family after linking siblings.');
    }
    return result;
  }

  /**
   * Unlinks a student from a shared family, placing them in their own independent family.
   * Copies the shared address and parent records into the new family so the unlinked student preserves their data.
   * Requires at least 2 students in the shared family before unlinking.
   */
  public unlinkSibling(user: IAuthSession, input: IUnlinkSiblingInput): IFamilyDetail {
    const studentId = Number(input.studentId);
    if (!studentId) {
      throw new Error('Student ID is required to unlink.');
    }

    const student = this.db.prepare(`
      SELECT s.id, s.admission_number, s.full_name, s.family_id, f.family_code 
      FROM students s
      INNER JOIN families f ON s.family_id = f.id
      WHERE s.id = ?
    `).get(studentId) as { id: number; admission_number: string; full_name: string; family_id: number; family_code: string } | undefined;

    if (!student) {
      throw new Error(`Student with ID ${studentId} was not found.`);
    }

    const originalFamilyId = student.family_id;

    // Check sibling count in this family
    const countRow = this.db.prepare('SELECT COUNT(*) as count FROM students WHERE family_id = ?').get(originalFamilyId) as { count: number };
    if (countRow.count <= 1) {
      throw new Error(`Cannot unlink student "${student.full_name}" (${student.admission_number}) because they have no other siblings linked in Family ${student.family_code}.`);
    }

    // Fetch original family details to copy
    const oldFamily = this.db.prepare('SELECT * FROM families WHERE id = ?').get(originalFamilyId) as {
      house_no: string | null;
      street_id: number | null;
      city_id: number | null;
      additional_address_details: string | null;
      full_address: string | null;
    };

    // Fetch original family members to copy
    const oldMembers = this.db.prepare('SELECT relationship_type, name, contact_number, whatsapp_number, occupation_id FROM family_members WHERE family_id = ?').all(originalFamilyId) as Array<{
      relationship_type: string;
      name: string;
      contact_number: string;
      whatsapp_number: string | null;
      occupation_id: number | null;
    }>;

    let newFamilyId = 0;

    const unlinkTx = this.db.transaction(() => {
      // 1. Create new independent family record
      const newFamilyCode = this.generateFamilyCode();
      const insertFamilyStmt = this.db.prepare(`
        INSERT INTO families (family_code, house_no, street_id, city_id, additional_address_details, full_address)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const famResult = insertFamilyStmt.run(
        newFamilyCode,
        oldFamily.house_no,
        oldFamily.street_id,
        oldFamily.city_id,
        oldFamily.additional_address_details,
        oldFamily.full_address
      );
      newFamilyId = Number(famResult.lastInsertRowid);

      // 2. Copy family members into the new family
      const insertMemberStmt = this.db.prepare(`
        INSERT INTO family_members (family_id, relationship_type, name, contact_number, whatsapp_number, occupation_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const m of oldMembers) {
        insertMemberStmt.run(
          newFamilyId,
          m.relationship_type,
          m.name,
          m.contact_number,
          m.whatsapp_number,
          m.occupation_id
        );
      }

      // 3. Update the student to point to the new family
      this.db.prepare(`
        UPDATE students 
        SET family_id = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(newFamilyId, studentId);

      // 4. Audit log
      try {
        const details = `Unlinked student ${student.admission_number} (${student.full_name}) from Family ${student.family_code} into new independent Family ${newFamilyCode}`;
        this.db.prepare(`
          INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
          VALUES (?, 'UNLINK_SIBLING', 'students', ?, ?)
        `).run(user.id, String(studentId), details);
      } catch {}
    });

    unlinkTx();

    const result = this.getFamilyById(originalFamilyId);
    if (!result) {
      throw new Error('Failed to retrieve original family after unlinking sibling.');
    }
    return result;
  }
}

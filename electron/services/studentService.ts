import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { app } from 'electron';
import {
  IAuthSession,
  IRegisterStudentInput,
  IUpdateStudentInput,
  IStudentListItem,
  IStudentDetail,
  IStudentNote,
  IStudentStatusHistory,
  IStudentListQuery,
  IPaginatedResult,
  StudentGender,
  StudentStatus
} from '../shared/types';
import { SchoolSettingsService } from './schoolSettingsService';
import { FamilyService } from './familyService';

export class StudentService {
  private db: Database.Database;
  private photosStorageDir: string;
  private familyService: FamilyService;

  constructor(db: Database.Database, customStorageDir?: string) {
    this.db = db;
    this.familyService = new FamilyService(db);
    if (customStorageDir) {
      this.photosStorageDir = path.resolve(customStorageDir);
    } else {
      try {
        if (app && typeof app.getPath === 'function') {
          this.photosStorageDir = path.resolve(app.getPath('userData'), 'CurtissSMS_Data', 'photos');
        } else {
          this.photosStorageDir = path.resolve(process.cwd(), 'data', 'photos');
        }
      } catch {
        this.photosStorageDir = path.resolve(process.cwd(), 'data', 'photos');
      }
    }

    if (!fs.existsSync(this.photosStorageDir)) {
      fs.mkdirSync(this.photosStorageDir, { recursive: true });
    }
  }

  private validateIsoDate(dateStr: string, fieldName: string): void {
    if (!dateStr || typeof dateStr !== 'string') {
      throw new Error(`${fieldName} is required.`);
    }
    const match = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
    if (!match) {
      throw new Error(`${fieldName} must be in YYYY-MM-DD format.`);
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      throw new Error(`${fieldName} is an invalid calendar date.`);
    }
  }

  private generateFamilyCode(): string {
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

  private savePhotoBuffer(buffer: Buffer, studentIdentifier: string): string {
    const { extension } = SchoolSettingsService.validateImageBuffer(buffer);
    if (buffer.length > 2 * 1024 * 1024) {
      throw new Error('Student photo exceeds maximum allowed size of 2 MB.');
    }

    const randomSuffix = crypto.randomBytes(6).toString('hex');
    const safeBaseName = `student_${studentIdentifier.replace(/[^a-zA-Z0-9]/g, '_')}_${randomSuffix}${extension}`;
    const targetPath = path.resolve(this.photosStorageDir, safeBaseName);

    if (!targetPath.startsWith(this.photosStorageDir)) {
      throw new Error('Path traversal detected in student photo destination.');
    }

    fs.writeFileSync(targetPath, buffer);
    return `photos/${safeBaseName}`;
  }

  private getPhotoPreviewUrl(photoPath: string | null): string | null {
    if (!photoPath) return null;
    try {
      const fileName = path.basename(photoPath);
      const diskPath = path.resolve(this.photosStorageDir, fileName);
      if (fs.existsSync(diskPath)) {
        const data = fs.readFileSync(diskPath);
        const { mimeType } = SchoolSettingsService.validateImageBuffer(data);
        return `data:${mimeType};base64,${data.toString('base64')}`;
      }
    } catch {}
    return null;
  }

  // ==========================================
  // Student Registration
  // ==========================================
  public registerStudent(user: IAuthSession, input: IRegisterStudentInput): IStudentDetail {
    // 1. Validation
    const fullName = input.fullName ? input.fullName.trim() : '';
    if (!fullName || fullName.length < 2 || fullName.length > 150) {
      throw new Error('Full Name must be between 2 and 150 characters.');
    }

    const admissionNumber = input.admissionNumber ? input.admissionNumber.trim() : '';
    if (!admissionNumber || admissionNumber.length < 1 || admissionNumber.length > 50) {
      throw new Error('Admission Number is required and must not exceed 50 characters.');
    }

    // Unique admission number check (case-insensitive)
    const existingAdm = this.db.prepare('SELECT id FROM students WHERE LOWER(TRIM(admission_number)) = LOWER(TRIM(?))').get(admissionNumber);
    if (existingAdm) {
      throw new Error(`Admission Number "${admissionNumber}" is already assigned to another student.`);
    }

    this.validateIsoDate(input.admissionDate, 'Admission Date');
    this.validateIsoDate(input.dateOfBirth, 'Date of Birth');

    const birthDate = new Date(input.dateOfBirth);
    const admDate = new Date(input.admissionDate);
    if (birthDate >= admDate) {
      throw new Error('Date of Birth must be prior to Admission Date.');
    }
    const today = new Date();
    if (birthDate > today) {
      throw new Error('Date of Birth cannot be in the future.');
    }

    const gender: StudentGender = input.gender;
    if (gender !== 'Male' && gender !== 'Female') {
      throw new Error('Gender must be either "Male" or "Female".');
    }

    const grade = Number(input.currentGrade);
    if (!Number.isInteger(grade) || grade < 1 || grade > 13) {
      throw new Error('Current Grade must be an integer between 1 and 13.');
    }

    let transportationId: number | null = null;
    if (input.transportationMethodId) {
      const tm = this.db.prepare('SELECT id FROM transportation_methods WHERE id = ?').get(input.transportationMethodId);
      if (!tm) throw new Error('Selected transportation method does not exist.');
      transportationId = input.transportationMethodId;
    }

    let houseId: number | null = null;
    if (input.houseId) {
      const h = this.db.prepare('SELECT id FROM houses WHERE id = ?').get(input.houseId);
      if (!h) throw new Error('Selected house does not exist.');
      houseId = input.houseId;
    }

    let streetId: number | null = null;
    if (input.streetId) {
      const st = this.db.prepare('SELECT id FROM streets WHERE id = ?').get(input.streetId);
      if (!st) throw new Error('Selected street does not exist.');
      streetId = input.streetId;
    }

    let cityId: number | null = null;
    if (input.cityId) {
      const ct = this.db.prepare('SELECT id FROM cities WHERE id = ?').get(input.cityId);
      if (!ct) throw new Error('Selected city does not exist.');
      cityId = input.cityId;
    }

    const houseNo = input.houseNo ? input.houseNo.trim() : null;
    const additionalAddressDetails = input.additionalAddressDetails ? input.additionalAddressDetails.trim() : null;
    const fullAddress = input.fullAddress ? input.fullAddress.trim() : null;

    const prevSchoolName = input.previousSchoolName ? input.previousSchoolName.trim() : null;
    const prevSchoolId = input.previousSchoolIdNumber ? input.previousSchoolIdNumber.trim() : null;
    const perfDesc = input.performanceDescription ? input.performanceDescription.trim() : null;

    // Optional photo validation
    let savedPhotoPath: string | null = null;
    if (input.photoDataBase64 && input.photoDataBase64.trim()) {
      const base64Data = input.photoDataBase64.replace(/^data:image\/\w+;base64,/, '');
      const photoBuffer = Buffer.from(base64Data, 'base64');
      savedPhotoPath = this.savePhotoBuffer(photoBuffer, admissionNumber);
    }

    // 2. Transactional Insertion
    // Pre-validate family members if provided
    if (input.familyMembers && input.familyMembers.length > 0) {
      this.familyService.validateFamilyMembers(input.familyMembers);
    }

    let createdStudentId = 0;
    const registerTx = this.db.transaction(() => {
      let familyId: number;

      // Sibling Registration Shortcut: link to existing sibling's family
      if (input.siblingOfStudentId) {
        const sibling = this.db.prepare('SELECT id, family_id, full_name, admission_number FROM students WHERE id = ?').get(input.siblingOfStudentId) as {
          id: number;
          family_id: number;
          full_name: string;
          admission_number: string;
        } | undefined;

        if (!sibling) {
          throw new Error(`Referenced sibling student with ID ${input.siblingOfStudentId} was not found.`);
        }
        familyId = sibling.family_id;

        // If family members were explicitly submitted with the sibling, update them
        if (input.familyMembers && input.familyMembers.length > 0) {
          this.familyService.updateFamilyMembers(user, {
            familyId,
            members: input.familyMembers
          });
        }
      } else {
        // Create new Family record
        const familyCode = this.generateFamilyCode();
        const familyStmt = this.db.prepare(`
          INSERT INTO families (family_code, house_no, street_id, city_id, additional_address_details, full_address)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        const familyResult = familyStmt.run(familyCode, houseNo, streetId, cityId, additionalAddressDetails, fullAddress);
        familyId = Number(familyResult.lastInsertRowid);

        // Save Family Members if provided
        if (input.familyMembers && input.familyMembers.length > 0) {
          const memberStmt = this.db.prepare(`
            INSERT INTO family_members (
              family_id,
              relationship_type,
              name,
              contact_number,
              whatsapp_number,
              occupation_id
            ) VALUES (?, ?, ?, ?, ?, ?)
          `);
          for (const m of input.familyMembers) {
            const contact = m.contactNumber ? m.contactNumber.replace(/[\s\-\.\(\)]/g, '') : '';
            const whatsapp = m.whatsappNumber ? m.whatsappNumber.replace(/[\s\-\.\(\)]/g, '') : null;
            memberStmt.run(
              familyId,
              m.relationshipType,
              m.name.trim(),
              contact,
              whatsapp,
              m.occupationId || null
            );
          }
        }
      }

      // Create Student record
      const studentStmt = this.db.prepare(`
        INSERT INTO students (
          family_id,
          admission_number,
          admission_date,
          full_name,
          gender,
          date_of_birth,
          current_grade,
          status,
          transportation_method_id,
          house_id,
          previous_school_name,
          previous_school_id_number,
          performance_description,
          photo_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?, ?)
      `);
      const studentResult = studentStmt.run(
        familyId,
        admissionNumber,
        input.admissionDate,
        fullName,
        gender,
        input.dateOfBirth,
        grade,
        transportationId,
        houseId,
        prevSchoolName,
        prevSchoolId,
        perfDesc,
        savedPhotoPath
      );
      createdStudentId = Number(studentResult.lastInsertRowid);

      // Add initial note if provided
      if (input.initialNote && input.initialNote.trim()) {
        this.db.prepare(`
          INSERT INTO student_notes (student_id, note_text, created_by)
          VALUES (?, ?, ?)
        `).run(createdStudentId, input.initialNote.trim(), user.id);
      }

      // Log in audit_logs
      try {
        this.db.prepare(`
          INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
          VALUES (?, 'REGISTER_STUDENT', 'students', ?, ?)
        `).run(user.id, String(createdStudentId), `Registered student ${admissionNumber} (${fullName}) in Grade ${grade}`);
      } catch {}
    });

    try {
      registerTx();
    } catch (err: unknown) {
      const errorMsg = (err instanceof Error) ? err.message : String(err);
      if (errorMsg.includes('UNIQUE constraint failed') && (errorMsg.includes('admission_number') || errorMsg.includes('uq_students_admission_no_nocase'))) {
        throw new Error(`Admission Number "${admissionNumber}" is already assigned to another student.`);
      }
      throw err;
    }

    const result = this.getStudentById(createdStudentId);
    if (!result) {
      throw new Error('Failed to retrieve newly registered student.');
    }
    return result;
  }

  // ==========================================
  // Student Listing with Pagination & Filters
  // ==========================================
  public getStudents(query: IStudentListQuery): IPaginatedResult<IStudentListItem> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = [];
    const params: (string | number)[] = [];

    // Search filter (partial matching on admission_number or full_name)
    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      whereClauses.push('(s.admission_number LIKE ? OR s.full_name LIKE ?)');
      params.push(`%${term}%`, `%${term}%`);
    }

    if (query.grade) {
      whereClauses.push('s.current_grade = ?');
      params.push(Number(query.grade));
    }

    if (query.gender) {
      whereClauses.push('s.gender = ?');
      params.push(query.gender);
    }

    if (query.houseId) {
      whereClauses.push('s.house_id = ?');
      params.push(Number(query.houseId));
    }

    if (query.status) {
      whereClauses.push('s.status = ?');
      params.push(query.status);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Total count using explicit JOINs
    const countSql = `
      SELECT COUNT(*) as total
      FROM students s
      INNER JOIN families f ON s.family_id = f.id
      ${whereSql}
    `;
    const countRow = this.db.prepare(countSql).get(...params) as { total: number };
    const total = countRow ? countRow.total : 0;

    // Allowed sort columns
    let sortColumn = 's.admission_number';
    if (query.sortBy === 'fullName') sortColumn = 's.full_name';
    else if (query.sortBy === 'grade') sortColumn = 's.current_grade';
    else if (query.sortBy === 'admissionDate') sortColumn = 's.admission_date';
    else if (query.sortBy === 'createdAt') sortColumn = 's.created_at';

    const sortOrder = query.sortOrder === 'DESC' ? 'DESC' : 'ASC';

    // Explicit column selection and explicit JOINs (Rule 5)
    const selectSql = `
      SELECT 
        s.id,
        s.admission_number as admissionNumber,
        s.full_name as fullName,
        s.gender,
        s.date_of_birth as dateOfBirth,
        s.current_grade as currentGrade,
        s.status,
        s.admission_date as admissionDate,
        s.photo_path as photoPath,
        s.created_at as createdAt,
        h.id as houseId,
        h.name as houseName,
        h.color_hex as houseColor,
        tm.id as transportationMethodId,
        tm.name as transportationMethodName,
        f.full_address as fullAddress
      FROM students s
      INNER JOIN families f ON s.family_id = f.id
      LEFT JOIN houses h ON s.house_id = h.id
      LEFT JOIN transportation_methods tm ON s.transportation_method_id = tm.id
      ${whereSql}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const items = this.db.prepare(selectSql).all(...params, pageSize, offset) as IStudentListItem[];

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1
    };
  }

  // ==========================================
  // Student Profile / Details
  // ==========================================
  public getStudentById(id: number): IStudentDetail | null {
    const sql = `
      SELECT 
        s.id,
        s.admission_number as admissionNumber,
        s.admission_date as admissionDate,
        s.full_name as fullName,
        s.gender,
        s.date_of_birth as dateOfBirth,
        s.current_grade as currentGrade,
        s.status,
        s.previous_school_name as previousSchoolName,
        s.previous_school_id_number as previousSchoolIdNumber,
        s.performance_description as performanceDescription,
        s.photo_path as photoPath,
        s.created_at as createdAt,
        s.updated_at as updatedAt,
        h.id as houseId,
        h.name as houseName,
        h.color_hex as houseColor,
        tm.id as transportationMethodId,
        tm.name as transportationMethodName,
        f.id as familyId,
        f.family_code as familyCode,
        f.house_no as houseNo,
        f.street_id as streetId,
        str.name as streetName,
        f.city_id as cityId,
        c.name as cityName,
        c.postal_code as postalCode,
        f.additional_address_details as additionalAddressDetails,
        f.full_address as fullAddress
      FROM students s
      INNER JOIN families f ON s.family_id = f.id
      LEFT JOIN houses h ON s.house_id = h.id
      LEFT JOIN transportation_methods tm ON s.transportation_method_id = tm.id
      LEFT JOIN streets str ON f.street_id = str.id
      LEFT JOIN cities c ON f.city_id = c.id
      WHERE s.id = ?
    `;

    const raw = this.db.prepare(sql).get(id) as Record<string, unknown> | undefined;
    if (!raw) return null;

    // Fetch notes chronologically
    const notes = this.getStudentNotes(id);

    // Fetch status history chronologically
    const historySql = `
      SELECT 
        sh.id,
        sh.student_id as studentId,
        sh.from_status as fromStatus,
        sh.to_status as toStatus,
        sh.reason,
        sh.changed_by as changedBy,
        u.display_name as changedByName,
        sh.changed_at as changedAt
      FROM student_status_history sh
      LEFT JOIN users u ON sh.changed_by = u.id
      WHERE sh.student_id = ?
      ORDER BY sh.changed_at ASC
    `;
    const statusHistory = this.db.prepare(historySql).all(id) as IStudentStatusHistory[];

    const photoPreviewUrl = this.getPhotoPreviewUrl(raw.photoPath as string | null);
    const familyMembers = this.familyService.getFamilyMembers(Number(raw.familyId));
    const linkedStudents = this.familyService.getLinkedStudents(Number(raw.familyId));

    return {
      id: Number(raw.id),
      admissionNumber: String(raw.admissionNumber),
      admissionDate: String(raw.admissionDate),
      fullName: String(raw.fullName),
      gender: raw.gender as StudentGender,
      dateOfBirth: String(raw.dateOfBirth),
      currentGrade: Number(raw.currentGrade),
      status: raw.status as StudentStatus,
      transportationMethodId: raw.transportationMethodId ? Number(raw.transportationMethodId) : null,
      transportationMethodName: raw.transportationMethodName ? String(raw.transportationMethodName) : null,
      houseId: raw.houseId ? Number(raw.houseId) : null,
      houseName: raw.houseName ? String(raw.houseName) : null,
      houseColor: raw.houseColor ? String(raw.houseColor) : null,
      previousSchoolName: raw.previousSchoolName ? String(raw.previousSchoolName) : null,
      previousSchoolIdNumber: raw.previousSchoolIdNumber ? String(raw.previousSchoolIdNumber) : null,
      performanceDescription: raw.performanceDescription ? String(raw.performanceDescription) : null,
      photoPath: raw.photoPath ? String(raw.photoPath) : null,
      photoPreviewUrl,
      createdAt: String(raw.createdAt),
      updatedAt: String(raw.updatedAt),
      familyId: Number(raw.familyId),
      familyCode: String(raw.familyCode),
      houseNo: raw.houseNo ? String(raw.houseNo) : null,
      streetId: raw.streetId ? Number(raw.streetId) : null,
      streetName: raw.streetName ? String(raw.streetName) : null,
      cityId: raw.cityId ? Number(raw.cityId) : null,
      cityName: raw.cityName ? String(raw.cityName) : null,
      postalCode: raw.postalCode ? String(raw.postalCode) : null,
      additionalAddressDetails: raw.additionalAddressDetails ? String(raw.additionalAddressDetails) : null,
      fullAddress: raw.fullAddress ? String(raw.fullAddress) : null,
      notes,
      statusHistory,
      familyMembers,
      linkedStudents
    };
  }

  // ==========================================
  // Update Student Information
  // ==========================================
  public updateStudent(user: IAuthSession, input: IUpdateStudentInput): IStudentDetail {
    const student = this.db.prepare('SELECT id, family_id, current_grade, status, admission_number FROM students WHERE id = ?').get(input.id) as {
      id: number;
      family_id: number;
      current_grade: number;
      status: StudentStatus;
      admission_number: string;
    } | undefined;

    if (!student) {
      throw new Error(`Student with ID ${input.id} was not found.`);
    }

    // 1. Enforce academic promotion rules
    // Rule: "Do not allow users to manually bypass academic promotion rules."
    // Current grade cannot be manually altered through student editing
    const currentGrade = student.current_grade;

    // 2. Validate date and personal details if updated
    if (input.admissionDate) {
      this.validateIsoDate(input.admissionDate, 'Admission Date');
    }
    if (input.dateOfBirth) {
      this.validateIsoDate(input.dateOfBirth, 'Date of Birth');
      const birth = new Date(input.dateOfBirth);
      if (birth > new Date()) {
        throw new Error('Date of Birth cannot be in the future.');
      }
    }

    let fullName = student.admission_number;
    if (input.fullName !== undefined) {
      fullName = input.fullName.trim();
      if (!fullName || fullName.length < 2 || fullName.length > 150) {
        throw new Error('Full Name must be between 2 and 150 characters.');
      }
    }

    if (input.gender !== undefined) {
      if (input.gender !== 'Male' && input.gender !== 'Female') {
        throw new Error('Gender must be "Male" or "Female".');
      }
    }

    // Status changes: Active <-> Leaved
    let newStatus = student.status;
    let statusTransitionNeeded = false;
    if (input.status !== undefined && input.status !== student.status) {
      if (input.status !== 'Active' && input.status !== 'Leaved') {
        throw new Error('Manual status update can only transition between "Active" and "Leaved". "Passed Out" is reserved for academic completion.');
      }
      newStatus = input.status;
      statusTransitionNeeded = true;
    }

    // Validate lookups if updated
    if (input.transportationMethodId) {
      const tm = this.db.prepare('SELECT id FROM transportation_methods WHERE id = ?').get(input.transportationMethodId);
      if (!tm) throw new Error('Selected transportation method does not exist.');
    }
    if (input.houseId) {
      const h = this.db.prepare('SELECT id FROM houses WHERE id = ?').get(input.houseId);
      if (!h) throw new Error('Selected house does not exist.');
    }
    if (input.streetId) {
      const st = this.db.prepare('SELECT id FROM streets WHERE id = ?').get(input.streetId);
      if (!st) throw new Error('Selected street does not exist.');
    }
    if (input.cityId) {
      const ct = this.db.prepare('SELECT id FROM cities WHERE id = ?').get(input.cityId);
      if (!ct) throw new Error('Selected city does not exist.');
    }

    // Execute update transaction
    const updateTx = this.db.transaction(() => {
      // 1. Update students table
      this.db.prepare(`
        UPDATE students
        SET 
          full_name = COALESCE(?, full_name),
          admission_date = COALESCE(?, admission_date),
          date_of_birth = COALESCE(?, date_of_birth),
          gender = COALESCE(?, gender),
          status = ?,
          transportation_method_id = ?,
          house_id = ?,
          previous_school_name = ?,
          previous_school_id_number = ?,
          performance_description = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        input.fullName ? input.fullName.trim() : null,
        input.admissionDate || null,
        input.dateOfBirth || null,
        input.gender || null,
        newStatus,
        input.transportationMethodId !== undefined ? input.transportationMethodId : null,
        input.houseId !== undefined ? input.houseId : null,
        input.previousSchoolName !== undefined ? (input.previousSchoolName?.trim() || null) : null,
        input.previousSchoolIdNumber !== undefined ? (input.previousSchoolIdNumber?.trim() || null) : null,
        input.performanceDescription !== undefined ? (input.performanceDescription?.trim() || null) : null,
        input.id
      );

      // 2. Update family address
      this.db.prepare(`
        UPDATE families
        SET 
          house_no = COALESCE(?, house_no),
          street_id = ?,
          city_id = ?,
          additional_address_details = ?,
          full_address = COALESCE(?, full_address),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        input.houseNo !== undefined ? (input.houseNo?.trim() || null) : null,
        input.streetId !== undefined ? input.streetId : null,
        input.cityId !== undefined ? input.cityId : null,
        input.additionalAddressDetails !== undefined ? (input.additionalAddressDetails?.trim() || null) : null,
        input.fullAddress !== undefined ? (input.fullAddress?.trim() || null) : null,
        student.family_id
      );

      // 3. Record status transition if changed
      if (statusTransitionNeeded) {
        this.db.prepare(`
          INSERT INTO student_status_history (student_id, from_status, to_status, reason, changed_by)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          student.id,
          student.status,
          newStatus,
          input.statusReason ? input.statusReason.trim() : 'Manual status change',
          user.id
        );
      }

      // 4. Audit log
      try {
        this.db.prepare(`
          INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
          VALUES (?, 'UPDATE_STUDENT', 'students', ?, ?)
        `).run(user.id, String(student.id), `Updated details for student ${student.admission_number}`);
      } catch {}
    });

    updateTx();

    const updated = this.getStudentById(input.id);
    if (!updated) {
      throw new Error('Failed to retrieve updated student record.');
    }
    return updated;
  }

  // ==========================================
  // Safe Student Deletion
  // ==========================================
  public deleteStudent(user: IAuthSession, studentId: number): boolean {
    if (user.role !== 'Admin') {
      throw new Error('Unauthorized: Only Administrators can delete student records.');
    }

    const student = this.db.prepare('SELECT id, admission_number, family_id, photo_path FROM students WHERE id = ?').get(studentId) as {
      id: number;
      admission_number: string;
      family_id: number;
      photo_path: string | null;
    } | undefined;

    if (!student) {
      throw new Error(`Student with ID ${studentId} does not exist.`);
    }

    // Verify historical records exist before deleting
    const gradeCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM student_grade_history WHERE student_id = ?').get(studentId) as { cnt: number }).cnt;
    const statusCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM student_status_history WHERE student_id = ?').get(studentId) as { cnt: number }).cnt;
    const feeCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM student_annual_fees WHERE student_id = ?').get(studentId) as { cnt: number }).cnt;
    const noteCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM student_notes WHERE student_id = ? AND is_deleted = 0').get(studentId) as { cnt: number }).cnt;

    if (gradeCount > 0 || statusCount > 0 || feeCount > 0 || noteCount > 0) {
      throw new Error(
        `Cannot delete student ${student.admission_number} because historical records exist ` +
        `(${gradeCount} grade history, ${statusCount} status transitions, ${feeCount} fees, ${noteCount} notes). ` +
        `Please change the student's status to "Leaved" instead.`
      );
    }

    const deleteTx = this.db.transaction(() => {
      // 1. Remove photo from disk if present
      if (student.photo_path) {
        try {
          const fileName = path.basename(student.photo_path);
          const diskPath = path.resolve(this.photosStorageDir, fileName);
          if (fs.existsSync(diskPath)) {
            fs.unlinkSync(diskPath);
          }
        } catch {}
      }

      // 2. Delete student
      this.db.prepare('DELETE FROM students WHERE id = ?').run(studentId);

      // 3. Clean up family if no other students and no family members exist
      const siblingCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM students WHERE family_id = ?').get(student.family_id) as { cnt: number }).cnt;
      const memberCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM family_members WHERE family_id = ?').get(student.family_id) as { cnt: number }).cnt;
      if (siblingCount === 0 && memberCount === 0) {
        this.db.prepare('DELETE FROM families WHERE id = ?').run(student.family_id);
      }

      // 4. Audit log
      try {
        this.db.prepare(`
          INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
          VALUES (?, 'DELETE_STUDENT', 'students', ?, ?)
        `).run(user.id, String(studentId), `Deleted student ${student.admission_number} (no historical records existed)`);
      } catch {}
    });

    deleteTx();
    return true;
  }

  // ==========================================
  // Student Notes Management
  // ==========================================
  public addStudentNote(user: IAuthSession, studentId: number, noteText: string): IStudentNote {
    const trimmed = noteText ? noteText.trim() : '';
    if (!trimmed || trimmed.length > 2000) {
      throw new Error('Note text must be between 1 and 2000 characters.');
    }

    const studentExists = this.db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
    if (!studentExists) {
      throw new Error(`Student with ID ${studentId} does not exist.`);
    }

    const result = this.db.prepare(`
      INSERT INTO student_notes (student_id, note_text, created_by)
      VALUES (?, ?, ?)
    `).run(studentId, trimmed, user.id);

    try {
      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'ADD_STUDENT_NOTE', 'students', ?, ?)
      `).run(user.id, String(studentId), `Added note ID ${result.lastInsertRowid}`);
    } catch {}

    const note = this.db.prepare(`
      SELECT 
        sn.id,
        sn.student_id as studentId,
        sn.note_text as noteText,
        sn.created_by as createdBy,
        u.display_name as createdByName,
        u.role as createdByRole,
        sn.created_at as createdAt,
        sn.updated_at as updatedAt
      FROM student_notes sn
      LEFT JOIN users u ON sn.created_by = u.id
      WHERE sn.id = ?
    `).get(result.lastInsertRowid) as IStudentNote;

    return note;
  }

  public getStudentNotes(studentId: number): IStudentNote[] {
    const sql = `
      SELECT 
        sn.id,
        sn.student_id as studentId,
        sn.note_text as noteText,
        sn.created_by as createdBy,
        u.display_name as createdByName,
        u.role as createdByRole,
        sn.created_at as createdAt,
        sn.updated_at as updatedAt
      FROM student_notes sn
      LEFT JOIN users u ON sn.created_by = u.id
      WHERE sn.student_id = ? AND sn.is_deleted = 0
      ORDER BY sn.created_at ASC
    `;
    return this.db.prepare(sql).all(studentId) as IStudentNote[];
  }

  public deleteStudentNote(user: IAuthSession, noteId: number): boolean {
    const note = this.db.prepare('SELECT id, student_id, created_by FROM student_notes WHERE id = ? AND is_deleted = 0').get(noteId) as {
      id: number;
      student_id: number;
      created_by: number | null;
    } | undefined;

    if (!note) {
      throw new Error(`Note with ID ${noteId} was not found.`);
    }

    // Only Admin or the user who created the note can delete it
    if (user.role !== 'Admin' && note.created_by !== user.id) {
      throw new Error('Unauthorized: You can only delete notes that you created.');
    }

    this.db.prepare('UPDATE student_notes SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(noteId);

    try {
      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'DELETE_STUDENT_NOTE', 'student_notes', ?, ?)
      `).run(user.id, String(noteId), `Soft-deleted note for student ${note.student_id}`);
    } catch {}

    return true;
  }

  // ==========================================
  // Student Photo Upload & Removal
  // ==========================================
  public uploadStudentPhoto(user: IAuthSession, studentId: number, fileName: string, fileDataBase64: string): string {
    const student = this.db.prepare('SELECT id, admission_number, photo_path FROM students WHERE id = ?').get(studentId) as {
      id: number;
      admission_number: string;
      photo_path: string | null;
    } | undefined;

    if (!student) {
      throw new Error(`Student with ID ${studentId} was not found.`);
    }

    const base64Data = fileDataBase64.replace(/^data:image\/\w+;base64,/, '');
    const photoBuffer = Buffer.from(base64Data, 'base64');
    const newRelativePath = this.savePhotoBuffer(photoBuffer, student.admission_number);

    // Update DB
    this.db.prepare('UPDATE students SET photo_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newRelativePath, studentId);

    // Safely remove old photo file if it was different
    if (student.photo_path && student.photo_path !== newRelativePath) {
      try {
        const oldFile = path.resolve(this.photosStorageDir, path.basename(student.photo_path));
        if (fs.existsSync(oldFile)) {
          fs.unlinkSync(oldFile);
        }
      } catch {}
    }

    try {
      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'UPLOAD_STUDENT_PHOTO', 'students', ?, ?)
      `).run(user.id, String(studentId), `Uploaded photo for student ${student.admission_number}`);
    } catch {}

    const previewUrl = this.getPhotoPreviewUrl(newRelativePath);
    return previewUrl || '';
  }

  public removeStudentPhoto(user: IAuthSession, studentId: number): boolean {
    const student = this.db.prepare('SELECT id, admission_number, photo_path FROM students WHERE id = ?').get(studentId) as {
      id: number;
      admission_number: string;
      photo_path: string | null;
    } | undefined;

    if (!student) {
      throw new Error(`Student with ID ${studentId} was not found.`);
    }

    if (student.photo_path) {
      try {
        const oldFile = path.resolve(this.photosStorageDir, path.basename(student.photo_path));
        if (fs.existsSync(oldFile)) {
          fs.unlinkSync(oldFile);
        }
      } catch {}
    }

    this.db.prepare('UPDATE students SET photo_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(studentId);

    try {
      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'REMOVE_STUDENT_PHOTO', 'students', ?, ?)
      `).run(user.id, String(studentId), `Removed photo for student ${student.admission_number}`);
    } catch {}

    return true;
  }
}

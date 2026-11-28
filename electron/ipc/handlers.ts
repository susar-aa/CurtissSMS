import { ipcMain, app, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from './channels';
import { getDatabase, getDatabasePath } from '../database/connection';
import { DatabaseHealthChecker } from '../database/health';
import { DatabaseMigrator } from '../database/migrator';
import { DatabaseBackupService } from '../database/backup';
import { AuthService } from '../services/authService';
import { UserService } from '../services/userService';
import { SchoolSettingsService } from '../services/schoolSettingsService';
import { QuickCreateService } from '../services/quickCreateService';
import { StudentService } from '../services/studentService';
import { FamilyService } from '../services/familyService';
import { AcademicYearService } from '../services/academicYearService';
import { FeeConfigurationService } from '../services/feeConfigurationService';
import { FeePaymentService } from '../services/feePaymentService';
import { ReportService } from '../services/reportService';
import { PinSecurityService } from '../services/pinSecurity';
import { 
  IApiResponse, 
  ISystemInfo, 
  IDatabaseHealth, 
  IBackupResult, 
  IAuthSession, 
  ILoginResult, 
  IUserProfile, 
  ICreateUserInput, 
  IUpdateUserInput,
  ISchoolSettings,
  IUpdateSchoolSettingsInput,
  ILogoUploadResult,
  LookupCategory,
  ILookupItem,
  ICreateLookupInput,
  IUpdateLookupInput,
  IQuickCreateInput,
  IRegisterStudentInput,
  IUpdateStudentInput,
  IStudentListItem,
  IStudentDetail,
  IStudentNote,
  IStudentListQuery,
  IPaginatedResult,
  IFamilyMember,
  IUpdateFamilyMembersInput,
  ILinkedStudent,
  ISiblingCandidate,
  ISiblingCandidateQuery,
  ILinkSiblingsInput,
  IUnlinkSiblingInput,
  IFamilyDetail,
  IFamilyMergePreview,
  IAcademicYear,
  IAnnualProcessingLog,
  IStudentGradeHistoryRecord,
  IPromotionSystemStatus,
  IPromotionResult,
  ICatchupPromotionResult,
  IAnnualFeeSetting,
  ISetAnnualFeeInput,
  IFeeConfigFilterQuery,
  IFeeConfigAuditLog,
  IStudentAnnualFeeItem,
  IStudentFeeFilterQuery,
  IRecordPaymentInput,
  IReceiptDetails,
  IFeeGenerationResult,
  IFeeGenerationStatus,
  IStudentReportFilter,
  IStudentReportSummary,
  IStudentReportItem,
  IFeeReportFilter,
  IFeeReportSummary,
  IFeeReportItem,
  ITwoPageStudentPrintProfile
} from '../shared/types';

let authServiceInstance: AuthService | null = null;
let userServiceInstance: UserService | null = null;
let schoolSettingsServiceInstance: SchoolSettingsService | null = null;
let quickCreateServiceInstance: QuickCreateService | null = null;
let studentServiceInstance: StudentService | null = null;
let familyServiceInstance: FamilyService | null = null;

export function getFamilyService(): FamilyService {
  if (!familyServiceInstance) {
    const db = getDatabase();
    familyServiceInstance = new FamilyService(db);
  }
  return familyServiceInstance;
}

export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    const db = getDatabase();
    authServiceInstance = new AuthService(db);
  }
  return authServiceInstance;
}

export function getUserService(): UserService {
  if (!userServiceInstance) {
    const db = getDatabase();
    userServiceInstance = new UserService(db);
  }
  return userServiceInstance;
}

export function getSchoolSettingsService(): SchoolSettingsService {
  if (!schoolSettingsServiceInstance) {
    const db = getDatabase();
    schoolSettingsServiceInstance = new SchoolSettingsService(db);
  }
  return schoolSettingsServiceInstance;
}

export function getQuickCreateService(): QuickCreateService {
  if (!quickCreateServiceInstance) {
    const db = getDatabase();
    quickCreateServiceInstance = new QuickCreateService(db);
  }
  return quickCreateServiceInstance;
}

export function getStudentService(): StudentService {
  if (!studentServiceInstance) {
    const db = getDatabase();
    studentServiceInstance = new StudentService(db);
  }
  return studentServiceInstance;
}

export function registerIpcHandlers(): void {
  const db = getDatabase();
  // Initialize safe pepper storage with DB presence validation
  PinSecurityService.initializeSecurePepper(undefined, db);

  const authService = getAuthService();
  const userService = getUserService();
  const schoolSettingsService = getSchoolSettingsService();
  const quickCreateService = getQuickCreateService();
  const studentService = getStudentService();

  // ==========================================
  // System Info & Window Controls
  // ==========================================
  ipcMain.handle(IPC_CHANNELS.SYSTEM.GET_INFO, async (): Promise<IApiResponse<ISystemInfo>> => {
    try {
      const info: ISystemInfo = {
        appName: 'CurtissSMS',
        appVersion: app.getVersion() || '1.0.0',
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
        platform: process.platform,
        databasePath: getDatabasePath()
      };
      return { success: true, data: info };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM.GET_DB_HEALTH, async (): Promise<IApiResponse<IDatabaseHealth>> => {
    try {
      const db = getDatabase();
      const checker = new DatabaseHealthChecker(db);
      const health = checker.checkHealth();
      return { success: true, data: health };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM.TRIGGER_BACKUP, async (): Promise<IApiResponse<IBackupResult>> => {
    try {
      // Backup requires authenticated session
      authService.requireAuth();
      const db = getDatabase();
      const backupService = new DatabaseBackupService(db);
      const result = await backupService.createBackup();
      return { success: result.success, data: result, error: result.error };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.DATABASE.GET_MIGRATION_STATUS, async () => {
    try {
      const db = getDatabase();
      const migrator = new DatabaseMigrator(db);
      const currentVersion = migrator.getCurrentVersion();
      return { success: true, data: { currentVersion } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.on(IPC_CHANNELS.SYSTEM.WINDOW_MINIMIZE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });

  ipcMain.on(IPC_CHANNELS.SYSTEM.WINDOW_MAXIMIZE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
  });

  ipcMain.on(IPC_CHANNELS.SYSTEM.WINDOW_CLOSE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });

  // ==========================================
  // Authentication IPC Handlers
  // ==========================================
  ipcMain.handle(IPC_CHANNELS.AUTH.HAS_USERS, async (): Promise<IApiResponse<boolean>> => {
    try {
      const hasUsers = authService.hasUsers();
      return { success: true, data: hasUsers };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH.GET_LOCKOUT_STATUS, async () => {
    try {
      const status = authService.getLockoutStatus();
      return { success: true, data: status };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH.GET_PEPPER_STATUS, async (): Promise<IApiResponse<{ isInitialized: boolean; requiresRecovery: boolean }>> => {
    try {
      const status = PinSecurityService.initializeSecurePepper(undefined, getDatabase());
      // Return only high-level status; NEVER expose secret material or internal paths to renderer
      return { 
        success: true, 
        data: { 
          isInitialized: status.isInitialized, 
          requiresRecovery: status.requiresRecovery 
        } 
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH.RECOVER_PEPPER, async (_, args: { recoveryKey: string }) => {
    try {
      // Secure recovery procedure:
      // Recovery can ONLY be performed when the system explicitly requires recovery (e.g. machine migration)
      // OR by an authenticated Administrator.
      const currentPepperStatus = PinSecurityService.initializeSecurePepper(undefined, getDatabase());
      if (!currentPepperStatus.requiresRecovery) {
        // If recovery is not demanded by missing/corrupted DPAPI keys, require an authenticated Administrator session
        authService.requireAdmin();
      }

      if (!args.recoveryKey || typeof args.recoveryKey !== 'string' || args.recoveryKey.trim().length < 16) {
        throw new Error('Invalid recovery key provided. Must be at least 16 characters.');
      }

      const recovered = PinSecurityService.recoverPepper(args.recoveryKey);
      return { success: true, data: recovered };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH.SETUP_INITIAL_ADMIN, async (_, args: { displayName: string; pin: string }): Promise<IApiResponse<IAuthSession>> => {
    try {
      const session = authService.setupInitialAdmin(args.displayName, args.pin);
      return { success: true, data: session };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH.LOGIN, async (_, args: { pin: string }): Promise<IApiResponse<ILoginResult>> => {
    try {
      const loginOutcome = authService.loginWithPin(args.pin);
      if (!loginOutcome.success) {
        return { success: false, error: loginOutcome.error, data: loginOutcome.result };
      }
      return { success: true, data: loginOutcome.result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH.LOGOUT, async (): Promise<IApiResponse<boolean>> => {
    try {
      authService.logout();
      return { success: true, data: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH.GET_CURRENT_USER, async (): Promise<IApiResponse<IAuthSession | null>> => {
    try {
      const user = authService.getCurrentSession();
      return { success: true, data: user };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // ==========================================
  // User Management IPC Handlers (Admin Only)
  // ==========================================
  ipcMain.handle(IPC_CHANNELS.USERS.LIST, async (): Promise<IApiResponse<IUserProfile[]>> => {
    try {
      authService.requireAdmin();
      const users = userService.listUsers();
      return { success: true, data: users };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.USERS.CREATE, async (_, input: ICreateUserInput): Promise<IApiResponse<IUserProfile>> => {
    try {
      const admin = authService.requireAdmin();
      const created = userService.createUser(admin, input);
      return { success: true, data: created };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.USERS.UPDATE, async (_, args: { userId: number; input: IUpdateUserInput }): Promise<IApiResponse<IUserProfile>> => {
    try {
      const admin = authService.requireAdmin();
      const updated = userService.updateUser(admin, args.userId, args.input);
      return { success: true, data: updated };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.USERS.SET_ACTIVE, async (_, args: { userId: number; isActive: boolean }): Promise<IApiResponse<IUserProfile>> => {
    try {
      const admin = authService.requireAdmin();
      const updated = userService.setUserActive(admin, args.userId, args.isActive);
      return { success: true, data: updated };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // ==========================================
  // School Settings IPC Handlers (Admin Only)
  // ==========================================
  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET_SCHOOL_SETTINGS, async (): Promise<IApiResponse<ISchoolSettings>> => {
    try {
      authService.requireAuth();
      const settings = schoolSettingsService.getSchoolSettings();
      return { success: true, data: settings };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS.UPDATE_SCHOOL_SETTINGS, async (_, input: IUpdateSchoolSettingsInput): Promise<IApiResponse<ISchoolSettings>> => {
    try {
      const admin = authService.requireAdmin();
      const updated = schoolSettingsService.updateSchoolSettings(admin, input);
      return { success: true, data: updated };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS.UPLOAD_LOGO, async (_, args: { fileName: string; fileDataBase64: string }): Promise<IApiResponse<ILogoUploadResult>> => {
    try {
      const admin = authService.requireAdmin();
      const buffer = Buffer.from(args.fileDataBase64, 'base64');
      const result = schoolSettingsService.uploadLogo(admin, args.fileName, buffer);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS.REMOVE_LOGO, async (): Promise<IApiResponse<boolean>> => {
    try {
      const admin = authService.requireAdmin();
      schoolSettingsService.removeLogo(admin);
      return { success: true, data: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET_LOGO_PREVIEW, async (): Promise<IApiResponse<string | null>> => {
    try {
      authService.requireAuth();
      const previewUrl = schoolSettingsService.getLogoPreview();
      return { success: true, data: previewUrl };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // ==========================================
  // Lookups & Quick Create IPC Handlers
  // ==========================================

  // 1. Get All lookups (Authenticated Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.LOOKUPS.GET_ALL, async (_, args: { category: LookupCategory; includeInactive?: boolean }): Promise<IApiResponse<ILookupItem[]>> => {
    try {
      authService.requireAuth();
      const items = quickCreateService.getLookups(args.category, Boolean(args.includeInactive));
      return { success: true, data: items };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 2. Search lookups (Authenticated Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.LOOKUPS.SEARCH, async (_, args: { category: LookupCategory; query: string; includeInactive?: boolean }): Promise<IApiResponse<ILookupItem[]>> => {
    try {
      authService.requireAuth();
      const items = quickCreateService.getLookups(args.category, Boolean(args.includeInactive), args.query);
      return { success: true, data: items };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 3. Quick Create (Staff & Admin during student/family registration)
  ipcMain.handle(IPC_CHANNELS.LOOKUPS.QUICK_CREATE, async (_, input: IQuickCreateInput): Promise<IApiResponse<ILookupItem>> => {
    try {
      const user = authService.requireAuth();
      const created = quickCreateService.quickCreate(user, input.category, input.name, input.postalCode, input.colorHex);
      return { success: true, data: created };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 4. Admin Create (Admin Only)
  ipcMain.handle(IPC_CHANNELS.LOOKUPS.CREATE, async (_, input: ICreateLookupInput): Promise<IApiResponse<ILookupItem>> => {
    try {
      const admin = authService.requireAdmin();
      const created = quickCreateService.createLookup(admin, input);
      return { success: true, data: created };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 5. Admin Update (Admin Only)
  ipcMain.handle(IPC_CHANNELS.LOOKUPS.UPDATE, async (_, input: IUpdateLookupInput): Promise<IApiResponse<ILookupItem>> => {
    try {
      const admin = authService.requireAdmin();
      const updated = quickCreateService.updateLookup(admin, input);
      return { success: true, data: updated };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 6. Admin Set Active / Deactivate (Admin Only)
  ipcMain.handle(IPC_CHANNELS.LOOKUPS.SET_ACTIVE, async (_, args: { category: LookupCategory; id: number; isActive: boolean }): Promise<IApiResponse<ILookupItem>> => {
    try {
      const admin = authService.requireAdmin();
      const updated = quickCreateService.setLookupActive(admin, args.category, args.id, args.isActive);
      return { success: true, data: updated };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 7. Admin Delete (Admin Only, blocked if dependent records exist)
  ipcMain.handle(IPC_CHANNELS.LOOKUPS.DELETE, async (_, args: { category: LookupCategory; id: number }): Promise<IApiResponse<boolean>> => {
    try {
      const admin = authService.requireAdmin();
      const deleted = quickCreateService.deleteLookup(admin, args.category, args.id);
      return { success: true, data: deleted };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // ==========================================
  // Student Management IPC Handlers (Stage 06)
  // ==========================================

  // 1. Get Students (Paginated, Search, Filters)
  ipcMain.handle(IPC_CHANNELS.STUDENTS.GET_ALL, async (_, query: IStudentListQuery): Promise<IApiResponse<IPaginatedResult<IStudentListItem>>> => {
    try {
      authService.requireAuth();
      const result = studentService.getStudents(query || {});
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 2. Get Student Profile by ID
  ipcMain.handle(IPC_CHANNELS.STUDENTS.GET_BY_ID, async (_, args: { id: number }): Promise<IApiResponse<IStudentDetail | null>> => {
    try {
      authService.requireAuth();
      const student = studentService.getStudentById(args.id);
      return { success: true, data: student };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 3. Register Student (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.STUDENTS.REGISTER, async (_, input: IRegisterStudentInput): Promise<IApiResponse<IStudentDetail>> => {
    try {
      const user = authService.requireAuth();
      const student = studentService.registerStudent(user, input);
      return { success: true, data: student };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 4. Update Student Information
  ipcMain.handle(IPC_CHANNELS.STUDENTS.UPDATE, async (_, input: IUpdateStudentInput): Promise<IApiResponse<IStudentDetail>> => {
    try {
      const user = authService.requireAuth();
      const student = studentService.updateStudent(user, input);
      return { success: true, data: student };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 5. Delete Student (Admin Only, Safe Deletion Protection)
  ipcMain.handle(IPC_CHANNELS.STUDENTS.DELETE, async (_, args: { id: number }): Promise<IApiResponse<boolean>> => {
    try {
      const admin = authService.requireAdmin();
      const deleted = studentService.deleteStudent(admin, args.id);
      return { success: true, data: deleted };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 6. Add Student Note (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.STUDENTS.ADD_NOTE, async (_, args: { studentId: number; noteText: string }): Promise<IApiResponse<IStudentNote>> => {
    try {
      const user = authService.requireAuth();
      const note = studentService.addStudentNote(user, args.studentId, args.noteText);
      return { success: true, data: note };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 7. Get Student Notes
  ipcMain.handle(IPC_CHANNELS.STUDENTS.GET_NOTES, async (_, args: { studentId: number }): Promise<IApiResponse<IStudentNote[]>> => {
    try {
      authService.requireAuth();
      const notes = studentService.getStudentNotes(args.studentId);
      return { success: true, data: notes };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 8. Delete Student Note
  ipcMain.handle(IPC_CHANNELS.STUDENTS.DELETE_NOTE, async (_, args: { noteId: number }): Promise<IApiResponse<boolean>> => {
    try {
      const user = authService.requireAuth();
      const deleted = studentService.deleteStudentNote(user, args.noteId);
      return { success: true, data: deleted };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 9. Upload Student Photo
  ipcMain.handle(IPC_CHANNELS.STUDENTS.UPLOAD_PHOTO, async (_, args: { studentId: number; fileName: string; fileDataBase64: string }): Promise<IApiResponse<string>> => {
    try {
      const user = authService.requireAuth();
      const previewUrl = studentService.uploadStudentPhoto(user, args.studentId, args.fileName, args.fileDataBase64);
      return { success: true, data: previewUrl };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 10. Remove Student Photo
  ipcMain.handle(IPC_CHANNELS.STUDENTS.REMOVE_PHOTO, async (_, args: { studentId: number }): Promise<IApiResponse<boolean>> => {
    try {
      const user = authService.requireAuth();
      const removed = studentService.removeStudentPhoto(user, args.studentId);
      return { success: true, data: removed };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // ==========================================
  // Family & Parent/Guardian Management (Stage 07)
  // ==========================================
  const familyService = getFamilyService();

  // 1. Get Family Members
  ipcMain.handle(IPC_CHANNELS.FAMILIES.GET_MEMBERS, async (_, args: { familyId: number }): Promise<IApiResponse<IFamilyMember[]>> => {
    try {
      authService.requireAuth();
      const members = familyService.getFamilyMembers(args.familyId);
      return { success: true, data: members };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 2. Update Family Members (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.FAMILIES.UPDATE_MEMBERS, async (_, input: IUpdateFamilyMembersInput): Promise<IApiResponse<IFamilyMember[]>> => {
    try {
      const user = authService.requireAuth();
      const updatedMembers = familyService.updateFamilyMembers(user, input);
      return { success: true, data: updatedMembers };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 3. Get Linked Students Sharing Family
  ipcMain.handle(IPC_CHANNELS.FAMILIES.GET_LINKED_STUDENTS, async (_, args: { familyId: number }): Promise<IApiResponse<ILinkedStudent[]>> => {
    try {
      authService.requireAuth();
      const students = familyService.getLinkedStudents(args.familyId);
      return { success: true, data: students };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // ==========================================
  // Sibling Management (Stage 08)
  // ==========================================

  // 4. Search Sibling Candidates (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.FAMILIES.SEARCH_SIBLING_CANDIDATES, async (_, query: ISiblingCandidateQuery): Promise<IApiResponse<ISiblingCandidate[]>> => {
    try {
      authService.requireAuth();
      const candidates = familyService.searchCandidateSiblings(query);
      return { success: true, data: candidates };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 5. Get Family Merge Preview (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.FAMILIES.GET_MERGE_PREVIEW, async (_, args: { primaryStudentId: number; siblingStudentId: number }): Promise<IApiResponse<IFamilyMergePreview>> => {
    try {
      authService.requireAuth();
      const preview = familyService.getFamilyMergePreview(args.primaryStudentId, args.siblingStudentId);
      return { success: true, data: preview };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 6. Link Siblings (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.FAMILIES.LINK_SIBLINGS, async (_, input: ILinkSiblingsInput): Promise<IApiResponse<IFamilyDetail>> => {
    try {
      const user = authService.requireAuth();
      const updatedFamily = familyService.linkSiblings(user, input);
      return { success: true, data: updatedFamily };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 7. Unlink Sibling (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.FAMILIES.UNLINK_SIBLING, async (_, input: IUnlinkSiblingInput): Promise<IApiResponse<IFamilyDetail>> => {
    try {
      const user = authService.requireAuth();
      const updatedFamily = familyService.unlinkSibling(user, input);
      return { success: true, data: updatedFamily };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // ==========================================
  // ACADEMIC YEARS & GRADE PROMOTION (Stage 09)
  // ==========================================
  const academicYearService = new AcademicYearService(db);

  // 1. Get Academic Year & Promotion System Status (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.ACADEMIC_YEARS.GET_SYSTEM_STATUS, async (): Promise<IApiResponse<IPromotionSystemStatus>> => {
    try {
      authService.requireAuth();
      const status = academicYearService.getPromotionSystemStatus();
      return { success: true, data: status };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 2. Get All Academic Years (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.ACADEMIC_YEARS.GET_ALL_YEARS, async (): Promise<IApiResponse<IAcademicYear[]>> => {
    try {
      authService.requireAuth();
      const years = academicYearService.getAcademicYears();
      return { success: true, data: years };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 3. Set Active Academic Year (Admin only)
  ipcMain.handle(IPC_CHANNELS.ACADEMIC_YEARS.SET_ACTIVE_YEAR, async (_, args: { year: number }): Promise<IApiResponse<{ activeYear: number }>> => {
    try {
      authService.requireAdmin();
      academicYearService.setActiveAcademicYear(args.year);
      return { success: true, data: { activeYear: args.year } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 4. Get Promotion Processing History Logs (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.ACADEMIC_YEARS.GET_PROMOTION_LOGS, async (): Promise<IApiResponse<IAnnualProcessingLog[]>> => {
    try {
      authService.requireAuth();
      const logs = academicYearService.getPromotionHistoryLogs();
      return { success: true, data: logs };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 5. Get Student Grade Progression History for Year (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.ACADEMIC_YEARS.GET_GRADE_HISTORY, async (_, args: { year: number; limit?: number }): Promise<IApiResponse<IStudentGradeHistoryRecord[]>> => {
    try {
      authService.requireAuth();
      const records = academicYearService.getGradeHistoryForYear(args.year, args.limit);
      return { success: true, data: records };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 6. Process Annual Promotion for Year (Admin only)
  ipcMain.handle(IPC_CHANNELS.ACADEMIC_YEARS.PROCESS_PROMOTION, async (_, args: { year: number }): Promise<IApiResponse<IPromotionResult>> => {
    try {
      const user = authService.requireAdmin();
      const result = academicYearService.processAcademicYearPromotion(args.year, user.id);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 7. Run Catch-up Promotion (Admin only manual trigger)
  ipcMain.handle(IPC_CHANNELS.ACADEMIC_YEARS.RUN_CATCHUP, async (): Promise<IApiResponse<ICatchupPromotionResult>> => {
    try {
      const user = authService.requireAdmin();
      const result = academicYearService.runCatchupPromotions(user.id);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 8. Retry Failed Promotion (Admin only)
  ipcMain.handle(IPC_CHANNELS.ACADEMIC_YEARS.RETRY_FAILED, async (_, args: { year: number }): Promise<IApiResponse<IPromotionResult>> => {
    try {
      const user = authService.requireAdmin();
      const result = academicYearService.retryFailedPromotion(user, args.year);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // ==========================================
  // ANNUAL FEE CONFIGURATION (Stage 10)
  // ==========================================
  const feeConfigurationService = new FeeConfigurationService(db);

  // 1. Get Annual Fee by Year (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.FEE_CONFIG.GET_BY_YEAR, async (_, args: { year: number }): Promise<IApiResponse<IAnnualFeeSetting | null>> => {
    try {
      authService.requireAuth();
      const config = feeConfigurationService.getAnnualFeeByYear(args.year);
      return { success: true, data: config };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 2. Get Paginated Configurations (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.FEE_CONFIG.GET_CONFIGURATIONS, async (_, query: IFeeConfigFilterQuery): Promise<IApiResponse<IPaginatedResult<IAnnualFeeSetting>>> => {
    try {
      authService.requireAuth();
      const result = feeConfigurationService.getAnnualFeeConfigurations(query);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 3. Create Annual Fee Configuration (Admin only)
  ipcMain.handle(IPC_CHANNELS.FEE_CONFIG.CREATE, async (_, input: ISetAnnualFeeInput): Promise<IApiResponse<IAnnualFeeSetting>> => {
    try {
      const user = authService.requireAdmin();
      const config = feeConfigurationService.createAnnualFee(user, input);
      return { success: true, data: config };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 4. Update Annual Fee Configuration (Admin only)
  ipcMain.handle(IPC_CHANNELS.FEE_CONFIG.UPDATE, async (_, input: ISetAnnualFeeInput): Promise<IApiResponse<IAnnualFeeSetting>> => {
    try {
      const user = authService.requireAdmin();
      const config = feeConfigurationService.updateAnnualFee(user, input);
      return { success: true, data: config };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 5. Delete Annual Fee Configuration (Admin only)
  ipcMain.handle(IPC_CHANNELS.FEE_CONFIG.DELETE, async (_, args: { year: number }): Promise<IApiResponse<{ message: string }>> => {
    try {
      const user = authService.requireAdmin();
      const result = feeConfigurationService.deleteAnnualFee(user, args.year);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 6. Get Fee Config Audit Logs (Admin only)
  ipcMain.handle(IPC_CHANNELS.FEE_CONFIG.GET_AUDIT_LOGS, async (_, args: { limit?: number }): Promise<IApiResponse<IFeeConfigAuditLog[]>> => {
    try {
      authService.requireAdmin();
      const logs = feeConfigurationService.getFeeConfigAuditLogs(args?.limit);
      return { success: true, data: logs };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // ==========================================
  // ANNUAL FEE GENERATION & PAYMENTS (Stage 11)
  // ==========================================
  const feePaymentService = new FeePaymentService(db);

  // 1. Get Fee Generation Status (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.FEES.GET_GENERATION_STATUS, async (): Promise<IApiResponse<IFeeGenerationStatus>> => {
    try {
      authService.requireAuth();
      const status = feePaymentService.getFeeGenerationStatus();
      return { success: true, data: status };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 2. Generate Annual Fees for Year (Admin only)
  ipcMain.handle(IPC_CHANNELS.FEES.GENERATE_ANNUAL_FEES, async (_, args: { year: number }): Promise<IApiResponse<IFeeGenerationResult>> => {
    try {
      const user = authService.requireAdmin();
      const result = feePaymentService.generateAnnualFees(args.year, user.id);
      return { success: result.status === 'Success', data: result, error: result.error };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 3. Retry Failed Fee Generation (Admin only)
  ipcMain.handle(IPC_CHANNELS.FEES.RETRY_GENERATION, async (_, args: { year: number }): Promise<IApiResponse<IFeeGenerationResult>> => {
    try {
      const user = authService.requireAdmin();
      const result = feePaymentService.generateAnnualFees(args.year, user.id);
      return { success: result.status === 'Success', data: result, error: result.error };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 4. Run Startup Catch-up Fee Generation (Admin only or system)
  ipcMain.handle(IPC_CHANNELS.FEES.RUN_CATCHUP, async (): Promise<IApiResponse<{ processed: boolean; message: string }>> => {
    try {
      authService.requireAdmin();
      const result = feePaymentService.runStartupCatchupFeeGeneration();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 5. Get Student Annual Fees List with filters (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.FEES.GET_STUDENT_FEES, async (_, query: IStudentFeeFilterQuery): Promise<IApiResponse<IPaginatedResult<IStudentAnnualFeeItem>>> => {
    try {
      authService.requireAuth();
      const result = feePaymentService.getStudentFees(query || {});
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 6. Record Cash Payment (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.FEES.RECORD_CASH_PAYMENT, async (_, input: IRecordPaymentInput): Promise<IApiResponse<IReceiptDetails>> => {
    try {
      const user = authService.requireAuth();
      const receipt = feePaymentService.recordCashPayment(user, input);
      return { success: true, data: receipt };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 7. Get Receipt Details (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.FEES.GET_RECEIPT_DETAILS, async (_, args: { identifier: number | string }): Promise<IApiResponse<IReceiptDetails>> => {
    try {
      authService.requireAuth();
      const receipt = feePaymentService.getReceiptDetails(args.identifier);
      return { success: true, data: receipt };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 8. Get New Student Fee Setting (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.FEES.GET_NEW_STUDENT_FEE_SETTING, async (): Promise<IApiResponse<boolean>> => {
    try {
      authService.requireAuth();
      const enabled = feePaymentService.getNewStudentFeeSetting();
      return { success: true, data: enabled };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 9. Set New Student Fee Setting (Admin only)
  ipcMain.handle(IPC_CHANNELS.FEES.SET_NEW_STUDENT_FEE_SETTING, async (_, args: { enabled: boolean }): Promise<IApiResponse<boolean>> => {
    try {
      const user = authService.requireAdmin();
      const result = feePaymentService.setNewStudentFeeSetting(user, Boolean(args.enabled));
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // ==========================================
  // REPORTS & STUDENT PRINTING (Stage 12)
  // ==========================================
  const reportService = new ReportService(db, studentService);

  // 1. Get Student Report Summary (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.REPORTS.GET_STUDENT_REPORT_SUMMARY, async (_, filter: IStudentReportFilter): Promise<IApiResponse<IStudentReportSummary>> => {
    try {
      authService.requireAuth();
      const summary = reportService.getStudentReportSummary(filter);
      return { success: true, data: summary };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 2. Get Paginated Student Report (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.REPORTS.GET_STUDENT_REPORT, async (_, filter: IStudentReportFilter): Promise<IApiResponse<IPaginatedResult<IStudentReportItem>>> => {
    try {
      authService.requireAuth();
      const result = reportService.getStudentReport(filter);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 3. Export Students to CSV (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.REPORTS.EXPORT_STUDENTS_CSV, async (_, filter: IStudentReportFilter): Promise<IApiResponse<string>> => {
    try {
      authService.requireAuth();
      const csv = reportService.exportStudentsCsv(filter);
      return { success: true, data: csv };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 4. Get Fee Report Summary (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.REPORTS.GET_FEE_REPORT_SUMMARY, async (_, args: { academicYear?: number; paymentDateFrom?: string; paymentDateTo?: string }): Promise<IApiResponse<IFeeReportSummary>> => {
    try {
      authService.requireAuth();
      const summary = reportService.getFeeReportSummary(args?.academicYear, args?.paymentDateFrom, args?.paymentDateTo);
      return { success: true, data: summary };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 5. Get Paginated Fee Report (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.REPORTS.GET_FEE_REPORT, async (_, filter: IFeeReportFilter): Promise<IApiResponse<IPaginatedResult<IFeeReportItem>>> => {
    try {
      authService.requireAuth();
      const result = reportService.getFeeReport(filter);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 6. Export Fees to CSV (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.REPORTS.EXPORT_FEES_CSV, async (_, filter: IFeeReportFilter): Promise<IApiResponse<string>> => {
    try {
      authService.requireAuth();
      const csv = reportService.exportFeesCsv(filter);
      return { success: true, data: csv };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 7. Get Two-Page Student Print Profile (Staff & Admin)
  ipcMain.handle(IPC_CHANNELS.REPORTS.GET_STUDENT_PRINT_PROFILE, async (_, args: { studentId: number }): Promise<IApiResponse<ITwoPageStudentPrintProfile>> => {
    try {
      const user = authService.requireAuth();
      const profile = reportService.getTwoPageStudentPrintProfile(args.studentId, user);
      return { success: true, data: profile };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });
}

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './ipc/channels';
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
} from './shared/types';

const api = {
  // System & Diagnostics
  getSystemInfo: (): Promise<IApiResponse<ISystemInfo>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SYSTEM.GET_INFO);
  },
  getDatabaseHealth: (): Promise<IApiResponse<IDatabaseHealth>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SYSTEM.GET_DB_HEALTH);
  },
  triggerBackup: (): Promise<IApiResponse<IBackupResult>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SYSTEM.TRIGGER_BACKUP);
  },
  getMigrationStatus: (): Promise<IApiResponse<{ currentVersion: number }>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.DATABASE.GET_MIGRATION_STATUS);
  },

  // Window Controls
  minimizeWindow: (): void => {
    ipcRenderer.send(IPC_CHANNELS.SYSTEM.WINDOW_MINIMIZE);
  },
  maximizeWindow: (): void => {
    ipcRenderer.send(IPC_CHANNELS.SYSTEM.WINDOW_MAXIMIZE);
  },
  closeWindow: (): void => {
    ipcRenderer.send(IPC_CHANNELS.SYSTEM.WINDOW_CLOSE);
  },

  // Authentication
  hasUsers: (): Promise<IApiResponse<boolean>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.AUTH.HAS_USERS);
  },
  getLockoutStatus: (): Promise<IApiResponse<{ isLocked: boolean; remainingSeconds: number; remainingAttempts: number }>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.AUTH.GET_LOCKOUT_STATUS);
  },
  setupInitialAdmin: (displayName: string, pin: string): Promise<IApiResponse<IAuthSession>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.AUTH.SETUP_INITIAL_ADMIN, { displayName, pin });
  },
  login: (pin: string): Promise<IApiResponse<ILoginResult>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.AUTH.LOGIN, { pin });
  },
  logout: (): Promise<IApiResponse<boolean>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.AUTH.LOGOUT);
  },
  getCurrentUser: (): Promise<IApiResponse<IAuthSession | null>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.AUTH.GET_CURRENT_USER);
  },

  // User Management (Admin Only)
  listUsers: (): Promise<IApiResponse<IUserProfile[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.USERS.LIST);
  },
  createUser: (input: ICreateUserInput): Promise<IApiResponse<IUserProfile>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.USERS.CREATE, input);
  },
  updateUser: (userId: number, input: IUpdateUserInput): Promise<IApiResponse<IUserProfile>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.USERS.UPDATE, { userId, input });
  },
  setUserActive: (userId: number, isActive: boolean): Promise<IApiResponse<IUserProfile>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.USERS.SET_ACTIVE, { userId, isActive });
  },
  resetUserPin: (userId: number, newPin: string): Promise<IApiResponse<boolean>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.USERS.RESET_PIN, { userId, newPin });
  },

  // School Settings (Admin Only for modifications)
  getSchoolSettings: (): Promise<IApiResponse<ISchoolSettings>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_SCHOOL_SETTINGS);
  },
  updateSchoolSettings: (input: IUpdateSchoolSettingsInput): Promise<IApiResponse<ISchoolSettings>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.UPDATE_SCHOOL_SETTINGS, input);
  },
  uploadLogo: (fileName: string, fileDataBase64: string): Promise<IApiResponse<ILogoUploadResult>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.UPLOAD_LOGO, { fileName, fileDataBase64 });
  },
  removeLogo: (): Promise<IApiResponse<boolean>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.REMOVE_LOGO);
  },
  getLogoPreview: (): Promise<IApiResponse<string | null>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_LOGO_PREVIEW);
  },

  // Lookups & Quick Create
  getLookups: (category: LookupCategory, includeInactive = false): Promise<IApiResponse<ILookupItem[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LOOKUPS.GET_ALL, { category, includeInactive });
  },
  searchLookups: (category: LookupCategory, query: string, includeInactive = false): Promise<IApiResponse<ILookupItem[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LOOKUPS.SEARCH, { category, query, includeInactive });
  },
  createLookup: (input: ICreateLookupInput): Promise<IApiResponse<ILookupItem>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LOOKUPS.CREATE, input);
  },
  updateLookup: (input: IUpdateLookupInput): Promise<IApiResponse<ILookupItem>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LOOKUPS.UPDATE, input);
  },
  setLookupActive: (category: LookupCategory, id: number, isActive: boolean): Promise<IApiResponse<ILookupItem>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LOOKUPS.SET_ACTIVE, { category, id, isActive });
  },
  deleteLookup: (category: LookupCategory, id: number): Promise<IApiResponse<boolean>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LOOKUPS.DELETE, { category, id });
  },
  quickCreate: (input: IQuickCreateInput): Promise<IApiResponse<ILookupItem>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LOOKUPS.QUICK_CREATE, input);
  },

  // Student Management (Stage 06)
  getStudents: (query: IStudentListQuery): Promise<IApiResponse<IPaginatedResult<IStudentListItem>>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STUDENTS.GET_ALL, query);
  },
  getStudentById: (id: number): Promise<IApiResponse<IStudentDetail | null>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STUDENTS.GET_BY_ID, { id });
  },
  registerStudent: (input: IRegisterStudentInput): Promise<IApiResponse<IStudentDetail>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STUDENTS.REGISTER, input);
  },
  updateStudent: (input: IUpdateStudentInput): Promise<IApiResponse<IStudentDetail>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STUDENTS.UPDATE, input);
  },
  deleteStudent: (id: number): Promise<IApiResponse<boolean>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STUDENTS.DELETE, { id });
  },
  addStudentNote: (studentId: number, noteText: string): Promise<IApiResponse<IStudentNote>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STUDENTS.ADD_NOTE, { studentId, noteText });
  },
  getStudentNotes: (studentId: number): Promise<IApiResponse<IStudentNote[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STUDENTS.GET_NOTES, { studentId });
  },
  deleteStudentNote: (noteId: number): Promise<IApiResponse<boolean>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STUDENTS.DELETE_NOTE, { noteId });
  },
  uploadStudentPhoto: (studentId: number, fileName: string, fileDataBase64: string): Promise<IApiResponse<string>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STUDENTS.UPLOAD_PHOTO, { studentId, fileName, fileDataBase64 });
  },
  removeStudentPhoto: (studentId: number): Promise<IApiResponse<boolean>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STUDENTS.REMOVE_PHOTO, { studentId });
  },

  // Family & Parent/Guardian Management (Stage 07)
  getFamilyMembers: (familyId: number): Promise<IApiResponse<IFamilyMember[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FAMILIES.GET_MEMBERS, { familyId });
  },
  updateFamilyMembers: (input: IUpdateFamilyMembersInput): Promise<IApiResponse<IFamilyMember[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FAMILIES.UPDATE_MEMBERS, input);
  },
  getLinkedStudentsByFamily: (familyId: number): Promise<IApiResponse<ILinkedStudent[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FAMILIES.GET_LINKED_STUDENTS, { familyId });
  },

  // Sibling Management (Stage 08)
  searchSiblingCandidates: (query: ISiblingCandidateQuery): Promise<IApiResponse<ISiblingCandidate[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FAMILIES.SEARCH_SIBLING_CANDIDATES, query);
  },
  getFamilyMergePreview: (primaryStudentId: number, siblingStudentId: number): Promise<IApiResponse<IFamilyMergePreview>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FAMILIES.GET_MERGE_PREVIEW, { primaryStudentId, siblingStudentId });
  },
  linkSiblings: (input: ILinkSiblingsInput): Promise<IApiResponse<IFamilyDetail>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FAMILIES.LINK_SIBLINGS, input);
  },
  unlinkSibling: (input: IUnlinkSiblingInput): Promise<IApiResponse<IFamilyDetail>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FAMILIES.UNLINK_SIBLING, input);
  },

  // Academic Years & Grade Promotion (Stage 09)
  getPromotionSystemStatus: (): Promise<IApiResponse<IPromotionSystemStatus>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.ACADEMIC_YEARS.GET_SYSTEM_STATUS);
  },
  getAllAcademicYears: (): Promise<IApiResponse<IAcademicYear[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.ACADEMIC_YEARS.GET_ALL_YEARS);
  },
  setActiveAcademicYear: (year: number): Promise<IApiResponse<{ activeYear: number }>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.ACADEMIC_YEARS.SET_ACTIVE_YEAR, { year });
  },
  getPromotionLogs: (): Promise<IApiResponse<IAnnualProcessingLog[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.ACADEMIC_YEARS.GET_PROMOTION_LOGS);
  },
  getGradeHistoryForYear: (year: number, limit?: number): Promise<IApiResponse<IStudentGradeHistoryRecord[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.ACADEMIC_YEARS.GET_GRADE_HISTORY, { year, limit });
  },
  processPromotion: (year: number): Promise<IApiResponse<IPromotionResult>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.ACADEMIC_YEARS.PROCESS_PROMOTION, { year });
  },
  runCatchupPromotions: (): Promise<IApiResponse<ICatchupPromotionResult>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.ACADEMIC_YEARS.RUN_CATCHUP);
  },
  retryFailedPromotion: (year: number): Promise<IApiResponse<IPromotionResult>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.ACADEMIC_YEARS.RETRY_FAILED, { year });
  },

  // Fee Configuration (Stage 10)
  getAnnualFeeByYear: (year: number): Promise<IApiResponse<IAnnualFeeSetting | null>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FEE_CONFIG.GET_BY_YEAR, { year });
  },
  getFeeConfigurations: (query?: IFeeConfigFilterQuery): Promise<IApiResponse<IPaginatedResult<IAnnualFeeSetting>>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FEE_CONFIG.GET_CONFIGURATIONS, query || {});
  },
  createAnnualFee: (input: ISetAnnualFeeInput): Promise<IApiResponse<IAnnualFeeSetting>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FEE_CONFIG.CREATE, input);
  },
  updateAnnualFee: (input: ISetAnnualFeeInput): Promise<IApiResponse<IAnnualFeeSetting>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FEE_CONFIG.UPDATE, input);
  },
  deleteAnnualFee: (year: number): Promise<IApiResponse<{ message: string }>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FEE_CONFIG.DELETE, { year });
  },
  getFeeConfigAuditLogs: (limit?: number): Promise<IApiResponse<IFeeConfigAuditLog[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FEE_CONFIG.GET_AUDIT_LOGS, { limit });
  },

  // Fee Generation & Payments (Stage 11)
  getFeeGenerationStatus: (): Promise<IApiResponse<IFeeGenerationStatus>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FEES.GET_GENERATION_STATUS);
  },
  generateAnnualFees: (year: number): Promise<IApiResponse<IFeeGenerationResult>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FEES.GENERATE_ANNUAL_FEES, { year });
  },
  retryFeeGeneration: (year: number): Promise<IApiResponse<IFeeGenerationResult>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FEES.RETRY_GENERATION, { year });
  },
  runFeeCatchup: (): Promise<IApiResponse<{ processed: boolean; message: string }>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FEES.RUN_CATCHUP);
  },
  getStudentFees: (query?: IStudentFeeFilterQuery): Promise<IApiResponse<IPaginatedResult<IStudentAnnualFeeItem>>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FEES.GET_STUDENT_FEES, query || {});
  },
  recordCashPayment: (input: IRecordPaymentInput): Promise<IApiResponse<IReceiptDetails>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FEES.RECORD_CASH_PAYMENT, input);
  },
  getReceiptDetails: (paymentIdOrReceiptNumber: number | string): Promise<IApiResponse<IReceiptDetails>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FEES.GET_RECEIPT_DETAILS, { identifier: paymentIdOrReceiptNumber });
  },
  getNewStudentFeeSetting: (): Promise<IApiResponse<boolean>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FEES.GET_NEW_STUDENT_FEE_SETTING);
  },
  setNewStudentFeeSetting: (enabled: boolean): Promise<IApiResponse<boolean>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FEES.SET_NEW_STUDENT_FEE_SETTING, { enabled });
  },

  // Reports & Student Printing (Stage 12)
  getStudentReportSummary: (filter?: IStudentReportFilter): Promise<IApiResponse<IStudentReportSummary>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.REPORTS.GET_STUDENT_REPORT_SUMMARY, filter || {});
  },
  getStudentReport: (filter?: IStudentReportFilter): Promise<IApiResponse<IPaginatedResult<IStudentReportItem>>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.REPORTS.GET_STUDENT_REPORT, filter || {});
  },
  exportStudentsCsv: (filter?: IStudentReportFilter): Promise<IApiResponse<string>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.REPORTS.EXPORT_STUDENTS_CSV, filter || {});
  },
  getFeeReportSummary: (academicYear?: number, paymentDateFrom?: string, paymentDateTo?: string): Promise<IApiResponse<IFeeReportSummary>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.REPORTS.GET_FEE_REPORT_SUMMARY, { academicYear, paymentDateFrom, paymentDateTo });
  },
  getFeeReport: (filter?: IFeeReportFilter): Promise<IApiResponse<IPaginatedResult<IFeeReportItem>>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.REPORTS.GET_FEE_REPORT, filter || {});
  },
  exportFeesCsv: (filter?: IFeeReportFilter): Promise<IApiResponse<string>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.REPORTS.EXPORT_FEES_CSV, filter || {});
  },
  getStudentPrintProfile: (studentId: number): Promise<IApiResponse<ITwoPageStudentPrintProfile>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.REPORTS.GET_STUDENT_PRINT_PROFILE, { studentId });
  }
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronApi = typeof api;

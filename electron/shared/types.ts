export interface ISystemInfo {
  appName: string;
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
  platform: string;
  databasePath: string;
}

export interface IDatabaseHealth {
  status: 'ok' | 'error' | 'degraded';
  integrity: string;
  foreignKeysOk: boolean;
  tableCount: number;
  migrationVersion: number;
  lastChecked: string;
  databaseSizeBytes: number;
}

export interface IBackupResult {
  success: boolean;
  backupPath?: string;
  bytesCopied?: number;
  error?: string;
}

export interface IApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export type UserRole = 'Admin' | 'Staff';

export interface IUserProfile {
  id: number;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IAuthSession {
  id: number;
  displayName: string;
  role: UserRole;
}

export interface ILoginResult {
  user?: IAuthSession;
  lockedUntil?: number;
  remainingSeconds?: number;
  remainingAttempts?: number;
}

export interface ICreateUserInput {
  displayName: string;
  pin: string;
  role: UserRole;
}

export interface IUpdateUserInput {
  displayName?: string;
  role?: UserRole;
}

export interface ISchoolSettings {
  id: number;
  schoolName: string;
  logoPath: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  contactNumber1: string | null;
  contactNumber2: string | null;
  email: string | null;
  website: string | null;
  regNumber: string | null;
  extraInfo: string | null;
  defaultLanguage: 'en' | 'si';
  updatedAt: string;
}

export interface IUpdateSchoolSettingsInput {
  schoolName: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  contactNumber1?: string | null;
  contactNumber2?: string | null;
  email?: string | null;
  website?: string | null;
  regNumber?: string | null;
  extraInfo?: string | null;
  defaultLanguage?: 'en' | 'si';
}

export interface ILogoUploadResult {
  logoPath: string;
  previewUrl: string; // base64 data url for renderer preview
}

export type LookupCategory = 'houses' | 'occupations' | 'streets' | 'cities' | 'transportation_methods';

export interface ILookupItem {
  id: number;
  name: string;
  isActive: boolean;
  colorHex?: string | null;      // specific to houses
  postalCode?: string | null;    // specific to cities
  createdAt: string;
  updatedAt: string;
  usageCount?: number;           // number of dependent records
}

export interface ICreateLookupInput {
  category: LookupCategory;
  name: string;
  colorHex?: string | null;
  postalCode?: string | null;
}

export interface IUpdateLookupInput {
  category: LookupCategory;
  id: number;
  name?: string;
  colorHex?: string | null;
  postalCode?: string | null;
  isActive?: boolean;
}

export interface IQuickCreateInput {
  category: LookupCategory;
  name: string;
  colorHex?: string | null;
  postalCode?: string | null;
}

export type StudentGender = 'Male' | 'Female';
export type StudentStatus = 'Active' | 'Leaved' | 'Passed Out';

export interface IRegisterStudentInput {
  admissionNumber: string;
  admissionDate: string;
  fullName: string;
  gender: StudentGender;
  dateOfBirth: string;
  currentGrade: number;
  transportationMethodId?: number | null;
  houseId?: number | null;
  previousSchoolName?: string | null;
  previousSchoolIdNumber?: string | null;
  performanceDescription?: string | null;
  houseNo?: string | null;
  streetId?: number | null;
  cityId?: number | null;
  additionalAddressDetails?: string | null;
  fullAddress?: string | null;
  photoDataBase64?: string | null;
  photoFileName?: string | null;
  initialNote?: string | null;
  familyMembers?: IFamilyMemberInput[];
  siblingOfStudentId?: number | null;
}

export interface IUpdateStudentInput {
  id: number;
  admissionDate?: string;
  fullName?: string;
  gender?: StudentGender;
  dateOfBirth?: string;
  status?: 'Active' | 'Leaved';
  statusReason?: string;
  transportationMethodId?: number | null;
  houseId?: number | null;
  previousSchoolName?: string | null;
  previousSchoolIdNumber?: string | null;
  performanceDescription?: string | null;
  houseNo?: string | null;
  streetId?: number | null;
  cityId?: number | null;
  additionalAddressDetails?: string | null;
  fullAddress?: string | null;
}

export interface IStudentListItem {
  id: number;
  admissionNumber: string;
  fullName: string;
  gender: StudentGender;
  dateOfBirth: string;
  currentGrade: number;
  status: StudentStatus;
  admissionDate: string;
  houseId?: number | null;
  houseName?: string | null;
  houseColor?: string | null;
  transportationMethodId?: number | null;
  transportationMethodName?: string | null;
  fullAddress?: string | null;
  photoPath?: string | null;
  createdAt: string;
}

export interface IStudentNote {
  id: number;
  studentId: number;
  noteText: string;
  createdBy?: number | null;
  createdByName?: string | null;
  createdByRole?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IStudentStatusHistory {
  id: number;
  studentId: number;
  fromStatus: string;
  toStatus: string;
  reason?: string | null;
  changedBy?: number | null;
  changedByName?: string | null;
  changedAt: string;
}

export interface IStudentDetail {
  id: number;
  admissionNumber: string;
  admissionDate: string;
  fullName: string;
  gender: StudentGender;
  dateOfBirth: string;
  currentGrade: number;
  status: StudentStatus;
  transportationMethodId?: number | null;
  transportationMethodName?: string | null;
  houseId?: number | null;
  houseName?: string | null;
  houseColor?: string | null;
  previousSchoolName?: string | null;
  previousSchoolIdNumber?: string | null;
  performanceDescription?: string | null;
  photoPath?: string | null;
  photoPreviewUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  familyId: number;
  familyCode: string;
  houseNo?: string | null;
  streetId?: number | null;
  streetName?: string | null;
  cityId?: number | null;
  cityName?: string | null;
  postalCode?: string | null;
  additionalAddressDetails?: string | null;
  fullAddress?: string | null;
  notes: IStudentNote[];
  statusHistory: IStudentStatusHistory[];
  familyMembers?: IFamilyMember[];
  linkedStudents?: ILinkedStudent[];
}

export type FamilyRelationshipType = 'Father' | 'Mother' | 'Guardian';

export interface IFamilyMember {
  id: number;
  familyId: number;
  relationshipType: FamilyRelationshipType;
  name: string;
  contactNumber: string;
  whatsappNumber?: string | null;
  occupationId?: number | null;
  occupationName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IFamilyMemberInput {
  relationshipType: FamilyRelationshipType;
  name: string;
  contactNumber: string;
  whatsappNumber?: string | null;
  occupationId?: number | null;
}

export interface IUpdateFamilyMembersInput {
  familyId: number;
  members: IFamilyMemberInput[];
}

export interface ILinkedStudent {
  id: number;
  admissionNumber: string;
  fullName: string;
  currentGrade: number;
  status: StudentStatus;
}

export interface IFamilyDetail {
  id: number;
  familyCode: string;
  houseNo?: string | null;
  streetId?: number | null;
  streetName?: string | null;
  cityId?: number | null;
  cityName?: string | null;
  postalCode?: string | null;
  additionalAddressDetails?: string | null;
  fullAddress?: string | null;
  members: IFamilyMember[];
  linkedStudents?: ILinkedStudent[];
}

export interface ISiblingCandidate {
  id: number;
  admissionNumber: string;
  fullName: string;
  gender: StudentGender;
  currentGrade: number;
  status: StudentStatus;
  familyId: number;
  familyCode: string;
  fullAddress?: string | null;
  fatherName?: string | null;
  motherName?: string | null;
}

export interface ISiblingCandidateQuery {
  search: string;
  excludeStudentId: number;
  limit?: number;
}

export type MergeResolutionStrategy = 'keep_destination' | 'use_source' | 'custom';

export interface ICustomMergeResolution {
  addressChoice?: 'destination' | 'source' | 'custom';
  customAddress?: {
    houseNo?: string | null;
    streetId?: number | null;
    cityId?: number | null;
    additionalAddressDetails?: string | null;
    fullAddress?: string | null;
  };
  fatherChoice?: 'destination' | 'source' | 'custom' | 'none';
  customFather?: IFamilyMemberInput | null;
  motherChoice?: 'destination' | 'source' | 'custom' | 'none';
  customMother?: IFamilyMemberInput | null;
  guardianChoice?: 'destination' | 'source' | 'custom' | 'none';
  customGuardian?: IFamilyMemberInput | null;
}

export interface IFamilyMergePreview {
  destinationStudent: { id: number; admissionNumber: string; fullName: string; grade: number };
  sourceStudent: { id: number; admissionNumber: string; fullName: string; grade: number };
  destinationFamily: IFamilyDetail;
  sourceFamily: IFamilyDetail;
  hasConflicts: boolean;
  conflicts: Array<{ field: 'address' | 'father' | 'mother' | 'guardian'; description: string }>;
  conflictSummary: {
    address: boolean;
    father: boolean;
    mother: boolean;
    guardian: boolean;
  };
  differences: {
    address?: { destination: string | null; source: string | null };
    father?: { destination: IFamilyMember | null; source: IFamilyMember | null };
    mother?: { destination: IFamilyMember | null; source: IFamilyMember | null };
    guardian?: { destination: IFamilyMember | null; source: IFamilyMember | null };
  };
  sourceStudentCount: number;
}

export interface ILinkSiblingsInput {
  primaryStudentId: number;
  siblingStudentId: number;
  resolutionStrategy?: MergeResolutionStrategy;
  customResolution?: ICustomMergeResolution;
  mergeEntireFamily?: boolean;
}

export interface IUnlinkSiblingInput {
  studentId: number;
}

export interface IStudentListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  grade?: number;
  gender?: StudentGender;
  houseId?: number;
  status?: StudentStatus;
  sortBy?: 'admissionNumber' | 'fullName' | 'grade' | 'admissionDate' | 'createdAt';
  sortOrder?: 'ASC' | 'DESC';
}

export interface IPaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type NavigationTab = 'dashboard' | 'students' | 'promotions' | 'fees' | 'reports' | 'settings';

// ==========================================
// Academic Year & Promotion Interfaces (Stage 09)
// ==========================================

export interface IAcademicYear {
  year: number;
  isActive: boolean;
  createdAt: string;
}

export type PromotionJobStatus = 'Success' | 'Failed' | 'Partial' | 'Pending';

export interface IAnnualProcessingLog {
  id: number;
  academicYear: number;
  jobType: 'GradePromotion' | 'FeeGeneration';
  status: PromotionJobStatus;
  recordsProcessed: number;
  promotedCount: number;
  passedOutCount: number;
  skippedLeavedCount: number;
  failedCount: number;
  executedAt: string;
  completedAt?: string | null;
  executedBy?: number | null;
  executedByName?: string | null;
  errorMessage?: string | null;
  details?: string | null;
}

export interface IStudentGradeHistoryRecord {
  id: number;
  studentId: number;
  admissionNumber: string;
  fullName: string;
  academicYear: number;
  previousGrade?: number | null;
  newGrade: number;
  grade?: number;
  previousStatus?: string | null;
  newStatus?: string | null;
  promotedAt: string;
  promotedBy?: number | null;
  promotedByName?: string | null;
  notes?: string | null;
}

export interface IPromotionSystemStatus {
  currentAcademicYear: number;
  isActiveYearSet: boolean;
  isPromotionPending: boolean;
  pendingYears: number[];
  lastPromotion: IAnnualProcessingLog | null;
  totalActiveStudents: number;
  totalPromotedStudents: number;
  totalPassedOutStudents: number;
  totalSkippedLeavedStudents: number;
}

export interface IPromotionResult {
  academicYear: number;
  status: PromotionJobStatus;
  recordsProcessed: number;
  promotedCount: number;
  passedOutCount: number;
  skippedLeavedCount: number;
  failedCount: number;
  errorMessage?: string | null;
  details?: string | null;
}

export interface ICatchupPromotionResult {
  yearsProcessed: IPromotionResult[];
  hasFailures: boolean;
  message: string;
}

// ==========================================
// Fee Configuration Interfaces (Stage 10)
// ==========================================

export interface IAnnualFeeSetting {
  academicYear: number;
  feeAmount: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: number | null;
  createdByName?: string | null;
  updatedBy?: number | null;
  updatedByName?: string | null;
  hasInvoices?: boolean;
  invoiceCount?: number;
}

export interface ISetAnnualFeeInput {
  academicYear: number;
  feeAmount: number;
}

export interface IFeeConfigFilterQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface IFeeConfigAuditLog {
  id: number;
  action: string;
  academicYear: number;
  oldAmount?: number | null;
  newAmount?: number | null;
  details: string;
  userId?: number | null;
  userName?: string | null;
  createdAt: string;
}

// ==========================================
// Fee Generation & Payments Interfaces (Stage 11)
// ==========================================

export type FeeStatus = 'Unpaid' | 'Paid';

export interface IStudentAnnualFeeItem {
  id: number;
  studentId: number;
  admissionNumber: string;
  fullName: string;
  currentGrade: number;
  studentStatus: StudentStatus;
  academicYear: number;
  feeAmount: number;
  status: FeeStatus;
  isFeeExempt: boolean;
  createdAt: string;
  updatedAt: string;
  // Payment info if Paid
  paymentId?: number | null;
  receiptNumber?: string | null;
  paymentDate?: string | null;
  paymentAmount?: number | null;
  recordedBy?: number | null;
  recordedByName?: string | null;
  notes?: string | null;
}

export interface IStudentFeeFilterQuery {
  page?: number;
  pageSize?: number;
  academicYear?: number;
  grade?: number;
  status?: FeeStatus;
  search?: string;
}

export interface IRecordPaymentInput {
  studentAnnualFeeId: number;
  paymentDate: string; // YYYY-MM-DD
  amount: number;
  notes?: string;
}

export interface IReceiptDetails {
  paymentId: number;
  studentAnnualFeeId: number;
  receiptNumber: string;
  paymentDate: string;
  amount: number;
  paymentMethod: 'Cash';
  recordedByName: string;
  recordedByRole: string;
  notes?: string | null;
  studentId: number;
  admissionNumber: string;
  studentName: string;
  currentGrade: number;
  academicYear: number;
  feeAmount: number;
  feeDescription: string;
  schoolSettings: ISchoolSettings;
  schoolLogoDataUrl?: string | null;
  issuedAt: string;
}

export interface IFeeGenerationResult {
  academicYear: number;
  status: 'Success' | 'Failed';
  recordsGenerated: number;
  recordsSkipped: number;
  exemptZeroFeeCount: number;
  error?: string;
  message: string;
}

export interface IFeeGenerationStatus {
  currentCalendarYear: number;
  isCurrentYearConfigured: boolean;
  currentYearConfigAmount: number | null;
  isGenerated: boolean;
  lastLog: IAnnualProcessingLog | null;
  totalActiveStudents: number;
  generatedCount: number;
  paidCount: number;
  unpaidCount: number;
  exemptCount: number;
  autoGenerateNewStudentFee: boolean;
}

// ==========================================
// Reports & Student Printing Interfaces (Stage 12)
// ==========================================

export interface IStudentReportFilter {
  page?: number;
  pageSize?: number;
  grade?: number;
  status?: StudentStatus;
  gender?: StudentGender;
  houseId?: number;
  transportationMethodId?: number;
  admissionDateFrom?: string; // YYYY-MM-DD
  admissionDateTo?: string;   // YYYY-MM-DD
  search?: string;
}

export interface IStudentReportSummary {
  totalStudents: number;
  activeCount: number;
  leavedCount: number;
  passedOutCount: number;
  maleCount: number;
  femaleCount: number;
  gradeCounts: Record<number, number>;
  houseCounts: Array<{ houseId: number | null; houseName: string; count: number; colorHex: string | null }>;
  transportationCounts: Array<{ transportationMethodId: number | null; transportationMethodName: string; count: number }>;
}

export interface IStudentReportItem {
  id: number;
  admissionNumber: string;
  fullName: string;
  gender: StudentGender;
  dateOfBirth: string;
  currentGrade: number;
  status: StudentStatus;
  admissionDate: string;
  houseName: string | null;
  houseColor: string | null;
  transportationMethodName: string | null;
  fullAddress: string | null;
  previousSchoolName: string | null;
  previousSchoolIdNumber: string | null;
}

export interface IFeeReportFilter {
  page?: number;
  pageSize?: number;
  academicYear?: number;
  grade?: number;
  status?: FeeStatus;
  isFeeExempt?: boolean;
  paymentDateFrom?: string; // YYYY-MM-DD
  paymentDateTo?: string;   // YYYY-MM-DD
  search?: string;          // student name, admission number, receipt number
}

export interface IFeeReportSummary {
  academicYear: number;
  totalInvoices: number;
  paidCount: number;
  unpaidCount: number;
  exemptCount: number;
  expectedAmountLkr: number;
  actualCollectedLkr: number;
  outstandingLkr: number;
  filteredCollectedLkr?: number | null;
  gradeBreakdown: Array<{
    grade: number;
    totalStudents: number;
    paidCount: number;
    unpaidCount: number;
    exemptCount: number;
    collectedLkr: number;
    outstandingLkr: number;
  }>;
}

export interface IFeeReportItem {
  id: number;
  studentId: number;
  admissionNumber: string;
  fullName: string;
  currentGrade: number;
  academicYear: number;
  feeAmount: number;
  status: FeeStatus;
  isFeeExempt: boolean;
  paymentId: number | null;
  receiptNumber: string | null;
  paymentDate: string | null;
  paymentAmount: number | null;
  paymentMethod: string | null;
  recordedByName: string | null;
  notes: string | null;
}

export interface IStudentFeeHistoryRecord {
  academicYear: number;
  feeAmount: number;
  status: FeeStatus;
  isFeeExempt: boolean;
  paymentDate: string | null;
  receiptNumber: string | null;
  paymentAmount: number | null;
  recordedByName: string | null;
  notes: string | null;
}

export interface ITwoPageStudentPrintProfile {
  student: IStudentDetail;
  schoolSettings: ISchoolSettings;
  schoolLogoDataUrl: string | null;
  feeHistory: IStudentFeeHistoryRecord[];
  printedAt: string;
  printedBy: string;
}



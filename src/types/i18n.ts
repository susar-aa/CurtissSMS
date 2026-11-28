export type SupportedLanguage = 'en' | 'si';

export interface ITranslationDictionary {
  // Navigation & Common
  appTitle: string;
  offlineDesktop: string;
  architectureSubtitle: string;
  dashboard: string;
  students: string;
  academicPromotions: string;
  feeManagement: string;
  reportsAndPrint: string;
  systemSettings: string;
  logout: string;
  cancel: string;
  save: string;
  saveChanges: string;
  create: string;
  edit: string;
  delete: string;
  search: string;
  filter: string;
  all: string;
  actions: string;
  status: string;
  date: string;
  notes: string;
  back: string;
  confirm: string;
  close: string;
  loading: string;
  yes: string;
  no: string;
  page: string;
  of: string;
  showing: string;
  records: string;
  reset: string;
  refresh: string;
  exportCsv: string;
  print: string;
  preview: string;
  none: string;
  active: string;
  inactive: string;
  success: string;
  error: string;
  warning: string;
  unauthorized: string;
  lkr: string;

  // Language Switcher
  language: string;
  english: string;
  sinhala: string;
  selectLanguage: string;

  // Auth & Login
  loginTitle: string;
  loginSubtitle: string;
  enterPin: string;
  loginButton: string;
  initialAdminSetup: string;
  adminName: string;
  setAdminPin: string;
  confirmAdminPin: string;
  createInitialAdmin: string;
  loginLocked: string;
  remainingAttempts: string;
  remainingSeconds: string;
  invalidPin: string;
  pinRequired: string;
  pinMustBeDigits: string;

  // Dashboard
  welcomeBack: string;
  totalStudentsEnrolled: string;
  activeEnrollment: string;
  academicYearLabel: string;
  feesCollectedYear: string;
  quickActions: string;
  registerNewStudent: string;
  collectFees: string;
  generateReports: string;
  systemDiagnostics: string;
  databaseIntegrity: string;
  applicationVersion: string;

  // Student Management
  studentDirectory: string;
  studentDirectorySubtitle: string;
  admissionNo: string;
  studentName: string;
  fullName: string;
  gender: string;
  male: string;
  female: string;
  grade: string;
  currentGrade: string;
  dateOfBirth: string;
  admissionDate: string;
  house: string;
  transportation: string;
  residentialAddress: string;
  familyCode: string;
  studentStatus: string;
  statusActive: string;
  statusLeaved: string;
  statusPassedOut: string;
  previousSchool: string;
  previousSchoolId: string;
  performanceDescription: string;
  studentPhoto: string;
  uploadPhoto: string;
  removePhoto: string;
  noPhoto: string;
  studentNotes: string;
  addNote: string;
  notePlaceholder: string;
  saveStudent: string;
  registerStudentBtn: string;
  editStudent: string;
  deleteStudent: string;
  viewStudentProfile: string;
  statusTransitionReason: string;

  // Family & Sibling
  familyDetails: string;
  father: string;
  mother: string;
  guardian: string;
  contactNumber: string;
  whatsappNumber: string;
  occupation: string;
  relationship: string;
  siblings: string;
  linkedSiblings: string;
  linkSiblingsBtn: string;
  unlinkSiblingBtn: string;
  searchSiblingCandidate: string;
  familyMergeWarning: string;
  resolveConflicts: string;

  // Academic Promotions
  promotionSystemTitle: string;
  promotionSystemSubtitle: string;
  currentAcademicYear: string;
  activeAcademicYear: string;
  setActiveYear: string;
  annualPromotionProcessing: string;
  processJan1Promotion: string;
  retryPromotion: string;
  promotionLogs: string;
  promotedStudents: string;
  passedOutStudents: string;
  skippedStudents: string;
  failedStudents: string;
  promotionStatus: string;
  eligiblePromotionNote: string;

  // Fee Management & Invoices
  feeModuleTitle: string;
  feeModuleSubtitle: string;
  annualFeeSettingsTab: string;
  feeInvoicesPaymentsTab: string;
  annualFeeAmount: string;
  configuredAmount: string;
  notConfigured: string;
  generateAnnualFees: string;
  collectCash: string;
  recordCashPayment: string;
  paymentReceipt: string;
  receiptNumber: string;
  paymentDate: string;
  paidAmount: string;
  paidStatus: string;
  unpaidStatus: string;
  feeExemptStatus: string;
  cashier: string;
  exactPaymentNotice: string;
  confirmCashReceipt: string;
  viewReceipt: string;
  reprintReceipt: string;

  // Reports
  reportsTitle: string;
  reportsSubtitle: string;
  studentReportsTab: string;
  feeReportsTab: string;
  gradeDistribution: string;
  houseRoster: string;
  transportMethods: string;
  admissionDateRange: string;
  dateFrom: string;
  dateTo: string;
  printTwoPageDossier: string;
  exportFilteredCsv: string;
  totalInvoices: string;
  paidCount: string;
  unpaidCount: string;
  exemptCount: string;
  expectedFees: string;
  actualCashCollected: string;
  outstandingBalance: string;
  gradeFeeBreakdown: string;
  paymentDateRange: string;

  // Print Profile A4 Dossier
  dossierPage1Title: string;
  dossierPage2Title: string;
  parentGuardianRecords: string;
  specialRemarksAndNotes: string;
  officialFinancialLedger: string;
  ledgerVerificationNote: string;
  totalAssessedFees: string;
  totalCashCollectedLabel: string;
  preparedByCashier: string;
  verifiedByBursar: string;
  principalRegistrar: string;
  systemGeneratedDocument: string;
  page1Of2: string;
  page2Of2: string;

  // School Settings & Profile
  schoolProfile: string;
  schoolName: string;
  schoolAddress: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  telephone1: string;
  telephone2: string;
  email: string;
  website: string;
  schoolLogo: string;
  uploadLogo: string;
  removeLogo: string;
  defaultLanguageSetting: string;
  autoGenNewStudentFeeSetting: string;
  autoGenFeeDescription: string;
  quickCreateLookups: string;
  userAccountsSecurity: string;
}

export const ENGLISH_TRANSLATIONS: ITranslationDictionary = {
  appTitle: 'CurtissSMS',
  offlineDesktop: 'Offline Desktop',
  architectureSubtitle: 'Curtiss Architecture',
  dashboard: 'Dashboard',
  students: 'Students',
  academicPromotions: 'Academic Promotions',
  feeManagement: 'Fee Management',
  reportsAndPrint: 'Reports & Print',
  systemSettings: 'System Settings',
  logout: 'Log Out',
  cancel: 'Cancel',
  save: 'Save',
  saveChanges: 'Save Changes',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  search: 'Search',
  filter: 'Filter',
  all: 'All',
  actions: 'Actions',
  status: 'Status',
  date: 'Date',
  notes: 'Notes',
  back: 'Back',
  confirm: 'Confirm',
  close: 'Close',
  loading: 'Loading...',
  yes: 'Yes',
  no: 'No',
  page: 'Page',
  of: 'of',
  showing: 'Showing',
  records: 'records',
  reset: 'Reset',
  refresh: 'Refresh',
  exportCsv: 'Export CSV',
  print: 'Print',
  preview: 'Preview',
  none: 'None',
  active: 'Active',
  inactive: 'Inactive',
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  unauthorized: 'Unauthorized',
  lkr: 'LKR',

  language: 'Language',
  english: 'English',
  sinhala: 'සිංහල',
  selectLanguage: 'Select Interface Language',

  loginTitle: 'Curtiss School Management',
  loginSubtitle: 'Enter your 4 to 8-digit security PIN to access the desktop system.',
  enterPin: 'Enter PIN',
  loginButton: 'Unlock CurtissSMS',
  initialAdminSetup: 'Initial Administrator Setup',
  adminName: 'Administrator Display Name',
  setAdminPin: 'Set Master PIN',
  confirmAdminPin: 'Confirm Master PIN',
  createInitialAdmin: 'Create Administrator Account',
  loginLocked: 'Account Locked Due to Too Many Failed Attempts',
  remainingAttempts: 'Remaining attempts:',
  remainingSeconds: 'Lockout remaining seconds:',
  invalidPin: 'Incorrect PIN. Access denied.',
  pinRequired: 'PIN is required.',
  pinMustBeDigits: 'PIN must consist of 4 to 8 numeric digits.',

  welcomeBack: 'Welcome back,',
  totalStudentsEnrolled: 'Total Enrolled Students',
  activeEnrollment: 'Active Enrollment',
  academicYearLabel: 'Academic Year',
  feesCollectedYear: 'Cash Fees Collected',
  quickActions: 'Quick Navigation Actions',
  registerNewStudent: 'Register New Student',
  collectFees: 'Collect Cash Fees',
  generateReports: 'Generate Official Reports',
  systemDiagnostics: 'System Diagnostics & Health',
  databaseIntegrity: 'Database Integrity',
  applicationVersion: 'App Version',

  studentDirectory: 'Student Directory',
  studentDirectorySubtitle: 'Enrollment, biometric demographic archives, and student dossiers',
  admissionNo: 'Admission No',
  studentName: 'Student Name',
  fullName: 'Full Name',
  gender: 'Gender',
  male: 'Male',
  female: 'Female',
  grade: 'Grade',
  currentGrade: 'Current Grade',
  dateOfBirth: 'Date of Birth',
  admissionDate: 'Admission Date',
  house: 'House',
  transportation: 'Transportation',
  residentialAddress: 'Residential Address',
  familyCode: 'Family Code',
  studentStatus: 'Student Status',
  statusActive: 'Active',
  statusLeaved: 'Leaved',
  statusPassedOut: 'Passed Out',
  previousSchool: 'Previous School',
  previousSchoolId: 'Previous School ID',
  performanceDescription: 'Performance / Conduct Remarks',
  studentPhoto: 'Student Photo',
  uploadPhoto: 'Upload Photo',
  removePhoto: 'Remove Photo',
  noPhoto: 'No Photo Available',
  studentNotes: 'Student Notes & Disciplinary History',
  addNote: 'Add Administrative Note',
  notePlaceholder: 'Type note details here...',
  saveStudent: 'Save Student Information',
  registerStudentBtn: 'Complete Registration',
  editStudent: 'Edit Student Details',
  deleteStudent: 'Delete Student',
  viewStudentProfile: 'View Full Profile',
  statusTransitionReason: 'Reason for Status Change',

  familyDetails: 'Family & Guardian Information',
  father: 'Father',
  mother: 'Mother',
  guardian: 'Guardian',
  contactNumber: 'Primary Contact No',
  whatsappNumber: 'WhatsApp No',
  occupation: 'Occupation',
  relationship: 'Relationship',
  siblings: 'Siblings',
  linkedSiblings: 'Linked Siblings in School',
  linkSiblingsBtn: 'Link Existing Sibling',
  unlinkSiblingBtn: 'Unlink Sibling',
  searchSiblingCandidate: 'Search sibling by name or admission number...',
  familyMergeWarning: 'Connecting students from different families will merge household records.',
  resolveConflicts: 'Resolve Conflicting Family Information',

  promotionSystemTitle: 'Academic Year & Grade Promotion System',
  promotionSystemSubtitle: 'Annual Grade 1–13 progression and Passed Out transition processing',
  currentAcademicYear: 'Current Academic Year',
  activeAcademicYear: 'Active Academic Year in Session',
  setActiveYear: 'Set as Active Year',
  annualPromotionProcessing: 'Annual January 1 Promotion Processing',
  processJan1Promotion: 'Process Annual Promotion Now',
  retryPromotion: 'Retry Failed Promotion',
  promotionLogs: 'Annual Promotion Execution History',
  promotedStudents: 'Students Promoted',
  passedOutStudents: 'Students Passed Out',
  skippedStudents: 'Skipped / Inactive',
  failedStudents: 'Failed Records',
  promotionStatus: 'Processing Status',
  eligiblePromotionNote: 'Active students in Grades 1–12 advance by one grade. Grade 13 students transition to Passed Out.',

  feeModuleTitle: 'School Development & Facility Fees',
  feeModuleSubtitle: 'Annual fee generation, cash payment recording, and official receipts ledger',
  annualFeeSettingsTab: 'Annual Fee Configuration',
  feeInvoicesPaymentsTab: 'Fee Invoices & Payments',
  annualFeeAmount: 'Annual Fee Amount (LKR)',
  configuredAmount: 'Configured Fee',
  notConfigured: 'Not Configured',
  generateAnnualFees: 'Generate Annual Fees',
  collectCash: 'Collect Cash',
  recordCashPayment: 'Record Cash Payment',
  paymentReceipt: 'Payment Receipt',
  receiptNumber: 'Receipt Number',
  paymentDate: 'Payment Date',
  paidAmount: 'Amount Paid (LKR)',
  paidStatus: 'Paid',
  unpaidStatus: 'Unpaid',
  feeExemptStatus: 'Fee Exempt',
  cashier: 'Cashier / Recorded By',
  exactPaymentNotice: 'Exact full cash payment is required. Partial payments and non-cash methods are prohibited.',
  confirmCashReceipt: 'Confirm Cash Receipt',
  viewReceipt: 'View Receipt',
  reprintReceipt: 'Print Receipt Copy',

  reportsTitle: 'Reports & Student Printing',
  reportsSubtitle: 'Demographic directories, Development & Facility Fee ledgers, and official 2-Page A4 student dossiers',
  studentReportsTab: 'Student Demographic Reports',
  feeReportsTab: 'Development Fee Ledgers',
  gradeDistribution: 'Grade Distribution (1–13)',
  houseRoster: 'House Roster',
  transportMethods: 'Transportation Methods',
  admissionDateRange: 'Admission Date Range',
  dateFrom: 'From',
  dateTo: 'To',
  printTwoPageDossier: 'Print 2-Page Dossier',
  exportFilteredCsv: 'Export Filtered CSV',
  totalInvoices: 'Total Invoices',
  paidCount: 'Paid Invoices',
  unpaidCount: 'Unpaid Invoices',
  exemptCount: 'Fee Exempt',
  expectedFees: 'Expected Annual Total',
  actualCashCollected: 'Actual Cash Collected',
  outstandingBalance: 'Outstanding Balance',
  gradeFeeBreakdown: 'Grade-wise Fee Breakdown',
  paymentDateRange: 'Payment Date Range',

  dossierPage1Title: 'Page 1 – Student & Family Dossier',
  dossierPage2Title: 'Page 2 – School Development & Facility Fee Register',
  parentGuardianRecords: 'Parent & Guardian Records',
  specialRemarksAndNotes: 'Special Remarks & Student Notes',
  officialFinancialLedger: 'Official Student Financial Ledger',
  ledgerVerificationNote: 'All receipts are authenticated with cryptographic database constraint enforcement. Partial payments are prohibited under school finance guidelines.',
  totalAssessedFees: 'Total Assessed Fees:',
  totalCashCollectedLabel: 'Total Cash Collected:',
  preparedByCashier: 'Prepared By (Cashier)',
  verifiedByBursar: 'Verified By (Bursar)',
  principalRegistrar: 'Principal / Registrar',
  systemGeneratedDocument: 'System Generated Document',
  page1Of2: 'Page 1 of 2',
  page2Of2: 'Page 2 of 2',

  schoolProfile: 'School Profile',
  schoolName: 'School Name',
  schoolAddress: 'School Address',
  addressLine1: 'Address Line 1',
  addressLine2: 'Address Line 2',
  city: 'City / Town',
  telephone1: 'Primary Telephone No',
  telephone2: 'Secondary Telephone No',
  email: 'School Official Email',
  website: 'School Website',
  schoolLogo: 'School Official Crest / Logo',
  uploadLogo: 'Upload Crest',
  removeLogo: 'Remove Crest',
  defaultLanguageSetting: 'Default Application Language',
  autoGenNewStudentFeeSetting: 'Auto-generate current-year fee when registering new students',
  autoGenFeeDescription: 'When enabled, saving a new student record automatically generates an annual Development & Facility Fee invoice for the current academic year if configured.',
  quickCreateLookups: 'Quick Create & Lookups',
  userAccountsSecurity: 'User Accounts & Security'
};

export const SINHALA_TRANSLATIONS: ITranslationDictionary = {
  appTitle: 'කර්ටිස් පාසල් කළමනාකරණය',
  offlineDesktop: 'නොබැඳි පරිගණක පද්ධතිය',
  architectureSubtitle: 'කර්ටිස් පද්ධති ව්‍යුහය',
  dashboard: 'ප්‍රධාන පුවරුව',
  students: 'සිසුන්',
  academicPromotions: 'ශ්‍රේණි උසස්වීම්',
  feeManagement: 'ගාස්තු කළමනාකරණය',
  reportsAndPrint: 'වාර්තා සහ මුද්‍රණය',
  systemSettings: 'පද්ධති සැකසුම්',
  logout: 'පද්ධතියෙන් ඉවත් වන්න',
  cancel: 'අවලංගු කරන්න',
  save: 'සුරකින්න',
  saveChanges: 'වෙනස්කම් සුරකින්න',
  create: 'අලුතින් එක් කරන්න',
  edit: 'සංස්කරණය',
  delete: 'මකන්න',
  search: 'සොයන්න',
  filter: 'පෙරහන',
  all: 'සියල්ල',
  actions: 'ක්‍රියාකාරකම්',
  status: 'තත්ත්වය',
  date: 'දිනය',
  notes: 'සටහන්',
  back: 'ආපසු',
  confirm: 'තහවුරු කරන්න',
  close: 'වසන්න',
  loading: 'දත්ත පූරණය වෙමින් පවතී...',
  yes: 'ඔව්',
  no: 'නැත',
  page: 'පිටුව',
  of: 'න්',
  showing: 'පෙන්වන්නේ',
  records: 'වාර්තා',
  reset: 'යථා තත්ත්වයට පත් කරන්න',
  refresh: 'නැවුම් කරන්න',
  exportCsv: 'CSV ලෙස බාගන්න',
  print: 'මුද්‍රණය කරන්න',
  preview: 'පෙරදසුන',
  none: 'නැත',
  active: 'ක්‍රියාකාරී',
  inactive: 'අක්‍රිය',
  success: 'සාර්ථකයි',
  error: 'දෝෂයකි',
  warning: 'අවවාදයයි',
  unauthorized: 'අවසර නොමැත',
  lkr: 'රු.',

  language: 'භාෂාව',
  english: 'English',
  sinhala: 'සිංහල',
  selectLanguage: 'භාවිතා කරන භාෂාව තෝරන්න',

  loginTitle: 'කර්ටිස් පාසල් තොරතුරු පද්ධතිය',
  loginSubtitle: 'පද්ධතියට පිවිසීම සඳහා ඔබගේ අංක 4–8 කින් යුත් ආරක්ෂක PIN අංකය ඇතුළත් කරන්න.',
  enterPin: 'PIN අංකය ඇතුළත් කරන්න',
  loginButton: 'පද්ධතියට ඇතුළු වන්න',
  initialAdminSetup: 'ප්‍රධාන පරිපාලක ගිණුම සකස් කිරීම',
  adminName: 'පරිපාලකගේ නම',
  setAdminPin: 'ප්‍රධාන PIN අංකය සකසන්න',
  confirmAdminPin: 'ප්‍රධාන PIN අංකය තහවුරු කරන්න',
  createInitialAdmin: 'පරිපාලක ගිණුම සාදන්න',
  loginLocked: 'වැරදි PIN අංක කිහිපයක් නිසා පද්ධතිය තාවකාලිකව අගුළු දමා ඇත',
  remainingAttempts: 'ඉතිරි උත්සාහයන්:',
  remainingSeconds: 'අගුළු හැරීමට ඉතිරි තත්පර:',
  invalidPin: 'PIN අංකය වැරදියි. ප්‍රවේශය ප්‍රතික්ෂේප විය.',
  pinRequired: 'PIN අංකය ඇතුළත් කිරීම අනිවාර්ය වේ.',
  pinMustBeDigits: 'PIN අංකය අංක 4 සිට 8 දක්වා පමණක් විය යුතුය.',

  welcomeBack: 'ආයුබෝවන්,',
  totalStudentsEnrolled: 'මුළු ලියාපදිංචි සිසුන්',
  activeEnrollment: 'දැනට ඉගෙනුම ලබන සිසුන්',
  academicYearLabel: 'අධ්‍යයන වර්ෂය',
  feesCollectedYear: 'එකතු කළ මුදල් ප්‍රමාණය',
  quickActions: 'ක්ෂණික ක්‍රියාකාරකම්',
  registerNewStudent: 'නව ශිෂ්‍යයෙකු ලියාපදිංචි කරන්න',
  collectFees: 'ගාස්තු මුදල් ලබාගන්න',
  generateReports: 'නිල වාර්තා ලබාගන්න',
  systemDiagnostics: 'පද්ධති තත්ත්වය සහ පරීක්ෂාව',
  databaseIntegrity: 'දත්ත සමුදායේ නිරවද්‍යතාව',
  applicationVersion: 'මෘදුකාංග අනුවාදය',

  studentDirectory: 'ශිෂ්‍ය නාමාවලිය',
  studentDirectorySubtitle: 'සිසුන් ලියාපදිංචිය, ජනවිකාස තොරතුරු සහ ශිෂ්‍ය ලිපිගොනු',
  admissionNo: 'ඇතුළත් වීමේ අංකය',
  studentName: 'ශිෂ්‍යයාගේ නම',
  fullName: 'සම්පූර්ණ නම',
  gender: 'ස්ත්‍රී / පුරුෂ භාවය',
  male: 'පිරිමි',
  female: 'ගැහැණු',
  grade: 'ශ්‍රේණිය',
  currentGrade: 'වත්මන් ශ්‍රේණිය',
  dateOfBirth: 'උපන් දිනය',
  admissionDate: 'පාසලට ඇතුළත් වූ දිනය',
  house: 'නිවාසය',
  transportation: 'ප්‍රවාහන ක්‍රමය',
  residentialAddress: 'ස්ථිර ලිපිනය',
  familyCode: 'පවුල් අංකය',
  studentStatus: 'ශිෂ්‍ය තත්ත්වය',
  statusActive: 'ක්‍රියාකාරී',
  statusLeaved: 'පාසලෙන් අස්වූ',
  statusPassedOut: 'විභාග අවසන් කළ',
  previousSchool: 'කලින් අධ්‍යාපනය ලැබූ පාසල',
  previousSchoolId: 'කලින් පාසලේ අංකය',
  performanceDescription: 'හැසිරීම / විශේෂ දක්ෂතා සටහන්',
  studentPhoto: 'ශිෂ්‍ය ඡායාරූපය',
  uploadPhoto: 'ඡායාරූපය ඇතුළත් කරන්න',
  removePhoto: 'ඡායාරූපය ඉවත් කරන්න',
  noPhoto: 'ඡායාරූපයක් නැත',
  studentNotes: 'ශිෂ්‍ය සටහන් සහ විනය වාර්තා',
  addNote: 'නව පරිපාලන සටහනක් එක් කරන්න',
  notePlaceholder: 'සටහන මෙහි ටයිප් කරන්න...',
  saveStudent: 'ශිෂ්‍ය තොරතුරු සුරකින්න',
  registerStudentBtn: 'ලියාපදිංචිය සම්පූර්ණ කරන්න',
  editStudent: 'ශිෂ්‍ය තොරතුරු සංස්කරණය',
  deleteStudent: 'ශිෂ්‍යයා මකා දමන්න',
  viewStudentProfile: 'සම්පූර්ණ තොරතුරු බලන්න',
  statusTransitionReason: 'තත්ත්වය වෙනස් වීමට හේතුව',

  familyDetails: 'දෙමාපිය සහ භාරකරු තොරතුරු',
  father: 'පියා',
  mother: 'මව',
  guardian: 'භාරකරු',
  contactNumber: 'දුරකථන අංකය',
  whatsappNumber: 'වට්ස්ඇප් (WhatsApp) අංකය',
  occupation: 'රැකියාව',
  relationship: 'ඥාති සම්බන්ධය',
  siblings: 'සහෝදර සහෝදරියන්',
  linkedSiblings: 'පාසලේ ඉගෙනුම ලබන සහෝදර සහෝදරියන්',
  linkSiblingsBtn: 'සහෝදරයෙකු සම්බන්ධ කරන්න',
  unlinkSiblingBtn: 'සහෝදරයා ඉවත් කරන්න',
  searchSiblingCandidate: 'නම හෝ ඇතුළත් වීමේ අංකයෙන් සොයන්න...',
  familyMergeWarning: 'විවිධ පවුල්වල සිසුන් සම්බන්ධ කිරීමෙන් පවුල් දත්ත ඒකාබද්ධ වේ.',
  resolveConflicts: 'පවුල් තොරතුරු වල පරස්පරතා විසඳන්න',

  promotionSystemTitle: 'අධ්‍යයන වර්ෂය සහ ශ්‍රේණි උසස් කිරීම් පද්ධතිය',
  promotionSystemSubtitle: 'වාර්ෂික 1–13 ශ්‍රේණි උසස් කිරීම සහ පාසලෙන් පිටවීම් සැකසීම',
  currentAcademicYear: 'වත්මන් අධ්‍යයන වර්ෂය',
  activeAcademicYear: 'ක්‍රියාකාරී අධ්‍යයන වර්ෂය',
  setActiveYear: 'ක්‍රියාකාරී වර්ෂය ලෙස සකසන්න',
  annualPromotionProcessing: 'වාර්ෂික ජනවාරි 1 උසස්වීම් ක්‍රියාවලිය',
  processJan1Promotion: 'වාර්ෂික උසස්වීම් දැන් ක්‍රියාත්මක කරන්න',
  retryPromotion: 'අසාර්ථක වූ උසස්වීම් නැවත ක්‍රියාත්මක කරන්න',
  promotionLogs: 'වාර්ෂික උසස්වීම් ඉතිහාසය',
  promotedStudents: 'උසස් වූ සිසුන්',
  passedOutStudents: 'පාසලෙන් පිටවූ සිසුන්',
  skippedStudents: 'මඟහැරුණු / අක්‍රිය සිසුන්',
  failedStudents: 'අසාර්ථක වූ වාර්තා',
  promotionStatus: 'ක්‍රියාකාරී තත්ත්වය',
  eligiblePromotionNote: '1–12 ශ්‍රේණිවල ක්‍රියාකාරී සිසුන් ඊළඟ ශ්‍රේණියට උසස් වේ. 13 ශ්‍රේණියේ සිසුන් පාසලෙන් පිටවූවන් බවට පත්වේ.',

  feeModuleTitle: 'පාසල් සංවර්ධන හා පහසුකම් ගාස්තු',
  feeModuleSubtitle: 'වාර්ෂික ගාස්තු නියම කිරීම, මුදල් ලබාගැනීම සහ නිල රිසිට්පත් ලේඛනය',
  annualFeeSettingsTab: 'වාර්ෂික ගාස්තු සැකසුම',
  feeInvoicesPaymentsTab: 'ගාස්තු සහ මුදල් ගෙවීම්',
  annualFeeAmount: 'වාර්ෂික ගාස්තු ප්‍රමාණය (රු.)',
  configuredAmount: 'නියමිත ගාස්තුව',
  notConfigured: 'නියම කර නැත',
  generateAnnualFees: 'වාර්ෂික ගාස්තු පත්‍ර සාදන්න',
  collectCash: 'මුදල් ලබාගන්න',
  recordCashPayment: 'මුදල් ගෙවීම සටහන් කරන්න',
  paymentReceipt: 'ගෙවීම් රිසිට්පත',
  receiptNumber: 'රිසිට්පත් අංකය',
  paymentDate: 'ගෙවූ දිනය',
  paidAmount: 'ගෙවූ මුදල (රු.)',
  paidStatus: 'ගෙවා ඇත',
  unpaidStatus: 'ගෙවා නැත',
  feeExemptStatus: 'ගාස්තු නිදහස්',
  cashier: 'මුදල් භාරකරු',
  exactPaymentNotice: 'සම්පූර්ණ මුදල අත්පිට මුදලින් පමණක් ලබාගත යුතුය. කොටස් වශයෙන් ගෙවීම් කළ නොහැක.',
  confirmCashReceipt: 'මුදල් ලැබීම තහවුරු කරන්න',
  viewReceipt: 'රිසිට්පත බලන්න',
  reprintReceipt: 'රිසිට්පත් පිටපතක් මුද්‍රණය කරන්න',

  reportsTitle: 'වාර්තා සහ ශිෂ්‍ය තොරතුරු මුද්‍රණය',
  reportsSubtitle: 'ජනවිකාස නාමාවලි, සංවර්ධන ගාස්තු වාර්තා සහ පිටු 2 ක නිල A4 ශිෂ්‍ය ලේඛන',
  studentReportsTab: 'ශිෂ්‍ය ජනවිකාස වාර්තා',
  feeReportsTab: 'සංවර්ධන ගාස්තු වාර්තා',
  gradeDistribution: 'ශ්‍රේණි බෙදීයාම (1–13)',
  houseRoster: 'නිවාස බෙදීයාම',
  transportMethods: 'ප්‍රවාහන ක්‍රම',
  admissionDateRange: 'ඇතුළත් වූ දින වකවානුව',
  dateFrom: 'සිට',
  dateTo: 'දක්වා',
  printTwoPageDossier: 'පිටු 2 ක ලේඛනය මුද්‍රණය කරන්න',
  exportFilteredCsv: 'පෙරහන් කළ දත්ත CSV ලෙස බාගන්න',
  totalInvoices: 'මුළු ගාස්තු පත්‍ර',
  paidCount: 'ගෙවූ ගණන',
  unpaidCount: 'නොගෙවූ ගණන',
  exemptCount: 'නිදහස් කළ ගණන',
  expectedFees: 'බලාපොරොත්තු වන මුළු මුදල',
  actualCashCollected: 'ලැබුණු මුළු මුදල',
  outstandingBalance: 'අයවිය යුතු ශේෂය',
  gradeFeeBreakdown: 'ශ්‍රේණි අනුව ගාස්තු විස්තරය',
  paymentDateRange: 'ගෙවූ දින වකවානුව',

  dossierPage1Title: 'පිටුව 1 – ශිෂ්‍ය හා පවුල් තොරතුරු ලේඛනය',
  dossierPage2Title: 'පිටුව 2 – පාසල් සංවර්ධන හා පහසුකම් ගාස්තු ලේඛනය',
  parentGuardianRecords: 'දෙමාපිය හා භාරකරු තොරතුරු',
  specialRemarksAndNotes: 'විශේෂ සටහන් හා නිරීක්ෂණ',
  officialFinancialLedger: 'නිල ශිෂ්‍ය මූල්‍ය ලේඛනය',
  ledgerVerificationNote: 'සියලුම රිසිට්පත් දත්ත සමුදාය මඟින් ආරක්ෂිතව තහවුරු කර ඇත. පාසල් මූල්‍ය රීති අනුව කොටස් වශයෙන් ගෙවීම් වලංගු නොවේ.',
  totalAssessedFees: 'නියම කළ මුළු ගාස්තුව:',
  totalCashCollectedLabel: 'ලැබුණු මුළු මුදල:',
  preparedByCashier: 'සකස් කළේ (මුදල් භාරකරු)',
  verifiedByBursar: 'පරීක්ෂා කළේ (ලේඛකාධිකාරී)',
  principalRegistrar: 'විදුහල්පති / ලේඛකාධිකාරී',
  systemGeneratedDocument: 'පරිගණක පද්ධතියෙන් නිකුත් කරන ලද නිල ලේඛනයකි',
  page1Of2: 'පිටුව 1 / 2',
  page2Of2: 'පිටුව 2 / 2',

  schoolProfile: 'පාසල් තොරතුරු',
  schoolName: 'පාසලේ නම',
  schoolAddress: 'පාසලේ ලිපිනය',
  addressLine1: 'ලිපිනය - පේළිය 1',
  addressLine2: 'ලිපිනය - පේළිය 2',
  city: 'නගරය',
  telephone1: 'ප්‍රධාන දුරකථන අංකය',
  telephone2: 'අතිරේක දුරකථන අංකය',
  email: 'පාසලේ නිල විද්‍යුත් තැපෑල',
  website: 'පාසලේ වෙබ් අඩවිය',
  schoolLogo: 'පාසල් ලාංඡනය',
  uploadLogo: 'ලාංඡනය ඇතුළත් කරන්න',
  removeLogo: 'ලාංඡනය ඉවත් කරන්න',
  defaultLanguageSetting: 'මෘදුකාංගයේ පෙරනිමි භාෂාව',
  autoGenNewStudentFeeSetting: 'නව සිසුන් ලියාපදිංචි කිරීමේදී වත්මන් වර්ෂයේ ගාස්තුව ස්වයංක්‍රීයව එක් කරන්න',
  autoGenFeeDescription: 'මෙය සක්‍රිය කළ විට, නව ශිෂ්‍යයෙකු ලියාපදිංචි කිරීමේදී වත්මන් අධ්‍යයන වර්ෂය සඳහා වාර්ෂික සංවර්ධන ගාස්තු පත්‍රයක් ස්වයංක්‍රීයව නිර්මාණය වේ.',
  quickCreateLookups: 'ක්ෂණික තේරීම් කළමනාකරණය',
  userAccountsSecurity: 'පරිශීලක ගිණුම් සහ ආරක්ෂාව'
};

export const TRANSLATIONS: Record<SupportedLanguage, ITranslationDictionary> = {
  en: ENGLISH_TRANSLATIONS,
  si: SINHALA_TRANSLATIONS
};

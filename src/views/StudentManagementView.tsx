import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  GraduationCap,
  Search,
  Plus,
  Filter,
  User,
  Calendar,
  MapPin,
  Car,
  Home,
  FileText,
  Clock,
  ArrowLeft,
  Edit2,
  Trash2,
  Upload,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Shield,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Users,
  Phone,
  PhoneCall,
  Link2,
  Unlink,
  UserCheck
} from 'lucide-react';
import { Card, Badge } from '../components/Card';
import { QuickCreateCombobox, IComboboxItem } from '../components/QuickCreateCombobox';
import {
  IAuthSession,
  IStudentListItem,
  IStudentDetail,
  IStudentNote,
  IStudentListQuery,
  IPaginatedResult,
  IRegisterStudentInput,
  IUpdateStudentInput,
  ILookupItem,
  LookupCategory,
  StudentGender,
  StudentStatus,
  IFamilyMember,
  IFamilyMemberInput,
  IUpdateFamilyMembersInput,
  ILinkedStudent,
  ISiblingCandidate,
  ISiblingCandidateQuery,
  ILinkSiblingsInput,
  IUnlinkSiblingInput,
  IFamilyDetail,
  MergeResolutionStrategy,
  ICustomMergeResolution,
  IFamilyMergePreview
} from '../../electron/shared/types';

interface StudentManagementViewProps {
  currentUser: IAuthSession | null;
}

const GRADE_ITEMS: IComboboxItem[] = Array.from({ length: 13 }, (_, i) => ({
  id: i + 1,
  name: `Grade ${i + 1}`,
  isActive: true
}));

const GENDER_ITEMS: IComboboxItem[] = [
  { id: 'Male', name: 'Male', isActive: true },
  { id: 'Female', name: 'Female', isActive: true }
];

const STATUS_ITEMS: IComboboxItem[] = [
  { id: 'Active', name: 'Active', isActive: true },
  { id: 'Leaved', name: 'Leaved', isActive: true }
];

const REG_FIELDS_ORDER = [
  'reg-field-admissionNumber',
  'reg-field-admissionDate',
  'reg-field-currentGrade',
  'reg-field-houseId',
  'reg-field-transportationMethodId',
  'reg-field-fullName',
  'reg-field-gender',
  'reg-field-dateOfBirth',
  'reg-field-houseNo',
  'reg-field-streetId',
  'reg-field-cityId',
  'reg-field-additionalAddressDetails',
  'reg-field-fullAddress',
  'reg-field-previousSchoolName',
  'reg-field-previousSchoolIdNumber',
  'reg-field-performanceDescription',
  'reg-field-initialNote',
  'reg-field-submit'
];

const EDIT_FIELDS_ORDER = [
  'edit-field-fullName',
  'edit-field-gender',
  'edit-field-dateOfBirth',
  'edit-field-admissionDate',
  'edit-field-status',
  'edit-field-statusReason',
  'edit-field-houseId',
  'edit-field-transportationMethodId',
  'edit-field-houseNo',
  'edit-field-streetId',
  'edit-field-cityId',
  'edit-field-additionalAddressDetails',
  'edit-field-fullAddress',
  'edit-field-submit'
];

const focusField = (fieldId: string) => {
  setTimeout(() => {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.select?.();
    }
  }, 35);
};

const focusNextRegField = (currentFieldId: string) => {
  const idx = REG_FIELDS_ORDER.indexOf(currentFieldId);
  if (idx >= 0 && idx < REG_FIELDS_ORDER.length - 1) {
    focusField(REG_FIELDS_ORDER[idx + 1]);
  }
};

const focusNextEditField = (currentFieldId: string) => {
  const idx = EDIT_FIELDS_ORDER.indexOf(currentFieldId);
  if (idx >= 0 && idx < EDIT_FIELDS_ORDER.length - 1) {
    const nextId = EDIT_FIELDS_ORDER[idx + 1];
    const el = document.getElementById(nextId);
    if (!el && nextId === 'edit-field-statusReason') {
      focusField('edit-field-houseId');
    } else {
      focusField(nextId);
    }
  }
};

export const StudentManagementView: React.FC<StudentManagementViewProps> = ({ currentUser }) => {
  // Navigation mode: 'list' | 'register' | 'profile' | 'edit'
  const [viewMode, setViewMode] = useState<'list' | 'register' | 'profile' | 'edit'>('list');
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [studentDetail, setStudentDetail] = useState<IStudentDetail | null>(null);

  // Listing state
  const [students, setStudents] = useState<IStudentListItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(15);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterGrade, setFilterGrade] = useState<string>('');
  const [filterGender, setFilterGender] = useState<string>('');
  const [filterHouseId, setFilterHouseId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Lookups state for dropdowns
  const [houses, setHouses] = useState<ILookupItem[]>([]);
  const [transportMethods, setTransportMethods] = useState<ILookupItem[]>([]);
  const [streets, setStreets] = useState<ILookupItem[]>([]);
  const [cities, setCities] = useState<ILookupItem[]>([]);
  const [occupations, setOccupations] = useState<ILookupItem[]>([]);

  // Alert message
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Note state in profile
  const [newNoteText, setNewNoteText] = useState<string>('');
  const [isAddingNote, setIsAddingNote] = useState<boolean>(false);

  // Parent & Guardian Registration Form State
  interface IParentMemberForm {
    enabled: boolean;
    name: string;
    contactNumber: string;
    whatsappNumber: string;
    occupationId: number | null;
  }
  const defaultParentsState: {
    father: IParentMemberForm;
    mother: IParentMemberForm;
    guardian: IParentMemberForm;
  } = {
    father: { enabled: true, name: '', contactNumber: '', whatsappNumber: '', occupationId: null },
    mother: { enabled: false, name: '', contactNumber: '', whatsappNumber: '', occupationId: null },
    guardian: { enabled: false, name: '', contactNumber: '', whatsappNumber: '', occupationId: null }
  };
  const [regParents, setRegParents] = useState(defaultParentsState);

  // Manage Parents Modal State
  const [isManagingParents, setIsManagingParents] = useState<boolean>(false);
  const [editParents, setEditParents] = useState(defaultParentsState);
  const [isSubmittingParents, setIsSubmittingParents] = useState<boolean>(false);

  // Sibling Shortcut in Registration (Stage 08)
  const [selectedRegSibling, setSelectedRegSibling] = useState<ISiblingCandidate | null>(null);
  const [isRegSiblingModalOpen, setIsRegSiblingModalOpen] = useState<boolean>(false);
  const [regSiblingSearchTerm, setRegSiblingSearchTerm] = useState<string>('');
  const [regSiblingCandidates, setRegSiblingCandidates] = useState<ISiblingCandidate[]>([]);
  const [isSearchingRegSiblings, setIsSearchingRegSiblings] = useState<boolean>(false);

  // Sibling Linking in Profile View (Stage 08)
  const [isLinkSiblingModalOpen, setIsLinkSiblingModalOpen] = useState<boolean>(false);
  const [linkSiblingSearchTerm, setLinkSiblingSearchTerm] = useState<string>('');
  const [linkSiblingCandidates, setLinkSiblingCandidates] = useState<ISiblingCandidate[]>([]);
  const [selectedCandidateToLink, setSelectedCandidateToLink] = useState<ISiblingCandidate | null>(null);
  const [isSearchingLinkSiblings, setIsSearchingLinkSiblings] = useState<boolean>(false);
  const [isSubmittingLinkSibling, setIsSubmittingLinkSibling] = useState<boolean>(false);
  const [mergePreview, setMergePreview] = useState<IFamilyMergePreview | null>(null);
  const [isLoadingMergePreview, setIsLoadingMergePreview] = useState<boolean>(false);
  const [resolutionStrategy, setResolutionStrategy] = useState<MergeResolutionStrategy>('keep_destination');
  const [customResolution, setCustomResolution] = useState<ICustomMergeResolution>({
    addressChoice: 'destination',
    fatherChoice: 'destination',
    motherChoice: 'destination',
    guardianChoice: 'destination'
  });

  // Registration Form State
  const initialRegForm: IRegisterStudentInput = {
    admissionNumber: '',
    admissionDate: new Date().toISOString().slice(0, 10),
    fullName: '',
    gender: 'Male',
    dateOfBirth: '',
    currentGrade: 1,
    transportationMethodId: null,
    houseId: null,
    previousSchoolName: '',
    previousSchoolIdNumber: '',
    performanceDescription: '',
    houseNo: '',
    streetId: null,
    cityId: null,
    additionalAddressDetails: '',
    fullAddress: '',
    photoDataBase64: null,
    photoFileName: null,
    initialNote: ''
  };
  const [regForm, setRegForm] = useState<IRegisterStudentInput>(initialRegForm);
  const [regPhotoPreview, setRegPhotoPreview] = useState<string | null>(null);
  const [isRegAddressManual, setIsRegAddressManual] = useState<boolean>(false);
  const [isSubmittingReg, setIsSubmittingReg] = useState<boolean>(false);

  // Edit Form State
  const [editForm, setEditForm] = useState<IUpdateStudentInput>({ id: 0 });
  const [editStatusReason, setEditStatusReason] = useState<string>('');
  const [isEditAddressManual, setIsEditAddressManual] = useState<boolean>(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);

  // File input ref for photos
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Load all lookups
  const loadLookups = useCallback(async () => {
    if (!window.api) return;
    try {
      const [hRes, tmRes, stRes, ctRes, occRes] = await Promise.all([
        window.api.getLookups('houses', false),
        window.api.getLookups('transportation_methods', false),
        window.api.getLookups('streets', false),
        window.api.getLookups('cities', false),
        window.api.getLookups('occupations', false),
      ]);
      if (hRes.success && hRes.data) setHouses(hRes.data);
      if (tmRes.success && tmRes.data) setTransportMethods(tmRes.data);
      if (stRes.success && stRes.data) setStreets(stRes.data);
      if (ctRes.success && ctRes.data) setCities(ctRes.data);
      if (occRes.success && occRes.data) setOccupations(occRes.data);
    } catch (err) {
      console.error('Failed to load lookups:', err);
    }
  }, []);

  // Fetch paginated students
  const fetchStudents = useCallback(async () => {
    if (!window.api) return;
    setIsLoading(true);
    try {
      const query: IStudentListQuery = {
        page,
        pageSize,
        search: searchQuery.trim() || undefined,
        grade: filterGrade ? Number(filterGrade) : undefined,
        gender: filterGender ? (filterGender as StudentGender) : undefined,
        houseId: filterHouseId ? Number(filterHouseId) : undefined,
        status: filterStatus ? (filterStatus as StudentStatus) : undefined
      };
      const res = await window.api.getStudents(query);
      if (res.success && res.data) {
        setStudents(res.data.items);
        setTotalCount(res.data.total);
        setTotalPages(res.data.totalPages);
      } else {
        setErrorMsg(res.error || 'Failed to fetch students.');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, searchQuery, filterGrade, filterGender, filterHouseId, filterStatus]);

  // Fetch full student profile
  const fetchStudentProfile = useCallback(async (id: number) => {
    if (!window.api) return;
    setIsLoading(true);
    try {
      const res = await window.api.getStudentById(id);
      if (res.success && res.data) {
        setStudentDetail(res.data);
      } else {
        setErrorMsg(res.error || 'Student not found.');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    if (viewMode === 'list') {
      fetchStudents();
    }
  }, [viewMode, fetchStudents]);

  useEffect(() => {
    if (viewMode === 'profile' && selectedStudentId) {
      fetchStudentProfile(selectedStudentId);
    }
  }, [viewMode, selectedStudentId, fetchStudentProfile]);

  // Automatically focus first field when entering register or edit mode
  useEffect(() => {
    if (viewMode === 'register') {
      focusField('reg-field-admissionNumber');
    } else if (viewMode === 'edit') {
      focusField('edit-field-fullName');
    }
  }, [viewMode]);

  // Dismiss alerts automatically
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  // Auto-compose address for registration
  useEffect(() => {
    if (isRegAddressManual) return;
    const houseNo = regForm.houseNo?.trim() || '';
    const streetObj = streets.find(s => s.id === regForm.streetId);
    const streetName = streetObj ? streetObj.name : '';
    const details = regForm.additionalAddressDetails?.trim() || '';
    const cityObj = cities.find(c => c.id === regForm.cityId);
    const cityName = cityObj ? cityObj.name : '';

    const composed = [houseNo, streetName, details, cityName].filter(Boolean).join(', ');
    setRegForm(prev => ({ ...prev, fullAddress: composed }));
  }, [regForm.houseNo, regForm.streetId, regForm.additionalAddressDetails, regForm.cityId, streets, cities, isRegAddressManual]);

  // Handle Photo selection for registration form
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('Selected image exceeds the 2 MB maximum size limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setRegPhotoPreview(base64);
      setRegForm(prev => ({
        ...prev,
        photoDataBase64: base64,
        photoFileName: file.name
      }));
    };
    reader.readAsDataURL(file);
  };

  // Phone number validator helper
  const isValidSlPhone = (phone: string): boolean => {
    const cleaned = phone.replace(/[\s\-\.\(\)]/g, '');
    return /^0\d{9}$/.test(cleaned);
  };

  // Submit Registration
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.api) return;

    // Validate Parent & Guardian information
    const familyMembers: IFamilyMemberInput[] = [];
    if (regParents.father.enabled) {
      const fName = regParents.father.name.trim();
      if (!fName || fName.length < 2) {
        setErrorMsg("Father's full name must be at least 2 characters.");
        return;
      }
      if (!isValidSlPhone(regParents.father.contactNumber)) {
        setErrorMsg("Father's contact number must be a valid 10-digit Sri Lankan number starting with 0 (e.g. 0771234567).");
        return;
      }
      if (regParents.father.whatsappNumber && !isValidSlPhone(regParents.father.whatsappNumber)) {
        setErrorMsg("Father's WhatsApp number must be a valid 10-digit Sri Lankan number starting with 0.");
        return;
      }
      familyMembers.push({
        relationshipType: 'Father',
        name: fName,
        contactNumber: regParents.father.contactNumber.replace(/[\s\-\.\(\)]/g, ''),
        whatsappNumber: regParents.father.whatsappNumber ? regParents.father.whatsappNumber.replace(/[\s\-\.\(\)]/g, '') : null,
        occupationId: regParents.father.occupationId
      });
    }

    if (regParents.mother.enabled) {
      const mName = regParents.mother.name.trim();
      if (!mName || mName.length < 2) {
        setErrorMsg("Mother's full name must be at least 2 characters.");
        return;
      }
      if (!isValidSlPhone(regParents.mother.contactNumber)) {
        setErrorMsg("Mother's contact number must be a valid 10-digit Sri Lankan number starting with 0 (e.g. 0771234567).");
        return;
      }
      if (regParents.mother.whatsappNumber && !isValidSlPhone(regParents.mother.whatsappNumber)) {
        setErrorMsg("Mother's WhatsApp number must be a valid 10-digit Sri Lankan number starting with 0.");
        return;
      }
      familyMembers.push({
        relationshipType: 'Mother',
        name: mName,
        contactNumber: regParents.mother.contactNumber.replace(/[\s\-\.\(\)]/g, ''),
        whatsappNumber: regParents.mother.whatsappNumber ? regParents.mother.whatsappNumber.replace(/[\s\-\.\(\)]/g, '') : null,
        occupationId: regParents.mother.occupationId
      });
    }

    if (regParents.guardian.enabled) {
      const gName = regParents.guardian.name.trim();
      if (!gName || gName.length < 2) {
        setErrorMsg("Guardian's full name must be at least 2 characters.");
        return;
      }
      if (!isValidSlPhone(regParents.guardian.contactNumber)) {
        setErrorMsg("Guardian's contact number must be a valid 10-digit Sri Lankan number starting with 0 (e.g. 0771234567).");
        return;
      }
      if (regParents.guardian.whatsappNumber && !isValidSlPhone(regParents.guardian.whatsappNumber)) {
        setErrorMsg("Guardian's WhatsApp number must be a valid 10-digit Sri Lankan number starting with 0.");
        return;
      }
      familyMembers.push({
        relationshipType: 'Guardian',
        name: gName,
        contactNumber: regParents.guardian.contactNumber.replace(/[\s\-\.\(\)]/g, ''),
        whatsappNumber: regParents.guardian.whatsappNumber ? regParents.guardian.whatsappNumber.replace(/[\s\-\.\(\)]/g, '') : null,
        occupationId: regParents.guardian.occupationId
      });
    }

    // Must have at least 1 Father or Mother
    const hasParent = regParents.father.enabled || regParents.mother.enabled;
    if (!hasParent) {
      setErrorMsg("A family must have at least one parent (Father or Mother). A Guardian cannot be the sole relationship.");
      return;
    }

    setIsSubmittingReg(true);
    setErrorMsg(null);
    try {
      const payload: IRegisterStudentInput = {
        ...regForm,
        familyMembers
      };
      const res = await window.api.registerStudent(payload);
      if (res.success && res.data) {
        setSuccessMsg(`Student "${res.data.fullName}" (${res.data.admissionNumber}) registered successfully.`);
        setRegForm(initialRegForm);
        setRegParents(defaultParentsState);
        setRegPhotoPreview(null);
        setSelectedStudentId(res.data.id);
        setViewMode('profile');
      } else {
        setErrorMsg(res.error || 'Failed to register student.');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsSubmittingReg(false);
    }
  };

  // Open Manage Parents Modal
  const handleOpenManageParents = () => {
    if (!studentDetail) return;
    const existing = studentDetail.familyMembers || [];
    const father = existing.find(m => m.relationshipType === 'Father');
    const mother = existing.find(m => m.relationshipType === 'Mother');
    const guardian = existing.find(m => m.relationshipType === 'Guardian');

    setEditParents({
      father: father ? {
        enabled: true,
        name: father.name,
        contactNumber: father.contactNumber,
        whatsappNumber: father.whatsappNumber || '',
        occupationId: father.occupationId
      } : { enabled: false, name: '', contactNumber: '', whatsappNumber: '', occupationId: null },
      mother: mother ? {
        enabled: true,
        name: mother.name,
        contactNumber: mother.contactNumber,
        whatsappNumber: mother.whatsappNumber || '',
        occupationId: mother.occupationId
      } : { enabled: false, name: '', contactNumber: '', whatsappNumber: '', occupationId: null },
      guardian: guardian ? {
        enabled: true,
        name: guardian.name,
        contactNumber: guardian.contactNumber,
        whatsappNumber: guardian.whatsappNumber || '',
        occupationId: guardian.occupationId
      } : { enabled: false, name: '', contactNumber: '', whatsappNumber: '', occupationId: null },
    });
    setIsManagingParents(true);
  };

  // Save Manage Parents
  const handleSaveManageParents = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.api || !studentDetail) return;

    const members: IFamilyMemberInput[] = [];
    if (editParents.father.enabled) {
      const name = editParents.father.name.trim();
      if (!name || name.length < 2) {
        setErrorMsg("Father's full name must be at least 2 characters.");
        return;
      }
      if (!isValidSlPhone(editParents.father.contactNumber)) {
        setErrorMsg("Father's contact number must be a valid 10-digit Sri Lankan number starting with 0.");
        return;
      }
      if (editParents.father.whatsappNumber && !isValidSlPhone(editParents.father.whatsappNumber)) {
        setErrorMsg("Father's WhatsApp number must be a valid 10-digit Sri Lankan number starting with 0.");
        return;
      }
      members.push({
        relationshipType: 'Father',
        name,
        contactNumber: editParents.father.contactNumber.replace(/[\s\-\.\(\)]/g, ''),
        whatsappNumber: editParents.father.whatsappNumber ? editParents.father.whatsappNumber.replace(/[\s\-\.\(\)]/g, '') : null,
        occupationId: editParents.father.occupationId
      });
    }

    if (editParents.mother.enabled) {
      const name = editParents.mother.name.trim();
      if (!name || name.length < 2) {
        setErrorMsg("Mother's full name must be at least 2 characters.");
        return;
      }
      if (!isValidSlPhone(editParents.mother.contactNumber)) {
        setErrorMsg("Mother's contact number must be a valid 10-digit Sri Lankan number starting with 0.");
        return;
      }
      if (editParents.mother.whatsappNumber && !isValidSlPhone(editParents.mother.whatsappNumber)) {
        setErrorMsg("Mother's WhatsApp number must be a valid 10-digit Sri Lankan number starting with 0.");
        return;
      }
      members.push({
        relationshipType: 'Mother',
        name,
        contactNumber: editParents.mother.contactNumber.replace(/[\s\-\.\(\)]/g, ''),
        whatsappNumber: editParents.mother.whatsappNumber ? editParents.mother.whatsappNumber.replace(/[\s\-\.\(\)]/g, '') : null,
        occupationId: editParents.mother.occupationId
      });
    }

    if (editParents.guardian.enabled) {
      const name = editParents.guardian.name.trim();
      if (!name || name.length < 2) {
        setErrorMsg("Guardian's full name must be at least 2 characters.");
        return;
      }
      if (!isValidSlPhone(editParents.guardian.contactNumber)) {
        setErrorMsg("Guardian's contact number must be a valid 10-digit Sri Lankan number starting with 0.");
        return;
      }
      if (editParents.guardian.whatsappNumber && !isValidSlPhone(editParents.guardian.whatsappNumber)) {
        setErrorMsg("Guardian's WhatsApp number must be a valid 10-digit Sri Lankan number starting with 0.");
        return;
      }
      members.push({
        relationshipType: 'Guardian',
        name,
        contactNumber: editParents.guardian.contactNumber.replace(/[\s\-\.\(\)]/g, ''),
        whatsappNumber: editParents.guardian.whatsappNumber ? editParents.guardian.whatsappNumber.replace(/[\s\-\.\(\)]/g, '') : null,
        occupationId: editParents.guardian.occupationId
      });
    }

    if (!editParents.father.enabled && !editParents.mother.enabled) {
      setErrorMsg("A family must have at least one parent (Father or Mother). A Guardian cannot be the sole relationship.");
      return;
    }

    setIsSubmittingParents(true);
    setErrorMsg(null);
    try {
      const res = await window.api.updateFamilyMembers({
        familyId: studentDetail.familyId,
        members
      });
      if (res.success) {
        setSuccessMsg("Family parent & guardian information updated successfully.");
        setIsManagingParents(false);
        await fetchStudentProfile(studentDetail.id);
      } else {
        setErrorMsg(res.error || "Failed to update parent & guardian information.");
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsSubmittingParents(false);
    }
  };

  // Search candidates for registration sibling shortcut (Stage 08)
  const handleSearchRegSiblings = async (term: string) => {
    setRegSiblingSearchTerm(term);
    if (!term.trim() || !window.api) {
      setRegSiblingCandidates([]);
      return;
    }
    setIsSearchingRegSiblings(true);
    try {
      const res = await window.api.searchSiblingCandidates({ search: term.trim(), excludeStudentId: 0, limit: 15 });
      if (res.success && res.data) {
        setRegSiblingCandidates(res.data);
      }
    } catch {
      setRegSiblingCandidates([]);
    } finally {
      setIsSearchingRegSiblings(false);
    }
  };

  // Select sibling in registration form
  const handleSelectRegSibling = async (candidate: ISiblingCandidate) => {
    if (!window.api) return;
    try {
      const membersRes = await window.api.getFamilyMembers(candidate.familyId);

      setSelectedRegSibling(candidate);
      setRegForm(p => ({
        ...p,
        siblingOfStudentId: candidate.id,
        fullAddress: candidate.fullAddress || p.fullAddress
      }));

      if (membersRes.success && membersRes.data) {
        const father = membersRes.data.find(m => m.relationshipType === 'Father');
        const mother = membersRes.data.find(m => m.relationshipType === 'Mother');
        const guardian = membersRes.data.find(m => m.relationshipType === 'Guardian');
        setRegParents({
          father: father ? { enabled: true, name: father.name, contactNumber: father.contactNumber, whatsappNumber: father.whatsappNumber || '', occupationId: father.occupationId } : { enabled: false, name: '', contactNumber: '', whatsappNumber: '', occupationId: null },
          mother: mother ? { enabled: true, name: mother.name, contactNumber: mother.contactNumber, whatsappNumber: mother.whatsappNumber || '', occupationId: mother.occupationId } : { enabled: false, name: '', contactNumber: '', whatsappNumber: '', occupationId: null },
          guardian: guardian ? { enabled: true, name: guardian.name, contactNumber: guardian.contactNumber, whatsappNumber: guardian.whatsappNumber || '', occupationId: guardian.occupationId } : { enabled: false, name: '', contactNumber: '', whatsappNumber: '', occupationId: null },
        });
      }

      setIsRegSiblingModalOpen(false);
      setSuccessMsg(`Linked registration to sibling "${candidate.fullName}" (${candidate.admissionNumber}) · Family ${candidate.familyCode}`);
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleClearRegSibling = () => {
    setSelectedRegSibling(null);
    setRegForm(p => ({
      ...p,
      siblingOfStudentId: null
    }));
  };

  // Search candidates for profile sibling linking
  const handleSearchLinkCandidates = async (term: string) => {
    setLinkSiblingSearchTerm(term);
    if (!term.trim() || !window.api || !studentDetail) {
      setLinkSiblingCandidates([]);
      return;
    }
    setIsSearchingLinkSiblings(true);
    try {
      const res = await window.api.searchSiblingCandidates({ search: term.trim(), excludeStudentId: studentDetail.id, limit: 15 });
      if (res.success && res.data) {
        setLinkSiblingCandidates(res.data);
      }
    } catch {
      setLinkSiblingCandidates([]);
    } finally {
      setIsSearchingLinkSiblings(false);
    }
  };

  // Handle candidate selection and fetch preview
  const handleSelectCandidateToLink = async (candidate: ISiblingCandidate) => {
    setSelectedCandidateToLink(candidate);
    setResolutionStrategy('keep_destination');
    setCustomResolution({
      addressChoice: 'destination',
      fatherChoice: 'destination',
      motherChoice: 'destination',
      guardianChoice: 'destination'
    });
    if (!window.api || !studentDetail) return;
    setIsLoadingMergePreview(true);
    try {
      const res = await window.api.getFamilyMergePreview(studentDetail.id, candidate.id);
      if (res.success && res.data) {
        setMergePreview(res.data);
      } else {
        setMergePreview(null);
        setErrorMsg(res.error || 'Failed to generate merge preview');
      }
    } catch (err) {
      setMergePreview(null);
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoadingMergePreview(false);
    }
  };

  // Confirm link sibling in profile
  const handleConfirmLinkSibling = async () => {
    if (!window.api || !studentDetail || !selectedCandidateToLink) return;
    setIsSubmittingLinkSibling(true);
    setErrorMsg(null);
    try {
      const res = await window.api.linkSiblings({
        primaryStudentId: studentDetail.id,
        siblingStudentId: selectedCandidateToLink.id,
        resolutionStrategy,
        customResolution: resolutionStrategy === 'custom' ? customResolution : undefined
      });
      if (res.success) {
        setSuccessMsg(`Successfully linked ${selectedCandidateToLink.fullName} (${selectedCandidateToLink.admissionNumber}) as a sibling.`);
        setIsLinkSiblingModalOpen(false);
        setSelectedCandidateToLink(null);
        setMergePreview(null);
        await fetchStudentProfile(studentDetail.id);
      } else {
        setErrorMsg(res.error || 'Failed to link sibling.');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsSubmittingLinkSibling(false);
    }
  };

  // Unlink sibling in profile
  const handleUnlinkSibling = async (sibling: ILinkedStudent) => {
    if (!window.api || !studentDetail) return;
    const confirm = window.confirm(
      `Are you sure you want to unlink ${sibling.fullName} (${sibling.admissionNumber}) from this family?\n\n` +
      `They will be placed into a new independent family record preserving all their parent and address details.`
    );
    if (!confirm) return;

    try {
      const res = await window.api.unlinkSibling({ studentId: sibling.id });
      if (res.success) {
        setSuccessMsg(`Successfully unlinked ${sibling.fullName} (${sibling.admissionNumber}) into an independent family.`);
        await fetchStudentProfile(studentDetail.id);
      } else {
        setErrorMsg(res.error || 'Failed to unlink sibling.');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  // Open Edit Form
  const handleOpenEdit = (student: IStudentDetail) => {
    setEditForm({
      id: student.id,
      admissionDate: student.admissionDate,
      fullName: student.fullName,
      gender: student.gender,
      dateOfBirth: student.dateOfBirth,
      status: student.status === 'Passed Out' ? 'Active' : student.status,
      transportationMethodId: student.transportationMethodId,
      houseId: student.houseId,
      previousSchoolName: student.previousSchoolName || '',
      previousSchoolIdNumber: student.previousSchoolIdNumber || '',
      performanceDescription: student.performanceDescription || '',
      houseNo: student.houseNo || '',
      streetId: student.streetId,
      cityId: student.cityId,
      additionalAddressDetails: student.additionalAddressDetails || '',
      fullAddress: student.fullAddress || ''
    });
    setEditStatusReason('');
    setIsEditAddressManual(true);
    setViewMode('edit');
  };

  // Submit Edit Form
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.api || !editForm.id) return;

    setIsSubmittingEdit(true);
    setErrorMsg(null);
    try {
      const payload: IUpdateStudentInput = {
        ...editForm,
        statusReason: editStatusReason.trim() || undefined
      };
      const res = await window.api.updateStudent(payload);
      if (res.success && res.data) {
        setSuccessMsg(`Student "${res.data.fullName}" updated successfully.`);
        setStudentDetail(res.data);
        setViewMode('profile');
      } else {
        setErrorMsg(res.error || 'Failed to update student.');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Safe Student Deletion
  const handleDeleteStudent = async (student: IStudentDetail) => {
    if (!window.api) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete student ${student.admissionNumber} (${student.fullName})?\n\n` +
      `This operation is strictly prohibited if any historical academic, fee, status, or note records exist.`
    );
    if (!confirmDelete) return;

    try {
      const res = await window.api.deleteStudent(student.id);
      if (res.success) {
        setSuccessMsg(`Student ${student.admissionNumber} was safely deleted.`);
        setViewMode('list');
      } else {
        setErrorMsg(res.error || 'Cannot delete student.');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  // Add Note
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.api || !studentDetail || !newNoteText.trim()) return;

    setIsAddingNote(true);
    try {
      const res = await window.api.addStudentNote(studentDetail.id, newNoteText.trim());
      if (res.success && res.data) {
        setNewNoteText('');
        setStudentDetail(prev => prev ? {
          ...prev,
          notes: [...prev.notes, res.data]
        } : null);
        setSuccessMsg('Note recorded successfully.');
      } else {
        setErrorMsg(res.error || 'Failed to add note.');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsAddingNote(false);
    }
  };

  // Delete Note
  const handleDeleteNote = async (noteId: number) => {
    if (!window.api || !studentDetail) return;
    try {
      const res = await window.api.deleteStudentNote(noteId);
      if (res.success) {
        setStudentDetail(prev => prev ? {
          ...prev,
          notes: prev.notes.filter(n => n.id !== noteId)
        } : null);
        setSuccessMsg('Note removed.');
      } else {
        setErrorMsg(res.error || 'Failed to remove note.');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  // Upload or replace photo for existing student
  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !studentDetail || !window.api) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('Selected photo exceeds the 2 MB maximum size limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const res = await window.api.uploadStudentPhoto(studentDetail.id, file.name, base64);
        if (res.success && res.data) {
          setStudentDetail(prev => prev ? { ...prev, photoPreviewUrl: res.data } : null);
          setSuccessMsg('Student photo updated.');
        } else {
          setErrorMsg(res.error || 'Failed to upload photo.');
        }
      } catch (err) {
        setErrorMsg((err as Error).message);
      }
    };
    reader.readAsDataURL(file);
  };

  // Remove photo for existing student
  const handleProfilePhotoRemove = async () => {
    if (!studentDetail || !window.api) return;
    const confirmRemove = window.confirm('Remove current photo for this student?');
    if (!confirmRemove) return;

    try {
      const res = await window.api.removeStudentPhoto(studentDetail.id);
      if (res.success) {
        setStudentDetail(prev => prev ? { ...prev, photoPreviewUrl: null, photoPath: null } : null);
        setSuccessMsg('Student photo removed.');
      } else {
        setErrorMsg(res.error || 'Failed to remove photo.');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };


  return (
    <div className="space-y-6">
      {/* Top Banner Alerts */}
      {successMsg && (
        <div className="flex items-center space-x-2 p-3 bg-slate-900 text-white rounded text-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center space-x-2 p-3 bg-red-950 text-red-200 border border-red-800 rounded text-xs animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Header / Breadcrumbs */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Student Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Complete Student Records, Admission Validation, Notes & Family Foundation
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {viewMode !== 'list' && (
            <button
              onClick={() => {
                setViewMode('list');
                setSelectedStudentId(null);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 border border-slate-300 rounded text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to List</span>
            </button>
          )}
          {viewMode === 'list' && (
            <button
              onClick={() => {
                setRegForm(initialRegForm);
                setRegPhotoPreview(null);
                setViewMode('register');
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Student</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* VIEW 1: STUDENT LISTING                                   */}
      {/* ========================================================= */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {/* Search & Filter Toolbar */}
          <Card className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {/* Search Box */}
              <div className="md:col-span-2 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search by name or admission number..."
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              {/* Grade Filter */}
              <div>
                <select
                  value={filterGrade}
                  onChange={e => {
                    setFilterGrade(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900"
                >
                  <option value="">All Grades (1–13)</option>
                  {Array.from({ length: 13 }, (_, i) => i + 1).map(g => (
                    <option key={g} value={g}>Grade {g}</option>
                  ))}
                </select>
              </div>

              {/* House Filter */}
              <div>
                <select
                  value={filterHouseId}
                  onChange={e => {
                    setFilterHouseId(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900"
                >
                  <option value="">All Houses</option>
                  {houses.map(h => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <select
                  value={filterStatus}
                  onChange={e => {
                    setFilterStatus(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900"
                >
                  <option value="">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Leaved">Leaved</option>
                  <option value="Passed Out">Passed Out</option>
                </select>
              </div>
            </div>

            {/* Secondary Filter Line */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
              <div className="flex items-center space-x-4">
                <span className="flex items-center space-x-1">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span>Gender:</span>
                </span>
                <label className="inline-flex items-center space-x-1 cursor-pointer">
                  <input
                    type="radio"
                    name="genderFilter"
                    checked={filterGender === ''}
                    onChange={() => { setFilterGender(''); setPage(1); }}
                    className="text-slate-900"
                  />
                  <span>All</span>
                </label>
                <label className="inline-flex items-center space-x-1 cursor-pointer">
                  <input
                    type="radio"
                    name="genderFilter"
                    checked={filterGender === 'Male'}
                    onChange={() => { setFilterGender('Male'); setPage(1); }}
                    className="text-slate-900"
                  />
                  <span>Male</span>
                </label>
                <label className="inline-flex items-center space-x-1 cursor-pointer">
                  <input
                    type="radio"
                    name="genderFilter"
                    checked={filterGender === 'Female'}
                    onChange={() => { setFilterGender('Female'); setPage(1); }}
                    className="text-slate-900"
                  />
                  <span>Female</span>
                </label>
              </div>

              <div className="font-medium text-slate-700">
                Found {totalCount} student{totalCount === 1 ? '' : 's'}
              </div>
            </div>
          </Card>

          {/* Students Table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Adm #</th>
                    <th className="py-2.5 px-3">Student Name</th>
                    <th className="py-2.5 px-3">Grade</th>
                    <th className="py-2.5 px-3">Gender</th>
                    <th className="py-2.5 px-3">House</th>
                    <th className="py-2.5 px-3">Transport</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
                        Loading student records...
                      </td>
                    </tr>
                  ) : students.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        No students found matching current filters.
                      </td>
                    </tr>
                  ) : (
                    students.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-900">
                          {s.admissionNumber}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-900">{s.fullName}</div>
                          {s.fullAddress && (
                            <div className="text-[11px] text-slate-400 truncate max-w-xs">{s.fullAddress}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-slate-800">Grade {s.currentGrade}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{s.gender}</td>
                        <td className="py-2.5 px-3">
                          {s.houseName ? (
                            <div className="flex items-center space-x-1.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block border border-slate-300"
                                style={{ backgroundColor: s.houseColor || '#64748B' }}
                              />
                              <span className="text-slate-800 font-medium">{s.houseName}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">None</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {s.transportationMethodName || <span className="text-slate-400 italic">Not set</span>}
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge variant={s.status === 'Active' ? 'success' : s.status === 'Leaved' ? 'warning' : 'neutral'}>
                            {s.status}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedStudentId(s.id);
                              setViewMode('profile');
                            }}
                            className="px-2.5 py-1 text-xs border border-slate-300 rounded font-medium text-slate-700 hover:bg-slate-100 transition mr-1.5"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
              <div>
                Showing page <span className="font-semibold text-slate-800">{page}</span> of <span className="font-semibold text-slate-800">{totalPages}</span>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-1.5 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={page >= totalPages || isLoading}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="p-1.5 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 2: REGISTRATION FORM                                 */}
      {/* ========================================================= */}
      {viewMode === 'register' && (
        <form onSubmit={handleRegisterSubmit} className="space-y-6">
          {/* Section 1: Admission & Academic Foundation */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
              <GraduationCap className="w-4 h-4 text-slate-700" />
              <h3 className="text-sm font-semibold text-slate-900">1. Admission & Academic Placement</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Admission Number <span className="text-red-500">*</span>
                </label>
                <input
                  id="reg-field-admissionNumber"
                  type="text"
                  required
                  placeholder="e.g. ADM-2026-001"
                  value={regForm.admissionNumber}
                  onChange={e => setRegForm(p => ({ ...p, admissionNumber: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusNextRegField('reg-field-admissionNumber');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded font-mono focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Admission Date <span className="text-red-500">*</span>
                </label>
                <input
                  id="reg-field-admissionDate"
                  type="date"
                  required
                  value={regForm.admissionDate}
                  onChange={e => setRegForm(p => ({ ...p, admissionDate: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusNextRegField('reg-field-admissionDate');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <QuickCreateCombobox
                id="reg-field-currentGrade"
                label="Current Grade"
                items={GRADE_ITEMS}
                value={regForm.currentGrade}
                onChange={val => setRegForm(p => ({ ...p, currentGrade: Number(val) }))}
                onNextField={() => focusNextRegField('reg-field-currentGrade')}
                placeholder="Search or select grade (1–13)..."
                required
                allowCreate={false}
              />

              {/* House with Quick Create */}
              <QuickCreateCombobox
                id="reg-field-houseId"
                label="House"
                category="houses"
                items={houses}
                value={regForm.houseId}
                onChange={id => setRegForm(p => ({ ...p, houseId: id ? Number(id) : null }))}
                onItemCreated={loadLookups}
                onNextField={() => focusNextRegField('reg-field-houseId')}
                placeholder="Search or select house..."
              />

              {/* Transportation Method with Quick Create */}
              <QuickCreateCombobox
                id="reg-field-transportationMethodId"
                label="Transportation Method"
                category="transportation_methods"
                items={transportMethods}
                value={regForm.transportationMethodId}
                onChange={id => setRegForm(p => ({ ...p, transportationMethodId: id ? Number(id) : null }))}
                onItemCreated={loadLookups}
                onNextField={() => focusNextRegField('reg-field-transportationMethodId')}
                placeholder="Search or select transport..."
              />
            </div>
          </Card>

          {/* Section 2: Student Personal Information */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
              <User className="w-4 h-4 text-slate-700" />
              <h3 className="text-sm font-semibold text-slate-900">2. Personal Information & Photo</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="reg-field-fullName"
                  type="text"
                  required
                  placeholder="e.g. Kasun Chamara Perera"
                  value={regForm.fullName}
                  onChange={e => setRegForm(p => ({ ...p, fullName: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusNextRegField('reg-field-fullName');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <QuickCreateCombobox
                id="reg-field-gender"
                label="Gender"
                items={GENDER_ITEMS}
                value={regForm.gender}
                onChange={val => setRegForm(p => ({ ...p, gender: val as StudentGender }))}
                onNextField={() => focusNextRegField('reg-field-gender')}
                placeholder="Search or select gender (Male / Female)..."
                required
                allowCreate={false}
              />

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Date of Birth <span className="text-red-500">*</span>
                </label>
                <input
                  id="reg-field-dateOfBirth"
                  type="date"
                  required
                  value={regForm.dateOfBirth}
                  onChange={e => setRegForm(p => ({ ...p, dateOfBirth: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusNextRegField('reg-field-dateOfBirth');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              {/* Photo Upload Area */}
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Student Photo (Optional, PNG/JPG, max 2MB)</label>
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                    {regPhotoPreview ? (
                      <img src={regPhotoPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-6 h-6 text-slate-300" />
                    )}
                  </div>
                  <div className="space-x-2">
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="px-2.5 py-1.5 border border-slate-300 rounded text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                    >
                      Choose Photo...
                    </button>
                    {regPhotoPreview && (
                      <button
                        type="button"
                        onClick={() => {
                          setRegPhotoPreview(null);
                          setRegForm(p => ({ ...p, photoDataBase64: null, photoFileName: null }));
                        }}
                        className="px-2 py-1.5 text-xs text-red-600 hover:underline font-medium"
                      >
                        Remove
                      </button>
                    )}
                    <input
                      type="file"
                      ref={photoInputRef}
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={handlePhotoSelect}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Section 3: Address & Family Foundation */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
              <Home className="w-4 h-4 text-slate-700" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">3. Family & Residence Address</h3>
                <p className="text-[11px] text-slate-400">Sibling records will automatically share this authoritative family residence foundation.</p>
              </div>
            </div>

            {/* Sibling Link Banner / Shortcut (Stage 08) */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Link2 className="w-4 h-4 text-slate-700 shrink-0" />
                <div>
                  <span className="text-xs font-semibold text-slate-900">
                    {selectedRegSibling ? 'Sibling Record Linked' : 'Registering as a Sibling?'}
                  </span>
                  <p className="text-[11px] text-slate-500">
                    {selectedRegSibling 
                      ? `Linked to Sibling: ${selectedRegSibling.fullName} (${selectedRegSibling.admissionNumber}) · Family ${selectedRegSibling.familyCode}`
                      : 'Link to an existing student to automatically share their family residence address and parent/guardian records.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                {selectedRegSibling ? (
                  <button
                    type="button"
                    onClick={handleClearRegSibling}
                    className="px-2.5 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50 font-medium"
                  >
                    Clear Sibling Link
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setRegSiblingSearchTerm('');
                      setRegSiblingCandidates([]);
                      setIsRegSiblingModalOpen(true);
                    }}
                    className="px-2.5 py-1 text-xs border border-slate-300 bg-white rounded text-slate-700 hover:bg-slate-50 font-medium flex items-center space-x-1"
                  >
                    <Search className="w-3 h-3" />
                    <span>Select Sibling...</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">House Number</label>
                <input
                  id="reg-field-houseNo"
                  type="text"
                  placeholder="e.g. No. 45/A"
                  value={regForm.houseNo || ''}
                  onChange={e => setRegForm(p => ({ ...p, houseNo: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusNextRegField('reg-field-houseNo');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              {/* Street with Quick Create */}
              <QuickCreateCombobox
                id="reg-field-streetId"
                label="Street / Estate"
                category="streets"
                items={streets}
                value={regForm.streetId}
                onChange={id => setRegForm(p => ({ ...p, streetId: id ? Number(id) : null }))}
                onItemCreated={loadLookups}
                onNextField={() => focusNextRegField('reg-field-streetId')}
                placeholder="Search or select street..."
              />

              {/* City with Quick Create */}
              <QuickCreateCombobox
                id="reg-field-cityId"
                label="City"
                category="cities"
                items={cities}
                value={regForm.cityId}
                onChange={id => setRegForm(p => ({ ...p, cityId: id ? Number(id) : null }))}
                onItemCreated={loadLookups}
                onNextField={() => focusNextRegField('reg-field-cityId')}
                placeholder="Search or select city..."
              />

              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">Additional Address Details (Landmarks, Apt, etc.)</label>
                <input
                  id="reg-field-additionalAddressDetails"
                  type="text"
                  placeholder="e.g. Near Vidyartha Junction"
                  value={regForm.additionalAddressDetails || ''}
                  onChange={e => setRegForm(p => ({ ...p, additionalAddressDetails: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusNextRegField('reg-field-additionalAddressDetails');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              {/* Full Composed Address */}
              <div className="md:col-span-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-700">Composed Full Address</label>
                  {isRegAddressManual && (
                    <button
                      type="button"
                      onClick={() => setIsRegAddressManual(false)}
                      className="text-[11px] text-slate-600 hover:underline font-medium flex items-center space-x-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Reset to Auto-Compose</span>
                    </button>
                  )}
                </div>
                <textarea
                  id="reg-field-fullAddress"
                  rows={2}
                  placeholder="Full composed address string..."
                  value={regForm.fullAddress || ''}
                  onChange={e => {
                    setIsRegAddressManual(true);
                    setRegForm(p => ({ ...p, fullAddress: e.target.value }));
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      focusNextRegField('reg-field-fullAddress');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>
            </div>
          </Card>

          {/* Section 4: Parent & Guardian Information */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
              <Users className="w-4 h-4 text-slate-700" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">4. Parent & Guardian Information</h3>
                <p className="text-[11px] text-slate-400">At least one parent (Father or Mother) is required. Guardian cannot be the sole relationship.</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Father Section */}
              <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={regParents.father.enabled}
                      onChange={e => setRegParents(p => ({
                        ...p,
                        father: { ...p.father, enabled: e.target.checked }
                      }))}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span className="text-xs font-semibold text-slate-900">Father Information</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">Primary Parent</span>
                </div>

                {regParents.father.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Father's Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Sunil Perera"
                        value={regParents.father.name}
                        onChange={e => setRegParents(p => ({
                          ...p,
                          father: { ...p.father, name: e.target.value }
                        }))}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Contact Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 0771234567"
                        maxLength={12}
                        value={regParents.father.contactNumber}
                        onChange={e => setRegParents(p => ({
                          ...p,
                          father: { ...p.father, contactNumber: e.target.value }
                        }))}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded font-mono focus:ring-1 focus:ring-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        WhatsApp Number (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 0771234567"
                        maxLength={12}
                        value={regParents.father.whatsappNumber}
                        onChange={e => setRegParents(p => ({
                          ...p,
                          father: { ...p.father, whatsappNumber: e.target.value }
                        }))}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded font-mono focus:ring-1 focus:ring-slate-900"
                      />
                    </div>
                    <div>
                      <QuickCreateCombobox
                        id="reg-father-occupation"
                        label="Occupation"
                        category="occupations"
                        items={occupations}
                        value={regParents.father.occupationId}
                        onChange={id => setRegParents(p => ({
                          ...p,
                          father: { ...p.father, occupationId: id ? Number(id) : null }
                        }))}
                        onItemCreated={loadLookups}
                        placeholder="Search or select occupation..."
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Mother Section */}
              <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={regParents.mother.enabled}
                      onChange={e => setRegParents(p => ({
                        ...p,
                        mother: { ...p.mother, enabled: e.target.checked }
                      }))}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span className="text-xs font-semibold text-slate-900">Mother Information</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">Primary Parent</span>
                </div>

                {regParents.mother.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Mother's Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Kanthi Jayasinghe"
                        value={regParents.mother.name}
                        onChange={e => setRegParents(p => ({
                          ...p,
                          mother: { ...p.mother, name: e.target.value }
                        }))}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Contact Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 0712345678"
                        maxLength={12}
                        value={regParents.mother.contactNumber}
                        onChange={e => setRegParents(p => ({
                          ...p,
                          mother: { ...p.mother, contactNumber: e.target.value }
                        }))}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded font-mono focus:ring-1 focus:ring-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        WhatsApp Number (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 0712345678"
                        maxLength={12}
                        value={regParents.mother.whatsappNumber}
                        onChange={e => setRegParents(p => ({
                          ...p,
                          mother: { ...p.mother, whatsappNumber: e.target.value }
                        }))}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded font-mono focus:ring-1 focus:ring-slate-900"
                      />
                    </div>
                    <div>
                      <QuickCreateCombobox
                        id="reg-mother-occupation"
                        label="Occupation"
                        category="occupations"
                        items={occupations}
                        value={regParents.mother.occupationId}
                        onChange={id => setRegParents(p => ({
                          ...p,
                          mother: { ...p.mother, occupationId: id ? Number(id) : null }
                        }))}
                        onItemCreated={loadLookups}
                        placeholder="Search or select occupation..."
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Guardian Section */}
              <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={regParents.guardian.enabled}
                      onChange={e => setRegParents(p => ({
                        ...p,
                        guardian: { ...p.guardian, enabled: e.target.checked }
                      }))}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span className="text-xs font-semibold text-slate-900">Guardian Information</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">Optional Relationship</span>
                </div>

                {regParents.guardian.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Guardian's Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Nimal Gamage"
                        value={regParents.guardian.name}
                        onChange={e => setRegParents(p => ({
                          ...p,
                          guardian: { ...p.guardian, name: e.target.value }
                        }))}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Contact Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 0112345678"
                        maxLength={12}
                        value={regParents.guardian.contactNumber}
                        onChange={e => setRegParents(p => ({
                          ...p,
                          guardian: { ...p.guardian, contactNumber: e.target.value }
                        }))}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded font-mono focus:ring-1 focus:ring-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        WhatsApp Number (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 0112345678"
                        maxLength={12}
                        value={regParents.guardian.whatsappNumber}
                        onChange={e => setRegParents(p => ({
                          ...p,
                          guardian: { ...p.guardian, whatsappNumber: e.target.value }
                        }))}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded font-mono focus:ring-1 focus:ring-slate-900"
                      />
                    </div>
                    <div>
                      <QuickCreateCombobox
                        id="reg-guardian-occupation"
                        label="Occupation"
                        category="occupations"
                        items={occupations}
                        value={regParents.guardian.occupationId}
                        onChange={id => setRegParents(p => ({
                          ...p,
                          guardian: { ...p.guardian, occupationId: id ? Number(id) : null }
                        }))}
                        onItemCreated={loadLookups}
                        placeholder="Search or select occupation..."
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Section 5: Previous School & Notes */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
              <FileText className="w-4 h-4 text-slate-700" />
              <h3 className="text-sm font-semibold text-slate-900">5. Previous School & Initial Notes</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Previous School Name (Optional)</label>
                <input
                  id="reg-field-previousSchoolName"
                  type="text"
                  placeholder="e.g. Dharmaraja College, Kandy"
                  value={regForm.previousSchoolName || ''}
                  onChange={e => setRegForm(p => ({ ...p, previousSchoolName: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusNextRegField('reg-field-previousSchoolName');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Previous School ID Number (Optional)</label>
                <input
                  id="reg-field-previousSchoolIdNumber"
                  type="text"
                  placeholder="e.g. SC-8891"
                  value={regForm.previousSchoolIdNumber || ''}
                  onChange={e => setRegForm(p => ({ ...p, previousSchoolIdNumber: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusNextRegField('reg-field-previousSchoolIdNumber');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded font-mono focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Performance Description / Academic Background</label>
                <textarea
                  id="reg-field-performanceDescription"
                  rows={2}
                  placeholder="Special talents, academic assessments, extracurricular activities..."
                  value={regForm.performanceDescription || ''}
                  onChange={e => setRegForm(p => ({ ...p, performanceDescription: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      focusNextRegField('reg-field-performanceDescription');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Initial Administrative Note (Optional)</label>
                <textarea
                  id="reg-field-initialNote"
                  rows={2}
                  placeholder="Initial remarks regarding student registration..."
                  value={regForm.initialNote || ''}
                  onChange={e => setRegForm(p => ({ ...p, initialNote: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      focusNextRegField('reg-field-initialNote');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>
            </div>
          </Card>

          {/* Form Actions */}
          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="px-4 py-2 border border-slate-300 rounded text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              id="reg-field-submit"
              type="submit"
              disabled={isSubmittingReg}
              className="px-5 py-2 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 transition flex items-center space-x-1.5 focus:ring-2 focus:ring-slate-900 focus:outline-none"
            >
              {isSubmittingReg && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>Register Student</span>
            </button>
          </div>
        </form>
      )}

      {/* ========================================================= */}
      {/* VIEW 3: STUDENT PROFILE                                   */}
      {/* ========================================================= */}
      {viewMode === 'profile' && studentDetail && (
        <div className="space-y-6">
          {/* Top Profile Summary Card */}
          <Card className="p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                {/* Photo Preview & Controls */}
                <div className="relative group">
                  <div className="w-16 h-16 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                    {studentDetail.photoPreviewUrl ? (
                      <img src={studentDetail.photoPreviewUrl} alt={studentDetail.fullName} className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-8 h-8 text-slate-400" />
                    )}
                  </div>
                  <div className="mt-1 flex items-center space-x-1">
                    <label className="text-[10px] text-slate-600 hover:underline cursor-pointer">
                      Change
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg"
                        onChange={handleProfilePhotoUpload}
                        className="hidden"
                      />
                    </label>
                    {studentDetail.photoPreviewUrl && (
                      <>
                        <span className="text-slate-300">·</span>
                        <button
                          type="button"
                          onClick={handleProfilePhotoRemove}
                          className="text-[10px] text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-lg font-bold text-slate-900">{studentDetail.fullName}</h2>
                    <Badge variant={studentDetail.status === 'Active' ? 'success' : studentDetail.status === 'Leaved' ? 'warning' : 'neutral'}>
                      {studentDetail.status}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1 font-mono">
                    <span>Adm: <strong className="text-slate-800">{studentDetail.admissionNumber}</strong></span>
                    <span>·</span>
                    <span>Grade <strong className="text-slate-800">{studentDetail.currentGrade}</strong></span>
                    <span>·</span>
                    <span>Family: <strong className="text-slate-800">{studentDetail.familyCode}</strong></span>
                  </div>
                </div>
              </div>

              {/* Header Action Buttons */}
              <div className="flex items-center space-x-2 self-end md:self-center">
                <button
                  onClick={() => handleOpenEdit(studentDetail)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 border border-slate-300 rounded text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Details</span>
                </button>
                {currentUser?.role === 'Admin' && (
                  <button
                    onClick={() => handleDeleteStudent(studentDetail)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 border border-red-300 text-red-700 rounded text-xs font-medium hover:bg-red-50 transition"
                    title="Delete Student (Safe deletion restrictions apply)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </div>
          </Card>

          {/* Details 2-Column Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Student Info Card */}
            <Card className="p-5 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                Personal & Academic Information
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block">Date of Birth</span>
                  <span className="font-medium text-slate-800">{studentDetail.dateOfBirth}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Gender</span>
                  <span className="font-medium text-slate-800">{studentDetail.gender}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Admission Date</span>
                  <span className="font-medium text-slate-800">{studentDetail.admissionDate}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Current Grade</span>
                  <span className="font-medium text-slate-800">Grade {studentDetail.currentGrade}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">House</span>
                  {studentDetail.houseName ? (
                    <div className="flex items-center space-x-1.5 mt-0.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block border border-slate-300"
                        style={{ backgroundColor: studentDetail.houseColor || '#64748B' }}
                      />
                      <span className="font-medium text-slate-800">{studentDetail.houseName}</span>
                    </div>
                  ) : (
                    <span className="text-slate-400 italic">None</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-400 block">Transportation Method</span>
                  <span className="font-medium text-slate-800">{studentDetail.transportationMethodName || 'Not set'}</span>
                </div>
              </div>

              {/* Previous School & Performance */}
              {(studentDetail.previousSchoolName || studentDetail.performanceDescription) && (
                <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
                  {studentDetail.previousSchoolName && (
                    <div>
                      <span className="text-slate-400 block">Previous School</span>
                      <span className="font-medium text-slate-800">
                        {studentDetail.previousSchoolName} {studentDetail.previousSchoolIdNumber ? `(${studentDetail.previousSchoolIdNumber})` : ''}
                      </span>
                    </div>
                  )}
                  {studentDetail.performanceDescription && (
                    <div>
                      <span className="text-slate-400 block">Performance Description</span>
                      <p className="text-slate-700 whitespace-pre-wrap">{studentDetail.performanceDescription}</p>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Address & Family Residence Card */}
            <Card className="p-5 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                Family & Residence Address
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-400 block">Family Code</span>
                  <span className="font-mono font-medium text-slate-900">{studentDetail.familyCode}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-400 block">House No</span>
                    <span className="font-medium text-slate-800">{studentDetail.houseNo || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Street / Estate</span>
                    <span className="font-medium text-slate-800">{studentDetail.streetName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">City</span>
                    <span className="font-medium text-slate-800">
                      {studentDetail.cityName || '—'} {studentDetail.postalCode ? `(${studentDetail.postalCode})` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Additional Details</span>
                    <span className="font-medium text-slate-800">{studentDetail.additionalAddressDetails || '—'}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-slate-400 block">Composed Address</span>
                  <p className="font-medium text-slate-800 mt-0.5">{studentDetail.fullAddress || 'No address recorded.'}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Parent & Guardian Information Card */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-slate-700" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Parent & Guardian Information ({studentDetail.familyMembers?.length || 0})
                </h3>
              </div>
              <button
                type="button"
                onClick={handleOpenManageParents}
                className="flex items-center space-x-1 px-2.5 py-1 text-xs border border-slate-300 rounded font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                <Edit2 className="w-3 h-3" />
                <span>Manage Parents</span>
              </button>
            </div>

            {(!studentDetail.familyMembers || studentDetail.familyMembers.length === 0) ? (
              <div className="py-4 text-center text-xs text-slate-400">
                <p>No parents or guardians recorded for this family.</p>
                <button
                  type="button"
                  onClick={handleOpenManageParents}
                  className="mt-2 text-slate-700 font-medium underline"
                >
                  Record Parent Information
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {studentDetail.familyMembers.map(member => (
                  <div key={member.id} className="p-3.5 border border-slate-200 rounded-lg bg-slate-50/60 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-sm">{member.relationshipType}</span>
                      {member.occupationName ? (
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full text-[10px] font-medium">
                          {member.occupationName}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">No occupation</span>
                      )}
                    </div>
                    <div className="font-semibold text-slate-800">{member.name}</div>
                    <div className="space-y-1 pt-1 border-t border-slate-200/60 text-[11px]">
                      <div className="flex items-center space-x-2 text-slate-600">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span className="font-mono">{member.contactNumber}</span>
                      </div>
                      {member.whatsappNumber && (
                        <div className="flex items-center space-x-2 text-slate-600">
                          <MessageSquare className="w-3 h-3 text-emerald-500" />
                          <span className="font-mono">{member.whatsappNumber}</span>
                          <span className="text-[9px] text-emerald-600 font-medium bg-emerald-50 px-1 rounded">WhatsApp</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Sibling Management & Shared Family Card (Stage 08) */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-slate-700" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Sibling Management & Shared Family ({studentDetail.linkedStudents?.length || 1})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLinkSiblingSearchTerm('');
                  setLinkSiblingCandidates([]);
                  setSelectedCandidateToLink(null);
                  setIsLinkSiblingModalOpen(true);
                }}
                className="flex items-center space-x-1 px-2.5 py-1 text-xs border border-slate-300 rounded font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                <Link2 className="w-3 h-3" />
                <span>Link Sibling</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500">
              Students sharing Family Code <strong className="text-slate-800">{studentDetail.familyCode}</strong> automatically share the residence address and parent/guardian information above. Student academic details, grades, notes, and fees remain strictly individual.
            </p>

            {(!studentDetail.linkedStudents || studentDetail.linkedStudents.length <= 1) ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-500 flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                <span>No siblings are currently linked to this student's family.</span>
                <button
                  type="button"
                  onClick={() => {
                    setLinkSiblingSearchTerm('');
                    setLinkSiblingCandidates([]);
                    setSelectedCandidateToLink(null);
                    setIsLinkSiblingModalOpen(true);
                  }}
                  className="text-slate-800 font-semibold underline text-xs shrink-0"
                >
                  Link an Enrolled Student as Sibling
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {studentDetail.linkedStudents.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-3 text-xs hover:bg-slate-50">
                    <div className="flex items-center space-x-2.5">
                      <span className="font-mono font-semibold text-slate-800">{s.admissionNumber}</span>
                      <span className="text-slate-800 font-medium">{s.fullName}</span>
                      {s.id === studentDetail.id ? (
                        <span className="text-[10px] bg-slate-900 text-white px-1.5 py-0.5 rounded font-medium">Current Student</span>
                      ) : (
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">Sibling</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-3 text-slate-500">
                      <span>Grade {s.currentGrade}</span>
                      <Badge variant={s.status === 'Active' ? 'success' : s.status === 'Leaved' ? 'warning' : 'neutral'}>
                        {s.status}
                      </Badge>
                      {s.id !== studentDetail.id && (
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStudentId(s.id);
                              setViewMode('profile');
                            }}
                            className="text-[11px] text-slate-700 hover:underline font-medium"
                          >
                            View
                          </button>
                          <span className="text-slate-300">·</span>
                          <button
                            type="button"
                            onClick={() => handleUnlinkSibling(s)}
                            className="text-[11px] text-red-600 hover:underline font-medium flex items-center space-x-1"
                            title="Unlink into independent family"
                          >
                            <Unlink className="w-3 h-3 inline" />
                            <span>Unlink</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Notes Section */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-4 h-4 text-slate-700" />
                <h3 className="text-sm font-semibold text-slate-900">Student Notes ({studentDetail.notes.length})</h3>
              </div>
            </div>

            {/* Existing Chronological Notes */}
            <div className="space-y-3">
              {studentDetail.notes.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 italic">No notes recorded yet for this student.</p>
              ) : (
                studentDetail.notes.map(note => (
                  <div key={note.id} className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-slate-400 text-[11px]">
                      <div className="flex items-center space-x-1.5">
                        <strong className="text-slate-700">{note.createdByName || 'Staff'}</strong>
                        {note.createdByRole && <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 rounded text-slate-600">{note.createdByRole}</span>}
                        <span>·</span>
                        <span>{new Date(note.createdAt).toLocaleString()}</span>
                      </div>
                      {(currentUser?.role === 'Admin' || currentUser?.id === note.createdBy) && (
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="text-slate-400 hover:text-red-600 transition"
                          title="Remove note"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-slate-800 whitespace-pre-wrap">{note.noteText}</p>
                  </div>
                ))
              )}
            </div>

            {/* Add Note Input Form */}
            <form onSubmit={handleAddNote} className="space-y-2 pt-2 border-t border-slate-100">
              <label className="block text-xs font-medium text-slate-700">Add New Note</label>
              <textarea
                rows={2}
                required
                placeholder="Type a chronological note..."
                value={newNoteText}
                onChange={e => setNewNoteText(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isAddingNote || !newNoteText.trim()}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 transition"
                >
                  {isAddingNote ? 'Saving...' : 'Post Note'}
                </button>
              </div>
            </form>
          </Card>

          {/* Status History Timeline (if any transitions exist) */}
          {studentDetail.statusHistory.length > 0 && (
            <Card className="p-5 space-y-3">
              <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
                <Clock className="w-4 h-4 text-slate-700" />
                <h3 className="text-sm font-semibold text-slate-900">Status History Timeline</h3>
              </div>
              <div className="space-y-2">
                {studentDetail.statusHistory.map(h => (
                  <div key={h.id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-700">{h.fromStatus} → {h.toStatus}</span>
                      {h.reason && <span className="text-slate-500">({h.reason})</span>}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      By {h.changedByName || 'User'} on {new Date(h.changedAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 4: EDIT STUDENT FORM                                 */}
      {/* ========================================================= */}
      {viewMode === 'edit' && studentDetail && (
        <form onSubmit={handleEditSubmit} className="space-y-6">
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Edit2 className="w-4 h-4 text-slate-700" />
                <h3 className="text-sm font-semibold text-slate-900">Edit Student: {studentDetail.admissionNumber}</h3>
              </div>
              <div className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded">
                Grade: <strong>Grade {studentDetail.currentGrade}</strong> (Progression via Annual Promotion)
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="edit-field-fullName"
                  type="text"
                  required
                  value={editForm.fullName || ''}
                  onChange={e => setEditForm(p => ({ ...p, fullName: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusNextEditField('edit-field-fullName');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <QuickCreateCombobox
                id="edit-field-gender"
                label="Gender"
                items={GENDER_ITEMS}
                value={editForm.gender || 'Male'}
                onChange={val => setEditForm(p => ({ ...p, gender: val as StudentGender }))}
                onNextField={() => focusNextEditField('edit-field-gender')}
                placeholder="Search or select gender..."
                required
                allowCreate={false}
              />

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Date of Birth</label>
                <input
                  id="edit-field-dateOfBirth"
                  type="date"
                  value={editForm.dateOfBirth || ''}
                  onChange={e => setEditForm(p => ({ ...p, dateOfBirth: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusNextEditField('edit-field-dateOfBirth');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Admission Date</label>
                <input
                  id="edit-field-admissionDate"
                  type="date"
                  value={editForm.admissionDate || ''}
                  onChange={e => setEditForm(p => ({ ...p, admissionDate: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusNextEditField('edit-field-admissionDate');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              {/* Status Switch (Active <-> Leaved) */}
              <QuickCreateCombobox
                id="edit-field-status"
                label="Status"
                items={STATUS_ITEMS}
                value={editForm.status || 'Active'}
                onChange={val => setEditForm(p => ({ ...p, status: val as 'Active' | 'Leaved' }))}
                onNextField={() => focusNextEditField('edit-field-status')}
                placeholder="Search or select status..."
                required
                allowCreate={false}
              />

              {/* Status Change Reason */}
              {editForm.status !== studentDetail.status && (
                <div className="md:col-span-3">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Status Transition Reason <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="edit-field-statusReason"
                    type="text"
                    required
                    placeholder="Provide reason for changing status..."
                    value={editStatusReason}
                    onChange={e => setEditStatusReason(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        focusNextEditField('edit-field-statusReason');
                      }
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900 bg-amber-50/50"
                  />
                </div>
              )}

              {/* House with Quick Create */}
              <QuickCreateCombobox
                id="edit-field-houseId"
                label="House"
                category="houses"
                items={houses}
                value={editForm.houseId}
                onChange={id => setEditForm(p => ({ ...p, houseId: id ? Number(id) : null }))}
                onItemCreated={loadLookups}
                onNextField={() => focusNextEditField('edit-field-houseId')}
                placeholder="Search or select house..."
              />

              {/* Transportation Method with Quick Create */}
              <QuickCreateCombobox
                id="edit-field-transportationMethodId"
                label="Transportation Method"
                category="transportation_methods"
                items={transportMethods}
                value={editForm.transportationMethodId}
                onChange={id => setEditForm(p => ({ ...p, transportationMethodId: id ? Number(id) : null }))}
                onItemCreated={loadLookups}
                onNextField={() => focusNextEditField('edit-field-transportationMethodId')}
                placeholder="Search or select transport..."
              />
            </div>
          </Card>

          {/* Edit Residence Address */}
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">Family Residence Address</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">House Number</label>
                <input
                  id="edit-field-houseNo"
                  type="text"
                  value={editForm.houseNo || ''}
                  onChange={e => setEditForm(p => ({ ...p, houseNo: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusNextEditField('edit-field-houseNo');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <QuickCreateCombobox
                id="edit-field-streetId"
                label="Street / Estate"
                category="streets"
                items={streets}
                value={editForm.streetId}
                onChange={id => setEditForm(p => ({ ...p, streetId: id ? Number(id) : null }))}
                onItemCreated={loadLookups}
                onNextField={() => focusNextEditField('edit-field-streetId')}
                placeholder="Search or select street..."
              />

              <QuickCreateCombobox
                id="edit-field-cityId"
                label="City"
                category="cities"
                items={cities}
                value={editForm.cityId}
                onChange={id => setEditForm(p => ({ ...p, cityId: id ? Number(id) : null }))}
                onItemCreated={loadLookups}
                onNextField={() => focusNextEditField('edit-field-cityId')}
                placeholder="Search or select city..."
              />

              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">Additional Details</label>
                <input
                  id="edit-field-additionalAddressDetails"
                  type="text"
                  value={editForm.additionalAddressDetails || ''}
                  onChange={e => setEditForm(p => ({ ...p, additionalAddressDetails: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusNextEditField('edit-field-additionalAddressDetails');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">Composed Full Address</label>
                <textarea
                  id="edit-field-fullAddress"
                  rows={2}
                  value={editForm.fullAddress || ''}
                  onChange={e => setEditForm(p => ({ ...p, fullAddress: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      focusNextEditField('edit-field-fullAddress');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-slate-900"
                />
              </div>
            </div>
          </Card>

          {/* Form Actions */}
          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={() => setViewMode('profile')}
              className="px-4 py-2 border border-slate-300 rounded text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              id="edit-field-submit"
              type="submit"
              disabled={isSubmittingEdit}
              className="px-5 py-2 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 transition flex items-center space-x-1.5 focus:ring-2 focus:ring-slate-900 focus:outline-none"
            >
              {isSubmittingEdit && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      )}

      {/* Manage Parents & Guardians Modal */}
      {isManagingParents && studentDetail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Manage Parents & Guardians</h3>
                <p className="text-xs text-slate-500">Family: {studentDetail.familyCode} · Applies to all linked siblings</p>
              </div>
              <button
                type="button"
                onClick={() => setIsManagingParents(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveManageParents} className="p-6 overflow-y-auto space-y-4">
              {/* Father */}
              <div className="p-4 border border-slate-200 rounded-lg space-y-3">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editParents.father.enabled}
                    onChange={e => setEditParents(p => ({
                      ...p,
                      father: { ...p.father, enabled: e.target.checked }
                    }))}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="text-xs font-semibold text-slate-900">Father</span>
                </label>
                {editParents.father.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
                      <input
                        type="text"
                        value={editParents.father.name}
                        onChange={e => setEditParents(p => ({ ...p, father: { ...p.father, name: e.target.value } }))}
                        className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Contact Number (10 digits starting with 0) *</label>
                      <input
                        type="text"
                        value={editParents.father.contactNumber}
                        onChange={e => setEditParents(p => ({ ...p, father: { ...p.father, contactNumber: e.target.value } }))}
                        className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">WhatsApp Number (Optional)</label>
                      <input
                        type="text"
                        value={editParents.father.whatsappNumber}
                        onChange={e => setEditParents(p => ({ ...p, father: { ...p.father, whatsappNumber: e.target.value } }))}
                        className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded font-mono"
                      />
                    </div>
                    <div>
                      <QuickCreateCombobox
                        id="edit-father-occupation"
                        label="Occupation"
                        category="occupations"
                        items={occupations}
                        value={editParents.father.occupationId}
                        onChange={id => setEditParents(p => ({ ...p, father: { ...p.father, occupationId: id ? Number(id) : null } }))}
                        onItemCreated={loadLookups}
                        placeholder="Select occupation..."
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Mother */}
              <div className="p-4 border border-slate-200 rounded-lg space-y-3">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editParents.mother.enabled}
                    onChange={e => setEditParents(p => ({
                      ...p,
                      mother: { ...p.mother, enabled: e.target.checked }
                    }))}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="text-xs font-semibold text-slate-900">Mother</span>
                </label>
                {editParents.mother.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
                      <input
                        type="text"
                        value={editParents.mother.name}
                        onChange={e => setEditParents(p => ({ ...p, mother: { ...p.mother, name: e.target.value } }))}
                        className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Contact Number (10 digits starting with 0) *</label>
                      <input
                        type="text"
                        value={editParents.mother.contactNumber}
                        onChange={e => setEditParents(p => ({ ...p, mother: { ...p.mother, contactNumber: e.target.value } }))}
                        className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">WhatsApp Number (Optional)</label>
                      <input
                        type="text"
                        value={editParents.mother.whatsappNumber}
                        onChange={e => setEditParents(p => ({ ...p, mother: { ...p.mother, whatsappNumber: e.target.value } }))}
                        className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded font-mono"
                      />
                    </div>
                    <div>
                      <QuickCreateCombobox
                        id="edit-mother-occupation"
                        label="Occupation"
                        category="occupations"
                        items={occupations}
                        value={editParents.mother.occupationId}
                        onChange={id => setEditParents(p => ({ ...p, mother: { ...p.mother, occupationId: id ? Number(id) : null } }))}
                        onItemCreated={loadLookups}
                        placeholder="Select occupation..."
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Guardian */}
              <div className="p-4 border border-slate-200 rounded-lg space-y-3">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editParents.guardian.enabled}
                    onChange={e => setEditParents(p => ({
                      ...p,
                      guardian: { ...p.guardian, enabled: e.target.checked }
                    }))}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="text-xs font-semibold text-slate-900">Guardian</span>
                </label>
                {editParents.guardian.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
                      <input
                        type="text"
                        value={editParents.guardian.name}
                        onChange={e => setEditParents(p => ({ ...p, guardian: { ...p.guardian, name: e.target.value } }))}
                        className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Contact Number (10 digits starting with 0) *</label>
                      <input
                        type="text"
                        value={editParents.guardian.contactNumber}
                        onChange={e => setEditParents(p => ({ ...p, guardian: { ...p.guardian, contactNumber: e.target.value } }))}
                        className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">WhatsApp Number (Optional)</label>
                      <input
                        type="text"
                        value={editParents.guardian.whatsappNumber}
                        onChange={e => setEditParents(p => ({ ...p, guardian: { ...p.guardian, whatsappNumber: e.target.value } }))}
                        className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded font-mono"
                      />
                    </div>
                    <div>
                      <QuickCreateCombobox
                        id="edit-guardian-occupation"
                        label="Occupation"
                        category="occupations"
                        items={occupations}
                        value={editParents.guardian.occupationId}
                        onChange={id => setEditParents(p => ({ ...p, guardian: { ...p.guardian, occupationId: id ? Number(id) : null } }))}
                        onItemCreated={loadLookups}
                        placeholder="Select occupation..."
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsManagingParents(false)}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingParents}
                  className="px-4 py-1.5 text-xs bg-slate-900 text-white rounded font-semibold hover:bg-slate-800 disabled:opacity-50"
                >
                  {isSubmittingParents ? 'Saving...' : 'Save Family Information'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sibling Picker Modal for Registration (Stage 08) */}
      {isRegSiblingModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Select Existing Sibling</h3>
                <p className="text-xs text-slate-500">Search for an enrolled student to share family address and parent details</p>
              </div>
              <button
                type="button"
                onClick={() => setIsRegSiblingModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Type admission number or student name..."
                  value={regSiblingSearchTerm}
                  onChange={e => handleSearchRegSiblings(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded bg-white focus:ring-1 focus:ring-slate-900"
                  autoFocus
                />
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1 divide-y divide-slate-100 max-h-96">
              {isSearchingRegSiblings ? (
                <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center space-x-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Searching students...</span>
                </div>
              ) : regSiblingCandidates.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  {regSiblingSearchTerm.trim() 
                    ? 'No matching students found.' 
                    : 'Type an admission number or student name to search.'}
                </div>
              ) : (
                regSiblingCandidates.map(c => (
                  <div key={c.id} className="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded transition">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-semibold text-slate-900 text-xs">{c.admissionNumber}</span>
                        <span className="font-medium text-slate-800 text-xs">{c.fullName}</span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
                          Grade {c.currentGrade}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
                        <span>Family: <strong className="text-slate-700">{c.familyCode}</strong></span>
                        {c.fatherName && <span>· Father: {c.fatherName}</span>}
                        {c.motherName && <span>· Mother: {c.motherName}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectRegSibling(c)}
                      className="px-3 py-1 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800 transition shrink-0 ml-3"
                    >
                      Select Sibling
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setIsRegSiblingModalOpen(false)}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded font-medium text-slate-700 hover:bg-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sibling Link Modal in Student Profile (Stage 08) */}
      {isLinkSiblingModalOpen && studentDetail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Link Existing Sibling</h3>
                <p className="text-xs text-slate-500">
                  Destination Family: {studentDetail.familyCode} ({studentDetail.fullName} · {studentDetail.admissionNumber})
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsLinkSiblingModalOpen(false);
                  setSelectedCandidateToLink(null);
                  setMergePreview(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search student to link by name or admission number..."
                  value={linkSiblingSearchTerm}
                  onChange={e => handleSearchLinkCandidates(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded bg-white focus:ring-1 focus:ring-slate-900"
                  autoFocus
                />
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1 divide-y divide-slate-100 max-h-96">
              {isSearchingLinkSiblings ? (
                <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center space-x-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Searching candidate students...</span>
                </div>
              ) : linkSiblingCandidates.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  {linkSiblingSearchTerm.trim() 
                    ? 'No candidate students found (already linked students are excluded).' 
                    : 'Type an admission number or student name to find a sibling.'}
                </div>
              ) : (
                linkSiblingCandidates.map(c => {
                  const isSelected = selectedCandidateToLink?.id === c.id;
                  return (
                    <div 
                      key={c.id} 
                      onClick={() => handleSelectCandidateToLink(c)}
                      className={`py-3 px-3 rounded-lg cursor-pointer transition flex items-center justify-between border ${
                        isSelected ? 'border-slate-900 bg-slate-50' : 'border-transparent hover:bg-slate-50'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-semibold text-slate-900 text-xs">{c.admissionNumber}</span>
                          <span className="font-medium text-slate-800 text-xs">{c.fullName}</span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
                            Grade {c.currentGrade}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
                          <span>Current Family: <strong className="text-slate-700">{c.familyCode}</strong></span>
                          {c.fatherName && <span>· Father: {c.fatherName}</span>}
                          {c.motherName && <span>· Mother: {c.motherName}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 ml-3">
                        <input
                          type="radio"
                          name="selectedSiblingCandidate"
                          checked={isSelected}
                          onChange={() => handleSelectCandidateToLink(c)}
                          className="text-slate-900 focus:ring-slate-900"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Merge Comparison & Conflict Resolution Area */}
            {isLoadingMergePreview && (
              <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs flex items-center justify-center space-x-2 text-slate-500">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Comparing family data and checking conflicts...</span>
              </div>
            )}

            {selectedCandidateToLink && mergePreview && !isLoadingMergePreview && (
              <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs space-y-4 max-h-72 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-slate-900 font-semibold">
                    <UserCheck className="w-4 h-4 text-slate-900" />
                    <span>Family Data Comparison & Conflict Resolution</span>
                  </div>
                  {mergePreview.hasConflicts ? (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded font-semibold text-[11px] flex items-center space-x-1">
                      <AlertCircle className="w-3.5 h-3.5 inline text-amber-600" />
                      <span>{mergePreview.conflicts.length} Conflict(s) Detected</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded font-semibold text-[11px] flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5 inline text-emerald-600" />
                      <span>No Data Conflicts</span>
                    </span>
                  )}
                </div>

                {mergePreview.sourceStudentCount > 1 && (
                  <div className="p-2.5 bg-sky-50 border border-sky-200 rounded text-sky-800 text-[11px]">
                    <strong>Note:</strong> The sibling's current family has {mergePreview.sourceStudentCount} students. All students belonging to family {mergePreview.sourceFamily.familyCode} will be merged into destination family {mergePreview.destinationFamily.familyCode}.
                  </div>
                )}

                {/* Resolution Strategy Selector */}
                <div className="space-y-2 bg-white p-3 border border-slate-200 rounded-lg">
                  <span className="font-semibold text-slate-800 block text-xs">Choose Conflict Resolution Strategy:</span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <label className={`flex items-start p-2 border rounded cursor-pointer transition ${resolutionStrategy === 'keep_destination' ? 'border-slate-900 bg-slate-50 font-medium' : 'border-slate-200'}`}>
                      <input
                        type="radio"
                        name="resolutionStrategy"
                        value="keep_destination"
                        checked={resolutionStrategy === 'keep_destination'}
                        onChange={() => setResolutionStrategy('keep_destination')}
                        className="mt-0.5 mr-2 text-slate-900"
                      />
                      <div className="text-[11px]">
                        <div className="text-slate-900 font-semibold">Keep Destination</div>
                        <div className="text-slate-500">Retain {studentDetail.fullName}'s family details</div>
                      </div>
                    </label>

                    <label className={`flex items-start p-2 border rounded cursor-pointer transition ${resolutionStrategy === 'use_source' ? 'border-slate-900 bg-slate-50 font-medium' : 'border-slate-200'}`}>
                      <input
                        type="radio"
                        name="resolutionStrategy"
                        value="use_source"
                        checked={resolutionStrategy === 'use_source'}
                        onChange={() => setResolutionStrategy('use_source')}
                        className="mt-0.5 mr-2 text-slate-900"
                      />
                      <div className="text-[11px]">
                        <div className="text-slate-900 font-semibold">Use Source Info</div>
                        <div className="text-slate-500">Adopt {selectedCandidateToLink.fullName}'s family info</div>
                      </div>
                    </label>

                    <label className={`flex items-start p-2 border rounded cursor-pointer transition ${resolutionStrategy === 'custom' ? 'border-slate-900 bg-slate-50 font-medium' : 'border-slate-200'}`}>
                      <input
                        type="radio"
                        name="resolutionStrategy"
                        value="custom"
                        checked={resolutionStrategy === 'custom'}
                        onChange={() => setResolutionStrategy('custom')}
                        className="mt-0.5 mr-2 text-slate-900"
                      />
                      <div className="text-[11px]">
                        <div className="text-slate-900 font-semibold">Custom Choices</div>
                        <div className="text-slate-500">Resolve individual fields manually</div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Differences Breakdown Table / Custom Choosers */}
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                  <div className="bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-700 grid grid-cols-12 gap-2">
                    <span className="col-span-3">Field</span>
                    <span className="col-span-4">Destination ({mergePreview.destinationStudent.fullName})</span>
                    <span className="col-span-4">Source ({mergePreview.sourceStudent.fullName})</span>
                    <span className="col-span-1 text-right">Choice</span>
                  </div>
                  <div className="divide-y divide-slate-100 text-[11px]">
                    {/* Address Row */}
                    <div className="p-3 grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3 font-semibold text-slate-800">Residence Address</div>
                      <div className="col-span-4 text-slate-600">{mergePreview.differences.address.destination || <em className="text-slate-400">Empty</em>}</div>
                      <div className="col-span-4 text-slate-600">{mergePreview.differences.address.source || <em className="text-slate-400">Empty</em>}</div>
                      <div className="col-span-1 text-right">
                        {resolutionStrategy === 'custom' ? (
                          <select
                            value={customResolution.addressChoice}
                            onChange={e => setCustomResolution(p => ({ ...p, addressChoice: e.target.value as 'destination' | 'source' }))}
                            className="text-[10px] border border-slate-300 rounded px-1 py-0.5"
                          >
                            <option value="destination">Dest</option>
                            <option value="source">Source</option>
                          </select>
                        ) : (
                          <span className="font-semibold text-slate-700 uppercase text-[10px]">
                            {resolutionStrategy === 'keep_destination' ? 'Dest' : 'Source'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Father Row */}
                    <div className="p-3 grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3 font-semibold text-slate-800">Father</div>
                      <div className="col-span-4 text-slate-600">
                        {mergePreview.differences.father.destination ? (
                          <span>{mergePreview.differences.father.destination.name} ({mergePreview.differences.father.destination.contactNumber})</span>
                        ) : <em className="text-slate-400">None</em>}
                      </div>
                      <div className="col-span-4 text-slate-600">
                        {mergePreview.differences.father.source ? (
                          <span>{mergePreview.differences.father.source.name} ({mergePreview.differences.father.source.contactNumber})</span>
                        ) : <em className="text-slate-400">None</em>}
                      </div>
                      <div className="col-span-1 text-right">
                        {resolutionStrategy === 'custom' ? (
                          <select
                            value={customResolution.fatherChoice}
                            onChange={e => setCustomResolution(p => ({ ...p, fatherChoice: e.target.value as 'destination' | 'source' }))}
                            className="text-[10px] border border-slate-300 rounded px-1 py-0.5"
                          >
                            <option value="destination">Dest</option>
                            <option value="source">Source</option>
                          </select>
                        ) : (
                          <span className="font-semibold text-slate-700 uppercase text-[10px]">
                            {resolutionStrategy === 'keep_destination' ? 'Dest' : 'Source'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Mother Row */}
                    <div className="p-3 grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3 font-semibold text-slate-800">Mother</div>
                      <div className="col-span-4 text-slate-600">
                        {mergePreview.differences.mother.destination ? (
                          <span>{mergePreview.differences.mother.destination.name} ({mergePreview.differences.mother.destination.contactNumber})</span>
                        ) : <em className="text-slate-400">None</em>}
                      </div>
                      <div className="col-span-4 text-slate-600">
                        {mergePreview.differences.mother.source ? (
                          <span>{mergePreview.differences.mother.source.name} ({mergePreview.differences.mother.source.contactNumber})</span>
                        ) : <em className="text-slate-400">None</em>}
                      </div>
                      <div className="col-span-1 text-right">
                        {resolutionStrategy === 'custom' ? (
                          <select
                            value={customResolution.motherChoice}
                            onChange={e => setCustomResolution(p => ({ ...p, motherChoice: e.target.value as 'destination' | 'source' }))}
                            className="text-[10px] border border-slate-300 rounded px-1 py-0.5"
                          >
                            <option value="destination">Dest</option>
                            <option value="source">Source</option>
                          </select>
                        ) : (
                          <span className="font-semibold text-slate-700 uppercase text-[10px]">
                            {resolutionStrategy === 'keep_destination' ? 'Dest' : 'Source'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Guardian Row */}
                    <div className="p-3 grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3 font-semibold text-slate-800">Guardian</div>
                      <div className="col-span-4 text-slate-600">
                        {mergePreview.differences.guardian.destination ? (
                          <span>{mergePreview.differences.guardian.destination.name} ({mergePreview.differences.guardian.destination.contactNumber})</span>
                        ) : <em className="text-slate-400">None</em>}
                      </div>
                      <div className="col-span-4 text-slate-600">
                        {mergePreview.differences.guardian.source ? (
                          <span>{mergePreview.differences.guardian.source.name} ({mergePreview.differences.guardian.source.contactNumber})</span>
                        ) : <em className="text-slate-400">None</em>}
                      </div>
                      <div className="col-span-1 text-right">
                        {resolutionStrategy === 'custom' ? (
                          <select
                            value={customResolution.guardianChoice}
                            onChange={e => setCustomResolution(p => ({ ...p, guardianChoice: e.target.value as 'destination' | 'source' }))}
                            className="text-[10px] border border-slate-300 rounded px-1 py-0.5"
                          >
                            <option value="destination">Dest</option>
                            <option value="source">Source</option>
                          </select>
                        ) : (
                          <span className="font-semibold text-slate-700 uppercase text-[10px]">
                            {resolutionStrategy === 'keep_destination' ? 'Dest' : 'Source'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-slate-500 text-[11px]">
                  <strong>Zero Silent Data Loss:</strong> Non-conflicting details are preserved automatically. Academic information, notes, and fees remain isolated to individual students. If you cancel, no changes are made to the database.
                </p>
              </div>
            )}

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setIsLinkSiblingModalOpen(false);
                  setSelectedCandidateToLink(null);
                  setMergePreview(null);
                }}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded font-medium text-slate-700 hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedCandidateToLink || isSubmittingLinkSibling || isLoadingMergePreview}
                onClick={handleConfirmLinkSibling}
                className="px-4 py-1.5 text-xs bg-slate-900 text-white rounded font-semibold hover:bg-slate-800 disabled:opacity-50 flex items-center space-x-1.5"
              >
                {isSubmittingLinkSibling && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Safe Sibling Link</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

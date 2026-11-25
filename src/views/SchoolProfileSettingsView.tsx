import React, { useState, useEffect, useRef } from 'react';
import { Building2, Upload, Trash2, Check, AlertCircle, Save, Phone, Mail, Globe, Hash, MapPin } from 'lucide-react';
import { Card, Button, Badge } from '../components/Card';
import { ISchoolSettings, IUpdateSchoolSettingsInput } from '../../shared/types';

export const SchoolProfileSettingsView: React.FC = () => {
  const [settings, setSettings] = useState<ISchoolSettings | null>(null);
  const [formData, setFormData] = useState<IUpdateSchoolSettingsInput>({
    schoolName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    contactNumber1: '',
    contactNumber2: '',
    email: '',
    website: '',
    regNumber: '',
    extraInfo: '',
    defaultLanguage: 'en'
  });

  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadSettings = async () => {
    try {
      setLoading(true);
      if (window.api) {
        const [res, logoRes] = await Promise.all([
          window.api.getSchoolSettings(),
          window.api.getLogoPreview()
        ]);

        if (res.success && res.data) {
          setSettings(res.data);
          setFormData({
            schoolName: res.data.schoolName || '',
            addressLine1: res.data.addressLine1 || '',
            addressLine2: res.data.addressLine2 || '',
            city: res.data.city || '',
            contactNumber1: res.data.contactNumber1 || '',
            contactNumber2: res.data.contactNumber2 || '',
            email: res.data.email || '',
            website: res.data.website || '',
            regNumber: res.data.regNumber || '',
            extraInfo: res.data.extraInfo || '',
            defaultLanguage: res.data.defaultLanguage || 'en'
          });
        }

        if (logoRes.success && logoRes.data) {
          setLogoPreview(logoRes.data);
        } else {
          setLogoPreview(null);
        }
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setSuccessMsg(null);
    setErrorMsg(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.schoolName.trim()) {
      setErrorMsg('School Name is required.');
      return;
    }

    try {
      setSaving(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      if (window.api) {
        const res = await window.api.updateSchoolSettings(formData);
        if (!res.success) {
          setErrorMsg(res.error || 'Failed to update school settings.');
        } else {
          setSuccessMsg('School settings saved successfully.');
          if (res.data) setSettings(res.data);
        }
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogoFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size on client side
    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('Logo file exceeds 2MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setUploadingLogo(true);
        setErrorMsg(null);
        setSuccessMsg(null);

        const base64String = (reader.result as string).split(',')[1];
        if (window.api) {
          const res = await window.api.uploadLogo(file.name, base64String);
          if (!res.success) {
            setErrorMsg(res.error || 'Failed to upload logo.');
          } else {
            setSuccessMsg('School logo updated successfully.');
            if (res.data) {
              setLogoPreview(res.data.previewUrl);
            }
          }
        }
      } catch (err) {
        setErrorMsg((err as Error).message);
      } finally {
        setUploadingLogo(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = async () => {
    if (!window.confirm('Are you sure you want to remove the school logo?')) return;
    try {
      setUploadingLogo(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      if (window.api) {
        const res = await window.api.removeLogo();
        if (!res.success) {
          setErrorMsg(res.error || 'Failed to remove logo.');
        } else {
          setSuccessMsg('School logo removed.');
          setLogoPreview(null);
        }
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setUploadingLogo(false);
    }
  };

  if (loading) {
    return <div className="text-xs text-slate-500 py-6">Loading school settings...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Alert Notices */}
      {successMsg && (
        <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3.5 py-2.5 rounded-md">
          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center space-x-2 bg-rose-50 border border-rose-200 text-rose-800 text-xs px-3.5 py-2.5 rounded-md">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Logo & Branding */}
        <Card title="School Branding & Logo" subtitle="Official crest and institutional identity">
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-6 py-2">
            <div className="w-24 h-24 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 overflow-hidden relative flex-shrink-0">
              {logoPreview ? (
                <img src={logoPreview} alt="School Crest" className="w-full h-full object-contain p-1" />
              ) : (
                <div className="flex flex-col items-center text-slate-400">
                  <Building2 className="w-8 h-8 mb-1" />
                  <span className="text-[10px] font-medium">No Logo</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleLogoFileSelect}
                  accept=".png,.jpg,.jpeg"
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo}
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  {uploadingLogo ? 'Processing...' : 'Upload Crest (PNG/JPG)'}
                </Button>

                {logoPreview && (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={handleRemoveLogo}
                    disabled={uploadingLogo}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Recommended dimensions: 256x256 or 512x512. Max file size: 2MB. Stored locally offline.
              </p>
            </div>
          </div>
        </Card>

        {/* Section 2: General Information */}
        <Card title="Institutional Information" subtitle="Official name and registration details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                School Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="schoolName"
                value={formData.schoolName}
                onChange={handleChange}
                required
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
                placeholder="e.g. SWRDB College / Curtiss Model School"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center space-x-1">
                <Hash className="w-3 h-3 text-slate-400" />
                <span>Registration / Identification Number</span>
              </label>
              <input
                type="text"
                name="regNumber"
                value={formData.regNumber || ''}
                onChange={handleChange}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
                placeholder="e.g. ED/WP/10492"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Default Application Language
              </label>
              <select
                name="defaultLanguage"
                value={formData.defaultLanguage}
                onChange={handleChange}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none bg-white"
              >
                <option value="en">English (Default)</option>
                <option value="si">Sinhala</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Section 3: Contact & Web Information */}
        <Card title="Contact Channels" subtitle="Telephones, official email and web address">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center space-x-1">
                <Phone className="w-3 h-3 text-slate-400" />
                <span>Primary Telephone (10 Digits)</span>
              </label>
              <input
                type="text"
                name="contactNumber1"
                value={formData.contactNumber1 || ''}
                onChange={handleChange}
                maxLength={10}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
                placeholder="e.g. 0112345678"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center space-x-1">
                <Phone className="w-3 h-3 text-slate-400" />
                <span>Secondary Telephone (Optional)</span>
              </label>
              <input
                type="text"
                name="contactNumber2"
                value={formData.contactNumber2 || ''}
                onChange={handleChange}
                maxLength={10}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
                placeholder="e.g. 0771234567"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center space-x-1">
                <Mail className="w-3 h-3 text-slate-400" />
                <span>Email Address</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email || ''}
                onChange={handleChange}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
                placeholder="info@school.edu.lk"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center space-x-1">
                <Globe className="w-3 h-3 text-slate-400" />
                <span>Website</span>
              </label>
              <input
                type="text"
                name="website"
                value={formData.website || ''}
                onChange={handleChange}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
                placeholder="https://www.school.edu.lk"
              />
            </div>
          </div>
        </Card>

        {/* Section 4: Physical Address */}
        <Card title="Physical Address" subtitle="Postal address and geographic location">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center space-x-1">
                <MapPin className="w-3 h-3 text-slate-400" />
                <span>Address Line 1</span>
              </label>
              <input
                type="text"
                name="addressLine1"
                value={formData.addressLine1 || ''}
                onChange={handleChange}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
                placeholder="Street address or estate"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Address Line 2 (Optional)</label>
              <input
                type="text"
                name="addressLine2"
                value={formData.addressLine2 || ''}
                onChange={handleChange}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
                placeholder="Area or locality"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">City / Town</label>
              <input
                type="text"
                name="city"
                value={formData.city || ''}
                onChange={handleChange}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
                placeholder="e.g. Colombo, Kandy"
              />
            </div>
          </div>
        </Card>

        {/* Form Actions */}
        <div className="flex items-center justify-end space-x-3 pt-2">
          <Button type="button" variant="outline" onClick={loadSettings} disabled={saving}>
            Reset Changes
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {saving ? 'Saving...' : 'Save School Profile'}
          </Button>
        </div>
      </form>
    </div>
  );
};

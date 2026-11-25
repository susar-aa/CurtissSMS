import React, { useState, useEffect, useCallback } from 'react';
import { 
  Building, 
  MapPin, 
  Briefcase, 
  Bus, 
  Home, 
  Plus, 
  Search, 
  Edit2, 
  Check, 
  X, 
  Trash2, 
  AlertCircle,
  Palette
} from 'lucide-react';
import { Card, Button, Badge } from '../components/Card';
import { LookupCategory, ILookupItem, ICreateLookupInput, IUpdateLookupInput } from '../../shared/types';

const HOUSE_COLOR_PALETTE = [
  { name: 'Red', hex: '#EF4444' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Green', hex: '#10B981' },
  { name: 'Yellow', hex: '#F59E0B' },
  { name: 'Purple', hex: '#8B5CF6' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Indigo', hex: '#6366F1' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Teal', hex: '#14B8A6' },
  { name: 'Cyan', hex: '#06B6D4' },
  { name: 'Maroon', hex: '#881337' },
  { name: 'Slate', hex: '#475569' },
];

export const LookupManagementView: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<LookupCategory>('houses');
  const [items, setItems] = useState<ILookupItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [includeInactive, setIncludeInactive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ILookupItem | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [colorInput, setColorInput] = useState('#3B82F6');
  const [postalCodeInput, setPostalCodeInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!window.api) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await window.api.searchLookups(activeCategory, searchQuery, includeInactive);
      if (res.success && res.data) {
        setItems(res.data);
      } else {
        setErrorMsg(res.error || 'Failed to load lookup items.');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, searchQuery, includeInactive]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setNameInput('');
    setColorInput('#3B82F6');
    setPostalCodeInput('');
    setErrorMsg(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (item: ILookupItem) => {
    setEditingItem(item);
    setNameInput(item.name);
    setColorInput(item.colorHex || '#3B82F6');
    setPostalCodeInput(item.postalCode || '');
    setErrorMsg(null);
    setIsDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.api) return;

    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      setErrorMsg('Name is required.');
      return;
    }

    try {
      setActionLoading(true);
      setErrorMsg(null);

      if (editingItem) {
        const updatePayload: IUpdateLookupInput = {
          category: activeCategory,
          id: editingItem.id,
          name: trimmedName,
          colorHex: activeCategory === 'houses' ? colorInput : undefined,
          postalCode: activeCategory === 'cities' ? postalCodeInput.trim() : undefined,
        };
        const res = await window.api.updateLookup(updatePayload);
        if (!res.success) {
          setErrorMsg(res.error || 'Failed to update entry.');
          return;
        }
        setSuccessMsg(`"${trimmedName}" updated successfully.`);
      } else {
        const createPayload: ICreateLookupInput = {
          category: activeCategory,
          name: trimmedName,
          colorHex: activeCategory === 'houses' ? colorInput : undefined,
          postalCode: activeCategory === 'cities' ? postalCodeInput.trim() : undefined,
        };
        const res = await window.api.createLookup(createPayload);
        if (!res.success) {
          setErrorMsg(res.error || 'Failed to create entry.');
          return;
        }
        setSuccessMsg(`"${trimmedName}" created successfully.`);
      }

      setIsDialogOpen(false);
      await fetchItems();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleActive = async (item: ILookupItem) => {
    if (!window.api) return;
    try {
      setErrorMsg(null);
      const res = await window.api.setLookupActive(activeCategory, item.id, !item.isActive);
      if (res.success) {
        setSuccessMsg(`"${item.name}" ${!item.isActive ? 'activated' : 'deactivated'} successfully.`);
        await fetchItems();
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setErrorMsg(res.error || 'Failed to change status.');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleDelete = async (item: ILookupItem) => {
    if (!window.api) return;
    if (item.usageCount && item.usageCount > 0) {
      setErrorMsg(`Cannot delete "${item.name}" because it is associated with ${item.usageCount} record(s). Deactivate it instead.`);
      return;
    }

    const confirmDelete = window.confirm(`Are you sure you want to permanently delete "${item.name}"?`);
    if (!confirmDelete) return;

    try {
      setErrorMsg(null);
      const res = await window.api.deleteLookup(activeCategory, item.id);
      if (res.success) {
        setSuccessMsg(`"${item.name}" deleted successfully.`);
        await fetchItems();
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setErrorMsg(res.error || 'Failed to delete item.');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const categoriesConfig: Array<{ id: LookupCategory; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'houses', label: 'Houses', icon: Home },
    { id: 'occupations', label: 'Occupations', icon: Briefcase },
    { id: 'streets', label: 'Streets / Estates', icon: MapPin },
    { id: 'cities', label: 'Cities', icon: Building },
    { id: 'transportation_methods', label: 'Transport Methods', icon: Bus },
  ];

  return (
    <div className="space-y-4">
      {/* Category Pills Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {categoriesConfig.map(cat => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id);
                setSearchQuery('');
              }}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Action Header & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2 flex-1 max-w-sm">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${categoriesConfig.find(c => c.id === activeCategory)?.label}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-md text-xs bg-white focus:outline-none focus:border-slate-800"
            />
          </div>
          <label className="flex items-center space-x-1.5 text-xs text-slate-600 whitespace-nowrap cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="rounded border-slate-300 text-slate-900 focus:ring-0"
            />
            <span>Show Inactive</span>
          </label>
        </div>

        <Button
          variant="primary"
          onClick={handleOpenCreate}
          className="flex items-center justify-center space-x-1.5 text-xs py-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add {categoriesConfig.find(c => c.id === activeCategory)?.label.replace(/s$/, '')}</span>
        </Button>
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-500 hover:text-red-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-900">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Lookups Table */}
      <Card
        title={categoriesConfig.find(c => c.id === activeCategory)?.label || 'Lookups'}
        subtitle={`Total items: ${items.length}`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800 divide-y divide-slate-100">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-2 px-3">Name</th>
                {activeCategory === 'houses' && <th className="py-2 px-3">Color</th>}
                {activeCategory === 'cities' && <th className="py-2 px-3">Postal Code</th>}
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Usage</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">Loading records...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No entries found in this category.
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      <div className="flex items-center space-x-2">
                        {activeCategory === 'houses' && item.colorHex && (
                          <span
                            className="w-3 h-3 rounded-full border border-slate-300 flex-shrink-0 shadow-sm"
                            style={{ backgroundColor: item.colorHex }}
                          />
                        )}
                        <span className={item.isActive ? '' : 'text-slate-400 line-through'}>
                          {item.name}
                        </span>
                      </div>
                    </td>

                    {activeCategory === 'houses' && (
                      <td className="py-2.5 px-3">
                        <div className="flex items-center space-x-1.5 font-mono text-[11px] text-slate-600">
                          <span
                            className="w-2.5 h-2.5 rounded-sm border border-slate-200"
                            style={{ backgroundColor: item.colorHex || '#ccc' }}
                          />
                          <span>{item.colorHex || 'N/A'}</span>
                        </div>
                      </td>
                    )}

                    {activeCategory === 'cities' && (
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {item.postalCode || '—'}
                      </td>
                    )}

                    <td className="py-2.5 px-3">
                      <Badge variant={item.isActive ? 'active' : 'inactive'}>
                        {item.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>

                    <td className="py-2.5 px-3">
                      <span className="text-slate-500 font-mono text-[11px]">
                        {item.usageCount ?? 0} ref(s)
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="p-1 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-200 transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(item)}
                          className={`p-1 rounded transition-colors ${
                            item.isActive 
                              ? 'text-amber-700 hover:bg-amber-100' 
                              : 'text-emerald-700 hover:bg-emerald-100'
                          }`}
                          title={item.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {item.isActive ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          disabled={Boolean(item.usageCount && item.usageCount > 0)}
                          className={`p-1 rounded transition-colors ${
                            item.usageCount && item.usageCount > 0
                              ? 'text-slate-300 cursor-not-allowed'
                              : 'text-red-600 hover:text-red-800 hover:bg-red-50'
                          }`}
                          title={item.usageCount && item.usageCount > 0 ? 'Cannot delete: record in use' : 'Delete'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal Dialog for Create/Edit */}
      {isDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <span className="font-semibold text-xs tracking-wide uppercase">
                {editingItem ? 'Edit Entry' : 'Add New Entry'}
              </span>
              <button
                onClick={() => setIsDialogOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-4 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Enter name..."
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:outline-none focus:border-slate-800 text-xs"
                />
              </div>

              {activeCategory === 'houses' && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1 flex items-center justify-between">
                    <span>House Color</span>
                    <span className="font-mono text-slate-500">{colorInput}</span>
                  </label>
                  <div className="grid grid-cols-6 gap-2 mb-2 p-2 bg-slate-50 border border-slate-200 rounded">
                    {HOUSE_COLOR_PALETTE.map(c => (
                      <button
                        type="button"
                        key={c.hex}
                        onClick={() => setColorInput(c.hex)}
                        className={`h-7 rounded border flex items-center justify-center transition-transform ${
                          colorInput.toUpperCase() === c.hex.toUpperCase()
                            ? 'ring-2 ring-slate-900 scale-105'
                            : 'border-slate-200 hover:scale-105'
                        }`}
                        style={{ backgroundColor: c.hex }}
                        title={c.name}
                      >
                        {colorInput.toUpperCase() === c.hex.toUpperCase() && (
                          <Check className="w-3.5 h-3.5 text-white drop-shadow" />
                        )}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={colorInput}
                    onChange={(e) => setColorInput(e.target.value)}
                    placeholder="#3B82F6"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono uppercase focus:outline-none focus:border-slate-800 text-xs"
                  />
                </div>
              )}

              {activeCategory === 'cities' && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Postal Code (Optional)
                  </label>
                  <input
                    type="text"
                    value={postalCodeInput}
                    onChange={(e) => setPostalCodeInput(e.target.value)}
                    placeholder="e.g. 10100"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded focus:outline-none focus:border-slate-800 text-xs"
                  />
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Saving...' : 'Save Entry'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

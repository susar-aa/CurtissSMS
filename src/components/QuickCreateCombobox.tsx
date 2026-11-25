import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Plus, Check, ChevronDown, X, Loader2 } from 'lucide-react';
import { ILookupItem, LookupCategory } from '../../electron/shared/types';

export interface IComboboxItem {
  id: number | string;
  name: string;
  colorHex?: string;
  postalCode?: string;
  isActive?: boolean;
}

interface QuickCreateComboboxProps {
  id?: string;
  label: string;
  category?: LookupCategory | string;
  items: (IComboboxItem | ILookupItem)[];
  value: number | string | null | undefined;
  onChange: (id: any, item?: any) => void;
  onItemCreated?: (newItem: any) => Promise<void> | void;
  onNextField?: () => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  allowCreate?: boolean;
}

const DEFAULT_HOUSE_COLORS = [
  '#DC2626', '#EA580C', '#D97706', '#16A34A',
  '#059669', '#0284C7', '#2563EB', '#7C3AED',
  '#DB2777', '#475569'
];

export const QuickCreateCombobox: React.FC<QuickCreateComboboxProps> = ({
  id,
  label,
  category,
  items,
  value,
  onChange,
  onItemCreated,
  onNextField,
  placeholder,
  required = false,
  disabled = false,
  allowCreate
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>('#2563EB');
  const [isCreating, setIsCreating] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Whether creation is supported
  const isCreateAllowed = useMemo(() => {
    if (allowCreate !== undefined) return allowCreate;
    return !!category && ['houses', 'transportation_methods', 'streets', 'cities', 'occupations'].includes(category);
  }, [allowCreate, category]);

  // Selected item lookup
  const selectedItem = useMemo(() => {
    if (value === null || value === undefined || value === '') return null;
    return items.find(item => String(item.id) === String(value)) || null;
  }, [items, value]);

  // Active items filtered by search
  const filteredItems = useMemo(() => {
    const active = items.filter(i => i.isActive !== false);
    if (!searchTerm.trim()) return active;
    const term = searchTerm.trim().toLowerCase();
    return active.filter(item => 
      item.name.toLowerCase().includes(term) ||
      (item.postalCode && item.postalCode.toLowerCase().includes(term))
    );
  }, [items, searchTerm]);

  // Check if search matches an existing item exactly (case-insensitive)
  const exactMatch = useMemo(() => {
    if (!searchTerm.trim()) return null;
    const term = searchTerm.trim().toLowerCase();
    return items.find(i => i.name.toLowerCase() === term) || null;
  }, [items, searchTerm]);

  const canCreateNew = useMemo(() => {
    return isCreateAllowed && searchTerm.trim().length > 0 && !exactMatch;
  }, [isCreateAllowed, searchTerm, exactMatch]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // When dropdown opens, focus input
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(-1);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 25);
    }
  }, [isOpen]);

  // Advance to next field helper
  const triggerNextField = () => {
    if (onNextField) {
      setTimeout(() => {
        onNextField();
      }, 30);
    }
  };

  // Handle selecting an item
  const handleSelectItem = (item: IComboboxItem | ILookupItem) => {
    onChange(item.id, item);
    setIsOpen(false);
    setSearchTerm('');
    triggerNextField();
  };

  // Handle creating new item
  const handleCreate = async (nameToCreate: string) => {
    let trimmed = nameToCreate.trim();
    if (!trimmed || isCreating || !window.api || !category) return;

    let postalCode: string | undefined = undefined;
    if (category === 'cities') {
      const match = trimmed.match(/^(.*?)[,\s]+\(?(\d{4,6})\)?$/);
      if (match) {
        trimmed = match[1].trim();
        postalCode = match[2].trim();
      }
    }

    try {
      setIsCreating(true);
      const res = await window.api.quickCreate({
        category: category as LookupCategory,
        name: trimmed,
        postalCode,
        colorHex: category === 'houses' ? selectedColor : undefined
      });

      if (res.success && res.data) {
        const created = res.data;
        if (onItemCreated) {
          await onItemCreated(created);
        }
        onChange(created.id, created);
        setIsOpen(false);
        setSearchTerm('');
        triggerNextField();
      }
    } catch (err) {
      console.error('Quick create error:', err);
    } finally {
      setIsCreating(false);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'Tab') {
      setIsOpen(false);
      setSearchTerm('');
      if (!e.shiftKey) {
        e.preventDefault();
        triggerNextField();
      }
      return;
    }

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    const totalSelectable = filteredItems.length + (canCreateNew ? 1 : 0);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1 < totalSelectable ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 >= 0 ? prev - 1 : totalSelectable - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      
      // If user highlighted a specific item
      if (highlightedIndex >= 0 && highlightedIndex < filteredItems.length) {
        handleSelectItem(filteredItems[highlightedIndex]);
        return;
      }
      
      // If user highlighted the Create option
      if (highlightedIndex === filteredItems.length && canCreateNew) {
        handleCreate(searchTerm);
        return;
      }

      // If no exact match and creation is allowed
      if (canCreateNew && filteredItems.length === 0) {
        handleCreate(searchTerm);
        return;
      }

      // If search matches exactly one item
      if (filteredItems.length === 1) {
        handleSelectItem(filteredItems[0]);
        return;
      }

      // If user typed something and creation is allowed, create it
      if (canCreateNew) {
        handleCreate(searchTerm);
        return;
      }

      // If an item is already selected, accept it and advance
      if (selectedItem) {
        setIsOpen(false);
        setSearchTerm('');
        triggerNextField();
        return;
      }

      // If items exist and none is selected, select the first one
      if (filteredItems.length > 0) {
        handleSelectItem(filteredItems[0]);
        return;
      }

      // Otherwise just close and advance
      setIsOpen(false);
      setSearchTerm('');
      triggerNextField();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  const categoryDisplayName = category ? category.replace(/_/g, ' ').replace(/s$/, '') : label.toLowerCase();

  return (
    <div className="relative" ref={containerRef}>
      {/* Label */}
      <label className="block text-xs font-medium text-slate-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      {/* Main Trigger / Search Field */}
      <div className="relative">
        <div
          id={id}
          ref={triggerRef}
          tabIndex={disabled ? -1 : 0}
          onFocus={() => {
            if (!disabled && !isOpen) {
              setIsOpen(true);
            }
          }}
          onClick={() => {
            if (!disabled) {
              setIsOpen(true);
              inputRef.current?.focus();
            }
          }}
          onKeyDown={(e) => {
            if (disabled) return;
            if (!isOpen && (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ')) {
              e.preventDefault();
              setIsOpen(true);
            }
          }}
          className={`flex items-center w-full px-2.5 py-1.5 text-xs border rounded cursor-pointer bg-white transition outline-none ${
            isOpen ? 'border-slate-900 ring-1 ring-slate-900 shadow-xs' : 'border-slate-200 hover:border-slate-300 focus:border-slate-900 focus:ring-1 focus:ring-slate-900'
          } ${disabled ? 'bg-slate-100 cursor-not-allowed opacity-60' : ''}`}
        >
          {isOpen ? (
            <div className="flex items-center w-full">
              <Search className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setHighlightedIndex(-1);
                }}
                onKeyDown={handleKeyDown}
                placeholder={selectedItem ? selectedItem.name : (placeholder || `Search ${categoryDisplayName}...`)}
                className="w-full text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none bg-transparent"
              />
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              {selectedItem ? (
                <div className="flex items-center space-x-1.5 truncate">
                  {selectedItem.colorHex && (
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block border border-slate-300 shrink-0"
                      style={{ backgroundColor: selectedItem.colorHex }}
                    />
                  )}
                  <span className="font-medium text-slate-900 truncate">{selectedItem.name}</span>
                  {selectedItem.postalCode && (
                    <span className="text-slate-400 text-[11px]">({selectedItem.postalCode})</span>
                  )}
                </div>
              ) : (
                <span className="text-slate-400 truncate">
                  {placeholder || `Select ${categoryDisplayName}...`}
                </span>
              )}
              <div className="flex items-center space-x-1 ml-1 shrink-0">
                {selectedItem && !disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(null, null);
                    }}
                    className="p-0.5 text-slate-400 hover:text-slate-700 transition rounded"
                    title="Clear selection"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div 
          className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100"
          style={{ maxHeight: '280px' }}
        >
          {/* Scrollable Items List */}
          <div 
            ref={listRef}
            className="overflow-y-auto max-h-48 divide-y divide-slate-50 py-1"
          >
            {filteredItems.length === 0 ? (
              <div className="px-3 py-2.5 text-center text-xs text-slate-400">
                {searchTerm.trim() ? (
                  <span>No matches found for <strong className="text-slate-700">"{searchTerm.trim()}"</strong></span>
                ) : (
                  <span>No options available</span>
                )}
              </div>
            ) : (
              filteredItems.map((item, idx) => {
                const isSelected = String(item.id) === String(value);
                const isHighlighted = idx === highlightedIndex;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectItem(item)}
                    className={`flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer transition ${
                      isHighlighted ? 'bg-slate-100' : isSelected ? 'bg-slate-50 font-medium' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      {item.colorHex && (
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block border border-slate-300 shrink-0"
                          style={{ backgroundColor: item.colorHex }}
                        />
                      )}
                      <span className="text-slate-900 truncate">{item.name}</span>
                      {item.postalCode && (
                        <span className="text-slate-400 text-[11px]">({item.postalCode})</span>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-slate-900 shrink-0 ml-2" />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Quick Create Option at Bottom */}
          {canCreateNew && (
            <div 
              className={`border-t border-slate-100 p-2 bg-slate-50/90 transition ${
                highlightedIndex === filteredItems.length ? 'bg-slate-100' : ''
              }`}
            >
              {category === 'houses' && (
                <div className="mb-2">
                  <div className="text-[10px] text-slate-500 font-medium mb-1">Pick House Color (Optional):</div>
                  <div className="flex items-center space-x-1.5">
                    {DEFAULT_HOUSE_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedColor(c);
                        }}
                        className={`w-4 h-4 rounded-full border transition ${
                          selectedColor.toUpperCase() === c.toUpperCase() ? 'ring-2 ring-slate-900 scale-110' : 'border-slate-300'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={isCreating}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreate(searchTerm);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 rounded shadow-2xs transition group"
              >
                <div className="flex items-center space-x-1.5 truncate">
                  {isCreating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-700" />
                  ) : (
                    <Plus className="w-3.5 h-3.5 text-slate-900 group-hover:scale-110 transition shrink-0" />
                  )}
                  <span className="truncate">
                    Create <strong className="text-slate-900 font-bold">"{searchTerm.trim()}"</strong>
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-2 bg-slate-100 px-1.5 py-0.5 rounded">
                  Press ↵
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

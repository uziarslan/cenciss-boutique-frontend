import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import { BASE_UNIT_OPTIONS } from '../../utils/units';
import { SELECTABLE_CATEGORIES } from '../../pages/Products/ProductForm';

// Shared "new item" modal — mirrors the Recipe Editor's CreateIngredientModal so
// the inline-create UX is identical across Menu, Buy/Receive, Demand and POs.
// Asks for name + unit + category, then hands them to `onCreate` (async → returns
// the created product / a truthy value on success; falsy keeps the modal open).
const CreateProductModal = ({
  ctx,
  onCancel,
  onCreate,
  title = 'New item',
  description = 'Add this item to the catalog now. Inventory is updated when a stock purchase is posted.',
}) => {
  const [name, setName] = useState(ctx?.name || '');
  const [unit, setUnit] = useState(ctx?.unit || '');
  const [category, setCategory] = useState('');
  // "Other (custom)…" swaps the dropdown for a free-text field — same behaviour
  // as VendorForm / ProductForm so a user can type any category.
  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [saving, setSaving] = useState(false);

  // Keep a preset unit that isn't a standard option (e.g. carried from a line).
  const unitOptions = unit && !BASE_UNIT_OPTIONS.some((o) => o.value === unit)
    ? [{ value: unit, label: unit }, ...BASE_UNIT_OPTIONS]
    : BASE_UNIT_OPTIONS;

  const canSave = name.trim().length >= 2 && Boolean(unit) && category.trim().length >= 1 && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    const ok = await onCreate({ name: name.trim(), unit, category: category.trim() });
    if (!ok) setSaving(false); // on success the parent unmounts this modal
  };

  return createPortal(
    // z-[900] sits above page content but below SearchableSelect's portalled panel
    // (z-[1000]) so the unit/category dropdowns float over this form. Close on a
    // direct backdrop click only — don't stop propagation on the card, or the
    // dropdowns' outside-click listener won't fire.
    <div
      className="fixed inset-0 z-[900] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-white"><Plus size={15} /></div>
          <p className="text-sm font-bold text-gray-900">{title}</p>
        </div>
        <div className="space-y-3 px-4 py-4">
          <p className="text-xs text-gray-500">{description}</p>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Unit</label>
              <SearchableSelect
                options={unitOptions}
                value={unit}
                onChange={setUnit}
                placeholder="Select unit…"
                searchPlaceholder="Search units…"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500">Category</label>
                {useCustomCategory && (
                  <button
                    type="button"
                    onClick={() => { setUseCustomCategory(false); setCategory(''); }}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    Use list
                  </button>
                )}
              </div>
              {useCustomCategory ? (
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  autoFocus
                  placeholder="Type custom category…"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                />
              ) : (
                <SearchableSelect
                  options={[
                    { value: '', label: 'Select category…' },
                    ...SELECTABLE_CATEGORIES.map((c) => ({ value: c, label: c })),
                    { value: '__other__', label: 'Other (custom)…' },
                  ]}
                  value={category}
                  onChange={(v) => {
                    if (v === '__other__') { setUseCustomCategory(true); setCategory(''); }
                    else setCategory(v);
                  }}
                  placeholder="Select category…"
                  searchPlaceholder="Search categories…"
                />
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Plus size={14} /> {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CreateProductModal;

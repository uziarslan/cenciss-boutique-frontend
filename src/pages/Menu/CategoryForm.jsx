import { useState } from 'react';
import clsx from 'clsx';
import SearchableSelect from '../../components/UI/SearchableSelect';
import { SecondaryButton, PrimaryButton, inputCls, labelCls } from '../../components/UI/PremiumModal';

const PRESET_COLORS = ['#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#8B5CF6'];

const CategoryForm = ({ initialData = {}, onCancel, onSave, isSaving }) => {
  const [name, setName]                 = useState(initialData.name ?? '');
  const initialColor                    = initialData.color ?? PRESET_COLORS[0];
  const initialIsCustom                 = !PRESET_COLORS.includes(initialColor);
  const [color, setColor]               = useState(initialColor);
  const [isCustom, setIsCustom]         = useState(initialIsCustom);
  const [customColor, setCustomColor]   = useState(initialIsCustom ? initialColor : '#000000');
  const [isActive, setIsActive]         = useState(initialData.isActive ?? true);

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSave({ name, color, isActive });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className={labelCls}>Category name <span className="text-rose-500">*</span></label>
        <input
          aria-label="Category name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
          placeholder="e.g. Starters, Mains, Drinks"
          required
        />
      </div>

      <div>
        <label className={labelCls}>Color</label>
        <div className="flex flex-wrap items-center gap-3">
          {PRESET_COLORS.map((c) => {
            const selected = !isCustom && color === c;
            return (
              <button
                key={c}
                type="button"
                aria-label={`Choose color ${c}`}
                onClick={() => {
                  setIsCustom(false);
                  setColor(c);
                }}
                className={clsx(
                  'h-7 w-7 rounded-full border-2 transition focus:outline-none',
                  selected ? 'ring-2 ring-offset-2 ring-indigo-500 border-white' : 'border-white shadow-sm'
                )}
                style={{ backgroundColor: c }}
              />
            );
          })}

          <div className="relative h-7 w-7">
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setIsCustom(true);
                setColor(customColor);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsCustom(true); setColor(customColor); } }}
              aria-label="Choose custom color"
              className={clsx(
                'h-7 w-7 rounded-full border-2 transition focus:outline-none',
                isCustom ? 'ring-2 ring-offset-2 ring-indigo-500 border-white' : 'border-white shadow-sm'
              )}
              style={isCustom
                ? { backgroundColor: customColor }
                : { backgroundImage: 'linear-gradient(90deg,#ef4444,#f97316,#f59e0b,#10b981,#06b6d4,#3b82f6,#8b5cf6)' }}
            />
            <input
              type="color"
              aria-label="Custom color picker"
              value={customColor}
              onClick={() => { setIsCustom(true); setColor(customColor); }}
              onFocus={() => { setIsCustom(true); setColor(customColor); }}
              onChange={(e) => {
                setCustomColor(e.target.value);
                setColor(e.target.value);
                setIsCustom(true);
              }}
              className="absolute inset-0 h-full w-full opacity-0 cursor-pointer rounded-full"
            />
          </div>
        </div>
      </div>

      <div>
        <label className={labelCls}>Status</label>
        <SearchableSelect
          options={[
            { value: true,  label: 'Active' },
            { value: false, label: 'Inactive' },
          ]}
          value={isActive}
          onChange={setIsActive}
        />
      </div>

      <div className="flex justify-end items-center gap-2 pt-3 border-t border-slate-100">
        <SecondaryButton type="button" onClick={onCancel} disabled={isSaving}>
          Cancel
        </SecondaryButton>
        <PrimaryButton type="submit" disabled={isSaving} accent="indigo">
          {isSaving ? 'Saving…' : initialData._id ? 'Update Category' : 'Create Category'}
        </PrimaryButton>
      </div>
    </form>
  );
};

export default CategoryForm;

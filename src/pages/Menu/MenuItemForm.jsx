import { useEffect, useRef, useState } from 'react';
import { useForm, Controller, useFieldArray, useWatch } from 'react-hook-form';
import { UtensilsCrossed, ImagePlus, X, Plus, Trash2, QrCode, Gift, ListChecks } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import AmountInput from '../../components/UI/AmountInput';
import SearchableSelect from '../../components/UI/SearchableSelect';
import PremiumModal, { SecondaryButton, PrimaryButton, inputCls, labelCls } from '../../components/UI/PremiumModal';

const ORDER_TYPE_LABELS = { 'dine-in': 'Dine-in', takeaway: 'Take Away', delivery: 'Delivery' };

const idOf = (value) => value?._id || value || '';

const toDealMenuOption = (item) => ({
  value: item._id,
  label: item.name,
  meta: item.category?.name || item.categoryName || '',
});

const DealOptionRows = ({ groupIndex, control, register, setValue, menuItems }) => {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `dealConfig.choiceGroups.${groupIndex}.options`,
  });
  const options = useWatch({ control, name: `dealConfig.choiceGroups.${groupIndex}.options` }) || [];
  const menuOptions = menuItems.map(toDealMenuOption);

  return (
    <div className="space-y-2">
      {fields.map((field, optionIndex) => {
        const selected = menuItems.find((item) => String(item._id) === String(options[optionIndex]?.menuItem));
        const variations = selected?.variations || [];
        return (
          <div key={field.id} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_4.5rem_6.5rem_auto] sm:items-end">
            <input type="hidden" {...register(`dealConfig.choiceGroups.${groupIndex}.options.${optionIndex}._id`)} />
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Menu item</label>
              <Controller
                name={`dealConfig.choiceGroups.${groupIndex}.options.${optionIndex}.menuItem`}
                control={control}
                rules={{ required: true }}
                render={({ field: itemField }) => (
                  <SearchableSelect
                    options={menuOptions}
                    value={itemField.value}
                    onChange={(value) => {
                      itemField.onChange(value);
                      setValue(`dealConfig.choiceGroups.${groupIndex}.options.${optionIndex}.variationId`, null);
                    }}
                    placeholder="Choose item"
                    searchPlaceholder="Search menu items..."
                    panelMinWidth={360}
                    size="sm"
                  />
                )}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Size</label>
              <Controller
                name={`dealConfig.choiceGroups.${groupIndex}.options.${optionIndex}.variationId`}
                control={control}
                render={({ field: variationField }) => (
                  <SearchableSelect
                    options={variations.map((variation) => ({ value: variation._id, label: variation.name }))}
                    value={variationField.value}
                    onChange={variationField.onChange}
                    placeholder={variations.length ? 'Choose size' : 'No size'}
                    disabled={!variations.length}
                    panelMinWidth={220}
                    size="sm"
                  />
                )}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Qty</label>
              <input type="number" min="1" {...register(`dealConfig.choiceGroups.${groupIndex}.options.${optionIndex}.qty`, { valueAsNumber: true, min: 1 })} className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Extra price</label>
              <Controller
                name={`dealConfig.choiceGroups.${groupIndex}.options.${optionIndex}.priceAdjustment`}
                control={control}
                render={({ field: priceField }) => (
                  <AmountInput value={priceField.value ?? 0} onChange={(value) => priceField.onChange(Number(value) || 0)} className={inputCls} />
                )}
              />
            </div>
            <button type="button" onClick={() => remove(optionIndex)} className="mb-0.5 rounded-lg bg-rose-50 p-2 text-rose-600 hover:bg-rose-100" title="Remove option">
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
      <button type="button" onClick={() => append({ menuItem: '', variationId: null, qty: 1, priceAdjustment: 0 })} className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50">
        <Plus size={12} /> Add option
      </button>
    </div>
  );
};

const MenuItemForm = ({ isOpen, onClose, onSubmit, categories, menuItems = [], initialData = {}, isSaving, taxConfig = {}, outletStandardRate = 0 }) => {
  const { register, handleSubmit, reset, setValue, control, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      name: '',
      category: '',
      price: '',
      foodPandaPrice: '',
      priceMode: 'exclusive',
      itemType: 'regular',
      dealConfig: { fixedItems: [], choiceGroups: [] },
      taxRate: 0,
      serviceCharge: 0,
      pra: { itemCode: '', pctCode: '' },
      // Taxable is a standalone boolean flag (see below) — not the rate.
      taxable: true,
      description: '',
      isAvailable: true,
      isAvailableForQrOrder: true,
      variations: [],
      ...initialData,
    },
  });

  const { fields: variationFields, append: appendVariation, remove: removeVariation } = useFieldArray({
    control,
    name: 'variations',
  });
  const { fields: fixedItemFields, append: appendFixedItem, remove: removeFixedItem } = useFieldArray({
    control,
    name: 'dealConfig.fixedItems',
  });
  const { fields: choiceGroupFields, append: appendChoiceGroup, remove: removeChoiceGroup } = useFieldArray({
    control,
    name: 'dealConfig.choiceGroups',
  });
  // Once any size has a name, pricing is driven by the sizes, not the base price.
  const watchedVariations = useWatch({ control, name: 'variations' });
  const itemType = useWatch({ control, name: 'itemType' }) || 'regular';
  const hasVariations = itemType !== 'deal' && Array.isArray(watchedVariations)
    && watchedVariations.some((v) => (v?.name || '').trim() !== '');
  const fixedItems = useWatch({ control, name: 'dealConfig.fixedItems' }) || [];
  const eligibleDealItems = menuItems.filter((item) => (
    (item.itemType || 'regular') === 'regular' && String(item._id) !== String(initialData?._id || '')
  ));
  const dealMenuOptions = eligibleDealItems.map(toDealMenuOption);

  // Tax & service charge are managed centrally per outlet (Settings → Tax & PRA).
  // The form only displays them and lets you flag an item taxable or exempt.
  // standardRate prefers the parent's cached outlet rate (always present, sane
  // default) so the taxable flag is never zeroed by a not-yet-loaded config.
  const parsedOutletRate = Number(outletStandardRate);
  const standardRate = Number.isFinite(parsedOutletRate)
    ? parsedOutletRate
    : Number(taxConfig?.standardRate ?? 0);
  const effectiveCardRate = taxConfig?.cardReducedEnabled === false
    ? standardRate
    : Number(taxConfig?.cardRate ?? standardRate);
  const serviceChargeRate = Number(taxConfig?.serviceChargeRate ?? 0);
  const scOrderTypes = Array.isArray(taxConfig?.serviceChargeOrderTypes) ? taxConfig.serviceChargeOrderTypes : [];
  // Taxable is its own boolean flag, independent of the async config. The stored
  // per-item taxRate is just a marker (>0 = taxable); the real % comes from the
  // outlet config at checkout.
  const isTaxable = useWatch({ control, name: 'taxable' });
  const priceMode = useWatch({ control, name: 'priceMode' });

  // Image state: imageFile is a newly-picked File; removeImage flags removal of
  // an existing image; preview is the data URL / existing URL shown in the modal.
  const fileInputRef = useRef(null);
  const [imageFile, setImageFile] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [preview, setPreview] = useState(initialData?.imageUrl || '');

  useEffect(() => {
    const norm = {
      ...initialData,
      // Derive the taxable flag from the stored taxRate (>0 = taxable).
      taxable: (initialData?.taxRate ?? 0) > 0,
      priceMode: initialData?.priceMode === 'inclusive' ? 'inclusive' : 'exclusive',
      itemType: initialData?.itemType === 'deal' ? 'deal' : 'regular',
      dealConfig: {
        fixedItems: (initialData?.dealConfig?.fixedItems || []).map((component) => ({
          _id: component._id,
          menuItem: idOf(component.menuItem),
          variationId: idOf(component.variationId) || null,
          qty: component.qty || 1,
          sortOrder: component.sortOrder || 0,
        })),
        choiceGroups: (initialData?.dealConfig?.choiceGroups || []).map((group) => ({
          _id: group._id,
          name: group.name || '',
          minSelections: group.minSelections ?? 1,
          maxSelections: group.maxSelections ?? 1,
          sortOrder: group.sortOrder || 0,
          options: (group.options || []).map((option) => ({
            _id: option._id,
            menuItem: idOf(option.menuItem),
            variationId: idOf(option.variationId) || null,
            qty: option.qty || 1,
            priceAdjustment: option.priceAdjustment || 0,
            sortOrder: option.sortOrder || 0,
          })),
        })),
      },
      // Legacy items predate this channel flag and are visible by default.
      isAvailableForQrOrder: initialData?.isAvailableForQrOrder !== false,
      category: initialData?.category?._id || initialData?.category || '',
      // Strip each variation down to the editable fields (recipes are edited in
      // the Recipe editor, not here) while preserving _id so saves merge cleanly.
      variations: (initialData?.variations || []).map((v) => ({
        _id: v._id,
        name: v.name ?? '',
        price: v.price ?? '',
        foodPandaPrice: v.foodPandaPrice ?? '',
        sortOrder: v.sortOrder ?? 0,
      })),
      pra: {
        itemCode: initialData?.pra?.itemCode || '',
        pctCode: initialData?.pra?.pctCode || '',
      },
    };
    reset(norm);
    setValue('category', norm.category);
    // Reset image state whenever a different item is loaded into the form.
    setImageFile(null);
    setRemoveImage(false);
    setPreview(initialData?.imageUrl || '');
  }, [initialData, reset, setValue]);

  if (!isOpen) return null;

  const handleFilePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Only JPEG, PNG, and WebP images are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5 MB or smaller.');
      return;
    }
    setImageFile(file);
    setRemoveImage(false);
    setPreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImageFile(null);
    setPreview('');
    // Only flag server-side removal if there was an existing stored image.
    setRemoveImage(Boolean(initialData?.imageUrl));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submit = handleSubmit((data) => {
    const cleanVariations = (data.variations || [])
      .filter((v) => (v.name || '').trim() !== '' && v.price !== '' && v.price !== null && v.price !== undefined)
      .map((v, i) => ({
        ...(v._id ? { _id: v._id } : {}),
        name: v.name.trim(),
        price: Number(v.price),
        foodPandaPrice: v.foodPandaPrice === '' || v.foodPandaPrice === null || v.foodPandaPrice === undefined
          ? null
          : Number(v.foodPandaPrice),
        sortOrder: i,
      }));

    const cleanDealConfig = {
      fixedItems: (data.dealConfig?.fixedItems || [])
        .filter((component) => component.menuItem)
        .map((component, index) => ({
          ...(component._id ? { _id: component._id } : {}),
          menuItem: component.menuItem,
          variationId: component.variationId || null,
          qty: Math.max(1, Number(component.qty) || 1),
          sortOrder: index,
        })),
      choiceGroups: (data.dealConfig?.choiceGroups || [])
        .filter((group) => (group.name || '').trim() || (group.options || []).some((option) => option.menuItem))
        .map((group, groupIndex) => ({
          ...(group._id ? { _id: group._id } : {}),
          name: (group.name || '').trim(),
          minSelections: Math.max(0, Number(group.minSelections) || 0),
          maxSelections: Math.max(1, Number(group.maxSelections) || 1),
          sortOrder: groupIndex,
          options: (group.options || [])
            .filter((option) => option.menuItem)
            .map((option, optionIndex) => ({
              ...(option._id ? { _id: option._id } : {}),
              menuItem: option.menuItem,
              variationId: option.variationId || null,
              qty: Math.max(1, Number(option.qty) || 1),
              priceAdjustment: Math.max(0, Number(option.priceAdjustment) || 0),
              sortOrder: optionIndex,
            })),
        })),
    };

    if (data.itemType === 'deal') {
      if (!cleanDealConfig.fixedItems.length && !cleanDealConfig.choiceGroups.length) {
        toast.error('Add at least one fixed item or customer choice group to the deal.');
        return;
      }
      const invalidGroup = cleanDealConfig.choiceGroups.find((group) => (
        !group.name || !group.options.length || group.minSelections > group.maxSelections
      ));
      if (invalidGroup) {
        toast.error('Each choice group needs a name, options, and valid minimum/maximum choices.');
        return;
      }
    }

    const payload = {
      ...data,
      // Tax flag: taxable items store the outlet standard rate (>0); exempt = 0.
      // The actual % charged comes from the outlet config at checkout.
      taxRate: data.taxable ? standardRate : 0,
      // Service charge is the outlet's central rate at checkout; keep the stored
      // value in sync for display (it isn't used to compute the sale).
      serviceCharge: serviceChargeRate,
      pra: {
        itemCode: String(data.pra?.itemCode || '').trim(),
        pctCode: String(data.pra?.pctCode || '').replace(/[.\s-]/g, ''),
      },
      foodPandaPrice: data.foodPandaPrice === '' || data.foodPandaPrice === null || data.foodPandaPrice === undefined
        ? null
        : Number(data.foodPandaPrice),
      variations: cleanVariations,
      itemType: data.itemType === 'deal' ? 'deal' : 'regular',
      dealConfig: data.itemType === 'deal'
        ? cleanDealConfig
        : { fixedItems: [], choiceGroups: [] },
      isAvailable: data.isAvailable === 'true' || data.isAvailable === true,
      isAvailableForQrOrder: data.isAvailableForQrOrder !== false,
      _imageFile: imageFile,
      _removeImage: removeImage,
    };
    // `taxable` is a UI-only flag — never persist it on the menu item.
    delete payload.taxable;
    // With sizes, the base price is derived server-side — never send an empty one.
    if (cleanVariations.length > 0 && (payload.price === '' || payload.price === null)) {
      delete payload.price;
    }
    if (payload.itemType === 'deal') payload.variations = [];
    onSubmit(payload);
  });

  return (
    <PremiumModal
      open
      onClose={isSaving ? undefined : onClose}
      icon={UtensilsCrossed}
      eyebrow={initialData._id ? 'Edit Menu Item' : 'New Menu Item'}
      title={initialData._id ? 'Edit Menu Item' : 'New Menu Item'}
      subtitle="Use the Recipe editor to link ingredients and enable inventory tracking."
      accent="indigo"
      size="lg"
      footer={
        <>
          <SecondaryButton type="button" onClick={onClose} disabled={isSubmitting || isSaving}>Cancel</SecondaryButton>
          <PrimaryButton type="button" onClick={submit} disabled={isSubmitting || isSaving} accent="indigo">
            {isSaving ? 'Saving…' : initialData._id ? 'Save Item' : 'Create Item'}
          </PrimaryButton>
        </>
      }
    >
      <form onSubmit={submit}>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-5">
          <Controller
            name="itemType"
            control={control}
            render={({ field }) => (
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1.5" role="group" aria-label="Menu item type">
                {[
                  { value: 'regular', label: 'Regular item', icon: UtensilsCrossed, help: 'One menu item or sizes' },
                  { value: 'deal', label: 'Deal / combo', icon: Gift, help: 'Fixed items, choices, or both' },
                ].map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => field.onChange(option.value)}
                      className={clsx(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition',
                        field.value === option.value
                          ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100'
                          : 'text-slate-500 hover:bg-white/60',
                      )}
                    >
                      <Icon size={17} className="shrink-0" />
                      <span>
                        <span className="block text-xs font-bold">{option.label}</span>
                        <span className="block text-[10px] font-normal text-slate-400">{option.help}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>Name <span className="text-rose-500">*</span></label>
              <input
                {...register('name', { required: 'Name is required.' })}
                className={clsx(inputCls, errors.name && 'border-red-300 focus:border-red-400 focus:ring-red-500/20')}
                placeholder="Item name"
              />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
            </div>

            <div>
              <label className={labelCls}>Category <span className="text-rose-500">*</span></label>
              <Controller
                name="category"
                control={control}
                rules={{ required: 'Category is required.' }}
                render={({ field }) => (
                  <SearchableSelect
                    options={categories.map((c) => ({ value: c._id, label: c.name }))}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select category"
                    error={errors.category}
                  />
                )}
              />
              {errors.category && <p className="mt-1 text-xs text-red-600">{errors.category.message}</p>}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className={labelCls}>Price {!hasVariations && <span className="text-rose-500">*</span>}</label>
              <Controller
                name="price"
                control={control}
                rules={{
                  // When sizes exist, price comes from the sizes — don't require it.
                  validate: (v) => hasVariations
                    ? true
                    : (v === '' || v === null || v === undefined)
                      ? 'Price is required.'
                      : Number(v) >= 0 || 'Must be 0 or above.',
                }}
                render={({ field }) => (
                  <AmountInput
                    value={field.value ?? ''}
                    onChange={(raw) => field.onChange(raw === '' ? '' : Number(raw))}
                    onBlur={field.onBlur}
                    disabled={hasVariations}
                    className={clsx(inputCls, hasVariations && 'opacity-50 cursor-not-allowed', errors.price && 'border-red-300')}
                    placeholder={hasVariations ? 'Set per size →' : '0.00'}
                  />
                )}
              />
              {hasVariations
                ? <p className="mt-1 text-[11px] text-slate-400">Priced per size below.</p>
                : errors.price && <p className="mt-1 text-xs text-red-600">{errors.price.message}</p>}
            </div>

            <div>
              <label className={labelCls}>Foodpanda Price</label>
              <Controller
                name="foodPandaPrice"
                control={control}
                rules={{
                  validate: (v) => v === '' || v === null || v === undefined || Number(v) >= 0 || 'Must be 0 or above.',
                }}
                render={({ field }) => (
                  <AmountInput
                    value={field.value ?? ''}
                    onChange={(raw) => field.onChange(raw === '' ? '' : Number(raw))}
                    onBlur={field.onBlur}
                    disabled={hasVariations}
                    className={clsx(inputCls, hasVariations && 'opacity-50 cursor-not-allowed', errors.foodPandaPrice && 'border-red-300')}
                    placeholder={hasVariations ? 'Set per size →' : 'Uses normal price'}
                  />
                )}
              />
              <p className="mt-1 text-[11px] text-slate-400">
                {hasVariations ? 'Priced per size below.' : 'Leave blank to use the normal price.'}
              </p>
              {errors.foodPandaPrice && <p className="mt-1 text-xs text-red-600">{errors.foodPandaPrice.message}</p>}
            </div>

            <div>
              <label className={labelCls}>Available</label>
              <Controller
                name="isAvailable"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    options={[
                      { value: true,  label: 'Yes' },
                      { value: false, label: 'No' },
                    ]}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-violet-50/60 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-100">
                  <QrCode size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Available for QR self-order</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                    Turning this off only hides the item from table QR menus; regular availability stays unchanged.
                  </p>
                </div>
              </div>
              <Controller
                name="isAvailableForQrOrder"
                control={control}
                render={({ field }) => (
                  <button
                    type="button"
                    role="switch"
                    aria-label="Available for QR self-order"
                    aria-checked={field.value !== false}
                    onClick={() => field.onChange(field.value === false)}
                    className={clsx(
                      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-4 focus:ring-indigo-100',
                      field.value !== false ? 'bg-indigo-600' : 'bg-slate-300',
                    )}
                  >
                    <span className={clsx(
                      'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                      field.value !== false ? 'translate-x-5' : 'translate-x-0.5',
                    )} />
                  </button>
                )}
              />
            </div>
          </div>

          {itemType === 'deal' && (
            <div className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                  <Gift size={17} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Deal contents</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                    Fixed items are included automatically. Choice groups ask the customer or cashier to select; use either section or combine both.
                  </p>
                </div>
              </div>

              {eligibleDealItems.length === 0 && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Create regular menu items first, then add them as deal components.
                </p>
              )}

              <div className="space-y-2 rounded-xl border border-slate-200 bg-white/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-700">Always included</p>
                    <p className="text-[10px] text-slate-400">For deals where the customer has no choice, add every item here.</p>
                  </div>
                  <button type="button" onClick={() => appendFixedItem({ menuItem: '', variationId: null, qty: 1 })} className="inline-flex items-center gap-1 rounded-lg bg-violet-100 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-200">
                    <Plus size={12} /> Add fixed item
                  </button>
                </div>

                {fixedItemFields.length === 0 ? (
                  <p className="py-1 text-[11px] text-slate-400">No fixed items.</p>
                ) : fixedItemFields.map((field, index) => {
                  const selected = eligibleDealItems.find((item) => String(item._id) === String(fixedItems[index]?.menuItem));
                  const variations = selected?.variations || [];
                  return (
                    <div key={field.id} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_4.5rem_auto] sm:items-end">
                      <input type="hidden" {...register(`dealConfig.fixedItems.${index}._id`)} />
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Menu item</label>
                        <Controller
                          name={`dealConfig.fixedItems.${index}.menuItem`}
                          control={control}
                          rules={{ required: true }}
                          render={({ field: itemField }) => (
                            <SearchableSelect
                              options={dealMenuOptions}
                              value={itemField.value}
                              onChange={(value) => {
                                itemField.onChange(value);
                                setValue(`dealConfig.fixedItems.${index}.variationId`, null);
                              }}
                              placeholder="Choose item"
                              searchPlaceholder="Search menu items..."
                              panelMinWidth={360}
                              size="sm"
                            />
                          )}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Size</label>
                        <Controller
                          name={`dealConfig.fixedItems.${index}.variationId`}
                          control={control}
                          render={({ field: variationField }) => (
                            <SearchableSelect
                              options={variations.map((variation) => ({ value: variation._id, label: variation.name }))}
                              value={variationField.value}
                              onChange={variationField.onChange}
                              placeholder={variations.length ? 'Choose size' : 'No size'}
                              disabled={!variations.length}
                              panelMinWidth={220}
                              size="sm"
                            />
                          )}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Qty</label>
                        <input type="number" min="1" {...register(`dealConfig.fixedItems.${index}.qty`, { valueAsNumber: true, min: 1 })} className={inputCls} />
                      </div>
                      <button type="button" onClick={() => removeFixedItem(index)} className="mb-0.5 rounded-lg bg-rose-50 p-2 text-rose-600 hover:bg-rose-100" title="Remove fixed item">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3 rounded-xl border border-slate-200 bg-white/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><ListChecks size={13} /> Customer choices</p>
                    <p className="text-[10px] text-slate-400">Example: choose 1 burger and choose up to 2 drinks.</p>
                  </div>
                  <button type="button" onClick={() => appendChoiceGroup({ name: '', minSelections: 1, maxSelections: 1, options: [] })} className="inline-flex items-center gap-1 rounded-lg bg-indigo-100 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-200">
                    <Plus size={12} /> Add choice group
                  </button>
                </div>

                {choiceGroupFields.length === 0 ? (
                  <p className="py-1 text-[11px] text-slate-400">No customer choices. This is correct for a fixed deal.</p>
                ) : choiceGroupFields.map((group, groupIndex) => (
                  <div key={group.id} className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                    <input type="hidden" {...register(`dealConfig.choiceGroups.${groupIndex}._id`)} />
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_auto] sm:items-end">
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Group name</label>
                        <input {...register(`dealConfig.choiceGroups.${groupIndex}.name`, { required: true })} className={inputCls} placeholder="e.g. Choose your drink" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Minimum</label>
                        <input type="number" min="0" max="50" {...register(`dealConfig.choiceGroups.${groupIndex}.minSelections`, { valueAsNumber: true, min: 0, max: 50 })} className={inputCls} />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Maximum</label>
                        <input type="number" min="1" max="50" {...register(`dealConfig.choiceGroups.${groupIndex}.maxSelections`, { valueAsNumber: true, min: 1, max: 50 })} className={inputCls} />
                      </div>
                      <button type="button" onClick={() => removeChoiceGroup(groupIndex)} className="mb-0.5 rounded-lg bg-rose-50 p-2 text-rose-600 hover:bg-rose-100" title="Remove choice group">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <DealOptionRows
                      groupIndex={groupIndex}
                      control={control}
                      register={register}
                      setValue={setValue}
                      menuItems={eligibleDealItems}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tax & service charge — managed centrally per outlet ───────────── */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">Tax &amp; service charge</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Rates are managed per outlet in Settings → Tax &amp; PRA and applied automatically at checkout.
              </p>
            </div>

            <Controller
              name="priceMode"
              control={control}
              render={({ field }) => (
                <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-white p-1 shadow-sm" role="group" aria-label="Price charge treatment">
                  {[
                    { value: 'exclusive', label: 'Excluding' },
                    { value: 'inclusive', label: 'Including' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => field.onChange(option.value)}
                      className={clsx(
                        'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                        field.value === option.value
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            />
            <p className="text-[11px] leading-relaxed text-slate-500">
              {priceMode === 'inclusive'
                ? 'The entered price includes both applicable tax/GST and service charge. They will be extracted at checkout.'
                : 'Applicable tax/GST and service charge will be added on top of the entered price.'}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Tax — taxable toggle + read-only cash/card breakdown */}
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-600">Tax</span>
                  <Controller
                    name="taxable"
                    control={control}
                    render={({ field }) => (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!field.value}
                        onClick={() => field.onChange(!field.value)}
                        className={clsx(
                          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                          field.value ? 'bg-indigo-600' : 'bg-slate-300',
                        )}
                        title={field.value ? 'Taxable — click to make exempt' : 'Tax exempt — click to make taxable'}
                      >
                        <span className={clsx(
                          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                          field.value ? 'translate-x-4' : 'translate-x-0.5',
                        )} />
                      </button>
                    )}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {isTaxable
                    ? <>Cash <span className="font-semibold text-slate-700">{standardRate}%</span> · Card <span className="font-semibold text-slate-700">{effectiveCardRate}%</span></>
                    : 'Tax exempt — no tax on this item.'}
                </p>
              </div>

              {/* Service charge — read-only central rate + applicability */}
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-600">Service charge</span>
                  <span className="text-xs font-bold text-slate-700 tabular-nums">{serviceChargeRate}%</span>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {serviceChargeRate > 0
                    ? (scOrderTypes.length
                        ? <>Applied on <span className="font-semibold text-slate-700">{scOrderTypes.map((t) => ORDER_TYPE_LABELS[t] ?? t).join(', ')}</span></>
                        : 'Not applied to any order type.')
                    : 'No service charge set.'}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">PRA eIMS item classification</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Optional overrides. Leave blank to use this item&apos;s internal ID and the outlet&apos;s default PCT code.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>PRA item code</label>
                <input {...register('pra.itemCode', { maxLength: 50 })} className={inputCls} placeholder="e.g. BURGER-001" />
              </div>
              <div>
                <label className={labelCls}>PCT service code</label>
                <input
                  {...register('pra.pctCode', {
                    validate: (value) => !value || /^\d{8}$/.test(String(value).replace(/[.\s-]/g, '')) || 'Enter exactly 8 digits.',
                  })}
                  className={clsx(inputCls, errors.pra?.pctCode && 'border-red-300')}
                  inputMode="numeric"
                  placeholder="Uses outlet default"
                />
                {errors.pra?.pctCode && <p className="mt-1 text-xs text-red-600">{errors.pra.pctCode.message}</p>}
              </div>
            </div>
          </div>

          {/* ── Sizes / Variations ─────────────────────────────────────────── */}
          {itemType === 'regular' && (
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">Sizes / Variations</p>
                <p className="text-[11px] text-slate-400 mt-0.5 max-w-md">
                  Optional. Add sizes like Small, Medium, Large — each has its own price and its own
                  recipe. Edit each size's recipe from the <span className="font-medium">Recipe</span> button after saving.
                </p>
              </div>
              <button
                type="button"
                onClick={() => appendVariation({ name: '', price: '', foodPandaPrice: '' })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 text-indigo-700 px-3 py-1.5 text-xs font-semibold hover:bg-indigo-100 transition shrink-0"
              >
                <Plus size={13} /> Add size
              </button>
            </div>

            {variationFields.length === 0 ? (
              <p className="text-xs text-slate-400">No sizes — this item uses the single price above.</p>
            ) : (
              <div className="space-y-2">
                {variationFields.map((f, i) => (
                  <div key={f.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto] sm:items-center">
                    {/* _id is preserved through react-hook-form's field array,
                        but registering it here as a hidden input keeps the merge
                        on update working for already-saved sizes. */}
                    <input type="hidden" {...register(`variations.${i}._id`)} />
                    <div className="flex-1 min-w-0">
                      <input
                        {...register(`variations.${i}.name`)}
                        className={inputCls}
                        placeholder="Size name (e.g. Large)"
                      />
                    </div>
                    <div className="w-32 shrink-0">
                      <Controller
                        name={`variations.${i}.price`}
                        control={control}
                        render={({ field }) => (
                          <AmountInput
                            value={field.value ?? ''}
                            onChange={(raw) => field.onChange(raw === '' ? '' : Number(raw))}
                            onBlur={field.onBlur}
                            className={inputCls}
                            placeholder="Price"
                          />
                        )}
                      />
                    </div>
                    <div className="w-32 shrink-0">
                      <Controller
                        name={`variations.${i}.foodPandaPrice`}
                        control={control}
                        render={({ field }) => (
                          <AmountInput
                            value={field.value ?? ''}
                            onChange={(raw) => field.onChange(raw === '' ? '' : Number(raw))}
                            onBlur={field.onBlur}
                            className={inputCls}
                            placeholder="Foodpanda"
                          />
                        )}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeVariation(i)}
                      className="rounded-lg bg-rose-50 text-rose-600 p-2 hover:bg-rose-100 transition shrink-0"
                      title="Remove size"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {variationFields.length === 1 && (
                  <p className="text-[11px] text-amber-600">Add at least 2 sizes, or remove this one to use a single price.</p>
                )}
              </div>
            )}
          </div>
          )}

          <div>
            <label className={labelCls}>Description <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea
              {...register('description')}
              rows={3}
              className={clsx(inputCls, 'resize-none')}
              placeholder="Optional description"
            />
          </div>

          <div>
            <label className={labelCls}>Image <span className="text-slate-400 font-normal">(optional)</span></label>
            <div className="flex items-center gap-4">
              <div className="relative h-24 w-24 shrink-0 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
                {preview ? (
                  <>
                    <img src={preview} alt="Menu item" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={clearImage}
                      className="absolute top-1 right-1 rounded-full bg-black/55 p-1 text-white hover:bg-black/75 transition"
                      title="Remove image"
                    >
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <ImagePlus size={22} className="text-slate-300" />
                )}
              </div>
              <div className="space-y-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFilePick}
                  className="hidden"
                  id="menu-item-image"
                />
                <label
                  htmlFor="menu-item-image"
                  className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  <ImagePlus size={13} /> {preview ? 'Change image' : 'Upload image'}
                </label>
                <p className="text-[11px] text-slate-400">JPEG, PNG, or WebP · up to 5 MB</p>
              </div>
            </div>
          </div>
        </div>
      </form>
    </PremiumModal>
  );
};

export default MenuItemForm;

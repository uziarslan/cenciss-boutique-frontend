import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, useParams } from 'react-router';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Package, Layers, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { getProductById, createProduct, updateProduct } from '../../api/productApi';
import { useGetVendorsQuery, baseApi } from '../../store/baseApi';
import SearchableSelect from '../../components/UI/SearchableSelect';
import { BASE_UNIT_OPTIONS } from '../../utils/units';
import HeroBanner from '../../components/UI/HeroBanner';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';

// ── Schema ────────────────────────────────────────────────────────────────────

// Linking a vendor is just an association. Pack size and pricing are captured
// automatically from real purchases (PO / Buy·Receive → goods-received writes
// the paid price + pack size and the price history back onto the vendor entry),
// so they are intentionally NOT collected here.
const vendorRowSchema = z.object({
  vendorId:          z.string().min(1, 'Select a vendor.'),
  vendorProductCode: z.string().optional(),
});

const schema = z.object({
  name:            z.string().min(2, 'Name must be at least 2 characters.'),
  category:        z.string().min(1, 'Category is required.'),
  unit:            z.string().min(1, 'Unit is required.'),
  storageLocation: z.string().optional(),
  shelfLifeDays:   z.coerce.number().int().min(0).optional().or(z.literal('')),
  parLevel:        z.coerce.number().min(0).default(0),
  reorderQty:      z.coerce.number().min(0).default(0),
  vendors: z.array(vendorRowSchema).default([]),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

export const CATEGORIES = ['Fabric', 'Lining', 'Thread & Yarn', 'Trims & Notions', 'Buttons & Fasteners', 'Dye & Finishing', 'Labels', 'Packaging', 'Tools & Supplies', 'Other'];

// The categories offered in the dropdown. "Other" is not a real category — it's a
// trigger that swaps the select for a free-text field (mirrors VendorForm), so a
// user can type any custom category instead of storing the literal "Other".
export const SELECTABLE_CATEGORIES = CATEGORIES.filter((c) => c !== 'Other');

// Shared product-line shape keeps purchases and product setup consistent.
export const UNIT_GROUPS = [
  { label: 'Weight',    units: ['kg', 'g', 'mg', 'lb', 'oz'] },
  { label: 'Volume',    units: ['L', 'mL', 'gal', 'fl oz'] },
  { label: 'Count',     units: ['each', 'piece', 'dozen'] },
  { label: 'Length', units: ['m', 'cm', 'yard', 'ft'] },
  { label: 'Count / packaging', units: ['pcs', 'piece', 'each', 'roll', 'cone', 'pack', 'box', 'case', 'bag', 'carton'] },
];

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition';

const Field = ({ label, error, children, required }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);

// ── Vendor row — a simple vendor link (+ optional supplier code). Pricing and
// pack size are learned from actual purchases, not entered here. ──────────────
const VendorRow = ({
  control,
  register,
  index,
  errors,
  vendorOptions,
  onRemove,
}) => (
  <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
    <div className="flex items-start justify-between gap-2 mb-3">
      <span className="text-xs font-semibold text-gray-400 uppercase">Vendor #{index + 1}</span>
      <button
        type="button"
        onClick={onRemove}
        className="p-1 text-gray-400 hover:text-red-600 rounded transition"
        aria-label="Remove vendor row"
      >
        <Trash2 size={14} />
      </button>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* Vendor */}
      <div>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">
          Vendor <span className="text-red-500">*</span>
        </label>
        <Controller
          control={control}
          name={`vendors.${index}.vendorId`}
          render={({ field: f }) => (
            <SearchableSelect
              options={vendorOptions.map((v) => ({ value: v._id, label: v.name, meta: v.code }))}
              value={f.value}
              onChange={f.onChange}
              placeholder="Select vendor…"
              searchPlaceholder="Search vendor…"
            />
          )}
        />
        {errors?.vendors?.[index]?.vendorId && (
          <p className="mt-0.5 text-xs text-red-500">{errors.vendors[index].vendorId.message}</p>
        )}
      </div>

      {/* Vendor code — optional supplier SKU */}
      <div>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">
          Vendor Code <span className="normal-case text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          {...register(`vendors.${index}.vendorProductCode`)}
          className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="SKU-XXX"
        />
      </div>
    </div>
  </div>
);

// ── Component ─────────────────────────────────────────────────────────────────

const ProductForm = () => {
  const { id }   = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const isEdit   = Boolean(id);

  const { data: vendorOptions = [] } = useGetVendorsQuery();

  // When true, the category field is a free-text input (custom category) instead
  // of the dropdown — same "Other → type your own" behaviour as VendorForm.
  const [useCustomCategory, setUseCustomCategory] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      parLevel:   0,
      reorderQty: 0,
      vendors:    [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'vendors' });


  // Populate form in edit mode
  useEffect(() => {
    if (!isEdit) return;
    getProductById(id)
      .then(({ data }) => {
        const p = data.data;
        const cat = p.category ?? '';
        // Any stored category not in the canonical list (including a legacy
        // literal "Other") opens as editable custom text.
        setUseCustomCategory(Boolean(cat) && !SELECTABLE_CATEGORIES.includes(cat));
        reset({
          name:            p.name            ?? '',
          category:        cat,
          unit:            p.unit            ?? '',
          storageLocation: p.storageLocation ?? '',
          shelfLifeDays:   p.shelfLifeDays   ?? '',
          parLevel:        p.parLevel        ?? 0,
          reorderQty:      p.reorderQty      ?? 0,
          vendors: (p.vendors ?? []).map((v) => ({
            vendorId:          v.vendorId?._id ?? v.vendorId ?? '',
            vendorProductCode: v.vendorProductCode ?? '',
          })),
        });
      })
      .catch(() => toast.error('Failed to load product.'));
  }, [id, isEdit, reset]);

  const onSubmit = async (values) => {
    const payload = {
      ...values,
      shelfLifeDays: values.shelfLifeDays === '' ? undefined : values.shelfLifeDays,
      // Only the vendor link (+ optional supplier code). Omitting currentPrice /
      // packSize is deliberate: updateProduct merges by vendorId and only
      // overwrites a field when it's present, so existing pricing and price
      // history stay intact. Pack size + price are learned from purchases.
      vendors: (values.vendors ?? []).map(({ vendorId, vendorProductCode }) => ({
        vendorId,
        vendorProductCode: vendorProductCode || '',
      })),
    };
    try {
      if (isEdit) {
        await updateProduct(id, payload);
        toast.success('Product updated.');
      } else {
        await createProduct(payload);
        toast.success('Product created.');
      }
      // Refresh cached product/vendor lists used by pickers across the app.
      dispatch(baseApi.util.invalidateTags(['Product', 'Vendor']));
      navigate('/products');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Save failed.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <HeroBanner
        icon={Package}
        eyebrow={isEdit ? 'Edit Product' : 'New Product'}
        title={isEdit ? 'Edit Product' : 'New Product'}
        subtitle={isEdit ? 'Update item master record.' : 'Add a product to the catalogue with category, units and vendors.'}
        accent="indigo"
        compact
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <Card title="Product Details" subtitle="Name, category and stock thresholds" icon={Package}>
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Product name" error={errors.name?.message} required>
                <input {...register('name')} className={inputCls} placeholder="e.g. Roma Tomatoes" />
              </Field>

              <Field label="Category" error={errors.category?.message} required>
                <Controller
                  name="category"
                  control={control}
                  render={({ field }) => (
                    useCustomCategory ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={field.value ?? ''}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          className={inputCls}
                          placeholder="Type custom category…"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => { setUseCustomCategory(false); field.onChange(''); }}
                          className="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
                        >
                          Use list
                        </button>
                      </div>
                    ) : (
                      <SearchableSelect
                        options={[
                          { value: '', label: 'Select category…' },
                          ...SELECTABLE_CATEGORIES.map((c) => ({ value: c, label: c })),
                          { value: '__other__', label: 'Other (custom)…' },
                        ]}
                        value={field.value || ''}
                        onChange={(v) => {
                          if (v === '__other__') {
                            setUseCustomCategory(true);
                            field.onChange('');
                          } else {
                            field.onChange(v);
                          }
                        }}
                        placeholder="Select category…"
                        searchPlaceholder="Search categories…"
                      />
                    )
                  )}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <Field label="Unit of measure" error={errors.unit?.message} required>
                <Controller
                  control={control}
                  name="unit"
                  render={({ field }) => (
                    <SearchableSelect
                      options={
                        field.value && !BASE_UNIT_OPTIONS.some((o) => o.value === field.value)
                          ? [{ value: '', label: '— unit —' }, { value: field.value, label: field.value }, ...BASE_UNIT_OPTIONS]
                          : [{ value: '', label: '— unit —' }, ...BASE_UNIT_OPTIONS]
                      }
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder="— unit —"
                      searchPlaceholder="Search units…"
                    />
                  )}
                />
              </Field>
              <Field label="Par level" error={errors.parLevel?.message}>
                <input type="number" min="0" step="0.01" {...register('parLevel')} className={inputCls} />
              </Field>
              <Field label="Reorder quantity" error={errors.reorderQty?.message}>
                <input type="number" min="0" step="0.01" {...register('reorderQty')} className={inputCls} />
              </Field>
            </div>
          </div>
        </Card>

        <Card title="Storage & Shelf Life" subtitle="Where it lives and how long it lasts" icon={Layers} iconAccent="cyan">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Storage location" error={errors.storageLocation?.message}>
              <input {...register('storageLocation')} className={inputCls} placeholder="e.g. Walk-in fridge" />
            </Field>
            <Field label="Shelf life (days)" error={errors.shelfLifeDays?.message}>
              <input type="number" min="0" {...register('shelfLifeDays')} className={inputCls} placeholder="Leave blank if N/A" />
            </Field>
          </div>
        </Card>

        <Card
          title="Vendors"
          subtitle="Link the suppliers you buy this from — pack size & pricing are captured automatically from purchases"
          icon={Truck}
          iconAccent="emerald"
          action={
            <button
              type="button"
              onClick={() => append({ vendorId: '', vendorProductCode: '' })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 rounded-lg transition"
            >
              <Plus size={13} /> Add vendor
            </button>
          }
        >
          {errors.vendors?.message && (
            <p className="mb-3 text-xs text-red-500">{errors.vendors.message}</p>
          )}

          {fields.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-8 px-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-2">
                <Truck size={18} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">No vendor linked</p>
              <p className="mt-0.5 text-xs text-gray-500 max-w-sm">
                Link the suppliers you buy this from. Pricing and pack sizes fill in automatically as you receive purchases — no need to enter them here. Optional; you can leave this empty and save.
              </p>
              <button
                type="button"
                onClick={() => append({ vendorId: '', vendorProductCode: '' })}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 rounded-lg transition"
              >
                <Plus size={13} /> Link a vendor
              </button>
            </div>
          )}

          <div className="space-y-3">
            {fields.map((field, index) => (
              <VendorRow
                key={field.id}
                control={control}
                register={register}
                index={index}
                errors={errors}
                vendorOptions={vendorOptions}
                onRemove={() => remove(index)}
              />
            ))}
          </div>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-2 justify-end mt-6">
          <Button type="button" variant="secondary" onClick={() => navigate('/products')}>Cancel</Button>
          <Button type="submit" variant="gradient" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;

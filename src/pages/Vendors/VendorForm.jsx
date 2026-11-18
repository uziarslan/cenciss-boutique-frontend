import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, useParams } from 'react-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { getVendorById, createVendor, updateVendor } from '../../api/vendorApi';
import { baseApi } from '../../store/baseApi';
import AmountInput from '../../components/UI/AmountInput';
import SearchableSelect from '../../components/UI/SearchableSelect';
import HeroBanner from '../../components/UI/HeroBanner';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import { Building2, MapPin, Wallet, ShieldCheck } from 'lucide-react';
import { CATEGORIES as PRODUCT_CATEGORIES } from '../Products/ProductForm';

const VENDOR_CATEGORIES = PRODUCT_CATEGORIES.filter((c) => c !== 'Other');

// ── Schema ────────────────────────────────────────────────────────────────────

const baseSchema = z.object({
  name:        z.string().min(2, 'Name must be at least 2 characters.'),
  category:    z.string().optional(),
  contactName: z.string().optional(),
  phone:       z.string().optional(),
  email:       z.union([z.string().email('Invalid email.'), z.literal('')]).optional(),
  address: z.object({
    street:  z.string().optional(),
    city:    z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  paymentTerms: z.coerce.number().min(0, 'Must be ≥ 0').default(30),
  creditLimit:  z.coerce.number().min(0, 'Must be ≥ 0').default(0),
  currency:     z.string().min(1).max(5).default('Rs.'),
  notes:        z.string().optional(),
});

const editSchema = baseSchema.extend({
  status: z.enum(['active', 'inactive', 'onHold']),
});

// ── Shared field component ────────────────────────────────────────────────────

const Field = ({ label, error, children, required }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition';

// ── Component ─────────────────────────────────────────────────────────────────

const VendorForm = () => {
  const { id }   = useParams();          // undefined → create mode
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const isEdit   = Boolean(id);

  const [useCustomCategory, setUseCustomCategory] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(isEdit ? editSchema : baseSchema),
    defaultValues: {
      paymentTerms: 30,
      creditLimit:  0,
      currency:     'Rs.',
      status:       'active',
    },
  });

  // Populate form in edit mode
  useEffect(() => {
    if (!isEdit) return;
    getVendorById(id)
      .then(({ data }) => {
        const v = data.data;
        const cat = v.category ?? '';
        setUseCustomCategory(Boolean(cat) && !VENDOR_CATEGORIES.includes(cat));
        reset({
          name:         v.name         ?? '',
          category:     cat,
          contactName:  v.contactName  ?? '',
          phone:        v.phone        ?? '',
          email:        v.email        ?? '',
          address: {
            street:  v.address?.street  ?? '',
            city:    v.address?.city    ?? '',
            country: v.address?.country ?? '',
          },
          paymentTerms: v.paymentTerms ?? 30,
          creditLimit:  v.creditLimit  ?? 0,
          currency:     v.currency     ?? 'Rs.',
          status:       v.status       ?? 'active',
          notes:        v.notes        ?? '',
        });
      })
      .catch(() => toast.error('Failed to load vendor.'));
  }, [id, isEdit, reset]);

  const onSubmit = async (values) => {
    try {
      if (isEdit) {
        await updateVendor(id, values);
        toast.success('Vendor updated.');
      } else {
        await createVendor(values);
        toast.success('Vendor created.');
      }
      dispatch(baseApi.util.invalidateTags(['Vendor']));
      navigate('/vendors');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Save failed.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <HeroBanner
        icon={Building2}
        eyebrow={isEdit ? 'Edit Vendor' : 'New Vendor'}
        title={isEdit ? 'Edit Vendor' : 'New Vendor'}
        subtitle={isEdit ? 'Update supplier details and terms.' : 'Add a new supplier account with contact details and financial terms.'}
        accent="indigo"
        compact
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <Card title="Vendor Profile" subtitle="Name, category & contact" icon={Building2}>
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Vendor name" error={errors.name?.message} required>
                <input {...register('name')} className={inputCls} placeholder="e.g. Fresh Farm Co." />
              </Field>
              <Field label="Category" error={errors.category?.message}>
                <Controller
                  control={control}
                  name="category"
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
                          ...VENDOR_CATEGORIES.map((c) => ({ value: c, label: c })),
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
                        placeholder="Select a category…"
                        searchPlaceholder="Search categories…"
                      />
                    )
                  )}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Contact name" error={errors.contactName?.message}>
                <input {...register('contactName')} className={inputCls} placeholder="John Smith" />
              </Field>
              <Field label="Phone" error={errors.phone?.message}>
                <input {...register('phone')} className={inputCls} placeholder="+1 555 000 0000" />
              </Field>
            </div>

            <Field label="Email" error={errors.email?.message}>
              <input type="email" {...register('email')} className={inputCls} placeholder="orders@vendor.com" />
            </Field>
          </div>
        </Card>

        <Card title="Address" subtitle="Where the vendor is based" icon={MapPin} iconAccent="cyan">
          <div className="space-y-4">
            <Field label="Street" error={errors.address?.street?.message}>
              <input {...register('address.street')} className={inputCls} placeholder="123 Supply Street" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="City" error={errors.address?.city?.message}>
                <input {...register('address.city')} className={inputCls} placeholder="City" />
              </Field>
              <Field label="Country" error={errors.address?.country?.message}>
                <input {...register('address.country')} className={inputCls} placeholder="Country" />
              </Field>
            </div>
          </div>
        </Card>

        <Card title="Financial Terms" subtitle="Payment terms, credit limit and currency" icon={Wallet} iconAccent="emerald">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <Field label="Payment terms (days)" error={errors.paymentTerms?.message} required>
              <input
                type="number"
                min="0"
                {...register('paymentTerms')}
                className={inputCls}
                placeholder="30"
              />
            </Field>
            <Field label="Credit limit" error={errors.creditLimit?.message}>
              <Controller
                name="creditLimit"
                control={control}
                render={({ field }) => (
                  <AmountInput
                    value={field.value ?? ''}
                    onChange={(raw) => field.onChange(raw === '' ? '' : Number(raw))}
                    onBlur={field.onBlur}
                    className={inputCls}
                    placeholder="0.00"
                  />
                )}
              />
            </Field>
            <Field label="Currency" error={errors.currency?.message}>
              <input {...register('currency')} className={inputCls} placeholder="Rs." maxLength={5} />
            </Field>
          </div>
        </Card>

        <Card title="Status & Notes" subtitle="Status flag and internal notes" icon={ShieldCheck} iconAccent="slate">
          <div className="space-y-5">
            {isEdit && (
              <Field label="Status" error={errors.status?.message}>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <SearchableSelect
                      options={[
                        { value: 'active', label: 'Active' },
                        { value: 'inactive', label: 'Inactive' },
                        { value: 'onHold', label: 'On Hold' },
                      ]}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </Field>
            )}

            <Field label="Notes" error={errors.notes?.message}>
              <textarea
                {...register('notes')}
                rows={3}
                className={inputCls}
                placeholder="Internal notes about this vendor…"
              />
            </Field>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-2 justify-end mt-6">
          <Button type="button" variant="secondary" onClick={() => navigate('/vendors')}>Cancel</Button>
          <Button type="submit" variant="gradient" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create vendor'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default VendorForm;

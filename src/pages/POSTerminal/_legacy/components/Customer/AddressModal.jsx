import { useState } from 'react';
import { X, MapPin } from 'lucide-react';
import { addCustomerAddress } from '../../api/customerApi';
import toast from 'react-hot-toast';

const AddressModal = ({ customerId, onClose, onSaved }) => {
  const [form, setForm] = useState({
    label: 'Home',
    street: '',
    area: '',
    city: '',
    isDefault: false,
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.street.trim() && !form.area.trim()) {
      toast.error('Enter at least a street or area.');
      return;
    }
    setSaving(true);
    try {
      const res = await addCustomerAddress(customerId, form);
      onSaved(res.data?.data ?? []);
      toast.success('Address saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save address');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-float">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-100 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-surface-900">
            <MapPin size={15} className="text-brand-600" />
            Add Delivery Address
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100"
          >
            <X size={15} />
          </button>
        </div>

        {/* Fields */}
        <div className="space-y-3 p-4">
          {/* Label presets */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-surface-500">
              Label
            </label>
            <div className="flex gap-2">
              {['Home', 'Office', 'Other'].map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => set('label', l)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    form.label === l
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-surface-200 text-surface-600 hover:bg-surface-50'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-surface-500">
              Street / Building
            </label>
            <input
              type="text"
              value={form.street}
              onChange={(e) => set('street', e.target.value)}
              placeholder="e.g. House 12, Street 5"
              className="input-field text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-surface-500">
              Area / Sector
            </label>
            <input
              type="text"
              value={form.area}
              onChange={(e) => set('area', e.target.value)}
              placeholder="e.g. DHA Phase 4"
              className="input-field text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-surface-500">
              City
            </label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              placeholder="e.g. Lahore"
              className="input-field text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-surface-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => set('isDefault', e.target.checked)}
              className="rounded border-surface-300 text-brand-600 focus:ring-brand-400"
            />
            Set as default address
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-surface-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost flex-1 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex-1 text-sm"
          >
            {saving ? 'Saving…' : 'Save Address'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddressModal;

import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Plus, Edit3, Store, Power, MapPin, Globe, Clock3 } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { getOutlets, createOutlet, updateOutlet } from '../../api/outletApi';
import { baseApi } from '../../store/baseApi';
import SearchableSelect from '../../components/UI/SearchableSelect';
import HeroBanner from '../../components/UI/HeroBanner';
import StatTile from '../../components/UI/StatTile';
import Button from '../../components/UI/Button';
import FilterBar from '../../components/UI/FilterBar';
import PremiumModal, { ModalSection, SecondaryButton, PrimaryButton, inputCls, labelCls } from '../../components/UI/PremiumModal';
import { TIMEZONE_OPTIONS } from '../../utils/datetime';
import useQueryState from '../../hooks/useQueryState';

const Outlets = () => {
  const dispatch = useDispatch();
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState(null);
  const [search, setSearch] = useQueryState('search', '');
  const [statusFilter, setStatusFilter] = useQueryState('status', '');
  const [cityFilter, setCityFilter] = useQueryState('city', '');
  const [timezoneFilter, setTimezoneFilter] = useQueryState('timezone', '');
  const [dayTypeFilter, setDayTypeFilter] = useQueryState('dayType', '');
  const [sort, setSort] = useQueryState('sort', 'name');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await getOutlets({ limit: 100 });
        setOutlets(res.data?.data?.outlets ?? res.data?.data ?? []);
      } catch (err) {
        toast.error('Failed to load outlets.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const openModal = (outlet = null) => {
    setEditingOutlet(outlet);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingOutlet(null);
  };

  const handleSave = async (values) => {
    setSaving(true);
    try {
      if (editingOutlet) {
        await updateOutlet(editingOutlet._id, values);
        toast.success('Outlet updated.');
      } else {
        await createOutlet(values);
        toast.success('Outlet created.');
      }
      closeModal();
      const res = await getOutlets({ limit: 100 });
      setOutlets(res.data?.data?.outlets ?? res.data?.data ?? []);
      // Refresh the shared cache so every other page sees the change.
      dispatch(baseApi.util.invalidateTags(['Outlet']));
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to save outlet.');
    } finally {
      setSaving(false);
    }
  };

  // Filtering
  const cityOptions = [...new Set(outlets.map((o) => o.address?.city).filter(Boolean))].sort();
  const timezoneOptions = [...new Set(outlets.map((o) => o.timezone).filter(Boolean))].sort();
  const filteredOutlets = outlets.filter((o) => {
    if (statusFilter === 'active'   && !o.isActive) return false;
    if (statusFilter === 'inactive' &&  o.isActive) return false;
    if (cityFilter && o.address?.city !== cityFilter) return false;
    if (timezoneFilter && o.timezone !== timezoneFilter) return false;
    const start = o.businessDayStart || '00:00';
    const end = o.businessDayEnd || start;
    if (dayTypeFilter === 'overnight' && end >= start) return false;
    if (dayTypeFilter === 'same-day' && end < start) return false;
    if (search) {
      const q = search.trim().toLowerCase();
      const hay = `${o.name ?? ''} ${o.code ?? ''} ${o.address?.city ?? ''} ${o.address?.country ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sort === 'code') return String(a.code || '').localeCompare(String(b.code || ''));
    if (sort === 'city') return String(a.address?.city || '').localeCompare(String(b.address?.city || ''));
    if (sort === 'recent') return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  const activeCount   = outlets.filter((o) => o.isActive).length;

  return (
    <div className="space-y-6 pb-8">
      <HeroBanner
        icon={Store}
        eyebrow="Locations"
        title="Outlets"
        subtitle="Configure outlets, locations, and operational settings for each branch."
        accent="indigo"
        compact
        actions={
          <Button variant="primary" icon={Plus} onClick={() => openModal(null)}>
            Add Outlet
          </Button>
        }
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile label="Total Outlets" value={outlets.length} icon={Store} gradient="indigo"  />
        <StatTile label="Active"        value={activeCount}    icon={Power} gradient="emerald" />
        <StatTile label="Inactive"      value={outlets.length - activeCount} icon={Power} gradient="slate" />
      </div>

      {/* Filters */}
      <FilterBar>
        <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code, or city…"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[160px]">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Status</label>
          <SearchableSelect
            options={[
              { value: '',         label: 'All' },
              { value: 'active',   label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        <div className="min-w-[180px]"><SearchableSelect options={[{ value: '', label: 'All cities' }, ...cityOptions.map((value) => ({ value, label: value }))]} value={cityFilter} onChange={setCityFilter} /></div>
        <div className="min-w-[210px]"><SearchableSelect options={[{ value: '', label: 'All timezones' }, ...timezoneOptions.map((value) => ({ value, label: value }))]} value={timezoneFilter} onChange={setTimezoneFilter} /></div>
        <div className="min-w-[190px]"><SearchableSelect searchable={false} options={[{ value: '', label: 'All business-day types' }, { value: 'same-day', label: 'Same-day window' }, { value: 'overnight', label: 'Overnight window' }]} value={dayTypeFilter} onChange={setDayTypeFilter} /></div>
        <div className="min-w-[180px]"><SearchableSelect searchable={false} options={[{ value: 'name', label: 'Sort by name' }, { value: 'code', label: 'Sort by code' }, { value: 'city', label: 'Sort by city' }, { value: 'recent', label: 'Recently updated' }]} value={sort} onChange={setSort} /></div>
        <div className="ml-auto text-xs text-gray-400 self-end pb-2">
          {filteredOutlets.length} of {outlets.length}
        </div>
      </FilterBar>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Locations</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {loading ? 'Loading…' : `${filteredOutlets.length} outlet${filteredOutlets.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading outlets…</div>
        ) : filteredOutlets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
            <Store size={36} strokeWidth={1.5} className="text-gray-300" />
            <p className="text-sm font-medium text-slate-500">
              {outlets.length === 0 ? 'No outlets yet.' : 'No outlets match these filters.'}
            </p>
            <p className="text-xs text-gray-400 -mt-2">
              {outlets.length === 0 ? 'Click "Add Outlet" to add your first location.' : 'Try clearing the filters above.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr>
                  {['Code', 'Name', 'Address', 'Phone', 'Timezone', 'Business Day', 'Status', ''].map((h) => (
                    <th key={h} className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOutlets.map((outlet) => (
                  <tr key={outlet._id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-indigo-600">{outlet.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{outlet.name}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {[outlet.address?.street, outlet.address?.city, outlet.address?.country].filter(Boolean).join(', ') || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                      {outlet.phone || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{outlet.timezone || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                      {outlet.businessDayStart || '00:00'} → {outlet.businessDayEnd || outlet.businessDayStart || '00:00'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
                        outlet.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      )}>
                        {outlet.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openModal(outlet)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition"
                      >
                        <Edit3 size={12} /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <OutletForm
          initialData={editingOutlet}
          onCancel={closeModal}
          onSave={handleSave}
          isSaving={saving}
        />
      )}
    </div>
  );
};

const OutletForm = ({ initialData: _initialData, onCancel, onSave, isSaving }) => {
  const initialData = _initialData ?? {};
  const [name, setName]         = useState(initialData.name ?? '');
  const [code, setCode]         = useState(initialData.code ?? '');
  const [street, setStreet]     = useState(initialData.address?.street ?? '');
  const [city, setCity]         = useState(initialData.address?.city ?? '');
  const [country, setCountry]   = useState(initialData.address?.country ?? '');
  const [phone, setPhone]       = useState(initialData.phone ?? '');
  const [timezone, setTimezone] = useState(initialData.timezone ?? 'Asia/Karachi');
  const [businessDayStart, setBusinessDayStart] = useState(initialData.businessDayStart ?? '00:00');
  const [businessDayEnd, setBusinessDayEnd] = useState(initialData.businessDayEnd ?? initialData.businessDayStart ?? '00:00');
  const [isActive, setIsActive] = useState(initialData.isActive ?? true);

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('Name is required.'); return; }
    if (!code.trim()) { toast.error('Code is required.'); return; }
    await onSave({
      name,
      code,
      address: { street, city, country },
      phone,
      timezone,
      businessDayStart,
      businessDayEnd,
      isActive,
    });
  };

  return (
    <PremiumModal
      open
      onClose={isSaving ? undefined : onCancel}
      icon={Store}
      eyebrow={initialData._id ? 'Edit Outlet' : 'New Outlet'}
      title={initialData._id ? 'Edit Outlet' : 'Create Outlet'}
      subtitle="Configure your outlet details"
      accent="indigo"
      size="lg"
      footer={
        <>
          <SecondaryButton type="button" onClick={onCancel} disabled={isSaving}>Cancel</SecondaryButton>
          <PrimaryButton type="button" onClick={handleSubmit} disabled={isSaving} accent="indigo">
            {isSaving ? 'Saving…' : initialData._id ? 'Update Outlet' : 'Create Outlet'}
          </PrimaryButton>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-4">
        <ModalSection icon={Store} title="Identity" subtitle="Display name and unique code">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Name <span className="text-rose-500">*</span></label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                placeholder="Main Branch"
                required
              />
            </div>
            <div>
              <label className={labelCls}>Code <span className="text-rose-500">*</span></label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={inputCls}
                placeholder="REST-001"
                required
              />
            </div>
          </div>
        </ModalSection>

        <ModalSection icon={MapPin} title="Address & Contact" subtitle="Where the outlet is located" accent="cyan">
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Street</label>
              <input
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                className={inputCls}
                placeholder="123 Main St"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>City</label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={inputCls}
                  placeholder="Karachi"
                />
              </div>
              <div>
                <label className={labelCls}>Country</label>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={inputCls}
                  placeholder="Pakistan"
                />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputCls}
                  placeholder="0312 3456789"
                />
              </div>
            </div>
          </div>
        </ModalSection>

        <ModalSection icon={Globe} title="Operational" subtitle="Timezone and outlet status" accent="emerald">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Timezone <span className="text-rose-500">*</span></label>
              <SearchableSelect
                options={TIMEZONE_OPTIONS}
                value={timezone}
                onChange={setTimezone}
                placeholder="Select timezone…"
                searchPlaceholder="Search timezones…"
              />
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
          </div>
        </ModalSection>

        <ModalSection icon={Clock3} title="Business Day Clock" subtitle="Choose when this outlet's reporting day rolls over" accent="amber">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Day starts at</label>
              <input type="time" value={businessDayStart} onChange={(e) => setBusinessDayStart(e.target.value)} className={inputCls} required />
            </div>
            <div>
              <label className={labelCls}>Day ends at</label>
              <input type="time" value={businessDayEnd} onChange={(e) => setBusinessDayEnd(e.target.value)} className={inputCls} required />
            </div>
            <div className="sm:col-span-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
              The outlet day runs from <strong>{businessDayStart}</strong> to <strong>{businessDayEnd}</strong>. If the end time is earlier than the start time, the window ends the following calendar day and after-midnight orders remain on the starting business date.
            </div>
          </div>
        </ModalSection>
      </form>
    </PremiumModal>
  );
};

export default Outlets;

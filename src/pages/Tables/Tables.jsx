import { useEffect, useState, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { Plus, QrCode, Printer, Save, Edit2, Power, RotateCcw, Clock3, Landmark, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import HeroBanner from '../../components/UI/HeroBanner';
import Button from '../../components/UI/Button';
import SearchableSelect from '../../components/UI/SearchableSelect';
import PremiumModal, { ModalSection, inputCls, labelCls, PrimaryButton, SecondaryButton } from '../../components/UI/PremiumModal';
import useAuth from '../../hooks/useAuth';
import { createTable, updateTable, deleteTable, reactivateTable, updateQrSettings, getQrMenuCategories } from '../../api/tableApi';
import { baseApi, useGetOutletsQuery, useGetTablesQuery, listQueryOpts } from '../../store/baseApi';
import useQueryState from '../../hooks/useQueryState';

// Public QR URL — uses the current origin so dev (localhost:3000) and prod
// both work without configuration. The slug, outlet code and table code
// uniquely identify a table from the public URL.
const buildOrderUrl = (tenantSlug, outletCode, tableCode) =>
  `${window.location.origin}/order/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(outletCode)}/${encodeURIComponent(tableCode)}`;

// QR image source — free, anonymous service. Renders the URL as a 280x280 PNG.
const qrImageSrc = (url, size = 280) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=4&data=${encodeURIComponent(url)}`;

const Tables = () => {
  const { user } = useAuth();
  const tenantSlug = user?.tenant?.slug || '';

  const dispatch = useDispatch();
  const { data: outlets = [] } = useGetOutletsQuery();
  const [selectedOutlet, setSelectedOutlet] = useQueryState('outlet', '');
  const [activeTab, setActiveTab] = useQueryState('tab', 'tables');
  const [editing, setEditing] = useState(null); // null | { ... } | 'new'
  const [qrPreview, setQrPreview] = useState(null);

  useEffect(() => {
    if (outlets.length === 1 && !selectedOutlet) setSelectedOutlet(outlets[0]._id);
  }, [outlets, selectedOutlet, setSelectedOutlet]);

  useEffect(() => {
    if (activeTab === 'payments' && outlets.length > 0 && !selectedOutlet) {
      setSelectedOutlet(outlets[0]._id);
    }
  }, [activeTab, outlets, selectedOutlet, setSelectedOutlet]);

  const queryParams = useMemo(
    () => (selectedOutlet ? { outlet: selectedOutlet } : {}),
    [selectedOutlet]
  );
  const { data: payload, isLoading: loading } = useGetTablesQuery(queryParams, listQueryOpts);
  const rows = useMemo(() => (Array.isArray(payload) ? payload : []), [payload]);

  const refresh = () => dispatch(baseApi.util.invalidateTags(['Table']));
  const selectedOutletRecord = outlets.find((outlet) => String(outlet._id) === String(selectedOutlet));

  const saveQrSettings = async (settings) => {
    if (!selectedOutlet) return toast.error('Select an outlet first.');
    try {
      await updateQrSettings(selectedOutlet, settings);
      dispatch(baseApi.util.invalidateTags(['Outlet']));
      toast.success('QR customer settings saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save QR customer settings');
      throw err;
    }
  };

  const grouped = useMemo(() => {
    const out = new Map();
    for (const t of rows) {
      const key = t.outlet?._id || 'unknown';
      if (!out.has(key)) out.set(key, { outlet: t.outlet, tables: [] });
      out.get(key).tables.push(t);
    }
    return Array.from(out.values());
  }, [rows]);

  const handleSave = async (form) => {
    try {
      if (form._id) {
        const r = await updateTable(form._id, form);
        const updated = r?.data?.data;
        // eslint-disable-next-line no-console
        console.info('[Tables] update response', { sent: form, returned: updated });
        // If the user had a QR preview open for this table, refresh its
        // URL so the displayed link + QR image reflect the new code.
        if (updated) {
          setQrPreview((prev) =>
            prev && String(prev.table?._id) === String(updated._id)
              ? { ...prev, table: { ...prev.table, code: updated.code }, url: buildOrderUrl(tenantSlug, prev.outlet?.code || '', updated.code) }
              : prev
          );
        }
        toast.success('Table updated');
      } else {
        await createTable(form);
        toast.success('Table added');
      }
      setEditing(null);
      refresh();
    } catch (err) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message || err?.message || 'Save failed';
      toast.error(status ? `${msg} (HTTP ${status})` : msg);
      // eslint-disable-next-line no-console
      console.error('[Tables] save failed', err?.response || err);
    }
  };

  const handleDelete = (t) => {
    if (!window.confirm(`Deactivate table "${t.label}"? Customers can no longer scan its QR.`)) return;
    deleteTable(t._id)
      .then(() => { toast.success('Table deactivated'); refresh(); })
      .catch((err) => { toast.error(err.response?.data?.message || 'Delete failed'); });
  };

  const handleReactivate = (t) => {
    reactivateTable(t._id)
      .then(() => { toast.success('Table reactivated'); refresh(); })
      .catch((err) => { toast.error(err.response?.data?.message || 'Reactivate failed'); });
  };

  const handlePrint = (t) => {
    const url = buildOrderUrl(tenantSlug, t.outlet?.code || '', t.code);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html>
        <head>
          <title>Table QR — ${t.label}</title>
          <style>
            body { font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 24px; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
            .card { text-align: center; max-width: 360px; padding: 28px; border: 2px dashed #cbd5e1; border-radius: 16px; }
            .label { font-size: 14px; text-transform: uppercase; letter-spacing: 0.18em; color: #64748b; }
            .table { font-size: 36px; font-weight: 800; margin: 6px 0 18px; color: #0f172a; }
            .scan { font-size: 16px; font-weight: 600; color: #4f46e5; margin-top: 18px; }
            img { width: 280px; height: 280px; }
            .url { word-break: break-all; font-size: 10px; color: #94a3b8; margin-top: 14px; font-family: ui-monospace, monospace; }
            @media print { .noprint { display: none; } body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="label">Scan to order</div>
            <div class="table">${t.label}</div>
            <img src="${qrImageSrc(url, 560)}" alt="QR" />
            <div class="scan">Scan with your phone camera</div>
            <div class="url">${url}</div>
          </div>
          <script>setTimeout(() => window.print(), 400);</script>
        </body>
      </html>
    `);
    w.document.close();
  };

  return (
    <div className="space-y-6 pb-8">
      <HeroBanner
        icon={QrCode}
        eyebrow="Self-Order"
        title="Tables & QR Codes"
        subtitle="Each table gets a unique QR. Customers scan, see your menu, and place orders themselves — pending your approval."
        accent="indigo"
        compact
        actions={activeTab === 'tables' ? (
          <Button variant="primary" icon={Plus} onClick={() => setEditing({ outlet: selectedOutlet, label: '', code: '', capacity: 0, notes: '' })}>
            Add Table
          </Button>
        ) : null}
      />

      <div className="flex w-full gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm sm:w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('tables')}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition sm:flex-none ${activeTab === 'tables' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          <QrCode size={15} /> Tables
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('payments')}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition sm:flex-none ${activeTab === 'payments' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          <Landmark size={15} /> QR Customer Payment
        </button>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-end gap-3 flex-wrap">
          {outlets.length > 1 && (
            <div className="flex flex-col gap-1 min-w-[260px]">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Outlet</label>
              <SearchableSelect
                options={[
                  ...(activeTab === 'tables' ? [{ value: '', label: 'All outlets' }] : []),
                  ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code })),
                ]}
                value={selectedOutlet}
                onChange={setSelectedOutlet}
                searchPlaceholder="Search outlets…"
              />
            </div>
          )}
          {activeTab === 'tables' && <p className="ml-auto text-xs text-gray-400">
            {loading ? 'Loading…' : `${rows.length} table${rows.length === 1 ? '' : 's'}`}
          </p>}
        </div>
      </div>

      {activeTab === 'tables' && selectedOutletRecord && (
        <QrPreparationSettings outlet={selectedOutletRecord} onSave={saveQrSettings} />
      )}

      {activeTab === 'payments' && selectedOutletRecord && (
        <QrCustomerPaymentSettings outlet={selectedOutletRecord} onSave={saveQrSettings} />
      )}

      {activeTab === 'tables' && (loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400 text-sm animate-pulse">Loading tables…</div>
      ) : grouped.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-500">
          <QrCode size={32} className="mx-auto text-gray-300" />
          <p className="mt-3 text-sm font-semibold">No tables yet</p>
          <p className="text-xs text-gray-400 mt-1">Add a table to generate its scan-to-order QR code.</p>
        </div>
      ) : (
        grouped.map(({ outlet, tables }) => (
          <div key={outlet?._id || 'unknown'} className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 pl-1">
              {outlet?.name || 'Unknown outlet'} <span className="text-slate-300">·</span> <span className="font-mono text-[10px]">{outlet?.code}</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tables.map((t) => {
                const url = buildOrderUrl(tenantSlug, outlet?.code || '', t.code);
                return (
                  <div key={t._id} className={`rounded-2xl border p-4 ${t.isActive ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50/50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Table</p>
                        <p className={`text-xl font-extrabold ${t.isActive ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{t.label}</p>
                        <p className="text-[11px] font-mono text-slate-400 mt-0.5">code: {t.code}{t.capacity ? ` · seats ${t.capacity}` : ''}</p>
                        {!t.isActive && <span className="mt-1 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">Inactive</span>}
                      </div>
                      <button
                        onClick={() => setQrPreview({ table: t, outlet, url })}
                        className="rounded-lg p-2 hover:bg-indigo-50 text-indigo-600 transition"
                        title="View QR"
                      >
                        <QrCode size={20} />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setEditing({ ...t, outlet: outlet?._id })}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Edit2 size={11} /> Edit
                      </button>
                      <button
                        onClick={() => handlePrint(t)}
                        disabled={!t.isActive}
                        className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={t.isActive ? 'Print QR' : 'Reactivate first to print QR'}
                      >
                        <Printer size={11} /> Print QR
                      </button>
                      {t.isActive ? (
                        <button
                          onClick={() => handleDelete(t)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 ml-auto"
                          title="Deactivate"
                        >
                          <Power size={11} /> Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(t)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 ml-auto"
                          title="Reactivate this table"
                        >
                          <RotateCcw size={11} /> Reactivate
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      ))}

      {editing && (
        <TableEditor
          initial={editing}
          outlets={outlets}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      {qrPreview && (
        <PremiumModal
          open
          onClose={() => setQrPreview(null)}
          icon={QrCode}
          eyebrow="Table QR"
          title={qrPreview.table.label}
          subtitle={`${qrPreview.outlet?.name || ''} · ${qrPreview.table.code}`}
          accent="indigo"
          size="md"
          footer={
            <>
              <SecondaryButton onClick={() => setQrPreview(null)}>Close</SecondaryButton>
              <PrimaryButton onClick={() => handlePrint(qrPreview.table)}>
                <span className="inline-flex items-center gap-1.5"><Printer size={13} /> Print</span>
              </PrimaryButton>
            </>
          }
        >
          <ModalSection icon={QrCode} title="Scan to test" subtitle="Open the same URL on your phone to preview the customer experience.">
            <div className="flex flex-col items-center gap-3">
              <img src={qrImageSrc(qrPreview.url, 320)} alt="QR" className="rounded-xl border border-slate-200" />
              <p className="text-[11px] font-mono break-all text-slate-500 text-center">{qrPreview.url}</p>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(qrPreview.url); toast.success('URL copied'); }}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Copy URL
              </button>
            </div>
          </ModalSection>
        </PremiumModal>
      )}
    </div>
  );
};

const paymentFromOutlet = (outlet) => ({
  enabled: Boolean(outlet?.qrOrdering?.customerPayment?.enabled),
  bankName: outlet?.qrOrdering?.customerPayment?.bankName || '',
  accountTitle: outlet?.qrOrdering?.customerPayment?.accountTitle || '',
  accountNumber: outlet?.qrOrdering?.customerPayment?.accountNumber || '',
  iban: outlet?.qrOrdering?.customerPayment?.iban || '',
  instructions: outlet?.qrOrdering?.customerPayment?.instructions || '',
});

const preparationCategoriesFromOutlet = (outlet) => (
  Array.isArray(outlet?.qrOrdering?.preparationCategories)
    ? outlet.qrOrdering.preparationCategories.map((category) => ({
        _id: category._id,
        name: category.name || '',
        preparationMinutes: Number(category.preparationMinutes ?? 20),
        menuCategoryIds: (category.menuCategoryIds || []).map(String),
      }))
    : []
);

let preparationCategorySequence = 0;
const withLocalKey = (category) => ({
  ...category,
  localKey: category._id || `new-preparation-category-${Date.now()}-${preparationCategorySequence += 1}`,
});

const QrPreparationSettings = ({ outlet, onSave }) => {
  const [minutes, setMinutes] = useState(Number(outlet?.qrOrdering?.preparationMinutes ?? 20));
  const [preparationCategories, setPreparationCategories] = useState(
    preparationCategoriesFromOutlet(outlet).map(withLocalKey),
  );
  const [menuCategories, setMenuCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMinutes(Number(outlet?.qrOrdering?.preparationMinutes ?? 20));
    setPreparationCategories(preparationCategoriesFromOutlet(outlet).map(withLocalKey));
  }, [outlet]);

  useEffect(() => {
    let active = true;
    setCategoriesLoading(true);
    getQrMenuCategories(outlet._id)
      .then((response) => {
        if (active) setMenuCategories(response?.data?.data || []);
      })
      .catch((error) => {
        if (active) {
          setMenuCategories([]);
          toast.error(error.response?.data?.message || 'Could not load menu categories');
        }
      })
      .finally(() => {
        if (active) setCategoriesLoading(false);
      });
    return () => { active = false; };
  }, [outlet._id]);

  const setPreparationField = (localKey, field, value) => {
    setPreparationCategories((current) => current.map((category) => (
      category.localKey === localKey ? { ...category, [field]: value } : category
    )));
  };

  const toggleMenuCategory = (localKey, menuCategoryId) => {
    setPreparationCategories((current) => current.map((category) => {
      if (category.localKey !== localKey) return category;
      const ids = new Set(category.menuCategoryIds);
      if (ids.has(menuCategoryId)) ids.delete(menuCategoryId);
      else ids.add(menuCategoryId);
      return { ...category, menuCategoryIds: [...ids] };
    }));
  };

  const assignments = useMemo(() => {
    const result = new Map();
    preparationCategories.forEach((category) => {
      category.menuCategoryIds.forEach((id) => result.set(String(id), category.localKey));
    });
    return result;
  }, [preparationCategories]);

  const submit = async () => {
    setBusy(true);
    try {
      await onSave({
        preparationMinutes: Number(minutes),
        preparationCategories: preparationCategories.map(({ localKey, ...category }) => category),
        customerPayment: paymentFromOutlet(outlet),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <Clock3 size={17} className="text-indigo-600" /> QR preparation routing
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Group Menu Management categories into customer-facing areas such as Kitchen and Bar, each with its own timer.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className={labelCls}>Unassigned items</label>
            <input
              type="number"
              min="0"
              max="240"
              step="1"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              className={`${inputCls} w-28`}
            />
            <p className="mt-1 text-[10px] text-slate-400">Default minutes</p>
          </div>
          <Button variant="primary" icon={Save} onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="mt-5 border-t border-indigo-100 pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-700">Preparation categories</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Each menu category can be assigned once. Unassigned items use the default time above.</p>
          </div>
          <button
            type="button"
            onClick={() => setPreparationCategories((current) => [
              ...current,
              withLocalKey({ name: '', preparationMinutes: Number(minutes) || 0, menuCategoryIds: [] }),
            ])}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
          >
            <Plus size={14} /> Add preparation category
          </button>
        </div>

        {preparationCategories.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-5 text-center text-xs text-slate-500">
            No preparation categories yet. All QR items currently use the default Kitchen timer.
          </div>
        ) : (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {preparationCategories.map((category) => (
              <div key={category.localKey} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_96px_auto]">
                  <div>
                    <label className={labelCls}>Customer-facing name</label>
                    <input
                      value={category.name}
                      onChange={(event) => setPreparationField(category.localKey, 'name', event.target.value)}
                      placeholder="Kitchen, Bar, Desserts…"
                      maxLength={80}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Minutes</label>
                    <input
                      type="number"
                      min="0"
                      max="240"
                      step="1"
                      value={category.preparationMinutes}
                      onChange={(event) => setPreparationField(category.localKey, 'preparationMinutes', event.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreparationCategories((current) => current.filter((item) => item.localKey !== category.localKey))}
                    className="justify-self-end rounded-xl border border-rose-100 p-2.5 text-rose-500 hover:bg-rose-50 sm:mb-0.5"
                    title="Delete preparation category"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="mt-3">
                  <p className={labelCls}>Menu Management categories</p>
                  {categoriesLoading ? (
                    <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-400">Loading categories…</p>
                  ) : menuCategories.length === 0 ? (
                    <p className="rounded-xl bg-amber-50 px-3 py-3 text-xs text-amber-700">Create menu categories in Menu Management first.</p>
                  ) : (
                    <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                      {menuCategories.map((menuCategory) => {
                        const id = String(menuCategory._id);
                        const assignedTo = assignments.get(id);
                        const checked = category.menuCategoryIds.includes(id);
                        const disabled = Boolean(assignedTo && assignedTo !== category.localKey);
                        return (
                          <label
                            key={id}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                              checked
                                ? 'border-indigo-300 bg-indigo-100 text-indigo-800'
                                : disabled
                                  ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400 opacity-60'
                                  : 'cursor-pointer border-slate-200 bg-white text-slate-600 hover:border-indigo-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleMenuCategory(category.localKey, id)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: menuCategory.color || '#94a3b8' }} />
                            {menuCategory.name}{!menuCategory.isActive ? ' (inactive)' : ''}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const QrCustomerPaymentSettings = ({ outlet, onSave }) => {
  const [form, setForm] = useState(paymentFromOutlet(outlet));
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm(paymentFromOutlet(outlet)), [outlet]);
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async () => {
    setBusy(true);
    try {
      await onSave({
        preparationMinutes: Number(outlet?.qrOrdering?.preparationMinutes ?? 20),
        preparationCategories: preparationCategoriesFromOutlet(outlet),
        customerPayment: form,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-base font-extrabold text-slate-900">
            <Landmark size={18} className="text-indigo-600" /> Customer bank details
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Shown publicly on {outlet.name}’s table QR menu. The cashier still verifies the transfer and completes checkout.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => setField('enabled', event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          Show on QR menu
        </label>
      </div>
      <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
        <div>
          <label className={labelCls}>Bank name</label>
          <input className={inputCls} value={form.bankName} onChange={(e) => setField('bankName', e.target.value)} placeholder="e.g. Meezan Bank" />
        </div>
        <div>
          <label className={labelCls}>Account title</label>
          <input className={inputCls} value={form.accountTitle} onChange={(e) => setField('accountTitle', e.target.value)} placeholder="Restaurant or company name" />
        </div>
        <div>
          <label className={labelCls}>Account number</label>
          <input className={inputCls} value={form.accountNumber} onChange={(e) => setField('accountNumber', e.target.value)} placeholder="Account number" />
        </div>
        <div>
          <label className={labelCls}>IBAN</label>
          <input className={`${inputCls} font-mono uppercase`} value={form.iban} onChange={(e) => setField('iban', e.target.value.toUpperCase())} placeholder="PK00 BANK 0000 0000 0000 0000" />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Payment instructions (optional)</label>
          <textarea
            rows={3}
            className={inputCls}
            value={form.instructions}
            onChange={(e) => setField('instructions', e.target.value)}
            placeholder="Please show the transfer confirmation to the cashier."
          />
        </div>
      </div>
      <div className="flex justify-end border-t border-slate-100 p-4">
        <Button variant="primary" icon={Save} onClick={submit} disabled={busy}>
          {busy ? 'Saving…' : 'Save payment settings'}
        </Button>
      </div>
    </div>
  );
};

const TableEditor = ({ initial, outlets, onClose, onSave }) => {
  const [form, setForm] = useState({
    _id: initial._id,
    outlet: initial.outlet || '',
    label: initial.label || '',
    code: initial.code || '',
    capacity: initial.capacity || 0,
    notes: initial.notes || '',
    isActive: initial.isActive !== false,
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.outlet) return toast.error('Pick an outlet.');
    if (!form.label.trim()) return toast.error('Label is required.');
    setBusy(true);
    try {
      // If the code field is blank, drop it from the payload — the backend
      // keeps the existing one on update, or derives from label on create.
      const payload = { ...form };
      if (!payload.code || !String(payload.code).trim()) delete payload.code;
      await onSave(payload);
    } finally {
      setBusy(false);
    }
  };

  const isNew = !form._id;

  return (
    <PremiumModal
      open
      onClose={busy ? undefined : onClose}
      icon={isNew ? Plus : Edit2}
      eyebrow={isNew ? 'Add Table' : 'Edit Table'}
      title={form.label || 'New table'}
      accent="indigo"
      size="md"
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={busy}>
            <span className="inline-flex items-center gap-1.5"><Save size={13} /> {busy ? 'Saving…' : 'Save'}</span>
          </PrimaryButton>
        </>
      }
    >
      <ModalSection title="Details">
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className={labelCls}>Outlet <span className="text-rose-500">*</span></label>
            <SearchableSelect
              options={outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code }))}
              value={form.outlet}
              onChange={(v) => setForm((f) => ({ ...f, outlet: v }))}
              placeholder="Select outlet"
              disabled={!isNew}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Label <span className="text-rose-500">*</span></label>
              <input className={inputCls} value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Table 1, Window seat…" />
            </div>
            <div>
              <label className={labelCls}>Code (URL)</label>
              <input className={inputCls} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="auto-derived from label" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Seats (optional)</label>
              <input type="number" min="0" className={inputCls} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <input className={inputCls} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
          </div>
        </div>
      </ModalSection>
    </PremiumModal>
  );
};

export default Tables;

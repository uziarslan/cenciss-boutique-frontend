import { useState, useEffect, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router';
import { ChevronDown, ChevronRight, Eye, EyeOff, Save, AlertTriangle, CheckCircle, Scale, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { submitStockCount } from '../../api/inventoryApi';
import { useGetOutletsQuery, useGetVendorsQuery, useGetStockQuery, listQueryOpts, baseApi } from '../../store/baseApi';
import useAuth from '../../hooks/useAuth';
import usePermissions from '../../hooks/usePermissions';
import SearchableSelect from '../../components/UI/SearchableSelect';
import HeroBanner from '../../components/UI/HeroBanner';
import Button from '../../components/UI/Button';
import PremiumModal, { SecondaryButton, PrimaryButton } from '../../components/UI/PremiumModal';
import useQueryState from '../../hooks/useQueryState';

const DRAFT_KEY = 'restaurant_stock_count_draft';

const fmt2 = (n) => (n ?? 0).toFixed(2);

// ── Variance preview modal ────────────────────────────────────────────────────
const VarianceModal = ({ lines, onConfirm, onCancel, submitting }) => {
  // How to book shortages: 'sold' (normal consumption — default) or 'waste'.
  const [shortageMode, setShortageMode] = useState('sold');

  // Only lines the user actually counted count as variances — an uncounted
  // (blank) line must NOT be scored as a shortage of its whole system qty. This
  // matches the submit filter, so the preview + shortage toggle reflect exactly
  // what will be posted.
  const countedLines = lines.filter((l) => l.countedQty !== '' && l.countedQty !== undefined && l.countedQty !== null);
  const variantLines = countedLines.filter((l) => {
    const diff = (parseFloat(l.countedQty) || 0) - (l.systemQty ?? 0);
    return Math.abs(diff) >= 0.001;
  });

  const totalVarianceValue = variantLines.reduce((s, l) => {
    const diff = (parseFloat(l.countedQty) || 0) - (l.systemQty ?? 0);
    return s + Math.abs(diff * (l.costPerUnit ?? 0));
  }, 0);

  const hasShortage = variantLines.some((l) => (parseFloat(l.countedQty) || 0) - (l.systemQty ?? 0) < 0);

  const accent = variantLines.length === 0 ? 'emerald' : 'amber';

  return (
    <PremiumModal
      open
      onClose={submitting ? undefined : onCancel}
      icon={Scale}
      eyebrow="Variance Preview"
      title={variantLines.length === 0 ? 'No Variances' : `${variantLines.length} Variance${variantLines.length === 1 ? '' : 's'} Found`}
      subtitle={`Estimated value impact: Rs. ${totalVarianceValue.toFixed(2)}`}
      accent={accent}
      size="xl"
      footer={
        <>
          <SecondaryButton type="button" onClick={onCancel} disabled={submitting}>Back to Edit</SecondaryButton>
          <PrimaryButton type="button" onClick={() => onConfirm(shortageMode)} disabled={submitting} accent="indigo">
            {submitting ? 'Submitting…' : 'Confirm & Submit'}
          </PrimaryButton>
        </>
      }
    >
      <>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {variantLines.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
            <CheckCircle size={28} className="text-emerald-400" />
            <p className="text-sm font-medium text-slate-500">All counts match system quantities — no variances.</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-100 sticky top-0">
                <tr>
                  {['Product', 'Unit', 'System Qty', 'Counted Qty', 'Variance', 'Est. Value'].map((h) => (
                    <th key={h} className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {variantLines.map((line) => {
                  const variance = (parseFloat(line.countedQty) || 0) - (line.systemQty ?? 0);
                  const positive = variance > 0;
                  const estValue = Math.abs(variance * (line.costPerUnit ?? 0));
                  return (
                    <tr key={line.product} className={clsx(
                      positive ? 'bg-blue-50/40' : 'bg-rose-50/40'
                    )}>
                      <td className="py-2.5 px-4 font-medium text-gray-800">{line.productName}</td>
                      <td className="py-2.5 px-4 text-gray-500">{line.unit ?? '—'}</td>
                      <td className="py-2.5 px-4 text-gray-600 tabular-nums">{fmt2(line.systemQty)}</td>
                      <td className="py-2.5 px-4 font-semibold text-gray-800 tabular-nums">{fmt2(parseFloat(line.countedQty) || 0)}</td>
                      <td className={clsx('py-2.5 px-4 font-bold tabular-nums', positive ? 'text-blue-700' : 'text-rose-700')}>
                        {positive ? '+' : ''}{fmt2(variance)}
                      </td>
                      <td className="py-2.5 px-4 text-gray-600 tabular-nums">Rs. {estValue.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {hasShortage && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">How should the shortages be recorded?</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                {shortageMode === 'sold'
                  ? 'Sold / Consumed — the missing stock left through normal sales or use. Its cost stays in Purchase Expense; nothing is booked as waste.'
                  : 'Waste / Spoilage — the missing stock was thrown away. Its cost is reclassified to Waste & Spoilage.'}
              </p>
            </div>
            <div className="grid w-full shrink-0 grid-cols-2 rounded-lg border border-gray-300 bg-gray-50 p-0.5 sm:inline-flex sm:w-auto">
              <button
                type="button"
                onClick={() => setShortageMode('sold')}
                className={clsx('px-3 py-1.5 text-sm font-semibold rounded-md transition whitespace-nowrap',
                  shortageMode === 'sold' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-800')}
              >
                Sold / Consumed
              </button>
              <button
                type="button"
                onClick={() => setShortageMode('waste')}
                className={clsx('px-3 py-1.5 text-sm font-semibold rounded-md transition whitespace-nowrap',
                  shortageMode === 'waste' ? 'bg-rose-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-800')}
              >
                Waste / Spoilage
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    </PremiumModal>
  );
};

// ── Category section ──────────────────────────────────────────────────────────
const CategorySection = ({ category, lines, onUpdate }) => {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition text-left"
      >
        <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">{category}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{lines.length} items</span>
          {open ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-gray-100">
              <tr>
                {['Product', 'Unit', 'System Qty', 'Counted Qty', 'Notes'].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase py-2 px-4 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lines.map((line) => (
                <LineRow key={line.product} line={line} onUpdate={onUpdate} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ── Line row ──────────────────────────────────────────────────────────────────
const LineRow = ({ line, onUpdate }) => {
  const [showSysQty, setShowSysQty] = useState(false);

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="py-2.5 px-4">
        <p className="font-medium text-gray-800">{line.productName}</p>
        {line.sku && <p className="text-xs font-mono text-gray-400">{line.sku}</p>}
      </td>
      <td className="py-2.5 px-4 text-gray-500">{line.unit ?? '—'}</td>
      <td className="py-2.5 px-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 w-12 text-right font-mono">
            {showSysQty ? fmt2(line.systemQty) : '••••'}
          </span>
          <button
            type="button"
            onClick={() => setShowSysQty((s) => !s)}
            className="p-1 text-gray-400 hover:text-gray-600 rounded transition"
            title={showSysQty ? 'Hide' : 'Show system qty'}
          >
            {showSysQty ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
      </td>
      <td className="py-2.5 px-4">
        <input
          type="number"
          step="0.01"
          min="0"
          value={line.countedQty ?? ''}
          onChange={(e) => onUpdate(line.product, 'countedQty', e.target.value)}
          placeholder="0.00"
          className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </td>
      <td className="py-2.5 px-4">
        <input
          type="text"
          value={line.notes ?? ''}
          onChange={(e) => onUpdate(line.product, 'notes', e.target.value)}
          placeholder="Optional…"
          className="w-40 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </td>
    </tr>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const StockCount = () => {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { has }   = usePermissions();
  const canManage = has('inventory.manage');

  const dispatch  = useDispatch();
  const [submitting, setSubmitting] = useState(false);
  const [grouped,    setGrouped]    = useState({}); // { category: [lines] }
  const [lines,      setLines]      = useState([]); // flat list with editable fields
  const { data: outlets = [] } = useGetOutletsQuery();
  const [outlet, setOutlet] = useQueryState('outlet', '');
  const [countDate,  setCountDate]  = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showModal,  setShowModal]  = useState(false);
  const { data: vendors = [] } = useGetVendorsQuery();
  const [vendor, setVendor] = useQueryState('vendor', '');

  // ── Auto-select the first outlet once loaded ─────────────────────────────────
  useEffect(() => {
    if (outlets.length > 0 && !outlet) setOutlet(outlets[0]._id);
  }, [outlets, outlet, setOutlet]);


  // ── Load stock and restore draft ───────────────────────────────────────────
  const stockParams = useMemo(() => ({ limit: 200 }), []);
  const { data: stockPayload, isLoading: loading } = useGetStockQuery(stockParams, listQueryOpts);

  useEffect(() => {
    if (!stockPayload) return;
    const items = stockPayload.items ?? [];

    // Try restoring draft from localStorage
    let draft = null;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) draft = JSON.parse(raw);
    } catch { /* ignore */ }

    const baseLines = items.map((item) => {
      const saved = draft?.lines?.find((l) => l.product === item.product?.toString());
      return {
        product:     item.product,
        productName: item.productName,
        sku:         item.sku,
        category:    item.category ?? 'Uncategorised',
        unit:        item.unit,
        systemQty:   item.qtyOnHand ?? 0,
        costPerUnit: item.currentPrice ?? 0,
        countedQty:  saved?.countedQty ?? '',
        notes:       saved?.notes ?? '',
      };
    });

    if (draft?.outlet) setOutlet(draft.outlet);
    if (draft?.countDate) setCountDate(draft.countDate);

    setLines(baseLines);

    // Group by category
    const grp = {};
    baseLines.forEach((l) => {
      if (!grp[l.category]) grp[l.category] = [];
      grp[l.category].push(l);
    });
    setGrouped(grp);
  }, [stockPayload, setOutlet]);

  // ── Update a line field ────────────────────────────────────────────────────
  const updateLine = (productId, field, value) => {
    setLines((prev) =>
      prev.map((l) => l.product === productId ? { ...l, [field]: value } : l)
    );
  };

  // ── Save draft to localStorage ─────────────────────────────────────────────
  const saveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        outlet,
        countDate,
        lines: lines.map((l) => ({ product: l.product, countedQty: l.countedQty, notes: l.notes })),
      }));
      toast.success('Progress saved.');
    } catch {
      toast.error('Failed to save draft.');
    }
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleConfirm = async (shortageMode = 'sold') => {
    setSubmitting(true);
    try {
      const payload = {
        outlet,
        shortageMode,
        ...(vendor && { vendor }),
        lines: lines
          .filter((l) => l.countedQty !== '' && l.countedQty !== undefined)
          .map((l) => ({
            product:    l.product,
            countedQty: parseFloat(l.countedQty) || 0,
            unit:       l.unit,
            notes:      l.notes,
          })),
      };

      if (payload.lines.length === 0) {
        toast.error('Enter at least one counted quantity.');
        setSubmitting(false);
        return;
      }

      await submitStockCount(payload);
      dispatch(baseApi.util.invalidateTags(['Stock', 'Report', 'Accounting', 'WasteLog']));
      localStorage.removeItem(DRAFT_KEY);
      toast.success('Stock count submitted — inventory updated.');
      navigate('/inventory/stock');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const categories = Object.keys(grouped).sort();
  const filledCount = lines.filter((l) => l.countedQty !== '' && l.countedQty !== undefined).length;

  return (
    <div className="space-y-5">
      <HeroBanner
        icon={ClipboardList}
        eyebrow="Receiving"
        title="Add New Stock"
        subtitle={`${filledCount} of ${lines.length} items counted. Submit when you're done to update inventory.`}
        accent="emerald"
        compact
        actions={canManage && (
          <>
            <Button
              variant="secondary"
              icon={Save}
              onClick={saveDraft}

            >
              Save Progress
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowModal(true)}
              disabled={filledCount === 0}

            >
              Submit Count
            </Button>
          </>
        )}
      />

      {/* Header fields */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Outlet</label>
            <SearchableSelect
              options={outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))}
              value={outlet}
              onChange={setOutlet}
              placeholder="Select outlet"
              searchPlaceholder="Search outlets…"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Vendor <span className="text-gray-400 normal-case font-normal">(optional)</span>
            </label>
            <SearchableSelect
              options={[{ value: '', label: 'No vendor' }, ...vendors.map((v) => ({ value: v._id, label: v.name, meta: v.code || '' }))]}
              value={vendor}
              onChange={setVendor}
              placeholder="No vendor"
              searchPlaceholder="Search vendors…"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Date</label>
            <input
              type="date"
              value={countDate}
              onChange={(e) => setCountDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Added By</label>
            <input
              type="text"
              value={user?.name ?? user?.email ?? '—'}
              readOnly
              className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-500 cursor-default"
            />
          </div>
        </div>
      </div>

      {/* Draft restore notice */}
      {(() => {
        try {
          const raw = localStorage.getItem(DRAFT_KEY);
          return raw ? (
            <div className="flex items-center gap-2 px-4 py-2.5 mb-4 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle size={14} className="text-amber-500 shrink-0" />
              <p className="text-xs text-amber-700">Draft restored from last saved progress.</p>
              <button
                onClick={() => { localStorage.removeItem(DRAFT_KEY); window.location.reload(); }}
                className="ml-auto text-xs text-amber-600 underline hover:no-underline"
              >
                Clear draft
              </button>
            </div>
          ) : null;
        } catch { return null; }
      })()}

      {/* Category sections */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        categories.map((cat) => (
          <CategorySection
            key={cat}
            category={cat}
            lines={grouped[cat].map((gl) => lines.find((l) => l.product === gl.product) ?? gl)}
            onUpdate={updateLine}
          />
        ))
      )}

      {showModal && (
        <VarianceModal
          lines={lines}
          onConfirm={handleConfirm}
          onCancel={() => setShowModal(false)}
          submitting={submitting}
        />
      )}
    </div>
  );
};

export default StockCount;

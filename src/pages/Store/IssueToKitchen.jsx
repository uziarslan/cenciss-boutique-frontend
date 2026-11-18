import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
import { ArrowRightLeft, Plus, Trash2, AlertTriangle, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useGetOutletsQuery, useGetStockQuery, baseApi, listQueryOpts } from '../../store/baseApi';
import { createStockIssue } from '../../api/stockIssueApi';
import SearchableSelect from '../../components/UI/SearchableSelect';
import AmountInput from '../../components/UI/AmountInput';
import HeroBanner from '../../components/UI/HeroBanner';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import { convertQty, entryUnitsForProduct } from '../../utils/units';
import useQueryState from '../../hooks/useQueryState';

// Parse the first positive number out of a packSize string like "12 pcs/pack".
const parsePackSize = (str) => {
  if (!str) return null;
  const n = parseFloat(String(str).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 1 ? n : null;
};

const emptyLine = () => ({ product: '', qty: '', unit: '', packsMode: false, packs: '', perPack: '' });

const DIRECTIONS = {
  storeToKitchen: { key: 'storeToKitchen', label: 'Store → Kitchen', source: 'store',   sourceLabel: 'Store',   destLabel: 'Kitchen', verb: 'Send to Kitchen' },
  kitchenToStore: { key: 'kitchenToStore', label: 'Kitchen → Store', source: 'kitchen', sourceLabel: 'Kitchen', destLabel: 'Store',   verb: 'Send to Store' },
};

// `fixedDirection` locks the transfer direction (each area only sends one way) and
// hides the toggle. `basePath` is the area root used to navigate to its Transfers
// tab after sending. With no fixedDirection the toggle is shown (back-compat).
const IssueToKitchen = ({ fixedDirection, basePath = '/store' }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { data: outlets = [] } = useGetOutletsQuery();
  const [outlet, setOutlet] = useQueryState('outlet', '');
  const [direction, setDirection] = useState(fixedDirection || 'storeToKitchen');
  const [lines, setLines] = useState([emptyLine()]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const dir = DIRECTIONS[direction];

  useEffect(() => {
    if (outlets.length > 0 && !outlet) setOutlet(outlets[0]._id);
  }, [outlets, outlet, setOutlet]);

  // Stock is drawn from the SOURCE area for the chosen direction.
  const queryParams = useMemo(
    () => ({ area: dir.source, limit: 200, ...(outlet ? { outlet } : {}) }),
    [dir.source, outlet],
  );
  const { data: payload } = useGetStockQuery(queryParams, { ...listQueryOpts, skip: !outlet });
  const sourceItems = useMemo(() => payload?.items ?? [], [payload]);

  const stockByProduct = useMemo(
    () => Object.fromEntries(sourceItems.map((s) => [s.product, s])),
    [sourceItems],
  );

  const selectedIds = new Set(lines.map((l) => l.product).filter(Boolean));

  const optionsFor = (currentProduct) =>
    sourceItems
      .filter((s) => (s.qtyOnHand || 0) > 0)
      .filter((s) => s.product === currentProduct || !selectedIds.has(s.product))
      .map((s) => ({
        value: s.product,
        label: s.productName,
        meta: `${(s.qtyOnHand ?? 0).toFixed(2)} ${s.unit ?? ''}`.trim(),
      }));

  const setLine = (idx, patch) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (idx) => setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const baseUnitOf = (pid) => stockByProduct[pid]?.unit || '';

  const changeDirection = (key) => {
    setDirection(key);
    setLines([emptyLine()]); // source changed — clear picked items
  };

  const lineState = (l) => {
    if (!l.product) return { valid: false, available: null, over: false, unitOptions: [] };
    const src = stockByProduct[l.product];
    const available = src?.qtyOnHand ?? 0;
    const baseUnit = src?.unit || '';

    if (l.packsMode) {
      const p = parseFloat(l.packs) || 0;
      const s = parseFloat(l.perPack) || 0;
      const baseQty = p * s;
      return {
        available,
        baseUnit,
        baseQty,
        over: baseQty > 0 && baseQty > available,
        valid: baseQty > 0 && baseQty <= available,
        unitOptions: [],
        packsMode: true,
      };
    }

    const entryUnit = l.unit || baseUnit;
    const entered = parseFloat(l.qty) || 0;
    const { qty: baseQty, converted } = convertQty(entered, entryUnit, baseUnit);
    return {
      available,
      baseUnit,
      entryUnit,
      baseQty,
      converted,
      unitOptions: entryUnitsForProduct(baseUnit),
      over: converted && baseQty > available,
      valid: converted && baseQty > 0 && baseQty <= available,
    };
  };

  const filledLines = lines.filter((l) => {
    if (!l.product) return false;
    if (l.packsMode) return (parseFloat(l.packs) || 0) > 0 && (parseFloat(l.perPack) || 0) > 0;
    return (parseFloat(l.qty) || 0) > 0;
  });
  const anyOver = lines.some((l) => lineState(l).over);
  const canSubmit = !!outlet && filledLines.length > 0 && !anyOver && !submitting;

  const handleSubmit = async () => {
    if (!outlet) { toast.error('Select an outlet.'); return; }
    if (filledLines.length === 0) { toast.error('Add at least one item with a quantity.'); return; }
    if (anyOver) { toast.error(`One or more lines exceed what the ${dir.sourceLabel.toLowerCase()} holds.`); return; }

    setSubmitting(true);
    try {
      const { data } = await createStockIssue({
        outlet,
        direction,
        notes: notes || undefined,
        lines: filledLines.map((l) => {
          if (l.packsMode) {
            const baseQty = (parseFloat(l.packs) || 0) * (parseFloat(l.perPack) || 0);
            return { product: l.product, qty: baseQty, unit: baseUnitOf(l.product) };
          }
          return { product: l.product, qty: parseFloat(l.qty), unit: l.unit || undefined };
        }),
      });
      dispatch(baseApi.util.invalidateTags(['Stock', 'StockIssue', 'Report', 'Accounting']));
      toast.success(`Sent to ${dir.destLabel} — ${data?.data?.issueNumber ?? 'done'} · awaiting acceptance.`);
      setLines([emptyLine()]);
      setNotes('');
      navigate(`${basePath}/transfers`);
    } catch (err) {
      const shortages = err.response?.data?.shortages;
      if (shortages?.length) {
        toast.error(`Not enough in ${dir.sourceLabel.toLowerCase()}: ${shortages.map((s) => s.name).join(', ')}`);
      } else {
        toast.error(err.response?.data?.message ?? 'Failed to move stock.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <HeroBanner
        icon={ArrowRightLeft}
        eyebrow={dir.sourceLabel}
        title={dir.verb}
        subtitle={`Send stock ${dir.sourceLabel} → ${dir.destLabel}. It leaves the ${dir.sourceLabel.toLowerCase()} now and lands in the ${dir.destLabel.toLowerCase()} only once the ${dir.destLabel.toLowerCase()} team accepts it.`}
        accent="indigo"
      />

      <Card title="Details" subtitle={fixedDirection ? 'Outlet and optional note' : 'Direction, outlet and optional note'} icon={ArrowRightLeft}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Direction toggle — only when the direction isn't locked by the area */}
          {!fixedDirection && (
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Direction</label>
              <div className="grid w-full grid-cols-2 rounded-lg border border-gray-300 bg-gray-50 p-0.5 sm:inline-flex sm:w-auto">
                {Object.values(DIRECTIONS).map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => changeDirection(d.key)}
                    className={clsx(
                      'rounded-md px-2 py-1.5 text-xs font-semibold transition sm:px-4 sm:text-sm',
                      direction === d.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-800',
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Outlet <span className="text-red-500">*</span></label>
            <SearchableSelect
              options={outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))}
              value={outlet}
              onChange={(v) => { setOutlet(v); setLines([emptyLine()]); }}
              placeholder="Select outlet…"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. morning kitchen restock"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
          </div>
        </div>
      </Card>

      <Card
        title="Items to Move"
        subtitle={`Pick ${dir.sourceLabel.toLowerCase()} items and how much to move to the ${dir.destLabel.toLowerCase()}`}
        icon={Plus}
        iconAccent="emerald"
        action={
          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 rounded-lg transition"
          >
            <Plus size={13} /> Add Line
          </button>
        }
      >
        <div className="space-y-2">
          {lines.map((line, i) => {
            const st            = lineState(line);
            const savedPackSize = parsePackSize(stockByProduct[line.product]?.packSize);
            const canUsePacks   = !!line.product && savedPackSize !== null;

            const packsTotal = line.packsMode
              ? (parseFloat(line.packs) || 0) * (parseFloat(line.perPack) || 0)
              : 0;
            const showTotal = line.packsMode
              && (parseFloat(line.packs) || 0) > 0
              && (parseFloat(line.perPack) || 0) > 0;

            return (
              <div key={i} className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-slate-100 p-3 sm:flex-nowrap sm:border-0 sm:p-0">

                {/* Product — grows to fill available space */}
                <div className="w-full min-w-0 sm:flex-1">
                  <SearchableSelect
                    options={optionsFor(line.product)}
                    value={line.product}
                    onChange={(v) => {
                      const ps = parsePackSize(stockByProduct[v]?.packSize);
                      setLine(i, { product: v, unit: baseUnitOf(v), packsMode: false, packs: '', perPack: ps ? String(ps) : '' });
                    }}
                    placeholder="Select item…"
                    searchPlaceholder="Search items…"
                  />
                </div>

                {/* Qty / No. of packs */}
                <div className="shrink-0">
                  <AmountInput
                    value={line.packsMode ? line.packs : line.qty}
                    onChange={(raw) => setLine(i, line.packsMode ? { packs: raw } : { qty: raw })}
                    placeholder={line.packsMode ? 'Packs' : 'Qty'}
                    className={clsx(
                      'w-20 px-3 py-2 border rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 transition',
                      st.over ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white',
                    )}
                  />
                </div>

                {/* × separator in packs mode only */}
                {line.packsMode && (
                  <span className="shrink-0 text-gray-400 font-semibold text-sm">×</span>
                )}

                {/* Per-pack input OR unit selector */}
                {line.packsMode ? (
                  <AmountInput
                    value={line.perPack}
                    onChange={(raw) => setLine(i, { perPack: raw })}
                    placeholder={savedPackSize ? String(savedPackSize) : '—'}
                    className="w-20 shrink-0 px-3 py-2 border border-gray-300 bg-white rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                ) : (st.unitOptions ?? []).length > 1 ? (
                  <div className="w-20 shrink-0">
                    <SearchableSelect
                      options={st.unitOptions.map((u) => ({ value: u, label: u }))}
                      value={line.unit}
                      onChange={(v) => setLine(i, { unit: v })}
                      placeholder={st.baseUnit || 'unit'}
                    />
                  </div>
                ) : null}

                {/* Total (packs mode) or converted unit (units mode) */}
                <div className="min-w-[7rem] flex-1 sm:w-28 sm:flex-none sm:shrink-0">
                  {line.product && (
                    line.packsMode ? (
                      <div className={clsx('leading-tight', st.over ? 'text-red-600' : 'text-indigo-700')}>
                        <span className="text-sm font-semibold block">
                          {showTotal ? `= ${packsTotal.toFixed(2)} ${st.baseUnit}` : `— ${st.baseUnit}`}
                        </span>
                        <span className={clsx('text-xs', st.over ? 'text-red-400' : 'text-gray-400')}>
                          {st.over ? 'exceeds stock' : `of ${(st.available ?? 0).toFixed(2)} avail`}
                        </span>
                      </div>
                    ) : (
                      st.converted && st.entryUnit !== st.baseUnit && (parseFloat(line.qty) || 0) > 0 ? (
                        <span className="text-sm font-semibold text-indigo-700">
                          = {st.baseQty.toFixed(3)} {st.baseUnit}
                        </span>
                      ) : st.over ? (
                        <span className="text-xs text-red-500 font-medium">exceeds stock</span>
                      ) : null
                    )
                  )}
                </div>

                {/* Packs toggle — only for products with a saved packSize */}
                {canUsePacks && (
                  <button
                    type="button"
                    onClick={() => setLine(i, {
                      packsMode: !line.packsMode,
                      qty: '',
                      packs: '',
                      perPack: line.perPack || (savedPackSize ? String(savedPackSize) : ''),
                    })}
                    title={line.packsMode ? 'Switch to units' : 'Switch to packs'}
                    className={clsx(
                      'shrink-0 inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-semibold border transition whitespace-nowrap',
                      line.packsMode
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600',
                    )}
                  >
                    <Package size={12} />
                    {line.packsMode ? 'Packs ✓' : 'Packs'}
                  </button>
                )}

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                  disabled={lines.length === 1}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>

        {anyOver && (
          <div className="mt-3 flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl">
            <AlertTriangle size={15} className="text-red-500 shrink-0" />
            <p className="text-xs text-red-700">Some lines exceed the {dir.sourceLabel.toLowerCase()} quantity. Reduce them to continue.</p>
          </div>
        )}

        <div className="flex justify-end mt-5">
          <Button variant="gradient" icon={ArrowRightLeft} onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Moving…' : dir.verb}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default IssueToKitchen;

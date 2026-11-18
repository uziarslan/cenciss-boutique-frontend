import { useMemo } from 'react';
import { format, startOfMonth } from 'date-fns';
import clsx from 'clsx';
import { Warehouse, Boxes, ArrowDownLeft, ArrowUpRight, Wallet, Download } from 'lucide-react';
import {
  useGetStockMovementSummaryQuery,
  useGetStockMovementsQuery,
  useGetOutletsQuery,
  listQueryOpts,
} from '../../store/baseApi';
import HeroBanner from '../../components/UI/HeroBanner';
import FilterBar from '../../components/UI/FilterBar';
import DateRangePicker from '../../components/UI/DateRangePicker';
import SearchableSelect from '../../components/UI/SearchableSelect';
import StatTile from '../../components/UI/StatTile';
import Button from '../../components/UI/Button';
import useQueryState from '../../hooks/useQueryState';

const fmt = (n) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtByUnit = (totals, key) => {
  const entries = Object.entries(totals?.[key] || {});
  return entries.length
    ? entries.map(([unit, quantity]) => `${fmt(quantity)} ${unit}`).join(' · ')
    : '0';
};

const TYPE_META = {
  receipt:         { label: 'Receipt',   cls: 'bg-emerald-100 text-emerald-700' },
  'issue-in':      { label: 'Issue In',  cls: 'bg-blue-100 text-blue-700' },
  'issue-out':     { label: 'Issue Out', cls: 'bg-orange-100 text-orange-700' },
  'return-in':     { label: 'Return In',  cls: 'bg-lime-100 text-lime-700' },
  'return-out':    { label: 'Return Out', cls: 'bg-fuchsia-100 text-fuchsia-700' },
  'production-out': { label: 'Manufacturing issue', cls: 'bg-orange-100 text-orange-700' },
  sale:            { label: 'Sale',      cls: 'bg-indigo-100 text-indigo-700' },
  waste:           { label: 'Waste',     cls: 'bg-rose-100 text-rose-700' },
  'prep-in':       { label: 'Prep In',   cls: 'bg-teal-100 text-teal-700' },
  'prep-out':      { label: 'Prep Out',  cls: 'bg-amber-100 text-amber-700' },
  'count-adjust':  { label: 'Count',     cls: 'bg-violet-100 text-violet-700' },
  'manual-adjust': { label: 'Adjust',    cls: 'bg-gray-100 text-gray-600' },
  reversal:        { label: 'Reversal',  cls: 'bg-cyan-100 text-cyan-700' },
};

const exportCSV = (rows, label, fromLabel, toLabel) => {
  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const data = [
    [`${label} Report`],
    [`Period: ${fromLabel} to ${toLabel}`],
    [],
    ['Product', 'SKU', 'Unit', 'Opening', 'In', 'Out', 'Closing', 'Value'],
    ...rows.map((r) => [r.name, r.sku ?? '', r.unit ?? '', r.opening, r.totalIn, r.totalOut, r.closing, r.value]),
    ['', '', '', 'Total', round2(sum('totalIn')), round2(sum('totalOut')), '', round2(sum('value'))],
  ];
  const csv = data.map((row) => row.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${label.toLowerCase()}-report-${fromLabel}-to-${toLabel}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// Shared movement report for one holding area. `area` = 'store' | 'kitchen'.
const AreaMovementReport = ({ area = 'kitchen' }) => {
  const isStore = area === 'store';
  const label = isStore ? 'Raw Materials' : 'Kitchen';

  const { data: outlets = [] } = useGetOutletsQuery();
  const [outlet, setOutlet] = useQueryState('outlet', '');
  const [from, setFrom] = useQueryState('from', () => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [to, setTo] = useQueryState('to', () => format(new Date(), 'yyyy-MM-dd'));

  const summaryParams = useMemo(
    () => ({ area, from: from || undefined, to: to || undefined, ...(outlet ? { outlet } : {}) }),
    [area, from, to, outlet],
  );
  const movementParams = useMemo(
    () => ({ area, from: from || undefined, to: to || undefined, limit: 200, ...(outlet ? { outlet } : {}) }),
    [area, from, to, outlet],
  );

  const { data: summary, isLoading: sumLoading } = useGetStockMovementSummaryQuery(summaryParams, listQueryOpts);
  const { data: movePayload, isLoading: movLoading } = useGetStockMovementsQuery(movementParams, listQueryOpts);

  const rows = useMemo(() => summary?.rows ?? [], [summary]);
  const totals = summary?.totals ?? { totalIn: 0, totalOut: 0, closingValue: 0, products: 0 };
  const movements = useMemo(() => movePayload?.movements ?? [], [movePayload]);

  // Money in vs out across the shown movements (value is unit-safe to sum, qty is not).
  const moveIn = useMemo(() => movements.reduce((s, m) => s + (m.value > 0 ? m.value : 0), 0), [movements]);
  const moveOut = useMemo(() => movements.reduce((s, m) => s + (m.value < 0 ? -m.value : 0), 0), [movements]);

  const fromLabel = from ? format(new Date(from), 'dd MMM yyyy') : 'start';
  const toLabel = to ? format(new Date(to), 'dd MMM yyyy') : 'today';

  return (
    <div className="space-y-5">
      <HeroBanner
        icon={isStore ? Warehouse : Boxes}
        eyebrow={label}
        title={isStore ? 'Raw Material Movement Report' : `${label} Report`}
        subtitle={isStore
          ? 'Track raw materials received from purchases, issued to manufacturing, and still on hand.'
          : 'Everything that moved through the kitchen — issued in, produced, sold, wasted, and what remains.'}
        accent={isStore ? 'indigo' : 'emerald'}
        actions={rows.length > 0 && (
          <Button variant="secondary" icon={Download} onClick={() => exportCSV(rows, label, fromLabel, toLabel)}>
            Export CSV
          </Button>
        )}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label={isStore ? 'Qty Received' : 'Total In'} value={isStore ? fmtByUnit(totals, 'totalInByUnit') : fmt(totals.totalIn)} icon={ArrowDownLeft} gradient="emerald" />
        <StatTile label={isStore ? 'Qty Issued' : 'Total Out'} value={isStore ? fmtByUnit(totals, 'totalOutByUnit') : fmt(totals.totalOut)} icon={ArrowUpRight} gradient="rose" />
        <StatTile label="Closing Value"  value={`Rs. ${fmt(totals.closingValue)}`} icon={Wallet} gradient="indigo" />
        <StatTile label="Products"       value={totals.products ?? rows.length} icon={Boxes} gradient="cyan" />
      </div>

      <FilterBar>
        {outlets.length > 1 && (
          <div className="min-w-[200px]">
            <SearchableSelect
              options={[{ value: '', label: 'All outlets' }, ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))]}
              value={outlet}
              onChange={setOutlet}
              placeholder="All outlets"
            />
          </div>
        )}
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <div className="ml-auto text-xs text-gray-400">{fromLabel} → {toLabel}</div>
      </FilterBar>

      {/* By product */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">By Product</h2>
          <p className="text-xs text-gray-400 mt-0.5">Opening, movement and closing balance for the period</p>
        </div>
        <div className="overflow-x-auto">
          {sumLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">No movement in this period.</div>
          ) : (
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase py-3 px-4">Product</th>
                  {['Opening', 'In', 'Out', 'Closing', 'Value (Rs.)'].map((h) => (
                    <th key={h} className="text-right text-xs font-semibold text-gray-500 uppercase py-3 px-4 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.product} className="hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 px-4">
                      <span className="font-medium text-gray-800">{r.name}</span>
                      {r.unit && <span className="text-xs text-gray-400 ml-1.5">/ {r.unit}</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-gray-600">{fmt(r.opening)}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-emerald-700">{r.totalIn ? fmt(r.totalIn) : '—'}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-rose-700">{r.totalOut ? fmt(r.totalOut) : '—'}</td>
                    <td className={clsx('py-2.5 px-4 text-right tabular-nums font-semibold', r.closing < 0 ? 'text-rose-600' : 'text-gray-800')}>{fmt(r.closing)}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-gray-700">{fmt(r.value)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="py-3 px-4 text-sm font-bold text-gray-700 uppercase tracking-wide">Total</td>
                  <td />
                  <td className="py-3 px-4 text-right text-sm font-bold text-emerald-700 tabular-nums">{isStore ? fmtByUnit(totals, 'totalInByUnit') : fmt(totals.totalIn)}</td>
                  <td className="py-3 px-4 text-right text-sm font-bold text-rose-700 tabular-nums">{isStore ? fmtByUnit(totals, 'totalOutByUnit') : fmt(totals.totalOut)}</td>
                  <td />
                  <td className="py-3 px-4 text-right text-sm font-bold text-indigo-700 tabular-nums">{fmt(totals.closingValue)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* Movement ledger */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Movements</h2>
          <p className="text-xs text-gray-400 mt-0.5">Every recorded change, most recent first{movements.length >= 200 ? ' (showing latest 200)' : ''}</p>
        </div>
        <div className="overflow-x-auto">
          {movLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : movements.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">No movements in this period.</div>
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  {['Date', 'Product', 'Type', 'Qty', 'Value (Rs.)', 'By'].map((h, idx) => (
                    <th key={h} className={clsx('text-xs font-semibold text-gray-500 uppercase py-3 px-4 whitespace-nowrap', idx >= 3 && idx <= 4 ? 'text-right' : 'text-left')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {movements.map((m, i) => {
                  const meta = TYPE_META[m.type] ?? { label: m.type, cls: 'bg-gray-100 text-gray-600' };
                  const positive = (m.qty ?? 0) >= 0;
                  return (
                    <tr key={m._id ?? i} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2.5 px-4 text-gray-600 whitespace-nowrap">{m.at ? format(new Date(m.at), 'dd MMM yyyy, HH:mm') : '—'}</td>
                      <td className="py-2.5 px-4 text-gray-800">{m.product?.name ?? '—'}</td>
                      <td className="py-2.5 px-4">
                        <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-semibold', meta.cls)}>{meta.label}</span>
                      </td>
                      <td className={clsx('py-2.5 px-4 text-right tabular-nums font-medium', positive ? 'text-emerald-700' : 'text-rose-700')}>
                        {positive ? '+' : ''}{fmt(m.qty)} <span className="text-gray-400 font-normal">{m.unit}</span>
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-gray-600">{fmt(m.value)}</td>
                      <td className="py-2.5 px-4 text-xs text-gray-500">{m.user?.name ?? m.user?.email ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={4} className="py-3 px-4 text-right text-sm font-bold text-gray-700 uppercase tracking-wide">
                    Total value {movements.length >= 200 ? '(latest 200)' : ''}
                  </td>
                  <td className="py-3 px-4 text-right text-sm font-bold tabular-nums whitespace-nowrap">
                    <span className="text-emerald-700">In {fmt(moveIn)}</span>
                    <span className="text-gray-300 mx-1.5">·</span>
                    <span className="text-rose-700">Out {fmt(moveOut)}</span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default AreaMovementReport;

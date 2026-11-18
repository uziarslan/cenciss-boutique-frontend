import { useEffect, useMemo, useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import { Ban, Wallet, X, CornerDownRight, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import DateRangePicker from '../../components/UI/DateRangePicker';
import SearchableSelect from '../../components/UI/SearchableSelect';
import FilterBar from '../../components/UI/FilterBar';
import Portal from '../../components/UI/Portal';
import { useGetOutletsQuery, useGetCancelledOrdersQuery, reportQueryOpts } from '../../store/baseApi';
import { exportToCSV } from '../../utils/exportCSV';
import { resolveBusinessDate } from '../../utils/businessDate';
import {
  fmt, StatCard, ReportCard, ReportSectionHeader, ReportThead, ExportButton, ReportEmpty, ReportSkeleton,
} from './ReportShared';
import useQueryState from '../../hooks/useQueryState';
import { discountRateFor } from './ReportDrillDrawer';

const fmtRate = (r) => String(+Number(r || 0).toFixed(2));
const businessDateLabel = (businessDate, timestamp, timeFormat = 'h:mm a') => {
  if (!businessDate && !timestamp) return '—';
  const dateLabel = businessDate
    ? format(new Date(`${businessDate}T00:00:00`), 'dd MMM yyyy')
    : format(new Date(timestamp), 'dd MMM yyyy');
  return timestamp
    ? `${dateLabel}, ${format(new Date(timestamp), timeFormat)}`
    : dateLabel;
};

// Slide-over showing a single cancelled order's full detail. Renders from the
// report row (which now carries items + totals) — no extra fetch.
export const CancelledOrderDrawer = ({ order, onClose }) => {
  const open = !!order;
  const isItemCancellation = order?.cancellationType === 'items';
  const discountRate = discountRateFor(order);
  return (
    <Portal>
      <div
        onClick={onClose}
        className={clsx('fixed inset-0 bg-black/30 z-[60] transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0 pointer-events-none')}
      />
      <div
        className={clsx(
          'safe-area-drawer fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-[70] flex flex-col transition-transform duration-300 ease-out will-change-transform',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!open}
      >
        {order && (
          <>
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-rose-500"><Ban size={12} /> {isItemCancellation ? 'Cancelled Items' : 'Cancelled Order'}</div>
                <h2 className="text-base font-bold text-gray-900 mt-0.5 truncate">{order.transactionNumber || '—'}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {businessDateLabel(order.businessDate, order.createdAt)}
                </p>
              </div>
              <button onClick={onClose} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700" aria-label="Close cancelled order"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Cancellation summary */}
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 space-y-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">{isItemCancellation ? 'Items cancelled' : 'Order voided'}</span>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div>
                    <p className="text-gray-400">Cancelled at</p>
                    <p className="text-gray-800 font-medium">
                      {businessDateLabel(order.voidBusinessDate, order.voidedAt)}
                    </p>
                  </div>
                  <div><p className="text-gray-400">Cancelled by</p><p className="text-gray-800 font-medium">{order.voidedByName || '—'}</p></div>
                  <div><p className="text-gray-400">Cashier</p><p className="text-gray-800 font-medium">{order.cashierName || '—'}</p></div>
                  <div><p className="text-gray-400">Payment</p><p className="text-gray-800 font-medium capitalize">{order.paymentMethod || '—'}{order.cardLast4 ? ` ****${order.cardLast4}` : ''}</p></div>
                </div>
                {order.voidReason && (
                  <div>
                    <p className="text-gray-400 text-xs">Reason</p>
                    <p className="text-gray-800 text-sm">{order.voidReason}</p>
                  </div>
                )}
              </div>

              {/* Meta chips */}

              {/* Items */}
              <div className="rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{isItemCancellation ? 'Cancelled items' : 'Items'}</span>
                  <span className="text-[10px] text-slate-400">{(order.items || []).reduce((s, i) => s + (i.qty || 0), 0)} qty</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {(order.items || []).map((it, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-2 text-xs">
                      <CornerDownRight size={11} className="text-gray-300 shrink-0 mt-0.5" />
                      <span className="flex-1 min-w-0 text-gray-700">
                        <span className="block truncate">{it.name}{(it.variation?.name || it.variationName) ? ` (${it.variation?.name || it.variationName})` : ''}</span>
                        {isItemCancellation && it.reason && <span className="mt-0.5 block text-[10px] text-gray-400">{it.reason}</span>}
                      </span>
                      <span className="text-gray-400 tabular-nums whitespace-nowrap">{it.qty} × {fmt(it.unitPrice)}</span>
                      <span className="w-20 text-right font-medium text-gray-700 tabular-nums">{fmt(it.lineTotal ?? (it.qty * it.unitPrice))}</span>
                    </div>
                  ))}
                  {(order.items || []).length === 0 && <p className="px-3 py-2 text-xs italic text-gray-400">No items recorded</p>}
                </div>
              </div>

              {/* Totals */}
              {isItemCancellation ? (
                <div className="rounded-xl border border-slate-200 p-3 space-y-1 text-xs">
                  <div className="flex justify-between text-gray-500"><span>Original order total</span><span className="tabular-nums">{fmt(order.originalTotalAmount)}</span></div>
                  <div className="flex justify-between text-gray-500"><span>Remaining order total</span><span className="tabular-nums">{fmt(order.remainingTotalAmount)}</span></div>
                  <div className="flex justify-between font-bold text-rose-700 pt-1 mt-1 border-t border-slate-200/70"><span>Cancelled value</span><span className="tabular-nums">{fmt(order.totalAmount)}</span></div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 p-3 space-y-0.5 text-xs">
                  <div className="flex justify-between text-gray-500"><span>Subtotal</span><span className="tabular-nums">{fmt(order.subtotal)}</span></div>
                  {order.taxAmount > 0 && <div className="flex justify-between text-gray-500"><span>Tax{order.effectiveTaxRate ? ` (${fmtRate(order.effectiveTaxRate)}%)` : ''}</span><span className="tabular-nums">{fmt(order.taxAmount)}</span></div>}
                  {order.discountAmount > 0 && <div className="flex justify-between text-rose-600"><span>Discount{discountRate > 0 ? ` (${fmtRate(discountRate)}%)` : ''}</span><span className="tabular-nums">- {fmt(order.discountAmount)}</span></div>}
                  <div className="flex justify-between font-bold text-gray-900 pt-1 mt-1 border-t border-slate-200/70"><span>Total</span><span className="tabular-nums">{fmt(order.totalAmount)}</span></div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Portal>
  );
};

const CancelledOrders = () => {
  const calendarToday = format(new Date(), 'yyyy-MM-dd');
  const calendarMonthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const [from, setFrom] = useQueryState('from', calendarMonthStart);
  const [to, setTo] = useQueryState('to', calendarToday);
  const { data: outlets = [] } = useGetOutletsQuery();
  const [selectedOutlet, setSelectedOutlet] = useQueryState('outlet', '');
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useQueryState('search', '');
  const [minAmount, setMinAmount] = useQueryState('minAmount', '');
  const [maxAmount, setMaxAmount] = useQueryState('maxAmount', '');
  const [sort, setSort] = useQueryState('sort', 'newest');

  useEffect(() => {
    if (!outlets.length) return;
    if (outlets.length === 1 && !selectedOutlet) setSelectedOutlet(outlets[0]._id || '');
    const businessToday = resolveBusinessDate(outlets, selectedOutlet);
    const businessMonthStart = `${businessToday.slice(0, 7)}-01`;
    setFrom((current) => current === calendarMonthStart ? businessMonthStart : current);
    setTo((current) => current === calendarToday ? businessToday : current);
  }, [
    outlets,
    selectedOutlet,
    calendarMonthStart,
    calendarToday,
    setFrom,
    setSelectedOutlet,
    setTo,
  ]);

  const queryParams = useMemo(() => {
    const p = { from, to };
    if (selectedOutlet) p.outlet = selectedOutlet;
    return p;
  }, [from, to, selectedOutlet]);

  const { data: payload, isLoading: loading, isFetching, refetch } = useGetCancelledOrdersQuery(
    queryParams,
    { skip: !from || !to, ...reportQueryOpts, refetchOnMountOrArgChange: true, pollingInterval: 30_000 },
  );

  const rows = useMemo(() => (payload?.transactions ?? []).filter((row) => {
    const q = search.trim().toLowerCase();
    const itemSearch = (row.items || []).map((item) => `${item.name || ''} ${item.reason || ''}`).join(' ');
    const haystack = `${row.transactionNumber || ''} ${row.cashierName || ''} ${row.voidedByName || ''} ${row.voidReason || ''} ${itemSearch}`.toLowerCase();
    const amount = Number(row.totalAmount || 0);
    return (!q || haystack.includes(q))
      && (minAmount === '' || amount >= Number(minAmount))
      && (maxAmount === '' || amount <= Number(maxAmount));
  }).sort((a, b) => {
    if (sort === 'oldest') return new Date(a.voidedAt || a.createdAt || 0) - new Date(b.voidedAt || b.createdAt || 0);
    if (sort === 'amountHigh') return Number(b.totalAmount || 0) - Number(a.totalAmount || 0);
    if (sort === 'amountLow') return Number(a.totalAmount || 0) - Number(b.totalAmount || 0);
    return new Date(b.voidedAt || b.createdAt || 0) - new Date(a.voidedAt || a.createdAt || 0);
  }), [payload, search, minAmount, maxAmount, sort]);
  const count = rows.length;
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);

  const handleExport = () => {
    const data = rows.map((r) => ({
      'Order #':      r.transactionNumber ?? '',
      Type:           r.cancellationType === 'items' ? 'Cancelled items' : 'Whole order',
      'Cancellation Business Date': r.voidBusinessDate ?? '',
      'Cancelled At': businessDateLabel(r.voidBusinessDate, r.voidedAt, 'HH:mm'),
      Cashier:        r.cashierName ?? '',
      'Cancelled By': r.voidedByName ?? '',
      Amount:         fmt(r.totalAmount ?? 0),
      Reason:         r.voidReason ?? '',
      'Item details': (r.items || []).map((item) => `${item.qty} × ${item.name}${item.variationName ? ` (${item.variationName})` : ''} — ${item.reason || r.voidReason || ''}`).join('; '),
    }));
    exportToCSV(data, `cancelled-orders-${from}-${to}`);
  };

  const periodLabel = `${from} → ${to}`;

  return (
    <div className="space-y-6 pb-8">
      <FilterBar>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order, cashier, or reason…" className="min-w-[260px] flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <div className="min-w-[180px]">
          <SearchableSelect
            options={[{ value: '', label: 'All outlets' }, ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))]}
            value={selectedOutlet}
            onChange={setSelectedOutlet}
            searchPlaceholder="Search outlets…"
          />
        </div>
        <input type="number" min="0" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="Minimum amount" className="w-44 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <input type="number" min="0" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="Maximum amount" className="w-44 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <div className="min-w-[180px]"><SearchableSelect searchable={false} options={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'amountHigh', label: 'Highest amount' }, { value: 'amountLow', label: 'Lowest amount' }]} value={sort} onChange={setSort} /></div>
        <button type="button" onClick={() => refetch()} disabled={isFetching || !from || !to} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50" aria-label="Refresh cancelled orders">
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
        <ExportButton onClick={handleExport} disabled={loading || !rows.length} />
        <div className="ml-auto text-xs text-gray-400">{periodLabel}</div>
      </FilterBar>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[88px] bg-gray-100 rounded-2xl animate-pulse" />)
        ) : (
          <>
            <StatCard label="Cancellations" value={count} sub="Order voids and cancelled items" icon={Ban} color="rose" highlight />
            <StatCard label="Cancelled Value" value={`Rs. ${fmt(totalAmount)}`} sub="Removed from orders" icon={Wallet} color="indigo" />
          </>
        )}
      </div>

      {loading ? (
        <ReportSkeleton rows={6} cols={6} />
      ) : !rows.length ? (
        <ReportEmpty message="No order or item cancellations in this period." />
      ) : (
        <ReportCard>
          <ReportSectionHeader
            icon={Ban}
            iconAccent="rose"
            title="Order & Item Cancellations"
            subtitle={`Cancellations from ${from} to ${to}`}
            right={(
              <span className="text-[11px] font-semibold text-gray-500 bg-slate-50 border border-slate-100 rounded-full px-3 py-1">
                {count} {count === 1 ? 'order' : 'orders'}{payload?.truncated ? '+' : ''}
              </span>
            )}
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <ReportThead headers={[
                'Order #',
                'Type',
                'Cancelled At',
                'Cashier',
                'Cancelled By',
                { label: 'Amount', align: 'right' },
                'Reason',
              ]} />
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr
                    key={r._id ?? r.transactionNumber}
                    onClick={() => setSelected(r)}
                    title="View order detail"
                    className="hover:bg-rose-50/50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-rose-600 whitespace-nowrap">
                      {r.transactionNumber}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={clsx(
                        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        r.cancellationType === 'items'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-rose-100 text-rose-700',
                      )}>
                        {r.cancellationType === 'items' ? 'Cancelled items' : 'Whole order'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                      {businessDateLabel(
                        r.voidBusinessDate,
                        r.voidedAt || r.createdAt,
                        'HH:mm',
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-700">{r.cashierName ?? '—'}</td>
                    <td className="py-3 px-4 text-gray-700">{r.voidedByName ?? '—'}</td>
                    <td className="py-3 px-4 text-right font-semibold text-gray-900 tabular-nums">{fmt(r.totalAmount)}</td>
                    <td className="py-3 px-4 text-gray-500 max-w-xs"><span className="block truncate">{r.voidReason || '—'}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                  <td className="py-3.5 px-4 font-bold text-slate-700 uppercase tracking-wide text-xs" colSpan={5}>Total</td>
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums text-base">{fmt(totalAmount)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </ReportCard>
      )}

      <CancelledOrderDrawer order={selected} onClose={() => setSelected(null)} />
    </div>
  );
};

export default CancelledOrders;

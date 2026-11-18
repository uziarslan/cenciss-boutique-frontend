import { useEffect, useMemo } from 'react';
import { Clock, Wallet, Receipt, TrendingUp, Sun } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import SearchableSelect from '../../components/UI/SearchableSelect';
import FilterBar from '../../components/UI/FilterBar';
import { useGetOutletsQuery, useGetHourlyBreakdownQuery, reportQueryOpts } from '../../store/baseApi';
import { exportToCSV } from '../../utils/exportCSV';
import { resolveBusinessDate } from '../../utils/businessDate';
import {
  fmt, StatCard, PctBar, ReportCard, ReportSectionHeader, ReportThead,
  ExportButton, ReportEmpty, ReportSkeleton,
} from './ReportShared';
import useQueryState from '../../hooks/useQueryState';

// ── Daypart classifier ──────────────────────────────────────────────────────
const dayPart = (h) => {
  if (h >= 6 && h < 11)  return { label: 'Morning',   color: 'bg-amber-50 text-amber-700' };
  if (h >= 11 && h < 15) return { label: 'Lunch',     color: 'bg-emerald-50 text-emerald-700' };
  if (h >= 15 && h < 18) return { label: 'Afternoon', color: 'bg-cyan-50 text-cyan-700' };
  if (h >= 18 && h < 22) return { label: 'Dinner',    color: 'bg-rose-50 text-rose-700' };
  return { label: 'Late',                              color: 'bg-slate-100 text-slate-600' };
};

const HourlyBreakdown = () => {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useQueryState('date', today);
  const { data: outlets = [] } = useGetOutletsQuery();
  const [selectedOutlet, setSelectedOutlet] = useQueryState('outlet', '');

  useEffect(() => {
    if (!outlets.length) return;
    if (outlets.length === 1 && !selectedOutlet) setSelectedOutlet(outlets[0]._id || '');
    const businessToday = resolveBusinessDate(outlets, selectedOutlet);
    setDate((current) => current === today ? businessToday : current);
  }, [outlets, selectedOutlet, today, setDate, setSelectedOutlet]);

  const queryParams = useMemo(() => {
    const p = { date };
    if (selectedOutlet) p.outlet = selectedOutlet;
    return p;
  }, [date, selectedOutlet]);

  const { data: payload, isLoading: loading } = useGetHourlyBreakdownQuery(
    queryParams,
    { skip: !date, ...reportQueryOpts },
  );

  const rows = useMemo(() => {
    if (!payload) return [];
    return Array.isArray(payload) ? payload : payload.rows ?? [];
  }, [payload]);

  const normalizedRows = useMemo(() => {
    const hourMap = rows.reduce((acc, row) => {
      const key = Number(row.hour ?? row.label ?? row.period ?? -1);
      if (Number.isFinite(key)) {
        acc[key] = {
          hour: key,
          sales: Number(row.sales ?? row.totalSales ?? 0),
          transactions: Number(row.transactionCount ?? row.transactions ?? 0),
        };
      }
      return acc;
    }, {});
    return Array.from({ length: 24 }, (_, index) => hourMap[index] ?? { hour: index, sales: 0, transactions: 0 });
  }, [rows]);

  const maxSales = useMemo(() => Math.max(...normalizedRows.map((row) => row.sales), 1), [normalizedRows]);
  const peakRow  = useMemo(
    () => normalizedRows.reduce((best, row) => (row.sales > best.sales ? row : best), normalizedRows[0] || { hour: 0, sales: 0, transactions: 0 }),
    [normalizedRows]
  );
  const peakHour = peakRow.hour;

  const totalSales = normalizedRows.reduce((s, r) => s + r.sales, 0);
  const totalTxns  = normalizedRows.reduce((s, r) => s + r.transactions, 0);
  const avgTicket  = totalTxns > 0 ? totalSales / totalTxns : 0;
  const activeHours = normalizedRows.filter((r) => r.sales > 0).length;

  const handleExport = () => {
    const payload = normalizedRows.map((row) => ({
      Hour:         `${String(row.hour).padStart(2, '0')}:00`,
      Sales:        fmt(row.sales),
      Transactions: row.transactions,
    }));
    exportToCSV(payload, `hourly-breakdown-${date}`);
  };

  // Chart data — compact 12-hour labels for x-axis
  const chartData = normalizedRows.map((r) => ({
    hourLabel: `${String(r.hour).padStart(2, '0')}`,
    sales:     r.sales,
    txns:      r.transactions,
  }));

  const formatHour = (h) => `${String(h).padStart(2, '0')}:00`;

  // Long, human-readable date header
  const longDate = (() => {
    try { return format(new Date(`${date}T00:00:00`), 'EEEE, dd MMM yyyy'); }
    catch { return date; }
  })();

  return (
    <div className="space-y-6 pb-8">
      {/* ── Filters ── */}
      <FilterBar>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
        />
        <div className="min-w-[180px]">
          <SearchableSelect
            options={[{ value: '', label: 'All outlets' }, ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code || '' }))]}
            value={selectedOutlet}
            onChange={setSelectedOutlet}
            searchPlaceholder="Search outlets…"
          />
        </div>
        <ExportButton onClick={handleExport} disabled={loading || !normalizedRows.length} />
        <div className="ml-auto text-xs text-gray-400">{longDate}</div>
      </FilterBar>

      {/* ── Stat tiles ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[88px] bg-gray-100 rounded-2xl animate-pulse" />
          ))
        ) : (
          <>
            <StatCard
              label="Total Sales"
              value={`Rs. ${fmt(totalSales)}`}
              sub={`${activeHours} active hour${activeHours === 1 ? '' : 's'}`}
              icon={Wallet}
              color="indigo"
              highlight
            />
            <StatCard
              label="Transactions"
              value={totalTxns}
              sub="Total checkouts"
              icon={Receipt}
              color="emerald"
            />
            <StatCard
              label="Avg Ticket"
              value={`Rs. ${fmt(avgTicket)}`}
              sub="Sales / transactions"
              icon={TrendingUp}
              color="cyan"
            />
            <StatCard
              label="Peak Hour"
              value={formatHour(peakHour)}
              sub={peakRow.sales > 0 ? `Rs. ${fmt(peakRow.sales)} · ${peakRow.transactions} txns` : 'No sales yet'}
              icon={Sun}
              color="amber"
            />
          </>
        )}
      </div>

      {/* ── Peak callout ── */}
      {!loading && peakRow.sales > 0 && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border bg-amber-50 border-amber-100">
          <Sun size={18} className="text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-700">
              Peak hour: {formatHour(peakHour)} · {dayPart(peakHour).label}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Rs. {fmt(peakRow.sales)} · {peakRow.transactions} transaction{peakRow.transactions === 1 ? '' : 's'} ·
              {' '}{totalSales > 0 ? `${((peakRow.sales / totalSales) * 100).toFixed(1)}% of day's revenue` : ''}
            </p>
          </div>
        </div>
      )}

      {/* ── Sales chart ── */}
      {!loading && normalizedRows.length > 0 && (
        <ReportCard>
          <ReportSectionHeader
            icon={TrendingUp}
            iconAccent="indigo"
            title="Sales Curve"
            subtitle="Hourly revenue across the day"
          />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="hourlySalesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="hourLabel" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const r = payload[0].payload;
                    return (
                      <div className="bg-gray-900 text-white rounded-xl px-3 py-2 shadow-xl text-xs space-y-1">
                        <p className="font-semibold">{label}:00</p>
                        <p className="text-indigo-300">Rs. {fmt(r.sales)}</p>
                        <p className="text-emerald-300">{r.txns} transactions</p>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2.5}
                      fill="url(#hourlySalesGrad)" dot={false}
                      activeDot={{ r: 4, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ReportCard>
      )}

      {/* ── Hourly table ── */}
      {loading ? (
        <ReportSkeleton rows={10} cols={5} />
      ) : !normalizedRows.length ? (
        <ReportEmpty message="No hourly sales data available." />
      ) : (
        <ReportCard>
          <ReportSectionHeader
            icon={Clock}
            iconAccent="indigo"
            title="Hourly Performance"
            subtitle={`Hour-by-hour breakdown for ${longDate}`}
            right={(
              <span className="text-[11px] font-semibold text-gray-500 bg-slate-50 border border-slate-100 rounded-full px-3 py-1">
                {activeHours} active / 24 hours
              </span>
            )}
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <ReportThead headers={[
                'Hour',
                'Daypart',
                { label: 'Sales',        align: 'right' },
                { label: 'Transactions', align: 'right' },
                'Distribution',
              ]} />
              <tbody className="divide-y divide-slate-100">
                {normalizedRows.map((row) => {
                  const isPeak = row.hour === peakHour && row.sales > 0;
                  const part = dayPart(row.hour);
                  return (
                    <tr
                      key={row.hour}
                      className={clsx(
                        'transition-colors',
                        isPeak ? 'bg-amber-50/50 hover:bg-amber-50/70' : 'hover:bg-slate-50/60',
                        row.sales === 0 && 'opacity-60'
                      )}
                    >
                      <td className="py-3 px-4">
                        <span className={clsx(
                          'inline-flex items-center gap-1.5 font-medium tabular-nums',
                          isPeak ? 'text-amber-700' : 'text-gray-900'
                        )}>
                          {isPeak && <Sun size={12} className="text-amber-500" />}
                          {formatHour(row.hour)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold', part.color)}>
                          {part.label}
                        </span>
                      </td>
                      <td className={clsx(
                        'py-3 px-4 text-right tabular-nums',
                        row.sales === 0 ? 'text-gray-300' : isPeak ? 'font-bold text-amber-700' : 'font-semibold text-gray-900'
                      )}>
                        {row.sales === 0 ? '—' : fmt(row.sales)}
                      </td>
                      <td className={clsx(
                        'py-3 px-4 text-right tabular-nums',
                        row.transactions === 0 ? 'text-gray-300' : 'text-gray-700'
                      )}>
                        {row.transactions === 0 ? '—' : row.transactions}
                      </td>
                      <td className="py-3 px-4 w-44">
                        <PctBar
                          pct={maxSales ? (row.sales / maxSales) * 100 : 0}
                          color={isPeak ? 'bg-amber-500' : 'bg-indigo-500'}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                  <td className="py-3.5 px-4 font-bold text-slate-700 uppercase tracking-wide text-xs">Totals</td>
                  <td />
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums text-base">{fmt(totalSales)}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums">{totalTxns}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </ReportCard>
      )}
    </div>
  );
};

export default HourlyBreakdown;

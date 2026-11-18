import { useEffect, useMemo } from 'react';
import { Sparkles, TrendingUp, TrendingDown, Wallet, Crown, Download, Activity } from 'lucide-react';
import { format } from 'date-fns';
import DateRangePicker from '../../components/UI/DateRangePicker';
import SearchableSelect from '../../components/UI/SearchableSelect';
import FilterBar from '../../components/UI/FilterBar';
import Button from '../../components/UI/Button';
import { useGetOutletsQuery, useGetLoyaltyReportsQuery, reportQueryOpts } from '../../store/baseApi';
import { exportToCSV } from '../../utils/exportCSV';
import {
  fmt,
  StatCard,
  ReportCard,
  ReportSectionHeader,
  ReportThead,
  ReportSkeleton,
  ReportEmpty,
} from './ReportShared';
import MembershipFeatureGuard from './MembershipFeatureGuard';
import useQueryState from '../../hooks/useQueryState';

const TOTAL_LABELS = {
  earn: 'Earned',
  redeem: 'Redeemed',
  adjust: 'Adjustments',
  expire: 'Expired',
  refund_reversal: 'Refund Reversals',
  issue_card: 'Cards Issued',
};

const fmtInt = (n) => Number(Math.abs(n || 0)).toLocaleString('en-US');

const MembershipSummary = () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [dateFrom, setDateFrom] = useQueryState('from', today);
  const [dateTo, setDateTo] = useQueryState('to', today);
  const [outlet, setOutlet] = useQueryState('outlet', '');
  const { data: outlets = [] } = useGetOutletsQuery();

  useEffect(() => {
    if (outlets.length === 1 && !outlet) setOutlet(outlets[0]._id || '');
  }, [outlets, outlet, setOutlet]);

  const queryParams = useMemo(() => {
    const params = { from: dateFrom, to: dateTo };
    if (outlet) params.outlet = outlet;
    return params;
  }, [dateFrom, dateTo, outlet]);

  const { data: payload, isLoading: loading } = useGetLoyaltyReportsQuery(queryParams, reportQueryOpts);
  const data = useMemo(
    () => ({ totals: payload?.totals ?? [], byDay: payload?.byDay ?? [] }),
    [payload]
  );

  const totalsByType = Object.fromEntries((data.totals || []).map((t) => [t._id, t]));
  const earnT = totalsByType.earn;
  const redeemT = totalsByType.redeem;
  const expireT = totalsByType.expire;
  const redemptionRate = earnT?.value > 0
    ? (Math.abs(redeemT?.value || 0) / earnT.value) * 100
    : 0;

  // Pivot byDay rows
  const pivoted = {};
  for (const r of data.byDay || []) {
    if (!pivoted[r._id.day]) pivoted[r._id.day] = {};
    pivoted[r._id.day][r._id.type] = r;
  }
  const days = Object.keys(pivoted).sort();

  const handleExport = () => {
    if (!days.length) return;
    exportToCSV(
      days.map((d) => {
        const e = pivoted[d].earn || {};
        const r = pivoted[d].redeem || {};
        const ex = pivoted[d].expire || {};
        return {
          Date: d,
          'Earned (pts)': e.points || 0,
          'Redeemed (pts)': r.points || 0,
          'Expired (pts)': ex.points || 0,
          'Earn Value (Rs.)': (e.value || 0).toFixed(2),
          'Redeem Value (Rs.)': Math.abs(r.value || 0).toFixed(2),
        };
      }),
      `rewards-summary-${dateFrom}-to-${dateTo}`
    );
  };

  const periodLabel = dateFrom && dateTo
    ? `${format(new Date(dateFrom), 'd MMM yyyy')} – ${format(new Date(dateTo), 'd MMM yyyy')}`
    : 'All time';

  return (
    <MembershipFeatureGuard>
      <div className="space-y-6 pb-8">
        <FilterBar>
          <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
          <div className="min-w-[180px]">
            <SearchableSelect
              options={[{ value: '', label: 'All outlets' }, ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code }))]}
              value={outlet}
              onChange={setOutlet}
              searchPlaceholder="Search outlets…"
            />
          </div>
          <Button variant="secondary" icon={Download} onClick={handleExport} disabled={!days.length}>
            Export CSV
          </Button>
          <div className="ml-auto text-xs text-gray-400">{periodLabel}</div>
        </FilterBar>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 animate-pulse h-[88px]" />
            ))
          ) : (
            <>
              <StatCard label="Earned" value={fmtInt(earnT?.points || 0)} sub={`Rs. ${fmt(earnT?.value || 0)}`} icon={TrendingUp} color="emerald" />
              <StatCard label="Redeemed" value={fmtInt(redeemT?.points || 0)} sub={`Rs. ${fmt(Math.abs(redeemT?.value || 0))}`} icon={TrendingDown} color="rose" />
              <StatCard label="Expired" value={fmtInt(expireT?.points || 0)} sub={`Rs. ${fmt(Math.abs(expireT?.value || 0))}`} icon={Wallet} color="amber" />
              <StatCard label="Cards Issued" value={fmtInt(totalsByType.issue_card?.count || 0)} sub="In period" icon={Crown} color="indigo" />
              <StatCard label="Redemption Rate" value={`${redemptionRate.toFixed(1)}%`} sub="Redeem ÷ earn" icon={Sparkles} color="violet" highlight />
            </>
          )}
        </div>

        {/* By type breakdown */}
        {!loading && data.totals.length > 0 && (
          <ReportCard>
            <ReportSectionHeader icon={Sparkles} iconAccent="indigo" title="By Activity Type" subtitle="Volume across the selected window" />
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <ReportThead headers={[
                  'Type',
                  { label: 'Count', align: 'right' },
                  { label: 'Net Points', align: 'right' },
                  { label: 'Net Value (Rs.)', align: 'right' },
                ]} />
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(TOTAL_LABELS).map(([type, label]) => {
                    const row = totalsByType[type];
                    return (
                      <tr key={type} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-medium text-gray-800">{label}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-gray-600">{row?.count ?? 0}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-gray-700">{(row?.points ?? 0).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-gray-700">{fmt(Math.abs(row?.value ?? 0))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ReportCard>
        )}

        {/* Daily trend */}
        {loading ? (
          <ReportSkeleton rows={8} cols={6} />
        ) : days.length === 0 ? (
          <ReportEmpty message="No activity in this range." />
        ) : (
          <ReportCard>
            <ReportSectionHeader
              icon={Activity}
              iconAccent="violet"
              title="Daily Activity"
              subtitle="Earn, redeem, and expiry by day"
            />
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <ReportThead headers={[
                  'Date',
                  { label: 'Earned', align: 'right' },
                  { label: 'Redeemed', align: 'right' },
                  { label: 'Expired', align: 'right' },
                  { label: 'Earn (Rs.)', align: 'right' },
                  { label: 'Redeem (Rs.)', align: 'right' },
                ]} />
                <tbody className="divide-y divide-slate-100">
                  {days.map((d) => {
                    const e = pivoted[d].earn || {};
                    const r = pivoted[d].redeem || {};
                    const ex = pivoted[d].expire || {};
                    return (
                      <tr key={d} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 text-gray-700">{d}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-emerald-700">+{(e.points || 0).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-rose-700">{(r.points || 0).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-amber-700">{(ex.points || 0).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-gray-600">{fmt(e.value)}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-gray-600">{fmt(Math.abs(r.value || 0))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ReportCard>
        )}
      </div>
    </MembershipFeatureGuard>
  );
};

export default MembershipSummary;

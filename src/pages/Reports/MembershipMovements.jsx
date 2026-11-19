import { useEffect, useState, useMemo } from 'react';
import { Activity, Download } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import DateRangePicker from '../../components/UI/DateRangePicker';
import SearchableSelect from '../../components/UI/SearchableSelect';
import FilterBar from '../../components/UI/FilterBar';
import Button from '../../components/UI/Button';
import { useGetOutletsQuery, useGetLoyaltyTransactionsQuery, reportQueryOpts } from '../../store/baseApi';
import { exportToCSV } from '../../utils/exportCSV';
import {
  fmt,
  ReportCard,
  ReportSectionHeader,
  ReportThead,
  ReportSkeleton,
  ReportEmpty,
} from './ReportShared';
import MembershipFeatureGuard from './MembershipFeatureGuard';
import useQueryState from '../../hooks/useQueryState';

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'earn', label: 'Earn' },
  { value: 'redeem', label: 'Redeem' },
  { value: 'adjust', label: 'Adjust' },
  { value: 'expire', label: 'Expire' },
  { value: 'refund_reversal', label: 'Refund Reversal' },
  { value: 'issue_card', label: 'Issue Card' },
];

const TYPE_TONES = {
  earn: 'bg-emerald-100 text-emerald-700',
  redeem: 'bg-rose-100 text-rose-700',
  adjust: 'bg-violet-100 text-violet-700',
  expire: 'bg-amber-100 text-amber-700',
  issue_card: 'bg-blue-100 text-blue-700',
  refund_reversal: 'bg-slate-100 text-slate-700',
};

const TypeBadge = ({ type }) => (
  <span className={clsx('inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', TYPE_TONES[type] || 'bg-slate-100 text-slate-700')}>
    {type}
  </span>
);

const MembershipMovements = () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [dateFrom, setDateFrom] = useQueryState('from', today);
  const [dateTo, setDateTo] = useQueryState('to', today);
  const [type, setType] = useQueryState('type', '');
  const [outlet, setOutlet] = useQueryState('outlet', '');
  const { data: outlets = [] } = useGetOutletsQuery();
  const [page, setPage] = useQueryState('page', 1);

  useEffect(() => {
    if (outlets.length === 1 && !outlet) setOutlet(outlets[0]._id || '');
  }, [outlets, outlet, setOutlet]);

  const queryParams = useMemo(() => {
    const params = { from: dateFrom, to: dateTo, page, limit: 50 };
    if (type) params.type = type;
    if (outlet) params.outlet = outlet;
    return params;
  }, [dateFrom, dateTo, type, outlet, page]);

  const { data: payload, isLoading: loading } = useGetLoyaltyTransactionsQuery(queryParams, reportQueryOpts);
  const data = useMemo(
    () => ({ data: payload?.data ?? [], pagination: payload?.pagination ?? {} }),
    [payload]
  );

  const handleExport = () => {
    if (!data.data?.length) return;
    exportToCSV(
      data.data.map((t) => ({
        Date: new Date(t.createdAt).toISOString(),
        Type: t.type,
        Customer: t.customer?.name || t.customer?.phone || '',
        Phone: t.customer?.phone || '',
        Card: t.customer?.membershipCardNumber || '',
        Points: t.points,
        Balance: t.balanceAfter,
        Value: (t.valueAtTxn || 0).toFixed(2),
        Sale: t.sale?.transactionNumber || '',
        Note: t.note || '',
      })),
      `rewards-movements-${dateFrom}-to-${dateTo}`
    );
  };

  const periodLabel = dateFrom && dateTo
    ? `${format(new Date(dateFrom), 'd MMM yyyy')} – ${format(new Date(dateTo), 'd MMM yyyy')}`
    : 'All time';

  return (
    <MembershipFeatureGuard>
      <div className="space-y-6 pb-8">
        <FilterBar>
          <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setPage(1); setDateFrom(f); setDateTo(t); }} />
          <div className="min-w-[180px]">
            <SearchableSelect
              options={[{ value: '', label: 'All outlets' }, ...outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code }))]}
              value={outlet}
              onChange={(v) => { setPage(1); setOutlet(v); }}
              searchPlaceholder="Search outlets…"
            />
          </div>
          <div className="min-w-[160px]">
            <SearchableSelect
              options={TYPE_OPTIONS}
              value={type}
              onChange={(v) => { setPage(1); setType(v); }}
              searchPlaceholder="Filter type…"
            />
          </div>
          <Button variant="secondary" icon={Download} onClick={handleExport} disabled={!data.data.length}>
            Export CSV
          </Button>
          <div className="ml-auto text-xs text-gray-400">{periodLabel}</div>
        </FilterBar>

        {loading ? (
          <ReportSkeleton rows={10} cols={7} />
        ) : data.data.length === 0 ? (
          <ReportEmpty message="No rewards movements in this range." />
        ) : (
          <ReportCard>
            <ReportSectionHeader
              icon={Activity}
              iconAccent="violet"
              title="Rewards Movements"
              subtitle="Audit trail of all point activity"
              right={
                <span className="text-[11px] font-semibold text-gray-500 bg-slate-50 border border-slate-100 rounded-full px-3 py-1">
                  {data.pagination.total ?? data.data.length} entries
                </span>
              }
            />
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <ReportThead headers={[
                  'Date',
                  'Customer',
                  'Type',
                  { label: 'Δ Points', align: 'right' },
                  { label: 'Balance', align: 'right' },
                  { label: 'Value (Rs.)', align: 'right' },
                  'Sale',
                  'Note',
                ]} />
                <tbody className="divide-y divide-slate-100">
                  {data.data.map((t) => (
                    <tr key={t._id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">{new Date(t.createdAt).toLocaleString()}</td>
                      <td className="py-3 px-4 text-gray-700">
                        <div className="font-medium text-gray-800">{t.customer?.name || '—'}</div>
                        <div className="text-xs text-gray-500">{t.customer?.phone || ''}</div>
                      </td>
                      <td className="py-3 px-4"><TypeBadge type={t.type} /></td>
                      <td className={clsx('py-3 px-4 text-right tabular-nums font-semibold', t.points >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                        {t.points > 0 ? '+' : ''}{t.points}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-gray-700">{t.balanceAfter}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-gray-600">{fmt(Math.abs(t.valueAtTxn || 0))}</td>
                      <td className="py-3 px-4 font-mono text-[10px] text-gray-400 whitespace-nowrap">{t.sale?.transactionNumber || '—'}</td>
                      <td className="py-3 px-4 text-xs text-gray-500 max-w-[200px] truncate">{t.note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.pagination.pages > 1 && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border border-gray-200 px-3 py-1 disabled:opacity-40 hover:bg-gray-50"
                >
                  Previous
                </button>
                <span>Page {data.pagination.page} of {data.pagination.pages}</span>
                <button
                  disabled={page >= data.pagination.pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-gray-200 px-3 py-1 disabled:opacity-40 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            )}
          </ReportCard>
        )}
      </div>
    </MembershipFeatureGuard>
  );
};

export default MembershipMovements;

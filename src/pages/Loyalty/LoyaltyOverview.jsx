import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Users, Wallet, TrendingUp, TrendingDown, Sparkles, RefreshCw, Crown } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import Button from '../../components/UI/Button';
import {
  fmt,
  StatCard,
  ReportCard,
  ReportSectionHeader,
  ReportThead,
  ReportSkeleton,
  ReportEmpty,
} from '../Reports/ReportShared';
import { runLoyaltyExpiry } from '../../api/loyaltyApi';
import { baseApi, useGetLoyaltyDashboardQuery, reportQueryOpts } from '../../store/baseApi';

const LoyaltyOverview = () => {
  const dispatch = useDispatch();
  const [running, setRunning] = useState(false);

  const { data, isLoading: loading } = useGetLoyaltyDashboardQuery(undefined, reportQueryOpts);

  const handleRunExpiry = async () => {
    setRunning(true);
    try {
      const res = await runLoyaltyExpiry();
      const d = res?.data?.data;
      toast.success(`Expired ${d?.expired || 0} pts across ${d?.customersAffected || 0} customer(s)`);
      dispatch(baseApi.util.invalidateTags(['LoyaltyMember', 'LoyaltyTransaction', 'LoyaltyReport']));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Expiry failed');
    } finally {
      setRunning(false);
    }
  };

  const earnAgg = data?.last30?.find((r) => r._id === 'earn');
  const redeemAgg = data?.last30?.find((r) => r._id === 'redeem');
  const expireAgg = data?.last30?.find((r) => r._id === 'expire');
  const redemptionRate = earnAgg?.value > 0
    ? (Math.abs(redeemAgg?.value || 0) / earnAgg.value) * 100
    : 0;

  return (
    <div className="space-y-6 pb-8">
      {/* Action bar */}
      <div className="flex items-center justify-end">
        <Button variant="secondary" icon={RefreshCw} onClick={handleRunExpiry} disabled={running}>
          {running ? 'Running…' : 'Run Expiry Sweep'}
        </Button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 animate-pulse h-[88px]" />
          ))
        ) : data ? (
          <>
            <StatCard label="Cardholders" value={fmtInt(data.totalCardholders)} icon={Users} color="indigo" />
            <StatCard label="Points Outstanding" value={fmtInt(data.pointsOutstanding)} sub={`Rs. ${fmt(data.liabilityValue)}`} icon={Wallet} color="amber" />
            <StatCard label="Earned (30d)" value={fmtInt(earnAgg?.points || 0)} sub={`Rs. ${fmt(earnAgg?.value || 0)} · ${earnAgg?.count || 0} txns`} icon={TrendingUp} color="emerald" />
            <StatCard label="Redeemed (30d)" value={fmtInt(Math.abs(redeemAgg?.points || 0))} sub={`Rs. ${fmt(Math.abs(redeemAgg?.value || 0))}`} icon={TrendingDown} color="rose" />
            <StatCard label="Redemption Rate" value={`${redemptionRate.toFixed(1)}%`} sub="Redeem value ÷ earn value" icon={Sparkles} color="violet" highlight />
          </>
        ) : null}
      </div>

      {/* Programme health row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <HealthCard
          title="Liability"
          subtitle="Points the business owes customers"
          value={data?.liabilityValue}
          unit="Rs."
          tone="amber"
          loading={loading}
        />
        <HealthCard
          title="Earned (30d)"
          subtitle="Points awarded on recent sales"
          value={earnAgg?.value || 0}
          unit="Rs."
          tone="emerald"
          loading={loading}
        />
        <HealthCard
          title="Breakage (30d)"
          subtitle="Expired points written off"
          value={Math.abs(expireAgg?.value || 0)}
          unit="Rs."
          tone="violet"
          loading={loading}
        />
      </div>

      {/* Top members */}
      {loading ? (
        <ReportSkeleton rows={6} cols={4} />
      ) : !data?.topMembers?.length ? (
        <ReportEmpty message="No members with points yet." />
      ) : (
        <ReportCard>
          <ReportSectionHeader
            icon={Crown}
            iconAccent="amber"
            title="Top Members"
            subtitle="Highest current point balances"
            right={
              <span className="text-[11px] font-semibold text-gray-500 bg-slate-50 border border-slate-100 rounded-full px-3 py-1">
                {data.topMembers.length} member{data.topMembers.length === 1 ? '' : 's'}
              </span>
            }
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <ReportThead headers={[
                'Member',
                { label: 'Phone', align: 'left' },
                { label: 'Card', align: 'left' },
                { label: 'Balance', align: 'right' },
              ]} />
              <tbody className="divide-y divide-slate-100">
                {data.topMembers.map((m) => (
                  <tr key={m._id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-gray-800">{m.name || <span className="text-gray-400 italic font-normal">No name</span>}</td>
                    <td className="py-3.5 px-4 text-gray-600">{m.phone}</td>
                    <td className="py-3.5 px-4 font-mono text-xs text-gray-500">{m.membershipCardNumber || '—'}</td>
                    <td className="py-3.5 px-4 text-right tabular-nums font-bold text-amber-700">{fmtInt(m.pointsBalance)} pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportCard>
      )}
    </div>
  );
};

const fmtInt = (n) => Number(n || 0).toLocaleString('en-US');

const HealthCard = ({ title, subtitle, value, unit, tone = 'indigo', loading }) => {
  const tones = {
    indigo: 'from-indigo-50/50 to-white border-indigo-100 text-indigo-700',
    amber:  'from-amber-50/50 to-white border-amber-100 text-amber-700',
    emerald:'from-emerald-50/50 to-white border-emerald-100 text-emerald-700',
    violet: 'from-violet-50/50 to-white border-violet-100 text-violet-700',
  };
  return (
    <div className={clsx('rounded-2xl border bg-gradient-to-br p-5 shadow-sm', tones[tone])}>
      <div className="text-[11px] font-bold uppercase tracking-widest opacity-70">{title}</div>
      <div className="mt-2 text-3xl font-extrabold tabular-nums">
        {loading ? '…' : `${unit ? unit + ' ' : ''}${fmt(value || 0)}`}
      </div>
      <div className="text-xs text-gray-500 mt-1">{subtitle}</div>
    </div>
  );
};

export default LoyaltyOverview;

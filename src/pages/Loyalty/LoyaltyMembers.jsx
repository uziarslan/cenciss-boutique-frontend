import { useEffect, useState, useCallback, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { Users, Search, Gift, Plus, Minus, CreditCard, Activity, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import FilterBar from '../../components/UI/FilterBar';
import PremiumModal, { ModalSection, PrimaryButton, SecondaryButton } from '../../components/UI/PremiumModal';
import {
  fmt,
  ReportCard,
  ReportSectionHeader,
  ReportThead,
  ReportSkeleton,
  ReportEmpty,
} from '../Reports/ReportShared';
import { getMember, issueMemberCard, adjustMemberPoints } from '../../api/loyaltyApi';
import { baseApi, useGetLoyaltyMembersQuery, listQueryOpts } from '../../store/baseApi';
import useQueryState from '../../hooks/useQueryState';

const MEMBER_MUTATION_TAGS = ['LoyaltyMember', 'LoyaltyTransaction', 'LoyaltyReport'];

const fmtInt = (n) => Number(n || 0).toLocaleString('en-US');

const LoyaltyMembers = () => {
  const [search, setSearch] = useQueryState('search', '');
  const [withCard, setWithCard] = useQueryState('withCard', false);
  const [activeMemberId, setActiveMemberId] = useState(null);

  // Debounce the search term so typing doesn't fire a request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);

  const queryParams = useMemo(() => {
    const params = {};
    if (debouncedSearch) params.search = debouncedSearch;
    if (withCard) params.withCard = 'true';
    return params;
  }, [debouncedSearch, withCard]);

  const { data: payload, isLoading: loading } = useGetLoyaltyMembersQuery(queryParams, listQueryOpts);
  const rows = useMemo(() => payload?.data ?? [], [payload]);

  return (
    <div className="space-y-6 pb-8">
      <FilterBar>
        <div className="relative flex-1 min-w-[260px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or card"
            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 select-none">
          <input
            type="checkbox"
            checked={withCard}
            onChange={(e) => setWithCard(e.target.checked)}
            className="rounded border-gray-300"
          />
          Cardholders only
        </label>
      </FilterBar>

      {loading ? (
        <ReportSkeleton rows={8} cols={6} />
      ) : rows.length === 0 ? (
        <ReportEmpty message="No members match the current filters." />
      ) : (
        <ReportCard>
          <ReportSectionHeader
            icon={Users}
            iconAccent="indigo"
            title="Members"
            subtitle={`${rows.length} customer${rows.length === 1 ? '' : 's'}`}
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <ReportThead headers={[
                'Name',
                'Phone',
                'Card',
                { label: 'Balance', align: 'right' },
                { label: 'Lifetime Earned', align: 'right' },
                { label: 'Lifetime Redeemed', align: 'right' },
                { label: '', align: 'right' },
              ]} />
              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => (
                  <tr
                    key={c._id}
                    onClick={() => setActiveMemberId(c._id)}
                    className="cursor-pointer hover:bg-slate-50/60 transition-colors"
                  >
                    <td className="py-3 px-4 font-medium text-gray-800">{c.name || <span className="italic text-gray-400 font-normal">No name</span>}</td>
                    <td className="py-3 px-4 text-gray-600">{c.phone}</td>
                    <td className="py-3 px-4 font-mono text-xs text-gray-500">{c.membershipCardNumber || '—'}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-bold text-amber-700">{fmtInt(c.pointsBalance)}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-emerald-700">{fmtInt(c.lifetimePointsEarned)}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-rose-700">{fmtInt(c.lifetimePointsRedeemed)}</td>
                    <td className="py-3 px-4 text-right text-gray-400">
                      <ChevronRight size={16} className="inline-block" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportCard>
      )}

      {activeMemberId && (
        <MemberModal
          memberId={activeMemberId}
          onClose={() => setActiveMemberId(null)}
        />
      )}
    </div>
  );
};

// ── Member detail modal — matches the POS Sessions modal pattern ─────────────

const TYPE_TONES = {
  earn:           'bg-emerald-100 text-emerald-700',
  redeem:         'bg-rose-100 text-rose-700',
  adjust:         'bg-violet-100 text-violet-700',
  expire:         'bg-amber-100 text-amber-700',
  issue_card:     'bg-blue-100 text-blue-700',
  refund_reversal:'bg-slate-100 text-slate-700',
};

const TypeBadge = ({ type }) => (
  <span className={clsx(
    'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap',
    TYPE_TONES[type] || 'bg-slate-100 text-slate-700'
  )}>
    {type.replace('_', ' ')}
  </span>
);

const MemberModal = ({ memberId, onClose }) => {
  const dispatch = useDispatch();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Action panels
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueCard, setIssueCard] = useState('');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMember(memberId);
      setData(res?.data?.data ?? null);
    } catch {
      setData(null);
      toast.error('Failed to load member details');
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleIssue = async () => {
    setBusy(true);
    try {
      await issueMemberCard(memberId, issueCard.trim() ? { cardNumber: issueCard.trim() } : {});
      toast.success('Card issued');
      setIssueOpen(false);
      setIssueCard('');
      refresh();
      dispatch(baseApi.util.invalidateTags(MEMBER_MUTATION_TAGS));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to issue card');
    } finally {
      setBusy(false);
    }
  };

  const handleAdjust = async () => {
    const n = Number(delta);
    if (!n) { toast.error('Enter a non-zero adjustment'); return; }
    setBusy(true);
    try {
      await adjustMemberPoints(memberId, { deltaPoints: n, note });
      toast.success('Adjustment recorded');
      setAdjustOpen(false); setDelta(''); setNote('');
      refresh();
      dispatch(baseApi.util.invalidateTags(MEMBER_MUTATION_TAGS));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Adjustment failed');
    } finally {
      setBusy(false);
    }
  };

  const c = data?.customer;
  const txns = data?.transactions || [];

  return (
    <PremiumModal
      open
      onClose={onClose}
      icon={Users}
      eyebrow="Member"
      title={loading ? 'Loading…' : (c?.name || 'Unnamed Member')}
      subtitle={c ? `${c.phone}${c.membershipCardNumber ? ` · ${c.membershipCardNumber}` : ''}` : undefined}
      accent={c?.membershipCardNumber ? 'amber' : 'indigo'}
      size="xl"
      hero={c && (
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-xl bg-white/15 backdrop-blur-sm ring-1 ring-white/25 p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/80">Balance</p>
            <p className="text-2xl font-extrabold tabular-nums mt-0.5">{fmtInt(c.pointsBalance)}</p>
            <p className="text-[10px] text-white/70">points</p>
          </div>
          <div className="rounded-xl bg-white/15 backdrop-blur-sm ring-1 ring-white/25 p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/80">Lifetime Earned</p>
            <p className="text-2xl font-extrabold tabular-nums mt-0.5">{fmtInt(c.lifetimePointsEarned)}</p>
            <p className="text-[10px] text-white/70">all time</p>
          </div>
          <div className="rounded-xl bg-white/15 backdrop-blur-sm ring-1 ring-white/25 p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/80">Lifetime Redeemed</p>
            <p className="text-2xl font-extrabold tabular-nums mt-0.5">{fmtInt(c.lifetimePointsRedeemed)}</p>
            <p className="text-[10px] text-white/70">all time</p>
          </div>
        </div>
      )}
    >
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center text-gray-400 text-sm animate-pulse">
          Loading member…
        </div>
      ) : !c ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center text-sm text-gray-400">
          Failed to load member.
        </div>
      ) : (
        <>
          {/* Identity card */}
          <ModalSection icon={CreditCard} iconAccent="indigo" title="Member Profile" subtitle="Identity, contact, and card status">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Phone</p>
                <p className="text-sm font-semibold text-slate-800">{c.phone || '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Email</p>
                <p className="text-sm font-semibold text-slate-800 truncate">{c.email || '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Card Number</p>
                <p className="text-xs font-mono font-semibold text-slate-800">{c.membershipCardNumber || '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Card Issued</p>
                <p className="text-xs text-slate-700">{c.membershipCardIssuedAt ? new Date(c.membershipCardIssuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 mt-4">
              {!c.membershipCardNumber && (
                <button
                  type="button"
                  onClick={() => setIssueOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 transition"
                >
                  <Gift size={13} /> Issue Card
                </button>
              )}
              <button
                type="button"
                onClick={() => setAdjustOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
              >
                <Plus size={11} /><Minus size={11} /> Adjust Points
              </button>
            </div>

            {issueOpen && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Issue Membership Card</p>
                <input
                  type="text"
                  placeholder="Card number (leave blank to auto-generate)"
                  value={issueCard}
                  onChange={(e) => setIssueCard(e.target.value)}
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                />
                <div className="flex gap-2">
                  <PrimaryButton accent="amber" onClick={handleIssue} disabled={busy}>
                    {busy ? 'Issuing…' : 'Confirm'}
                  </PrimaryButton>
                  <SecondaryButton onClick={() => { setIssueOpen(false); setIssueCard(''); }}>Cancel</SecondaryButton>
                </div>
              </div>
            )}

            {adjustOpen && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-700">Manual Adjustment</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Positive grants points · negative deducts.</p>
                </div>
                <input
                  type="number"
                  placeholder="e.g. +500 or -100"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
                <input
                  type="text"
                  placeholder="Reason / note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
                <div className="flex gap-2">
                  <PrimaryButton onClick={handleAdjust} disabled={busy}>
                    {busy ? 'Submitting…' : 'Submit'}
                  </PrimaryButton>
                  <SecondaryButton onClick={() => { setAdjustOpen(false); setDelta(''); setNote(''); }}>Cancel</SecondaryButton>
                </div>
              </div>
            )}
          </ModalSection>

          {/* Activity */}
          <ModalSection icon={Activity} iconAccent="amber" title="Recent Activity" subtitle={`${txns.length} most recent record${txns.length === 1 ? '' : 's'}`}>
            {txns.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">No transactions yet.</div>
            ) : (
              <div className="overflow-x-auto -mx-5">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50/80 border-y border-slate-100">
                    <tr>
                      {['Date', 'Type', { label: 'Δ Points', align: 'right' }, { label: 'Balance', align: 'right' }, { label: 'Value', align: 'right' }, 'Sale'].map((h, i) => {
                        const isObj = typeof h === 'object';
                        return (
                          <th
                            key={i}
                            className={clsx(
                              'text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-2.5 px-4 whitespace-nowrap',
                              isObj && h.align === 'right' ? 'text-right' : 'text-left'
                            )}
                          >
                            {isObj ? h.label : h}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {txns.map((t) => (
                      <tr key={t._id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(t.createdAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-2.5"><TypeBadge type={t.type} /></td>
                        <td className={clsx('px-4 py-2.5 text-right tabular-nums font-semibold', t.points >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                          {t.points > 0 ? '+' : ''}{t.points}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{t.balanceAfter}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{fmt(Math.abs(t.valueAtTxn || 0))}</td>
                        <td className="px-4 py-2.5 font-mono text-[10px] text-slate-400 whitespace-nowrap">{t.sale?.transactionNumber || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ModalSection>
        </>
      )}
    </PremiumModal>
  );
};

export default LoyaltyMembers;

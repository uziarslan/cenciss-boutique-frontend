import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Receipt, Download, Users, AlertTriangle, CheckCircle2, ChevronRight, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { useGetApAgingQuery, useGetArAgingQuery, listQueryOpts } from '../../store/baseApi';
import SearchInput from '../../components/UI/SearchInput';
import HeroBanner from '../../components/UI/HeroBanner';
import FilterBar from '../../components/UI/FilterBar';
import Button from '../../components/UI/Button';
import SearchableSelect from '../../components/UI/SearchableSelect';
import useQueryState from '../../hooks/useQueryState';

const fmt = (n) =>
  (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BUCKETS = [
  { key: 'current',  label: 'Current (0–30 days)', card: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  { key: 'd31_60',   label: '31–60 days',          card: 'bg-amber-50',   text: 'text-amber-700',   badge: 'bg-amber-100 text-amber-700' },
  { key: 'd61_90',   label: '61–90 days',          card: 'bg-orange-50',  text: 'text-orange-700',  badge: 'bg-orange-100 text-orange-700' },
  { key: 'd90_plus', label: '90+ days',            card: 'bg-rose-50',    text: 'text-rose-700',    badge: 'bg-rose-100 text-rose-700' },
];
const BUCKET_BY_KEY = Object.fromEntries(BUCKETS.map((b) => [b.key, b]));

const exportCSV = (result, asOfLabel, isAr = false) => {
  const rows = [
    [isAr ? 'Accounts Receivable Aging' : 'Accounts Payable Aging'],
    [`As of: ${asOfLabel}`],
    [],
    ['By Party'],
    ['Party', 'Current', '31-60', '61-90', '90+', 'Total'],
    ...(result.parties ?? []).map((p) => [
      p.party,
      (p.current ?? 0).toFixed(2),
      (p.d31_60 ?? 0).toFixed(2),
      (p.d61_90 ?? 0).toFixed(2),
      (p.d90_plus ?? 0).toFixed(2),
      (p.total ?? 0).toFixed(2),
    ]),
    [],
    [isAr ? 'Open Receivables' : 'Open Bills'],
    ['Party', 'Account', 'Date', 'Entry #', 'Description', 'Age (days)', 'Bucket', 'Outstanding'],
    ...result.items.map((i) => [
      i.party ?? '',
      `${i.accountCode} ${i.accountName}`,
      i.date ? format(new Date(i.date), 'yyyy-MM-dd') : '',
      i.entryNumber ?? '',
      (i.description ?? '').replace(/"/g, "'"),
      i.ageDays,
      BUCKET_BY_KEY[i.bucket]?.label ?? i.bucket,
      i.openAmount.toFixed(2),
    ]),
    [],
    ['', '', '', '', '', '', 'Total Outstanding', (result.totalOutstanding ?? 0).toFixed(2)],
  ];
  const csv  = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${isAr ? 'ar' : 'ap'}-aging-${asOfLabel}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const PayablesAging = ({ kind = 'ap' }) => {
  const isAr = kind === 'ar';
  const navigate = useNavigate();
  const [asOf, setAsOf] = useQueryState('asOf', '');
  const [search, setSearch] = useQueryState('search', '');
  const [bucketFilter, setBucketFilter] = useQueryState('bucket', '');
  const [minOutstanding, setMinOutstanding] = useQueryState('minOutstanding', '');
  const [maxOutstanding, setMaxOutstanding] = useQueryState('maxOutstanding', '');
  const [sort, setSort] = useQueryState('sort', 'ageHigh');

  const queryParams = useMemo(() => ({ asOf: asOf || undefined }), [asOf]);
  const apQuery = useGetApAgingQuery(queryParams, { ...listQueryOpts, skip: isAr });
  const arQuery = useGetArAgingQuery(queryParams, { ...listQueryOpts, skip: !isAr });
  const { data: result, isLoading: loading, isError, error } = isAr ? arQuery : apQuery;

  const buckets   = result?.buckets ?? { current: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };
  const accounts  = result?.accounts ?? [];
  const parties   = result?.parties ?? [];
  const items     = result?.items ?? [];
  const total     = result?.totalOutstanding ?? 0;

  // Search filters the visible rows (parties + bills + accounts). The bucket
  // summary cards and totals stay on the full report.
  const q = search.trim().toLowerCase();
  const visibleParties = q
    ? parties.filter((p) => (p.party ?? '').toLowerCase().includes(q))
    : parties;
  const visibleAccounts = q
    ? accounts.filter((a) => `${a.code} ${a.name}`.toLowerCase().includes(q))
    : accounts;
  const visibleItems = items.filter((item) => {
    const outstanding = Number(item.openAmount || 0);
    return (!q || `${item.party ?? ''} ${item.accountCode} ${item.accountName} ${item.entryNumber ?? ''} ${item.description ?? ''} ${item.notes ?? ''}`.toLowerCase().includes(q))
      && (!bucketFilter || item.bucket === bucketFilter)
      && (minOutstanding === '' || outstanding >= Number(minOutstanding))
      && (maxOutstanding === '' || outstanding <= Number(maxOutstanding));
  }).sort((a, b) => {
    if (sort === 'amountHigh') return Number(b.openAmount || 0) - Number(a.openAmount || 0);
    if (sort === 'amountLow') return Number(a.openAmount || 0) - Number(b.openAmount || 0);
    if (sort === 'party') return String(a.party || '').localeCompare(String(b.party || ''));
    return Number(b.ageDays || b.daysOutstanding || 0) - Number(a.ageDays || a.daysOutstanding || 0);
  });
  const asOfLabel = result?.asOf
    ? format(new Date(result.asOf), 'dd MMM yyyy')
    : (asOf ? format(new Date(asOf), 'dd MMM yyyy') : 'today');

  // Drill into a payable head: open its ledger up to the same as-of date. Forward
  // only the user-typed as-of (yyyy-MM-dd, reinterpreted in the outlet tz by the
  // Ledger). When blank ("today"), omit `to` so the Ledger defaults to now — never
  // round-trip the server's result.asOf instant through browser-tz format() (that
  // shifts a day for outlets behind UTC and breaks report↔ledger reconciliation).
  const openLedger = (accountId) => {
    if (!accountId) return;
    const params = new URLSearchParams({ account: accountId });
    if (asOf) params.set('to', asOf);
    navigate(`/accounting/ledger?${params.toString()}`);
  };

  // Drill into a party: open the party's statement (its lines across all payable
  // accounts) in the Ledger, up to the same as-of date. Pass the party KEY (how
  // the ledger groups) plus its display name.
  const openParty = (p) => {
    if (!p?.partyKey) return;
    const params = new URLSearchParams({ party: p.partyKey, partyName: p.party ?? '' });
    if (isAr) params.set('scope', 'ar');
    if (asOf) params.set('to', asOf);
    navigate(`/accounting/ledger?${params.toString()}`);
  };

  return (
    <div className="space-y-6 pb-8">
      <HeroBanner
        icon={Receipt}
        eyebrow="Accounting"
        title={isAr ? 'Receivables Aging' : 'Payables Aging'}
        subtitle={isAr
          ? 'How long each unpaid receivable has been outstanding — what customers and other parties owe you, bucketed by age.'
          : 'How long each unpaid bill has been outstanding — what you owe vendors, bucketed by age.'}
        accent="indigo"
        compact
        actions={result && items.length > 0 && (
          <Button variant="secondary" icon={Download} onClick={() => exportCSV(result, asOfLabel, isAr)}>
            Export CSV
          </Button>
        )}
      />

      {/* Summary cards: Total + 4 buckets — hidden on error so zeroes don't mislead */}
      {!isError && (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="flex flex-col gap-1 p-4 rounded-2xl border border-orange-100 bg-orange-50 shadow-sm">
          <p className="text-[10px] text-orange-500 uppercase tracking-widest font-bold">{isAr ? 'Total Receivable' : 'Total Payable'}</p>
          <p className="text-2xl font-bold leading-tight tabular-nums text-orange-700">
            {loading ? '…' : `Rs. ${fmt(total)}`}
          </p>
          <p className="text-[10px] text-orange-400">{items.length} open {isAr ? 'item' : 'bill'}{items.length === 1 ? '' : 's'}</p>
        </div>
        {BUCKETS.map((b) => (
          <div key={b.key} className={clsx('flex flex-col gap-1 p-4 rounded-2xl border border-gray-100 shadow-sm', b.card)}>
            <p className={clsx('text-[10px] uppercase tracking-widest font-bold', b.text)}>{b.label}</p>
            <p className={clsx('text-xl font-bold leading-tight tabular-nums', b.text)}>
              {loading ? '…' : `Rs. ${fmt(buckets[b.key])}`}
            </p>
            <p className={clsx('text-[10px] opacity-70', b.text)}>
              {total > 0 ? `${((buckets[b.key] / total) * 100).toFixed(0)}% of total` : '—'}
            </p>
          </div>
        ))}
      </div>
      )}

      {/* As-of filter */}
      <FilterBar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search party, account, entry # or description…"
          className="min-w-[260px] flex-1"
        />
        <label className="text-sm font-medium text-gray-700">As of</label>
        <input
          type="date"
          value={asOf}
          onChange={(e) => setAsOf(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
        />
        <div className="min-w-[180px]"><SearchableSelect searchable={false} options={[{ value: '', label: 'All aging buckets' }, ...BUCKETS.map((bucket) => ({ value: bucket.key, label: bucket.label }))]} value={bucketFilter} onChange={setBucketFilter} /></div>
        <input type="number" min="0" value={minOutstanding} onChange={(e) => setMinOutstanding(e.target.value)} placeholder="Minimum outstanding" className="w-48 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        <input type="number" min="0" value={maxOutstanding} onChange={(e) => setMaxOutstanding(e.target.value)} placeholder="Maximum outstanding" className="w-48 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        <div className="min-w-[180px]"><SearchableSelect searchable={false} options={[{ value: 'ageHigh', label: 'Oldest first' }, { value: 'amountHigh', label: 'Highest outstanding' }, { value: 'amountLow', label: 'Lowest outstanding' }, { value: 'party', label: 'Party name' }]} value={sort} onChange={setSort} /></div>
        {asOf && (
          <button
            onClick={() => setAsOf('')}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
          >
            Today
          </button>
        )}
        <div className="ml-auto text-xs text-gray-400">As of {asOfLabel}</div>
      </FilterBar>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && isError && (
        <div className="bg-white rounded-2xl border border-rose-100 shadow-sm p-12 text-center">
          <AlertTriangle size={36} strokeWidth={1.5} className="mx-auto mb-3 text-rose-400" />
          <p className="text-sm font-semibold text-gray-700">Couldn't load the {isAr ? 'receivables' : 'payables'} aging report.</p>
          <p className="text-xs text-gray-400 mt-1">
            {error?.data?.message || error?.error || 'Check your connection or permissions and try again.'}
          </p>
        </div>
      )}

      {!loading && !isError && result && items.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <CheckCircle2 size={36} strokeWidth={1.5} className="mx-auto mb-3 text-emerald-400" />
          <p className="text-sm font-semibold text-gray-600">No outstanding {isAr ? 'receivables' : 'payables'} as of {asOfLabel}.</p>
          <p className="text-xs text-gray-400 mt-1">
            {isAr
              ? <>Receivables appear here once you post <span className="font-mono">Dr Accounts Receivable</span> entries that aren't fully collected.</>
              : <>Bills appear here once you post <span className="font-mono">Cr Accounts Payable</span> entries that aren't fully paid.</>}
          </p>
        </div>
      )}

      {!loading && !isError && result && items.length > 0 && (
        <div className="space-y-5">
          {/* By party (vendor) — the primary party-wise view */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-violet-50 text-violet-600">
                <Building2 size={15} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-800">By Party</h2>
                <p className="text-xs text-gray-400 mt-0.5">{visibleParties.length} part{visibleParties.length === 1 ? 'y' : 'ies'}{q ? ' match' : (isAr ? ' owing' : ' owed')} · click a row for its ledger statement</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50/80 border-b border-slate-100">
                  <tr>
                    <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-5">Party</th>
                    {BUCKETS.map((b) => (
                      <th key={b.key} className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4 whitespace-nowrap">{b.label.replace(' days', '').replace(' (0–30)', '')}</th>
                    ))}
                    <th className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-5 whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {q && visibleParties.length === 0 && (
                    <tr><td colSpan={BUCKETS.length + 2} className="py-6 px-5 text-center text-sm text-gray-400 italic">No parties match “{search}”.</td></tr>
                  )}
                  {visibleParties.map((p) => (
                    <tr
                      key={p.partyKey}
                      onClick={() => openParty(p)}
                      title="View party ledger statement"
                      className="group hover:bg-slate-50/60 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-5 text-gray-800 font-medium">
                        {p.party}
                        {p.party === 'Unspecified' && <span className="ml-1.5 text-[10px] text-gray-400">({isAr ? 'no customer / party' : 'no vendor / note'})</span>}
                        <ChevronRight
                          size={14}
                          className="inline-block ml-1.5 -mb-0.5 text-indigo-400 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition"
                        />
                      </td>
                      {BUCKETS.map((b) => (
                        <td key={b.key} className="py-2.5 px-4 text-right tabular-nums text-gray-600">
                          {p[b.key] ? fmt(p[b.key]) : '—'}
                        </td>
                      ))}
                      <td className="py-2.5 px-5 text-right font-semibold tabular-nums text-gray-800">{fmt(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-100/60">
                    <td className="py-3 px-5 text-sm font-bold text-slate-700 uppercase tracking-wide">Total</td>
                    {BUCKETS.map((b) => (
                      <td key={b.key} className="py-3 px-4 text-right text-sm font-bold tabular-nums text-gray-800">{fmt(buckets[b.key])}</td>
                    ))}
                    <td className="py-3 px-5 text-right text-sm font-bold tabular-nums text-orange-700">{fmt(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* By account */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-indigo-50 text-indigo-600">
                <Users size={15} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-800">By Account</h2>
                <p className="text-xs text-gray-400 mt-0.5">{visibleAccounts.length} {isAr ? 'receivable' : 'payable'} account{visibleAccounts.length === 1 ? '' : 's'}{q ? ' match' : ' with a balance'}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50/80 border-b border-slate-100">
                  <tr>
                    <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-5">Account</th>
                    {BUCKETS.map((b) => (
                      <th key={b.key} className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4 whitespace-nowrap">{b.label.replace(' days', '').replace(' (0–30)', '')}</th>
                    ))}
                    <th className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-5 whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {q && visibleAccounts.length === 0 && (
                    <tr><td colSpan={BUCKETS.length + 2} className="py-6 px-5 text-center text-sm text-gray-400 italic">No accounts match “{search}”.</td></tr>
                  )}
                  {visibleAccounts.map((a) => (
                    <tr
                      key={a.accountId}
                      onClick={() => openLedger(a.accountId)}
                      title="View ledger breakdown"
                      className="group hover:bg-slate-50/60 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-5">
                        <span className="font-mono text-xs text-gray-400 mr-1.5">{a.code}</span>
                        <span className="text-gray-800">{a.name}</span>
                        <ChevronRight
                          size={14}
                          className="inline-block ml-1.5 -mb-0.5 text-indigo-400 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition"
                        />
                      </td>
                      {BUCKETS.map((b) => (
                        <td key={b.key} className="py-2.5 px-4 text-right tabular-nums text-gray-600">
                          {a[b.key] > 0 ? fmt(a[b.key]) : '—'}
                        </td>
                      ))}
                      <td className="py-2.5 px-5 text-right font-semibold tabular-nums text-gray-800">{fmt(a.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-100/60">
                    <td className="py-3 px-5 text-sm font-bold text-slate-700 uppercase tracking-wide">Total</td>
                    {BUCKETS.map((b) => (
                      <td key={b.key} className="py-3 px-4 text-right text-sm font-bold tabular-nums text-gray-800">{fmt(buckets[b.key])}</td>
                    ))}
                    <td className="py-3 px-5 text-right text-sm font-bold tabular-nums text-orange-700">{fmt(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Open bill detail */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-amber-50 text-amber-600">
                <AlertTriangle size={15} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Outstanding {isAr ? 'Receivables' : 'Bills'}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Each unpaid {isAr ? 'receivable' : 'bill'}, oldest first</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50/80 border-b border-slate-100">
                  <tr>
                    <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-5">Party</th>
                    <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4">Account</th>
                    <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4 whitespace-nowrap">Date</th>
                    <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4">Entry / Description</th>
                    <th className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4 whitespace-nowrap">Age</th>
                    <th className="text-center text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4">Bucket</th>
                    <th className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-5 whitespace-nowrap">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {q && visibleItems.length === 0 && (
                    <tr><td colSpan={7} className="py-6 px-5 text-center text-sm text-gray-400 italic">No {isAr ? 'receivables' : 'bills'} match “{search}”.</td></tr>
                  )}
                  {visibleItems.map((i, idx) => {
                    const b = BUCKET_BY_KEY[i.bucket];
                    return (
                      <tr key={`${i.entryNumber}-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-5 text-gray-800 font-medium whitespace-nowrap">{i.party ?? '—'}</td>
                        <td className="py-2.5 px-4 text-gray-700 whitespace-nowrap">
                          <span className="font-mono text-xs text-gray-400 mr-1.5">{i.accountCode}</span>{i.accountName}
                        </td>
                        <td className="py-2.5 px-4 text-gray-600 whitespace-nowrap">
                          {i.date ? format(new Date(i.date), 'dd MMM yyyy') : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-gray-700 max-w-xs">
                          <span className="font-mono text-[11px] text-indigo-600">{i.entryNumber}</span>
                          {i.description && <span className="block text-xs text-gray-500 truncate">{i.description}</span>}
                          {i.notes && <span className="block text-[11px] text-gray-400 italic truncate">{i.notes}</span>}
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-gray-600 whitespace-nowrap">{i.ageDays} d</td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-semibold', b?.badge ?? 'bg-gray-100 text-gray-600')}>
                            {b?.label.replace(' (0–30 days)', '').replace(' days', '') ?? i.bucket}
                          </span>
                        </td>
                        <td className="py-2.5 px-5 text-right font-semibold tabular-nums text-gray-800">
                          {fmt(i.openAmount)}
                          {i.openAmount !== i.originalAmount && (
                            <span className="block text-[10px] text-gray-400">of {fmt(i.originalAmount)}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-400 px-1">
            Aged by each {isAr ? 'receivable' : 'bill'}'s own date (no due dates in the ledger). {isAr ? 'Collections' : 'Payments'} are applied oldest-first, so a partial
            {isAr ? 'collection' : 'payment'} leaves the remaining balance aging from the original {isAr ? 'receivable' : 'bill'} date.
          </p>
        </div>
      )}
    </div>
  );
};

export default PayablesAging;

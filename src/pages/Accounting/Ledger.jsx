import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { format } from 'date-fns';
import clsx from 'clsx';
import { BookOpen, ArrowDownLeft, ArrowUpRight, ArrowLeft, Wallet, X, Building2 } from 'lucide-react';
import {
  useGetAccountsQuery,
  useGetAdvanceByIdQuery,
  useGetLedgerQuery,
  useGetPaymentByIdQuery,
  useGetPurchaseQuery,
  useGetSalesTransactionByIdQuery,
  listQueryOpts,
} from '../../store/baseApi';
import usePartyOptions from '../../hooks/usePartyOptions';
import DateRangePicker from '../../components/UI/DateRangePicker';
import SearchableSelect from '../../components/UI/SearchableSelect';
import SearchInput from '../../components/UI/SearchInput';
import HeroBanner from '../../components/UI/HeroBanner';
import FilterBar from '../../components/UI/FilterBar';
import { SalesTransactionDrawer } from '../Reports/SalesTransactions';
import { AdvanceDetailDrawer } from '../Salaries/SalaryManager';
import {
  PaymentDetailDrawer,
  PurchaseDetailDrawer,
} from '../../components/Accounting/PurchasePaymentDrawers';
import useQueryState from '../../hooks/useQueryState';

const fmt = (n) =>
  (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SYSTEM_AR_PARTIES = new Set(['n:food panda sales', 'n:salary advance']);

const SOURCE_MODULE_COLOR = {
  manual:    'bg-indigo-100 text-indigo-700',
  purchase:  'bg-blue-100 text-blue-700',
  purchaseAdjustment: 'bg-violet-100 text-violet-700',
  payment:   'bg-emerald-100 text-emerald-700',
  inventory: 'bg-purple-100 text-purple-700',
  waste:     'bg-rose-100 text-rose-700',
  pos:       'bg-orange-100 text-orange-700',
  stockCount:'bg-amber-100 text-amber-700',
  assetDepreciation: 'bg-fuchsia-100 text-fuchsia-700',
  assetAuditAdjustment: 'bg-rose-100 text-rose-700',
  assetAcquisition: 'bg-violet-100 text-violet-700',
  assetDisposal: 'bg-orange-100 text-orange-700',
};

const Ledger = () => {
  const navigate = useNavigate();

  const [accountId, setAccountId] = useQueryState('account', '');
  const [party, setParty] = useQueryState('party', '');
  const [partyName, setPartyName] = useQueryState('partyName', '');
  const [scope, setScope] = useQueryState('scope', 'ap');
  const [dateFrom, setDateFrom] = useQueryState('from', '');
  const [dateTo, setDateTo] = useQueryState('to', '');
  const [saleOrderId, setSaleOrderId] = useState('');
  const { data: saleOrder } = useGetSalesTransactionByIdQuery(saleOrderId, {
    skip: !saleOrderId,
  });
  const [advanceId, setAdvanceId] = useState('');
  const { data: advance } = useGetAdvanceByIdQuery(advanceId, {
    skip: !advanceId,
  });
  const [purchaseId, setPurchaseId] = useState('');
  const { data: purchase } = useGetPurchaseQuery(purchaseId, {
    skip: !purchaseId,
  });
  const [paymentId, setPaymentId] = useState('');
  const { data: payment } = useGetPaymentByIdQuery(paymentId, {
    skip: !paymentId,
  });

  const accountsParams = useMemo(() => ({ isActive: true }), []);
  const { data: accountsPayload } = useGetAccountsQuery(accountsParams, listQueryOpts);
  const accounts = useMemo(() => accountsPayload ?? [], [accountsPayload]);

  // Party options = the exact keys AP Aging groups by, so a filter here
  // reconciles with that report (shared with Journal Entries via the hook).
  const partyOptions = usePartyOptions(party, partyName, { includeUnspecified: true });

  const onPartyChange = (val) => {
    if (!val) { setParty(''); setPartyName(''); return; }
    setParty(val);
    setPartyName(partyOptions.find((o) => o.value === val)?.label ?? '');
    if (SYSTEM_AR_PARTIES.has(val)) setScope('ar');
    else if (val.startsWith('v:')) setScope('ap');
  };

  const ledgerParams = useMemo(() => ({
    accountId,
    party:     party     || undefined,
    partyName: partyName || undefined,
    scope:     party ? scope : undefined,
    from:      dateFrom  || undefined,
    to:        dateTo    || undefined,
  }), [accountId, party, partyName, scope, dateFrom, dateTo]);

  const { data: result, isLoading: loading } = useGetLedgerQuery(
    ledgerParams,
    { skip: !accountId && !party, ...listQueryOpts }
  );

  const acct          = result?.account;
  const totalDebits   = (result?.lines ?? []).reduce((s, l) => s + (l.debit  ?? 0), 0);
  const totalCredits  = (result?.lines ?? []).reduce((s, l) => s + (l.credit ?? 0), 0);

  // Text search filters which movement rows are shown (opening/closing balances
  // and the debit/credit totals above stay on the full period).
  const [lineSearch, setLineSearch] = useQueryState('lineSearch', '');
  const lq = lineSearch.trim().toLowerCase();
  const allLines = useMemo(() => result?.lines ?? [], [result]);
  const filteredLines = useMemo(
    () => (lq
      ? allLines.filter((l) => `${l.entryNumber ?? ''} ${l.description ?? ''} ${l.notes ?? ''} ${l.sourceModule ?? ''}`.toLowerCase().includes(lq))
      : allLines),
    [allLines, lq],
  );

  return (
    <div className="space-y-6 pb-8">
      <HeroBanner
        icon={BookOpen}
        eyebrow="Accounting"
        title="General Ledger"
        subtitle="Browse account activity, running balances and source transactions for any period."
        accent="indigo"
        compact
      />

      <FilterBar>
        <div className="min-w-[240px] flex-1">
          <SearchableSelect
            options={accounts.map((a) => ({ value: a._id, label: a.name, meta: a.code }))}
            value={accountId}
            onChange={setAccountId}
            placeholder="Select account…"
            searchPlaceholder="Search accounts…"
            allowClear
          />
        </div>

        <div className="min-w-[220px] flex-1">
          <SearchableSelect
            options={partyOptions}
            value={party}
            onChange={onPartyChange}
            placeholder="Filter by party…"
            searchPlaceholder="Search parties…"
            allowClear
          />
        </div>

        {party && !accountId && (
          <div className="min-w-[190px]">
            <SearchableSelect
              options={[
                { value: 'ap', label: 'Payables', meta: 'AP accounts' },
                { value: 'ar', label: 'Receivables', meta: 'AR accounts' },
              ]}
              value={scope}
              onChange={setScope}
              placeholder="Ledger scope…"
              searchPlaceholder="Search scope…"
            />
          </div>
        )}

        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
        />

        {(accountId || party) && (
          <SearchInput
            value={lineSearch}
            onChange={setLineSearch}
            placeholder="Search entries…"
            className="min-w-[200px]"
          />
        )}

        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
          >
            Clear dates
          </button>
        )}
      </FilterBar>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && !accountId && !party && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          <BookOpen size={36} strokeWidth={1.5} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">Select an account or party to view its ledger.</p>
          <p className="text-xs mt-1">Pick a party alone for a full statement across all {scope === 'ar' ? 'receivable' : 'payable'} accounts.</p>
        </div>
      )}

      {!loading && result && acct && (
        <>
          {/* Account info card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
              <div>
                <p className="text-xs font-mono text-gray-500">{acct.code}</p>
                <h1 className="text-2xl font-bold text-gray-800 mt-0.5">{acct.name}</h1>
                <p className="text-xs text-gray-500 mt-0.5 capitalize">
                  {acct.type} · Normal balance: {acct.normalBalance}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                {result.party && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-700">
                    <Building2 size={12} />
                    Party: {result.party.name}
                    <button
                      type="button"
                      onClick={() => { setParty(''); setPartyName(''); }}
                      className="ml-0.5 -mr-1 rounded-full p-0.5 hover:bg-violet-100 focus:outline-none"
                      title="Clear party filter"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
                {(dateFrom || dateTo) && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
                    {dateFrom ? format(new Date(dateFrom), 'dd MMM yyyy') : '—'}
                    {' → '}
                    {dateTo ? format(new Date(dateTo), 'dd MMM yyyy') : 'today'}
                  </span>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {
                  label: 'Opening',
                  value: `Rs. ${fmt(result.openingBalance)}`,
                  tone:  (result.openingBalance ?? 0) < 0 ? 'text-rose-600' : 'text-gray-800',
                  icon:  Wallet,
                  bg:    'bg-gray-50',
                  iconBg:'bg-slate-100', iconColor: 'text-slate-600',
                },
                {
                  label: 'Total Debits',
                  value: `Rs. ${fmt(totalDebits)}`,
                  tone:  'text-indigo-700',
                  icon:  ArrowDownLeft,
                  bg:    'bg-gray-50',
                  iconBg:'bg-indigo-50', iconColor: 'text-indigo-600',
                },
                {
                  label: 'Total Credits',
                  value: `Rs. ${fmt(totalCredits)}`,
                  tone:  'text-teal-700',
                  icon:  ArrowUpRight,
                  bg:    'bg-gray-50',
                  iconBg:'bg-teal-50', iconColor: 'text-teal-600',
                },
                {
                  label: 'Closing',
                  value: `Rs. ${fmt(result.closingBalance)}`,
                  tone:  (result.closingBalance ?? 0) < 0 ? 'text-rose-600' : 'text-emerald-700',
                  icon:  ArrowLeft,
                  bg:    'bg-gray-50',
                  iconBg:'bg-emerald-50', iconColor: 'text-emerald-600',
                },
              ].map((s) => (
                <div key={s.label} className={clsx('rounded-lg p-3 flex items-center gap-3', s.bg)}>
                  <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', s.iconBg)}>
                    <s.icon size={16} className={s.iconColor} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{s.label}</p>
                    <p className={clsx('text-lg font-bold mt-0.5 tabular-nums truncate', s.tone)}>{s.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Entries table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Entries</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {lq
                    ? `${filteredLines.length} of ${allLines.length} ${allLines.length === 1 ? 'movement' : 'movements'} match`
                    : `${allLines.length} ${allLines.length === 1 ? 'movement' : 'movements'} in period`}
                </p>
              </div>
            </div>

            {(result.lines?.length ?? 0) === 0 ? (
              <p className="text-sm text-gray-400 text-center py-12">No activity in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50/80 border-b border-slate-100">
                    <tr>
                      {['Date', 'Entry #', 'Description', 'Module', 'Debit (Rs.)', 'Credit (Rs.)', 'Balance (Rs.)'].map((h, idx) => {
                        const isNumeric = idx >= 4;
                        return (
                          <th
                            key={h}
                            className={clsx(
                              'text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] py-3 px-4 whitespace-nowrap',
                              isNumeric ? 'text-right' : 'text-left'
                            )}
                          >
                            {h}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Opening row */}
                    <tr className="bg-slate-50/60">
                      <td colSpan={6} className="py-2.5 px-4 text-xs font-semibold text-slate-500 italic">
                        Opening Balance
                      </td>
                      <td className={clsx(
                        'py-2.5 px-4 font-bold text-right tabular-nums',
                        (result.openingBalance ?? 0) < 0 ? 'text-rose-600' : 'text-slate-700'
                      )}>
                        {fmt(result.openingBalance)}
                      </td>
                    </tr>

                    {lq && filteredLines.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-6 px-4 text-center text-sm text-gray-400 italic">
                          No movements match “{lineSearch}”.
                        </td>
                      </tr>
                    )}

                    {filteredLines.map((line, i) => (
                      <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-4 text-gray-600 whitespace-nowrap">
                          {line.date ? format(new Date(line.date), 'dd MMM yyyy') : '—'}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => navigate(`/accounting/journal-entries?search=${encodeURIComponent(line.entryNumber)}`)}
                            className="font-mono text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded"
                            title="Open this entry in Journal Entries"
                          >
                            {line.entryNumber}
                          </button>
                        </td>
                        <td className="py-2.5 px-4 text-gray-700 max-w-xs">
                          {(() => {
                            if (line.sourceModule === 'pos' && line.sourceId) {
                              const href = `/reports/sales-transactions?order=${line.sourceId}`;
                              return (
                                <a
                                  href={href}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    setSaleOrderId(String(line.sourceId));
                                  }}
                                  className="block truncate text-left text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded"
                                  title="Open order details"
                                >
                                  {line.description}
                                </a>
                              );
                            }
                            if (line.sourceModule === 'salaryAdvance' && line.sourceId) {
                              const href = `/salaries?tab=advances&advance=${line.sourceId}`;
                              return (
                                <a
                                  href={href}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    setAdvanceId(String(line.sourceId));
                                  }}
                                  className="block truncate text-left text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded"
                                  title="Open salary advance details"
                                >
                                  {line.description}
                                </a>
                              );
                            }
                            if (line.sourceModule === 'payment' && line.sourceId) {
                              const href = `/payments?ref=${line.sourceId}`;
                              return (
                                <a
                                  href={href}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    setPaymentId(String(line.sourceId));
                                  }}
                                  className="block truncate text-left text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded"
                                  title="Open payment details"
                                >
                                  {line.description}
                                </a>
                              );
                            }
                            const linkedPurchaseId = line.sourceModule === 'purchase'
                              ? line.sourceId
                              : line.sourceModule === 'purchaseAdjustment'
                                ? line.sourcePath?.match(/^\/purchases\/([^/?]+)/)?.[1]
                                : null;
                            if (linkedPurchaseId) {
                              const href = `/purchases/${linkedPurchaseId}`;
                              return (
                                <a
                                  href={href}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    setPurchaseId(String(linkedPurchaseId));
                                  }}
                                  className="block truncate text-left text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded"
                                  title="Open purchase details"
                                >
                                  {line.description}
                                </a>
                              );
                            }
                            const sourcePath = line.sourcePath || '';
                            return sourcePath ? (
                            <Link
                              to={sourcePath}
                              className="block truncate text-left text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded"
                              title={`Open ${line.sourceNumber || line.sourceModule}`}
                            >
                              {line.description}
                            </Link>
                          ) : line.sourceId && line.sourceModule === 'payment' ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/payments?ref=${line.sourceId}`)}
                              className="block truncate text-left text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded"
                              title="Open payment"
                            >
                              {line.description}
                            </button>
                          ) : (
                            <span className="block truncate">{line.description}</span>
                          );
                          })()}
                          {line.notes && <span className="text-xs text-gray-400 italic block truncate">{line.notes}</span>}
                        </td>
                        <td className="py-2.5 px-4">
                          {line.sourceModule && (
                            <span className={clsx(
                              'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize',
                              SOURCE_MODULE_COLOR[line.sourceModule] ?? 'bg-gray-100 text-gray-600'
                            )}>
                              {line.sourceModule}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-medium text-gray-700 tabular-nums">
                          {(line.debit ?? 0) > 0 ? fmt(line.debit) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-medium text-gray-700 tabular-nums">
                          {(line.credit ?? 0) > 0 ? fmt(line.credit) : '—'}
                        </td>
                        <td className={clsx(
                          'py-2.5 px-4 text-right font-bold tabular-nums',
                          (line.runningBalance ?? 0) < 0 ? 'text-rose-600' : 'text-gray-800'
                        )}>
                          {fmt(line.runningBalance)}
                        </td>
                      </tr>
                    ))}

                    {/* Closing row */}
                    <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                      <td colSpan={6} className="py-3 px-4 text-sm font-bold text-slate-700">
                        Closing Balance
                      </td>
                      <td className={clsx(
                        'py-3 px-4 text-right text-lg font-bold tabular-nums',
                        (result.closingBalance ?? 0) < 0 ? 'text-rose-600' : 'text-emerald-700'
                      )}>
                        {fmt(result.closingBalance)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      <SalesTransactionDrawer
        order={saleOrderId ? saleOrder : null}
        onClose={() => setSaleOrderId('')}
      />
      <AdvanceDetailDrawer
        advance={advanceId ? advance : null}
        onClose={() => setAdvanceId('')}
      />
      <PurchaseDetailDrawer
        purchase={purchaseId ? purchase : null}
        onClose={() => setPurchaseId('')}
      />
      <PaymentDetailDrawer
        payment={paymentId ? payment : null}
        onClose={() => setPaymentId('')}
      />
    </div>
  );
};

export default Ledger;

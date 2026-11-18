import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChefHat, Clock3, RefreshCw, Store, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { getKitchenCounterReport } from '../../api/kdsApi';
import { getOutlets } from '../../api/outletApi';
import SearchableSelect from '../../components/UI/SearchableSelect';
import useAuth from '../../hooks/useAuth';
import useQueryState from '../../hooks/useQueryState';

const today = () => new Date().toLocaleDateString('en-CA');
const money = (value) => `PKR ${Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;
const titleCase = (value = '') => value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const formatDateTime = (value) => value ? new Date(value).toLocaleString(undefined, {
  day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
}) : '—';

const KitchenCounterSales = () => {
  const { user } = useAuth();
  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useQueryState('outlet', '');
  const [from, setFrom] = useQueryState('from', today);
  const [to, setTo] = useQueryState('to', today);
  const [report, setReport] = useState({ summary: {}, discrepancies: [] });
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    getOutlets({ limit: 100 }).then(({ data }) => {
      const rows = data?.data || [];
      const assignedId = String(user?.outletRef?._id || user?.outletRef || '');
      const assignedCode = String(user?.outletCode || user?.outlet || '');
      const permittedRows = user?.role === 'owner'
        ? rows
        : rows.filter((row) => String(row._id) === assignedId || String(row.code) === assignedCode);
      setOutlets(permittedRows);
      setOutletId((current) => permittedRows.some((row) => String(row._id) === String(current))
        ? current
        : permittedRows[0]?._id || '');
    }).catch(() => toast.error('Could not load outlets.'));
  }, [setOutletId, user?.outlet, user?.outletCode, user?.outletRef, user?.role]);

  useEffect(() => {
    if (!outletId) return;
    setLoading(true);
    getKitchenCounterReport({ outletId, from, to })
      .then(setReport)
      .catch((error) => toast.error(error.response?.data?.message || 'Could not load kitchen and counter sales.'))
      .finally(() => setLoading(false));
  }, [outletId, from, to, refreshKey]);

  const summary = report.summary || {};
  const discrepancies = report.discrepancies || [];
  const kitchenOrders = Number(summary.kitchenOrders || 0);
  const counterOrders = Number(summary.counterOrders || 0);
  const valueVariance = Number(summary.valueVariance || 0);
  const uncashedOrders = Number(summary.uncashedKitchenOrders || 0);
  const counterWithoutDispatch = Number(summary.counterWithoutDispatchOrders || 0);
  const balanced = valueVariance === 0 && uncashedOrders === 0 && counterWithoutDispatch === 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Outlet</label>
          <SearchableSelect
            options={outlets.map((row) => ({ value: row._id, label: row.name, meta: row.code }))}
            value={outletId}
            onChange={setOutletId}
          />
        </div>
        <label>
          <span className="mb-1 block text-xs font-bold uppercase text-slate-500">From</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-bold uppercase text-slate-500">To</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <button
          type="button"
          disabled={loading || !outletId}
          onClick={() => setRefreshKey((value) => value + 1)}
          className="mt-5 flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-orange-200 bg-orange-50 p-7 text-orange-900 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-orange-100 p-2.5"><ChefHat size={22} /></span>
            <div>
              <h2 className="font-bold">Kitchen prepared &amp; dispatched</h2>
              <p className="text-xs text-orange-700">{kitchenOrders} dispatched order{kitchenOrders === 1 ? '' : 's'}</p>
            </div>
          </div>
          <p className="mt-7 text-4xl font-black tabular-nums">{money(summary.kitchenValue)}</p>
        </section>

        <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-7 text-indigo-900 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-indigo-100 p-2.5"><Store size={22} /></span>
            <div>
              <h2 className="font-bold">Counter cashed out</h2>
              <p className="text-xs text-indigo-700">{counterOrders} paid order{counterOrders === 1 ? '' : 's'}</p>
            </div>
          </div>
          <p className="mt-7 text-4xl font-black tabular-nums">{money(summary.counterValue)}</p>
        </section>
      </div>

      <section className={`flex flex-col gap-3 rounded-2xl border p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between ${
        balanced
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : 'border-amber-200 bg-amber-50 text-amber-950'
      }`}>
        <div className="flex items-start gap-3">
          {balanced
            ? <CheckCircle2 className="mt-0.5 shrink-0" size={21} />
            : <AlertTriangle className="mt-0.5 shrink-0" size={21} />}
          <div>
            <h3 className="font-bold">{balanced ? 'Kitchen and counter are balanced' : 'Difference needs review'}</h3>
            <p className="mt-1 text-sm opacity-80">
              {uncashedOrders} kitchen-dispatched order{uncashedOrders === 1 ? '' : 's'} not cashed out
              {' '}({money(summary.uncashedKitchenValue)})
              {' · '}{counterWithoutDispatch} counter order{counterWithoutDispatch === 1 ? '' : 's'} without dispatch
              {' '}({money(summary.counterWithoutDispatchValue)})
            </p>
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-bold uppercase tracking-wide opacity-70">Kitchen minus counter</p>
          <p className="text-2xl font-black tabular-nums">{money(valueVariance)}</p>
        </div>
      </section>

      {discrepancies.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
          <header className="flex items-center justify-between gap-4 border-b border-amber-100 bg-amber-50/70 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><AlertTriangle size={18} /></span>
              <div>
                <h2 className="font-bold text-slate-900">Orders needing review</h2>
                <p className="text-xs text-slate-500">Exact orders where kitchen dispatch and counter checkout do not match.</p>
              </div>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">{discrepancies.length}</span>
          </header>

          <div className="divide-y divide-slate-100">
            {discrepancies.map((order) => {
              const kitchenIssue = order.kind === 'kitchen-not-cashed';
              const issueLabel = kitchenIssue
                ? 'Dispatched, not cashed out'
                : 'Cashed out, not dispatched';
              return (
                <article key={`${order.kind}-${order.id}`} className="grid gap-4 px-5 py-4 sm:grid-cols-2 xl:grid-cols-[minmax(210px,1.2fr)_minmax(220px,1.4fr)_minmax(120px,.7fr)_minmax(180px,1fr)_140px] xl:items-center">
                  <div>
                    <p className="text-sm font-black text-slate-900">#{order.orderNumber}</p>
                    <p className="mt-1 text-xs text-slate-400">Business date {order.businessDate || '—'}</p>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${kitchenIssue ? 'bg-orange-100 text-orange-700' : 'bg-indigo-100 text-indigo-700'}`}>
                      {kitchenIssue ? <ChefHat size={15} /> : <Store size={15} />}
                    </span>
                    <div>
                      <p className={`text-sm font-bold ${kitchenIssue ? 'text-orange-800' : 'text-indigo-800'}`}>{issueLabel}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {order.currentStatus === 'cancelled' ? 'Cancelled after kitchen dispatch' : kitchenIssue ? 'No completed counter sale found' : 'No kitchen dispatch found'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Order type</p>
                    <p className="mt-1 text-sm font-bold text-slate-700">{titleCase(order.orderType) || '—'}</p>
                  </div>

                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Clock3 size={13} />{formatDateTime(order.eventAt)}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400"><UserRound size={13} />{order.responsibleName || 'Employee not recorded'}</p>
                  </div>

                  <p className="text-left text-base font-black tabular-nums text-slate-900 xl:text-right">{money(order.amount)}</p>

                  {order.cancellationReason && (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 sm:col-span-2 xl:col-span-5">
                      <b>Cancellation reason:</b> {order.cancellationReason}{order.cancelledByName ? ` · ${order.cancelledByName}` : ''}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

export default KitchenCounterSales;

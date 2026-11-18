import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Clock3, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../api/axios';

const formatPKR = (value) => `PKR ${Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-lg font-semibold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

const BoutiqueCloseShiftScreen = () => {
  const navigate = useNavigate();
  const session = useSelector((state) => state.session.session);
  const cashier = useSelector((state) => state.auth.cashier);
  const [summary, setSummary] = useState(null);
  const [closingFloat, setClosingFloat] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine);

  useEffect(() => {
    const refreshOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', refreshOnline);
    window.addEventListener('offline', refreshOnline);
    return () => { window.removeEventListener('online', refreshOnline); window.removeEventListener('offline', refreshOnline); };
  }, []);

  useEffect(() => {
    let active = true;
    api.get('/api/pos/sessions/current/summary')
      .then((response) => { if (active) setSummary(response.data?.data || {}); })
      .catch((error) => toast.error(error.response?.data?.message || 'Could not load the current shift summary.'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const expectedCash = useMemo(() => {
    const totals = summary || {};
    return Number(session?.openingFloat || 0) + Number(totals.netCash ?? totals.cashSales ?? 0) + Number(totals.paidIn || 0) - Number(totals.paidOut || 0);
  }, [session, summary]);
  const variance = Number(closingFloat || 0) - expectedCash;

  const closeShift = async (event) => {
    event.preventDefault();
    const value = Number(closingFloat);
    if (!Number.isFinite(value) || value < 0) return toast.error('Enter the counted cash in PKR.');
    if (!online) return toast.error('Reconnect to the internet to submit the shift closeout. Keep the shift open and unsynced sales queued until then.');
    setWorking(true);
    try {
      const response = await api.post('/api/pos/sessions/close', { closingFloat: value, notes: notes.trim() });
      const closedSession = response.data?.data;
      navigate('/terminal/session/closed', { replace: true, state: { closedSession } });
    } catch (error) { toast.error(error.response?.data?.message || 'Could not close this shift.'); }
    finally { setWorking(false); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-5">
      <header className="flex items-start justify-between gap-3"><div><h1 className="text-xl font-extrabold text-slate-900">Close shift</h1><p className="mt-1 text-sm text-slate-500">Count the till and compare it with this cashier shift.</p></div><button onClick={() => navigate('/terminal/pos')} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><ArrowLeft size={15} />Back to POS</button></header>
      {!online && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This terminal is offline. Sales can continue and queue locally, but the server shift cannot close until connectivity returns.</div>}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3"><div><p className="font-bold text-slate-900">{session?.outlet?.name || 'Boutique outlet'}</p><p className="mt-1 text-xs text-slate-500">{session?.sessionNumber || 'Shift'} · {cashier?.name || 'Cashier'}</p></div><Clock3 size={18} className="text-slate-400" /></div>
        {loading ? <div className="grid min-h-36 place-items-center"><RefreshCw size={18} className="animate-spin text-indigo-600" /></div> : <div className="divide-y divide-slate-100 py-2">
          <div className="flex justify-between py-2.5 text-sm"><span className="text-slate-600">Transactions</span><span className="font-semibold">{summary?.totalTransactions || 0}</span></div>
          <div className="flex justify-between py-2.5 text-sm"><span className="text-slate-600">Cash sales</span><span>{formatPKR(summary?.cashSales)}</span></div>
          <div className="flex justify-between py-2.5 text-sm"><span className="text-slate-600">Card sales</span><span>{formatPKR(summary?.cardSales)}</span></div>
          <div className="flex justify-between py-2.5 text-sm"><span className="text-slate-600">Online transfer sales</span><span>{formatPKR(summary?.onlineTransferSales)}</span></div>
          <div className="flex justify-between py-2.5 text-sm"><span className="text-slate-600">Store credit redeemed</span><span>{formatPKR(summary?.storeCreditSales)}</span></div>
          <div className="flex justify-between py-2.5 text-sm"><span className="text-slate-600">Returns</span><span>{formatPKR(summary?.totalRefunds)}</span></div>
          <div className="flex justify-between py-3 text-sm font-bold"><span>Total sales</span><span>{formatPKR(summary?.totalSales)}</span></div>
          <div className="flex justify-between py-3 text-sm font-bold text-indigo-800"><span>Expected cash in till</span><span>{formatPKR(expectedCash)}</span></div>
        </div>}
      </section>
      <form onSubmit={closeShift} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block text-sm font-bold text-slate-800">Counted closing cash (PKR)<input className={`${field} mt-2`} type="number" min="0" step="0.01" value={closingFloat} onChange={(event) => setClosingFloat(event.target.value)} required /></label>
        {closingFloat !== '' && <p className={`mt-2 text-sm font-semibold ${variance === 0 ? 'text-emerald-700' : variance > 0 ? 'text-amber-700' : 'text-rose-700'}`}>Variance: {variance > 0 ? '+' : ''}{formatPKR(variance)}</p>}
        <label className="mt-4 block text-xs font-semibold text-slate-600">Closeout notes<textarea className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} placeholder="Optional notes about a cash difference" /></label>
        <button disabled={working || loading || !online} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{working ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}{working ? 'Closing shift…' : 'Close shift and save summary'}</button>
      </form>
    </div>
  );
};

export default BoutiqueCloseShiftScreen;

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Barcode, Check, Minus, Percent, Plus, RefreshCw, Search, ShoppingBag, Tag, Trash2, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { QUEUE_EVENT } from '../components/Layout/BoutiquePOSLayout';
import { useReceiptPrint } from '../components/Print/ReceiptPrintProvider';
import FloatingSelect from '../../../../components/UI/FloatingSelect';
import useQueryState from '../../../../hooks/useQueryState';

const CATALOG_TTL = 1000 * 60 * 60 * 24 * 30;
const inputCls = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const formatPKR = (value) => `PKR ${Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
const variantName = (variant) => [variant.product?.title || variant.title || 'Product', variant.title && variant.title !== 'Default Title' ? variant.title : ''].filter(Boolean).join(' · ');
const catalogKey = (outletId) => `boutique_catalog_v1:${outletId || 'unknown'}`;
const queueKey = (cashierId) => `boutique_retail_queue_v1:${cashierId || 'unknown'}`;
const makeId = () => globalThis.crypto?.randomUUID?.() || `retail-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};

const BoutiquePOSScreen = () => {
  const session = useSelector((state) => state.session.session);
  const cashier = useSelector((state) => state.auth.cashier);
  const outletId = String(session?.outlet?._id || session?.outlet || '');
  const outletCode = String(session?.outlet?.code || cashier?.outletCode || '');
  const cashierId = String(cashier?.id || cashier?._id || '');
  const [catalog, setCatalog] = useState([]);
  const [cart, setCart] = useState([]);
  const [queue, setQueue] = useState([]);
  const [search, setSearch] = useQueryState('search', '');
  const [selectedCategory, setSelectedCategory] = useQueryState('category', 'all');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discountMode, setDiscountMode] = useState('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [cashTendered, setCashTendered] = useState('');
  const [splitCash, setSplitCash] = useState('');
  const [cardLast4, setCardLast4] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine);
  const [lastRefresh, setLastRefresh] = useState(null);
  const requestReceiptPrint = useReceiptPrint();
  const searchRef = useRef(null);
  const syncQueueRef = useRef(() => {});
  const byBarcode = useMemo(() => new Map(catalog.filter((item) => item.barcode).map((item) => [String(item.barcode).toLowerCase(), item])), [catalog]);

  const persistQueue = useCallback((next) => {
    setQueue(next);
    localStorage.setItem(queueKey(cashierId), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: { count: next.length } }));
  }, [cashierId]);

  const refreshCatalog = useCallback(async (force = false) => {
    if (!outletId) return;
    const cached = readJson(catalogKey(outletId), null);
    if (cached?.items?.length) setCatalog(cached.items);
    if (!navigator.onLine || (!force && cached?.fetchedAt && Date.now() - cached.fetchedAt < 60_000)) return;
    try {
      const firstPage = await api.get('/api/shopify/catalog', { params: { outletId, limit: 250, page: 1 } });
      const firstData = firstPage.data?.data || {};
      const items = Array.isArray(firstData) ? firstData : [...(firstData.items || [])];
      const pages = Array.isArray(firstData) ? 1 : Number(firstData.totalPages || 1);
      for (let page = 2; page <= pages; page += 1) {
        const nextPage = await api.get('/api/shopify/catalog', { params: { outletId, limit: 250, page } });
        items.push(...(nextPage.data?.data?.items || []));
      }
      setCatalog(items);
      localStorage.setItem(catalogKey(outletId), JSON.stringify({ items, fetchedAt: Date.now() }));
      setLastRefresh(new Date());
    } catch (error) {
      if (!cached?.items?.length) toast.error(error.response?.data?.message || 'Could not load Shopify inventory.');
      else toast('Using the saved catalog. Stock may have changed while offline.', { icon: '⚠️' });
    }
  }, [outletId]);

  useEffect(() => {
    persistQueue(readJson(queueKey(cashierId), []));
  }, [cashierId, persistQueue]);

  useEffect(() => { refreshCatalog(); }, [refreshCatalog]);

  useEffect(() => {
    if (!online || !catalog.length) return;
    setCart((current) => {
      let changed = false;
      const next = current.flatMap((line) => {
        const variant = catalog.find((item) => item._id === line.variantId && (item.selectedLocationId || '') === line.shopifyLocationId);
        if (!variant || variant.tracked === false) return [line];
        const available = Math.max(0, Number(variant.available || 0));
        if (line.qty <= available && line.availableSnapshot === available) return [line];
        changed = true;
        if (available <= 0) return [];
        return [{ ...line, qty: Math.min(line.qty, available), availableSnapshot: available }];
      });
      return changed ? next : current;
    });
  }, [online, catalog]);

  useEffect(() => {
    const onlineHandler = () => { setOnline(navigator.onLine); if (navigator.onLine) refreshCatalog(true); };
    const offlineHandler = () => setOnline(false);
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    return () => { window.removeEventListener('online', onlineHandler); window.removeEventListener('offline', offlineHandler); };
  }, [refreshCatalog]);

  const syncQueue = useCallback(async () => {
    if (!navigator.onLine || busy || queue.length === 0) return;
    setBusy(true);
    try {
      const response = await api.post('/api/pos/retail-sync-offline', { transactions: queue.slice(0, 20) });
      const result = response.data?.data || {};
      const completed = new Set([...(result.synced || []), ...(result.skipped || [])].map((item) => item.clientTransactionId));
      const errors = new Map((result.failed || []).map((item) => [item.clientTransactionId, item.error]));
      const remaining = queue.filter((item) => !completed.has(item.clientTransactionId)).map((item) => ({
        ...item,
        syncError: errors.get(item.clientTransactionId) || item.syncError || '',
        syncAttempts: Number(item.syncAttempts || 0) + 1,
      }));
      persistQueue(remaining);
      if (completed.size) {
        toast.success(`Synced ${completed.size} offline sale${completed.size === 1 ? '' : 's'}.`);
        await refreshCatalog(true);
      }
      if (result.failed?.length) toast.error(`${result.failed.length} offline sale(s) need attention.`);
    } catch {
      // Keep queued sales on this device until the server confirms them.
    } finally {
      setBusy(false);
    }
  }, [busy, persistQueue, queue, refreshCatalog]);

  useEffect(() => { syncQueueRef.current = syncQueue; }, [syncQueue]);

  useEffect(() => {
    if (!queue.length || !online) return undefined;
    const timer = setTimeout(() => syncQueueRef.current(), 1500);
    const interval = setInterval(() => syncQueueRef.current(), 20_000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [online, Boolean(queue.length)]);

  const categories = useMemo(() => {
    const counts = new Map();
    catalog.forEach((item) => {
      const category = String(item.product?.productType || item.productType || '').trim() || 'Other';
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((item) => {
      const category = String(item.product?.productType || item.productType || '').trim() || 'Other';
      if (selectedCategory !== 'all' && category !== selectedCategory) return false;
      return !q || `${variantName(item)} ${item.sku || ''} ${item.barcode || ''} ${category} ${item.options?.map((option) => option.value).join(' ') || ''}`.toLowerCase().includes(q);
    });
  }, [catalog, search, selectedCategory]);

  const addToCart = (variant) => {
    const key = `${variant._id}:${variant.selectedLocationId || ''}`;
    const existing = cart.find((item) => item.key === key);
    const tracked = variant.tracked !== false;
    const available = Math.max(0, Number(variant.available || 0));
    if (online && tracked && Number(existing?.qty || 0) >= available) {
      toast.error(available <= 0 ? 'This product is out of stock.' : `Only ${available} unit${available === 1 ? '' : 's'} available.`);
      return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.key === key);
      if (online && tracked && Number(existing?.qty || 0) >= available) return current;
      if (existing) return current.map((item) => item.key === key ? { ...item, qty: item.qty + 1 } : item);
      return [...current, {
        key,
        variantId: variant._id,
        shopifyLocationId: variant.selectedLocationId || '',
        name: variantName(variant),
        sku: variant.sku || '',
        barcode: variant.barcode || '',
        unitPriceSnapshot: Number(variant.price || 0),
        availableSnapshot: Number(variant.available || 0),
        tracked: variant.tracked !== false,
        qty: 1,
      }];
    });
    if (!online && variant.tracked !== false && Number(variant.available || 0) <= 0) toast('No stock in the saved snapshot. The sale will sync as a stock conflict.', { icon: '⚠️' });
  };

  const scanOrSearch = (event) => {
    if (event.key !== 'Enter') return;
    const exact = byBarcode.get(search.trim().toLowerCase());
    if (exact) {
      addToCart(exact);
      setSearch('');
      return;
    }
    if (filteredCatalog.length === 1 && search.trim()) {
      addToCart(filteredCatalog[0]);
      setSearch('');
    }
  };

  const subtotal = cart.reduce((sum, item) => sum + item.unitPriceSnapshot * item.qty, 0);
  const total = Math.round((subtotal + Number.EPSILON) * 100) / 100;
  const canDiscount = cashier?.role === 'owner' || cashier?.permissions?.['pos.discount'] === true;
  const discountLimitPercent = Math.min(100, Math.max(0, Number(cashier?.posDiscountLimitPercent ?? (cashier?.role === 'owner' ? 100 : 0)) || 0));
  const maxDiscountAmount = Math.round((total * discountLimitPercent / 100 + Number.EPSILON) * 100) / 100;
  const discountInput = Math.max(0, Number(discountValue || 0));
  const discountPercent = discountMode === 'percent' ? discountInput : 0;
  const discountAmount = Math.round(((discountMode === 'percent' ? total * discountInput / 100 : discountInput) + Number.EPSILON) * 100) / 100;
  const discountExceedsLimit = discountAmount > maxDiscountAmount + 0.009;
  const amountDue = Math.max(0, Math.round((total - discountAmount + Number.EPSILON) * 100) / 100);
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  const cashChange = Math.max(0, Number(cashTendered || 0) - amountDue);
  const splitCashAmount = Math.max(0, Number(splitCash || 0));
  const splitCardAmount = Math.round((amountDue - splitCashAmount + Number.EPSILON) * 100) / 100;

  const checkout = async () => {
    if (!cart.length || !session?._id || !outletCode) return;
    if (discountExceedsLimit) return toast.error(`Discount exceeds your ${discountLimitPercent}% limit (${formatPKR(maxDiscountAmount)} maximum).`);
    if (discountAmount >= total) return toast.error('Discount must be less than the sale subtotal.');
    const cashValue = paymentMethod === 'split' ? splitCashAmount : paymentMethod === 'cash' ? Number(cashTendered || amountDue) : 0;
    if (paymentMethod === 'cash' && cashValue < amountDue) return toast.error('Cash received is less than the amount due.');
    if (paymentMethod === 'split' && (splitCashAmount < 0 || splitCardAmount < 0)) return toast.error('Enter a valid cash portion.');
    const queuedAt = new Date().toISOString();
    const clientTransactionId = makeId();
    const sale = {
      clientTransactionId,
      cashierId,
      sessionId: String(session._id),
      outletCode,
      queuedAt,
      paymentMethod,
      cashTendered: paymentMethod === 'split' ? Number(cashTendered || splitCashAmount) : cashValue,
      cashAmount: paymentMethod === 'split' ? splitCashAmount : undefined,
      cardAmount: paymentMethod === 'split' ? splitCardAmount : undefined,
      discountAmount,
      discountMode,
      discountPercent,
      cardLast4: cardLast4 || undefined,
      totalAmount: amountDue,
      items: cart.map((item) => ({
        variantId: item.variantId,
        shopifyLocationId: item.shopifyLocationId,
        quantity: item.qty,
        unitPriceSnapshot: item.unitPriceSnapshot,
      })),
    };
    const showReceipt = ({ transactionNumber, status = 'completed', offline = false } = {}) => {
      const cashAmount = paymentMethod === 'split' ? splitCashAmount : paymentMethod === 'cash' ? amountDue : 0;
      const cardAmount = paymentMethod === 'split' ? splitCardAmount : paymentMethod === 'card' ? amountDue : 0;
      void requestReceiptPrint({
        outletName: session?.outlet?.name || 'Boutique outlet',
        cashierName: cashier?.name || 'Cashier',
        transaction: {
          transactionNumber,
          clientTransactionId,
          createdAt: queuedAt,
          status,
          offline,
          orderType: 'retail',
          paymentMethod,
          subtotal: total,
          totalAmount: amountDue,
          taxAmount: 0,
          serviceChargeAmount: 0,
          discountAmount,
          discountMode,
          discountPercent,
          cashTendered: Number(sale.cashTendered || 0),
          cashAmount,
          cardAmount,
          changeGiven: Math.max(0, Number(sale.cashTendered || 0) - cashAmount),
          storeCreditRedeemed: 0,
          items: cart.map((item) => ({
            name: item.name,
            sku: item.sku,
            barcode: item.barcode,
            qty: item.qty,
            unitPrice: item.unitPriceSnapshot,
            lineTotal: item.unitPriceSnapshot * item.qty,
          })),
        },
      });
    };
    setBusy(true);
    try {
      if (!navigator.onLine) throw Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' });
      const response = await api.post('/api/pos/retail-sale', sale);
      const transaction = response.data?.data?.transaction;
      toast.success(`Sale recorded · ${transaction?.transactionNumber || formatPKR(total)}`);
      showReceipt({ transactionNumber: transaction?.transactionNumber, status: transaction?.status || 'completed' });
      setCart([]);
      setDiscountValue('');
      setCashTendered('');
      setSplitCash('');
      setCardLast4('');
      await refreshCatalog(true);
    } catch (error) {
      const status = error.response?.status;
      if (status && status < 500) {
        toast.error(error.response?.data?.message || error.response?.data?.error || 'Sale could not be completed. Refresh stock and retry.');
      } else {
        const next = [...queue, sale];
        persistQueue(next);
        setCatalog((items) => {
          const updated = items.map((variant) => {
            const sold = cart.find((line) => line.variantId === variant._id && line.shopifyLocationId === variant.selectedLocationId);
            return sold && variant.tracked !== false ? { ...variant, available: Number(variant.available || 0) - sold.qty } : variant;
          });
          localStorage.setItem(catalogKey(outletId), JSON.stringify({ items: updated, fetchedAt: Date.now() }));
          return updated;
        });
        toast('Sale stored on this terminal and queued to sync.', { icon: '📦', duration: 5000 });
        showReceipt({ status: 'pending', offline: true });
        setCart([]);
        setCashTendered('');
        setSplitCash('');
        setCardLast4('');
        setStoreCreditCode('');
        setStoreCreditAmount('');
        setStoreCreditBalance(null);
      }
    } finally {
      setBusy(false);
      searchRef.current?.focus();
    }
  };

  return (
    <div className="grid min-h-[calc(100vh-4.5rem)] gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_390px]">
      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input ref={searchRef} autoFocus className={`${inputCls} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={scanOrSearch} placeholder="Search products or scan a barcode" />
            <Barcode size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <button onClick={() => refreshCatalog(true)} disabled={!online || busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={15} className={busy ? 'animate-spin' : ''} />Refresh</button>
        </div>
        {!!categories.length && <div className="-mt-1 mb-4 overflow-x-auto pb-1" aria-label="Filter products by category">
          <div className="flex min-w-max items-center gap-2">
            <button type="button" onClick={() => setSelectedCategory('all')} aria-pressed={selectedCategory === 'all'} className={`rounded-full border px-3.5 py-2 text-xs font-bold transition ${selectedCategory === 'all' ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700'}`}>All <span className={`ml-1 ${selectedCategory === 'all' ? 'text-indigo-100' : 'text-slate-400'}`}>{catalog.length}</span></button>
            {categories.map(([category, count]) => <button key={category} type="button" onClick={() => setSelectedCategory(category)} aria-pressed={selectedCategory === category} className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition ${selectedCategory === category ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700'}`}>{category}<span className={`ml-1.5 ${selectedCategory === category ? 'text-indigo-100' : 'text-slate-400'}`}>{count}</span></button>)}
          </div>
        </div>}
        {!online && <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><WifiOff size={16} />Offline mode uses saved prices and stock. Shopify-linked stock conflicts will be listed for manager review after reconnect.</div>}
        {online && lastRefresh && <p className="mb-3 text-xs text-slate-500">Stock refreshed {lastRefresh.toLocaleTimeString()} · {catalog.length} variants</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {filteredCatalog.map((variant) => {
            const options = (variant.options || []).map((option) => option.value).filter((value) => value && value !== 'Default Title').join(' / ');
            const cartLine = cart.find((line) => line.variantId === variant._id && line.shopifyLocationId === (variant.selectedLocationId || ''));
            const atStockLimit = online && variant.tracked !== false && Number(cartLine?.qty || 0) >= Math.max(0, Number(variant.available || 0));
            return <button key={variant._id} onClick={() => addToCart(variant)} disabled={atStockLimit} title={atStockLimit ? `Only ${Number(variant.available || 0)} available` : undefined} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50">
              <div className="aspect-[4/3] bg-slate-100">{variant.product?.imageUrl && <img src={variant.product.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}</div>
              <div className="p-3">
                <p className="line-clamp-2 min-h-10 text-sm font-semibold text-slate-900">{variantName(variant)}</p>
                {options && <p className="mt-1 truncate text-xs text-slate-500">{options}</p>}
                <div className="mt-2 flex items-end justify-between gap-2"><span className="font-bold text-indigo-700">{formatPKR(variant.price)}</span><span className={`text-[11px] ${Number(variant.available) > 0 ? 'text-slate-500' : 'font-semibold text-amber-700'}`}>{variant.tracked === false ? 'Untracked' : `${variant.available} in stock`}</span></div>
                {variant.sku && <p className="mt-1 truncate text-[10px] text-slate-400">SKU {variant.sku}</p>}
              </div>
            </button>;
          })}
          {!filteredCatalog.length && <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">{catalog.length ? 'No matching products.' : 'No saved variants. Add a manual product or connect Shopify to sync the catalog.'}</div>}
        </div>
      </section>

      <aside className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/60 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><ShoppingBag size={19} /></span><div><h2 className="text-base font-extrabold tracking-tight text-slate-900">Current sale</h2><p className="mt-0.5 text-xs text-slate-500">{totalItems} item{totalItems === 1 ? '' : 's'} across {cart.length} line{cart.length === 1 ? '' : 's'}</p></div></div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">PKR</span>
        </div>
        <div className="flex-1 divide-y divide-slate-100 overflow-y-auto px-4">
          {cart.map((item) => <div key={item.key} className="py-3.5">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="line-clamp-2 text-sm font-bold leading-5 text-slate-900">{item.name}</p><p className="mt-1 truncate text-[11px] text-slate-500">{item.sku || item.barcode || 'No SKU'} <span className="px-1 text-slate-300">·</span> {formatPKR(item.unitPriceSnapshot)} each</p></div><button onClick={() => setCart((current) => current.filter((line) => line.key !== item.key))} className="-mr-1 rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${item.name}`}><Trash2 size={15} /></button></div>
            <div className="mt-3 flex items-center justify-between"><div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1"><button onClick={() => setCart((current) => current.map((line) => line.key === item.key ? { ...line, qty: Math.max(1, line.qty - 1) } : line))} className="grid h-7 w-7 place-items-center rounded-md text-slate-600 transition hover:bg-white hover:text-indigo-700" aria-label={`Decrease ${item.name} quantity`}><Minus size={13} /></button><span className="min-w-7 text-center text-xs font-bold tabular-nums">{item.qty}</span><button onClick={() => setCart((current) => current.map((line) => line.key === item.key && (!online || !line.tracked || line.qty < line.availableSnapshot) ? { ...line, qty: line.qty + 1 } : line))} disabled={online && item.tracked && item.qty >= item.availableSnapshot} title={online && item.tracked && item.qty >= item.availableSnapshot ? `Only ${item.availableSnapshot} available` : undefined} className="grid h-7 w-7 place-items-center rounded-md text-slate-600 transition hover:bg-white hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Increase ${item.name} quantity`}><Plus size={13} /></button></div><span className="text-sm font-extrabold tabular-nums text-slate-900">{formatPKR(item.unitPriceSnapshot * item.qty)}</span></div>
          </div>)}
          {!cart.length && <div className="grid min-h-56 place-items-center py-8 text-center"><div><span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><ShoppingBag size={22} /></span><p className="text-sm font-semibold text-slate-600">Your sale is empty</p><p className="mt-1 text-xs text-slate-400">Scan a barcode or choose a product to begin.</p></div></div>}
        </div>
        <div className="space-y-3 border-t border-slate-200 bg-slate-50/70 p-4">
          <div className="space-y-1.5 text-sm"><div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="tabular-nums">{formatPKR(total)}</span></div>{discountAmount > 0 && <div className="flex justify-between text-rose-600"><span>Discount{discountMode === 'percent' ? ` (${discountPercent}%)` : ''}</span><span className="tabular-nums">− {formatPKR(discountAmount)}</span></div>}</div>
          <div className="flex items-end justify-between rounded-xl bg-slate-900 px-4 py-3 text-white"><span className="text-xs font-semibold text-slate-300">Amount due</span><span className="text-xl font-extrabold tracking-tight tabular-nums">{formatPKR(amountDue)}</span></div>
          {canDiscount && <section className="space-y-2 rounded-xl border border-indigo-100 bg-white p-3" aria-label="Apply sale discount">
            <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-xs font-bold text-slate-700"><Tag size={14} className="text-indigo-600" />Apply discount</span><span className="text-[10px] font-semibold text-slate-400">Up to {discountLimitPercent}% · {formatPKR(maxDiscountAmount)}</span></div>
            <div className="grid grid-cols-[auto_1fr_auto] gap-2">
              <div className="flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Discount type">
                <button type="button" onClick={() => { setDiscountMode('percent'); setDiscountValue(''); }} aria-pressed={discountMode === 'percent'} className={`grid h-9 w-10 place-items-center rounded-md text-xs font-bold ${discountMode === 'percent' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`} aria-label="Percentage discount"><Percent size={15} /></button>
                <button type="button" onClick={() => { setDiscountMode('amount'); setDiscountValue(''); }} aria-pressed={discountMode === 'amount'} className={`rounded-md px-2 text-xs font-bold ${discountMode === 'amount' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`} aria-label="Rupee discount">Rs</button>
              </div>
              <label className="sr-only" htmlFor="retail-sale-discount">{discountMode === 'percent' ? 'Discount percentage' : 'Discount amount in rupees'}</label>
              <input id="retail-sale-discount" className={`${inputCls} py-2`} type="number" min="0" max={discountMode === 'percent' ? discountLimitPercent : maxDiscountAmount} step={discountMode === 'percent' ? '0.01' : '1'} value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} placeholder={discountMode === 'percent' ? '0%' : 'PKR 0'} disabled={!total} />
              <button type="button" onClick={() => setDiscountValue('')} disabled={!discountValue} className="rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-500 disabled:opacity-40">Clear</button>
            </div>
            <p className={`text-[11px] ${discountExceedsLimit ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>{discountExceedsLimit ? `Discount is above your limit. Maximum is ${formatPKR(maxDiscountAmount)}.` : discountAmount > 0 ? `Discount ${formatPKR(discountAmount)} · ${formatPKR(amountDue)} due` : `Your Role Management limit is ${discountLimitPercent}%.`}</p>
          </section>}
          <FloatingSelect label="Payment method" options={[{ value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' }, { value: 'online-transfer', label: 'Online transfer' }, { value: 'split', label: 'Split cash + card' }]} value={paymentMethod} onChange={setPaymentMethod} searchable={false} containerClassName="text-xs font-semibold text-slate-600" />
          {paymentMethod === 'cash' && <div className="grid grid-cols-[1fr_auto] items-end gap-2"><label className="block text-xs font-semibold text-slate-600">Cash received<input className={`${inputCls} mt-1 py-2.5`} type="number" min={amountDue} step="0.01" value={cashTendered} onChange={(event) => setCashTendered(event.target.value)} placeholder={String(amountDue)} /></label>{cashChange > 0 && <div className="pb-2 text-right"><p className="text-[10px] font-semibold uppercase text-slate-400">Change</p><p className="text-xs font-bold text-emerald-700">{formatPKR(cashChange)}</p></div>}</div>}
          {paymentMethod === 'split' && <div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-slate-600">Cash portion<input className={`${inputCls} mt-1 py-2`} type="number" min="0" max={amountDue} step="0.01" value={splitCash} onChange={(event) => setSplitCash(event.target.value)} /></label><label className="text-xs font-semibold text-slate-600">Card portion<input className={`${inputCls} mt-1 bg-slate-100 py-2`} type="number" readOnly value={splitCardAmount} /></label></div>}
          {(paymentMethod === 'card' || paymentMethod === 'split') && <label className="block text-xs font-semibold text-slate-600">Card last four <span className="font-normal text-slate-400">(optional)</span><input className={`${inputCls} mt-1 py-2.5`} inputMode="numeric" maxLength={4} value={cardLast4} onChange={(event) => setCardLast4(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" /></label>}
          {paymentMethod === 'split' && <label className="block text-xs font-semibold text-slate-600">Cash received<input className={`${inputCls} mt-1 py-2.5`} type="number" min={splitCashAmount} step="0.01" value={cashTendered} onChange={(event) => setCashTendered(event.target.value)} placeholder={String(splitCashAmount)} /></label>}
          <button onClick={checkout} disabled={!cart.length || busy || discountExceedsLimit || amountDue <= 0} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}{busy ? 'Saving sale…' : online ? 'Complete sale' : 'Save offline sale'}<span className="ml-auto tabular-nums">{formatPKR(amountDue)}</span></button>
          {queue.some((item) => item.syncError) && <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Some offline sales need attention. {queue.find((item) => item.syncError)?.syncError}</div>}
          {!!queue.length && <button onClick={syncQueue} disabled={!online || busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={14} />Sync {queue.length} queued sale{queue.length === 1 ? '' : 's'}</button>}
        </div>
      </aside>
    </div>
  );
};

export default BoutiquePOSScreen;

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw, RotateCw, Save, ShoppingBag, Webhook } from 'lucide-react';
import toast from 'react-hot-toast';
import FloatingSelect from '../../components/UI/FloatingSelect';
import Pagination from '../../components/UI/Pagination';
import useQueryState from '../../hooks/useQueryState';
import {
  connectShopify,
  getShopifyEvents,
  getShopifyLocations,
  getShopifySettings,
  registerShopifyWebhooks,
  retryShopifyEvent,
  saveShopifyLocationMappings,
  syncShopifyCatalog,
  reconcileShopifyOrders,
} from '../../api/shopifyApi';

const messageOf = (error) => error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Request failed.';
const dateText = (value) => value ? new Date(value).toLocaleString() : '—';
const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

const ShopifySettings = () => {
  const [connection, setConnection] = useState(null);
  const [outlets, setOutlets] = useState([]);
  const [locations, setLocations] = useState([]);
  const [mappings, setMappings] = useState({});
  const [onlineOrderOutlet, setOnlineOrderOutlet] = useState('');
  const [events, setEvents] = useState([]);
  const [backgroundTasks, setBackgroundTasks] = useState([]);
  const [webhookPage, setWebhookPage] = useQueryState('webhookPage', 1);
  const [webhookPageInfo, setWebhookPageInfo] = useState({ total: 0, pages: 1, pageSize: 50 });
  const [credentials, setCredentials] = useState({ shopDomain: '', clientId: '', clientSecret: '' });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [syncClock, setSyncClock] = useState(Date.now());

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const settingsResponse = await getShopifySettings();
      const data = settingsResponse.data?.data || {};
      const nextConnection = data.connection || {};
      setConnection(nextConnection);
      setBackgroundTasks(data.backgroundTasks || []);
      setOutlets(data.outlets || []);
      setOnlineOrderOutlet(String(nextConnection.onlineOrderOutlet || ''));
      setMappings(Object.fromEntries((nextConnection.locationMappings || []).map((entry) => [entry.shopifyLocationId, String(entry.outlet)])));
      if (nextConnection.shopDomain) setCredentials((current) => ({ ...current, shopDomain: current.shopDomain || nextConnection.shopDomain }));
    } catch (requestError) {
      setError(messageOf(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const response = await getShopifyEvents({ page: webhookPage, limit: 50 });
      const eventData = response.data?.data || {};
      setEvents(Array.isArray(eventData) ? eventData : (eventData.items || []));
      setWebhookPageInfo({ total: eventData.total || 0, pages: Math.max(1, eventData.totalPages || 1), pageSize: eventData.pageSize || 50 });
      if (eventData.page && eventData.page !== webhookPage) setWebhookPage(eventData.page);
    } catch (requestError) {
      setError(messageOf(requestError));
    }
  }, [webhookPage, setWebhookPage]);

  const refresh = useCallback(async () => Promise.all([loadSettings(), loadEvents()]), [loadSettings, loadEvents]);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { loadEvents(); }, [loadEvents]);

  const hasBackgroundWork = backgroundTasks.some((task) => ['pending', 'processing'].includes(task.status));
  useEffect(() => {
    if (!hasBackgroundWork && connection?.catalogSync?.status !== 'running') return undefined;
    let active = true;
    const pollShopifyWork = async () => {
      try {
        const response = await getShopifySettings();
        if (!active) return;
        const data = response.data?.data || {};
        setConnection(data.connection || null);
        setBackgroundTasks(data.backgroundTasks || []);
      } catch { /* Keep showing the last progress update if a poll is temporarily unavailable. */ }
    };
    void pollShopifyWork();
    const pollTimer = setInterval(pollShopifyWork, 2000);
    const clockTimer = setInterval(() => setSyncClock(Date.now()), 1000);
    return () => {
      active = false;
      clearInterval(pollTimer);
      clearInterval(clockTimer);
    };
  }, [hasBackgroundWork, connection?.catalogSync?.status]);

  const runAction = async (key, action, successText, { refreshAfter = true } = {}) => {
    setWorking(key);
    setError('');
    try {
      const response = await action();
      if (response?.data?.success === false) throw new Error(response.data.error || response.data.message || 'Shopify needs attention.');
      const task = response?.data?.data?.task;
      if (task) {
        setBackgroundTasks((current) => [task, ...current.filter((item) => item._id !== task._id)].slice(0, 20));
        if (task.type === 'catalog-sync') setConnection((current) => ({
          ...current,
          catalogSync: { status: 'running', startedAt: task.createdAt, finishedAt: null, productsWritten: 0, variantsWritten: 0, pages: 0, stage: 'Queued for background processing…', error: '' },
        }));
      }
      if (successText) toast.success(successText);
      return response;
    } catch (requestError) {
      const message = messageOf(requestError);
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setWorking('');
      if (refreshAfter) await refresh();
    }
  };

  const handleConnect = async (event) => {
    event.preventDefault();
    const response = await runAction('connect', () => connectShopify({ ...credentials, onlineOrderOutlet }), 'Shopify setup saved.');
    if (response?.data?.success) setCredentials((current) => ({ ...current, clientId: '', clientSecret: '' }));
  };

  const loadLocations = async () => {
    const response = await runAction('locations', getShopifyLocations, 'Shopify locations loaded.');
    if (response) setLocations(response.data?.data || []);
  };

  const saveMappings = () => runAction('mappings', () => saveShopifyLocationMappings({
    onlineOrderOutlet,
    locationMappings: locations.filter((location) => mappings[location.id]).map((location) => ({
      shopifyLocationId: location.id,
      name: location.name,
      outlet: mappings[location.id],
    })),
  }), 'Location mappings saved.');

  const retry = (id) => runAction(`retry:${id}`, () => retryShopifyEvent(id), 'Event queued for retry.');
  const connected = connection?.status === 'connected';
  const credentialsConfiguredForShop = Boolean(connection?.shopDomain && connection?.status !== 'disconnected');
  const credentialsRequired = !credentialsConfiguredForShop;
  const catalogSync = connection?.catalogSync || {};
  const catalogSyncRunning = working === 'sync' || catalogSync.status === 'running';
  const catalogSyncElapsed = catalogSync.startedAt
    ? Math.max(0, Math.floor((syncClock - new Date(catalogSync.startedAt).getTime()) / 1000))
    : 0;

  if (loading && !connection) return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading Shopify settings…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-5">
        <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><ShoppingBag size={20} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Shopify connection</h2>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${connected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {connected ? 'Connected' : connection?.status === 'attention' ? 'Needs attention' : 'Not connected'}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">Use local finished products before connecting Shopify. During a later catalog sync, a complete exact SKU match links the Shopify IDs to the existing local variants and preserves BOM references.</p>
          {connection?.shopDomain && <p className="mt-2 text-sm font-medium text-gray-800">{connection.shopDomain} · {connection.currency || 'PKR'}</p>}
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
            <span>Products synced: {dateText(connection?.lastCatalogSyncAt)}</span>
            <span>Inventory synced: {dateText(connection?.lastInventorySyncAt)}</span>
            <span>Online orders synced: {dateText(connection?.lastOrderSyncAt)}</span>
          </div>
        </div>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle size={18} className="mt-0.5 shrink-0" />{error}</div>}
      {connection?.lastError && !error && <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle size={18} className="mt-0.5 shrink-0" />{connection.lastError}</div>}

      <form onSubmit={handleConnect} className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900">Store credentials</h3>
        <p className="mt-1 text-sm text-gray-500">Connect this boutique’s Shopify app. Credentials are encrypted in this boutique’s database. Re-enter the client ID and secret only when connecting a new app or replacing credentials.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-medium text-gray-700">Shop domain
            <input className={inputClass} autoComplete="url" placeholder="your-store.myshopify.com" value={credentials.shopDomain} onChange={(event) => setCredentials({ ...credentials, shopDomain: event.target.value })} required />
          </label>
          <label className="text-sm font-medium text-gray-700">Shopify app client ID
            <input className={inputClass} autoComplete="off" placeholder={credentialsConfiguredForShop ? 'Saved securely — leave blank to keep' : 'Enter app client ID'} value={credentials.clientId} onChange={(event) => setCredentials({ ...credentials, clientId: event.target.value })} required={credentialsRequired} />
          </label>
          <label className="text-sm font-medium text-gray-700">Shopify app client secret
            <input className={inputClass} type="password" autoComplete="new-password" placeholder={credentialsConfiguredForShop ? 'Saved securely — leave blank to keep' : 'Enter app client secret'} value={credentials.clientSecret} onChange={(event) => setCredentials({ ...credentials, clientSecret: event.target.value })} required={credentialsRequired} />
          </label>
          <FloatingSelect label="Outlet for Shopify online orders" options={outlets.map((outlet) => ({ value: String(outlet._id), label: outlet.name, meta: outlet.code || '' }))} value={onlineOrderOutlet} onChange={setOnlineOrderOutlet} placeholder="Select an outlet" containerClassName="text-sm font-medium text-gray-700" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button disabled={!!working} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"><Save size={16} />{working === 'connect' ? 'Connecting…' : 'Save and connect'}</button>
          <span className="text-xs text-gray-500">The Shopify store currency must be PKR.</span>
        </div>
      </form>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold text-gray-900">Locations and outlets</h3><p className="mt-1 text-sm text-gray-500">Map every Shopify stock location to the outlet that holds those finished goods.</p></div>
          <button onClick={loadLocations} disabled={!connection?.shopDomain || !!working} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"><RefreshCw size={15} />Load Shopify locations</button>
        </div>
        {locations.length > 0 && <div className="mt-4 space-y-3">
          {locations.map((location) => <label key={location.id} className="grid items-center gap-2 text-sm md:grid-cols-[1fr_260px]">
            <span className="font-medium text-gray-800">{location.name}</span>
            <FloatingSelect label={`Map ${location.name}`} options={[{ value: '', label: 'Do not map' }, ...outlets.map((outlet) => ({ value: String(outlet._id), label: outlet.name, meta: outlet.code || '' }))]} value={mappings[location.id] || ''} onChange={(value) => setMappings({ ...mappings, [location.id]: value })} placeholder="Do not map" />
          </label>)}
          <button onClick={saveMappings} disabled={!!working} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"><Save size={15} />Save mappings</button>
        </div>}
        {connection?.locationMappings?.length > 0 && locations.length === 0 && <p className="mt-3 text-sm text-gray-600">{connection.locationMappings.length} location mapping(s) saved.</p>}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold text-gray-900">Catalog and webhooks</h3><p className="mt-1 text-sm text-gray-500">Webhooks queue changes for background processing. Initial import pulls current products, variants, barcodes, costs, and location stock.</p></div>
          <Webhook size={19} className="text-gray-500" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => runAction('webhooks', registerShopifyWebhooks, 'Webhook registration queued.', { refreshAfter: false })} disabled={!connection?.shopDomain || !!working} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{working === 'webhooks' ? 'Queueing…' : 'Register webhooks'}</button>
          <button onClick={() => runAction('sync', syncShopifyCatalog, 'Catalog sync queued in the background.', { refreshAfter: false })} disabled={!connected || !!working || catalogSync.status === 'running'} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"><RefreshCw size={15} className={catalogSyncRunning ? 'animate-spin' : ''} />{catalogSyncRunning ? 'Syncing…' : 'Sync catalog now'}</button>
          <button onClick={() => runAction('orders', reconcileShopifyOrders, 'Recent orders queued for import.', { refreshAfter: false })} disabled={!connected || !!working} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{working === 'orders' ? 'Queueing orders…' : 'Sync recent orders (60 days)'}</button>
          <button onClick={refresh} disabled={!!working} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Refresh status</button>
        </div>
        {catalogSyncRunning && <div role="status" aria-live="polite" className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="font-semibold text-indigo-950">Shopify catalog sync is in progress</p>
            <p className="text-xs font-medium text-indigo-700">{Math.floor(catalogSyncElapsed / 60)}m {catalogSyncElapsed % 60}s elapsed</p>
          </div>
          <p className="mt-1 text-sm text-indigo-800">{catalogSync.stage || 'Connecting to Shopify…'}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-indigo-100"><div className="h-full w-1/3 animate-[shopify-progress_1.4s_ease-in-out_infinite] rounded-full bg-indigo-600" /></div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-indigo-800">
            <span>{Number(catalogSync.productsWritten || 0).toLocaleString()} products imported</span>
            <span>{Number(catalogSync.variantsWritten || 0).toLocaleString()} variants updated</span>
            <span>{Number(catalogSync.pages || 0).toLocaleString()} product pages completed</span>
          </div>
          <p className="mt-2 text-xs text-indigo-700">Large catalogs can take several minutes. You can keep this page open while the counts update.</p>
        </div>}
        {!catalogSyncRunning && catalogSync.status === 'complete' && catalogSync.finishedAt && <p role="status" className="mt-3 text-sm text-emerald-700">Last catalog sync completed at {dateText(catalogSync.finishedAt)} · {Number(catalogSync.productsWritten || 0).toLocaleString()} products and {Number(catalogSync.variantsWritten || 0).toLocaleString()} variants updated.</p>}
        {!catalogSyncRunning && catalogSync.status === 'failed' && <p role="alert" className="mt-3 text-sm text-red-700">Last catalog sync failed: {catalogSync.error || 'See the error above for details.'}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {(connection?.webhookSubscriptions || []).map((item) => <span key={item.topic} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800"><CheckCircle2 size={13} />{item.topic.replaceAll('_', ' ').toLowerCase()}</span>)}
          {!connection?.webhookSubscriptions?.length && <span className="text-sm text-amber-800">No webhook subscriptions are registered.</span>}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-gray-900">Background Shopify work</h3><p className="mt-1 text-sm text-gray-500">Product changes, catalog imports, order imports, and webhook setup continue while you use the app.</p></div>{hasBackgroundWork && <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">Updating automatically</span>}</div>
        <div className="mt-4 divide-y divide-gray-100">
          {backgroundTasks.map((task) => <div key={task._id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
            <div><p className="text-sm font-medium text-gray-800">{({ 'catalog-sync': 'Catalog sync', 'product-update': 'Product update', 'barcode-update': 'Barcode update', 'order-reconcile': 'Recent order import', 'webhook-register': 'Webhook registration' })[task.type] || 'Shopify update'}</p><p className="text-xs text-gray-500">Started {dateText(task.startedAt || task.createdAt)}{task.attempts > 0 ? ` · Attempt ${task.attempts}` : ''}</p>{task.lastError && <p className="mt-1 text-xs text-red-700">{task.lastError}</p>}</div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${task.status === 'complete' ? 'bg-emerald-100 text-emerald-800' : task.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-indigo-100 text-indigo-800'}`}>{task.status === 'pending' ? 'Queued' : task.status === 'processing' ? 'In progress' : task.status}</span>
          </div>)}
          {!backgroundTasks.length && <p className="py-2 text-sm text-gray-500">No background Shopify tasks yet.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-gray-900">Webhook event history</h3><p className="mt-1 text-sm text-gray-500">Review failed events and stock conflicts. Retried events are processed by the Shopify worker.</p></div><button onClick={refresh} disabled={!!working} className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-50" aria-label="Refresh event history"><RefreshCw size={15} /></button></div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500"><tr><th className="py-2 pr-3">Event</th><th className="py-2 pr-3">Resource</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Received</th><th className="py-2 pr-3">Detail</th><th className="py-2">Action</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {events.map((item) => <tr key={item._id} className="align-top"><td className="py-3 pr-3 font-medium text-gray-800">{item.topic}</td><td className="py-3 pr-3 text-gray-600">{item.resourceId || '—'}</td><td className="py-3 pr-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === 'processed' ? 'bg-emerald-100 text-emerald-800' : ['failed', 'conflict'].includes(item.status) ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{item.status}</span></td><td className="py-3 pr-3 text-gray-500">{dateText(item.createdAt)}</td><td className="max-w-sm py-3 pr-3 text-xs text-red-700">{item.lastError || '—'}</td><td className="py-3">{['failed', 'conflict'].includes(item.status) && <button onClick={() => retry(item._id)} disabled={!!working} className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"><RotateCw size={13} />Retry</button>}</td></tr>)}
              {!events.length && <tr><td colSpan="6" className="py-8 text-center text-gray-500">No webhook events received yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination
          page={webhookPage}
          pages={webhookPageInfo.pages}
          total={webhookPageInfo.total}
          pageSize={webhookPageInfo.pageSize}
          hasPrev={webhookPage > 1}
          hasNext={webhookPage < webhookPageInfo.pages}
          prev={() => setWebhookPage(Math.max(1, webhookPage - 1))}
          next={() => setWebhookPage(Math.min(webhookPageInfo.pages, webhookPage + 1))}
          goTo={setWebhookPage}
        />
      </section>
    </div>
  );
};

export default ShopifySettings;

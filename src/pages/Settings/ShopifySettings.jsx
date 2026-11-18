import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Barcode, CheckCircle2, RefreshCw, RotateCw, Save, Search, ShoppingBag, Webhook } from 'lucide-react';
import toast from 'react-hot-toast';
import FloatingSelect from '../../components/UI/FloatingSelect';
import {
  connectShopify,
  getShopifyEvents,
  getShopifyLocations,
  getShopifySettings,
  registerShopifyWebhooks,
  retryShopifyEvent,
  getShopifyInventoryConflicts,
  retryShopifyInventoryMovement,
  searchRetailCatalog,
  updateRetailBarcode,
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
  const [inventoryConflicts, setInventoryConflicts] = useState([]);
  const [catalogMatches, setCatalogMatches] = useState([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [barcodeDrafts, setBarcodeDrafts] = useState({});
  const [credentials, setCredentials] = useState({ shopDomain: '', clientId: '', clientSecret: '' });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [settingsResponse, eventsResponse, conflictsResponse] = await Promise.all([getShopifySettings(), getShopifyEvents(), getShopifyInventoryConflicts()]);
      const data = settingsResponse.data?.data || {};
      const nextConnection = data.connection || {};
      setConnection(nextConnection);
      setOutlets(data.outlets || []);
      setOnlineOrderOutlet(String(nextConnection.onlineOrderOutlet || ''));
      setMappings(Object.fromEntries((nextConnection.locationMappings || []).map((entry) => [entry.shopifyLocationId, String(entry.outlet)])));
      setEvents(eventsResponse.data?.data || []);
      setInventoryConflicts(conflictsResponse.data?.data || []);
      if (nextConnection.shopDomain) setCredentials((current) => ({ ...current, shopDomain: current.shopDomain || nextConnection.shopDomain }));
    } catch (requestError) {
      setError(messageOf(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const runAction = async (key, action, successText) => {
    setWorking(key);
    setError('');
    try {
      const response = await action();
      if (response?.data?.success === false) throw new Error(response.data.error || response.data.message || 'Shopify needs attention.');
      if (successText) toast.success(successText);
      return response;
    } catch (requestError) {
      const message = messageOf(requestError);
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setWorking('');
      await refresh();
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
  const retryMovement = (id) => runAction(`movement:${id}`, () => retryShopifyInventoryMovement(id), 'Inventory update queued for retry.');
  const findCatalog = async (event) => {
    event.preventDefault();
    setWorking('catalog-search');
    try {
      const response = await searchRetailCatalog(catalogSearch.trim());
      const matches = response.data?.data?.items || response.data?.data || [];
      setCatalogMatches(matches);
      setBarcodeDrafts(Object.fromEntries(matches.map((item) => [item._id, item.barcode || ''])));
    } catch (requestError) { setError(messageOf(requestError)); }
    finally { setWorking(''); }
  };
  const saveBarcode = (variantId) => runAction(`barcode:${variantId}`, () => updateRetailBarcode(variantId, barcodeDrafts[variantId] || ''), 'Barcode saved.');
  const connected = connection?.status === 'connected';
  const credentialsConfiguredForShop = connection?.credentialsConfigured && connection.shopDomain === credentials.shopDomain;
  const credentialsRequired = !credentialsConfiguredForShop;

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="font-semibold text-gray-900">Edit product barcodes</h3><p className="mt-1 text-sm text-gray-500">Local variants save here; Shopify-linked variants update Shopify when connected.</p></div><Barcode size={19} className="text-gray-500" />
        </div>
        <form onSubmit={findCatalog} className="mt-4 flex gap-2">
          <input className={inputClass.replace('mt-1 ', '')} value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Product name, SKU, or barcode" aria-label="Search retail catalog" />
          <button disabled={!!working || !catalogSearch.trim()} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Search size={15} />Search</button>
        </form>
        {catalogMatches.length > 0 && <div className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
          {catalogMatches.map((item) => <div key={item._id} className="grid gap-2 p-3 sm:grid-cols-[1fr_240px_auto] sm:items-center">
            <div className="min-w-0"><p className="truncate text-sm font-medium text-gray-800">{item.product?.title || item.title}</p><p className="truncate text-xs text-gray-500">{item.sku || 'No SKU'}{item.title && item.title !== 'Default Title' ? ` · ${item.title}` : ''}</p></div>
            <input className={inputClass.replace('mt-1 ', '')} value={barcodeDrafts[item._id] ?? ''} onChange={(event) => setBarcodeDrafts((current) => ({ ...current, [item._id]: event.target.value }))} placeholder="Enter barcode" aria-label={`Barcode for ${item.product?.title || item.title}`} />
            <button onClick={() => saveBarcode(item._id)} disabled={!!working} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50">{working === `barcode:${item._id}` ? 'Saving…' : 'Save barcode'}</button>
          </div>)}
        </div>}
        {catalogMatches.length === 0 && catalogSearch && <p className="mt-3 text-xs text-gray-500">Search the imported products to edit a barcode.</p>}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div><h3 className="font-semibold text-gray-900">Inventory updates needing review</h3><p className="mt-1 text-sm text-gray-500">These local movements could not yet be applied to Shopify. Review the quantity difference before retrying.</p></div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500"><tr><th className="py-2 pr-3">Product</th><th className="py-2 pr-3">Outlet</th><th className="py-2 pr-3">Change</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Detail</th><th className="py-2">Action</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {inventoryConflicts.map((movement) => <tr key={movement._id} className="align-top"><td className="py-3 pr-3"><p className="font-medium text-gray-800">{movement.variant?.product?.title || movement.variant?.title || 'Product'}</p><p className="text-xs text-gray-500">{movement.variant?.sku || movement.variant?.barcode || 'No SKU'}</p></td><td className="py-3 pr-3 text-gray-600">{movement.outlet?.name || '—'}</td><td className="py-3 pr-3 font-semibold">{movement.quantityDelta > 0 ? '+' : ''}{movement.quantityDelta}</td><td className="py-3 pr-3"><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">{movement.syncStatus}</span></td><td className="max-w-sm py-3 pr-3 text-xs text-amber-900">{movement.syncError || '—'}</td><td className="py-3"><button onClick={() => retryMovement(movement._id)} disabled={!!working} className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50"><RotateCw size={13} />Retry</button></td></tr>)}
              {!inventoryConflicts.length && <tr><td colSpan="6" className="py-8 text-center text-gray-500">No inventory movements need review.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

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
          <button onClick={() => runAction('webhooks', registerShopifyWebhooks, 'Webhook subscriptions registered.')} disabled={!connection?.shopDomain || !!working} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{working === 'webhooks' ? 'Registering…' : 'Register webhooks'}</button>
          <button onClick={() => runAction('sync', syncShopifyCatalog, 'Catalog sync completed.')} disabled={!connected || !!working} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"><RefreshCw size={15} />{working === 'sync' ? 'Syncing…' : 'Sync catalog now'}</button>
          <button onClick={() => runAction('orders', reconcileShopifyOrders, 'Recent orders queued for import.')} disabled={!connected || !!working} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{working === 'orders' ? 'Queueing orders…' : 'Sync recent orders (60 days)'}</button>
          <button onClick={refresh} disabled={!!working} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Refresh status</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(connection?.webhookSubscriptions || []).map((item) => <span key={item.topic} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800"><CheckCircle2 size={13} />{item.topic.replaceAll('_', ' ').toLowerCase()}</span>)}
          {!connection?.webhookSubscriptions?.length && <span className="text-sm text-amber-800">No webhook subscriptions are registered.</span>}
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
      </section>
    </div>
  );
};

export default ShopifySettings;

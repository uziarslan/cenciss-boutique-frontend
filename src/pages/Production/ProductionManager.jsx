import { useCallback, useEffect, useState } from 'react';
import { Boxes, Check, Factory, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import usePermissions from '../../hooks/usePermissions';
import useQueryState from '../../hooks/useQueryState';
import FloatingSelect from '../../components/UI/FloatingSelect';
import {
  completeProductionOrder,
  getBillsOfMaterials,
  getProductionOrders,
  getProductionSetup,
  releaseProductionOrder,
  saveBillOfMaterials,
} from '../../api/productionApi';

const field = 'w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const money = (value) => `PKR ${Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
const blankMaterial = () => ({ product: '', quantity: '1', unit: '' });
const blankBom = () => ({ name: '', finishedVariant: '', batchSize: '1', materials: [blankMaterial()] });

const ProductionManager = () => {
  const { has } = usePermissions();
  const canManage = has('inventory.manage');
  const [setup, setSetup] = useState({ outlets: [], materials: [], finishedVariants: [] });
  const [outletId, setOutletId] = useQueryState('outlet', '');
  const [boms, setBoms] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(blankBom());
  const [editingId, setEditingId] = useState('');
  const [releaseQuantities, setReleaseQuantities] = useState({});
  const [completion, setCompletion] = useState({});
  const [working, setWorking] = useState(false);

  const load = useCallback(async (targetOutlet = '') => {
    setWorking(true);
    try {
      const [setupResponse, bomsResponse, ordersResponse] = await Promise.all([
        getProductionSetup(targetOutlet), getBillsOfMaterials(), getProductionOrders(targetOutlet),
      ]);
      const nextSetup = setupResponse.data?.data || {};
      setSetup(nextSetup);
      if (!targetOutlet && nextSetup.outletId) setOutletId(String(nextSetup.outletId));
      setBoms(bomsResponse.data?.data || []);
      const nextOrders = ordersResponse.data?.data || [];
      setOrders(nextOrders);
      setCompletion(Object.fromEntries(nextOrders.filter((order) => order.status === 'released').map((order) => [order._id, { producedQuantity: order.plannedQuantity, rejectedQuantity: 0 }])));
    } catch (error) { toast.error(error.response?.data?.message || 'Could not load manufacturing data.'); }
    finally { setWorking(false); }
  }, []);

  useEffect(() => { load(outletId); }, [load, outletId]); // URL outlet selection also restores the matching materials and orders.

  const updateMaterial = (index, changes) => setForm((current) => ({ ...current, materials: current.materials.map((line, i) => i === index ? { ...line, ...changes } : line) }));
  const chooseMaterial = (index, productId) => {
    const product = setup.materials.find((item) => item._id === productId);
    updateMaterial(index, { product: productId, unit: product?.unit || '' });
  };

  const editBom = (bom) => {
    setEditingId(bom._id);
    setForm({
      name: bom.name,
      finishedVariant: bom.finishedVariant?._id || bom.finishedVariant,
      batchSize: String(bom.batchSize || 1),
      materials: (bom.materials || []).map((line) => ({ product: line.product?._id || line.product, quantity: String(line.quantity), unit: line.unit })),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveBom = async (event) => {
    event.preventDefault();
    if (!outletId) return toast.error('Select an outlet before saving a bill of materials.');
    if (!form.finishedVariant) return toast.error('Choose a finished product variant for this BOM.');
    setWorking(true);
    try {
      await saveBillOfMaterials({ ...form, batchSize: Number(form.batchSize), materials: form.materials.map((line) => ({ ...line, quantity: Number(line.quantity) })) }, editingId);
      toast.success(editingId ? 'Bill of materials updated.' : 'Bill of materials saved.');
      setForm(blankBom()); setEditingId(''); await load(outletId);
    } catch (error) { toast.error(error.response?.data?.message || 'Could not save bill of materials.'); }
    finally { setWorking(false); }
  };

  const release = async (bomId) => {
    const plannedQuantity = Number(releaseQuantities[bomId] || 0);
    if (!outletId || !Number.isInteger(plannedQuantity) || plannedQuantity < 1) return toast.error('Enter a whole batch quantity and select an outlet.');
    setWorking(true);
    try {
      const response = await releaseProductionOrder({ billOfMaterials: bomId, outlet: outletId, plannedQuantity });
      toast.success(`${response.data?.data?.orderNumber || 'Production order'} released; materials issued from raw-material stock.`);
      await load(outletId);
    } catch (error) { toast.error(error.response?.data?.message || 'Could not release production order.'); }
    finally { setWorking(false); }
  };

  const complete = async (order) => {
    const values = completion[order._id] || {};
    setWorking(true);
    try {
      await completeProductionOrder(order._id, { producedQuantity: Number(values.producedQuantity), rejectedQuantity: Number(values.rejectedQuantity || 0) });
      toast.success('Finished goods received into outlet stock.');
      await load(outletId);
    } catch (error) { toast.error(error.response?.data?.message || 'Could not complete this production order.'); }
    finally { setWorking(false); }
  };

  const variantLabel = (variant) => [...new Set([variant.product?.title || variant.productTitle || 'Product', variant.title && variant.title !== 'Default Title' ? variant.title : '', (variant.options || []).map((option) => option.value).filter((value) => value && value !== 'Default Title').join(' / ')].filter(Boolean))].join(' · ');

  return (
    <div className="mx-auto max-w-7xl space-y-5 py-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3"><span className="rounded-xl bg-indigo-100 p-2.5 text-indigo-700"><Factory size={21} /></span><div><h1 className="text-xl font-extrabold text-gray-900">Manufacturing</h1><p className="mt-1 text-sm text-gray-500">Define materials for each finished variant, issue from raw-material stock, then receive completed units into this outlet’s sellable stock.</p></div></div>
        <button onClick={() => load(outletId)} disabled={working} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700"><RefreshCw size={15} className={working ? 'animate-spin' : ''} />Refresh</button>
      </header>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-bold">Material-only costing is active in this copy.</p>
        <p className="mt-1">Confirm the accounting treatment for labor and overhead before entering those costs. Completed production is flagged for costing review until that policy is set.</p>
      </section>

      {setup.outlets.length > 1 && <FloatingSelect label="Production outlet" options={setup.outlets.map((outlet) => ({ value: String(outlet._id), label: outlet.name, meta: outlet.code || '' }))} value={outletId} onChange={(next) => { setOutletId(next); load(next); }} placeholder="Choose outlet" containerClassName="max-w-sm" />}
      {setup.outlets.length === 0 && <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">Create an outlet before setting up production. Shopify is optional for local products.</div>}
      {setup.outlets.length > 0 && !setup.outletId && <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">Select an outlet above to load its materials and finished variants.</div>}

      {!!setup.outletId && <>
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><Boxes size={18} className="text-indigo-600" /><h2 className="font-bold text-gray-900">{editingId ? 'Edit bill of materials' : 'Create bill of materials'}</h2></div>
          {!canManage && <p className="mb-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">You have view access. Inventory management permission is required to change production data.</p>}
          <form onSubmit={saveBom} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs font-semibold text-gray-600">BOM name<input className={`${field} mt-1`} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required disabled={!canManage} placeholder="e.g. Cotton tunic, size M" /></label>
              <FloatingSelect label="Finished product variant" options={setup.finishedVariants.map((variant) => ({ value: String(variant._id), label: variantLabel(variant), meta: `${variant.sku || 'No SKU'} · ${variant.catalogSource === 'manual' || !variant.shopifyVariantId ? 'Manual' : 'Shopify'}` }))} value={form.finishedVariant} onChange={(value) => setForm({ ...form, finishedVariant: value })} placeholder="Select variant" disabled={!canManage} />
              <label className="text-xs font-semibold text-gray-600">Units per BOM batch<input className={`${field} mt-1`} type="number" min="1" step="1" value={form.batchSize} onChange={(event) => setForm({ ...form, batchSize: event.target.value })} required disabled={!canManage} /></label>
            </div>
            <div className="space-y-2">
              {form.materials.map((line, index) => <div key={index} className="grid gap-2 rounded-xl bg-gray-50 p-3 md:grid-cols-[minmax(0,1fr)_150px_130px_40px] md:items-end">
              <FloatingSelect label="Raw material" options={setup.materials.map((material) => ({ value: String(material._id), label: material.name, meta: `${material.storeQty} ${material.unit} available` }))} value={line.product} onChange={(value) => chooseMaterial(index, value)} placeholder="Select raw material" disabled={!canManage} />
                <label className="text-xs font-semibold text-gray-600">Quantity<input className={`${field} mt-1`} type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={(event) => updateMaterial(index, { quantity: event.target.value })} required disabled={!canManage} /></label>
                <label className="text-xs font-semibold text-gray-600">Unit<input className={`${field} mt-1 bg-gray-100`} value={line.unit} readOnly placeholder="From material" /></label>
                <button type="button" onClick={() => setForm((current) => ({ ...current, materials: current.materials.filter((_, i) => i !== index) }))} disabled={!canManage || form.materials.length <= 1} className="mb-1 rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label="Remove material"><Trash2 size={16} /></button>
              </div>)}
              <button type="button" onClick={() => setForm((current) => ({ ...current, materials: [...current.materials, blankMaterial()] }))} disabled={!canManage} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50"><Plus size={14} />Add material</button>
            </div>
            {canManage && <div className="flex gap-2"><button disabled={working} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save size={15} />{editingId ? 'Update BOM' : 'Save BOM'}</button>{editingId && <button type="button" onClick={() => { setEditingId(''); setForm(blankBom()); }} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700">Cancel edit</button>}</div>}
          </form>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-bold text-gray-900">Bills of materials</h2>
          <div className="space-y-3">
            {boms.map((bom) => <div key={bom._id} className="grid gap-3 rounded-xl border border-gray-200 p-3 md:grid-cols-[minmax(0,1fr)_140px_240px_auto] md:items-center">
              <div className="min-w-0"><p className="truncate text-sm font-bold text-gray-900">{bom.name}</p><p className="truncate text-xs text-gray-500">{variantLabel(bom.finishedVariant || {})} · {bom.materials?.length || 0} materials / batch {bom.batchSize}</p></div>
              <label className="text-xs font-semibold text-gray-600">Produce quantity<input className={`${field} mt-1`} type="number" min="1" step="1" value={releaseQuantities[bom._id] ?? bom.batchSize ?? 1} onChange={(event) => setReleaseQuantities((current) => ({ ...current, [bom._id]: event.target.value }))} disabled={!canManage} /></label>
              <p className="text-xs text-gray-500">Materials are issued immediately from this outlet's raw-material stock.</p>
              <div className="flex gap-2"><button onClick={() => editBom(bom)} disabled={!canManage} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50">Edit</button><button onClick={() => release(bom._id)} disabled={!canManage || working} className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Release order</button></div>
            </div>)}
            {!boms.length && <p className="py-6 text-center text-sm text-gray-500">No bill of materials yet.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-bold text-gray-900">Production orders</h2>
          <div className="space-y-3">
            {orders.map((order) => <div key={order._id} className="rounded-xl border border-gray-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold text-gray-900">{order.orderNumber} · {variantLabel(order.finishedVariant || {})}</p><p className="mt-1 text-xs text-gray-500">{order.outlet?.name || 'Outlet'} · planned {order.plannedQuantity} · {order.status} · issued {new Date(order.releasedAt || order.createdAt).toLocaleString()}</p></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${order.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{order.status}</span></div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">{(order.materialUsage || []).map((line) => <span key={line._id || line.product?._id}>{line.product?.name || 'Material'}: {line.quantity} {line.unit}</span>)}</div>
              {order.status === 'released' && <div className="mt-4 grid gap-2 sm:grid-cols-[130px_130px_auto] sm:items-end"><label className="text-xs font-semibold text-gray-600">Good units<input className={`${field} mt-1`} type="number" min="1" step="1" value={completion[order._id]?.producedQuantity ?? order.plannedQuantity} onChange={(event) => setCompletion((current) => ({ ...current, [order._id]: { ...current[order._id], producedQuantity: event.target.value } }))} disabled={!canManage} /></label><label className="text-xs font-semibold text-gray-600">Rejected units<input className={`${field} mt-1`} type="number" min="0" step="1" value={completion[order._id]?.rejectedQuantity ?? 0} onChange={(event) => setCompletion((current) => ({ ...current, [order._id]: { ...current[order._id], rejectedQuantity: event.target.value } }))} disabled={!canManage} /></label><button onClick={() => complete(order)} disabled={!canManage || working} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Check size={15} />Complete batch</button><p className="text-xs text-gray-500 sm:col-span-3">Good units plus rejected units must match the planned batch; finished goods are added to outlet stock.</p></div>}
              {order.status === 'completed' && <p className="mt-3 text-sm text-gray-700">Produced {order.producedQuantity} · rejected {order.rejectedQuantity} · material cost {money(order.totalProductionCost)} · unit cost {money(order.unitCost)} · costing review</p>}
            </div>)}
            {!orders.length && <p className="py-6 text-center text-sm text-gray-500">No production orders yet.</p>}
          </div>
        </section>
      </>}
    </div>
  );
};

export default ProductionManager;

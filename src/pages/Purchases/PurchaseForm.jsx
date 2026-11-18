import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { ArrowLeft, Plus, Save, Send, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import toast from 'react-hot-toast';
import {
  correctPurchase,
  createPurchase,
  getPurchase,
  getPurchaseAssetOptions,
  postPurchase,
  updatePurchaseDraft,
} from '../../api/purchaseApi';
import { createProduct } from '../../api/productApi';
import {
  baseApi,
  useGetOutletsQuery,
  useGetProductsQuery,
  useGetVendorsQuery,
} from '../../store/baseApi';
import useFeatures from '../../hooks/useFeatures';
import usePermissions from '../../hooks/usePermissions';
import Button from '../../components/UI/Button';
import Card from '../../components/UI/Card';
import CreateProductModal from '../../components/UI/CreateProductModal';
import HeroBanner from '../../components/UI/HeroBanner';
import SearchableSelect from '../../components/UI/SearchableSelect';
import {
  changeEnteredLineTotal,
  changeEntryMode,
  changeLineQuantity,
  changePriceEntryMode,
  editableNumber,
  grossLineAmount,
  netLineAmount,
  receivedBaseQuantity,
  receivedBaseUnitCost,
} from './purchaseLineMath';

const blankLine = (accountingTreatment = 'inventory') => ({
  product: '',
  description: '',
  accountingTreatment,
  assetCategory: '',
  assetLocation: '',
  assetUsefulLifeMonths: '',
  assetResidualValue: '',
  qty: 1,
  entryMode: 'loose',
  packSize: 1,
  unit: '',
  priceEntryMode: 'unit',
  enteredLineTotal: '',
  unitPrice: 0,
  lineDiscount: 0,
  notes: '',
});

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const money = (value) => `Rs. ${Number(value || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const quantity = (value) => Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 3 });
const parsePackSize = (value) => {
  const parsed = Number(String(value || '').match(/[\d.]+/)?.[0]);
  return parsed > 1 ? parsed : '';
};
const vendorPackSizeFor = (product, vendorId) => {
  const vendor = product?.vendors?.find((entry) => (
    String(entry.vendorId?._id || entry.vendorId || '') === String(vendorId || '')
  ));
  return parsePackSize(vendor?.packSize || product?.packSize);
};
const withSelectedProduct = (line, product, vendorId) => {
  if (!product) return line;
  const savedPackSize = vendorPackSizeFor(product, vendorId);
  const packSize = line.entryMode === 'pack' ? savedPackSize : 1;
  const enteredTotal = Number(line.enteredLineTotal);
  const preserveEnteredTotal = line.priceEntryMode === 'total'
    && Number.isFinite(enteredTotal)
    && enteredTotal > 0;
  let unitPrice = 0;
  if (preserveEnteredTotal) {
    unitPrice = Number(line.qty) > 0 ? enteredTotal / Number(line.qty) : 0;
  } else if (Number(product.currentPrice) > 0) {
    unitPrice = line.entryMode === 'pack'
      ? (Number(packSize) > 1 ? Number(product.currentPrice) * Number(packSize) : 0)
      : Number(product.currentPrice);
  }
  return {
    ...line,
    product: product._id,
    description: product.name || line.description,
    unit: product.unit || line.unit,
    unitPrice: editableNumber(unitPrice),
    enteredLineTotal: line.priceEntryMode === 'total'
      ? (preserveEnteredTotal
        ? line.enteredLineTotal
        : editableNumber(Number(line.qty || 0) * Number(unitPrice || 0), 2))
      : line.enteredLineTotal,
    packSize,
  };
};
const purchaseTypeOptions = [
  { value: 'stock', label: 'Stock purchase', meta: 'Goods received into inventory' },
  { value: 'expense', label: 'Direct expense', meta: 'Service or non-stock cost' },
  { value: 'mixed', label: 'Mixed bill', meta: 'Inventory, expenses, and fixed assets together' },
];
const baseTreatmentOptions = [
  { value: 'inventory', label: 'Inventory', meta: 'Receive into stock' },
  { value: 'expense', label: 'Expense', meta: 'Post as a direct cost' },
];
const destinationOptions = [
  { value: 'store', label: 'Raw materials', meta: 'Raw-material stock held at this outlet' },
];
const settlementOptions = [
  { value: 'credit', label: 'Pay later', meta: 'Create vendor payable' },
  { value: 'paid', label: 'Paid now', meta: 'Post payment with purchase' },
];
const paymentMethodOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'bankTransfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'creditCard', label: 'Credit card' },
];

const PurchaseForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { has } = usePermissions();
  const { hasFeature } = useFeatures();
  const assetFeatureEnabled = hasFeature('assetAudit');
  const { data: vendors = [] } = useGetVendorsQuery();
  const {
    data: catalogProducts = [],
    isLoading: productsLoading,
    isError: productsError,
  } = useGetProductsQuery({
    isActive: true,
    kind: 'standard',
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const { data: outlets = [] } = useGetOutletsQuery();
  const [createdProducts, setCreatedProducts] = useState([]);
  const products = useMemo(() => {
    const byId = new Map(catalogProducts.map((product) => [product._id, product]));
    createdProducts.forEach((product) => byId.set(product._id, product));
    return [...byId.values()];
  }, [catalogProducts, createdProducts]);
  const productsUnavailable = productsError && products.length === 0;
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [createProductCtx, setCreateProductCtx] = useState(null);
  const [assetOptions, setAssetOptions] = useState({
    enabled: false,
    outlets: [],
    categories: [],
  });
  const [reason, setReason] = useState('');
  const [inventoryAction, setInventoryAction] = useState('adjust');
  const [form, setForm] = useState({
    type: 'stock',
    vendor: '',
    vendorInvoiceNumber: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    outlet: '',
    destination: 'store',
    lines: [blankLine()],
    discountAmount: 0,
    taxRate: 0,
    aitRate: 0,
    notes: '',
    paymentStatus: 'credit',
    paymentMethod: 'cash',
    paymentReference: '',
  });

  useEffect(() => {
    if (!assetFeatureEnabled) {
      setAssetOptions({ enabled: false, outlets: [], categories: [] });
      return;
    }
    getPurchaseAssetOptions()
      .then(({ data }) => {
        const options = data.data || {
          enabled: false,
          outlets: [],
          categories: [],
        };
        setAssetOptions(options);
        if (options.enabled && options.categories.length === 0) {
          toast.error('Asset categories could not be prepared. Open Categories & COA to review the setup.');
        }
      })
      .catch((error) => {
        setAssetOptions({ enabled: false, outlets: [], categories: [] });
        toast.error(error.response?.data?.message || 'Asset categories could not be loaded.');
      });
  }, [assetFeatureEnabled]);

  useEffect(() => {
    if (!id) {
      if (outlets.length === 1) setForm((old) => ({ ...old, outlet: outlets[0]._id }));
      return;
    }
    getPurchase(id)
      .then(({ data }) => {
        const purchase = data.data;
        const selectedProducts = (purchase.lines || [])
          .map((line) => line.product)
          .filter((product) => product && typeof product === 'object' && product._id);
        if (selectedProducts.length) {
          setCreatedProducts((current) => {
            const byId = new Map(current.map((product) => [product._id, product]));
            selectedProducts.forEach((product) => byId.set(product._id, product));
            return [...byId.values()];
          });
        }
        setExisting(purchase);
        setForm({
          type: purchase.type || 'stock',
          vendor: purchase.vendor?._id || purchase.vendor || '',
          vendorInvoiceNumber: purchase.vendorInvoiceNumber || '',
          purchaseDate: purchase.purchaseDate?.slice(0, 10) || '',
          dueDate: purchase.dueDate?.slice(0, 10) || '',
          outlet: purchase.outlet?._id || purchase.outlet || '',
          destination: purchase.destination || 'store',
          lines: purchase.lines?.map((line) => ({
            product: line.product?._id || line.product || '',
            description: line.description || line.productName || '',
            accountingTreatment: line.accountingTreatment
              || (purchase.type === 'stock' ? 'inventory' : 'expense'),
            assetCategory: line.assetCategory?._id || line.assetCategory || '',
            assetLocation: line.assetLocation || '',
            assetUsefulLifeMonths: line.assetUsefulLifeMonths || '',
            assetResidualValue: line.assetResidualValue ?? '',
            qty: line.qty || 0,
            entryMode: line.entryMode || (Number(line.packSize) > 1 ? 'pack' : 'loose'),
            packSize: line.packSize || 1,
            unit: line.unit || '',
            priceEntryMode: line.priceEntryMode || 'unit',
            enteredLineTotal: editableNumber(
              Number(line.qty || 0) * Number(line.unitPrice || 0),
              2,
            ),
            unitPrice: line.unitPrice || 0,
            lineDiscount: line.lineDiscount || 0,
            notes: line.notes || '',
          })) || [blankLine()],
          discountAmount: purchase.discountAmount || 0,
          taxRate: purchase.taxRate || 0,
          aitRate: purchase.aitRate || 0,
          notes: purchase.notes || '',
          paymentStatus: 'credit',
          paymentMethod: 'cash',
          paymentReference: '',
        });
      })
      .catch((error) => toast.error(error.response?.data?.message || 'Purchase could not be loaded.'))
      .finally(() => setLoading(false));
  }, [id, outlets]);

  const isPosted = existing && !['draft', 'pendingApproval'].includes(existing.status);
  const treatmentFor = (line) => {
    if (form.type === 'stock') return 'inventory';
    if (form.type === 'expense') return 'expense';
    return line.accountingTreatment || 'expense';
  };
  const hasInventoryLines = form.lines.some((line) => treatmentFor(line) === 'inventory');
  const hasAssetLines = form.lines.some((line) => treatmentFor(line) === 'asset');
  const assetOutletEnabled = assetOptions.outlets.some((outlet) => outlet._id === form.outlet);
  const treatmentOptions = assetOptions.enabled
    ? [...baseTreatmentOptions, { value: 'asset', label: 'Fixed asset', meta: 'Create asset register records' }]
    : baseTreatmentOptions;
  const totals = useMemo(() => {
    const subtotal = form.lines.reduce((sum, line) => (
      sum + netLineAmount(line)
    ), 0);
    const taxable = Math.max(0, subtotal - Number(form.discountAmount || 0));
    const tax = taxable * Number(form.taxRate || 0) / 100;
    const ait = taxable * Number(form.aitRate || 0) / 100;
    return { subtotal, tax, ait, total: taxable + tax + ait };
  }, [form.lines, form.discountAmount, form.taxRate, form.aitRate]);

  const setLine = (index, key, value) => {
    setForm((old) => ({
      ...old,
      lines: old.lines.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        if (key === 'accountingTreatment') {
          return {
            ...line,
            accountingTreatment: value,
            product: value === 'inventory' ? line.product : '',
            assetCategory: value === 'asset' ? line.assetCategory : '',
            entryMode: value === 'inventory' ? line.entryMode : 'loose',
            packSize: value === 'inventory' ? line.packSize : 1,
          };
        }
        if (key === 'assetCategory') {
          const category = assetOptions.categories.find((item) => item._id === value);
          return {
            ...line,
            assetCategory: value,
            unit: category?.defaultUnit || line.unit || 'unit',
            assetUsefulLifeMonths: line.assetUsefulLifeMonths
              || category?.defaultUsefulLifeMonths
              || 60,
          };
        }
        if (key === 'entryMode') {
          const product = products.find((item) => item._id === line.product);
          const packSize = value === 'pack'
            ? (vendorPackSizeFor(product, old.vendor) || parsePackSize(line.packSize))
            : 1;
          return changeEntryMode(line, value, packSize);
        }
        if (key === 'priceEntryMode') {
          return changePriceEntryMode(line, value);
        }
        if (key === 'qty') {
          return changeLineQuantity(line, value);
        }
        if (key === 'enteredLineTotal') {
          return changeEnteredLineTotal(line, value);
        }
        if (key === 'packSize') {
          const product = products.find((item) => item._id === line.product);
          const shouldAutofillPrice = line.priceEntryMode === 'unit'
            && Number(line.unitPrice || 0) === 0
            && Number(value) > 1
            && Number(product?.currentPrice) > 0;
          return {
            ...line,
            packSize: value,
            unitPrice: shouldAutofillPrice
              ? editableNumber(Number(product.currentPrice) * Number(value))
              : line.unitPrice,
          };
        }
        if (key !== 'product') return { ...line, [key]: value };
        const product = products.find((item) => item._id === value);
        return product
          ? withSelectedProduct(line, product, old.vendor)
          : { ...line, product: value };
      }),
    }));
  };

  const setVendor = (vendor) => {
    setForm((old) => ({
      ...old,
      vendor,
      lines: old.lines.map((line) => {
        const treatment = old.type === 'stock'
          ? 'inventory'
          : old.type === 'expense'
            ? 'expense'
            : (line.accountingTreatment || 'expense');
        if (treatment !== 'inventory' || !line.product) return line;
        const product = products.find((item) => item._id === line.product);
        const savedPackSize = vendorPackSizeFor(product, vendor);
        if (!product || line.entryMode !== 'pack' || !(Number(savedPackSize) > 1)) return line;
        if (line.priceEntryMode === 'total') return { ...line, packSize: savedPackSize };
        const previousPackSize = Number(line.packSize);
        const baseUnitPrice = previousPackSize > 1
          ? Number(line.unitPrice || 0) / previousPackSize
          : Number(product.currentPrice || 0);
        return {
          ...line,
          packSize: savedPackSize,
          unitPrice: editableNumber(baseUnitPrice * Number(savedPackSize)),
        };
      }),
    }));
  };

  const submitCreateProduct = async ({ name, unit, category }) => {
    try {
      const { data } = await createProduct({ name, unit, category });
      const product = data?.data;
      if (!product || !createProductCtx) return false;

      setCreatedProducts((current) => (
        current.some((item) => item._id === product._id)
          ? current
          : [...current, product]
      ));
      setForm((current) => ({
        ...current,
        lines: current.lines.map((line, index) => (
          index === createProductCtx.index
            ? withSelectedProduct(line, product, current.vendor)
            : line
        )),
      }));
      dispatch(baseApi.util.invalidateTags(['Product']));
      toast.success(`Item "${product.name}" created and selected.`);
      setCreateProductCtx(null);
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || 'Item could not be created.');
      return false;
    }
  };

  const payload = () => ({
    type: form.type,
    vendor: form.vendor || null,
    vendorInvoiceNumber: form.vendorInvoiceNumber,
    purchaseDate: form.purchaseDate,
    dueDate: form.dueDate || null,
    outlet: form.type !== 'expense' ? (form.outlet || null) : null,
    destination: hasInventoryLines ? form.destination : 'none',
    lines: form.lines.map((line) => {
      const treatment = treatmentFor(line);
      return {
        product: treatment === 'inventory' ? line.product : null,
        description: line.description,
        accountingTreatment: treatment,
        assetCategory: treatment === 'asset' ? line.assetCategory : null,
        assetLocation: line.assetLocation,
        assetUsefulLifeMonths: treatment === 'asset' && line.assetUsefulLifeMonths
          ? Number(line.assetUsefulLifeMonths)
          : null,
        assetResidualValue: treatment === 'asset' && line.assetResidualValue !== ''
          ? Number(line.assetResidualValue)
          : null,
        qty: Number(line.qty),
        entryMode: treatment === 'inventory' && line.entryMode === 'pack' ? 'pack' : 'loose',
        packSize: treatment === 'inventory' && line.entryMode === 'pack'
          ? Number(line.packSize)
          : 1,
        unit: line.unit,
        priceEntryMode: line.priceEntryMode === 'total' ? 'total' : 'unit',
        unitPrice: Number(line.unitPrice),
        lineDiscount: Number(line.lineDiscount),
        notes: line.notes,
      };
    }),
    discountAmount: Number(form.discountAmount),
    taxRate: Number(form.taxRate),
    aitRate: Number(form.aitRate),
    notes: form.notes,
  });

  const submit = async (mode) => {
    const invalidPackIndex = form.lines.findIndex((line) => (
      treatmentFor(line) === 'inventory'
      && line.entryMode === 'pack'
      && !(Number(line.packSize) > 1)
    ));
    if (invalidPackIndex >= 0) {
      toast.error(`Enter units per pack on line ${invalidPackIndex + 1}. Pack size must be greater than 1.`);
      return;
    }
    const invalidDiscountIndex = form.lines.findIndex((line) => (
      Number(line.lineDiscount || 0) - grossLineAmount(line) > 0.005
    ));
    if (invalidDiscountIndex >= 0) {
      toast.error(`Line discount cannot exceed the line amount on line ${invalidDiscountIndex + 1}.`);
      return;
    }
    const validLines = form.lines.filter((line) => {
      const treatment = treatmentFor(line);
      if (!(Number(line.qty) > 0)) return false;
      if (treatment === 'inventory') return Boolean(line.product);
      if (treatment === 'asset') return Boolean(line.assetCategory && line.description.trim());
      return Boolean(line.description.trim());
    });
    if (validLines.length !== form.lines.length || !validLines.length) {
      toast.error('Add at least one valid purchase line.');
      return;
    }
    if ((hasInventoryLines || hasAssetLines) && !form.outlet) {
      toast.error('Choose the outlet receiving the inventory or assets.');
      return;
    }
    if (hasAssetLines && !assetOutletEnabled) {
      toast.error('Asset Register & Audit is not enabled for the selected outlet.');
      return;
    }
    if (isPosted && reason.trim().length < 5) {
      toast.error('Explain why this posted purchase is being edited.');
      return;
    }
    setSaving(true);
    try {
      let purchaseId = id;
      if (isPosted) {
        await correctPurchase(id, { reason, inventoryAction, changes: payload() });
        dispatch(baseApi.util.invalidateTags(['Payment', 'Purchase', 'Accounting']));
        toast.success(inventoryAction === 'adjust'
          ? 'Purchase updated and the inventory difference was posted.'
          : 'Purchase updated without changing inventory.');
      } else if (id) {
        await updatePurchaseDraft(id, payload());
        if (mode === 'post') {
          await postPurchase(id, {
            paymentStatus: form.paymentStatus === 'paid' ? 'paid' : 'credit',
            paymentMethod: form.paymentMethod,
            paymentReference: form.paymentReference,
          });
        }
        toast.success(mode === 'post' ? 'Purchase posted.' : 'Draft updated.');
      } else {
        const { data } = await createPurchase({
          ...payload(),
          postNow: mode === 'post',
          paymentStatus: form.paymentStatus === 'paid' ? 'paid' : 'credit',
          paymentMethod: form.paymentMethod,
          paymentReference: form.paymentReference,
        });
        purchaseId = data.data.purchase._id;
        toast.success(mode === 'post' ? 'Purchase posted.' : 'Draft saved.');
      }
      navigate(`/purchases/${purchaseId}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Purchase could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-24 text-center text-slate-400">Loading purchase…</div>;
  if (isPosted && existing?.assets?.length) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm font-semibold text-slate-700">This purchase created fixed-asset records and cannot be corrected in place.</p>
        <button className="mt-3 text-sm font-semibold text-indigo-600 hover:underline" onClick={() => navigate(`/purchases/${id}`)}>Return to the purchase</button>
      </div>
    );
  }
  if (id && !has('purchases.edit')) return <div className="py-24 text-center text-slate-500">You do not have permission to edit this purchase.</div>;

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(id ? `/purchases/${id}` : '/purchases')} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-indigo-600">
        <ArrowLeft size={15} /> Back to purchases
      </button>
      <HeroBanner
        eyebrow={isPosted ? 'Safe purchase edit' : 'Purchase'}
        title={isPosted ? `Edit ${existing.purchaseNumber}` : id ? `Edit ${existing?.purchaseNumber}` : 'New purchase'}
        subtitle={isPosted
          ? 'Edit the purchase safely. The original journal is updated in place; fully paid purchases also reconcile excess payments when the total is reduced.'
          : 'Capture the goods and bill once, then post them to stock and accounting together.'}
      />

      {isPosted && hasInventoryLines && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">Should this purchase edit update inventory?</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className={`cursor-pointer rounded-xl border p-3 ${inventoryAction === 'adjust' ? 'border-indigo-400 bg-white ring-2 ring-indigo-100' : 'border-amber-200 bg-amber-50/50'}`}>
              <input type="radio" name="inventoryAction" value="adjust" checked={inventoryAction === 'adjust'} onChange={() => setInventoryAction('adjust')} className="mr-2" />
              <span className="text-sm font-semibold text-slate-800">Update inventory</span>
              <p className="ml-6 mt-1 text-xs text-slate-500">Post only the quantity and cost difference. The original purchase is never received twice.</p>
            </label>
            <label className={`cursor-pointer rounded-xl border p-3 ${inventoryAction === 'keep' ? 'border-indigo-400 bg-white ring-2 ring-indigo-100' : 'border-amber-200 bg-amber-50/50'}`}>
              <input type="radio" name="inventoryAction" value="keep" checked={inventoryAction === 'keep'} onChange={() => setInventoryAction('keep')} className="mr-2" />
              <span className="text-sm font-semibold text-slate-800">Keep current inventory</span>
              <p className="ml-6 mt-1 text-xs text-slate-500">Correct the bill and accounting only. Stock quantity and item cost remain unchanged.</p>
            </label>
          </div>
        </div>
      )}

      <Card>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Purchase type</span>
            <SearchableSelect
              options={purchaseTypeOptions}
              value={form.type}
              disabled={isPosted}
              onChange={(value) => setForm((old) => ({
                ...old,
                type: value,
                destination: value === 'expense'
                  ? 'none'
                  : (old.destination === 'none' ? 'store' : old.destination),
                lines: old.lines.map((line) => ({
                  ...line,
                  accountingTreatment: value === 'stock'
                    ? 'inventory'
                    : value === 'expense'
                      ? 'expense'
                      : (line.accountingTreatment || 'expense'),
                  product: value === 'expense' ? '' : line.product,
                  assetCategory: value === 'stock' || value === 'expense'
                    ? ''
                    : line.assetCategory,
                  entryMode: value === 'expense' ? 'loose' : line.entryMode,
                  packSize: value === 'expense' ? 1 : line.packSize,
                })),
              }))}
              searchable={false}
            />
          </label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Vendor</span>
            <SearchableSelect options={[{ value: '', label: 'Direct / no vendor' }, ...vendors.map((vendor) => ({ value: vendor._id, label: vendor.name, meta: vendor.code }))]} value={form.vendor} onChange={setVendor} />
          </label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Vendor bill #</span><input className={fieldClass} placeholder="e.g. BILL-1042" value={form.vendorInvoiceNumber} onChange={(event) => setForm((old) => ({ ...old, vendorInvoiceNumber: event.target.value }))} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Purchase date</span><input type="date" className={fieldClass} value={form.purchaseDate} onChange={(event) => setForm((old) => ({ ...old, purchaseDate: event.target.value }))} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Due date</span><input type="date" className={fieldClass} value={form.dueDate} onChange={(event) => setForm((old) => ({ ...old, dueDate: event.target.value }))} /></label>
          {form.type !== 'expense' && <>
            <label><span className="mb-1 block text-xs font-semibold text-slate-500">Outlet</span><SearchableSelect disabled={isPosted} options={outlets.map((outlet) => ({ value: outlet._id, label: outlet.name, meta: outlet.code }))} value={form.outlet} onChange={(value) => setForm((old) => ({ ...old, outlet: value }))} /></label>
            {hasInventoryLines && <label><span className="mb-1 block text-xs font-semibold text-slate-500">Receive inventory into</span>
              <SearchableSelect
                disabled={isPosted}
                options={destinationOptions}
                value={form.destination}
                onChange={(value) => setForm((old) => ({ ...old, destination: value }))}
                searchable={false}
              />
            </label>}
          </>}
        </div>
        <div className={`mt-4 rounded-xl border px-4 py-3 ${
          form.type === 'stock'
            ? 'border-indigo-100 bg-indigo-50/60 text-indigo-950'
            : form.type === 'mixed'
              ? 'border-violet-100 bg-violet-50/60 text-violet-950'
              : 'border-amber-100 bg-amber-50/60 text-amber-950'
        }`}>
          <p className="text-sm font-bold">
            {form.type === 'stock'
              ? 'Stock purchase — inventory and cost are updated'
              : form.type === 'mixed'
                ? 'Mixed bill — classify each line separately'
                : 'Direct expense — inventory is not changed'}
          </p>
          <p className="mt-1 text-xs opacity-70">
            {form.type === 'stock'
              ? 'Posting receives raw materials into this outlet’s stock and records the vendor bill.'
              : form.type === 'mixed'
                ? 'Inventory lines update stock, expense lines post to purchase expense, and fixed-asset lines create tagged register records under their category COA head.'
                : 'Use this for services and non-stock costs such as repairs, rent, utilities, or professional fees.'}
          </p>
          {hasAssetLines && (
            <p className={`mt-2 text-xs font-semibold ${assetOutletEnabled ? 'text-emerald-700' : 'text-rose-700'}`}>
              {assetOutletEnabled
                ? 'The selected outlet is enabled for Asset Register & Audit.'
                : 'Choose an outlet where Asset Register & Audit has been enabled by the administrator.'}
            </p>
          )}
        </div>
      </Card>

      <Card padding={false}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-bold text-slate-900">
              {form.type === 'stock'
                ? 'Goods received'
                : form.type === 'mixed'
                  ? 'Bill lines'
                  : 'Expense items and services'}
            </h2>
            <p className="text-xs text-slate-400">
              {form.type === 'stock'
                ? 'Choose Loose for base units or Pack for cartons/cases. The journal will show the actual items received.'
                : form.type === 'mixed'
                  ? 'Choose the accounting treatment on each line. Fixed assets are linked to their register and COA category when posted.'
                  : 'Describe each service or non-stock cost clearly so the journal remains easy to trace.'}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={Plus}
            onClick={() => setForm((old) => ({
              ...old,
              lines: [
                ...old.lines,
                blankLine(old.type === 'stock' ? 'inventory' : 'expense'),
              ],
            }))}
          >
            Add line
          </Button>
        </div>
        <div className="divide-y divide-slate-100">
          {form.lines.map((line, index) => {
            const treatment = treatmentFor(line);
            const selectedCategory = assetOptions.categories.find(
              (category) => category._id === line.assetCategory,
            );
            const isInventory = treatment === 'inventory';
            const isAsset = treatment === 'asset';
            return (
            <div key={index} className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-12">
              {form.type === 'mixed' && (
                <label className="xl:col-span-2">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Treatment</span>
                  <SearchableSelect
                    options={treatmentOptions}
                    value={treatment}
                    onChange={(value) => setLine(index, 'accountingTreatment', value)}
                    searchable={false}
                  />
                </label>
              )}
              <label className="xl:col-span-3">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {isInventory ? 'Inventory item' : isAsset ? 'Asset category' : 'Expense / service'}
                </span>
                {isInventory
                  ? <SearchableSelect
                      options={products.map((product) => {
                        const savedPackSize = vendorPackSizeFor(product, form.vendor);
                        return {
                          value: product._id,
                          label: product.name,
                          meta: `${product.sku || ''} · ${product.unit || 'unit'}${
                            savedPackSize ? ` · ${savedPackSize} ${product.unit || 'units'}/pack` : ''
                          }`,
                        };
                      })}
                      value={line.product}
                      onChange={(value) => setLine(index, 'product', value)}
                      disabled={productsLoading || productsUnavailable}
                      onCreateOption={(name) => setCreateProductCtx({
                        index,
                        name,
                        unit: line.unit,
                      })}
                      createLabel={(name) => `Create "${name}" as a new item`}
                      placeholder={
                        productsUnavailable
                          ? 'Items could not be loaded'
                          : productsLoading
                            ? 'Loading all items…'
                            : 'Search goods…'
                      }
                    />
                  : isAsset
                    ? <SearchableSelect
                        options={assetOptions.categories.map((category) => ({
                          value: category._id,
                          label: category.name,
                          meta: `${category.code} · ${category.trackingMode === 'serialized' ? 'Individual tags' : 'Bulk lot'} · ${category.accounts?.asset?.code || ''} ${category.accounts?.asset?.name || ''}`,
                        }))}
                        value={line.assetCategory}
                        onChange={(value) => setLine(index, 'assetCategory', value)}
                        placeholder={assetOptions.categories.length
                          ? 'Choose asset category…'
                          : 'Create an asset category first'}
                      />
                  : <input
                      className={fieldClass}
                      placeholder="e.g. Equipment repair"
                      value={line.description}
                      onChange={(event) => setLine(index, 'description', event.target.value)}
                    />}
              </label>
              <label className="xl:col-span-3">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {isInventory ? 'Journal description' : isAsset ? 'Asset name / model' : 'Details'}
                </span>
                <input
                  className={fieldClass}
                  placeholder={isInventory
                    ? 'e.g. Fresh tomatoes'
                    : isAsset
                      ? 'e.g. fabric rack A-2'
                      : 'e.g. Freezer compressor repair'}
                  value={isInventory || isAsset ? line.description : line.notes}
                  onChange={(event) => setLine(
                    index,
                    isInventory || isAsset ? 'description' : 'notes',
                    event.target.value,
                  )}
                />
              </label>
              {isInventory && (
                <div className="xl:col-span-2">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Buy as</span>
                  <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Loose or pack entry">
                    {[
                      ['loose', 'Loose'],
                      ['pack', 'Packs'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={line.entryMode === value}
                        onClick={() => setLine(index, 'entryMode', value)}
                        className={`rounded-lg px-2 py-2 text-xs font-bold transition ${
                          line.entryMode === value
                            ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100'
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <label className="xl:col-span-2">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {isInventory && line.entryMode === 'pack'
                    ? 'Number of packs'
                    : isAsset && selectedCategory?.trackingMode === 'serialized'
                      ? 'Number of tags'
                      : `Quantity${line.unit ? ` (${line.unit})` : ''}`}
                </span>
                <input
                  aria-label="Quantity"
                  type="number"
                  min="0"
                  step={isAsset && selectedCategory?.trackingMode === 'serialized' ? '1' : '0.001'}
                  className={fieldClass}
                  placeholder={isInventory && line.entryMode === 'pack' ? 'Packs' : 'Quantity'}
                  value={line.qty}
                  onChange={(event) => setLine(index, 'qty', event.target.value)}
                />
              </label>
              {isInventory && (
                <label className="xl:col-span-2">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {line.entryMode === 'pack' ? `Units per pack (${line.unit || 'units'})` : 'Stock received'}
                  </span>
                  {line.entryMode === 'pack' ? (
                    <>
                      <input
                        aria-label="Units per pack"
                        type="number"
                        min="1.001"
                        step="0.001"
                        className={`${fieldClass} ${
                          Number(line.packSize) > 1 ? '' : 'border-amber-300 bg-amber-50'
                        }`}
                        placeholder={`e.g. 12 ${line.unit || 'units'}`}
                        value={line.packSize}
                        onChange={(event) => setLine(index, 'packSize', event.target.value)}
                      />
                      <span className={`mt-1 block text-[10px] ${
                        Number(line.packSize) > 1 ? 'text-emerald-600' : 'font-semibold text-amber-600'
                      }`}>
                        {Number(line.packSize) > 1
                          ? `${quantity(line.qty)} packs × ${quantity(line.packSize)} = ${quantity(receivedBaseQuantity(line))} ${line.unit || 'units'}`
                          : 'Enter how many base units are inside one pack.'}
                      </span>
                    </>
                  ) : (
                    <div className="flex min-h-[42px] items-center rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700">
                      {quantity(receivedBaseQuantity(line))} {line.unit || 'units'}
                    </div>
                  )}
                </label>
              )}

              <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 md:grid-cols-2 xl:col-span-12 xl:grid-cols-12">
                <div className="xl:col-span-3">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Enter price by</span>
                  <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-white p-1" role="group" aria-label="Price entry method">
                    {[
                      ['unit', isInventory && line.entryMode === 'pack' ? 'Per pack' : 'Per unit'],
                      ['total', 'Line total'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={line.priceEntryMode === value}
                        onClick={() => setLine(index, 'priceEntryMode', value)}
                        className={`rounded-lg px-2 py-2 text-xs font-bold transition ${
                          line.priceEntryMode === value
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="xl:col-span-3">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {line.priceEntryMode === 'total'
                      ? 'Line amount before discount'
                      : `Price per ${isInventory && line.entryMode === 'pack' ? 'pack' : (line.unit || 'unit')}`}
                  </span>
                  <input
                    aria-label={line.priceEntryMode === 'total' ? 'Line amount before discount' : 'Unit price'}
                    type="number"
                    min="0"
                    step="0.01"
                    className={fieldClass}
                    placeholder={line.priceEntryMode === 'total'
                      ? 'Full line amount'
                      : isInventory && line.entryMode === 'pack'
                        ? 'Pack price'
                        : 'Unit price'}
                    value={line.priceEntryMode === 'total' ? line.enteredLineTotal : line.unitPrice}
                    onChange={(event) => setLine(
                      index,
                      line.priceEntryMode === 'total' ? 'enteredLineTotal' : 'unitPrice',
                      event.target.value,
                    )}
                  />
                  <span className="mt-1 block text-[10px] text-slate-400">
                    {line.priceEntryMode === 'total'
                      ? `${money(line.unitPrice)} per ${isInventory && line.entryMode === 'pack' ? 'pack' : (line.unit || 'unit')}`
                      : `${money(grossLineAmount(line))} before discount`}
                  </span>
                </label>
                <label className="xl:col-span-2">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Line discount</span>
                  <input
                    aria-label="Line discount"
                    type="number"
                    min="0"
                    step="0.01"
                    className={fieldClass}
                    placeholder="Rs. 0"
                    value={line.lineDiscount}
                    onChange={(event) => setLine(index, 'lineDiscount', event.target.value)}
                  />
                  <span className="mt-1 block text-[10px] text-slate-400">Applied after the gross line amount</span>
                </label>
                <div className="xl:col-span-3">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Net line total</span>
                  <div className="flex min-h-[42px] flex-col justify-center rounded-xl border border-indigo-100 bg-white px-3 text-right">
                    <span className="font-bold tabular-nums text-slate-900">{money(netLineAmount(line))}</span>
                    {isInventory && Number(receivedBaseQuantity(line)) > 0 && (
                      <span className="text-[10px] text-slate-400">
                        {quantity(receivedBaseQuantity(line))} {line.unit || 'units'} received
                        {' · '}
                        {money(receivedBaseUnitCost(line))}/{line.unit || 'unit'}
                      </span>
                    )}
                    {isAsset && selectedCategory && (
                      <span className="text-[10px] text-slate-400">
                        {selectedCategory.trackingMode === 'serialized'
                          ? `${Number(line.qty || 0)} asset tag(s) will be created`
                          : 'One bulk asset lot will be created'}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Remove line"
                  disabled={form.lines.length === 1}
                  onClick={() => setForm((old) => ({ ...old, lines: old.lines.filter((_, lineIndex) => lineIndex !== index) }))}
                  className="flex items-center justify-center rounded-xl text-slate-300 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-30 xl:col-span-1"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {isAsset && (
                <div className="grid gap-3 rounded-xl border border-violet-100 bg-violet-50/50 p-3 md:grid-cols-3 xl:col-span-12">
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-violet-500">Location</span>
                    <input
                      className={fieldClass}
                      placeholder="e.g. cutting room shelf"
                      value={line.assetLocation}
                      onChange={(event) => setLine(index, 'assetLocation', event.target.value)}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-violet-500">Useful life (months)</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className={fieldClass}
                      value={line.assetUsefulLifeMonths}
                      onChange={(event) => setLine(index, 'assetUsefulLifeMonths', event.target.value)}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-violet-500">Total residual value</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={fieldClass}
                      placeholder={`Category default ${selectedCategory?.defaultResidualValuePercent || 0}%`}
                      value={line.assetResidualValue}
                      onChange={(event) => setLine(index, 'assetResidualValue', event.target.value)}
                    />
                  </label>
                  <p className="text-xs text-violet-700 md:col-span-3">
                    Posts to {selectedCategory?.accounts?.asset
                      ? `${selectedCategory.accounts.asset.code} — ${selectedCategory.accounts.asset.name}`
                      : 'the fixed-asset head configured on the selected category'}.
                  </p>
                </div>
              )}
            </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card>
          <label><span className="mb-1 block text-xs font-semibold text-slate-500">Purchase notes</span><textarea rows={4} placeholder="Optional internal note about this purchase…" className={fieldClass} value={form.notes} onChange={(event) => setForm((old) => ({ ...old, notes: event.target.value }))} /></label>
          {isPosted && <label className="mt-4 block"><span className="mb-1 block text-xs font-semibold text-amber-700">Correction reason *</span><textarea rows={3} className={fieldClass} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What was wrong, and what did you verify?" /></label>}
          {!isPosted && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label><span className="mb-1 block text-xs font-semibold text-slate-500">Settlement</span><SearchableSelect searchable={false} options={has('payments.record') ? settlementOptions : settlementOptions.slice(0, 1)} value={form.paymentStatus} onChange={(value) => setForm((old) => ({ ...old, paymentStatus: value }))} /></label>
              {form.paymentStatus === 'paid' && <>
                <label><span className="mb-1 block text-xs font-semibold text-slate-500">Method</span><SearchableSelect searchable={false} options={paymentMethodOptions} value={form.paymentMethod} onChange={(value) => setForm((old) => ({ ...old, paymentMethod: value }))} /></label>
                <label><span className="mb-1 block text-xs font-semibold text-slate-500">Reference</span><input placeholder="Cheque / transfer reference" className={fieldClass} value={form.paymentReference} onChange={(event) => setForm((old) => ({ ...old, paymentReference: event.target.value }))} /></label>
              </>}
            </div>
          )}
        </Card>
        <Card>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <label>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Bill discount</span>
              <input type="number" min="0" step="0.01" placeholder="Rs. 0" className={fieldClass} value={form.discountAmount} onChange={(event) => setForm((old) => ({ ...old, discountAmount: event.target.value }))} />
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Sales tax %</span>
              <input type="number" min="0" max="100" step="0.01" placeholder="0%" className={fieldClass} value={form.taxRate} onChange={(event) => setForm((old) => ({ ...old, taxRate: event.target.value }))} />
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">AIT %</span>
              <input type="number" min="0" max="100" step="0.01" placeholder="0%" className={fieldClass} value={form.aitRate} onChange={(event) => setForm((old) => ({ ...old, aitRate: event.target.value }))} />
            </label>
          </div>
          {[['Subtotal', totals.subtotal], ['Discount', -Number(form.discountAmount)], ['Tax', totals.tax], ['AIT', totals.ait]].map(([label, value]) => <div key={label} className="flex justify-between py-1.5 text-sm text-slate-500"><span>{label}</span><span>{money(value)}</span></div>)}
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-3 text-lg font-bold text-slate-900"><span>Total</span><span>{money(totals.total)}</span></div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {!isPosted && <Button variant="secondary" icon={Save} disabled={saving} onClick={() => submit('draft')}>Save draft</Button>}
            {(isPosted || has('purchases.post')) && (
              <Button icon={Send} disabled={saving} onClick={() => submit(isPosted ? 'correct' : 'post')}>{saving ? 'Saving…' : isPosted ? 'Post correction' : 'Post purchase'}</Button>
            )}
          </div>
        </Card>
      </div>

      {createProductCtx && (
        <CreateProductModal
          ctx={createProductCtx}
          title="Create inventory item"
          description="Create the item in the catalog now. It will be selected on this purchase line."
          onCancel={() => setCreateProductCtx(null)}
          onCreate={submitCreateProduct}
        />
      )}
    </div>
  );
};

export default PurchaseForm;

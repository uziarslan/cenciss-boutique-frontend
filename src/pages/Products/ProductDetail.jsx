import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Pencil, ArrowLeft, Users, Package, Layers, Boxes } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { getProductById } from '../../api/productApi';
import useAuth from '../../hooks/useAuth';
import StatusChip from '../../components/UI/StatusChip';
import Table from '../../components/UI/Table';

const VENDOR_PRICING_TAB = 'Vendor Pricing';
const PRICE_HISTORY_TAB  = 'Price History';

// ── Info row helper ────────────────────────────────────────────────────────────
const InfoRow = ({ label, value }) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 py-2.5 border-b border-gray-100 last:border-0">
    <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-36 shrink-0">{label}</dt>
    <dd className="text-sm text-gray-800">{value ?? '—'}</dd>
  </div>
);

const fmtPKR = (n) =>
  n != null ? `Rs. ${Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

const ProductDetail = () => {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const canEdit  = role === 'owner' || user?.permissions?.['products.manage'] === true;

  const [product,   setProduct]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProductById(id)
      .then(({ data }) => { if (!cancelled) setProduct(data.data); })
      .catch(() => {
        toast.error('Failed to load product.');
        navigate('/products');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, navigate]);

  // ── Vendor pricing columns ────────────────────────────────────────────────
  const vendorColumns = [
    {
      key: 'vendor',
      header: 'Vendor',
      render: (_, row) => (
        <div>
          <button
            onClick={() => row.vendorId?._id && navigate(`/vendors/${row.vendorId._id}`)}
            className="text-indigo-600 hover:underline font-medium text-left"
            disabled={!row.vendorId?._id}
          >
            {row.vendorId?.name ?? '—'}
          </button>
          {row.vendorId?.code && (
            <p className="text-xs font-mono text-gray-400">{row.vendorId.code}</p>
          )}
        </div>
      ),
    },
    { key: 'vendorProductCode', header: 'Vendor Code', className: 'font-mono text-xs' },
    { key: 'packSize',          header: 'Pack Size' },
    { key: 'currentPrice',      header: 'Current Price', render: (v) => fmtPKR(v) },
  ];

  // ── Price history rows: merge vendor-scoped + top-level purchase entries ─
  const vendorScopedRows = (product?.vendors ?? []).flatMap((v) =>
    (v.priceHistory ?? []).map((h, i) => ({
      _id:          `vendor-${v.vendorId?._id ?? 'v'}-${i}`,
      vendorName:   v.vendorId?.name ?? '—',
      vendorCode:   v.vendorId?.code ?? '',
      date:         h.date,
      oldPrice:     h.price,
      currentPrice: v.currentPrice,
      source:       h.source ?? 'vendor',
      sourceNumber: h.purchase?.purchaseNumber ?? h.purchaseAdjustment?.adjustmentNumber ?? null,
      changePercent:
        h.price > 0 && v.currentPrice != null
          ? (((v.currentPrice - h.price) / h.price) * 100).toFixed(1)
          : null,
    }))
  );

  const topLevelRows = (product?.priceHistory ?? []).map((h, i) => ({
    _id:          `top-${i}`,
    vendorName:   h.vendorId?.name ?? '—',
    vendorCode:   h.vendorId?.code ?? '',
    date:         h.date,
    oldPrice:     h.price,
    currentPrice: product.currentPrice,
    source:       h.source ?? 'purchase',
    sourceNumber: h.purchase?.purchaseNumber ?? h.purchaseAdjustment?.adjustmentNumber ?? null,
    changePercent:
      h.price > 0 && product.currentPrice != null
        ? (((product.currentPrice - h.price) / h.price) * 100).toFixed(1)
        : null,
  }));

  const priceHistoryRows = [...vendorScopedRows, ...topLevelRows]
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const priceHistColumns = [
    { key: 'date',         header: 'Date',          render: (v) => v ? format(new Date(v), 'dd MMM yyyy') : '—' },
    { key: 'vendorName',   header: 'Vendor',        className: 'font-medium' },
    { key: 'vendorCode',   header: 'Code',          className: 'font-mono text-xs' },
    {
      key: 'source',
      header: 'Source',
      render: (v, row) => {
        if (v === 'purchase') return row.sourceNumber || 'Purchase';
        if (v === 'purchaseAdjustment') return row.sourceNumber ? `Correction ${row.sourceNumber}` : 'Purchase correction';
        if (v === 'vendor') return 'Vendor update';
        return v ? v.charAt(0).toUpperCase() + v.slice(1) : '—';
      },
    },
    { key: 'oldPrice',     header: 'Old Price',     render: (v) => fmtPKR(v) },
    { key: 'currentPrice', header: 'Current Price', render: (v) => fmtPKR(v) },
    {
      key: 'changePercent',
      header: 'Change',
      render: (v) => {
        if (v == null) return '—';
        const n = parseFloat(v);
        return (
          <span className={clsx('font-semibold', n > 0 ? 'text-red-600' : n < 0 ? 'text-green-600' : 'text-gray-500')}>
            {n > 0 ? '+' : ''}{v}%
          </span>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-24 text-gray-400">
        <p>Product not found.</p>
      </div>
    );
  }

  const vendorCount = product.vendors?.length ?? 0;
  const tabs = vendorCount > 0
    ? [VENDOR_PRICING_TAB, PRICE_HISTORY_TAB]
    : [PRICE_HISTORY_TAB];
  const safeActiveTab = activeTab >= tabs.length ? 0 : activeTab;
  const activeTabName = tabs[safeActiveTab];

  return (
    <div>
      {/* Back + actions */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <button
          onClick={() => navigate('/products')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition"
        >
          <ArrowLeft size={16} /> Back to Products
        </button>
        {canEdit && (
          <button
            onClick={() => navigate(`/products/${id}/edit`)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition"
          >
            <Pencil size={14} /> Edit
          </button>
        )}
      </div>

      {/* Product info card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{product.name}</h1>
            <p className="text-sm text-gray-500 font-mono mt-0.5">{product.sku}</p>
          </div>
          <StatusChip status={String(product.isActive)} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Vendors',     value: vendorCount,                   icon: Users },
            { label: 'Unit',        value: product.unit ?? '—',           icon: Package },
            { label: 'Par Level',   value: product.parLevel ?? 0,         icon: Layers },
            { label: 'Reorder Qty', value: product.reorderQty ?? 0,       icon: Boxes },
          ].map((s) => (
            <div key={s.label} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{s.label}</p>
              <p className="text-lg font-bold text-gray-800 mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>

        <dl>
          <InfoRow label="Category"         value={product.category} />
          <InfoRow label="Storage Location" value={product.storageLocation} />
          <InfoRow label="Shelf Life"       value={product.shelfLifeDays != null ? `${product.shelfLifeDays} days` : null} />
          <InfoRow label="Currency"         value="Rs." />
          {product.createdAt && (
            <InfoRow label="Created" value={format(new Date(product.createdAt), 'dd MMM yyyy')} />
          )}
          {product.notes && <InfoRow label="Notes" value={product.notes} />}
        </dl>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-5 flex gap-1">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition',
              safeActiveTab === i
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {activeTabName === VENDOR_PRICING_TAB && (
        <Table
          columns={vendorColumns}
          data={product.vendors ?? []}
          emptyMessage="No vendors linked to this product yet."
        />
      )}

      {activeTabName === PRICE_HISTORY_TAB && (
        <Table
          columns={priceHistColumns}
          data={priceHistoryRows}
          emptyMessage="No price changes recorded for this product."
        />
      )}
    </div>
  );
};

export default ProductDetail;

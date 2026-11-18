import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Pencil, ArrowLeft, Package, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { getVendorById, getVendorPriceHistory } from '../../api/vendorApi';
import useAuth from '../../hooks/useAuth';
import StatusChip from '../../components/UI/StatusChip';
import Table from '../../components/UI/Table';

const TABS = ['Linked Products', 'Price History'];

// ── Info row helper ────────────────────────────────────────────────────────────
const InfoRow = ({ label, value }) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 py-2.5 border-b border-gray-100 last:border-0">
    <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-36 shrink-0">{label}</dt>
    <dd className="text-sm text-gray-800">{value ?? '—'}</dd>
  </div>
);

const VendorDetail = () => {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const canEdit  = role === 'owner' || user?.permissions?.['vendors.manage'] === true;

  const [vendor,       setVendor]       = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [activeTab,    setActiveTab]    = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      getVendorById(id),
      getVendorPriceHistory(id),
    ])
      .then(([vendorRes, histRes]) => {
        if (cancelled) return;
        setVendor(vendorRes.data.data);
        setPriceHistory(histRes.data.data);
      })
      .catch(() => toast.error('Failed to load vendor details.'))
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [id]);

  // ── Linked products columns ───────────────────────────────────────────────
  const productColumns = [
    { key: 'sku',          header: 'SKU',          className: 'font-mono text-xs' },
    { key: 'name',         header: 'Product',
      render: (v, row) => (
        <button
          onClick={() => navigate(`/products/${row._id}`)}
          className="text-indigo-600 hover:underline font-medium text-left"
        >
          {v}
        </button>
      ),
    },
    { key: 'vendorProductCode', header: 'Vendor Code' },
    { key: 'packSize',     header: 'Pack Size' },
    { key: 'currentPrice', header: 'Current Price', render: (v) => v != null ? `Rs. ${Number(v).toFixed(2)}` : '—' },
    { key: 'unit',         header: 'Unit' },
  ];

  // ── Price history: flatten per product × per archived price ──────────────
  const priceHistoryRows = priceHistory.flatMap((product) =>
    (product.priceHistory ?? []).map((entry) => ({
      _id:         `${product._id}-${entry.date}`,
      productName: product.name,
      sku:         product.sku,
      date:        entry.date,
      oldPrice:    entry.price,
      currentPrice: product.currentPrice,
      changePercent:
        entry.price > 0
          ? (((product.currentPrice - entry.price) / entry.price) * 100).toFixed(1)
          : null,
    }))
  ).sort((a, b) => new Date(b.date) - new Date(a.date));

  const priceHistColumns = [
    { key: 'date',        header: 'Date',    render: (v) => v ? format(new Date(v), 'dd MMM yyyy') : '—' },
    { key: 'productName', header: 'Product', className: 'font-medium' },
    { key: 'sku',         header: 'SKU',     className: 'font-mono text-xs' },
    { key: 'oldPrice',    header: 'Old Price',     render: (v) => `Rs. ${Number(v).toFixed(2)}` },
    { key: 'currentPrice',header: 'Current Price', render: (v) => `Rs. ${Number(v).toFixed(2)}` },
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

  if (!vendor) {
    return (
      <div className="text-center py-24 text-gray-400">
        <p>Vendor not found.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Back + actions */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <button
          onClick={() => navigate('/vendors')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition"
        >
          <ArrowLeft size={16} /> Back to Vendors
        </button>
        {canEdit && (
          <button
            onClick={() => navigate(`/vendors/${id}/edit`)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition"
          >
            <Pencil size={14} /> Edit
          </button>
        )}
      </div>

      {/* Vendor info card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{vendor.name}</h1>
            <p className="text-sm text-gray-500 font-mono mt-0.5">{vendor.code}</p>
          </div>
          <StatusChip status={vendor.status} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Products',     value: vendor.productCount ?? 0, icon: Package },
            { label: 'Open POs',     value: vendor.openPoCount  ?? 0, icon: TrendingUp },
            { label: 'Payment Terms',value: `${vendor.paymentTerms ?? 30} days` },
            { label: 'Credit Limit', value: `Rs. ${(vendor.creditLimit ?? 0).toLocaleString()}` },
          ].map((s) => (
            <div key={s.label} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{s.label}</p>
              <p className="text-lg font-bold text-gray-800 mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>

        <dl>
          <InfoRow label="Category"     value={vendor.category} />
          <InfoRow label="Contact"      value={vendor.contactName} />
          <InfoRow label="Phone"        value={vendor.phone} />
          <InfoRow label="Email"        value={vendor.email} />
          <InfoRow label="Address"      value={[vendor.address?.street, vendor.address?.city, vendor.address?.country].filter(Boolean).join(', ')} />
          <InfoRow label="Currency"     value={'Rs.'} />
          {vendor.notes && <InfoRow label="Notes" value={vendor.notes} />}
        </dl>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-5 flex gap-1">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition',
              activeTab === i
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {activeTab === 0 && (
        <Table
          columns={productColumns}
          data={priceHistory}
          emptyMessage="No products linked to this vendor yet."
        />
      )}

      {activeTab === 1 && (
        <Table
          columns={priceHistColumns}
          data={priceHistoryRows}
          emptyMessage="No price changes recorded for this vendor."
        />
      )}
    </div>
  );
};

export default VendorDetail;

import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Package, ClipboardList, Link2, Layers, Boxes, MapPin, Ruler } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { getStockDetail } from '../../api/inventoryApi';
import StatusChip from '../../components/UI/StatusChip';
import Table from '../../components/UI/Table';

const TABS = ['Related Documents', 'Stock History'];

// ── Info row helper ────────────────────────────────────────────────────────────
const InfoRow = ({ label, value }) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 py-2.5 border-b border-gray-100 last:border-0">
    <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-36 shrink-0">{label}</dt>
    <dd className="text-sm text-gray-800">{value ?? '—'}</dd>
  </div>
);

const fmtPKR = (n) =>
  `Rs. ${Number(n ?? 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtQty = (n) => Number(n ?? 0).toFixed(2);

// ── Stock history timeline ────────────────────────────────────────────────────
const TYPE_CONFIG = {
  purchase:   { label: 'Purchase Posted', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  stockCount: { label: 'Stock Count',    dot: 'bg-indigo-500',  text: 'text-indigo-700'  },
  waste:      { label: 'Waste Logged',   dot: 'bg-rose-500',    text: 'text-rose-700'    },
};

const WASTE_REASON_LABEL = {
  spoilage:       'Spoilage',
  spillage:       'Spillage',
  overProduction: 'Over Production',
  theft:          'Theft',
  expired:        'Expired',
  orderVoid:      'Order Voided',
  other:          'Other',
};

const HistoryItem = ({ entry, navigate }) => {
  const cfg = TYPE_CONFIG[entry.type] ?? { label: entry.type, dot: 'bg-gray-400', text: 'text-gray-700' };
  return (
    <li className="ml-6">
      <span className={clsx(
        'absolute -left-2.5 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center',
        cfg.dot
      )} />
      <div>
        <p className={clsx('text-sm font-semibold', cfg.text)}>
          {cfg.label}
          {entry.type === 'purchase' && entry.purchaseNumber && (
            <button
              onClick={() => navigate(`/purchases/${entry.purchaseId}`)}
              className="ml-2 text-xs font-mono text-indigo-600 hover:underline"
            >
              {entry.purchaseNumber}
            </button>
          )}
        </p>

        {entry.type === 'purchase' && (
          <p className="text-xs text-gray-500 mt-0.5">
            +{entry.receivedQty} {entry.unit ?? ''} received
            {entry.unitPrice > 0 ? ` · ${fmtPKR(entry.unitPrice)}/unit · Total ${fmtPKR(entry.lineTotal)}` : ''}
            {entry.vendor?.name ? ` · ${entry.vendor.name}` : ''}
            {entry.receivedBy?.name ? ` · by ${entry.receivedBy.name}` : ''}
          </p>
        )}

        {entry.type === 'stockCount' && (
          <p className="text-xs text-gray-500 mt-0.5">
            System: {entry.systemQty} → Counted: {entry.countedQty}
            {entry.variance !== 0 && (
              <span className={clsx('ml-1 font-semibold', entry.variance > 0 ? 'text-emerald-600' : 'text-rose-600')}>
                ({entry.variance > 0 ? '+' : ''}{entry.variance})
              </span>
            )}
            {entry.countedBy?.name ? ` · by ${entry.countedBy.name}` : ''}
          </p>
        )}

        {entry.type === 'waste' && (
          <p className="text-xs text-gray-500 mt-0.5">
            -{entry.qty} {entry.unit ?? ''} · {WASTE_REASON_LABEL[entry.reason] ?? entry.reason}
            {entry.totalCost > 0 ? ` · Cost ${fmtPKR(entry.totalCost)}` : ''}
            {entry.loggedBy?.name ? ` · by ${entry.loggedBy.name}` : ''}
          </p>
        )}

        <p className="text-xs text-gray-400 mt-0.5">
          {entry.date ? format(new Date(entry.date), 'dd MMM yyyy, HH:mm') : '—'}
        </p>
      </div>
    </li>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const StockDetail = () => {
  const { productId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const outlet = searchParams.get('outlet');

  const [detail,    setDetail]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getStockDetail(productId, outlet ? { outlet } : {})
      .then(({ data }) => { if (!cancelled) setDetail(data.data); })
      .catch(() => toast.error('Failed to load stock detail.'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId, outlet]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!detail) {
    return <div className="text-center py-24 text-gray-400">Stock item not found.</div>;
  }

  const { stockItem, product, history, purchases = [] } = detail;
  const belowPar = product?.parLevel > 0 && stockItem.qtyOnHand < product.parLevel;
  const hasDocs = purchases.length > 0;

  // ── Document table columns ────────────────────────────────────────────────
  const purchaseColumns = [
    { key: 'purchaseNumber', header: 'Purchase #',
      render: (v) => <span className="font-mono text-xs font-semibold text-indigo-700">{v}</span> },
    { key: 'vendor', header: 'Vendor',
      render: (_, row) => <span className="text-gray-700">{row.vendor?.name ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (v) => <StatusChip status={v} /> },
    { key: 'itemSummary', header: 'Items',
      render: (v) => <span className="text-xs text-gray-500">{v || '—'}</span> },
    { key: 'totalAmount', header: 'Total', align: 'right',
      render: (v) => <span className="font-semibold tabular-nums">{fmtPKR(v)}</span> },
    { key: 'purchaseDate', header: 'Date',
      render: (v) => v ? format(new Date(v), 'dd MMM yyyy') : '—' },
  ];

  return (
    <div>
      {/* Back */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <button
          onClick={() => navigate('/inventory/stock')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition"
        >
          <ArrowLeft size={16} /> Back to Stock
        </button>
      </div>

      {/* Stock info card */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <Package size={22} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-xs font-mono text-gray-400">{product?.sku ?? stockItem.product}</p>
              <h1 className="text-2xl font-bold text-gray-800 mt-0.5">{product?.name ?? '—'}</h1>
              {product?.category && (
                <p className="text-sm text-gray-500 mt-0.5">{product.category}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {belowPar ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">
                Below Par
              </span>
            ) : (
              <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                In Stock
              </span>
            )}
            {stockItem.outlet && (
              <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                {typeof stockItem.outlet === 'object'
                  ? (stockItem.outlet.name ?? stockItem.outlet.code ?? '—')
                  : stockItem.outlet}
              </span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: 'Qty On Hand',
              value: fmtQty(stockItem.qtyOnHand),
              icon:  Boxes,
              tone:  belowPar ? 'text-rose-600' : 'text-gray-800',
              iconBg:belowPar ? 'bg-rose-50'    : 'bg-indigo-50',
              iconColor: belowPar ? 'text-rose-600' : 'text-indigo-600',
            },
            {
              label: 'Par Level',
              value: product?.parLevel > 0 ? fmtQty(product.parLevel) : '—',
              icon:  Layers,
              tone:  'text-gray-800',
              iconBg:'bg-violet-50',
              iconColor: 'text-violet-600',
            },
            {
              label: 'Reorder Qty',
              value: product?.reorderQty > 0 ? fmtQty(product.reorderQty) : '—',
              icon:  Ruler,
              tone:  'text-gray-800',
              iconBg:'bg-amber-50',
              iconColor: 'text-amber-600',
            },
            {
              label: 'Location',
              value: stockItem.location ?? '—',
              icon:  MapPin,
              tone:  'text-gray-800',
              iconBg:'bg-cyan-50',
              iconColor: 'text-cyan-600',
            },
          ].map((s) => (
            <div key={s.label} className="bg-gray-50 rounded-lg p-3 flex items-center gap-3">
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

        <dl>
          <InfoRow label="Unit"          value={stockItem.unit} />
          <InfoRow label="Last Count"
            value={stockItem.lastCountDate ? `${format(new Date(stockItem.lastCountDate), 'dd MMM yyyy')} · ${fmtQty(stockItem.lastCountQty)}` : null}
          />
          <InfoRow label="Last Variance"
            value={stockItem.lastCountVariance != null ? (
              <span className={clsx(
                'font-semibold',
                stockItem.lastCountVariance > 0 ? 'text-emerald-600' :
                stockItem.lastCountVariance < 0 ? 'text-rose-600' : 'text-gray-500'
              )}>
                {stockItem.lastCountVariance > 0 ? '+' : ''}{fmtQty(stockItem.lastCountVariance)}
              </span>
            ) : null}
          />
          <InfoRow label="Currency" value="Rs." />
        </dl>
      </div>

      {/* Tabs */}
      <div className="-mx-4 mb-5 overflow-x-auto border-b border-gray-200 px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1">
        {TABS.map((tab, i) => {
          const disabled = (i === 0 && !hasDocs);
          return (
            <button
              key={tab}
              onClick={() => !disabled && setActiveTab(i)}
              disabled={disabled}
              className={clsx(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-1.5',
                activeTab === i
                  ? 'border-indigo-600 text-indigo-600'
                  : disabled
                    ? 'border-transparent text-gray-300 cursor-not-allowed'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              {tab}
              {i === 1 && (history?.length ?? 0) > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600">
                  {history.length}
                </span>
              )}
            </button>
          );
        })}
        </div>
      </div>

      {/* Tab panels */}
      {activeTab === 0 && hasDocs && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Link2 size={15} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Posted Purchases</h2>
              <p className="text-xs text-gray-400 mt-0.5">{purchases.length} linked purchase{purchases.length === 1 ? '' : 's'}</p>
            </div>
          </div>
          <Table
            columns={purchaseColumns}
            data={purchases}
            onRowClick={(purchase) => navigate(`/purchases/${purchase._id}`)}
            bare
          />
        </div>
      )}

      {activeTab === 1 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <ClipboardList size={15} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Stock History</h2>
              <p className="text-xs text-gray-400 mt-0.5">All movements for this item</p>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            {(history?.length ?? 0) === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No history recorded yet.</p>
            ) : (
              <ol className="relative border-l border-gray-200 ml-3 space-y-6">
                {history.map((entry, i) => (
                  <HistoryItem
                    key={`${entry.type}-${entry.purchaseId ?? entry.stockCountId ?? entry.wasteLogId ?? i}`}
                    entry={entry}
                    navigate={navigate}
                  />
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StockDetail;

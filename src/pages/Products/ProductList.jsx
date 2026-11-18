import { useState, useEffect, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router';
import { Plus, Search, Eye, Pencil, Trash2, Package, CheckCircle2, XCircle, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import { deleteProduct } from '../../api/productApi';
import { baseApi, useGetProductsListQuery, listQueryOpts } from '../../store/baseApi';
import useDebounce from '../../hooks/useDebounce';
import usePagination from '../../hooks/usePagination';
import useAuth from '../../hooks/useAuth';
import usePermissions from '../../hooks/usePermissions';
import Table from '../../components/UI/Table';
import StatusChip from '../../components/UI/StatusChip';
import SearchableSelect from '../../components/UI/SearchableSelect';
import HeroBanner from '../../components/UI/HeroBanner';
import StatTile from '../../components/UI/StatTile';
import FilterBar from '../../components/UI/FilterBar';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import ConfirmModal from '../../components/UI/ConfirmModal';
import Pagination from '../../components/UI/Pagination';
import useQueryState from '../../hooks/useQueryState';

const CATEGORIES = ['Fabric', 'Lining', 'Thread & Yarn', 'Trims & Notions', 'Buttons & Fasteners', 'Dye & Finishing', 'Labels', 'Packaging', 'Tools & Supplies', 'Other'];

const ProductList = () => {
  const navigate  = useNavigate();
  const dispatch  = useDispatch();
  useAuth();
  const { has } = usePermissions();
  // View-only users don't see Add/Edit/Delete — gate every mutation on the
  // explicit permission key.
  const canWrite  = has('products.manage');
  const canDelete = has('products.manage');

  const [search, setSearch] = useQueryState('search', '');
  const [category, setCategory] = useQueryState('category', '');
  const [isActive, setIsActive] = useQueryState('active', '');
  const [unit, setUnit] = useQueryState('unit', '');
  const [storageLocation, setStorageLocation] = useQueryState('storageLocation', '');
  const [vendorState, setVendorState] = useQueryState('vendorState', '');
  const [minParLevel, setMinParLevel] = useQueryState('minParLevel', '');
  const [maxParLevel, setMaxParLevel] = useQueryState('maxParLevel', '');
  const [minPrice, setMinPrice] = useQueryState('minPrice', '');
  const [maxPrice, setMaxPrice] = useQueryState('maxPrice', '');
  const [sort, setSort] = useQueryState('sort', 'newest');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting,     setDeleting]     = useState(false);

  const debouncedSearch = useDebounce(search, 400);
  const pagination      = usePagination(20);

  const queryParams = useMemo(() => ({
    page:     pagination.page,
    limit:    pagination.pageSize,
    search:   debouncedSearch || undefined,
    category: category  || undefined,
    isActive: isActive  !== '' ? isActive : undefined,
    unit: unit || undefined,
    storageLocation: storageLocation || undefined,
    vendorState: vendorState || undefined,
    minParLevel: minParLevel || undefined,
    maxParLevel: maxParLevel || undefined,
    minPrice: minPrice || undefined,
    maxPrice: maxPrice || undefined,
    sortBy: ({ newest: 'createdAt', oldest: 'createdAt', name: 'name', parHigh: 'parLevel', priceHigh: 'currentPrice' })[sort],
    sortOrder: ['oldest', 'name'].includes(sort) ? 'asc' : 'desc',
    // Prep-recipe backing products are produced in-house, not purchased —
    // keep them out of the raw-ingredient catalog.
    kind:     'standard',
  }), [pagination.page, pagination.pageSize, debouncedSearch, category, isActive, unit, storageLocation, vendorState, minParLevel, maxParLevel, minPrice, maxPrice, sort]);

  const { data: payload, isLoading: loading } = useGetProductsListQuery(queryParams, listQueryOpts);
  const products = useMemo(() => payload?.products ?? [], [payload]);
  const total = payload?.total;

  useEffect(() => {
    if (total != null) pagination.setTotal(total);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  useEffect(() => { pagination.reset(); }, [debouncedSearch, category, isActive, unit, storageLocation, vendorState, minParLevel, maxParLevel, minPrice, maxPrice, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProduct(deleteTarget._id);
      toast.success(`${deleteTarget.name} deactivated.`);
      setDeleteTarget(null);
      dispatch(baseApi.util.invalidateTags(['Product']));
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to deactivate product.');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: 'sku',      header: 'SKU',      className: 'font-mono text-xs' },
    { key: 'name',     header: 'Name',
      render: (v, row) => (
        <button
          onClick={() => navigate(`/products/${row._id}`)}
          className="font-medium text-indigo-600 hover:underline text-left"
        >
          {v}
        </button>
      ),
    },
    { key: 'category', header: 'Category' },
    { key: 'unit',     header: 'Unit' },
    { key: 'parLevel', header: 'Par Level',
      render: (v, row) => {
        const belowPar = row._belowPar;
        return (
          <span className={belowPar ? 'text-amber-600 font-semibold' : ''}>
            {v ?? 0}
          </span>
        );
      },
    },
    { key: 'vendors',  header: 'Primary Vendor',
      render: (v) => {
        const first = v?.[0];
        return first?.vendorId?.name ?? first?.vendorId?.code ?? '—';
      },
    },
    { key: 'isActive', header: 'Status',   render: (v) => <StatusChip status={String(v)} /> },
    {
      key: '_actions',
      header: '',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/products/${row._id}`)}
            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
            title="View"
          >
            <Eye size={15} />
          </button>
          {canWrite && (
            <button
              onClick={() => navigate(`/products/${row._id}/edit`)}
              className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
              title="Edit"
            >
              <Pencil size={15} />
            </button>
          )}
          {canDelete && row.isActive && (
            <button
              onClick={() => setDeleteTarget(row)}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
              title="Deactivate"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ),
    },
  ];

  const activeCount = products.filter((p) => p.isActive).length;
  const inactiveCount = products.filter((p) => !p.isActive).length;
  const categoryCount = new Set(products.map((p) => p.category).filter(Boolean)).size;

  return (
    <div className="space-y-5">
      <HeroBanner
        icon={Package}
        eyebrow="Catalogue"
        title="Products"
        subtitle="Raw material catalogue used for purchases, store quantities, and boutique manufacturing."
        accent="violet"
        actions={canWrite && (
          <Button
            variant="secondary"
            icon={Plus}
            onClick={() => navigate('/products/new')}
           
          >
            Add Product
          </Button>
        )}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Total" value={pagination.total} icon={Package} gradient="violet" />
        <StatTile label="Active" value={activeCount} icon={CheckCircle2} gradient="emerald" />
        <StatTile label="Inactive" value={inactiveCount} icon={XCircle} gradient="slate" />
        <StatTile label="Categories" value={categoryCount} icon={Layers} gradient="cyan" />
      </div>

      <FilterBar>
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="min-w-[180px]">
          <SearchableSelect
            options={[{ value: '', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
            value={category}
            onChange={setCategory}
          />
        </div>

        <div className="min-w-[160px]">
          <SearchableSelect
            options={[
              { value: '', label: 'All products' },
              { value: 'true', label: 'Active only' },
              { value: 'false', label: 'Inactive only' },
            ]}
            value={isActive}
            onChange={setIsActive}
          />
        </div>
        <div className="min-w-[150px]"><SearchableSelect options={[{ value: '', label: 'All units' }, ...['kg', 'g', 'litre', 'ml', 'pcs', 'pack', 'box', 'dozen'].map((value) => ({ value, label: value }))]} value={unit} onChange={setUnit} /></div>
        <input value={storageLocation} onChange={(e) => setStorageLocation(e.target.value)} placeholder="Storage location" className="w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <div className="min-w-[180px]"><SearchableSelect searchable={false} options={[{ value: '', label: 'Any vendor state' }, { value: 'with-vendor', label: 'Has vendor' }, { value: 'without-vendor', label: 'Missing vendor' }]} value={vendorState} onChange={setVendorState} /></div>
        <input type="number" min="0" value={minParLevel} onChange={(e) => setMinParLevel(e.target.value)} placeholder="Minimum par level" className="w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <input type="number" min="0" value={maxParLevel} onChange={(e) => setMaxParLevel(e.target.value)} placeholder="Maximum par level" className="w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <input type="number" min="0" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="Minimum price" className="w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <input type="number" min="0" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Maximum price" className="w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <div className="min-w-[180px]"><SearchableSelect searchable={false} options={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'name', label: 'Product name' }, { value: 'parHigh', label: 'Highest par level' }, { value: 'priceHigh', label: 'Highest price' }]} value={sort} onChange={setSort} /></div>
      </FilterBar>

      <Card padding={false}>
        <Table
          columns={columns}
          data={products}
          loading={loading}
          emptyMessage="No products found. Try adjusting your filters."
          rowClassName={(row) => !row.isActive ? 'opacity-60' : ''}
          bare
        />
      </Card>

      <Pagination {...pagination} />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Deactivate product?"
        message={`"${deleteTarget?.name}" will be marked inactive. Products on open POs cannot be deactivated.`}
        confirmLabel="Deactivate"
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default ProductList;

import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Plus, Trash2, FlaskConical, ChefHat, Boxes, AlertTriangle, Lock, Unlock, Loader2, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  createPrepRecipe,
  updatePrepRecipe,
  deletePrepRecipe,
  producePrepBatch,
  createIngredient,
  getPrepRecipe,
  setPrepLock,
} from '../../api/menuApi';
import { useGetPrepRecipesQuery, listQueryOpts, baseApi } from '../../store/baseApi';
import SearchableSelect from '../../components/UI/SearchableSelect';
import PremiumModal, { SecondaryButton, PrimaryButton } from '../../components/UI/PremiumModal';
import ConfirmModal from '../../components/UI/ConfirmModal';
import EmptyState from '../../components/UI/EmptyState';
import Button from '../../components/UI/Button';
import { CATEGORIES } from '../Products/ProductForm';
import { ProductSearchSelect, CreateIngredientModal } from './RecipeEditor';
import RecipeUnlockModal from '../../components/Menu/RecipeUnlockModal';
import { clearRecipeUnlockToken } from '../../utils/recipeUnlock';
import { ALL_RECIPE_UNITS, recipeUnitsForProduct } from '../../utils/units';
import { filterPrepRecipes } from './prepRecipeSearch';
import PrepRecipeCostDrawer from './PrepRecipeCostDrawer';
import useQueryState from '../../hooks/useQueryState';

const UNITS = ALL_RECIPE_UNITS;
const CATEGORY_OPTIONS = [{ value: 'Prep', label: 'Prep' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))];

const fmtCurrency = (val) => {
  try {
    return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(Number(val ?? 0));
  } catch (e) { return `PKR ${Number(val ?? 0).toFixed(2)}`; }
};

const tempId = () => `temp-${Math.random().toString(36).slice(2)}`;
const emptyRow = () => ({ _tempId: tempId(), product: '', qty: '', unit: 'g' });

// ═══════════════════════════════════════════════════════════════════════════════
// Prep recipe editor modal
// ═══════════════════════════════════════════════════════════════════════════════
const PrepRecipeEditor = ({ isOpen, onClose, onSubmit, initialData, products, onLockChange }) => {
  const dispatch = useDispatch();
  const editing = Boolean(initialData?._id);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Prep');
  const [yieldQty, setYieldQty] = useState('');
  const [yieldUnit, setYieldUnit] = useState('kg');
  const [rows, setRows] = useState([emptyRow()]);
  const [localProducts, setLocalProducts] = useState(products || []);
  const [createCtx, setCreateCtx] = useState(null);
  const [locked, setLocked] = useState(!!initialData?.locked);
  const [lockBusy, setLockBusy] = useState(false);

  useEffect(() => { setLocalProducts(products || []); }, [products]);

  useEffect(() => {
    if (!isOpen) return;
    setName(initialData?.name || '');
    setCategory(initialData?.category || 'Prep');
    setYieldQty(initialData?.yieldQty ?? '');
    setYieldUnit(initialData?.yieldUnit || 'kg');
    setLocked(!!initialData?.locked);
    const ings = initialData?.ingredients || [];
    setRows(
      ings.length > 0
        ? ings.map((i) => ({
            _tempId: tempId(),
            product: i.product?._id ?? i.product ?? '',
            qty: i.qty ?? '',
            unit: i.unit ?? 'g',
          }))
        : [emptyRow()]
    );
  }, [isOpen, initialData]);

  // Don't let a prep list its own backing product as an ingredient.
  const ownProductId = initialData?.product?._id ?? initialData?.product ?? null;
  const candidateProducts = useMemo(
    () => (localProducts || []).filter((p) => p._id !== ownProductId),
    [localProducts, ownProductId]
  );

  const updateRow = (idx, field, value) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));

  // Units offered for a row, restricted to the selected product's family.
  const rowUnitOptions = (productId) => {
    const p = (localProducts || []).find((x) => x._id === productId);
    const base = p?.unit;
    const fam = recipeUnitsForProduct(base);
    const list = base && !fam.includes(base) ? [base, ...fam] : fam;
    return list.map((u) => ({ value: u, label: u }));
  };

  // On product pick, default the unit to that product's base unit.
  const selectRowProduct = (idx, productId) => {
    updateRow(idx, 'product', productId);
    const p = (localProducts || []).find((x) => x._id === productId);
    if (p?.unit) updateRow(idx, 'unit', p.unit);
  };
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (idx) =>
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length === 0 ? [emptyRow()] : next;
    });

  // Inline create of a brand-new raw ingredient (no stock yet), then select it.
  const submitCreate = async ({ name: n, unit, category: cat }) => {
    try {
      const { data } = await createIngredient({ name: n, unit: unit || 'pcs', category: cat });
      const product = data?.data;
      if (product) {
        setLocalProducts((prev) => (prev.some((p) => p._id === product._id) ? prev : [...prev, product]));
        if (createCtx) updateRow(createCtx.idx, 'product', product._id);
        dispatch(baseApi.util.invalidateTags(['MenuItem', 'Product']));
        toast.success(`Ingredient "${product.name}" added.`);
        setCreateCtx(null);
        return true;
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create ingredient.');
    }
    return false;
  };

  // Lock / unlock this prep. Locking (ON) needs the feature enabled; unlocking
  // (OFF) requires a valid unlock token, which the caller already holds.
  const toggleLock = async () => {
    if (!initialData?._id || lockBusy) return;
    const next = !locked;
    setLockBusy(true);
    try {
      await setPrepLock(initialData._id, next);
      setLocked(next);
      toast.success(next ? 'Prep recipe locked.' : 'Prep recipe unlocked.');
      onLockChange?.(initialData._id, next);
    } catch (err) {
      const status = err?.response?.status;
      toast.error(status === 400
        ? 'Set a recipe password in Settings → Recipe Lock first.'
        : err?.response?.data?.message || 'Could not change the lock.');
    } finally {
      setLockBusy(false);
    }
  };

  const handleSave = () => {
    if (name.trim().length < 2) { toast.error('Enter a name for this prep recipe.'); return; }
    const qty = parseFloat(yieldQty);
    if (!qty || qty <= 0) { toast.error('Enter how much one batch makes (yield).'); return; }
    const valid = rows.filter((r) => r.product && r.qty && r.unit);
    if (valid.length === 0) { toast.error('Add at least one ingredient with a product, quantity, and unit.'); return; }

    onSubmit({
      name: name.trim(),
      category: category || 'Prep',
      yieldQty: qty,
      yieldUnit,
      ingredients: valid.map((r) => ({ product: r.product, qty: parseFloat(r.qty), unit: r.unit })),
    });
  };

  if (!isOpen) return null;

  return (
    <PremiumModal
      open
      onClose={() => onClose(false)}
      icon={ChefHat}
      eyebrow={editing ? 'Edit Prep Recipe' : 'New Prep Recipe'}
      title={editing ? 'Edit Prep Recipe' : 'New Prep Recipe'}
      subtitle="A reusable preparation (marination, sauce…) built from products and produced into stock."
      accent="indigo"
      size="xl"
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          {editing ? (
            <button
              type="button"
              onClick={toggleLock}
              disabled={lockBusy}
              title={locked ? 'Remove password protection from this prep recipe' : 'Require the recipe password to view this prep recipe'}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50 border',
                locked
                  ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              )}
            >
              {lockBusy ? <Loader2 size={14} className="animate-spin" /> : (locked ? <Unlock size={14} /> : <Lock size={14} />)}
              {locked ? 'Unlock' : 'Lock'}
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <SecondaryButton type="button" onClick={() => onClose(false)}>Cancel</SecondaryButton>
            <PrimaryButton type="button" onClick={handleSave} accent="indigo">
              {editing ? 'Save Changes' : 'Create Prep Recipe'}
            </PrimaryButton>
          </div>
        </div>
      }
    >
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        {/* Name / category / yield */}
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tikka Marination"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Category</label>
            <SearchableSelect options={CATEGORY_OPTIONS} value={category} onChange={setCategory} placeholder="Select category…" searchPlaceholder="Search…" />
          </div>
        </div>

        <div className="flex items-end gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3">
          <Boxes size={18} className="text-indigo-500 mb-2.5 shrink-0" />
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-indigo-600">One batch makes</label>
            <div className="grid grid-cols-[1fr_1fr] gap-2">
              <input
                type="number" min="0.001" step="0.001"
                value={yieldQty}
                onChange={(e) => setYieldQty(e.target.value)}
                placeholder="0.00"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
              />
              <SearchableSelect options={UNITS.map((u) => ({ value: u, label: u }))} value={yieldUnit} onChange={setYieldUnit} />
            </div>
          </div>
        </div>

        {/* Ingredient header */}
        <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] px-1">
          <span>Ingredient</span>
          <span>Qty / Batch</span>
          <span>Unit</span>
          <span />
        </div>

        {rows.map((row, idx) => (
          <div key={row._tempId} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-start">
            <ProductSearchSelect
              products={candidateProducts}
              value={row.product}
              onChange={(v) => selectRowProduct(idx, v)}
              onRequestCreate={(n) => setCreateCtx({ idx, name: n, unit: row.unit })}
            />
            <input
              type="number" min="0.001" step="0.001"
              value={row.qty}
              onChange={(e) => updateRow(idx, 'qty', e.target.value)}
              placeholder="0.00"
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            />
            <SearchableSelect options={rowUnitOptions(row.product)} value={row.unit} onChange={(v) => updateRow(idx, 'unit', v)} />
            <button
              type="button"
              onClick={() => removeRow(idx)}
              className="mt-0.5 rounded-lg p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
              aria-label="Remove ingredient"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 rounded-lg transition w-fit"
        >
          <Plus size={13} /> Add ingredient
        </button>

        <p className="text-[11px] text-slate-400">
          Tip: a prep can include another prep (tagged <span className="font-semibold text-amber-600">Prep</span>) — its cost rolls up automatically.
        </p>
      </div>

      {createCtx && (
        <CreateIngredientModal ctx={createCtx} onCancel={() => setCreateCtx(null)} onCreate={submitCreate} />
      )}
    </PremiumModal>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Produce batch modal
// ═══════════════════════════════════════════════════════════════════════════════
const ProduceModal = ({ prep, onClose, onConfirm }) => {
  const [batches, setBatches] = useState('1');
  if (!prep) return null;
  const n = parseFloat(batches) || 0;
  const produced = n > 0 ? (prep.yieldQty * n) : 0;

  return (
    <PremiumModal
      open
      onClose={onClose}
      icon={Boxes}
      eyebrow="Produce Batch"
      title={`Produce — ${prep.name}`}
      subtitle="Deducts the ingredients from stock and adds the finished prep."
      accent="indigo"
      size="md"
      footer={
        <>
          <SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton type="button" onClick={() => onConfirm(n)} accent="indigo" disabled={n <= 0}>
            Produce
          </PrimaryButton>
        </>
      }
    >
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Number of batches</label>
          <input
            type="number" min="0.1" step="0.1" autoFocus
            value={batches}
            onChange={(e) => setBatches(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
        <div className="rounded-xl bg-indigo-50/60 border border-indigo-100 px-4 py-3 text-sm text-indigo-800">
          This will add <span className="font-bold">{produced.toLocaleString()} {prep.yieldUnit}</span> to stock
          {' '}(currently {Number(prep.qtyOnHand || 0).toLocaleString()} {prep.yieldUnit} on hand).
        </div>
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-start gap-2">
          <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
          If an ingredient runs short its stock will go negative and you'll be warned — restock it via purchasing.
        </div>
      </div>
    </PremiumModal>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main — Prep Recipes tab
// ═══════════════════════════════════════════════════════════════════════════════
const PrepRecipes = ({ outlet, products, canManage, onProductsChanged }) => {
  const dispatch = useDispatch();
  const [preps, setPreps] = useState([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPrep, setEditingPrep] = useState(null);
  const [produceTarget, setProduceTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailPrep, setDetailPrep] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // Prep whose locked recipe is awaiting a password before its editor opens.
  const [unlockPromptPrep, setUnlockPromptPrep] = useState(null);
  const [unlockIntent, setUnlockIntent] = useState(null); // 'edit' | 'details'
  // Prep id whose full detail is being fetched (spinner on its Edit button).
  const [openingId, setOpeningId] = useState(null);
  const [searchQuery, setSearchQuery] = useQueryState('search', '');

  const outletId = outlet?._id;

  // Read from the shared RTK Query cache, then mirror into local state so the
  // optimistic create / edit / produce / delete UX keeps working.
  const queryParams = useMemo(() => ({ outlet: outletId }), [outletId]);
  const { data: prepsPayload, isLoading: loading } = useGetPrepRecipesQuery(
    queryParams,
    { ...listQueryOpts, skip: !outletId }
  );

  // /menu/prep-recipes returns `{ data: [...] }`; the cached payload is that
  // inner array directly.
  useEffect(() => {
    setPreps(Array.isArray(prepsPayload) ? prepsPayload : []);
  }, [prepsPayload]);

  const filteredPreps = useMemo(
    () => filterPrepRecipes(preps, searchQuery),
    [preps, searchQuery],
  );

  // Invalidate the cache to refetch from the server (used for failure recovery).
  const reload = () => dispatch(baseApi.util.invalidateTags(['PrepRecipe']));

  // ── Optimistic create / update ──────────────────────────────────────────────
  const handleSubmit = (values) => {
    const isEditing = Boolean(editingPrep?._id);
    setEditorOpen(false);
    const target = editingPrep;
    setEditingPrep(null);

    if (isEditing) {
      // Apply locally first; reconcile (incl. recomputed cost) when the server replies.
      setPreps((cur) => cur.map((p) => (p._id === target._id
        ? { ...p, ...values, ingredients: values.ingredients }
        : p)));
      updatePrepRecipe(target._id, values)
        .then(({ data }) => {
          if (data?.data) setPreps((cur) => cur.map((p) => (p._id === target._id ? data.data : p)));
          dispatch(baseApi.util.invalidateTags(['PrepRecipe', 'Product']));
          onProductsChanged?.(); // a rename updates the backing product label
        })
        .catch((err) => {
          toast.error(err.response?.data?.message || 'Failed to save prep recipe.');
          reload();
        })
        // Save is done — drop the unlock token so the next open re-prompts (the
        // save above still carried it).
        .finally(() => clearRecipeUnlockToken());
    } else {
      const tmp = tempId();
      const optimistic = {
        _id: tmp, ...values, costPerUnit: 0, costPerBatch: 0, qtyOnHand: 0,
        product: null, _pending: true,
      };
      setPreps((cur) => [...cur, optimistic].sort((a, b) => a.name.localeCompare(b.name)));
      createPrepRecipe(values)
        .then(({ data }) => {
          if (data?.data) {
            setPreps((cur) => cur.map((p) => (p._id === tmp ? data.data : p)).sort((a, b) => a.name.localeCompare(b.name)));
          }
          dispatch(baseApi.util.invalidateTags(['PrepRecipe', 'Product']));
          onProductsChanged?.(); // surface the new prep in menu/prep ingredient pickers
        })
        .catch((err) => {
          toast.error(err.response?.data?.message || 'Failed to create prep recipe.');
          setPreps((cur) => cur.filter((p) => p._id !== tmp));
        });
    }
  };

  // ── Optimistic produce ──────────────────────────────────────────────────────
  const handleProduce = (batches) => {
    const prep = produceTarget;
    setProduceTarget(null);
    if (!prep || batches <= 0) return;
    const delta = prep.yieldQty * batches;

    setPreps((cur) => cur.map((p) => (p._id === prep._id ? { ...p, qtyOnHand: (p.qtyOnHand || 0) + delta } : p)));
    toast.success(`Produced ${delta.toLocaleString()} ${prep.yieldUnit} of ${prep.name}.`);

    producePrepBatch(prep._id, { batches, outlet: outletId })
      .then(({ data }) => {
        const d = data?.data;
        if (d) {
          setPreps((cur) => cur.map((p) => (p._id === prep._id ? { ...p, qtyOnHand: d.qtyOnHand } : p)));
          (d.warnings || []).forEach((w) => toast(w, { icon: '⚠️' }));
        }
        dispatch(baseApi.util.invalidateTags(['PrepRecipe', 'Product', 'Stock']));
      })
      .catch((err) => {
        toast.error(err.response?.data?.message || 'Failed to produce batch.');
        setPreps((cur) => cur.map((p) => (p._id === prep._id ? { ...p, qtyOnHand: (p.qtyOnHand || 0) - delta } : p)));
      });
  };

  // ── Optimistic delete ───────────────────────────────────────────────────────
  const handleDelete = () => {
    const prep = deleteTarget;
    if (!prep) return;
    setDeleting(true);
    const snapshot = preps;
    setPreps((cur) => cur.filter((p) => p._id !== prep._id));
    deletePrepRecipe(prep._id)
      .then(() => {
        toast.success('Prep recipe deleted.');
        dispatch(baseApi.util.invalidateTags(['PrepRecipe', 'Product']));
        onProductsChanged?.();
      })
      .catch((err) => {
        toast.error(err.response?.data?.message || 'Failed to delete prep recipe.');
        setPreps(snapshot);
      })
      .finally(() => { setDeleting(false); setDeleteTarget(null); });
  };

  const openCreate = () => { setEditingPrep(null); setEditorOpen(true); };

  const fetchAndShowDetails = async (prep) => {
    try {
      const { data } = await getPrepRecipe(prep._id, { outlet: outletId });
      setDetailPrep({ ...prep, ...(data?.data || {}) });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to open prep recipe details.');
    } finally {
      // The fetched composition now lives only in the drawer state; do not leave
      // the recipe-unlock token available to unrelated requests.
      clearRecipeUnlockToken();
    }
  };

  const openDetails = (prep) => {
    if (!prep || prep._pending) return;
    if (prep.locked) {
      clearRecipeUnlockToken();
      setUnlockIntent('details');
      setUnlockPromptPrep(prep);
      return;
    }
    setDetailPrep(prep);
  };

  // For a locked prep, fetch the full recipe (ingredients) with the unlock token
  // attached, since the cached list row withholds them. Then open the editor.
  const fetchAndEdit = async (prep) => {
    setOpeningId(prep._id);
    try {
      const { data } = await getPrepRecipe(prep._id, { outlet: outletId });
      setEditingPrep(data?.data || prep);
      setEditorOpen(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to open prep recipe.');
    } finally {
      setOpeningId(null);
    }
  };

  const openEdit = (prep) => {
    // A locked prep ALWAYS prompts for the password (every open). Drop any stale
    // token first so the lock never silently opens; the editor is fetched only
    // after a fresh unlock (onUnlocked → fetchAndEdit).
    if (prep.locked) {
      clearRecipeUnlockToken();
      setUnlockIntent('edit');
      setUnlockPromptPrep(prep);
    } else {
      setEditingPrep(prep);
      setEditorOpen(true);
    }
  };

  const handleLockChange = (id, next) => {
    setPreps((cur) => cur.map((p) => (p._id === id ? { ...p, locked: next } : p)));
    dispatch(baseApi.util.invalidateTags(['PrepRecipe']));
  };

  return (
    <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <ChefHat size={15} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-800">Prep Recipes</h2>
            <p className="text-xs text-gray-400 mt-0.5">Click a prep recipe for its ingredient and purchase-cost breakdown.</p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <div className="relative w-full sm:w-72">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              inputMode="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search prep recipes…"
              aria-label="Search prep recipes"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear prep recipe search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <Button variant="primary" icon={Plus} onClick={openCreate} disabled={!canManage}>
            Add Prep Recipe
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-slate-50/80 border-b border-slate-100">
            <tr>
              {['Name', 'Yield', 'Cost / Unit', 'On Hand', 'Ingredients', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm animate-pulse">Loading prep recipes…</td></tr>
            )}
            {!loading && preps.length === 0 && (
              <EmptyState message="No prep recipes yet. Create one to reuse marinations, sauces and bases across your menu." />
            )}
            {!loading && preps.length > 0 && filteredPreps.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <p className="text-sm font-semibold text-slate-700">No prep recipes match “{searchQuery.trim()}”.</p>
                  <button type="button" onClick={() => setSearchQuery('')} className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                    Clear search
                  </button>
                </td>
              </tr>
            )}
            {!loading && filteredPreps.map((prep) => (
              <tr
                key={prep._id}
                role="button"
                tabIndex={prep._pending ? -1 : 0}
                aria-label={`View ingredient cost breakdown for ${prep.name}`}
                onClick={() => openDetails(prep)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openDetails(prep);
                  }
                }}
                className={clsx(
                  'group transition-colors',
                  prep._pending ? 'cursor-wait opacity-60' : 'cursor-pointer hover:bg-indigo-50/50 focus:bg-indigo-50/50 focus:outline-none',
                )}
              >
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                      <FlaskConical size={14} className="text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-gray-800 group-hover:text-indigo-700 transition-colors">
                        {prep.name}
                        {prep.locked && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200" title="Locked — password required">
                            <Lock size={10} /> Locked
                          </span>
                        )}
                      </span>
                      <p className="text-xs text-gray-400 mt-0.5">{prep.category || 'Prep'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-gray-700 tabular-nums whitespace-nowrap">{Number(prep.yieldQty).toLocaleString()} {prep.yieldUnit}</td>
                <td className="px-4 py-3.5 text-gray-700 font-medium tabular-nums whitespace-nowrap">{prep._pending ? '…' : `${fmtCurrency(prep.costPerUnit)} / ${prep.yieldUnit}`}</td>
                <td className="px-4 py-3.5 tabular-nums whitespace-nowrap">
                  <span className={clsx('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border',
                    (prep.qtyOnHand || 0) <= 0 ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100')}>
                    {Number(prep.qtyOnHand || 0).toLocaleString()} {prep.yieldUnit}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-gray-500 tabular-nums">{prep.ingredientCount ?? prep.ingredients?.length ?? 0}</td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); setProduceTarget(prep); }}
                      disabled={!canManage || prep._pending}
                      className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Produce
                    </button>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); openEdit(prep); }}
                      disabled={!canManage || prep._pending || openingId === prep._id}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {openingId === prep._id && <Loader2 size={11} className="animate-spin" />}
                      {prep.locked && openingId !== prep._id && <Lock size={11} />}
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); setDeleteTarget(prep); }}
                      disabled={!canManage || prep._pending}
                      className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition disabled:opacity-40 disabled:cursor-not-allowed border border-rose-100"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PrepRecipeCostDrawer
        prep={detailPrep}
        products={products}
        onClose={() => {
          setDetailPrep(null);
          clearRecipeUnlockToken();
        }}
      />

      <PrepRecipeEditor
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingPrep(null);
          // Closing without saving — drop the unlock token so the next open re-prompts.
          clearRecipeUnlockToken();
          dispatch(baseApi.util.invalidateTags(['PrepRecipe']));
        }}
        onSubmit={handleSubmit}
        initialData={editingPrep}
        products={products}
        onLockChange={handleLockChange}
      />

      {/* Password gate for a locked prep — opens its editor only on success. */}
      <RecipeUnlockModal
        open={Boolean(unlockPromptPrep)}
        itemName={unlockPromptPrep?.name}
        onClose={() => {
          setUnlockPromptPrep(null);
          setUnlockIntent(null);
        }}
        onUnlocked={() => {
          const p = unlockPromptPrep;
          const intent = unlockIntent;
          setUnlockPromptPrep(null);
          setUnlockIntent(null);
          if (intent === 'details') {
            if (p) fetchAndShowDetails(p);
          } else {
            dispatch(baseApi.util.invalidateTags(['PrepRecipe']));
            if (p) fetchAndEdit(p);
          }
        }}
      />

      <ProduceModal
        prep={produceTarget}
        onClose={() => setProduceTarget(null)}
        onConfirm={handleProduce}
      />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Delete prep recipe?"
        message={`This permanently deletes "${deleteTarget?.name}" and its stock. It will fail if the prep is still used in a menu item or another prep.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
};

export default PrepRecipes;

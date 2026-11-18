import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch } from 'react-redux';
import clsx from 'clsx';
import { Plus, Trash2, FlaskConical, ChevronDown, AlertTriangle, Info, Loader2, AlertCircle, Lock, Unlock, Printer, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { getMenuItems, getRecipe, saveRecipe, createIngredient, setMenuRecipeLock } from '../../api/menuApi';
import { clearRecipeUnlockToken } from '../../utils/recipeUnlock';
import { getStockDetail } from '../../api/inventoryApi';
import { getProductById } from '../../api/productApi';
import SearchableSelect from '../../components/UI/SearchableSelect';
import PremiumModal, { PrimaryButton, SecondaryButton } from '../../components/UI/PremiumModal';
import { CATEGORIES } from '../Products/ProductForm';
import { baseApi } from '../../store/baseApi';
import { ALL_RECIPE_UNITS, recipeUnitsForProduct } from '../../utils/units';
import { openPrintWindow } from './menuPrint';

const UNITS = ALL_RECIPE_UNITS;

const emptyRow = () => ({
  _tempId: Math.random().toString(36).slice(2),
  product: '',
  qty: '',
  unit: 'g',
  parLevel: '',
  parDisabled: false,
  varianceBaseline: 5,
  notes: '',
});

const mapRecipeRows = (recipe = []) => recipe.length > 0
  ? recipe.map((row) => ({
      _tempId: row._id || Math.random().toString(36).slice(2),
      _id: row._id,
      product: row.product?._id ?? row.product ?? '',
      qty: row.qty ?? '',
      unit: row.unit ?? 'g',
      parLevel: row.parLevel ?? '',
      varianceBaseline: row.varianceBaseline ?? 5,
      adaptiveVariance: row.adaptiveVariance,
      notes: row.notes ?? '',
    }))
  : [emptyRow()];

// A copied recipe is a new working copy for the target size. Database row IDs
// and adaptive usage history belong to the source size and must not follow it.
const duplicateRecipeRows = (recipe = []) => recipe
  .filter((row) => row.product || row.qty || row.notes)
  .map((row) => ({
    _tempId: Math.random().toString(36).slice(2),
    product: row.product,
    qty: row.qty,
    unit: row.unit,
    parLevel: row.parLevel,
    parDisabled: row.parDisabled,
    varianceBaseline: row.varianceBaseline,
    notes: row.notes,
  }));

// Tooltip that renders into document.body to avoid changing modal layout
const InfoTooltip = ({ children, width = 240 }) => {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);

  const updatePosition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const tooltipWidth = width;
    const padding = 8;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipWidth - padding));
    const top = rect.bottom + 8;
    setPos({ top, left });
  }, [width]);

  useEffect(() => {
    if (!visible) return;
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [visible, updatePosition]);

  return (
    <span
      ref={ref}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      className="inline-block ml-1"
      tabIndex={0}
      aria-haspopup="true"
    >
      <Info size={14} className="text-gray-400" aria-hidden />
      {visible && createPortal(
        <div
          role="tooltip"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width }}
          className="bg-white border border-gray-100 rounded-lg shadow-lg p-2 text-xs text-gray-700 z-[99999]"
        >
          {children}
        </div>,
        document.body
      )}
    </span>
  );
};

// Searchable product selector — portalled dropdown (z-[99999] keeps it above the modal)
export const ProductSearchSelect = ({ products = [], value, onChange, onRequestCreate }) => {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const selected = products.find((p) => p._id === value);
  const dropdownRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const filtered = (products || []).filter((p) =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku || '').toLowerCase().includes(search.toLowerCase())
  );

  const trimmed = search.trim();
  // Offer to create a brand-new ingredient when the search doesn't exactly match
  // an existing one (case-insensitive).
  const canCreate = Boolean(onRequestCreate) && trimmed.length >= 2 &&
    !(products || []).some((p) => p.name.toLowerCase() === trimmed.toLowerCase());

  const requestCreate = () => {
    if (!canCreate) return;
    onRequestCreate(trimmed);
    setOpen(false);
    setSearch('');
  };

  const updatePosition = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const GAP = 4;
    const DESIRED = 260; // approx full panel height (search + list)
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    // Flip up only when there isn't room below AND there's more room above.
    const dropUp = spaceBelow < DESIRED && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(DESIRED, (dropUp ? spaceAbove : spaceBelow) - GAP * 2));
    setPos({
      left: rect.left,
      width: rect.width,
      dropUp,
      top: dropUp ? undefined : rect.bottom + GAP,
      bottom: dropUp ? window.innerHeight - rect.top + GAP : undefined,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && wrapRef.current.contains(e.target)) return;
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <div
        className={`flex items-center justify-between w-full px-3 py-2 border rounded-xl text-sm cursor-pointer transition ${
          open ? 'border-indigo-400 ring-2 ring-indigo-500/20' : 'border-slate-200 hover:border-slate-300'
        }`}
        onClick={() => { setOpen((o) => { const next = !o; if (next) updatePosition(); return next; }); setSearch(''); }}
      >
        <span className={`truncate min-w-0 ${selected ? 'text-gray-800' : 'text-gray-400'}`}>
          {selected ? `${selected.name} (${selected.sku ?? ''})` : 'Select ingredient…'}
        </span>
        <ChevronDown size={14} className={`shrink-0 ml-2 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && createPortal(
        <div
          ref={dropdownRef}
          role="listbox"
          style={{
            position: 'fixed',
            left: pos.left,
            width: pos.width,
            maxHeight: pos.maxHeight,
            ...(pos.dropUp ? { bottom: pos.bottom } : { top: pos.top }),
          }}
          className="z-[99999] flex flex-col bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
        >
          <div className="p-2 border-b border-gray-100 shrink-0">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ingredient…"
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <ul className="flex-1 min-h-0 overflow-y-auto">
            {filtered.length === 0 && !canCreate ? (
              <li className="px-3 py-2 text-sm text-gray-400">No ingredients match.</li>
            ) : (
              filtered.map((p) => (
                <li
                  key={p._id}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 ${
                    p._id === value ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(p._id);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  {/* Name (+ Prep tag) on top, SKU on a muted line below — keeps
                      the full row width for the name so it never gets cropped. */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate min-w-0">{p.name}</span>
                    {p.kind === 'prep' && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200">Prep</span>
                    )}
                  </div>
                  {p.sku && <div className="text-[10px] text-gray-400 font-mono truncate mt-0.5">{p.sku}</div>}
                </li>
              ))
            )}

            {/* Create-new-ingredient option — for ingredients not yet in inventory */}
            {canCreate && (
              <li
                className="px-3 py-2 text-sm cursor-pointer border-t border-gray-100 bg-indigo-50/40 text-indigo-700 font-medium flex items-center gap-1.5 hover:bg-indigo-50"
                onMouseDown={(e) => { e.preventDefault(); requestCreate(); }}
              >
                <Plus size={13} />
                Create &ldquo;{trimmed}&rdquo;
              </li>
            )}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
};

// Inline "new ingredient" form — asks for name, unit and CATEGORY so the
// ingredient is filed under a real category (not a catch-all "General").
export const CreateIngredientModal = ({ ctx, onCancel, onCreate }) => {
  const [name, setName] = useState(ctx.name || '');
  const [unit, setUnit] = useState(ctx.unit || 'pcs');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length >= 2 && Boolean(unit) && category.trim().length >= 1 && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    const ok = await onCreate({ name: name.trim(), unit, category: category.trim() });
    if (!ok) setSaving(false); // on success the parent unmounts this modal
  };

  return createPortal(
    // z-[200] sits above the recipe modal (z-50) but below SearchableSelect's
    // portalled panel (z-[1000]) so the category dropdown floats over this form.
    // Close on a direct backdrop click only — we must NOT stop mousedown
    // propagation on the card, or SearchableSelect's document-level
    // outside-click listener won't fire and its dropdown won't close.
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-white"><Plus size={15} /></div>
          <p className="text-sm font-bold text-gray-900">New ingredient</p>
        </div>
        <div className="space-y-3 px-4 py-4">
          <p className="text-xs text-gray-500">
            Not in inventory yet — you can stock it later with a stock purchase.
          </p>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Unit</label>
              <SearchableSelect
                options={UNITS.map((u) => ({ value: u, label: u }))}
                value={unit}
                onChange={setUnit}
                placeholder="Select unit…"
                searchPlaceholder="Search units…"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Category</label>
              <SearchableSelect
                options={[
                  { value: '', label: 'Select category…' },
                  ...CATEGORIES.map((c) => ({ value: c, label: c })),
                ]}
                value={category}
                onChange={setCategory}
                placeholder="Select category…"
                searchPlaceholder="Search categories…"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Plus size={14} /> {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const RecipeEditor = ({
  isOpen,
  onClose,
  menuItem,
  outletId,
  products,
  productsLoading = false,
  productsError = false,
  onLockChange,
  onPrint,
}) => {
  const dispatch = useDispatch();
  const [rows, setRows] = useState([emptyRow()]);
  const [loading, setLoading] = useState(false);
  // Lock state for THIS item's recipe. Mirrors menuItem.recipeLocked; toggled via
  // the dedicated lock endpoint (separate from ingredient form submission).
  const [locked, setLocked] = useState(!!menuItem?.recipeLocked);
  const [lockBusy, setLockBusy] = useState(false);
  // Explicit-submit status surfaced in the footer: 'idle' | 'saving' | 'saved' | 'error'.
  const [saveStatus, setSaveStatus] = useState('idle');
  const [printing, setPrinting] = useState(false);
  // Whether this menu item deducts/limits stock from its recipe. Manually
  // toggleable — defaults on, but can be turned off (e.g. ingredients added
  // before they're stocked) so the item stays sellable and isn't deducted.
  const [trackInventory, setTrackInventory] = useState(menuItem?.trackInventory ?? true);
  // Local copy so freshly-created ingredients appear immediately in the pickers.
  const [localProducts, setLocalProducts] = useState(products || []);
  // Open the "new ingredient" form: { idx, name, unit } | null
  const [createCtx, setCreateCtx] = useState(null);
  const [copyingFromId, setCopyingFromId] = useState(null);
  // Outlet-wide catalog used by the cross-menu-item recipe copier.
  const [menuItemCatalog, setMenuItemCatalog] = useState([]);
  const [menuItemCatalogLoading, setMenuItemCatalogLoading] = useState(false);
  const [menuItemCatalogError, setMenuItemCatalogError] = useState(false);
  const [sourceMenuItemId, setSourceMenuItemId] = useState('');
  const [sourceVariationId, setSourceVariationId] = useState('');
  const [copyingMenuItemRecipe, setCopyingMenuItemRecipe] = useState(false);

  // Size variations: each has its OWN recipe, edited one size at a time.
  const variations = menuItem?.variations ?? [];
  const hasVariations = variations.length > 0;
  const [activeVariationId, setActiveVariationId] = useState(null);
  const variationKey = activeVariationId || '__base';
  const copyBusy = Boolean(copyingFromId) || copyingMenuItemRecipe;

  // Per-size working copy so switching tabs keeps whatever was typed — even
  // before it has round-tripped to the server. Keyed by variationKey.
  const cacheRef = useRef({});
  // Per-size signature of what's already persisted, so an explicit submission
  // skips sizes whose recipes did not change.
  const lastSavedRef = useRef({});
  // True once any size has been submitted — tells the parent to refresh on close.
  const savedAnyRef = useRef(false);

  useEffect(() => { setLocalProducts(products || []); }, [products]);

  // Keep the local lock flag in sync when the editor is reused for another item.
  useEffect(() => { setLocked(!!menuItem?.recipeLocked); }, [menuItem?._id, menuItem?.recipeLocked]);

  // Toggle password-protection for this recipe. Locking (ON) just hides it;
  // unlocking (OFF) requires a valid unlock token — which the caller already
  // holds, since a locked recipe can only be opened after entering the password.
  const toggleLock = useCallback(async () => {
    if (!menuItem?._id || lockBusy) return;
    const next = !locked;
    setLockBusy(true);
    try {
      await setMenuRecipeLock(menuItem._id, next);
      setLocked(next);
      toast.success(next ? 'Recipe locked.' : 'Recipe unlocked.');
      onLockChange?.(next);
    } catch (err) {
      const status = err?.response?.status;
      toast.error(status === 400
        ? 'Set a recipe password in Settings → Recipe Lock first.'
        : err?.response?.data?.message || 'Could not change the lock.');
    } finally {
      setLockBusy(false);
    }
  }, [menuItem?._id, locked, lockBusy, onLockChange]);

  // Build the API ingredient payload from editable rows (complete rows only).
  const buildIngredients = useCallback((rs) => rs
    .filter((r) => r.product && r.qty && r.unit)
    .map((r) => ({
      product: r.product,
      qty: parseFloat(r.qty),
      unit: r.unit,
      parLevel: parseFloat(r.parLevel) || 0,
      varianceBaseline: parseFloat(r.varianceBaseline) || 5,
      notes: r.notes,
    })), []);

  const sigOf = (ingredients, track) => JSON.stringify({ ingredients, track: !!track });

  // When the editor opens (or the item changes), reset the per-size caches and
  // default to the first size.
  useEffect(() => {
    if (!isOpen) return;
    cacheRef.current = {};
    lastSavedRef.current = {};
    savedAnyRef.current = false;
    setSaveStatus('idle');
    setCopyingFromId(null);
    setSourceMenuItemId('');
    setSourceVariationId('');
    setCopyingMenuItemRecipe(false);
    setTrackInventory(menuItem?.trackInventory ?? true);
    setActiveVariationId(hasVariations ? (variations[0]?._id ?? null) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, menuItem?._id]);

  // Load every menu-item page for this outlet so recipes can be copied across
  // categories, not just from the currently visible management page.
  useEffect(() => {
    if (!isOpen) return undefined;

    const resolvedOutletId = outletId || menuItem?.outlet?._id || menuItem?.outlet;
    if (!resolvedOutletId) {
      setMenuItemCatalog([]);
      setMenuItemCatalogError(true);
      return undefined;
    }

    let cancelled = false;
    const loadCatalog = async () => {
      setMenuItemCatalogLoading(true);
      setMenuItemCatalogError(false);
      try {
        const first = await getMenuItems({ outlet: resolvedOutletId, page: 1, limit: 100 });
        const firstItems = first.data?.data ?? [];
        const pages = first.data?.pagination?.pages ?? 1;
        const remaining = pages > 1
          ? await Promise.all(Array.from({ length: pages - 1 }, (_, index) => (
              getMenuItems({ outlet: resolvedOutletId, page: index + 2, limit: 100 })
            )))
          : [];
        const allItems = firstItems.concat(
          remaining.flatMap((response) => response.data?.data ?? []),
        );
        if (!cancelled) {
          setMenuItemCatalog(allItems.filter((item) => item._id !== menuItem?._id));
        }
      } catch {
        if (!cancelled) {
          setMenuItemCatalog([]);
          setMenuItemCatalogError(true);
        }
      } finally {
        if (!cancelled) setMenuItemCatalogLoading(false);
      }
    };

    loadCatalog();
    return () => { cancelled = true; };
  }, [isOpen, menuItem?._id, menuItem?.outlet, outletId]);

  // Load the active size's recipe — from the in-memory cache when we already have
  // it (instant, preserves edits), otherwise from the server.
  const loadActive = useCallback(async () => {
    if (!menuItem?._id) return;
    // On the first render the reset effect below has not selected the first size
    // yet. Avoid briefly requesting the base recipe for an item with variations.
    if (hasVariations && !activeVariationId) return;
    const key = activeVariationId || '__base';

    const cached = cacheRef.current[key];
    if (cached) { setRows(cached); return; }

    setLoading(true);
    try {
      const { data } = await getRecipe(menuItem._id, activeVariationId || undefined);
      const fetched = data.data ?? [];
      const track = data.trackInventory ?? true;
      const mapped = mapRecipeRows(fetched);
      cacheRef.current[key] = mapped;
      // Record the persisted state so an explicit submission can skip no-op writes.
      lastSavedRef.current[key] = sigOf(buildIngredients(mapped), track);
      setRows(mapped);
    } catch {
      toast.error('Failed to load recipe.');
    } finally {
      setLoading(false);
    }
  }, [menuItem?._id, activeVariationId, buildIngredients, hasVariations]);

  useEffect(() => {
    if (isOpen) loadActive();
  }, [isOpen, loadActive]);

  // Persist one size's recipe as part of an explicit form submission. No-ops
  // when nothing changed.
  const persist = useCallback(async (key, rs, track) => {
    if (!menuItem?._id) return;
    const ingredients = buildIngredients(rs);
    const sig = sigOf(ingredients, track);
    if (sig === lastSavedRef.current[key]) return true;
    const variationId = key === '__base' ? undefined : key;
    setSaveStatus('saving');
    try {
      await saveRecipe(menuItem._id, ingredients, track, variationId);
      lastSavedRef.current[key] = sig;
      savedAnyRef.current = true;
      dispatch(baseApi.util.invalidateTags(['MenuItem', 'Product']));
      setSaveStatus('saved');
      return true;
    } catch (err) {
      setSaveStatus('error');
      // A 403 here means the unlock session expired mid-edit (a locked recipe can
      // only be saved with a valid token). Drop the stale token so the next open
      // re-prompts, and tell the user plainly rather than "will retry".
      if (err.response?.status === 403) {
        clearRecipeUnlockToken();
        toast.error('This recipe is locked — re-open it and enter the password to make further changes.');
      } else {
        toast.error(err.response?.data?.message ?? 'Failed to save recipe.');
      }
      return false;
    }
  }, [menuItem?._id, buildIngredients, dispatch]);

  // Keep the active size's local working copy in sync. Nothing is sent to the
  // API here; recipes are persisted only by submitRecipe below. variationKey is
  // intentionally NOT a dependency so switching tabs cannot briefly copy the
  // previous size's rows into the newly selected size.
  useEffect(() => {
    if (!isOpen || !menuItem?._id || loading) return;
    const key = variationKey;
    cacheRef.current[key] = rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, loading, isOpen, menuItem?._id]);

  const updateRow = (idx, field, value) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  // Units to offer for a row, restricted to the selected product's measurement
  // family (+ the product's own base unit), so only sensible units show.
  const rowUnitOptions = (productId) => {
    const p = (localProducts || []).find((x) => x._id === productId);
    const base = p?.unit;
    const fam = recipeUnitsForProduct(base);
    const list = base && !fam.includes(base) ? [base, ...fam] : fam;
    return list.map((u) => ({ value: u, label: u }));
  };

  const handleProductSelect = async (idx, productId) => {
    updateRow(idx, 'product', productId);
    updateRow(idx, 'parDisabled', false);
    if (!productId) return;

    // Default the unit to the product's base unit so it matches inventory.
    const picked = (localProducts || []).find((x) => x._id === productId);
    if (picked?.unit) updateRow(idx, 'unit', picked.unit);

    try {
      const res = await getStockDetail(productId);
      const payload = res?.data?.data;
      const prod = payload?.product;
      const par = prod?.parLevel ?? payload?.parLevel;
      if (par !== undefined && par !== null && par !== '') {
        updateRow(idx, 'parLevel', String(par));
        updateRow(idx, 'parDisabled', true);
      } else {
        updateRow(idx, 'parLevel', '');
        updateRow(idx, 'parDisabled', false);
        toast('No par level found in inventory — please enter one.');
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) {
        try {
          const pRes = await getProductById(productId);
          const p = pRes?.data?.data;
          const par = p?.parLevel;
          if (par !== undefined && par !== null && par !== '') {
            updateRow(idx, 'parLevel', String(par));
            updateRow(idx, 'parDisabled', true);
          } else {
            updateRow(idx, 'parLevel', '');
            updateRow(idx, 'parDisabled', false);
            toast('No par level set on product — please enter one.');
          }
        } catch (pErr) {
          toast.error('Failed to fetch product details.');
        }
      } else {
        toast.error('Failed to fetch inventory details.');
      }
    }
  };

  // Create a new ingredient (catalog product, no stock yet) from the inline form
  // and select it into the row that requested it. Returns true on success.
  const submitCreate = async ({ name, unit, category }) => {
    try {
      const { data } = await createIngredient({ name, unit: unit || 'pcs', category });
      const product = data?.data;
      if (product) {
        setLocalProducts((prev) => (prev.some((p) => p._id === product._id) ? prev : [...prev, product]));
        if (createCtx) handleProductSelect(createCtx.idx, product._id);
        // Refresh the cached product catalog so the new ingredient persists in pickers.
        dispatch(baseApi.util.invalidateTags(['MenuItem', 'Product']));
        toast.success(`Ingredient "${product.name}" added — stock it later via purchasing.`);
        setCreateCtx(null);
        return true;
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create ingredient.');
    }
    return false;
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (idx) => {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length === 0 ? [emptyRow()] : next;
    });
  };

  // Switch sizes and stash the current edits locally. They remain unsaved until
  // the recipe form is submitted.
  const switchVariation = (id) => {
    if (id === activeVariationId || copyBusy) return;
    cacheRef.current[variationKey] = rows;
    setActiveVariationId(id);
  };

  // Copy another size's recipe into the active size as an unsaved working copy.
  // The source may be a locally edited size or one that has not been opened yet.
  const copyFromVariation = async (sourceVariation) => {
    if (!menuItem?._id || !sourceVariation?._id || copyBusy || loading) return;

    const targetKey = variationKey;
    const targetVariation = variations.find((variation) => variation._id === activeVariationId);
    setCopyingFromId(sourceVariation._id);

    try {
      let sourceRows = cacheRef.current[sourceVariation._id];

      if (!sourceRows) {
        const { data } = await getRecipe(menuItem._id, sourceVariation._id);
        const fetched = data.data ?? [];
        const track = data.trackInventory ?? true;
        sourceRows = mapRecipeRows(fetched);
        cacheRef.current[sourceVariation._id] = sourceRows;
        lastSavedRef.current[sourceVariation._id] = sigOf(buildIngredients(sourceRows), track);
      }

      const copiedRows = duplicateRecipeRows(sourceRows);
      if (copiedRows.length === 0) {
        toast.error(`${sourceVariation.name} does not have a recipe to copy.`);
        return;
      }

      cacheRef.current[targetKey] = copiedRows;
      setRows(copiedRows);
      setSaveStatus('idle');
      toast.success(`${sourceVariation.name} recipe copied to ${targetVariation?.name || 'this size'}. Adjust the quantities, then save.`);
    } catch (err) {
      toast.error(err.response?.data?.message || `Could not copy the ${sourceVariation.name} recipe.`);
    } finally {
      setCopyingFromId(null);
    }
  };

  // Pick a menu item and preselect the source size that matches the target size
  // name (Medium → Medium, for example). If there is no match, use its first size.
  const selectSourceMenuItem = (id) => {
    setSourceMenuItemId(id);
    const sourceItem = menuItemCatalog.find((item) => item._id === id);
    const sourceVariations = sourceItem?.variations ?? [];
    const targetVariation = variations.find((variation) => variation._id === activeVariationId);
    const nameMatch = targetVariation
      ? sourceVariations.find((variation) => (
          variation.name?.trim().toLowerCase() === targetVariation.name?.trim().toLowerCase()
        ))
      : null;
    setSourceVariationId(nameMatch?._id || sourceVariations[0]?._id || '');
  };

  // Copy a recipe from a completely different menu item into the active target
  // size/item. The source is read-only; only this editor's working rows change.
  const copyFromMenuItem = async () => {
    if (!menuItem?._id || !sourceMenuItemId || copyBusy || loading) return;

    const sourceItem = menuItemCatalog.find((item) => item._id === sourceMenuItemId);
    if (!sourceItem) return;
    const sourceVariations = sourceItem.variations ?? [];
    if (sourceVariations.length > 0 && !sourceVariationId) {
      toast.error('Select which source size to copy.');
      return;
    }

    const targetKey = variationKey;
    const targetVariation = variations.find((variation) => variation._id === activeVariationId);
    const sourceVariation = sourceVariations.find((variation) => variation._id === sourceVariationId);
    setCopyingMenuItemRecipe(true);

    try {
      const { data } = await getRecipe(sourceItem._id, sourceVariationId || undefined);
      const fetched = data.data ?? [];
      // The API keeps `locked: true` even after a valid unlock, but returns the
      // ingredients in that case. An empty locked response means access was not
      // granted, so do not misrepresent it as an empty recipe.
      if (data.locked && fetched.length === 0) {
        toast.error(`${sourceItem.name}'s recipe is locked. Unlock that recipe before copying it.`);
        return;
      }

      const copiedRows = duplicateRecipeRows(mapRecipeRows(fetched));
      if (copiedRows.length === 0) {
        const sourceLabel = sourceVariation ? `${sourceItem.name} (${sourceVariation.name})` : sourceItem.name;
        toast.error(`${sourceLabel} does not have a recipe to copy.`);
        return;
      }

      cacheRef.current[targetKey] = copiedRows;
      setRows(copiedRows);
      setSaveStatus('idle');

      const sourceLabel = sourceVariation ? `${sourceItem.name} (${sourceVariation.name})` : sourceItem.name;
      const targetLabel = targetVariation?.name || menuItem.name || 'this item';
      toast.success(`${sourceLabel} recipe copied to ${targetLabel}. Adjust the quantities, then save.`);
    } catch (err) {
      toast.error(err.response?.data?.message || `Could not copy the ${sourceItem.name} recipe.`);
    } finally {
      setCopyingMenuItemRecipe(false);
    }
  };

  // Closing/cancelling deliberately discards local edits. Saving is handled only
  // by the form submission below.
  const closeEditor = () => {
    if (saveStatus === 'saving' || copyBusy) return;
    onClose(false);
  };

  // Submit every size the user visited, sequentially. Sequential writes matter
  // because each size is embedded in the same menu-item document on the server.
  const submitRecipe = async (event) => {
    event.preventDefault();
    if (loading || saveStatus === 'saving' || copyBusy) return;

    cacheRef.current[variationKey] = rows;
    setSaveStatus('saving');

    for (const [key, cachedRows] of Object.entries(cacheRef.current)) {
      // eslint-disable-next-line no-await-in-loop
      const saved = await persist(key, cachedRows, trackInventory);
      if (!saved) return;
    }

    setSaveStatus('saved');
    onClose(savedAnyRef.current);
  };

  // Printing reads the last submitted recipe from the server. It never persists
  // the editor's local changes.
  const printRecipe = async () => {
    if (printing || !onPrint) return;
    const popup = openPrintWindow(`${menuItem?.name || 'Menu item'} Recipe`);
    if (!popup) {
      toast.error('Allow pop-ups in your browser to print the recipe.');
      return;
    }
    setPrinting(true);
    try {
      await onPrint(menuItem, popup);
    } finally {
      setPrinting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <PremiumModal
      open
      onClose={closeEditor}
      icon={FlaskConical}
      eyebrow="Recipe Editor"
      title="Recipe Editor"
      subtitle={menuItem?.name ? `${menuItem.name} — link ingredients & set variance` : 'Link ingredients & set variance'}
      accent="indigo"
      size="xl"
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="min-w-0">
            {saveStatus === 'saving' && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Loader2 size={13} className="animate-spin" /> Saving…
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600">
                <AlertCircle size={13} /> Couldn't save — your edits are still here
              </span>
            )}
            {(saveStatus === 'idle' || saveStatus === 'saved') && (
              <span className="text-xs text-slate-400">Changes are saved only when you submit this form</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={printRecipe}
              disabled={printing || loading || saveStatus === 'saving' || copyBusy}
              title="Prints the last submitted recipe"
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition disabled:opacity-50"
            >
              {printing ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
              {printing ? 'Preparing…' : 'Print Recipe'}
            </button>
            <button
              type="button"
              onClick={toggleLock}
              disabled={lockBusy}
              title={locked ? 'Remove password protection from this recipe' : 'Require the recipe password to view this recipe'}
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
            <SecondaryButton type="button" onClick={closeEditor} disabled={saveStatus === 'saving' || copyBusy}>Cancel</SecondaryButton>
            <PrimaryButton
              type="submit"
              form="menu-recipe-form"
              disabled={loading || printing || saveStatus === 'saving' || copyBusy}
              accent="indigo"
            >
              {saveStatus === 'saving' ? 'Saving…' : 'Save Recipe'}
            </PrimaryButton>
          </div>
        </div>
      }
    >
      <form id="menu-recipe-form" onSubmit={submitRecipe}>
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center text-gray-400 text-sm animate-pulse">
          Loading recipe…
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
            Set the quantity consumed per serving for each ingredient. The system will auto-adjust variance using a 30-day moving average.
          </div>

          {/* Size selector — each variation has its own recipe */}
          {hasVariations && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 py-3 space-y-2">
              <p className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wide">Editing recipe for size</p>
              <div className="flex flex-wrap gap-2">
                {variations.map((v) => (
                  <button
                    key={v._id}
                    type="button"
                    onClick={() => switchVariation(v._id)}
                    disabled={copyBusy}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-50',
                      activeVariationId === v._id
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-indigo-100 pt-2">
                <span className="text-[11px] font-medium text-slate-600">
                  Copy recipe into {variations.find((variation) => variation._id === activeVariationId)?.name || 'this size'} from:
                </span>
                {variations
                  .filter((variation) => variation._id !== activeVariationId)
                  .map((variation) => (
                    <button
                      key={variation._id}
                      type="button"
                      onClick={() => copyFromVariation(variation)}
                      disabled={loading || copyBusy}
                      aria-label={`Copy ${variation.name} recipe into ${variations.find((item) => item._id === activeVariationId)?.name || 'this size'}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-50"
                    >
                      {copyingFromId === variation._id
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Copy size={12} />}
                      {copyingFromId === variation._id ? 'Copying…' : variation.name}
                    </button>
                  ))}
              </div>
              <p className="text-[11px] text-slate-500">Copying replaces this size's working recipe only. Adjust its quantities, then Save Recipe to submit all edited sizes.</p>
            </div>
          )}

          {/* Cross-item copier — searches every menu category in this outlet. */}
          <div className="rounded-xl border border-violet-100 bg-violet-50/40 px-4 py-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Copy from another menu item</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Searches every category in the current outlet. The source recipe is not changed.</p>
              </div>
              {menuItemCatalogLoading && (
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-violet-600">
                  <Loader2 size={12} className="animate-spin" /> Loading menu…
                </span>
              )}
            </div>

            {menuItemCatalogError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-600">
                The full menu could not be loaded. Close and reopen the recipe editor to retry.
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] md:items-end">
                <div className="min-w-0">
                  <label htmlFor="recipe-source-menu-item" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Source menu item</label>
                  <SearchableSelect
                    id="recipe-source-menu-item"
                    options={menuItemCatalog.map((item) => ({
                      value: item._id,
                      label: item.name,
                      meta: [
                        item.category?.name,
                        item.variations?.length ? `${item.variations.length} sizes` : 'Standard item',
                        item.recipeLocked ? 'Locked' : null,
                      ].filter(Boolean).join(' • '),
                    }))}
                    value={sourceMenuItemId}
                    onChange={selectSourceMenuItem}
                    disabled={menuItemCatalogLoading || copyBusy}
                    placeholder={menuItemCatalogLoading ? 'Loading all menu items…' : 'Select a menu item…'}
                    searchPlaceholder="Search all menu items…"
                  />
                </div>

                <div className="min-w-0">
                  <label htmlFor="recipe-source-variation" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Source size</label>
                  {(menuItemCatalog.find((item) => item._id === sourceMenuItemId)?.variations?.length ?? 0) > 0 ? (
                    <SearchableSelect
                      id="recipe-source-variation"
                      options={(menuItemCatalog.find((item) => item._id === sourceMenuItemId)?.variations ?? []).map((variation) => ({
                        value: variation._id,
                        label: variation.name,
                      }))}
                      value={sourceVariationId}
                      onChange={setSourceVariationId}
                      disabled={copyBusy}
                      searchable={false}
                      placeholder="Select size…"
                    />
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
                      {sourceMenuItemId ? 'Standard item' : 'Select item first'}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={copyFromMenuItem}
                  disabled={!sourceMenuItemId || menuItemCatalogLoading || copyBusy}
                  aria-label={`Copy selected menu item recipe into ${variations.find((variation) => variation._id === activeVariationId)?.name || menuItem?.name || 'this item'}`}
                  className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {copyingMenuItemRecipe ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />}
                  {copyingMenuItemRecipe
                    ? 'Copying…'
                    : `Copy to ${variations.find((variation) => variation._id === activeVariationId)?.name || menuItem?.name || 'item'}`}
                </button>
              </div>
            )}
          </div>

          {/* Inventory-tracking toggle */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">Track inventory</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {trackInventory
                  ? 'Stock is checked & deducted from this recipe when the item sells.'
                  : 'Item stays sellable; recipe stock is not checked or deducted (e.g. ingredients not stocked yet).'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={trackInventory}
              onClick={() => setTrackInventory((v) => !v)}
              className={clsx(
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                trackInventory ? 'bg-indigo-600' : 'bg-slate-300',
              )}
            >
              <span
                className={clsx(
                  'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                  trackInventory ? 'translate-x-5' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] px-1 items-center">
            <span>Ingredient</span>
            <span>Qty / Serving</span>
            <span>Unit</span>
            <span className="flex items-center gap-1">
              Par Level
              <InfoTooltip width={220}>
                <div className="font-semibold text-gray-800 mb-1">Par Level</div>
                <div className="leading-5">Minimum quantity to keep on hand. When stock falls below this amount you'll receive a low-stock alert to reorder.</div>
              </InfoTooltip>
            </span>
            <span className="flex items-center gap-1">
              Variance %
              <InfoTooltip width={260}>
                <div className="font-semibold text-gray-800 mb-1">Variance %</div>
                <div className="leading-5">How much actual usage may differ from expected before it's considered unusual. Lower % = stricter alerts. The system can auto-adjust this over time based on recent usage.</div>
              </InfoTooltip>
            </span>
            <span />
          </div>

          {rows.map((row, idx) => (
            <div key={row._tempId} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 items-start">
              {productsLoading || productsError ? (
                <div className={`rounded-xl border px-3 py-2.5 text-sm ${
                  productsError
                    ? 'border-rose-200 bg-rose-50 text-rose-600'
                    : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}>
                  {productsError ? 'Items could not be loaded.' : 'Loading all items…'}
                </div>
              ) : (
                <ProductSearchSelect
                  products={localProducts}
                  value={row.product}
                  onChange={(v) => handleProductSelect(idx, v)}
                  onRequestCreate={(name) => setCreateCtx({ idx, name, unit: row.unit })}
                />
              )}

              <input
                type="number"
                min="0.001"
                step="0.001"
                value={row.qty}
                onChange={(e) => updateRow(idx, 'qty', e.target.value)}
                placeholder="0.00"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
              />

              <SearchableSelect
                options={rowUnitOptions(row.product)}
                value={row.unit}
                onChange={(v) => updateRow(idx, 'unit', v)}
              />

              <input
                type="number"
                min="0"
                step="0.01"
                value={row.parLevel}
                onChange={(e) => updateRow(idx, 'parLevel', e.target.value)}
                placeholder={row.parDisabled ? 'From inventory' : 'Enter par level'}
                className={`rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 ${row.parDisabled ? 'bg-slate-50 text-slate-600' : ''}`}
                title="Low-stock alert par level (units)"
                disabled={row.parDisabled}
              />

              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  value={row.varianceBaseline}
                  onChange={(e) => updateRow(idx, 'varianceBaseline', e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  title="Starting variance tolerance (%)"
                />
                {row.adaptiveVariance !== undefined && (
                  <span className="text-xs text-indigo-500 whitespace-nowrap" title="Adaptive (current)">
                    → {row.adaptiveVariance.toFixed(1)}%
                  </span>
                )}
              </div>

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
        </div>
      )}

      {createCtx && (
        <CreateIngredientModal
          ctx={createCtx}
          onCancel={() => setCreateCtx(null)}
          onCreate={submitCreate}
        />
      )}
      </form>
    </PremiumModal>
  );
};

export default RecipeEditor;

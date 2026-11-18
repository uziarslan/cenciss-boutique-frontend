import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, FlaskConical, UtensilsCrossed, Layers, CheckCircle2, BookOpen, ChefHat, Lock, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import CategoryForm from './CategoryForm';
import Toolbar from './Toolbar';
import CategoryCard from './CategoryCard';
import { useDispatch } from 'react-redux';
import { useGetOutletsQuery, useGetProductsQuery, useGetMenuItemsQuery, useGetMenuItemStatsQuery, listQueryOpts, baseApi } from '../../store/baseApi';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  uploadMenuItemImage,
  deleteMenuItemImage,
  bulkUpdateAvailability,
  getMenuItems,
  getRecipe,
} from '../../api/menuApi';
import { getTaxConfig } from '../../api/taxApi';
import SearchableSelect from '../../components/UI/SearchableSelect';
import ConfirmModal from '../../components/UI/ConfirmModal';
import EmptyState from '../../components/UI/EmptyState';
import Pagination from '../../components/UI/Pagination';
import HeroBanner from '../../components/UI/HeroBanner';
import Button from '../../components/UI/Button';
import PremiumModal from '../../components/UI/PremiumModal';
import MenuItemForm from './MenuItemForm';
import RecipeEditor from './RecipeEditor';
import PrepRecipes from './PrepRecipes';
import RecipeUnlockModal from '../../components/Menu/RecipeUnlockModal';
import usePermissions from '../../hooks/usePermissions';
import { clearRecipeUnlockToken } from '../../utils/recipeUnlock';
import { openPrintWindow, renderMenuPrint, renderRecipePrint, renderPrintError } from './menuPrint';
import useQueryState from '../../hooks/useQueryState';
import { notifyPosMenuUpdated } from '../../utils/posMenuRefresh';

// Items paginate within the selected category, 20 at a time.
const PAGE_SIZE = 20;

const MenuManagement = () => {
  const dispatch = useDispatch();
  const { data: outlets = [] } = useGetOutletsQuery();
  const [selectedOutletId, setSelectedOutletId] = useQueryState('outlet', '');
  const selectedOutlet = useMemo(
    () => outlets.find((entry) => entry._id === selectedOutletId) || null,
    [outlets, selectedOutletId],
  );
  // The selected outlet's standard tax rate — pre-fills a new menu item's Tax %
  // so the owner doesn't retype it (each outlet can have a different rate).
  const [outletStandardRate, setOutletStandardRate] = useState(16);
  const [outletServiceChargeRate, setOutletServiceChargeRate] = useState(0);
  // Full per-outlet tax config (rates + service charge + applicability) passed to
  // the item form so it can show Tax & service charge read-only.
  const [outletTaxConfig, setOutletTaxConfig] = useState({});
  const [outletTaxConfigLoading, setOutletTaxConfigLoading] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useQueryState('category', '');
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(1);
  const [itemSearch, setItemSearch] = useQueryState('search', '');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // Menu items: paginate WITHIN the selected category (20/page) straight from the
  // server, then mirror the current page into local state so the optimistic
  // toggle / delete / bulk-delete UX keeps working.
  const itemsQueryParams = useMemo(
    () => ({
      outlet: selectedOutlet?._id,
      category: selectedCategoryId || undefined,
      search: debouncedSearch || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    [selectedOutlet, selectedCategoryId, debouncedSearch, page]
  );
  // Hold the query until a category is chosen — otherwise the first render (before
  // the auto-select effect runs) and outlets with no categories would fetch the
  // whole outlet menu unfiltered, defeating the per-category pagination.
  const { data: itemsPayload, isLoading: itemsLoading } = useGetMenuItemsQuery(
    itemsQueryParams,
    { ...listQueryOpts, skip: !selectedOutlet?._id || !selectedCategoryId }
  );
  const [items, setItems] = useState([]);
  const pagination = itemsPayload?.pagination ?? { total: 0, page: 1, pages: 0, limit: PAGE_SIZE };
  // Outlet-wide counts for the stat cards — independent of the current page so
  // the totals stay accurate while the list is paginated.
  const { data: stats, isLoading: statsLoading } = useGetMenuItemStatsQuery(
    { outlet: selectedOutlet?._id },
    { skip: !selectedOutlet?._id }
  );
  // Complete product catalog (incl. prep-backing products) — the shared query
  // follows every API page and is cached for all catalog dropdowns.
  const {
    data: products = [],
    isLoading: productsLoading,
    isError: productsError,
  } = useGetProductsQuery();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [dealMenuItems, setDealMenuItems] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [recipeItem, setRecipeItem] = useState(null);
  // Item whose locked recipe is awaiting a password before its editor opens.
  const [unlockPromptItem, setUnlockPromptItem] = useState(null);
  const [printingMenu, setPrintingMenu] = useState(false);

  // Open a recipe editor — a locked recipe ALWAYS prompts for the password (every
  // open), and the editor (which fetches the ingredients) only mounts once
  // unlocked, so no recipe request goes out without a fresh unlock token. Any
  // stale token is dropped first so the lock never silently opens.
  const openRecipe = (item) => {
    if (item?.recipeLocked) {
      clearRecipeUnlockToken();
      setUnlockPromptItem(item);
    } else {
      setRecipeItem(item);
    }
  };

  const fetchAllMenuItems = async () => {
    const first = await getMenuItems({ outlet: selectedOutlet._id, page: 1, limit: 100 });
    const firstItems = first.data?.data ?? [];
    const pages = first.data?.pagination?.pages ?? 1;
    if (pages <= 1) return firstItems;
    const remaining = await Promise.all(
      Array.from({ length: pages - 1 }, (_, index) => (
        getMenuItems({ outlet: selectedOutlet._id, page: index + 2, limit: 100 })
      ))
    );
    return firstItems.concat(remaining.flatMap((response) => response.data?.data ?? []));
  };

  const handlePrintMenu = async () => {
    if (!selectedOutlet || printingMenu) return;
    const popup = openPrintWindow(`${selectedOutlet.name} Menu`);
    if (!popup) {
      toast.error('Allow pop-ups in your browser to print the menu.');
      return;
    }
    setPrintingMenu(true);
    try {
      const allItems = await fetchAllMenuItems();
      renderMenuPrint(popup, selectedOutlet, categories, allItems);
    } catch (err) {
      renderPrintError(popup, 'The menu could not be loaded for printing.');
      toast.error(err.response?.data?.message ?? 'Failed to prepare menu printout.');
    } finally {
      setPrintingMenu(false);
    }
  };

  const printItemRecipe = async (item, existingPopup = null) => {
    const popup = existingPopup || openPrintWindow(`${item.name} Recipe`);
    if (!popup) {
      toast.error('Allow pop-ups in your browser to print the recipe.');
      return;
    }
    try {
      const variations = item.variations ?? [];
      const targets = variations.length
        ? variations.map((variation) => ({
            id: variation._id,
            name: variation.name,
            price: variation.price,
          }))
        : [{ id: undefined, name: item.name, price: item.price }];
      const responses = await Promise.all(targets.map((target) => getRecipe(item._id, target.id)));
      const recipes = targets.map((target, index) => ({
        ...target,
        ingredients: responses[index].data?.data ?? [],
      }));
      renderRecipePrint(popup, selectedOutlet, item, recipes);
    } catch (err) {
      renderPrintError(popup, 'The recipe could not be loaded for printing.');
      toast.error(err.response?.data?.message ?? 'Failed to prepare recipe printout.');
    }
  };
  // Top-level section tabs: menu items vs. reusable prep recipes.
  const [activeTab, setActiveTab] = useQueryState('tab', 'items');

  // The server already filters by outlet + category + search and returns a single
  // page, so the rows it returns ARE the rows we display.
  const displayedItems = items;

  const allDisplayedSelected = useMemo(() => (
    displayedItems.length > 0 && displayedItems.every((it) => selectedItemIds.includes(it._id))
  ), [displayedItems, selectedItemIds]);

  const fmtCurrency = (val) => {
    try {
      return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(Number(val ?? 0));
    } catch (e) { return `PKR ${Number(val ?? 0).toFixed(2)}`; }
  };

  const fmtRate = (value) => String(+Number(value || 0).toFixed(2));
  const outletCardRate = outletTaxConfig?.cardReducedEnabled === false
    ? outletStandardRate
    : Number(outletTaxConfig?.cardRate ?? outletStandardRate);
  const currentServiceChargeRate = Number(outletTaxConfig?.serviceChargeRate ?? 0);
  const currentServiceChargeTypes = Array.isArray(outletTaxConfig?.serviceChargeOrderTypes)
    ? outletTaxConfig.serviceChargeOrderTypes
    : [];

  // Auto-select the only outlet once the cached list resolves.
  useEffect(() => {
    if (outlets.length === 1 && !selectedOutletId) setSelectedOutletId(outlets[0]._id);
  }, [outlets, selectedOutletId, setSelectedOutletId]);

  const { has } = usePermissions();
  const canManage = has('menu.manage');

  // Invalidate the cached product catalog so a prep created/renamed/deleted on
  // the Prep Recipes tab shows up in the recipe picker without a manual refresh.
  const refreshProducts = useCallback(() => {
    dispatch(baseApi.util.invalidateTags(['Product']));
  }, [dispatch]);

  useEffect(() => {
    if (!selectedOutlet) return;
    const loadData = async () => {
      setLoading(true);
      try {
        const catsRes = await getCategories({ outlet: selectedOutlet._id });
        const loadedCategories = catsRes.data?.data?.categories ?? catsRes.data?.data ?? [];
        setCategories(loadedCategories.sort((a, b) => a.sortOrder - b.sortOrder));
      } catch (err) {
        toast.error('Failed to load menu data.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedOutlet]);

  // Pull the selected outlet's standard tax + service-charge rates to pre-fill
  // new menu items.
  useEffect(() => {
    if (!selectedOutlet?._id) return;
    let cancelled = false;
    setOutletTaxConfigLoading(true);
    setOutletTaxConfig({});
    getTaxConfig({ outlet: selectedOutlet._id })
      .then(({ data }) => {
        if (cancelled) return;
        const c = data?.data ?? {};
        const r = Number(c.standardRate);
        if (Number.isFinite(r)) setOutletStandardRate(r);
        const sc = Number(c.serviceChargeRate);
        if (Number.isFinite(sc)) setOutletServiceChargeRate(sc);
        setOutletTaxConfig(c);
      })
      .catch(() => {
        if (!cancelled) toast.error(`Could not load Tax & PRA settings for ${selectedOutlet.name}.`);
      })
      .finally(() => {
        if (!cancelled) setOutletTaxConfigLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedOutlet]);

  // Mirror the cached menu items into local state for the optimistic UX.
  // /menu/items returns `{ data: [...], pagination }`, so the rows are at .data.
  useEffect(() => {
    setItems(itemsPayload?.data ?? []);
  }, [itemsPayload]);

  // Debounce the search box before it hits the server. Reset to page 1 in the
  // SAME commit as the new term so the query never fires once for {newSearch,
  // oldPage} and again for {newSearch, page 1}.
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(itemSearch.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [itemSearch]);

  // Switching category restarts at page 1. (Search resets page in its debounce.)
  useEffect(() => {
    setPage(1);
  }, [selectedCategoryId]);

  // A bulk selection only ever applies to the rows currently on screen — clear it
  // whenever the viewed result set changes, so a stale off-screen selection can
  // never be bulk-deleted after paginating or switching category/search.
  useEffect(() => {
    setSelectedItemIds([]);
  }, [selectedCategoryId, debouncedSearch, page]);

  // After a delete shrinks the result set, never strand the user on a page that
  // no longer exists — step back to the last real page.
  useEffect(() => {
    if (pagination.pages > 0 && page > pagination.pages) {
      setPage(pagination.pages);
    }
  }, [pagination.pages, page]);

  const handleOutletChange = (outletId) => {
    // Re-picking the current outlet is a no-op: clearing here without a change to
    // `selectedOutlet` would wipe the categories while the load effect (keyed on
    // the outlet) never re-runs, leaving an empty category panel + "All Items".
    if (outletId === selectedOutlet?._id) return;
    const outlet = outlets.find((entry) => entry._id === outletId) || null;
    setSelectedOutletId(outlet?._id || '');
    setSelectedCategoryId(null);
    setCategories([]);
    setItems([]);
    setPage(1);
    setItemSearch('');
    setDebouncedSearch('');
    setSelectedItemIds([]);
    // Drop the previous outlet's tax rate so a new item can't pre-fill the wrong
    // rate in the brief window before this outlet's rate is fetched.
    setOutletStandardRate(16);
    setOutletServiceChargeRate(0);
    setOutletTaxConfig({});
    setOutletTaxConfigLoading(Boolean(outlet));
  };

  const openCategoryModal = (category = null) => {
    setEditingCategory(category);
    setCategoryModalOpen(true);
  };

  const closeCategoryModal = () => {
    setCategoryModalOpen(false);
    setEditingCategory(null);
  };

  const openItemModal = (item = null) => {
    setEditingItem(item);
    setItemModalOpen(true);
    if (selectedOutlet?._id) {
      fetchAllMenuItems()
        .then(setDealMenuItems)
        .catch(() => {
          setDealMenuItems([]);
          toast.error('Menu items could not be loaded for the deal builder.');
        });
    }
  };

  const closeItemModal = () => {
    setItemModalOpen(false);
    setEditingItem(null);
  };

  const handleCategorySave = async (values) => {
    if (!selectedOutlet) return;
    setSaving(true);
    try {
      if (editingCategory) {
        await updateCategory(editingCategory._id, { ...values, outlet: selectedOutlet._id });
        toast.success('Category updated.');
      } else {
        await createCategory({ ...values, outlet: selectedOutlet._id });
        toast.success('Category created.');
      }
      closeCategoryModal();
      const refreshed = await getCategories({ outlet: selectedOutlet._id });
      setCategories((refreshed.data?.data?.categories ?? refreshed.data?.data ?? []).sort((a, b) => a.sortOrder - b.sortOrder));
      dispatch(baseApi.util.invalidateTags(['MenuCategory', 'MenuItem']));
      notifyPosMenuUpdated(selectedOutlet.code);
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to save category.');
    } finally {
      setSaving(false);
    }
  };

  const handleItemSave = async (values) => {
    if (!selectedOutlet) return;
    // Image controls are passed alongside the form fields — pull them out so
    // they aren't sent to the JSON create/update endpoint.
    const { _imageFile, _removeImage, ...itemValues } = values;
    setSaving(true);
    try {
      let itemId = editingItem?._id;
      if (editingItem) {
        await updateMenuItem(editingItem._id, { ...itemValues, outlet: selectedOutlet._id });
      } else {
        const created = await createMenuItem({ ...itemValues, outlet: selectedOutlet._id });
        itemId = created.data?.data?._id;
      }

      // Image side-effects run after the item exists so we always have an id.
      try {
        if (_imageFile && itemId) {
          await uploadMenuItemImage(itemId, _imageFile);
        } else if (_removeImage && itemId) {
          await deleteMenuItemImage(itemId);
        }
      } catch (imgErr) {
        toast.error(imgErr.response?.data?.message ?? 'Item saved, but the image could not be updated.');
      }

      toast.success(editingItem ? 'Menu item updated.' : 'Menu item created.');
      closeItemModal();
      dispatch(baseApi.util.invalidateTags(['MenuItem']));
      notifyPosMenuUpdated(selectedOutlet.code);
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to save menu item.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteCategory(deleteTarget._id, { hard: true });
      toast.success('Category deleted.');
      setDeleteTarget(null);
      const refreshed = await getCategories({ outlet: selectedOutlet._id });
      setCategories((refreshed.data?.data?.categories ?? refreshed.data?.data ?? []).sort((a, b) => a.sortOrder - b.sortOrder));
      dispatch(baseApi.util.invalidateTags(['MenuCategory', 'MenuItem']));
      notifyPosMenuUpdated(selectedOutlet.code);
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to delete category.');
    } finally {
      setSaving(false);
    }
  };

  const promptDeleteItem = (item) => setDeleteItemTarget(item);

  // Optimistic: drop the row immediately, delete in the background, restore on failure.
  const handleDeleteItem = () => {
    const target = deleteItemTarget;
    if (!target) return;
    const snapshot = items;
    const remaining = items.filter((it) => it._id !== target._id);
    setItems(remaining);
    // If that emptied the page, step back so the refetch lands on a page that
    // still has rows instead of flashing the empty state.
    if (remaining.length === 0 && page > 1) setPage((p) => p - 1);
    setDeleteItemTarget(null);
    deleteMenuItem(target._id, { hard: true })
      .then(() => {
        toast.success('Menu item removed.');
        dispatch(baseApi.util.invalidateTags(['MenuItem']));
        notifyPosMenuUpdated(selectedOutlet.code);
      })
      .catch((err) => {
        toast.error(err.response?.data?.message ?? 'Failed to delete item.');
        setItems(snapshot);
      });
  };

  // Optimistic toggle — flip in state now, sync in the background, revert on failure.
  const handleToggleAvailability = (item) => {
    const next = !item.isAvailable;
    setItems((cur) => cur.map((e) => (e._id === item._id ? { ...e, isAvailable: next } : e)));
    bulkUpdateAvailability([{ id: item._id, isAvailable: next }])
      .then(() => {
        dispatch(baseApi.util.invalidateTags(['MenuItem']));
        notifyPosMenuUpdated(selectedOutlet.code);
      })
      .catch((err) => {
        toast.error(err.response?.data?.message ?? 'Failed to update availability.');
        setItems((cur) => cur.map((e) => (e._id === item._id ? { ...e, isAvailable: !next } : e)));
      });
  };

  // QR visibility is a separate channel flag: turning it off hides the item
  // from table self-order without disabling it in POS or other sales flows.
  const handleToggleQrAvailability = (item) => {
    const current = item.isAvailableForQrOrder !== false;
    const next = !current;
    setItems((rows) => rows.map((row) => (
      row._id === item._id ? { ...row, isAvailableForQrOrder: next } : row
    )));
    updateMenuItem(item._id, { isAvailableForQrOrder: next })
      .then(() => {
        dispatch(baseApi.util.invalidateTags(['MenuItem']));
      })
      .catch((err) => {
        toast.error(err.response?.data?.message ?? 'Failed to update QR self-order visibility.');
        setItems((rows) => rows.map((row) => (
          row._id === item._id ? { ...row, isAvailableForQrOrder: current } : row
        )));
      });
  };

  const toggleSelectItem = (id) => {
    setSelectedItemIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const selectAllDisplayed = () => {
    setSelectedItemIds(displayedItems.map((it) => it._id));
  };

  const clearSelection = () => setSelectedItemIds([]);

  // Optimistic: remove the selected rows now, delete in the background, and
  // reconcile from the server only if something failed.
  const handleBulkDelete = () => {
    // Only ever delete rows that are actually on the current page — the selection
    // is cleared on page/category/search change, but intersect defensively too.
    const ids = selectedItemIds.filter((id) => items.some((it) => it._id === id));
    if (!ids.length) return;
    const remaining = items.filter((it) => !ids.includes(it._id));
    setItems(remaining);
    if (remaining.length === 0 && page > 1) setPage((p) => p - 1);
    setBulkDeleteOpen(false);
    clearSelection();
    Promise.allSettled(ids.map((id) => deleteMenuItem(id, { hard: true })))
      .then((results) => {
        const failed = results.filter((r) => r.status === 'rejected').length;
        const deleted = ids.length - failed;
        if (deleted > 0) toast.success(`Deleted ${deleted} item(s).`);
        if (failed > 0) toast.error(`Failed to delete ${failed} item(s).`);
        // Reconcile local state from the server (also restores any rows that failed).
        dispatch(baseApi.util.invalidateTags(['MenuItem']));
        if (deleted > 0) notifyPosMenuUpdated(selectedOutlet.code);
      });
  };

  const handleDragStart = (id) => setDraggingId(id);
  const handleDragOver = (id) => setDragOverId(id);

  const handleDrop = async () => {
    if (!draggingId || !dragOverId || draggingId === dragOverId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }

    const updated = [...categories];
    const fromIndex = updated.findIndex((category) => category._id === draggingId);
    const toIndex = updated.findIndex((category) => category._id === dragOverId);
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);

    const reordered = updated.map((category, index) => ({
      ...category,
      sortOrder: index + 1,
    }));

    setCategories(reordered);

    try {
      await Promise.all(reordered.map((category) =>
        updateCategory(category._id, { sortOrder: category.sortOrder })
      ));
      dispatch(baseApi.util.invalidateTags(['MenuCategory', 'MenuItem']));
      notifyPosMenuUpdated(selectedOutlet.code);
      toast.success('Categories reordered.');
    } catch (err) {
      toast.error('Failed to save category order.');
    } finally {
      setDraggingId(null);
      setDragOverId(null);
    }
  };

  const selectedCategory = categories.find((category) => category._id === selectedCategoryId) || categories[0] || null;

  useEffect(() => {
    if (!categories.length) return;
    setSelectedCategoryId((current) => current || categories[0]._id);
  }, [categories, setSelectedCategoryId]);

  // Combined busy flag — categories load locally, items via the cached hook.
  const isBusy = loading || itemsLoading;

  // ── Stats ─────────────────────────────────────────────────────────────────
  // Outlet-wide totals from the dedicated stats endpoint (the item list itself
  // is now just one page of one category, so it can't be counted directly).
  const totalItems     = stats?.total ?? 0;
  const availableCount = stats?.available ?? 0;
  const trackedCount   = stats?.tracked ?? 0;

  return (
    <div className="space-y-6 pb-8">
      <HeroBanner
        icon={UtensilsCrossed}
        eyebrow="Menu"
        title="Menu Management"
        subtitle="Link ingredients to recipes and manage outlet menus."
        accent="indigo"
        compact
        actions={(
          <div className="flex items-center gap-2 flex-wrap">
            <div className="min-w-[220px]">
              <SearchableSelect
                options={outlets.map((o) => ({ value: o._id, label: o.name, meta: o.code }))}
                value={selectedOutlet?._id ?? ''}
                onChange={handleOutletChange}
                placeholder="Select an outlet"
                searchPlaceholder="Search outlets…"
              />
            </div>
            {activeTab === 'items' && (
              <Button
                variant="secondary"
                icon={Printer}
                onClick={handlePrintMenu}
                disabled={!selectedOutlet || printingMenu}
              >
                {printingMenu ? 'Preparing…' : 'Print Menu'}
              </Button>
            )}
            {activeTab === 'items' && (
              <Button
                variant="primary"
                icon={Plus}
                onClick={() => openItemModal(null)}
                disabled={!selectedOutlet || !canManage || outletTaxConfigLoading || !outletTaxConfig?.outlet}
                title={outletTaxConfigLoading ? 'Loading this outlet\'s Tax & PRA settings…' : undefined}
              >
                Add Menu Item
              </Button>
            )}
          </div>
        )}
      />

      {/* ── Section tabs ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {[
          { key: 'items', label: 'Menu Items', icon: BookOpen },
          { key: 'preps', label: 'Prep Recipes', icon: ChefHat },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={clsx(
              'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition',
              activeTab === t.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            )}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Stat row */}
      {activeTab === 'items' && selectedOutlet && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            // `busy` is per-card: Categories comes from the local category load,
            // the rest from the outlet-wide stats query — so paginating the item
            // list (itemsLoading) never blinks these.
            { label: 'Categories',   value: categories.length, busy: loading,       icon: Layers,        color: 'text-indigo-600',  bg: 'bg-indigo-50'  },
            { label: 'Menu Items',   value: totalItems,        busy: statsLoading,  icon: BookOpen,      color: 'text-violet-600',  bg: 'bg-violet-50'  },
            { label: 'Available',    value: availableCount,    busy: statsLoading,  icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Tracked',      value: trackedCount,      busy: statsLoading,  icon: FlaskConical,  color: 'text-cyan-600',    bg: 'bg-cyan-50'    },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', s.bg)}>
                <s.icon size={16} className={s.color} />
              </div>
              <div className="min-w-0">
                <p className={clsx('text-xl font-bold leading-tight tabular-nums', s.color)}>
                  {s.busy ? '…' : s.value}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-widest">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'items' && isBusy && (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-gray-400 text-sm animate-pulse">
          Loading menu data…
        </div>
      )}

      {!selectedOutlet && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          <UtensilsCrossed size={36} strokeWidth={1.5} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">Select an outlet to start.</p>
          <p className="text-xs mt-1">Use the picker above to load that outlet's menu items and prep recipes.</p>
        </div>
      )}

      {activeTab === 'preps' && selectedOutlet && (
        <PrepRecipes
          outlet={selectedOutlet}
          products={products}
          canManage={canManage}
          onProductsChanged={refreshProducts}
        />
      )}

      {activeTab === 'items' && !isBusy && selectedOutlet && (
        <div className="grid gap-5 items-start xl:grid-cols-[300px_minmax(0,1fr)]">
          {/* ── Left: Category panel (sticks alongside the list while scrolling) ── */}
          <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden self-start xl:sticky xl:top-6">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Layers size={15} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Categories</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Drag to reorder · click to filter</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openCategoryModal(null)}
                disabled={!canManage}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={13} /> Add
              </button>
            </div>

            <div className="flex flex-col gap-2 p-3 max-h-[62vh] overflow-y-auto">
              {categories.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-xs text-gray-400">
                  No categories yet.
                </div>
              ) : (
                categories.map((category) => (
                  <CategoryCard
                    key={category._id}
                    category={category}
                    selected={selectedCategoryId === category._id}
                    onEdit={canManage ? openCategoryModal : undefined}
                    onDelete={canManage ? (c) => setDeleteTarget(c) : undefined}
                    onDragStart={canManage ? handleDragStart : undefined}
                    onDragOver={canManage ? handleDragOver : undefined}
                    onDrop={canManage ? handleDrop : undefined}
                    dragOver={dragOverId === category._id}
                    onSelect={() => setSelectedCategoryId(category._id)}
                  />
                ))
              )}
            </div>
          </section>

          {/* ── Right: Items panel ───────────────────────────────────────────── */}
          <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                <BookOpen size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-gray-800">
                  {selectedCategory ? selectedCategory.name : 'All Items'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {pagination.total} item{pagination.total !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <div className="px-5 py-3 border-b border-gray-100">
              <Toolbar
                itemSearch={itemSearch}
                setItemSearch={setItemSearch}
                onAddItem={() => openItemModal(null)}
                selectedCount={selectedItemIds.length}
                onBulkDelete={() => setBulkDeleteOpen(true)}
              />
            </div>

            <div className="px-5 py-2.5 flex items-center justify-end gap-3 border-b border-gray-50 bg-slate-50/40">
              <button onClick={selectAllDisplayed} className="text-xs text-gray-500 hover:text-gray-800 transition font-medium">
                Select page
              </button>
              <button onClick={clearSelection} className="text-xs text-gray-500 hover:text-gray-800 transition font-medium">
                Clear
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="bg-slate-50/80 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={allDisplayedSelected}
                        onChange={() => (allDisplayedSelected ? clearSelection() : selectAllDisplayed())}
                        aria-label="Select all displayed items"
                        className="h-3.5 w-3.5 rounded accent-indigo-600"
                      />
                    </th>
                    {['Name', 'Price', 'Foodpanda', 'Tax / Service', 'Tracking', 'Recipe', 'Available', 'QR Self-order', 'Sort', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedItems.length === 0 && pagination.total === 0 && (
                    <EmptyState message="No menu items found for this category." />
                  )}
                  {displayedItems.map((item) => (
                    <tr key={item._id} className="hover:bg-slate-50/60 transition-colors group">
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={selectedItemIds.includes(item._id)}
                          onChange={() => toggleSelectItem(item._id)}
                          className="h-3.5 w-3.5 rounded accent-indigo-600"
                          aria-label={`Select ${item.name}`}
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="h-10 w-10 rounded-lg object-cover border border-slate-100 shrink-0"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                              <UtensilsCrossed size={14} className="text-slate-300" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="font-semibold text-gray-800 group-hover:text-indigo-700 transition-colors">{item.name}</span>
                            {item.description && (
                              <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[160px]">{item.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-gray-700 font-medium tabular-nums">{fmtCurrency(item.price)}</td>
                      <td className="px-4 py-3.5 text-gray-700 font-medium tabular-nums whitespace-nowrap">
                        {(item.variations || []).length > 0
                          ? <span className="text-xs text-gray-500">Per size</span>
                          : fmtCurrency(item.foodPandaPrice ?? item.price)}
                      </td>
                      <td className="px-4 py-3.5 text-gray-500 tabular-nums whitespace-nowrap">
                        {(item.taxRate ?? 0) > 0 ? (
                          <div>
                            <p className="text-xs font-medium text-gray-600">
                              Cash {fmtRate(outletStandardRate)}% · Card {fmtRate(outletCardRate)}%
                            </p>
                            <p className="mt-0.5 text-[10px] text-gray-400">Outlet GST</p>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">Tax exempt</p>
                        )}
                        {currentServiceChargeRate > 0 && (
                          <p className="mt-1 text-[10px] text-gray-400">
                            Service {fmtRate(currentServiceChargeRate)}%
                            {currentServiceChargeTypes.length > 0 ? ` · ${currentServiceChargeTypes.join(', ')}` : ' · disabled'}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {item.trackInventory
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-100">Tracked</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        {item.itemType === 'deal' ? (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-violet-100 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                            <Layers size={12} /> Components
                          </span>
                        ) : canManage ? (
                          <button
                            type="button"
                            onClick={() => openRecipe(item)}
                            className={clsx(
                              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition border',
                              item.recipeLocked
                                ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200'
                                : 'bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-100'
                            )}
                            title={item.recipeLocked ? 'Locked — password required' : 'Edit recipe ingredients'}
                          >
                            {item.recipeLocked ? <Lock size={12} /> : <FlaskConical size={12} />}
                            {item.recipeLocked ? 'Locked' : 'Recipe'}
                          </button>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={item.isAvailable
                          ? 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100'
                          : 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500'
                        }>
                          {item.isAvailable ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          role="switch"
                          aria-label={`${item.name} available for QR self-order`}
                          aria-checked={item.isAvailableForQrOrder !== false}
                          onClick={() => handleToggleQrAvailability(item)}
                          disabled={!canManage}
                          className={clsx(
                            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-40',
                            item.isAvailableForQrOrder !== false ? 'bg-indigo-600' : 'bg-slate-300',
                          )}
                          title={item.isAvailableForQrOrder !== false ? 'Visible on QR self-order' : 'Hidden from QR self-order'}
                        >
                          <span className={clsx(
                            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                            item.isAvailableForQrOrder !== false ? 'translate-x-5' : 'translate-x-0.5',
                          )} />
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-gray-400 text-xs tabular-nums">{item.sortOrder ?? 0}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleToggleAvailability(item)}
                            disabled={!canManage}
                            className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {item.isAvailable ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openItemModal(item)}
                            disabled={!canManage}
                            className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => promptDeleteItem(item)}
                            disabled={!canManage}
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

            {/* ── Per-category pagination (20 per page) ─────────────────────── */}
            {pagination.total > 0 && (
              <div className="px-5 pb-4">
                <Pagination
                  page={pagination.page}
                  pages={pagination.pages}
                  total={pagination.total}
                  pageSize={PAGE_SIZE}
                  hasPrev={pagination.page > 1}
                  hasNext={pagination.page < pagination.pages}
                  prev={() => setPage((p) => Math.max(1, p - 1))}
                  next={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                  goTo={(n) => setPage(n)}
                />
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── Category modal ──────────────────────────────────────────────────── */}
      {categoryModalOpen && (
        <PremiumModal
          open
          onClose={saving ? undefined : closeCategoryModal}
          icon={Layers}
          eyebrow={editingCategory ? 'Edit Category' : 'New Category'}
          title={editingCategory ? 'Edit Category' : 'Create Category'}
          subtitle="Group menu items by name and color for fast filtering"
          accent="indigo"
          size="md"
        >
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <CategoryForm
              initialData={editingCategory || {}}
              onCancel={closeCategoryModal}
              onSave={handleCategorySave}
              isSaving={saving}
            />
          </div>
        </PremiumModal>
      )}

      <ConfirmModal
        isOpen={Boolean(deleteItemTarget)}
        title="Delete menu item?"
        message="This will permanently delete the menu item. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={saving}
        onConfirm={handleDeleteItem}
        onCancel={() => setDeleteItemTarget(null)}
      />

      <ConfirmModal
        isOpen={bulkDeleteOpen}
        title={`Delete ${selectedItemIds.length} item(s)?`}
        message="This will permanently delete the selected menu items and their images. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={saving}
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
      />

      <MenuItemForm
        isOpen={itemModalOpen}
        onClose={closeItemModal}
        onSubmit={handleItemSave}
        categories={categories}
        menuItems={dealMenuItems}
        initialData={editingItem ?? {
          isAvailable: true,
          isAvailableForQrOrder: true,
          taxRate: outletStandardRate,
          serviceCharge: outletServiceChargeRate,
        }}
        taxConfig={outletTaxConfig}
        outletStandardRate={outletStandardRate}
        isSaving={saving}
      />

      <RecipeEditor
        isOpen={Boolean(recipeItem)}
        onClose={(saved) => {
          setRecipeItem(null);
          // Drop the unlock token on close so the next open re-prompts and the
          // token can't linger to open other recipes / leak into list responses.
          // An explicit recipe submission completes before calling this handler,
          // so a locked recipe's save still carries the unlock token.
          clearRecipeUnlockToken();
          // Refetch without the token so any unlocked recipe data is dropped from
          // the cached list.
          dispatch(baseApi.util.invalidateTags(['MenuItem']));
          if (saved) toast.success('Recipe updated.');
        }}
        onLockChange={() => dispatch(baseApi.util.invalidateTags(['MenuItem']))}
        menuItem={recipeItem}
        outletId={selectedOutlet?._id}
        products={products}
        productsLoading={productsLoading}
        productsError={productsError && products.length === 0}
        onPrint={printItemRecipe}
      />

      {/* Password gate for a locked recipe — opens its editor only on success. */}
      <RecipeUnlockModal
        open={Boolean(unlockPromptItem)}
        itemName={unlockPromptItem?.name}
        onClose={() => setUnlockPromptItem(null)}
        onUnlocked={() => {
          const it = unlockPromptItem;
          setUnlockPromptItem(null);
          // The list cache still holds the stripped (empty) recipe; refresh so a
          // re-open reads unlocked data, and open the editor (it fetches fresh).
          dispatch(baseApi.util.invalidateTags(['MenuItem']));
          setRecipeItem(it);
        }}
      />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Delete category?"
        message="Deleting this category will mark it inactive and remove it from the menu."
        confirmLabel="Delete"
        variant="danger"
        isLoading={saving}
        onConfirm={handleDeleteCategory}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default MenuManagement;

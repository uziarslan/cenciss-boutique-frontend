import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Gift, Minus, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { dealIdOf, resolveClientDeal } from '../../utils/dealPricing';

const componentLabel = (component) => {
  const menuItem = component.menuItem || {};
  const variation = component.variationId
    ? (menuItem.variations || []).find((row) => String(row._id) === String(component.variationId))
    : null;
  return `${component.qty > 1 ? `${component.qty}× ` : ''}${menuItem.name || 'Unavailable item'}${variation ? ` (${variation.name})` : ''}`;
};

const DealChoiceModal = ({ item, basePrice, onClose, onConfirm }) => {
  const groups = useMemo(() => item.dealConfig?.choiceGroups || [], [item]);
  const [selected, setSelected] = useState(() => Object.fromEntries(groups.map((group) => [
    String(group._id),
    Array.from({ length: Number(group.minSelections) || 0 }, (_, index) => {
      const available = (group.options || []).filter((option) => option.menuItem?.isAvailable !== false);
      return available.length ? String(available[index % available.length]._id) : null;
    }).filter(Boolean),
  ])));

  const changeQuantity = (group, option, delta) => {
    if (option.menuItem?.isAvailable === false) return;
    const groupId = String(group._id);
    const optionId = String(option._id);
    const max = Math.max(1, Number(group.maxSelections) || 1);
    setSelected((current) => {
      const active = current[groupId] || [];
      if (delta < 0) {
        const index = active.lastIndexOf(optionId);
        if (index < 0) return current;
        return { ...current, [groupId]: active.filter((_, activeIndex) => activeIndex !== index) };
      }
      if (max === 1) return { ...current, [groupId]: active.includes(optionId) ? [] : [optionId] };
      if (active.length >= max) {
        toast.error(`You can choose up to ${max} from ${group.name}.`);
        return current;
      }
      return { ...current, [groupId]: [...active, optionId] };
    });
  };

  const selections = groups.map((group) => ({ groupId: group._id, optionIds: selected[String(group._id)] || [] }));
  const preview = resolveClientDeal(item, selections);
  const total = Number(basePrice || 0) + Number(preview.priceAdjustment || 0);

  const confirm = () => {
    const resolved = resolveClientDeal(item, selections);
    if (!resolved.ok) return toast.error(resolved.message);
    onConfirm(resolved);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-surface-900/55 p-4 sm:items-center" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="max-h-[88vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-float">
        <div className="flex items-start justify-between border-b border-surface-100 p-5">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Gift size={19} /></span>
            <div>
              <p className="font-bold text-surface-800">{item.name}</p>
              <p className="text-xs text-surface-400">Choose the deal options</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100"><X size={17} /></button>
        </div>
        <div className="max-h-[62vh] space-y-4 overflow-y-auto p-5">
          {(item.dealConfig?.fixedItems || []).length > 0 && (
            <div className="rounded-xl bg-surface-50 p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-surface-400">Included</p>
              <div className="space-y-1 text-sm font-medium text-surface-700">
                {item.dealConfig.fixedItems.map((component) => <p key={component._id}>• {componentLabel(component)}</p>)}
              </div>
            </div>
          )}
          {groups.map((group) => {
            const groupSelected = selected[String(group._id)] || [];
            const min = Number(group.minSelections) || 0;
            const max = Number(group.maxSelections) || 1;
            return (
              <section key={group._id}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-surface-800">{group.name}</p>
                  <span className="text-right text-[10px] font-semibold text-surface-400">
                    <span className="block">{min === max ? `Choose ${min}` : `Choose ${min}–${max}`}</span>
                    <span className={groupSelected.length >= min && groupSelected.length <= max ? 'text-emerald-600' : 'text-amber-600'}>
                      {groupSelected.length} / {max} selected
                    </span>
                  </span>
                </div>
                <div className="space-y-2">
                  {(group.options || []).map((option) => {
                    const optionId = String(option._id);
                    const optionCount = groupSelected.filter((id) => id === optionId).length;
                    const active = optionCount > 0;
                    const unavailable = option.menuItem?.isAvailable === false;
                    if (max === 1) return (
                      <button key={option._id} type="button" disabled={unavailable} onClick={() => changeQuantity(group, option, active ? -1 : 1)} className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left transition ${active ? 'border-brand-400 bg-brand-50' : 'border-surface-200 hover:border-brand-200'} ${unavailable ? 'cursor-not-allowed opacity-45' : ''}`}>
                        <span className="flex items-center gap-2">
                          <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${active ? 'border-brand-500 bg-brand-500 text-white' : 'border-surface-300'}`}>{active && <Check size={12} />}</span>
                          <span>
                            <span className="block text-sm font-semibold text-surface-700">{componentLabel(option)}</span>
                            {unavailable && <span className="text-[10px] text-rose-500">Unavailable</span>}
                          </span>
                        </span>
                        {Number(option.priceAdjustment || 0) > 0 && <span className="text-xs font-bold text-brand-600">+PKR {Number(option.priceAdjustment).toFixed(0)}</span>}
                      </button>
                    );
                    return (
                      <div key={option._id} className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 transition ${active ? 'border-brand-400 bg-brand-50' : 'border-surface-200'} ${unavailable ? 'opacity-45' : ''}`}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-surface-700">{componentLabel(option)}</span>
                          {unavailable && <span className="text-[10px] text-rose-500">Unavailable</span>}
                        </span>
                        {Number(option.priceAdjustment || 0) > 0 && <span className="shrink-0 text-xs font-bold text-brand-600">+PKR {Number(option.priceAdjustment).toFixed(0)} each</span>}
                        <span className="flex shrink-0 items-center rounded-lg border border-surface-200 bg-white p-0.5 shadow-sm">
                          <button
                            type="button"
                            aria-label={`Remove ${componentLabel(option)}`}
                            disabled={unavailable || optionCount === 0}
                            onClick={() => changeQuantity(group, option, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-surface-500 hover:bg-surface-100 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Minus size={13} />
                          </button>
                          <span className="w-7 text-center text-sm font-bold text-surface-800" aria-label={`${componentLabel(option)} quantity`}>{optionCount}</span>
                          <button
                            type="button"
                            aria-label={`Add ${componentLabel(option)}`}
                            disabled={unavailable || groupSelected.length >= max}
                            onClick={() => changeQuantity(group, option, 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-50 text-brand-600 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Plus size={13} />
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-surface-100 p-5">
          <div><p className="text-[10px] text-surface-400">Deal price</p><p className="text-lg font-bold text-brand-600">PKR {total.toFixed(0)}</p></div>
          <button type="button" onClick={confirm} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700">Add deal</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default DealChoiceModal;

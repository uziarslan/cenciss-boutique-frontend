import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch } from 'react-redux';
import { X, Lock, LayoutGrid, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { NAV_ITEMS, buildPermChecks } from './Sidebar';
import useAuth from '../../hooks/useAuth';
import usePermissions from '../../hooks/usePermissions';
import useFeatures from '../../hooks/useFeatures';
import { setUser } from '../../store/slices/authSlice';
import { updateMySidebarPreferences } from '../../api/userApi';

const ROLE_FALLBACK = (item, role) => Array.isArray(item.roles) && item.roles.includes(role);

const SidebarTabsDrawer = ({ open, onClose }) => {
  const dispatch = useDispatch();
  const { user, role } = useAuth();
  const { has } = usePermissions();
  const { hasFeature } = useFeatures();
  const permChecks = useMemo(() => buildPermChecks(has), [has]);

  const initialHidden = useMemo(
    () => new Set(user?.sidebarPreferences?.hiddenTabs ?? []),
    [user]
  );
  const [hidden, setHidden] = useState(initialHidden);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { if (open) setHidden(new Set(initialHidden)); }, [open, initialHidden]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const isAllowed = (item) => {
    const fn = permChecks[item.to];
    if (fn) return fn();
    return ROLE_FALLBACK(item, role);
  };

  const toggle = (path) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const dirty = useMemo(() => {
    if (hidden.size !== initialHidden.size) return true;
    for (const v of hidden) if (!initialHidden.has(v)) return true;
    return false;
  }, [hidden, initialHidden]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const hiddenTabs = [...hidden];
      const { data } = await updateMySidebarPreferences(hiddenTabs);
      const saved = data?.data?.sidebarPreferences?.hiddenTabs ?? hiddenTabs;
      dispatch(setUser({ ...user, sidebarPreferences: { hiddenTabs: saved } }));
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not save preferences.');
    } finally {
      setSaving(false);
    }
  };

  // Group NAV_ITEMS for display
  const sections = useMemo(() => {
    const out = [];
    let current = { label: 'General', items: [] };
    NAV_ITEMS.forEach((item) => {
      if (item.groupLabel) {
        if (current.items.length) out.push(current);
        current = { label: item.groupLabel, items: [] };
      } else {
        current.items.push(item);
      }
    });
    if (current.items.length) out.push(current);
    return out;
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 z-[60] bg-slate-950/50 backdrop-blur-sm transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Customize sidebar"
        className={clsx(
          'safe-area-drawer fixed inset-y-0 right-0 z-[70] w-full sm:w-[420px] bg-white shadow-2xl flex flex-col transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 ring-1 ring-white/20 flex items-center justify-center shrink-0">
            <LayoutGrid size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold tracking-tight">Customize Sidebar</h2>
            <p className="text-xs text-indigo-100/90 mt-0.5">
              Toggle which tabs appear in your sidebar. <span className="text-white/80">Amber</span> lock = feature not in your plan. <span className="text-white/80">Gray</span> lock = no permission.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/15"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 bg-slate-50/40">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 px-1 mb-2">
                {section.label}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {section.items.map((item) => {
                  const featureLocked = !!item.feature && !hasFeature(item.feature);
                  const allowed = !featureLocked && isAllowed(item);
                  const isHidden = hidden.has(item.to);
                  const visible = !featureLocked && allowed && !isHidden;
                  const Icon = item.icon;

                  const title = featureLocked
                    ? 'This feature is not included in your current plan'
                    : !allowed
                      ? "You don't have permission for this tab"
                      : undefined;

                  return (
                    <button
                      key={item.to}
                      type="button"
                      role="switch"
                      aria-checked={visible}
                      onClick={() => !featureLocked && allowed && toggle(item.to)}
                      disabled={featureLocked || !allowed}
                      title={title}
                      className={clsx(
                        'relative flex flex-col items-center justify-start gap-2 px-2 py-3 rounded-xl border transition text-center min-h-[88px]',
                        featureLocked && 'bg-amber-50/60 border-amber-200/70 cursor-not-allowed',
                        !featureLocked && !allowed && 'bg-slate-100/70 border-slate-200 cursor-not-allowed',
                        !featureLocked && allowed && visible && 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200 shadow-sm',
                        !featureLocked && allowed && !visible && 'bg-white border-gray-200 hover:border-indigo-200 hover:bg-slate-50'
                      )}
                    >
                      {/* Feature-locked badge — amber */}
                      {featureLocked && (
                        <span className="absolute top-1.5 right-1.5 text-amber-500">
                          <Lock size={11} />
                        </span>
                      )}
                      {/* Permission-locked badge — slate */}
                      {!featureLocked && !allowed && (
                        <span className="absolute top-1.5 right-1.5 text-slate-400">
                          <Lock size={11} />
                        </span>
                      )}
                      <span
                        className={clsx(
                          'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                          featureLocked && 'bg-amber-100 text-amber-500',
                          !featureLocked && !allowed && 'bg-slate-200 text-slate-400',
                          !featureLocked && allowed && visible && 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow',
                          !featureLocked && allowed && !visible && 'bg-slate-100 text-slate-600'
                        )}
                      >
                        <Icon size={16} />
                      </span>
                      <span
                        className={clsx(
                          'text-[11px] font-medium leading-tight line-clamp-2 break-words',
                          featureLocked && 'text-amber-700',
                          !featureLocked && !allowed && 'text-slate-500',
                          !featureLocked && allowed && visible && 'text-indigo-900',
                          !featureLocked && allowed && !visible && 'text-slate-700'
                        )}
                      >
                        {item.label}
                      </span>
                      {/* "Not in plan" micro-label under feature-locked items */}
                      {featureLocked && (
                        <span className="text-[9px] font-semibold text-amber-500/80 uppercase tracking-wide -mt-1">
                          Not in plan
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-white flex items-center justify-between gap-3">
          {error ? (
            <p className="text-xs text-rose-600 truncate flex-1">{error}</p>
          ) : (
            <p className="text-xs text-slate-500 flex-1">
              {hidden.size === 0 ? 'All allowed tabs visible' : `${hidden.size} tab${hidden.size === 1 ? '' : 's'} hidden`}
            </p>
          )}
          <button
            onClick={onClose}
            type="button"
            className="px-3 py-1.5 text-sm font-medium text-slate-700 rounded-lg hover:bg-slate-100 transition"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            type="button"
            disabled={!dirty || saving}
            className={clsx(
              'inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition',
              dirty && !saving
                ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            )}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
        </div>
      </aside>
    </>,
    document.body
  );
};

export default SidebarTabsDrawer;

import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check, Plus } from 'lucide-react';

/**
 * Generic searchable select. Drop-in replacement for native <select>.
 *
 * Renders the dropdown panel through a portal and positions it via
 * `position: fixed` against the trigger's bounding rect — so the panel always
 * sits above modals, sticky headers, and overflow:hidden ancestors, and never
 * triggers parent-container scrollbars.
 *
 * Fully keyboard-operable: the trigger is a real <button> (in the tab order,
 * with a visible focus ring); Enter/Space/↓ open it; while open, ↑/↓ move the
 * highlight, Enter selects, Esc closes, and Tab closes + returns focus to the
 * trigger so tabbing continues naturally through the form.
 */
const SearchableSelect = ({
  options = [],
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  error,
  disabled = false,
  className = '',
  searchable = true, // kept for API compat; search input is always shown when true
  allowClear = false,
  renderOption,
  // When provided, an "Add …" option appears whenever the typed search has no
  // exact label match, letting the user create a new option inline. Receives
  // the trimmed search text. `createLabel(text)` customises the row text.
  onCreateOption,
  createLabel,
  size = 'md',
  // Allows compact form fields to open a readable dropdown. The final width is
  // still clamped and repositioned so the panel stays inside the viewport.
  panelMinWidth = 0,
  id,
  name,
  ...rest
}) => {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  // Index of the keyboard-highlighted row (into `filtered`, then the create row
  // at index === filtered.length when shown).
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const activeItemRef = useRef(null);

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value ?? '')),
    [options, value]
  );

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) =>
      String(o.label ?? '').toLowerCase().includes(q) ||
      String(o.meta ?? '').toLowerCase().includes(q) ||
      String(o.value ?? '').toLowerCase().includes(q)
    );
  }, [options, search]);

  // Offer to create a new option when the typed text matches nothing exactly.
  const trimmedSearch = search.trim();
  const hasExactMatch = options.some(
    (o) => String(o.label ?? '').toLowerCase() === trimmedSearch.toLowerCase()
  );
  const showCreate = !!onCreateOption && trimmedSearch.length > 0 && !hasExactMatch;
  const navCount = filtered.length + (showCreate ? 1 : 0);

  // Recompute panel position on open, on scroll, and on resize.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom, left: r.left, width: r.width, bottomSpace: window.innerHeight - r.bottom });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  // Outside click / escape to close. (Escape also handled on the search input so
  // it can return focus to the trigger; this is the fallback when focus is
  // elsewhere.)
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) {
        setOpen(false);
        setSearch('');
      }
    };
    // Capture-phase + preventDefault so that when this select lives inside a modal
    // (whose own Escape-to-close listener is on the dialog node), Escape closes
    // only THIS dropdown, not the whole modal. Capture runs before the dialog's
    // bubble listener, which then sees defaultPrevented and skips closing.
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // Focus the search box when the panel opens.
  useEffect(() => {
    if (open && searchable) {
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open, searchable]);

  // Reset the highlight to the top whenever the visible list changes.
  useEffect(() => { setActiveIndex(0); }, [search, open]);

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    if (open) activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const closeAndFocusTrigger = () => {
    setOpen(false);
    setSearch('');
    triggerRef.current?.focus();
  };

  const pickOption = (o) => {
    if (!o || o.disabled) return;
    onChange(o.value);
    closeAndFocusTrigger();
  };

  // Commit the currently-highlighted row (option or the create row).
  const chooseActive = () => {
    if (navCount === 0) return;
    if (activeIndex < filtered.length) {
      pickOption(filtered[activeIndex]);
    } else if (showCreate) {
      onCreateOption(trimmedSearch);
      closeAndFocusTrigger();
    }
  };

  // Keydown on the trigger button (panel closed).
  const handleTriggerKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setSearch('');
    }
  };

  // Keydown inside the open panel's search input.
  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (navCount ? (i + 1) % navCount : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (navCount ? (i - 1 + navCount) % navCount : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      chooseActive();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeAndFocusTrigger();
    } else if (e.key === 'Tab') {
      // Close and hand focus back to the trigger so Tab flow stays in the form.
      e.preventDefault();
      closeAndFocusTrigger();
    }
  };

  const padding = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm';

  // Decide whether to drop above when not enough room below.
  const PANEL_MAX_HEIGHT = 320;
  const VIEWPORT_GUTTER = 12;
  const dropUp = rect && rect.bottomSpace < PANEL_MAX_HEIGHT && rect.bottomSpace < (window.innerHeight - rect.bottomSpace);
  const requestedPanelWidth = rect
    ? Math.max(rect.width, Number(panelMinWidth) || 0)
    : 0;
  const panelWidth = rect
    ? Math.min(requestedPanelWidth, Math.max(0, window.innerWidth - (VIEWPORT_GUTTER * 2)))
    : 0;
  const panelLeft = rect
    ? Math.max(
        VIEWPORT_GUTTER,
        Math.min(rect.left, window.innerWidth - VIEWPORT_GUTTER - panelWidth),
      )
    : 0;
  const panelStyle = rect
    ? dropUp
      ? { position: 'fixed', left: panelLeft, width: panelWidth, bottom: window.innerHeight - rect.top + 4, maxHeight: PANEL_MAX_HEIGHT }
      : { position: 'fixed', left: panelLeft, width: panelWidth, top: rect.top + 4, maxHeight: PANEL_MAX_HEIGHT }
    : null;

  return (
    <div className="relative" {...rest}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        name={name}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { if (!disabled) { setOpen((o) => !o); setSearch(''); } }}
        onKeyDown={handleTriggerKeyDown}
        className={`flex items-center justify-between w-full border rounded-lg cursor-pointer transition outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${padding} ${
          open ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-gray-300 hover:border-gray-400'
        } ${error ? 'border-red-400 ring-2 ring-red-400/20' : ''} ${
          disabled ? 'bg-gray-50 cursor-not-allowed text-gray-400' : 'bg-white'
        } ${className}`}
      >
        <span className={`${selected ? 'text-gray-800' : 'text-gray-400'} flex min-w-0 flex-1 flex-col items-start text-left leading-tight`}>
          {selected ? (
            <>
              <span className="block w-full truncate">{selected.label}</span>
              {selected.meta && <span className="mt-0.5 block w-full truncate text-[11px] font-normal text-gray-400">{selected.meta}</span>}
            </>
          ) : <span className="truncate">{placeholder}</span>}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {allowClear && selected && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              className="text-gray-300 hover:text-gray-500 px-1 leading-none"
              aria-label="Clear"
            >
              ×
            </span>
          )}
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && !disabled && rect && createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className="z-[1000] bg-white border border-gray-200 rounded-lg shadow-2xl overflow-hidden flex flex-col"
        >
          {searchable && (
            <div className="p-2 border-b border-gray-100 shrink-0">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={searchPlaceholder}
                  role="combobox"
                  aria-expanded={open}
                  aria-controls={`${id || name || 'ss'}-listbox`}
                  className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}
          <ul id={`${id || name || 'ss'}-listbox`} role="listbox" className="overflow-y-auto py-1 flex-1 min-h-0">
            {filtered.length === 0 && !showCreate ? (
              <li className="px-3 py-2 text-sm text-gray-400">No matches.</li>
            ) : (
              filtered.map((o, idx) => {
                const isActive = String(o.value) === String(value ?? '');
                const isHighlighted = idx === activeIndex;
                return (
                  <li
                    key={`${o.value}-${o.label}`}
                    ref={isHighlighted ? activeItemRef : null}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`px-3 py-2 text-sm cursor-pointer flex items-start justify-between gap-3 transition ${
                      o.disabled
                        ? 'text-gray-300 cursor-not-allowed'
                        : isHighlighted
                          ? 'bg-indigo-100 text-indigo-800'
                          : isActive
                            ? 'bg-indigo-50 text-indigo-700 font-medium'
                            : 'text-gray-700 hover:bg-indigo-50'
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (o.disabled) return;
                      onChange(o.value);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    {renderOption ? renderOption(o, isActive) : (
                      <>
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="block truncate">{o.label}</span>
                          {o.meta && <span className="mt-1 block truncate text-[11px] font-normal text-gray-400">{o.meta}</span>}
                        </span>
                        {isActive && <Check size={13} className="mt-0.5 shrink-0 text-indigo-600" />}
                      </>
                    )}
                  </li>
                );
              })
            )}
            {showCreate && (
              <li
                ref={activeIndex === filtered.length ? activeItemRef : null}
                role="option"
                aria-selected={false}
                onMouseEnter={() => setActiveIndex(filtered.length)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onCreateOption(trimmedSearch);
                  setOpen(false);
                  setSearch('');
                }}
                className={`px-3 py-2 text-sm cursor-pointer text-green-700 font-medium flex items-center gap-1.5 border-t border-gray-100 ${
                  activeIndex === filtered.length ? 'bg-green-100' : 'hover:bg-green-50'
                }`}
              >
                <Plus size={13} className="shrink-0" />
                {typeof createLabel === 'function'
                  ? createLabel(trimmedSearch)
                  : <span className="truncate">Add &quot;{trimmedSearch}&quot; as new item</span>}
              </li>
            )}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SearchableSelect;

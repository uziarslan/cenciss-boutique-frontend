import { useState, useRef, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Search, User, X, Phone, MapPin, PlusCircle, ChevronDown, Pencil, Check, Award, Gift } from 'lucide-react';
import { searchCustomersByPhone, upsertCustomer, updateCustomer } from '../../api/customerApi';
import { issueCard } from '../../api/loyaltyApi';
import { useLoyalty, useMember } from '../../hooks/useLoyalty';
import {
  setCustomer,
  clearCustomer,
  setDeliveryAddress,
  updateCustomerAddresses,
} from '../../store/slices/orderSlice';
import AddressModal from './AddressModal';
import toast from 'react-hot-toast';

const CustomerPanel = () => {
  const dispatch = useDispatch();
  const customer = useSelector((s) => s.order.customer);
  const orderType = useSelector((s) => s.order.orderType);
  const deliveryAddress = useSelector((s) => s.order.deliveryAddress);

  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Name for new-customer registration
  const [nameInput,   setNameInput]   = useState('');

  // Inline name editing for attached customer
  const [editingName,   setEditingName]   = useState(false);
  const [editNameInput, setEditNameInput] = useState('');

  // Address state
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [showAddressModal,    setShowAddressModal]    = useState(false);

  // ── Membership / Rewards ────────────────────────────────────────────────
  const { enabled: loyaltyEnabled, config: loyaltyConfig } = useLoyalty();
  const { member, refresh: refreshMember } = useMember(customer?._id);
  const [issuingCard, setIssuingCard] = useState(false);
  const [manualCardInput, setManualCardInput] = useState('');

  const handleIssueCard = async () => {
    if (!customer) return;
    setIssuingCard(true);
    try {
      const cardNum = loyaltyConfig?.cardNumberMode === 'manual' ? manualCardInput.trim() : undefined;
      const res = await issueCard(customer._id, cardNum);
      const updated = res?.data?.data;
      if (updated) {
        dispatch(setCustomer({ ...customer, ...updated }));
        toast.success(`Card issued: ${updated.membershipCardNumber}`);
        setManualCardInput('');
        refreshMember();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to issue card');
    } finally {
      setIssuingCard(false);
    }
  };

  const searchTimer = useRef(null);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
        setShowAddressDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handlePhoneChange = useCallback((val) => {
    setQuery(val);
    setNameInput(''); // reset name when phone changes
    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (val.trim().length < 3) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchCustomersByPhone(val.trim());
        setResults(res.data?.data ?? []);
        setShowDropdown(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  const selectCustomer = (c) => {
    dispatch(setCustomer(c));
    setQuery('');
    setNameInput('');
    setResults([]);
    setShowDropdown(false);
    // Auto-select default address for delivery
    if (orderType === 'delivery') {
      const def = c.addresses?.find((a) => a.isDefault) ?? c.addresses?.[0];
      if (def) dispatch(setDeliveryAddress(def));
    }
  };

  const handleCreateNew = async () => {
    if (!query.trim()) return;
    try {
      const res = await upsertCustomer({
        phone: query.trim(),
        ...(nameInput.trim() && { name: nameInput.trim() }),
      });
      const c = res.data?.data;
      if (c) {
        dispatch(setCustomer(c));
        toast.success('Customer created');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create customer');
    }
    setQuery('');
    setNameInput('');
    setShowDropdown(false);
  };

  // Save / update name on an already-attached customer
  const handleSaveName = () => {
    if (!editNameInput.trim() || !customer) return;
    const newName = editNameInput.trim();
    const snapshot = customer;
    // Optimistic: update the name + close the editor immediately, then persist
    // in the background. The customer _id already exists so nothing downstream
    // depends on the server response. Revert if the PATCH fails.
    dispatch(setCustomer({ ...customer, name: newName }));
    setEditingName(false);
    toast.success('Name saved');
    updateCustomer(customer._id, { name: newName })
      .then((res) => {
        if (res?.data?.data) dispatch(setCustomer(res.data.data));
      })
      .catch((err) => {
        dispatch(setCustomer(snapshot)); // revert
        toast.error(err.response?.data?.message || 'Failed to save name — reverted');
      });
  };

  const handleAddressAdded = (newAddresses) => {
    dispatch(updateCustomerAddresses(newAddresses));
    // auto-select the newly added address
    const added = newAddresses[newAddresses.length - 1];
    if (added) dispatch(setDeliveryAddress(added));
    setShowAddressModal(false);
  };

  if (customer) {
    return (
      <div className="rounded-xl border border-brand-100 bg-brand-50/50 px-3 py-2.5 space-y-2">
        {/* Customer info row */}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white flex-shrink-0">
            <User size={13} />
          </div>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={editNameInput}
                  onChange={(e) => setEditNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-brand-300 bg-white px-2 py-0.5 text-xs font-semibold text-surface-900 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  placeholder="Customer name"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  className="rounded p-1 text-brand-600 hover:bg-brand-100"
                  title="Save"
                >
                  <Check size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingName(false)}
                  className="rounded p-1 text-surface-400 hover:bg-surface-100"
                  title="Cancel"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 group">
                <p className="text-xs font-bold text-surface-900 truncate leading-tight">
                  {customer.name ?? <span className="font-normal italic text-surface-400">No name</span>}
                </p>
                <button
                  type="button"
                  onClick={() => { setEditNameInput(customer.name || ''); setEditingName(true); }}
                  className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-surface-400 hover:text-brand-600 transition-opacity flex-shrink-0"
                  title="Edit name"
                >
                  <Pencil size={10} />
                </button>
              </div>
            )}
            {!editingName && (
              <p className="text-[11px] text-surface-500 truncate flex items-center gap-1 mt-0.5">
                <Phone size={10} />
                {customer.phone}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => { dispatch(clearCustomer()); setEditingName(false); }}
            className="rounded-lg p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-700 flex-shrink-0"
            title="Remove customer"
          >
            <X size={13} />
          </button>
        </div>

        {/* Prompt to add name if none set */}
        {!customer.name && !editingName && (
          <button
            type="button"
            onClick={() => { setEditNameInput(''); setEditingName(true); }}
            className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-brand-200 bg-white/60 px-2.5 py-1.5 text-[11px] text-brand-500 hover:bg-brand-50 transition-colors"
          >
            <Pencil size={11} />
            Add customer name…
          </button>
        )}

        {/* Membership / Rewards — only when feature enabled */}
        {loyaltyEnabled && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Award size={12} className="text-amber-600 flex-shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Rewards</span>
              </div>
              <span className="text-xs font-extrabold text-amber-800">
                {member?.customer?.pointsBalance ?? customer.pointsBalance ?? 0} pts
              </span>
            </div>
            {(member?.customer?.membershipCardNumber || customer.membershipCardNumber) ? (
              <p className="text-[11px] text-surface-600 font-mono truncate">
                Card: {member?.customer?.membershipCardNumber || customer.membershipCardNumber}
              </p>
            ) : (
              <div className="space-y-1.5">
                {loyaltyConfig?.cardNumberMode === 'manual' && (
                  <input
                    type="text"
                    value={manualCardInput}
                    onChange={(e) => setManualCardInput(e.target.value)}
                    placeholder="Enter card number"
                    className="w-full rounded border border-amber-200 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                )}
                <button
                  type="button"
                  onClick={handleIssueCard}
                  disabled={issuingCard || (loyaltyConfig?.cardNumberMode === 'manual' && !manualCardInput.trim())}
                  className="flex w-full items-center justify-center gap-1.5 rounded bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  <Gift size={11} />
                  {issuingCard ? 'Issuing…' : 'Issue Card'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Delivery address selector — only visible for delivery orders */}
        {orderType === 'delivery' && (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowAddressDropdown((v) => !v)}
              className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-brand-300 bg-white px-2.5 py-1.5 text-left text-xs text-surface-700 hover:bg-brand-50"
            >
              <MapPin size={12} className="text-brand-500 flex-shrink-0" />
              <span className="flex-1 truncate">
                {deliveryAddress
                  ? [deliveryAddress.street, deliveryAddress.area, deliveryAddress.city]
                      .filter(Boolean).join(', ') || deliveryAddress.label || 'Selected'
                  : 'Select delivery address'}
              </span>
              <ChevronDown size={12} className="text-surface-400 flex-shrink-0" />
            </button>

            {showAddressDropdown && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-surface-200 bg-white shadow-float overflow-hidden">
                {customer.addresses?.length > 0 ? (
                  customer.addresses.map((addr) => (
                    <button
                      key={addr._id}
                      type="button"
                      onClick={() => {
                        dispatch(setDeliveryAddress(addr));
                        setShowAddressDropdown(false);
                      }}
                      className={`flex w-full items-start gap-2 px-3 py-2.5 text-left text-xs hover:bg-surface-50 ${
                        deliveryAddress?._id === addr._id ? 'bg-brand-50' : ''
                      }`}
                    >
                      <MapPin size={12} className="mt-0.5 text-brand-500 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-surface-900">{addr.label || 'Address'}</p>
                        <p className="text-surface-500">
                          {[addr.street, addr.area, addr.city].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-xs text-surface-400">No saved addresses</p>
                )}
                <button
                  type="button"
                  onClick={() => { setShowAddressDropdown(false); setShowAddressModal(true); }}
                  className="flex w-full items-center gap-2 border-t border-surface-100 px-3 py-2.5 text-xs font-semibold text-brand-600 hover:bg-brand-50"
                >
                  <PlusCircle size={12} />
                  Add new address
                </button>
              </div>
            )}
          </div>
        )}

        {/* Add address modal */}
        {showAddressModal && (
          <AddressModal
            customerId={customer._id}
            onClose={() => setShowAddressModal(false)}
            onSaved={handleAddressAdded}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
        <input
          type="tel"
          value={query}
          onChange={(e) => handlePhoneChange(e.target.value)}
          onFocus={() => query.trim().length >= 3 && setShowDropdown(true)}
          placeholder="Phone number (optional)"
          className="w-full rounded-xl border border-surface-200 bg-surface-50 py-2 pl-8 pr-3 text-xs text-surface-800 placeholder-surface-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border border-brand-400 border-t-transparent" />
          </div>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-surface-200 bg-white shadow-float overflow-hidden">
          {/* Existing customer results */}
          {results.length > 0 ? (
            results.map((c) => (
              <button
                key={c._id}
                type="button"
                onClick={() => selectCustomer(c)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-surface-50 border-b border-surface-50 last:border-0"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-brand-700 flex-shrink-0">
                  <User size={13} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-surface-900 truncate leading-tight">
                    {c.name || <span className="italic text-surface-400">No name</span>}
                  </p>
                  <p className="text-[11px] text-surface-500">{c.phone}</p>
                </div>
                {c.addresses?.length > 0 && (
                  <span className="ml-auto flex items-center gap-1 text-[10px] text-surface-400 flex-shrink-0">
                    <MapPin size={10} />
                    {c.addresses.length}
                  </span>
                )}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-surface-400">No customer found for this number</p>
          )}

          {/* Register new customer — phone + optional name */}
          {query.trim().length >= 3 && (
            <div className="border-t border-surface-100 px-3 py-2.5 space-y-2 bg-surface-50/50">
              <p className="text-[10px] font-bold uppercase tracking-wider text-surface-400">
                Register New Customer
              </p>
              <div className="relative">
                <User size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateNew()}
                  placeholder="Customer name (optional)"
                  className="w-full rounded-lg border border-surface-200 bg-white py-1.5 pl-7 pr-3 text-xs text-surface-800 placeholder-surface-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-100"
                />
              </div>
              <button
                type="button"
                onClick={handleCreateNew}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 active:scale-[0.98] transition-all"
              >
                <PlusCircle size={12} />
                Register {query.trim()}{nameInput.trim() ? ` · ${nameInput.trim()}` : ''}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerPanel;

import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Award, X } from 'lucide-react';
import { selectCartSubtotal, selectCartTax, selectCartServiceCharge, selectCartDeliveryCharge, selectCartTotal } from '../../store/slices/cartSlice';
import { setRedeemPoints, clearRedeemPoints } from '../../store/slices/orderSlice';
import { useLoyalty, useMember } from '../../hooks/useLoyalty';

const fmt = (v) => `PKR ${(Number(v) || 0).toFixed(0)}`;
const fmtRate = (value) => Number(Number(value || 0).toFixed(2)).toString();

const CartTotals = () => {
  const dispatch = useDispatch();
  const subtotal = useSelector(selectCartSubtotal);
  const tax = useSelector(selectCartTax);
  const serviceCharge = useSelector(selectCartServiceCharge);
  const deliveryCharge = useSelector(selectCartDeliveryCharge);
  const total = useSelector(selectCartTotal);
  const discount = useSelector((state) => state.cart.discount);
  const discountMode = useSelector((state) => state.cart.discountMode);
  const discountPercent = useSelector((state) => state.cart.discountPercent);
  const standardTaxRate = useSelector((state) => Number(state.taxConfig?.standardRate || 0));
  const serviceChargeRate = useSelector((state) => Number(state.taxConfig?.serviceChargeRate || 0));
  const orderType = useSelector((state) => state.order.orderType);
  const customer = useSelector((s) => s.order.customer);
  const redeemPoints = useSelector((s) => s.order.redeemPoints || 0);

  const { enabled: loyaltyEnabled, config } = useLoyalty();
  const { member } = useMember(customer?._id);

  const balance = member?.customer?.pointsBalance ?? customer?.pointsBalance ?? 0;
  const redeemValue = useMemo(
    () => Math.round((redeemPoints || 0) * (config?.redemptionValue || 0)),
    [redeemPoints, config]
  );

  const effectiveDiscount = orderType === 'foodpanda' ? 0 : (discount || 0);
  const appliedDiscountRate = effectiveDiscount > 0 && subtotal > 0
    ? (discountMode === 'percent' && Number(discountPercent) > 0
        ? Number(discountPercent)
        : (effectiveDiscount / subtotal) * 100)
    : 0;
  const effectiveRedeemValue = orderType === 'foodpanda' ? 0 : redeemValue;
  const subtotalAfterDiscount = Math.max(0, subtotal - effectiveDiscount);
  const cap = useMemo(() => {
    if (!config) return 0;
    return Math.floor(((config.maxRedeemPercent || 0) / 100) * subtotalAfterDiscount);
  }, [config, subtotalAfterDiscount]);

  const earnPreview = useMemo(() => {
    if (!loyaltyEnabled || !customer || !config?.pointsPerCurrencyUnit) return 0;
    const basis = config.earnBasis === 'subtotalPlusTax'
      ? subtotalAfterDiscount + tax
      : subtotalAfterDiscount;
    return Math.floor(basis * config.pointsPerCurrencyUnit);
  }, [loyaltyEnabled, customer, config, subtotalAfterDiscount, tax]);

  const handleChange = (raw) => {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    dispatch(setRedeemPoints(Math.min(n, balance)));
  };

  const handleApplyMax = () => {
    if (!config) return;
    const maxByCap = cap > 0 ? Math.floor(cap / (config.redemptionValue || 1)) : balance;
    const maxAffordable = Math.min(balance, maxByCap);
    dispatch(setRedeemPoints(Math.max(0, maxAffordable)));
  };

  return (
    <div className="space-y-1.5 rounded-xl bg-surface-100/60 p-3">
      <div className="flex justify-between text-xs text-surface-500">
        <span>Subtotal</span>
        <span className="font-medium">{fmt(subtotal)}</span>
      </div>
      {tax > 0 && (
        <div className="flex justify-between text-xs text-surface-500">
          <span>Tax ({fmtRate(standardTaxRate)}%)</span>
          <span className="font-medium">{fmt(tax)}</span>
        </div>
      )}
      {serviceCharge > 0 && (
        <div className="flex justify-between text-xs text-surface-500">
          <span>Service Charge ({fmtRate(serviceChargeRate)}%)</span>
          <span className="font-medium">{fmt(serviceCharge)}</span>
        </div>
      )}
      {deliveryCharge > 0 && (
        <div className="flex justify-between text-xs text-surface-500">
          <span>Delivery Charge</span>
          <span className="font-medium">{fmt(deliveryCharge)}</span>
        </div>
      )}
      {orderType !== 'foodpanda' && discount > 0 && (
        <div className="flex justify-between text-xs text-rose-600">
          <span>Discount ({fmtRate(appliedDiscountRate)}%)</span>
          <span className="font-medium">-{fmt(discount)}</span>
        </div>
      )}

      {/* Membership / Rewards — redeem block (only when enabled + customer attached) */}
      {orderType !== 'foodpanda' && loyaltyEnabled && customer && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-amber-700">
            <span className="flex items-center gap-1"><Award size={11} /> Rewards</span>
            <span className="text-amber-800">Balance: {balance} pts</span>
          </div>
          {balance >= (config?.minRedeemPoints || 0) && balance > 0 ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                max={balance}
                value={redeemPoints || ''}
                onChange={(e) => handleChange(e.target.value)}
                placeholder={`Redeem (min ${config?.minRedeemPoints || 0})`}
                className="flex-1 min-w-0 rounded border border-amber-200 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-300"
              />
              <button
                type="button"
                onClick={handleApplyMax}
                className="rounded bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-200"
              >
                Max
              </button>
              {redeemPoints > 0 && (
                <button
                  type="button"
                  onClick={() => dispatch(clearRedeemPoints())}
                  className="rounded p-1 text-amber-700 hover:bg-amber-100"
                  title="Clear redemption"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-amber-700">
              {balance > 0
                ? `Need ${(config?.minRedeemPoints || 0) - balance} more points to redeem.`
                : 'No points yet — earn on this purchase.'}
            </p>
          )}
          {redeemPoints > 0 && (
            <div className="flex justify-between text-[11px] text-amber-800">
              <span>Redeeming {redeemPoints} pts</span>
              <span className="font-semibold">-{fmt(redeemValue)}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between border-t border-surface-200 pt-2 text-base font-extrabold text-surface-900">
        <span>Total</span>
        <span>{fmt(Math.max(0, total - effectiveRedeemValue))}</span>
      </div>

      {orderType !== 'foodpanda' && loyaltyEnabled && customer && earnPreview > 0 && (
        <p className="text-[10px] text-amber-700 text-right">
          Earns {earnPreview} pt{earnPreview === 1 ? '' : 's'} on this sale
        </p>
      )}
    </div>
  );
};

export default CartTotals;

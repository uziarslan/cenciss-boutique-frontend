import { useMemo } from 'react';
import NumPad from '../UI/NumPad';

const formatPKR = (value) => `PKR ${Number(value).toFixed(2)}`;

const CashTender = ({ total, tendered, onTenderedChange }) => {
  const amount = Number(tendered) || 0;
  const change = amount - total;
  const valid = amount >= total;

  const quickButtons = useMemo(
    () => [total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000],
    [total]
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-500">Amount Due</p>
        <p className="mt-2 text-3xl font-semibold text-gray-900">{formatPKR(total)}</p>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {quickButtons.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onTenderedChange(String(value))}
              className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-50"
            >
              {formatPKR(value)}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Cash Tendered</p>
          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 text-2xl font-semibold text-gray-900">
            {tendered || '0'}
          </div>
          <div className="mt-4">
            <NumPad value={String(tendered || '')} onChange={onTenderedChange} onConfirm={() => {}} mode="cash" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-500">Change</p>
        <p className={`mt-2 text-2xl font-semibold ${valid ? 'text-emerald-700' : 'text-rose-600'}`}>
          {change >= 0 ? formatPKR(change) : `Short by ${formatPKR(Math.abs(change))}`}
        </p>
      </div>
    </div>
  );
};

export default CashTender;

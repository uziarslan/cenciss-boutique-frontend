import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation } from 'react-router';
import { format } from 'date-fns';
import { CheckCircle, Printer, LogOut } from 'lucide-react';
import unifiedLogout from '../utils/unifiedLogout';
import ConfirmModal from '../components/UI/ConfirmModal';

const formatPKR = (value) => `PKR ${Number(value || 0).toFixed(0)}`;

const Row = ({ label, value, bold }) => (
  <div className={`flex justify-between py-2.5 text-sm ${bold ? 'font-semibold text-surface-900' : 'text-surface-600'}`}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

const SessionSummary = () => {
  const dispatch = useDispatch();
  const location = useLocation();
  const [confirmingPrint, setConfirmingPrint] = useState(false);

  const reduxSession = useSelector((state) => state.session.session);
  const session = location.state?.closedSession || reduxSession;

  const totals = session?.totals || {};
  const openingFloat = session?.openingFloat ?? 0;
  const closingFloat = session?.closingFloat ?? 0;
  const cashSales = totals.cashSales ?? 0;
  const cardSales = totals.cardSales ?? 0;
  const onlineTransferSales = totals.onlineTransferSales ?? 0;
  const storeCreditSales = totals.storeCreditSales ?? 0;
  const totalSales = totals.totalSales ?? 0;
  const totalTransactions = totals.totalTransactions ?? 0;
  const totalRefunds = totals.totalRefunds ?? 0;
  const expectedCash = openingFloat + (totals.netCash ?? cashSales) + (totals.paidIn ?? 0) - (totals.paidOut ?? 0);
  const variance = closingFloat - expectedCash;

  const handlePrint = () => window.print();

  const handleLogout = () => {
    unifiedLogout(dispatch);
  };

  return (
    <div className="pb-10 print:pt-6">
      <div className="mx-auto max-w-xl px-4 py-6">
        <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-card print:border-none print:shadow-none">
          {/* Badge */}
          <div className="flex items-center gap-3">
            <CheckCircle size={28} className="text-emerald-500" />
            <div>
              <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                Session Closed
              </span>
              <p className="mt-1 text-xs text-surface-400">
                {session?.closedAt
                  ? format(new Date(session.closedAt), 'dd MMM yyyy, h:mm a')
                  : 'Closed'}
              </p>
            </div>
          </div>

          {/* Session Meta */}
          <div className="mt-5 space-y-1 text-xs text-surface-400">
            <p>Session: <span className="font-medium text-surface-700">{session?.sessionNumber || '—'}</span></p>
            <p>
              Opened:{' '}
              <span className="font-medium text-surface-700">
                {session?.openedAt ? format(new Date(session.openedAt), 'dd MMM yyyy, h:mm a') : '—'}
              </span>
            </p>
            <p>
              Closed:{' '}
              <span className="font-medium text-surface-700">
                {session?.closedAt ? format(new Date(session.closedAt), 'dd MMM yyyy, h:mm a') : '—'}
              </span>
            </p>
          </div>

          {/* Divider */}
          <hr className="my-5 border-surface-100" />

          {/* Totals */}
          <div className="divide-y divide-surface-100">
            <Row label="Total Transactions" value={totalTransactions} />
            <Row label="Cash Sales" value={formatPKR(cashSales)} />
            <Row label="Card Sales" value={formatPKR(cardSales)} />
            <Row label="Online Transfer Sales" value={formatPKR(onlineTransferSales)} />
            <Row label="Store Credit Redeemed" value={formatPKR(storeCreditSales)} />
            <Row label="Total Refunds" value={formatPKR(totalRefunds)} />
            <Row label="Total Sales (Net)" value={formatPKR(totalSales)} bold />
            <Row label="Opening Float" value={formatPKR(openingFloat)} />
            <Row label="Expected Cash" value={formatPKR(expectedCash)} />
            <Row label="Actual Cash (Closing Float)" value={formatPKR(closingFloat)} />
            <Row
              label="Cash Variance"
              value={`${variance >= 0 ? '+' : ''}${formatPKR(variance)}`}
              bold
            />
          </div>

          {/* Actions */}
          <div className="mt-8 flex flex-col gap-3 print:hidden">
            <button
              type="button"
              onClick={() => setConfirmingPrint(true)}
              className="btn-secondary w-full justify-center gap-2 py-3"
            >
              <Printer size={16} />
              Print Summary
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-surface-900 py-3 text-sm font-bold text-white transition-all hover:bg-surface-800"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
      </div>
      {confirmingPrint && (
        <ConfirmModal
          title="Print session summary?"
          message="The closed-session summary shown here will be sent to the printer."
          confirmLabel="Print Summary"
          cancelLabel="Cancel"
          variant="primary"
          onConfirm={() => {
            setConfirmingPrint(false);
            window.setTimeout(handlePrint, 0);
          }}
          onCancel={() => setConfirmingPrint(false)}
        />
      )}
    </div>
  );
};

export default SessionSummary;

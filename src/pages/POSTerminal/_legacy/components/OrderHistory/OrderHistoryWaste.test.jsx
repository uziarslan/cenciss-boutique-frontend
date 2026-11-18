import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import OrderHistoryView from './OrderHistoryView';
import {
  getMyTransactions,
  getOrderWastePreview,
  logOrderAsWaste,
} from '../../api/sessionApi';

vi.mock('../../api/sessionApi', () => ({
  getMyTransactions: vi.fn(),
  getOrderWastePreview: vi.fn(),
  logOrderAsWaste: vi.fn(),
  retryFbrSubmission: vi.fn(),
}));

vi.mock('../../hooks/useSession', () => ({
  default: () => ({
    cashier: { _id: 'user-1', id: 'user-1', role: 'owner', name: 'Owner' },
    session: { _id: 'session-1', outlet: { _id: 'outlet-1' } },
    outletName: 'Test Outlet',
  }),
}));

vi.mock('../Print/ReceiptPrintProvider', () => ({
  useReceiptPrint: () => ({ requestReceiptPrint: vi.fn() }),
}));

vi.mock('../../../../../config/permissions', () => ({
  hasEffectivePermission: () => true,
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const transaction = {
  _id: 'transaction-1',
  transactionNumber: 'TXN-TEST-1',
  createdAt: '2026-08-05T00:00:00.000Z',
  status: 'completed',
  cashier: { _id: 'user-1', name: 'Owner' },
  orderType: 'takeaway',
  paymentMethod: 'cash',
  totalAmount: 287.5,
  isCurrentBusinessDay: true,
  items: [
    { name: 'Burger', qty: 2, unitPrice: 100, lineTotal: 200, wastedQty: 0 },
    { name: 'Drink', qty: 1, unitPrice: 50, lineTotal: 50, wastedQty: 0 },
  ],
};

test('logs selected order-history items using order value', async () => {
  getMyTransactions.mockResolvedValue({
    data: [transaction],
    pagination: { total: 1, page: 1, limit: 25, pages: 1 },
    summary: { businessDate: '2026-08-05', invoices: 1, totalOrders: 1 },
    cashiers: [{ _id: 'user-1', name: 'Owner' }],
  });
  getOrderWastePreview.mockResolvedValue({
    ingredientCost: 125,
    orderValue: 287.5,
    items: [
      { index: 0, name: 'Burger', qty: 2, remainingQty: 2, ingredientCost: 100, orderValue: 230 },
      { index: 1, name: 'Drink', qty: 1, remainingQty: 1, ingredientCost: 25, orderValue: 57.5 },
    ],
  });
  logOrderAsWaste.mockResolvedValue({ wasteValue: 230 });

  render(<MemoryRouter><OrderHistoryView /></MemoryRouter>);

  fireEvent.click(await screen.findByText('TXN-TEST-1'));
  fireEvent.click(await screen.findByRole('button', { name: 'Log Order as Waste' }));

  expect(await screen.findByText('Waste valuation')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Select items' }));
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  fireEvent.click(screen.getByRole('button', { name: /Order value.*Rs\. 230\.00/i }));
  fireEvent.change(screen.getByPlaceholderText(/wrong order, dropped/i), {
    target: { value: 'Dropped at pass' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Log as Waste' }));

  await waitFor(() => expect(logOrderAsWaste).toHaveBeenCalledWith(
    'transaction-1',
    {
      reason: 'orderVoid',
      notes: 'Dropped at pass',
      rePrepare: false,
      selection: [{ index: 0, qty: 2 }],
      valuationMethod: 'orderValue',
    },
  ));
});

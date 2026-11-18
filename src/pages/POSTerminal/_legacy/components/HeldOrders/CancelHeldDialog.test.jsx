import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CancelHeldDialog, HeldCashierNote } from './HeldOrdersPanel';
import { getOrderWastePreview } from '../../api/sessionApi';

vi.mock('../../api/sessionApi', () => ({
  getOrderWastePreview: vi.fn(),
  acknowledgeKdsReady: vi.fn(),
  getHeldOrders: vi.fn(),
  resumeHeldOrder: vi.fn(),
  cancelHeldOrder: vi.fn(),
  moveHeldOrderItem: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

test('selects prepared held-order items and order-value waste', async () => {
  getOrderWastePreview.mockResolvedValue({
    ingredientCost: 0,
    orderValue: 287.5,
    items: [
      { index: 0, name: 'Burger', qty: 2, remainingQty: 2, ingredientCost: 0, orderValue: 230 },
      { index: 1, name: 'Drink', qty: 1, remainingQty: 1, ingredientCost: 0, orderValue: 57.5 },
    ],
  });
  const onChoose = vi.fn().mockResolvedValue(undefined);

  render(
    <CancelHeldDialog
      order={{ _id: 'held-1', totalAmount: 287.5, items: [{ qty: 2 }, { qty: 1 }] }}
      onKeep={vi.fn()}
      onChoose={onChoose}
    />,
  );

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Customer cancelled' } });
  fireEvent.click(screen.getByRole('button', { name: /already prepared/i }));

  expect(await screen.findByText('Waste valuation')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Order value.*PKR 287.50/i })).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(screen.getByRole('button', { name: 'Select items' }));
  const checkboxes = screen.getAllByRole('checkbox');
  fireEvent.click(checkboxes[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel Order' }));

  await waitFor(() => expect(onChoose).toHaveBeenCalledWith(
    true,
    'Customer cancelled',
    {
      selection: [{ index: 0, qty: 2 }],
      valuationMethod: 'orderValue',
    },
  ));
});

test('shows a private cashier reminder on a held-order card', () => {
  render(<HeldCashierNote note="Customer is waiting in the car" />);

  expect(screen.getByLabelText('Cashier note')).toHaveTextContent('Customer is waiting in the car');
  expect(screen.getByLabelText('Cashier note')).toHaveTextContent('Private');
});

test('disables not-started cancellation after the kitchen accepts an order', () => {
  render(
    <CancelHeldDialog
      order={{ _id: 'held-accepted', totalAmount: 100, items: [{ qty: 1 }] }}
      notStartedDisabled
      onKeep={vi.fn()}
      onChoose={vi.fn()}
    />,
  );

  expect(screen.getByRole('button', { name: /not started yet/i })).toBeDisabled();
  expect(screen.getByText(/unavailable because the kitchen has accepted/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /already prepared/i })).toBeEnabled();
});
